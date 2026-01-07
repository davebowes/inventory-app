import { Hono } from "hono";

type Bindings = {
  DB: D1Database;
  SENDGRID_API_KEY?: string;
  DEFAULT_FROM_NAME?: string;
  DEFAULT_FROM_EMAIL?: string;
  SUBJECT_PREFIX?: string;
};

type Env = { Bindings: Bindings };

const app = new Hono<Env>();

function splitEmails(s: string): string[] {
  return (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function toTenths(n: number): number {
  return Math.round(n * 10);
}

function calcOrderQtyUnits(parTenths: number, onHandTenths: number): number {
  const neededTenths = parTenths - onHandTenths;
  if (neededTenths <= 0) return 0;
  return Math.ceil(neededTenths / 10);
}

async function getSettings(env: Bindings) {
  const r = await env.DB.prepare("SELECT default_to_emails, default_cc_emails, from_name, from_email, subject_prefix FROM settings WHERE id=1").first();
  return {
    default_to_emails: (r?.default_to_emails as string) ?? "",
    default_cc_emails: (r?.default_cc_emails as string) ?? "",
    from_name: (r?.from_name as string) ?? (env.DEFAULT_FROM_NAME ?? "Inventory"),
    from_email: (r?.from_email as string) ?? (env.DEFAULT_FROM_EMAIL ?? ""),
    subject_prefix: (r?.subject_prefix as string) ?? (env.SUBJECT_PREFIX ?? "Inventory Order"),
  };
}

async function buildReorder(env: Bindings) {
  // Join PAR vs on_hand; if no on_hand row exists, treat as 0.
  const rows = await env.DB.prepare(`
    SELECT
      mt.name as materialType,
      p.name as product,
      s.sku_code as sku,
      s.par_qty_tenths as parTenths,
      COALESCE(oh.on_hand_qty_tenths, 0) as onHandTenths
    FROM par_levels pl
    JOIN skus s ON s.id = pl.sku_id
    JOIN products p ON p.id = s.product_id
    JOIN material_types mt ON mt.id = p.material_type_id
    LEFT JOIN on_hand oh ON oh.sku_id = pl.sku_id AND oh.location_id = pl.location_id
    WHERE p.is_active = 1 AND s.is_active = 1
  `).all();

  const byType = new Map<string, { product: string; sku: string | null; qty: number }[]>();

  for (const r of rows.results as any[]) {
    const qty = calcOrderQtyUnits(Number(r.parTenths), Number(r.onHandTenths));
    if (qty <= 0) continue; // exclude 0 orders (your rule)
    const k = String(r.materialType);
    if (!byType.has(k)) byType.set(k, []);
    byType.get(k)!.push({ product: String(r.product), sku: r.sku ? String(r.sku) : null, qty });
  }

  const sections = Array.from(byType.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([materialType, lines]) => ({
      materialType,
      lines: lines.sort((a, b) => a.product.localeCompare(b.product)),
    }));

  return { sections };
}

function renderText(dateStr: string, sections: { materialType: string; lines: { product: string; sku: string | null; qty: number }[] }[]) {
  const out: string[] = [];
  out.push(`Inventory Order – ${dateStr}`);
  out.push("");
  for (const s of sections) {
    out.push(s.materialType.toUpperCase());
    for (const l of s.lines) {
      out.push(`- ${l.product}${l.sku ? ` (${l.sku})` : ""} — ${l.qty}`);
    }
    out.push("");
  }
  return out.join("\n").trim() + "\n";
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderHtml(dateStr: string, sections: { materialType: string; lines: { product: string; sku: string | null; qty: number }[] }[]) {
  const blocks = sections.map((s) => {
    const rows = s.lines
      .map((l) => {
        return `
          <tr>
            <td style="font-size:13px;padding:8px 4px;border-bottom:1px solid #f2f2f2;">${esc(l.product)}</td>
            <td style="font-size:13px;padding:8px 4px;border-bottom:1px solid #f2f2f2;">${l.sku ? esc(l.sku) : ""}</td>
            <td align="right" style="font-size:13px;padding:8px 4px;border-bottom:1px solid #f2f2f2;font-weight:700;">${l.qty}</td>
          </tr>
        `;
      })
      .join("");

    return `
      <div style="margin-top:18px;">
        <div style="font-size:14px;font-weight:700;padding:10px 12px;background:#f2f2f2;border-radius:8px;">
          ${esc(s.materialType)}
        </div>
        <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:10px;">
          <thead>
            <tr>
              <th align="left" style="font-size:12px;color:#666;padding:6px 4px;border-bottom:1px solid #eee;">Product</th>
              <th align="left" style="font-size:12px;color:#666;padding:6px 4px;border-bottom:1px solid #eee;">SKU</th>
              <th align="right" style="font-size:12px;color:#666;padding:6px 4px;border-bottom:1px solid #eee;">Order</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:720px;margin:0 auto;padding:16px;">
      <div style="background:#ffffff;border:1px solid #e6e6e6;border-radius:10px;padding:18px;">
        <div style="font-size:18px;font-weight:700;margin-bottom:6px;">Inventory Order</div>
        <div style="font-size:12px;color:#666;margin-bottom:16px;">${esc(dateStr)}</div>
        ${blocks}
        <div style="margin-top:18px;font-size:11px;color:#777;">
          Only items with a non-zero order quantity are included.
        </div>
      </div>
    </div>
  </body>
</html>`;
}

app.get("/api/search", async (c) => {
  const q = (c.req.query("query") ?? "").trim();
  if (!q) return c.json([]);
  const like = `%${q}%`;
  const r = await c.env.DB
    .prepare(`
      SELECT s.id as sku_id, p.name as product, s.sku_code as sku
      FROM skus s
      JOIN products p ON p.id = s.product_id
      WHERE p.is_active=1 AND s.is_active=1 AND (p.name LIKE ? OR s.sku_code LIKE ?)
      ORDER BY p.name
      LIMIT 25
    `)
    .bind(like, like)
    .all();
  return c.json(r.results);
});

app.post("/api/onhand", async (c) => {
  const body = await c.req.json<{ locationId: number; skuId: number; onHand: number }>();
  const onHandTenths = toTenths(body.onHand);

  await c.env.DB.prepare(`
    INSERT INTO on_hand (sku_id, location_id, on_hand_qty_tenths, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(sku_id, location_id)
    DO UPDATE SET on_hand_qty_tenths=excluded.on_hand_qty_tenths, updated_at=datetime('now')
  `).bind(body.skuId, body.locationId, onHandTenths).run();

  return c.json({ ok: true });
});

// Items for a single location (used for counting). Includes global PAR and on-hand for that location.
app.get("/api/location-items", async (c) => {
  const locationId = Number(c.req.query("locationId"));
  if (!locationId) return c.json({ ok: false, message: "locationId is required" }, 400);

  const r = await c.env.DB.prepare(`
    SELECT
      s.id as sku_id,
      p.name as product,
      s.sku_code as sku,
      COALESCE(s.par_qty_tenths, 0) as par_tenths,
      COALESCE(SUM(oh.qty_tenths), 0) as on_hand_tenths
    FROM skus s
    JOIN products p ON p.id = s.product_id
    LEFT JOIN on_hand oh ON oh.sku_id = s.id
    WHERE p.is_active = 1 AND s.is_active = 1
    ORDER BY p.name
  `).bind(locationId).all();

  return c.json(r.results);
});

app.post("/api/onhand/bulk", async (c) => {
  const body = await c.req.json<{ locationId: number; items: { skuId: number; onHand: number }[] }>();
  const locationId = Number(body.locationId);
  if (!locationId) return c.json({ ok: false, message: "locationId required" }, 400);

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return c.json({ ok: false, message: "No items provided" }, 400);

  const stmt = c.env.DB.prepare(`
    INSERT INTO on_hand (sku_id, location_id, on_hand_qty_tenths, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(sku_id, location_id)
    DO UPDATE SET on_hand_qty_tenths=excluded.on_hand_qty_tenths, updated_at=datetime('now')
  `);

  // Use a D1 batch for speed
  const batch = items.map((it) => {
    const skuId = Number(it.skuId);
    const onHandTenths = toTenths(Number(it.onHand));
    return stmt.bind(skuId, locationId, onHandTenths);
  });

  await c.env.DB.batch(batch);
  return c.json({ ok: true, message: `Saved ${items.length} items.` });
});

app.get("/api/reorder", async (c) => {
  const data = await buildReorder(c.env);
  return c.json(data);
});

app.get("/api/settings", async (c) => {
  const s = await getSettings(c.env);
  return c.json(s);
});

app.put("/api/settings", async (c) => {
  const body = await c.req.json<{
    default_to_emails: string;
    default_cc_emails: string;
    from_name: string;
    from_email: string;
    subject_prefix: string;
  }>();

  await c.env.DB.prepare(`
    UPDATE settings
    SET default_to_emails=?,
        default_cc_emails=?,
        from_name=?,
        from_email=?,
        subject_prefix=?
    WHERE id=1
  `).bind(body.default_to_emails, body.default_cc_emails, body.from_name, body.from_email, body.subject_prefix).run();

  return c.json({ ok: true });
});


app.put("/api/skus/:id/par", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ par: string | number }>();
  if (!id) return c.json({ ok: false, message: "Invalid" }, 400);
  const parNum = Number(body.par);
  if (Number.isNaN(parNum) || parNum < 0) return c.json({ ok: false, message: "PAR must be a number >= 0" }, 400);
  const parTenths = toTenths(parNum);
  await c.env.DB.prepare("UPDATE skus SET par_qty_tenths=? WHERE id=?").bind(parTenths, id).run();
  return c.json({ ok: true });
});

// ----- Admin / Settings CRUD -----

app.get("/api/material-types", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, name FROM material_types ORDER BY name").all();
  return c.json(r.results);
});

app.post("/api/material-types", async (c) => {
  const body = await c.req.json<{ name: string }>();
  const name = (body.name ?? "").trim();
  if (!name) return c.json({ ok: false, message: "Name required" }, 400);
  await c.env.DB.prepare("INSERT INTO material_types (name) VALUES (?)").bind(name).run();
  return c.json({ ok: true });
});

app.put("/api/material-types/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ name: string }>();
  const name = (body.name ?? "").trim();
  if (!id || !name) return c.json({ ok: false, message: "Invalid" }, 400);
  await c.env.DB.prepare("UPDATE material_types SET name=? WHERE id=?").bind(name, id).run();
  return c.json({ ok: true });
});

app.delete("/api/material-types/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ ok: false, message: "Invalid" }, 400);
  // Prevent delete if used
  const used = await c.env.DB.prepare("SELECT COUNT(*) as c FROM products WHERE material_type_id=?").bind(id).first();
  if (Number((used as any)?.c ?? 0) > 0) return c.json({ ok: false, message: "Cannot delete: in use by products" }, 400);
  await c.env.DB.prepare("DELETE FROM material_types WHERE id=?").bind(id).run();
  return c.json({ ok: true });
});

