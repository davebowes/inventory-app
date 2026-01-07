/* =======================
   LOCATIONS CRUD
======================= */
if (path === "/locations" && method === "POST") {
  const body = await request.json();
  const name = String(body?.name ?? "").trim();
  if (!name) return json({ error: "Name required" }, 400);

  await env.DB.prepare(`INSERT INTO locations (name) VALUES (?)`).bind(name).run();
  return json({ ok: true });
}

if (path.startsWith("/locations/") && method === "PUT") {
  const id = Number(path.split("/")[2]);
  const body = await request.json();
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
   PRODUCTS CRUD
   (Global PAR + optional SKU)
======================= */
if (path === "/products" && method === "POST") {
  const body = await request.json();
  const name = String(body?.name ?? "").trim();
  const material_type = String(body?.material_type ?? "").trim();
  const sku = body?.sku == null ? null : String(body.sku).trim();
  const par_qty = Math.max(0, Math.floor(Number(body?.par_qty ?? 0)));

  if (!name) return json({ error: "Product name required" }, 400);
  if (!material_type) return json({ error: "Material type required" }, 400);

  await env.DB
    .prepare(`INSERT INTO products (name, material_type, sku, par_qty) VALUES (?, ?, ?, ?)`)
    .bind(name, material_type, sku || null, par_qty)
    .run();

  return json({ ok: true });
}

if (path.startsWith("/products/") && method === "PUT") {
  const id = Number(path.split("/")[2]);
  const body = await request.json();
  const name = String(body?.name ?? "").trim();
  const material_type = String(body?.material_type ?? "").trim();
  const sku = body?.sku == null ? null : String(body.sku).trim();
  const par_qty = Math.max(0, Math.floor(Number(body?.par_qty ?? 0)));

  if (!id) return json({ error: "Invalid" }, 400);
  if (!name) return json({ error: "Product name required" }, 400);
  if (!material_type) return json({ error: "Material type required" }, 400);

  await env.DB
    .prepare(`UPDATE products SET name=?, material_type=?, sku=?, par_qty=? WHERE id=?`)
    .bind(name, material_type, sku || null, par_qty, id)
    .run();

  return json({ ok: true });
}

if (path.startsWith("/products/") && method === "DELETE") {
  const id = Number(path.split("/")[2]);
  if (!id) return json({ error: "Invalid" }, 400);

  await env.DB.prepare(`DELETE FROM products WHERE id=?`).bind(id).run();
  return json({ ok: true });
}

/* =======================
   PRODUCT ↔ LOCATION ASSIGNMENT
   (multi-select locations per product)
======================= */
if (path.startsWith("/products/") && path.endsWith("/locations") && method === "GET") {
  const productId = Number(path.split("/")[2]);
  if (!productId) return json({ error: "Invalid" }, 400);

  const { results } = await env.DB
    .prepare(
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

if (path.startsWith("/products/") && path.endsWith("/locations") && method === "PUT") {
  const productId = Number(path.split("/")[2]);
  const body = await request.json();
  const locationIds: number[] = Array.isArray(body?.locationIds)
    ? body.locationIds.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x))
    : [];

  if (!productId) return json({ error: "Invalid" }, 400);

  // replace mapping
  await env.DB.prepare(`DELETE FROM product_locations WHERE product_id=?`).bind(productId).run();

  if (locationIds.length) {
    const stmt = env.DB.prepare(
      `INSERT INTO product_locations (product_id, location_id) VALUES (?, ?)`
    );
    await env.DB.batch(locationIds.map((lid) => stmt.bind(productId, lid)));
  }

  return json({ ok: true });
}
