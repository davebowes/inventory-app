type Env = { DB: D1Database };

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  const url = new URL(request.url);
  const path = url.pathname.replace("/api", "");
  const method = request.method.toUpperCase();

  const json = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });

  // Helper: safe JSON body
  const readJson = async () => {
    try {
      return await request.json();
    } catch {
      return null;
    }
  };

  /* =======================
     PRODUCTS (GET)
     includes total_on_hand
  ======================= */
  if (path === "/products" && method === "GET") {
    const { results } = await env.DB.prepare(
      `
      SELECT
        p.id,
        p.name,
        p.material_type,
        p.sku,
        p.par_qty,
        IFNULL(SUM(oh.qty), 0) AS total_on_hand
      FROM products p
      LEFT JOIN on_hand oh ON oh.product_id = p.id
      GROUP BY p.id
      ORDER BY p.name
      `
    ).all();

    return json(results);
  }

  /* =======================
     PRODUCTS (CRUD)
  ======================= */
  if (path === "/products" && method === "POST") {
    const body = await readJson();
    const name = String(body?.name ?? "").trim();
    const material_type = String(body?.material_type ?? "").trim();
    const skuRaw = body?.sku;
    const sku = skuRaw == null ? null : String(skuRaw).trim();
    const par_qty = Math.max(0, Math.floor(Number(body?.par_qty ?? 0)));

    if (!name) return json({ error: "Product name required" }, 400);
    if (!material_type) return json({ error: "Material type required" }, 400);

    await env.DB.prepare(
      `INSERT INTO products (name, material_type, sku, par_qty) VALUES (?, ?, ?, ?)`
    )
      .bind(name, material_type, sku || null, par_qty)
      .run();

    return json({ ok: true });
  }

  if (path.startsWith("/products/") && method === "PUT" && !path.endsWith("/locations")) {
    const id = Number(path.split("/")[2]);
    const body = await readJson();
    const name = String(body?.name ?? "").trim();
    const material_type = String(body?.material_type ?? "").trim();
    const skuRaw = body?.sku;
    const sku = skuRaw == null ? null : String(skuRaw).trim();
    const par_qty = Math.max(0, Math.floor(Number(body?.par_qty ?? 0)));

    if (!id) return json({ error: "Invalid id" }, 400);
    if (!name) return json({ error: "Product name required" }, 400);
    if (!material_type) return json({ error: "Material type required" }, 400);

    await env.DB.prepare(
      `UPDATE products SET name=?, material_type=?, sku=?, par_qty=? WHERE id=?`
    )
      .bind(name, material_type, sku || null, par_qty, id)
      .run();

    return json({ ok: true });
  }

  if (path.startsWith("/products/") && method === "DELETE" && !path.endsWith("/locations")) {
    const id = Number(path.split("/")[2]);
    if (!id) return json({ error: "Invalid id" }, 400);

    await env.DB.prepare(`DELETE FROM products WHERE id=?`).bind(id).run();
    return json({ ok: true });
  }

  /* =======================
     LOCATIONS (GET)
  ======================= */
  if (path === "/locations" && method === "GET") {
    const { results } = await env.DB.prepare(`SELECT * FROM locations ORDER BY name`).all();
    return json(results);
  }

  /* =======================
     LOCATIONS (CRUD)
  ======================= */
  if (path === "/locations" && method === "POST") {
    const body = await readJson();
    const name = String(body?.name ?? "").trim();
    if (!name) return json({ error: "Name required" }, 400);

    await env.DB.prepare(`INSERT INTO locations (name) VALUES (?)`).bind(name).run();
    return json({ ok: true });
  }

  if (path.startsWith("/locations/") && method === "PUT") {
    const id = Number(path.split("/")[2]);
    const body = await readJson();
    const name = String(body?.name ?? "").trim();
    if (!id || !name) return json({ error: "Invalid" }, 400);

    await env.DB.prepare(`UPDATE locations SET name=? WHERE id=?`).bind(name, id).run();
    return json({ ok: true });
  }

  if (path.startsWith("/locations/") && method === "DELETE") {
    const id = Number(path.split("/")[2]);
    if (!id) return json({ error: "Invalid" }, 400);

    await env.DB.prepare(`DELETE FROM locations WHERE id=?`).bind(id).run();
    return json({ ok: true });
  }

  /* =======================
     PRODUCT ↔ LOCATION ASSIGNMENT
     GET/PUT /products/:id/locations
  ======================= */
  if (path.match(/^\/products\/\d+\/locations$/) && method === "GET") {
    const productId = Number(path.split("/")[2]);
    if (!productId) return json({ error: "Invalid" }, 400);

    const { results } = await env.DB.prepare(
      `
      SELECT l.id, l.name
      FROM product_locations pl
      JOIN locations l ON l.id = pl.location_id
      WHERE pl.product_id = ?
      ORDER BY l.name
      `
    )
      .bind(productId)
      .all();

    return json(results);
  }

  if (path.match(/^\/products\/\d+\/locations$/) && method === "PUT") {
    const productId = Number(path.split("/")[2]);
    const body = await readJson();
    const locationIds: number[] = Array.isArray(body?.locationIds)
      ? body.locationIds.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x))
      : [];

    if (!productId) return json({ error: "Invalid" }, 400);

    // Replace mapping
    await env.DB.prepare(`DELETE FROM product_locations WHERE product_id=?`)
      .bind(productId)
      .run();

    if (locationIds.length) {
      const stmt = env.DB.prepare(
        `INSERT INTO product_locations (product_id, location_id) VALUES (?, ?)`
      );
      await env.DB.batch(locationIds.map((lid) => stmt.bind(productId, lid)));
    }

    return json({ ok: true });
  }

  /* =======================
     ON-HAND (by location)
     GET /onhand/:locationId
     POST /onhand  [{product_id, location_id, qty}]
  ======================= */
  if (path.startsWith("/onhand/") && method === "GET") {
    const locationId = Number(path.split("/")[2]);

    const { results } = await env.DB.prepare(
      `
      SELECT
        p.id AS product_id,
        p.name,
        p.material_type,
        IFNULL(oh.qty, 0) AS qty
      FROM product_locations pl
      JOIN products p ON p.id = pl.product_id
      LEFT JOIN on_hand oh
        ON oh.product_id = p.id
        AND oh.location_id = ?
      WHERE pl.location_id = ?
      ORDER BY p.name
      `
    )
      .bind(locationId, locationId)
      .all();

    return json(results);
  }

  if (path === "/onhand" && method === "POST") {
    const body = await readJson();
    if (!Array.isArray(body)) return json({ error: "Expected array" }, 400);

    const stmt = env.DB.prepare(
      `
      INSERT INTO on_hand (product_id, location_id, qty)
      VALUES (?, ?, ?)
      ON CONFLICT(product_id, location_id)
      DO UPDATE SET qty = excluded.qty
      `
    );

    const batch = body.map((row: any) =>
      stmt.bind(
        Number(row.product_id),
        Number(row.location_id),
        Math.max(0, Math.floor(Number(row.qty ?? 0)))
      )
    );

    await env.DB.batch(batch);
    return json({ ok: true });
  }

  /* =======================
     REORDER
     Global PAR vs total on-hand across all locations
     Only returns items with order_qty > 0
  ======================= */
  if (path === "/reorder" && method === "GET") {
    const { results } = await env.DB.prepare(
      `
      SELECT
        p.id,
        p.name,
        p.material_type,
        p.sku,
        p.par_qty,
        IFNULL(SUM(oh.qty), 0) AS total_on_hand,
        MAX(p.par_qty - IFNULL(SUM(oh.qty), 0), 0) AS order_qty
      FROM products p
      LEFT JOIN on_hand oh ON oh.product_id = p.id
      GROUP BY p.id
      HAVING order_qty > 0
      ORDER BY p.material_type, p.name
      `
    ).all();

    return json(results);
  }

  return json({ error: "Not found" }, 404);
};
