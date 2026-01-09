export interface Env {
  DB: D1Database;
}

type JsonValue = any;

function json(data: JsonValue, status = 200) {
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

async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function ensureSchema(db: D1Database) {
  // Safe to run on every request. Uses IF NOT EXISTS + idempotent indexes.
  await db.batch([
    db.prepare("PRAGMA foreign_keys = ON"),

    db.prepare(`CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )`),

    db.prepare(`CREATE TABLE IF NOT EXISTS material_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )`),

    db.prepare(`CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )`),

    // Products: vendor_id is optional; par is global and stored as REAL for 1 decimal.
    db.prepare(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      material_type_id INTEGER,
      vendor_id INTEGER,
      par REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (material_type_id) REFERENCES material_types(id) ON DELETE SET NULL,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
    )`),

    db.prepare(`CREATE TABLE IF NOT EXISTS on_hand (
      product_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      qty REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (product_id, location_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
    )`),

    db.prepare(`CREATE TABLE IF NOT EXISTS product_locations (
      product_id INTEGER NOT NULL,
      location_id INTEGER NOT NULL,
      PRIMARY KEY (product_id, location_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
    )`),

    db.prepare("CREATE INDEX IF NOT EXISTS idx_on_hand_location ON on_hand(location_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_on_hand_product ON on_hand(product_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_product_locations_location ON product_locations(location_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_product_locations_product ON product_locations(product_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON products(vendor_id)"),
  ]);

  // Backward-compat: if an older DB was created without vendor_id, add it.
  // Ignore errors if the column already exists.
  try {
    await db.prepare("ALTER TABLE products ADD COLUMN vendor_id INTEGER").run();
  } catch {
    // noop
  }
}

function round1(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function clampNonNeg(n: number) {
  return n < 0 ? 0 : n;
}

function ceilInt(n: number) {
  // Always round up to the next whole number
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(n);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      await ensureSchema(env.DB);

      const url = new URL(request.url);
      // /api/<resource>/<id?>
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("api");
      const resource = parts[idx + 1] || "";
      const idPart = parts[idx + 2] || "";
      const method = request.method.toUpperCase();

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
          const r = await env.DB.prepare("INSERT INTO locations (name) VALUES (?) RETURNING id, name").bind(name).first();
          return json(r);
        }
        if (method === "DELETE") {
          const id = Number(idPart);
          if (!id) return err("Location id required");
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
          const r = await env.DB
            .prepare("INSERT INTO material_types (name) VALUES (?) RETURNING id, name")
            .bind(name)
            .first();
          return json(r);
        }
        if (method === "DELETE") {
          const id = Number(idPart);
          if (!id) return err("Material type id required");
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
          const r = await env.DB.prepare("INSERT INTO vendors (name) VALUES (?) RETURNING id, name").bind(name).first();
          return json(r);
        }
        if (method === "DELETE") {
          const id = Number(idPart);
          if (!id) return err("Vendor id required");
          await env.DB.prepare("DELETE FROM vendors WHERE id = ?").bind(id).run();
          return json({ ok: true });
        }
        return err("Unsupported vendors operation", 405);
      }

      // -------------------
      // Products
      // -------------------
      if (resource === "products") {
        if (method === "GET") {
          const rs = await env.DB
            .prepare(
              `SELECT
                p.id,
                p.name,
                p.sku,
                p.material_type_id,
                mt.name AS material_type_name,
                p.vendor_id,
                v.name AS vendor_name,
                p.par
              FROM products p
              LEFT JOIN material_types mt ON mt.id = p.material_type_id
              LEFT JOIN vendors v ON v.id = p.vendor_id
              ORDER BY p.name`
            )
            .all();

          const products = (rs.results ?? []) as any[];

          if (!products.length) return json([]);

          const ids = products.map((p) => p.id);
          const inClause = ids.map(() => "?").join(",");
          const pl = await env.DB
            .prepare(
              `SELECT product_id, location_id
               FROM product_locations
               WHERE product_id IN (${inClause})`
            )
            .bind(...ids)
            .all();

          const locMap = new Map<number, number[]>();
          for (const r of (pl.results ?? []) as any[]) {
            const pid = Number(r.product_id);
            const lid = Number(r.location_id);
            if (!locMap.has(pid)) locMap.set(pid, []);
            locMap.get(pid)!.push(lid);
          }

          return json(
            products.map((p) => ({
              ...p,
              par: Number(p.par ?? 0),
              location_ids: (locMap.get(Number(p.id)) ?? []).sort((a, b) => a - b),
            }))
          );
        }

        if (method === "POST") {
          const body = await readJson<{
            name?: string;
            sku?: string;
            material_type_id?: number | null;
            vendor_id?: number | null;
            par?: number;
            location_ids?: number[];
          }>(request);

          const name = (body.name ?? "").trim();
          const sku = (body.sku ?? "").trim();
          const par = clampNonNeg(round1(Number(body.par ?? 0)));
          const mtId = body.material_type_id ?? null;
          const vendorId = body.vendor_id ?? null;
          const location_ids = (body.location_ids ?? []).map(Number).filter(Boolean);

          if (!name || !sku) return err("Product name and SKU are required");
          if (!location_ids.length) return err("Select at least one location for this product");

          const created = await env.DB
            .prepare("INSERT INTO products (name, sku, material_type_id, vendor_id, par) VALUES (?, ?, ?, ?, ?) RETURNING id, name, sku, material_type_id, vendor_id, par")
            .bind(name, sku, mtId, vendorId, par)
            .first();

          const pid = Number((created as any).id);
          await env.DB.batch(location_ids.map((lid) => env.DB.prepare("INSERT OR IGNORE INTO product_locations (product_id, location_id) VALUES (?, ?)").bind(pid, lid)));

          // return enriched
          return json({ ...(created as any), location_ids });
        }

        if (method === "PUT") {
          const id = Number(idPart);
          if (!id) return err("Product id required");
          const body = await readJson<{
            name?: string;
            sku?: string;
            material_type_id?: number | null;
            vendor_id?: number | null;
            par?: number;
            location_ids?: number[];
          }>(request);

          const name = (body.name ?? "").trim();
          const sku = (body.sku ?? "").trim();
          const par = clampNonNeg(round1(Number(body.par ?? 0)));
          const mtId = body.material_type_id ?? null;
          const vendorId = body.vendor_id ?? null;
          const location_ids = (body.location_ids ?? []).map(Number).filter(Boolean);

          if (!name || !sku) return err("Product name and SKU are required");
          if (!location_ids.length) return err("Select at least one location for this product");

          await env.DB
            .prepare("UPDATE products SET name = ?, sku = ?, material_type_id = ?, vendor_id = ?, par = ? WHERE id = ?")
            .bind(name, sku, mtId, vendorId, par, id)
            .run();

          // replace product locations
          await env.DB.prepare("DELETE FROM product_locations WHERE product_id = ?").bind(id).run();
          await env.DB.batch(location_ids.map((lid) => env.DB.prepare("INSERT OR IGNORE INTO product_locations (product_id, location_id) VALUES (?, ?)").bind(id, lid)));

          return json({ ok: true });
        }

        if (method === "DELETE") {
          // DELETE /products?all=1 for "clear all"
          if (url.searchParams.get("all") === "1") {
            // cascade deletes clear product_locations and on_hand because of FKs
            await env.DB.prepare("DELETE FROM products").run();
            return json({ ok: true });
          }
          const id = Number(idPart);
          if (!id) return err("Product id required");
          await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
          return json({ ok: true });
        }

        return err("Unsupported products operation", 405);
      }

      // -------------------
      // On hand
      // -------------------
      if (resource === "on-hand") {
        if (method === "GET") {
          const location_id = Number(url.searchParams.get("location_id") || "");
          if (!location_id) return err("location_id is required");
          const rs = await env.DB
            .prepare(
              `SELECT oh.product_id, oh.location_id, oh.qty
               FROM on_hand oh
               WHERE oh.location_id = ?
               ORDER BY oh.product_id`
            )
            .bind(location_id)
            .all();
          return json((rs.results ?? []).map((r: any) => ({ ...r, qty: Number(r.qty ?? 0) })));
        }

        if (method === "PUT") {
          const body = await readJson<{ product_id?: number; location_id?: number; qty?: number }>(request);
          const product_id = Number(body.product_id || "");
          const location_id = Number(body.location_id || "");
          const qty = clampNonNeg(round1(Number(body.qty ?? 0)));

          if (!product_id || !location_id) return err("product_id and location_id are required");

          // Enforce that product is assigned to location
          const pl = await env.DB
            .prepare("SELECT 1 FROM product_locations WHERE product_id = ? AND location_id = ?")
            .bind(product_id, location_id)
            .first();
          if (!pl) return err("Product is not assigned to this location");

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
          // Clear all on-hand
          await env.DB.prepare("DELETE FROM on_hand").run();
          return json({ ok: true });
        }

        return err("Unsupported on-hand operation", 405);
      }

      // -------------------
      // Import
      // -------------------
      if (resource === "import") {
        if (method !== "POST") return err("Unsupported import operation", 405);

        const body = await readJson<{ rows?: any[] }>(request);
        const rows = Array.isArray(body.rows) ? body.rows : [];
        if (!rows.length) return err("rows are required");

        // Gather unique strings
        const locNames = Array.from(
          new Set(
            rows
              .map((r) => String(r.location ?? "").trim())
              .filter(Boolean)
          )
        );
        const mtNames = Array.from(
          new Set(
            rows
              .map((r) => String(r.material_type ?? "").trim())
              .filter(Boolean)
          )
        );
        const vendorNames = Array.from(
          new Set(
            rows
              .map((r) => String(r.vendor ?? "").trim())
              .filter(Boolean)
          )
        );

        // Upsert locations/material types/vendors
        for (const n of locNames) {
          await env.DB.prepare("INSERT OR IGNORE INTO locations (name) VALUES (?)").bind(n).run();
        }
        for (const n of mtNames) {
          await env.DB.prepare("INSERT OR IGNORE INTO material_types (name) VALUES (?)").bind(n).run();
        }
        for (const n of vendorNames) {
          await env.DB.prepare("INSERT OR IGNORE INTO vendors (name) VALUES (?)").bind(n).run();
        }

        // Build name->id maps
        const locMap = new Map<string, number>();
        if (locNames.length) {
          const inClause = locNames.map(() => "?").join(",");
          const rs = await env.DB.prepare(`SELECT id, name FROM locations WHERE name IN (${inClause})`).bind(...locNames).all();
          for (const r of (rs.results ?? []) as any[]) locMap.set(String(r.name), Number(r.id));
        }

        const mtMap = new Map<string, number>();
        if (mtNames.length) {
          const inClause = mtNames.map(() => "?").join(",");
          const rs = await env.DB.prepare(`SELECT id, name FROM material_types WHERE name IN (${inClause})`).bind(...mtNames).all();
          for (const r of (rs.results ?? []) as any[]) mtMap.set(String(r.name), Number(r.id));
        }

        const vendorMap = new Map<string, number>();
        if (vendorNames.length) {
          const inClause = vendorNames.map(() => "?").join(",");
          const rs = await env.DB.prepare(`SELECT id, name FROM vendors WHERE name IN (${inClause})`).bind(...vendorNames).all();
          for (const r of (rs.results ?? []) as any[]) vendorMap.set(String(r.name), Number(r.id));
        }

        // Upsert products by SKU, then ensure product_locations, then on_hand if provided.
        let rows_imported = 0;
        let on_hand_upserts = 0;

        for (const r of rows) {
          const sku = String(r.sku ?? "").trim();
          const name = String(r.name ?? "").trim();
          if (!sku || !name) continue;

          const par = clampNonNeg(round1(Number(r.par ?? 0)));
          const mtName = String(r.material_type ?? "").trim();
          const mtId = mtName ? mtMap.get(mtName) ?? null : null;
          const vName = String(r.vendor ?? "").trim();
          const vendorId = vName ? vendorMap.get(vName) ?? null : null;

          // Upsert product
          const existing = await env.DB.prepare("SELECT id FROM products WHERE sku = ?").bind(sku).first();
          let pid: number;

          if (existing) {
            pid = Number((existing as any).id);
            await env.DB
              .prepare("UPDATE products SET name = ?, material_type_id = ?, vendor_id = ?, par = ? WHERE id = ?")
              .bind(name, mtId, vendorId, par, pid)
              .run();
          } else {
            const created = await env.DB
              .prepare("INSERT INTO products (name, sku, material_type_id, vendor_id, par) VALUES (?, ?, ?, ?, ?) RETURNING id")
              .bind(name, sku, mtId, vendorId, par)
              .first();
            pid = Number((created as any).id);
          }

          // Location assignment (required if location provided)
          const locName = String(r.location ?? "").trim();
          const locId = locName ? locMap.get(locName) : undefined;
          if (locId) {
            await env.DB.prepare("INSERT OR IGNORE INTO product_locations (product_id, location_id) VALUES (?, ?)").bind(pid, locId).run();
          }

          // On-hand (if provided)
          if (locId && r.on_hand !== undefined && r.on_hand !== null && String(r.on_hand).trim() !== "") {
            const qty = clampNonNeg(round1(Number(r.on_hand)));
            await env.DB
              .prepare(
                `INSERT INTO on_hand (product_id, location_id, qty, updated_at)
                 VALUES (?, ?, ?, datetime('now'))
                 ON CONFLICT(product_id, location_id)
                 DO UPDATE SET qty = excluded.qty, updated_at = datetime('now')`
              )
              .bind(pid, locId, qty)
              .run();
            on_hand_upserts++;
          }

          rows_imported++;
        }

        return json({
          ok: true,
          rows_received: rows.length,
          rows_imported,
          locations_seen: locNames.length,
          material_types_seen: mtNames.length,
          vendors_seen: vendorNames.length,
          on_hand_upserts,
        });
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
              v.id AS vendor_id,
              v.name AS vendor_name,
              mt.name AS material_type_name,
              p.par AS par,
              COALESCE(SUM(oh.qty), 0) AS total_on_hand
            FROM products p
            LEFT JOIN on_hand oh ON oh.product_id = p.id
            LEFT JOIN material_types mt ON mt.id = p.material_type_id
            LEFT JOIN vendors v ON v.id = p.vendor_id
            GROUP BY p.id
            ORDER BY p.name`
          )
          .all();

        const rows = ((rs.results ?? []) as any[])
          .map((r) => {
            const par = Number(r.par ?? 0);
            const total_on_hand = Number(r.total_on_hand ?? 0);
            const need = clampNonNeg(par - total_on_hand);
            const to_order = need > 0 ? ceilInt(need) : 0;
            return {
              product_id: Number(r.product_id),
              sku: String(r.sku ?? ""),
              name: String(r.name ?? ""),
              vendor_id: r.vendor_id === null || r.vendor_id === undefined ? null : Number(r.vendor_id),
              vendor_name: r.vendor_name ? String(r.vendor_name) : null,
              material_type_name: r.material_type_name ? String(r.material_type_name) : null,
              par,
              total_on_hand,
              to_order,
            };
          })
          .filter((r) => r.to_order > 0)
          .sort((a, b) => {
            const av = (a.vendor_name ?? "No Vendor").toLowerCase();
            const bv = (b.vendor_name ?? "No Vendor").toLowerCase();
            if (av !== bv) return av < bv ? -1 : 1;
            const am = (a.material_type_name ?? "Uncategorized").toLowerCase();
            const bm = (b.material_type_name ?? "Uncategorized").toLowerCase();
            if (am !== bm) return am < bm ? -1 : 1;
            if (b.to_order !== a.to_order) return b.to_order - a.to_order;
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
          });

        return json(rows);
      }

      return err("Not found", 404);
    } catch (e: any) {
      return err(e?.message || "Server error", 500);
    }
  },
};
