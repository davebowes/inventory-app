type Env = {
  DB: D1Database;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

function round1(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

async function ensureSchema(db: D1Database) {
  // Safe to run on every request; it won't create new tables repeatedly.
  await db.batch([
    db.prepare("PRAGMA foreign_keys = ON"),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS material_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sku TEXT NOT NULL UNIQUE,
        material_type_id INTEGER,
        par REAL NOT NULL DEFAULT 0,
        FOREIGN KEY (material_type_id) REFERENCES material_types(id) ON DELETE SET NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS on_hand (
        product_id INTEGER NOT NULL,
        location_id INTEGER NOT NULL,
        qty REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (product_id, location_id),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
      )`
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_on_hand_location ON on_hand(location_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_on_hand_product ON on_hand(product_id)"),
  ]);
}

async function readJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function pathParts(url: URL) {
  // /api/<...> is already routed here. We parse the remainder.
  const p = url.pathname.replace(/^\/api\/?/, "");
  return p.split("/").filter(Boolean);
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  try {
    if (!env.DB) return err("Missing D1 binding: DB", 500);
    await ensureSchema(env.DB);

    const parts = pathParts(url);
    const resource = parts[0] ?? "";

    // Health
    if (resource === "" || resource === "health") {
      return json({ ok: true });
    }

    // -------------------
    // Locations
    // -------------------
    if (resource === "locations") {
      if (method === "GET") {
        const rs = await env.DB.prepare("SELECT id, name FROM locations ORDER BY name").all();
        return json(rs.results ?? []);
      }
      if (method === "POST") {
        const body = await readJson<{ name?: string }>(request);
        const name = (body.name ?? "").trim();
        if (!name) return err("Location name is required");
        try {
          const r = await env.DB.prepare("INSERT INTO locations (name) VALUES (?) RETURNING id, name").bind(name).first();
          return json(r);
        } catch (e: any) {
          return err(e?.message?.includes("UNIQUE") ? "That location already exists." : "Failed to create location", 400);
        }
      }
      if (method === "DELETE" && parts[1]) {
        const id = Number(parts[1]);
        if (!Number.isFinite(id)) return err("Invalid location id");
        await env.DB.prepare("DELETE FROM locations WHERE id = ?").bind(id).run();
        return json({ ok: true });
      }
      return err("Unsupported locations operation", 405);
    }

    // -------------------
    // Material Types
    // -------------------
    if (resource === "material-types") {
      if (method === "GET") {
        const rs = await env.DB.prepare("SELECT id, name FROM material_types ORDER BY name").all();
        return json(rs.results ?? []);
      }
      if (method === "POST") {
        const body = await readJson<{ name?: string }>(request);
        const name = (body.name ?? "").trim();
        if (!name) return err("Material type name is required");
        try {
          const r = await env.DB.prepare("INSERT INTO material_types (name) VALUES (?) RETURNING id, name").bind(name).first();
          return json(r);
        } catch (e: any) {
          return err(e?.message?.includes("UNIQUE") ? "That material type already exists." : "Failed to create material type", 400);
        }
      }
      if (method === "DELETE" && parts[1]) {
        const id = Number(parts[1]);
        if (!Number.isFinite(id)) return err("Invalid material type id");
        // Products referencing it will be set to NULL due to FK ON DELETE SET NULL
        await env.DB.prepare("DELETE FROM material_types WHERE id = ?").bind(id).run();
        return json({ ok: true });
      }
      return err("Unsupported material-types operation", 405);
    }

    // -------------------
    // Products
    // -------------------
    if (resource === "products") {
      if (method === "GET") {
        const rs = await env.DB
          .prepare(
            `SELECT p.id, p.name, p.sku, p.material_type_id, mt.name AS material_type_name, p.par
             FROM products p
             LEFT JOIN material_types mt ON mt.id = p.material_type_id
             ORDER BY p.name`
          )
          .all();
        return json(rs.results ?? []);
      }

      if (method === "POST") {
        const body = await readJson<{ name?: string; sku?: string; material_type_id?: number | null; par?: number }>(request);
        const name = (body.name ?? "").trim();
        const sku = (body.sku ?? "").trim();
        const material_type_id = body.material_type_id ?? null;
        const par = Math.max(0, round1(Number(body.par ?? 0)));

        if (!name) return err("Product name is required");
        if (!sku) return err("Product SKU is required");

        try {
          const r = await env.DB
            .prepare(
              "INSERT INTO products (name, sku, material_type_id, par) VALUES (?, ?, ?, ?) RETURNING id, name, sku, material_type_id, par"
            )
            .bind(name, sku, material_type_id, par)
            .first();
          return json(r);
        } catch (e: any) {
          if (String(e?.message || "").includes("UNIQUE") && String(e?.message || "").includes("sku")) return err("That SKU already exists.");
          return err("Failed to create product");
        }
      }

      if ((method === "PUT" || method === "PATCH") && parts[1]) {
        const id = Number(parts[1]);
        if (!Number.isFinite(id)) return err("Invalid product id");

        const body = await readJson<{ name?: string; sku?: string; material_type_id?: number | null; par?: number }>(request);
        const name = (body.name ?? "").trim();
        const sku = (body.sku ?? "").trim();
        const material_type_id = body.material_type_id ?? null;
        const par = Math.max(0, round1(Number(body.par ?? 0)));

        if (!name) return err("Product name is required");
        if (!sku) return err("Product SKU is required");

        try {
          const r = await env.DB
            .prepare(
              "UPDATE products SET name = ?, sku = ?, material_type_id = ?, par = ? WHERE id = ? RETURNING id, name, sku, material_type_id, par"
            )
            .bind(name, sku, material_type_id, par, id)
            .first();
          return json(r);
        } catch (e: any) {
          if (String(e?.message || "").includes("UNIQUE") && String(e?.message || "").includes("sku")) return err("That SKU already exists.");
          return err("Failed to update product");
        }
      }

      if (method === "DELETE" && parts[1]) {
        const id = Number(parts[1]);
        if (!Number.isFinite(id)) return err("Invalid product id");
        // on_hand rows are deleted via FK ON DELETE CASCADE
        await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
        return json({ ok: true });
      }

      return err("Unsupported products operation", 405);
    }

    // -------------------
    // On Hand
    // -------------------
    if (resource === "on-hand") {
      if (method === "GET") {
        const location_id = Number(url.searchParams.get("location_id") || "");
        if (!Number.isFinite(location_id)) return err("location_id is required", 400);

        const rs = await env.DB
          .prepare("SELECT product_id, location_id, qty FROM on_hand WHERE location_id = ?")
          .bind(location_id)
          .all();
        return json(rs.results ?? []);
      }

      if (method === "PUT") {
        const body = await readJson<{ product_id?: number; location_id?: number; qty?: number }>(request);
        const product_id = Number(body.product_id);
        const location_id = Number(body.location_id);
        const qty = Math.max(0, round1(Number(body.qty ?? 0)));

        if (!Number.isFinite(product_id) || !Number.isFinite(location_id)) return err("product_id and location_id are required");

        await env.DB
          .prepare(
            `INSERT INTO on_hand (product_id, location_id, qty, updated_at)
             VALUES (?, ?, ?, datetime('now'))
             ON CONFLICT(product_id, location_id)
             DO UPDATE SET qty = excluded.qty, updated_at = datetime('now')`
          )
          .bind(product_id, location_id, qty)
          .run();

        return json({ ok: true });
      }

      return err("Unsupported on-hand operation", 405);
    }

    // -------------------
    // Reorder
    // -------------------
    if (resource === "reorder") {
      if (method !== "GET") return err("Unsupported reorder operation", 405);

      const rs = await env.DB
        .prepare(
          `SELECT
            p.id AS product_id,
            p.sku,
            p.name,
            mt.name AS material_type_name,
            p.par,
            COALESCE(SUM(oh.qty), 0) AS total_on_hand
          FROM products p
          LEFT JOIN material_types mt ON mt.id = p.material_type_id
          LEFT JOIN on_hand oh ON oh.product_id = p.id
          GROUP BY p.id
          ORDER BY p.name`
        )
        .all();

      const rows = (rs.results ?? []).map((r: any) => {
        const par = Math.max(0, round1(Number(r.par ?? 0)));
        const total_on_hand = Math.max(0, round1(Number(r.total_on_hand ?? 0)));
        const to_order = Math.max(0, round1(par - total_on_hand));
        return {
          product_id: Number(r.product_id),
          sku: String(r.sku ?? ""),
          name: String(r.name ?? ""),
          material_type_name: r.material_type_name ?? null,
          par,
          total_on_hand,
          to_order,
        };
      });

      return json(rows);
    }

    return err("Not found", 404);
  } catch (e: any) {
    return err(e?.message || "Server error", 500);
  }
};