app.get("/api/locations", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, name FROM locations ORDER BY name").all();
  return c.json(r.results);
});

app.post("/api/locations", async (c) => {
  const body = await c.req.json<{ name: string }>();
  const name = (body.name ?? "").trim();
  if (!name) return c.json({ ok: false, message: "Name required" }, 400);
  await c.env.DB.prepare("INSERT INTO locations (name) VALUES (?)").bind(name).run();
  return c.json({ ok: true });
});

app.put("/api/locations/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ name: string }>();
  const name = (body.name ?? "").trim();
  if (!id || !name) return c.json({ ok: false, message: "Invalid" }, 400);
  await c.env.DB.prepare("UPDATE locations SET name=? WHERE id=?").bind(name, id).run();
  return c.json({ ok: true });
});

app.delete("/api/locations/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ ok: false, message: "Invalid" }, 400);
  // Prevent delete if used by par or on_hand
  const used1 = await c.env.DB.prepare("SELECT COUNT(*) as c FROM par_levels WHERE location_id=?").bind(id).first();
  const used2 = await c.env.DB.prepare("SELECT COUNT(*) as c FROM on_hand WHERE location_id=?").bind(id).first();
  if (Number((used1 as any)?.c ?? 0) > 0 || Number((used2 as any)?.c ?? 0) > 0) {
    return c.json({ ok: false, message: "Cannot delete: location has PAR or On-Hand rows" }, 400);
  }
  await c.env.DB.prepare("DELETE FROM locations WHERE id=?").bind(id).run();
  return c.json({ ok: true });
});

