export const onRequest = async ({ request, env }: any) => {
  const url = new URL(request.url);
  const path = url.pathname.replace("/api", "");
  const method = request.method;

  // Utility
  const json = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });

  /* =======================
     PRODUCTS
  ======================= */
  if (path === "/products" && method === "GET") {
    const { results } = await env.DB
      .prepare(
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
      )
      .all();

    return json(results);
  }

  /* =======================
     LOCATIONS
  ======================= */
  if (path === "/locations" && method === "GET") {
    const { results } = await env.DB
      .prepare(`SELECT * FROM locations ORDER BY name`)
      .all();

    return json(results);
  }

  /* =======================
     ON-HAND (by location)
  ======================= */
  if (path.startsWith("/onhand/") && method === "GET") {
    const locationId = Number(path.split("/")[2]);

    const { results } = await env.DB
      .prepare(
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
    const body = await request.json();

    const stmt = env.DB.prepare(
      `
      INSERT INTO on_hand (product_id, location_id, qty)
      VALUES (?, ?, ?)
      ON CONFLICT(product_id, location_id)
      DO UPDATE SET qty = excluded.qty
      `
    );

    const batch = body.map((row: any) =>
      stmt.bind(row.product_id, row.location_id, Math.max(0, Math.floor(row.qty)))
    );

    await env.DB.batch(batch);
    return json({ ok: true });
  }

  /* =======================
     REORDER (GLOBAL PAR)
  ======================= */
  if (path === "/reorder" && method === "GET") {
    const { results } = await env.DB
      .prepare(
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
      )
      .all();

    return json(results);
  }

  return json({ error: "Not found" }, 404);
};
