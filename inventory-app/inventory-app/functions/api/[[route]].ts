type Env = { DB: D1Database };

function j(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function bad(msg: string, status = 400) {
  return j({ error: msg }, status);
}

function toNum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env, params } = ctx;

  if (request.method === "OPTIONS") return j({ ok: true });

  if (!env?.DB) return bad("D1 binding 'DB' is missing in Pages settings.", 500);

  const route = (params?.route as string) || "";
  const method = request.method.toUpperCase();

  try {
    // ---------------------------
    // LOCATIONS
    // ---------------------------
    if (route === "locations" && method === "GET") {
      const { results } = await env.DB.prepare(`SELECT id, name FROM locations ORDER BY name`).all();
      return j(results);
    }

    if (route === "locations" && method === "POST") {
      const body = await request.json().catch(() => null) as any;
      const name = String(body?.name ?? "").trim();
      if (!name) return bad("Name required");
      await env.DB.prepare(`INSERT INTO locations (name) VALUES (?)`).bind(name).run();
      return j({ ok: true });
    }

    if (route.startsWith("locations/")) {
      const id = toNum(route.split("/")[1], 0);
      if (!id) return bad("Invalid location id");

      if (method === "PUT") {
        const body = await request.json().catch(() => null) as any;
        const name = String(body?.name ?? "").trim();
        if (!name) return bad("Name required");
        await env.DB.prepare(`UPDATE locations SET name=? WHERE id=?`).bind(name, id).run();
        return j({ ok: true });
      }

      if (method === "DELETE") {
        await env.DB.prepare(`DELETE FROM locations WHERE id=?`).bind(id).run();
        return j({ ok: true });
      }
    }

    // ---------------------------
    // MATERIAL TYPES
    // ---------------------------
    if (route === "material-types" && method === "GET") {
      const { results } = await env.DB.prepare(`SELECT id, name FROM material_types ORDER BY name`).all();
      return j(results);
    }

    if (route === "material-types" && method === "POST") {
      const body = await request.json().catch(() => null) as any;
      const name = String(body?.name ?? "").trim();
      if (!name) return bad("Name required");
      await env.DB.prepare(`INSERT INTO material_types (name) VALUES (?)`).bind(name).run();
      return j({ ok: true });
    }

    if (route.startsWith("material-types/")) {
      const id = toNum(route.split("/")[1], 0);
      if (!id) return bad("Invalid material type id");

      if (method === "DELETE") {
        await env.DB.prepare(`DELETE FROM material_types WHERE id=?`).bind(id).run();
        return j({ ok: true });
      }
    }

    // ---------------------------
    // PRODUCTS
    // ---------------------------
    if (route === "products" && method === "GET") {
      const { results } = await env.DB.prepare(`
        SELECT
          p.id,
          p.name,
          p.sku,
          p.material_type_id,
          mt.name as material_type,
          p.par_qty,
          COALESCE(SUM(oh.qty), 0) AS total_on_hand
        FROM products p
        JOIN material_types mt ON mt.id = p.material_type_id
        LEFT JOIN on_hands oh ON oh.product_id = p.id
        GROUP BY p.id
        ORDER BY p.name
      `).all();
      return j(results);
    }

    if (route === "products" && method === "POST") {
      const body = await request.json().catch(() => null) as any;
      const name = String(body?.name ?? "").trim();
      const sku = body?.sku === null ? null : String(body?.sku ?? "").trim() || null;
      const material_type_id = toNum(body?.material_type_id, 0);
      const par_qty = round1(Math.max(0, toNum(body?.par_qty, 0)));
      if (!name) return bad("Product name required");
      if (!material_type_id) return bad("Material type required");

      await env.DB.prepare(`
        INSERT INTO products (name, sku, material_type_id, par_qty)
        VALUES (?, ?, ?, ?)
      `).bind(name, sku, material_type_id, par_qty).run();

      return j({ ok: true });
    }

    if (route.startsWith("products/")) {
      const parts = route.split("/");
      const id = toNum(parts[1], 0);
      if (!id) return bad("Invalid product id");

      // /products/:id/locations
      if (parts.length === 3 && parts[2] === "locations") {
        if (method === "GET") {
          const { results } = await env.DB.prepare(`
            SELECT l.id, l.name
            FROM locations l
            JOIN product_locations pl ON pl.location_id = l.id
            WHERE pl.product_id = ?
            ORDER BY l.name
          `).bind(id).all();
          return j(results);
        }

        if (method === "PUT") {
          const body = await request.json().catch(() => null) as any;
          const locationIds = Array.isArray(body?.locationIds) ? body.locationIds.map((x: any) => toNum(x, 0)).filter((x: number) => x) : [];
          // reset
          await env.DB.prepare(`DELETE FROM product_locations WHERE product_id=?`).bind(id).run();
          if (locationIds.length) {
            const stmt = env.DB.prepare(`INSERT INTO product_locations (product_id, location_id) VALUES (?, ?)`);
            await env.DB.batch(locationIds.map((lid: number) => stmt.bind(id, lid)));
          }
          return j({ ok: true });
        }
      }

      if (method === "PUT") {
        const body = await request.json().catch(() => null) as any;
        const name = String(body?.name ?? "").trim();
        const sku = body?.sku === null ? null : String(body?.sku ?? "").trim() || null;
        const material_type_id = toNum(body?.material_type_id, 0);
        const par_qty = round1(Math.max(0, toNum(body?.par_qty, 0)));
        if (!name) return bad("Product name required");
        if (!material_type_id) return bad("Material type required");

        await env.DB.prepare(`
          UPDATE products
          SET name=?, sku=?, material_type_id=?, par_qty=?
          WHERE id=?
        `).bind(name, sku, material_type_id, par_qty, id).run();

        return j({ ok: true });
      }

      if (method === "DELETE") {
        await env.DB.prepare(`DELETE FROM products WHERE id=?`).bind(id).run();
        return j({ ok: true });
      }
    }

    // ---------------------------
    // INVENTORY (per location entry screen)
    // GET /inventory?location_id=#
    // PUT /inventory { location_id, items:[{product_id, qty}] }
    // ---------------------------
    if (route === "inventory" && method === "GET") {
      const url = new URL(request.url);
      const location_id = toNum(url.searchParams.get("location_id"), 0);
      if (!location_id) return bad("location_id required");

      // Only products assigned to this location
      const { results } = await env.DB.prepare(`
        SELECT
          p.id as product_id,
          p.name,
          p.sku,
          mt.name as material_type,
          p.par_qty as par_qty,
          COALESCE(oh.qty, 0) AS on_hand_qty
        FROM products p
        JOIN material_types mt ON mt.id = p.material_type_id
        JOIN product_locations pl ON pl.product_id = p.id AND pl.location_id = ?
        LEFT JOIN on_hands oh ON oh.product_id = p.id AND oh.location_id = ?
        ORDER BY mt.name, p.name
      `).bind(location_id, location_id).all();

      return j(results);
    }

    if (route === "inventory" && method === "PUT") {
      const body = await request.json().catch(() => null) as any;
      const location_id = toNum(body?.location_id, 0);
      const items = Array.isArray(body?.items) ? body.items : [];
      if (!location_id) return bad("location_id required");

      const stmt = env.DB.prepare(`
        INSERT INTO on_hands (product_id, location_id, qty, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(product_id, location_id)
        DO UPDATE SET qty=excluded.qty, updated_at=datetime('now')
      `);

      const batch: D1PreparedStatement[] = [];
      for (const it of items) {
        const product_id = toNum(it?.product_id, 0);
        if (!product_id) continue;
        const qty = round1(Math.max(0, toNum(it?.qty, 0)));
        batch.push(stmt.bind(product_id, location_id, qty));
      }

      if (!batch.length) return bad("No valid items");

      await env.DB.batch(batch);
      return j({ ok: true, saved: batch.length });
    }

    return bad("Not found", 404);
  } catch (err: any) {
    return j({ error: err?.message || String(err) }, 500);
  }
};