app.get("/api/products", async (c) => {
  const q = (c.req.query("query") ?? "").trim();
  const like = `%${q}%`;
  const stmt = q
    ? c.env.DB.prepare(`
        SELECT p.id, p.name, mt.id as material_type_id, mt.name as material_type, s.id as sku_id, s.sku_code
        FROM products p
        JOIN material_types mt ON mt.id=p.material_type_id
        LEFT JOIN skus s ON s.product_id=p.id
        WHERE p.is_active=1 AND (p.name LIKE ? OR s.sku_code LIKE ?)
        ORDER BY p.name
        LIMIT 200
      `).bind(like, like)
    : c.env.DB.prepare(`
        SELECT p.id, p.name, mt.id as material_type_id, mt.name as material_type, s.id as sku_id, s.sku_code
        FROM products p
        JOIN material_types mt ON mt.id=p.material_type_id
        LEFT JOIN skus s ON s.product_id=p.id
        WHERE p.is_active=1
        ORDER BY p.name
        LIMIT 200
      `);
  const r = await stmt.all();
  return c.json(r.results);
});

app.post("/api/products", async (c) => {
  const body = await c.req.json<{ name: string; material_type_id: number; sku_code?: string | null }>();
  const name = (body.name ?? "").trim();
  const mt = Number(body.material_type_id);
  const sku = (body.sku_code ?? "").toString().trim() || null;
  if (!name || !mt) return c.json({ ok: false, message: "Name + material type required" }, 400);

  const p = await c.env.DB.prepare("INSERT INTO products (name, material_type_id, is_active) VALUES (?, ?, 1)").bind(name, mt).run();
  const pid = Number(p.meta.last_row_id);

  await c.env.DB.prepare("INSERT INTO skus (product_id, sku_code, unit_name, is_active) VALUES (?, ?, NULL, 1)")
    .bind(pid, sku).run();

  return c.json({ ok: true, productId: pid });
});

