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
      `CREATE TABLE IF NOT EXISTS vendors (
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
        vendor_id INTEGER,
        FOREIGN KEY (material_type_id) REFERENCES material_types(id) ON DELETE SET NULL,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
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
    db.prepare(
      `CREATE TABLE IF NOT EXISTS product_locations (
        product_id INTEGER NOT NULL,
        location_id INTEGER NOT NULL,
        PRIMARY KEY (product_id, location_id),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
      )`
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_on_hand_location ON on_hand(location_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_on_hand_product ON on_hand(product_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_product_locations_location ON product_locations(location_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_product_locations_product ON product_locations(product_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_products_vendor ON products(vendor_id)"),
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
    // Vendors
    // -------------------
    if (resource === "vendors") {
      if (method === "GET") {
        const rs = await env.DB.prepare("SELECT id, name FROM vendors ORDER BY name").all();
        return json(rs.results ?? []);
      }
      if (method === "POST") {
        const body = await readJson<{ name?: string }>(request);
        const name = (body.name ?? "").trim();
        if (!name) return err("Vendor name is required");
        try {
          const r = await env.DB.prepare("INSERT INTO vendors (name) VALUES (?) RETURNING id, name").bind(name).first();
          return json(r);
        } catch (e: any) {
          return err(e?.message?.includes("UNIQUE") ? "That vendor already exists." : "Failed to create vendor", 400);
        }
      }
      if (method === "DELETE") {
        const id = Number(parts[1] ?? "");
        if (!Number.isFinite(id) || id <= 0) return err("Invalid vendor id");
        // Products referencing it will be set to NULL due to FK ON DELETE SET NULL
        await env.DB.prepare("DELETE FROM vendors WHERE id = ?").bind(id).run();
        return json({ ok: true });
      }
      return err("Unsupported vendors operation", 405);
    }


    
    // -------------------
    // Import (CSV/JSON)
    // -------------------
    // POST /api/import
    // Body: { rows: Array<{ location?: string; material_type?: string; sku: string; name: string; par?: number|string; on_hand?: number|string }> }
    if (resource === "import") {
      if (method !== "POST") return err("Method not allowed", 405);

      type ImportRow = {
        location?: string;
        material_type?: string;
        sku?: string;
        name?: string;
        par?: number | string;
        on_hand?: number | string;
      };

      const body = await readJson<{ rows?: ImportRow[] }>(request);
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (rows.length === 0) return err("rows[] is required");

      // Normalize + validate
      const normRows = rows
        .map((r) => ({
          location: (r.location ?? "").trim(),
          material_type: (r.material_type ?? "").trim(),
          vendor: (r.vendor ?? "").trim(),
          sku: (r.sku ?? "").trim(),
          name: (r.name ?? "").trim(),
          par: r.par,
          on_hand: r.on_hand,
        }))
        .filter((r) => r.sku && r.name);

      if (normRows.length === 0) return err("No valid rows found. Each row needs sku + name.");

      const toNum1 = (v: unknown) => {
        if (v === null || v === undefined || v === "") return 0;
        const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
        if (!Number.isFinite(n)) return 0;
        return Math.round(n * 10) / 10;
      };

      const locNames = Array.from(new Set(normRows.map((r) => r.location).filter(Boolean)));
      const mtNames = Array.from(new Set(normRows.map((r) => r.material_type).filter(Boolean)));
      const vendorNames = Array.from(new Set(normRows.map((r) => r.vendor).filter(Boolean)));

      // If import rows don't specify locations, ensure at least one default location exists
      // so products can still be assigned to a location.
      if (locNames.length === 0) {
        const existing = await env.DB.prepare("SELECT id, name FROM locations ORDER BY id LIMIT 1").first<any>();
        if (!existing) {
          await env.DB.prepare("INSERT INTO locations (name) VALUES (?)").bind("Main").run();
          locNames.push("Main");
        } else {
          locNames.push(String(existing.name));
        }
      }

      // Upsert reference tables
      if (locNames.length) {
        await env.DB.batch(locNames.map((n) => env.DB.prepare("INSERT OR IGNORE INTO locations (name) VALUES (?)").bind(n)));
      }
      if (mtNames.length) {
        await env.DB.batch(mtNames.map((n) => env.DB.prepare("INSERT OR IGNORE INTO material_types (name) VALUES (?)").bind(n)));
      }
      if (vendorNames.length) {
        await env.DB.batch(vendorNames.map((n) => env.DB.prepare("INSERT OR IGNORE INTO vendors (name) VALUES (?)").bind(n)));
      }

      // Build name->id maps
      const locMap: Record<string, number> = {};
      if (locNames.length) {
        const rs = await env.DB.prepare("SELECT id, name FROM locations WHERE name IN (" + locNames.map(() => "?").join(",") + ")").bind(...locNames).all();
        for (const row of (rs.results ?? []) as any[]) locMap[String(row.name)] = Number(row.id);
      }
      const mtMap: Record<string, number> = {};
      if (mtNames.length) {
        const rs = await env.DB.prepare("SELECT id, name FROM material_types WHERE name IN (" + mtNames.map(() => "?").join(",") + ")").bind(...mtNames).all();
        for (const row of (rs.results ?? []) as any[]) mtMap[String(row.name)] = Number(row.id);
      }


      const vendorMap: Record<string, number> = {};
      if (vendorNames.length) {
        const rs = await env.DB.prepare("SELECT id, name FROM vendors WHERE name IN (" + vendorNames.map(() => "?").join(",") + ")").bind(...vendorNames).all();
        for (const row of (rs.results ?? []) as any[]) vendorMap[String(row.name)] = Number(row.id);
      }

      // Upsert products by sku
      const productStmts = normRows.map((r) => {
        const mtId = r.material_type ? mtMap[r.material_type] ?? null : null;
        const vendorId = r.vendor ? vendorMap[r.vendor] ?? null : null;
        const par = toNum1(r.par);
        return env.DB.prepare(
          `INSERT INTO products (name, sku, material_type_id, vendor_id, par)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(sku) DO UPDATE SET
             name=excluded.name,
             material_type_id=excluded.material_type_id,
             vendor_id=excluded.vendor_id,
             par=excluded.par`
        ).bind(r.name, r.sku, mtId, vendorId, par);
      });
      await env.DB.batch(productStmts);

      // Resolve product ids by sku (for location assignments and on_hand)
      const allSkus = Array.from(new Set(normRows.map((r) => r.sku)));
      const skuToId: Record<string, number> = {};
      {
        const rs = await env.DB
          .prepare("SELECT id, sku FROM products WHERE sku IN (" + allSkus.map(() => "?").join(",") + ")")
          .bind(...allSkus)
          .all();
        for (const row of (rs.results ?? []) as any[]) skuToId[String(row.sku)] = Number(row.id);
      }

      // Assign products to locations based on import rows.
      // If a product has no explicit location in any row, assign it to the first location in locNames.
      const productToLocIds = new Map<number, Set<number>>();
      const defaultLocId = locMap[locNames[0]];
      for (const r of normRows) {
        const pid = skuToId[r.sku];
        if (!pid) continue;
        const lid = r.location ? locMap[r.location] : defaultLocId;
        if (!lid) continue;
        if (!productToLocIds.has(pid)) productToLocIds.set(pid, new Set());
        productToLocIds.get(pid)!.add(lid);
      }

      const plStmts: D1PreparedStatement[] = [];
      for (const [pid, lids] of productToLocIds.entries()) {
        for (const lid of lids) {
          plStmts.push(env.DB.prepare("INSERT OR IGNORE INTO product_locations (product_id, location_id) VALUES (?, ?)").bind(pid, lid));
        }
      }
      if (plStmts.length) await env.DB.batch(plStmts);

      // If on_hand quantities are present, upsert on_hand for provided location
      const ohRows = normRows.filter((r) => r.location && r.on_hand !== undefined && r.on_hand !== null && r.on_hand !== "");
      let onHandUpserts = 0;
      if (ohRows.length) {
        const stmts = [];
        for (const r of ohRows) {
          const pid = skuToId[r.sku];
          const lid = locMap[r.location!];
          if (!pid || !lid) continue;
          const qty = toNum1(r.on_hand);
          stmts.push(
            env.DB.prepare(
              `INSERT INTO on_hand (product_id, location_id, qty)
               VALUES (?, ?, ?)
               ON CONFLICT(product_id, location_id) DO UPDATE SET qty=excluded.qty`
            ).bind(pid, lid, qty)
          );
        }
        if (stmts.length) {
          await env.DB.batch(stmts);
          onHandUpserts = stmts.length;
        }
      }

      return json({
        ok: true,
        rows_received: rows.length,
        rows_imported: normRows.length,
        locations_seen: locNames.length,
        material_types_seen: mtNames.length,
        vendors_seen: vendorNames.length,
        on_hand_upserts: onHandUpserts,
      });
    }

// -------------------
    // Products
    // -------------------
    if (resource === "products") {
      if (method === "GET") {
        const [prods, pls] = await Promise.all([
          env.DB
            .prepare(
              `SELECT p.id, p.name, p.sku, p.material_type_id, mt.name AS material_type_name, p.vendor_id, v.name AS vendor_name, p.par
               FROM products p
               LEFT JOIN material_types mt ON mt.id = p.material_type_id
               LEFT JOIN vendors v ON v.id = p.vendor_id
               ORDER BY p.name`
            )
            .all(),
          env.DB.prepare("SELECT product_id, location_id FROM product_locations").all(),
        ]);

        const map = new Map<number, number[]>();
        for (const r of (pls.results ?? []) as any[]) {
          const pid = Number(r.product_id);
          const lid = Number(r.location_id);
          if (!Number.isFinite(pid) || !Number.isFinite(lid)) continue;
          if (!map.has(pid)) map.set(pid, []);
          map.get(pid)!.push(lid);
        }

        const out = (prods.results ?? []).map((p: any) => ({
          ...p,
          location_ids: map.get(Number(p.id)) ?? [],
        }));
        return json(out);
      }

      if (method === "POST") {
        const body = await readJson<{ name?: string; sku?: string; material_type_id?: number | null; par?: number; location_ids?: number[] }>(request);
        const name = (body.name ?? "").trim();
        const sku = (body.sku ?? "").trim();
        const material_type_id = body.material_type_id ?? null;
        const vendor_id = body.vendor_id ?? null;
        const par = Math.max(0, round1(Number(body.par ?? 0)));
        const location_ids = Array.isArray(body.location_ids) ? body.location_ids.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : [];

        if (!name) return err("Product name is required");
        if (!sku) return err("Product SKU is required");
        if (location_ids.length === 0) return err("Select at least one location for this product");

        try {
          const created = await env.DB
            .prepare(
              "INSERT INTO products (name, sku, material_type_id, par) VALUES (?, ?, ?, ?) RETURNING id, name, sku, material_type_id, par"
            )
            .bind(name, sku, material_type_id, vendor_id, par)
            .first<any>();

          const pid = Number(created?.id);
          if (!Number.isFinite(pid)) return err("Failed to create product", 500);

          await env.DB.batch(
            location_ids.map((lid) =>
              env.DB.prepare("INSERT OR IGNORE INTO product_locations (product_id, location_id) VALUES (?, ?)").bind(pid, lid)
            )
          );

          return json({ ...created, location_ids });
        } catch (e: any) {
          if (String(e?.message || "").includes("UNIQUE") && String(e?.message || "").includes("sku")) return err("That SKU already exists.");
          return err("Failed to create product");
        }
      }

      if ((method === "PUT" || method === "PATCH") && parts[1]) {
        const id = Number(parts[1]);
        if (!Number.isFinite(id)) return err("Invalid product id");

        const body = await readJson<{ name?: string; sku?: string; material_type_id?: number | null; par?: number; location_ids?: number[] }>(request);
        const name = (body.name ?? "").trim();
        const sku = (body.sku ?? "").trim();
        const material_type_id = body.material_type_id ?? null;
        const vendor_id = body.vendor_id ?? null;
        const par = Math.max(0, round1(Number(body.par ?? 0)));
        const location_ids = Array.isArray(body.location_ids) ? body.location_ids.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : [];

        if (!name) return err("Product name is required");
        if (!sku) return err("Product SKU is required");
        if (location_ids.length === 0) return err("Select at least one location for this product");

        try {
          const r = await env.DB
            .prepare(
              "UPDATE products SET name = ?, sku = ?, material_type_id = ?, par = ? WHERE id = ? RETURNING id, name, sku, material_type_id, par"
            )
            .bind(name, sku, material_type_id, vendor_id, par, id)
            .first<any>();

          await env.DB.batch([
            env.DB.prepare("DELETE FROM product_locations WHERE product_id = ?").bind(id),
            ...location_ids.map((lid) =>
              env.DB.prepare("INSERT OR IGNORE INTO product_locations (product_id, location_id) VALUES (?, ?)").bind(id, lid)
            ),
          ]);

          return json({ ...r, location_ids });
        } catch (e: any) {
          if (String(e?.message || "").includes("UNIQUE") && String(e?.message || "").includes("sku")) return err("That SKU already exists.");
          return err("Failed to update product");
        }
      }

      // Delete a single product
      if (method === "DELETE" && parts[1]) {
        const id = Number(parts[1]);
        if (!Number.isFinite(id)) return err("Invalid product id");
        // on_hand rows are deleted via FK ON DELETE CASCADE
        await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
        return json({ ok: true });
      }

      // Clear ALL products (and cascaded on_hand / product_locations)
      if (method === "DELETE" && !parts[1]) {
        const all = url.searchParams.get("all");
        if (all !== "1") return err("To clear all products, call DELETE /api/products?all=1", 400);
        await env.DB.prepare("DELETE FROM products").run();
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

        // Ensure the product is assigned to the location.
        const assigned = await env.DB
          .prepare("SELECT 1 FROM product_locations WHERE product_id = ? AND location_id = ? LIMIT 1")
          .bind(product_id, location_id)
          .first();
        if (!assigned) return err("This product is not assigned to the selected location", 400);

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

      if (method === "DELETE") {
        // Clear on-hand rows (all locations by default, or a single location via ?location_id=)
        const locParam = url.searchParams.get("location_id");
        if (locParam) {
          const location_id = Number(locParam);
          if (!Number.isFinite(location_id)) return err("Invalid location_id", 400);
          await env.DB.prepare("DELETE FROM on_hand WHERE location_id = ?").bind(location_id).run();
        } else {
          await env.DB.prepare("DELETE FROM on_hand").run();
        }
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
               LEFT JOIN vendors v ON v.id = p.vendor_id
          LEFT JOIN on_hand oh ON oh.product_id = p.id
          GROUP BY p.id
          ORDER BY p.name`
        )
        .all();

      const rowsAll = (rs.results ?? []).map((r: any) => {
        const par = Math.max(0, round1(Number(r.par ?? 0)));
        const total_on_hand = Math.max(0, round1(Number(r.total_on_hand ?? 0)));
        const raw = Math.max(0, par - total_on_hand);
        // We cannot order partials; round up to the next whole unit.
        const to_order = raw > 0 ? Math.ceil(raw - 1e-9) : 0;
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

      // Only show items that need ordering.
      const rows = rowsAll.filter((r) => r.to_order > 0);
      rows.sort((a, b) => {
        const am = (a.material_type_name ?? "").toLowerCase();
        const bm = (b.material_type_name ?? "").toLowerCase();
        if (am !== bm) return am < bm ? -1 : 1;
        // within each material type, order by largest to_order then name
        if (b.to_order !== a.to_order) return b.to_order - a.to_order;
        return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
      });

      return json(rows);
    }

    return err("Not found", 404);
  } catch (e: any) {
    return err(e?.message || "Server error", 500);
  }
};