app.put("/api/products/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ name: string; material_type_id: number; sku_code?: string | null }>();
  const name = (body.name ?? "").trim();
  const mt = Number(body.material_type_id);
  const sku = (body.sku_code ?? "").toString().trim() || null;
  if (!id || !name || !mt) return c.json({ ok: false, message: "Invalid" }, 400);

  await c.env.DB.prepare("UPDATE products SET name=?, material_type_id=? WHERE id=?").bind(name, mt, id).run();
  // Update the first SKU row (this MVP keeps one sku row per product)
  const s = await c.env.DB.prepare("SELECT id FROM skus WHERE product_id=? ORDER BY id LIMIT 1").bind(id).first();
  if (s?.id) {
    await c.env.DB.prepare("UPDATE skus SET sku_code=? WHERE id=?").bind(sku, Number((s as any).id)).run();
  } else {
    await c.env.DB.prepare("INSERT INTO skus (product_id, sku_code, unit_name, is_active) VALUES (?, ?, NULL, 1)")
      .bind(id, sku).run();
  }

  return c.json({ ok: true });
});

app.delete("/api/products/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) return c.json({ ok: false, message: "Invalid" }, 400);
  // soft delete
  await c.env.DB.prepare("UPDATE products SET is_active=0 WHERE id=?").bind(id).run();
  return c.json({ ok: true });
});

app.post("/api/par/bulk", async (c) => {
  const body = await c.req.json<{ locationId: number; items: { skuId: number; par: number }[] }>();
  const locationId = Number(body.locationId);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!locationId) return c.json({ ok: false, message: "locationId required" }, 400);
  if (items.length === 0) return c.json({ ok: false, message: "No items provided" }, 400);

  const stmt = c.env.DB.prepare(`
    INSERT INTO par_levels (sku_id, location_id, par_qty_tenths)
    VALUES (?, ?, ?)
    ON CONFLICT(sku_id, location_id)
    DO UPDATE SET par_qty_tenths=excluded.par_qty_tenths
  `);

  const batch = items.map((it) => {
    const skuId = Number(it.skuId);
    const parTenths = toTenths(Number(it.par));
    return stmt.bind(skuId, locationId, parTenths);
  });

  await c.env.DB.batch(batch);
  return c.json({ ok: true, message: `Saved PAR for ${items.length} items.` });
});

app.post("/api/orders/send", async (c) => {
  const { additionalEmails } = await c.req.json<{ additionalEmails?: string[] }>();
  const extra = (additionalEmails ?? []).map((e) => String(e).trim()).filter(Boolean);

  const settings = await getSettings(c.env);
  const to = splitEmails(settings.default_to_emails);
  const cc = splitEmails(settings.default_cc_emails);
  const allTo = to;
  const allCc = [...cc, ...extra];

  if (allTo.length === 0) {
    return c.json({ ok: false, message: "No default TO emails set in Settings." }, 400);
  }

  const reorder = await buildReorder(c.env);
  if (reorder.sections.length === 0) {
    return c.json({ ok: false, message: "Nothing to order." }, 400);
  }

  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
  const subject = `${settings.subject_prefix} – ${dateStr}`;
  const text = renderText(dateStr, reorder.sections);
  const html = renderHtml(dateStr, reorder.sections);

  // Save order run + lines for audit
  const run = await c.env.DB.prepare(`
    INSERT INTO order_runs (to_emails, cc_emails, additional_emails, status, snapshot_json)
    VALUES (?, ?, ?, 'draft', ?)
  `).bind(allTo.join(", "), cc.join(", "), extra.join(", "), JSON.stringify(reorder)).run();

  const orderRunId = Number(run.meta.last_row_id);

  for (const sec of reorder.sections) {
    const mt = await c.env.DB.prepare("SELECT id FROM material_types WHERE name=?").bind(sec.materialType).first();
    const mtId = Number((mt as any)?.id ?? 0);
    for (const l of sec.lines) {
      await c.env.DB.prepare(`
        INSERT INTO order_lines (order_run_id, material_type_id, product_name, sku_code, order_qty_units)
        VALUES (?, ?, ?, ?, ?)
      `).bind(orderRunId, mtId, l.product, l.sku, l.qty).run();
    }
  }

  // Send email via SendGrid (recommended)
  if (!c.env.SENDGRID_API_KEY) {
    await c.env.DB.prepare("UPDATE order_runs SET status='failed' WHERE id=?").bind(orderRunId).run();
    return c.json({ ok: false, message: "Missing SENDGRID_API_KEY. Add it in Cloudflare Pages/Workers env vars." }, 500);
  }

  const fromEmail = settings.from_email || c.env.DEFAULT_FROM_EMAIL || "";
  if (!fromEmail) {
    await c.env.DB.prepare("UPDATE order_runs SET status='failed' WHERE id=?").bind(orderRunId).run();
    return c.json({ ok: false, message: "Missing From email. Set from_email in Settings (or DEFAULT_FROM_EMAIL)." }, 500);
  }

  const payload = {
    personalizations: [{ to: allTo.map((e) => ({ email: e })), cc: allCc.map((e) => ({ email: e })) }],
    from: { email: fromEmail, name: settings.from_name || c.env.DEFAULT_FROM_NAME || "Inventory" },
    subject,
    content: [
      { type: "text/plain", value: text },
      { type: "text/html", value: html }
    ]
  };

  const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${c.env.SENDGRID_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!sgRes.ok) {
    await c.env.DB.prepare("UPDATE order_runs SET status='failed' WHERE id=?").bind(orderRunId).run();
    const err = await sgRes.text();
    return c.json({ ok: false, message: `SendGrid error: ${err}` }, 500);
  }

  await c.env.DB.prepare("UPDATE order_runs SET status='sent' WHERE id=?").bind(orderRunId).run();
  return c.json({ ok: true, message: `Sent to ${allTo.join(", ")}${allCc.length ? " (cc: " + allCc.join(", ") + ")" : ""}` });
});

export const onRequest = (ctx: any) => app.fetch(ctx.request, ctx.env, ctx);
