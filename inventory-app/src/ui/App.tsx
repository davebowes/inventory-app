import React, { useEffect, useMemo, useState } from "react";

type Location = { id: number; name: string };
type MaterialSection = { materialType: string; lines: { product: string; sku: string | null; qty: number }[] };
type Settings = { default_to_emails: string; default_cc_emails: string; from_name: string; from_email: string; subject_prefix: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #e6e6e6", borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<"onhand" | "reorder" | "settings">("onhand");

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <style>{`/* UI_STYLES */
        :root { --fs-red:#E31837; --fs-dark:#111827; --fs-bg:#f7f7f7; --fs-card:#ffffff; }
        h1 { font-size: 28px; }
        button { padding: 10px 12px; border-radius: 10px; border: 1px solid #d9d9d9; background: var(--fs-card); cursor: pointer; }
        button:hover { background: #f6f6f6; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        input, select { padding: 10px 12px; border-radius: 10px; border: 1px solid #d9d9d9; }
        table th { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
      `}</style>
      <h1 style={{ margin: "6px 0 14px" }}>Inventory App</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setTab("onhand")}>On‑Hand</button>
        <button onClick={() => setTab("reorder")}>Reorder</button>
        <button onClick={() => setTab("settings")}>Settings</button>
      </div>

      {tab === "onhand" && <OnHand />}
      {tab === "reorder" && <Reorder />}
      {tab === "settings" && <SettingsView />}
      <div style={{ marginTop: 24, fontSize: 12, color: "#666" }}>
        Tip: PAR + On‑hand are stored to 0.1, but order quantities are whole units (rounded up).
      </div>
    </div>
  );
}

function OnHand() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);

  const [rows, setRows] = useState<{ sku_id: number; product: string; sku: string | null; par_tenths: number; on_hand_tenths: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const [filter, setFilter] = useState("");

  useEffect(() => {
    api<Location[]>("/api/locations").then((d) => {
      setLocations(d);
      setLocationId(d[0]?.id ?? null);
    });
  }, []);

  async function loadItems(locId: number) {
    setLoading(true);
    setMsg("");
    try {
      const data = await api<typeof rows>(`/api/location-items?locationId=${encodeURIComponent(String(locId))}`);
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (locationId) loadItems(locationId);
  }, [locationId]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.product.toLowerCase().includes(q) || (r.sku ? r.sku.toLowerCase().includes(q) : false)
    );
  }, [rows, filter]);

  function tenthsToStr(t: number) {
    return (t / 10).toFixed(1);
  }

  function updateOnHand(sku_id: number, valueStr: string) {
    const v = Number(valueStr);
    if (Number.isNaN(v)) return;
    const tenths = Math.round(v * 10);
    setRows(prev => prev.map(r => r.sku_id === sku_id ? { ...r, on_hand_tenths: tenths } : r));
  }

  async function saveAll() {
    setMsg("");
    if (!locationId) { setMsg("Pick a location."); return; }
    setLoading(true);
    try {
      const payload = {
        locationId,
        items: rows.map(r => ({ skuId: r.sku_id, onHand: Number(tenthsToStr(r.on_hand_tenths)) }))
      };
      const resp = await api<{ ok: boolean; message: string }>("/api/onhand/bulk", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setMsg(resp.message || "Saved.");
      await loadItems(locationId);
    } catch (e: any) {
      setMsg(e?.message || "Error saving.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section title="On‑Hand Entry (by location)">
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", alignItems: "center" }}>
        <label>
          Location<br />
          <select
            value={locationId ?? ""}
            onChange={(e) => setLocationId(Number(e.target.value))}
            style={{ width: "100%" }}
          >
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>

        <label>
          Filter (optional)<br />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Type product or SKU to filter…"
            style={{ width: "100%" }}
          />
        </label>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => locationId && loadItems(locationId)} disabled={!locationId || loading}>Refresh</button>
        <button onClick={saveAll} disabled={!locationId || loading || rows.length === 0}>Save All On‑Hands</button>
      </div>

      {msg && <div style={{ marginTop: 10 }}>{msg}</div>}
      {loading && <div style={{ marginTop: 10 }}>Loading…</div>}

      {!loading && rows.length === 0 ? (
        <div style={{ marginTop: 12 }}>
          No items found for this location yet. (This usually means the database seed hasn’t been loaded.)
        </div>
      ) : (
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left" style={{ borderBottom: "1px solid #eee", padding: "8px 6px" }}>Product</th>
                <th align="left" style={{ borderBottom: "1px solid #eee", padding: "8px 6px" }}>SKU</th>
                <th align="right" style={{ borderBottom: "1px solid #eee", padding: "8px 6px" }}>On‑hand</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.sku_id}>
                  <td style={{ borderBottom: "1px solid #f3f3f3", padding: "8px 6px" }}>{r.product}</td>
                  <td style={{ borderBottom: "1px solid #f3f3f3", padding: "8px 6px" }}>{r.sku ?? ""}</td>
                  <td style={{ borderBottom: "1px solid #f3f3f3", padding: "6px 6px" }} align="right">
                    <input
                      value={tenthsToStr(r.on_hand_tenths)}
                      onChange={(e) => updateOnHand(r.sku_id, e.target.value)}
                      style={{ width: 90, textAlign: "right" }}
                      inputMode="decimal"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function Reorder() {
  const [sections, setSections] = useState<MaterialSection[]>([]);
  const [additionalEmails, setAdditionalEmails] = useState("");
  const [status, setStatus] = useState("");

  async function refresh() {
    setStatus("");
    const data = await api<{ sections: MaterialSection[] }>("/api/reorder");
    setSections(data.sections);
  }

  useEffect(() => { refresh(); }, []);

  async function send() {
    setStatus("");
    const extra = additionalEmails.split(",").map(s => s.trim()).filter(Boolean);
    const resp = await api<{ ok: boolean; message: string }>("/api/orders/send", {
      method: "POST",
      body: JSON.stringify({ additionalEmails: extra })
    });
    setStatus(resp.message);
  }

  return (
    <Section title="Reorder (grouped by material type)">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={refresh}>Refresh</button>
      </div>

      {sections.length === 0 ? (
        <div style={{ marginTop: 12 }}>No items currently need ordering 🎉</div>
      ) : (
        <div style={{ marginTop: 12 }}>
          {sections.map((s) => (
            <div key={s.materialType} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>{s.materialType}</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {s.lines.map((l, idx) => (
                  <li key={idx}>{l.product}{l.sku ? ` (${l.sku})` : ""} — <b>{l.qty}</b></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Send Order Email</div>
        <label style={{ display: "block" }}>
          Additional emails (optional, comma-separated)<br />
          <input value={additionalEmails} onChange={(e) => setAdditionalEmails(e.target.value)} placeholder="extra@company.com, another@company.com" style={{ width: "100%" }} />
        </label>
        <button onClick={send} style={{ marginTop: 10 }}>Confirm & Send</button>
        {status && <div style={{ marginTop: 10 }}>{status}</div>}
      </div>
    </Section>
  );
}

function SettingsView() {
  const [tab, setTab] = useState<"email" | "locations" | "materials" | "products" | "par">("email");
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setTab("email")}>Email</button>
        <button onClick={() => setTab("locations")}>Locations</button>
        <button onClick={() => setTab("materials")}>Material Types</button>
        <button onClick={() => setTab("products")}>Products / SKUs</button>
        <button onClick={() => setTab("par")}>Global PAR</button>
      </div>

      {tab === "email" && <EmailSettings />}
      {tab === "locations" && <LocationsAdmin />}
      {tab === "materials" && <MaterialsAdmin />}
      {tab === "products" && <ProductsAdmin />}
      {tab === "par" && <GlobalParAdmin />}
    </div>
  );
}

function EmailSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => { api<Settings>("/api/settings").then(setS); }, []);

  async function save() {
    if (!s) return;
    setMsg("");
    await api("/api/settings", { method: "PUT", body: JSON.stringify(s) });
    setMsg("Saved.");
  }

  if (!s) return <Section title="Settings (email defaults)">Loading…</Section>;

  return (
    <Section title="Email Settings">
      <div style={{ display: "grid", gap: 10 }}>
        <label>Default TO emails<br />
          <input value={s.default_to_emails} onChange={(e) => setS({ ...s, default_to_emails: e.target.value })} placeholder="purchasing@company.com" />
        </label>
        <label>Default CC emails (optional)<br />
          <input value={s.default_cc_emails} onChange={(e) => setS({ ...s, default_cc_emails: e.target.value })} placeholder="manager@company.com" />
        </label>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <label>From name<br />
            <input value={s.from_name} onChange={(e) => setS({ ...s, from_name: e.target.value })} />
          </label>
          <label>From email<br />
            <input value={s.from_email} onChange={(e) => setS({ ...s, from_email: e.target.value })} placeholder="noreply@yourdomain.com" />
          </label>
        </div>
        <label>Subject prefix<br />
          <input value={s.subject_prefix} onChange={(e) => setS({ ...s, subject_prefix: e.target.value })} />
        </label>
        <button onClick={save}>Save Email Settings</button>
        {msg && <div>{msg}</div>}
      </div>
    </Section>
  );
}

function LocationsAdmin() {
  const [items, setItems] = useState<Location[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setMsg("");
    const d = await api<Location[]>("/api/locations");
    setItems(d);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    setMsg("");
    await api("/api/locations", { method: "POST", body: JSON.stringify({ name }) });
    setName("");
    await load();
  }

  async function rename(id: number, newName: string) {
    await api(`/api/locations/${id}`, { method: "PUT", body: JSON.stringify({ name: newName }) });
    await load();
  }

  async function del(id: number) {
    if (!confirm("Delete this location? (It must have no PAR/On‑Hand rows)")) return;
    const res = await fetch(`/api/locations/${id}`, { method: "DELETE" });
    if (!res.ok) setMsg(await res.text());
    await load();
  }

  return (
    <Section title="Locations">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New location name" />
        <button onClick={add} disabled={!name.trim()}>Add</button>
      </div>
      {msg && <div style={{ marginTop: 10 }}>{msg}</div>}
      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        {items.map((l) => (
          <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
            <input defaultValue={l.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== l.name) rename(l.id, v); }} />
            <button onClick={() => del(l.id)}>Delete</button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function MaterialsAdmin() {
  const [items, setItems] = useState<{ id: number; name: string }[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setMsg("");
    const d = await api<typeof items>("/api/material-types");
    setItems(d);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    setMsg("");
    const res = await fetch("/api/material-types", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    if (!res.ok) setMsg(await res.text());
    setName("");
    await load();
  }

  async function rename(id: number, newName: string) {
    const res = await fetch(`/api/material-types/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newName }) });
    if (!res.ok) setMsg(await res.text());
    await load();
  }

  async function del(id: number) {
    if (!confirm("Delete this material type? (It must not be used by products)")) return;
    const res = await fetch(`/api/material-types/${id}`, { method: "DELETE" });
    if (!res.ok) setMsg(await res.text());
    await load();
  }

  return (
    <Section title="Material Types">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New material type" />
        <button onClick={add} disabled={!name.trim()}>Add</button>
      </div>
      {msg && <div style={{ marginTop: 10 }}>{msg}</div>}
      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        {items.map((m) => (
          <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
            <input defaultValue={m.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== m.name) rename(m.id, v); }} />
            <button onClick={() => del(m.id)}>Delete</button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ProductsAdmin() {
  const [materials, setMaterials] = useState<{ id: number; name: string }[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState("");

  const [newName, setNewName] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newMt, setNewMt] = useState<number | null>(null);

  async function load() {
    setMsg("");
    const mts = await api<typeof materials>("/api/material-types");
    setMaterials(mts);
    setNewMt(mts[0]?.id ?? null);
    const data = await api<any[]>(`/api/products?query=${encodeURIComponent(query)}`);
    setItems(data);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [query]);

  async function add() {
    setMsg("");
    if (!newMt) return;
    const res = await fetch("/api/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newName, material_type_id: newMt, sku_code: newSku || null }) });
    if (!res.ok) setMsg(await res.text());
    setNewName(""); setNewSku("");
    await load();
  }

  async function saveRow(p: any) {
    setMsg("");
    const res = await fetch(`/api/products/${p.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: p.name, material_type_id: p.material_type_id, sku_code: p.sku_code || null }) });
    if (!res.ok) setMsg(await res.text());
    await load();
  }

  async function del(id: number) {
    if (!confirm("Deactivate this product? (It will stop showing in the app)")) return;
    await api(`/api/products/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <Section title="Products / SKUs">
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", alignItems: "end" }}>
        <label>Search<br />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by product or SKU…" />
        </label>

        <div />
      </div>

      <div style={{ marginTop: 12, padding: 12, border: "1px solid #eee", borderRadius: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Add new</div>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "2fr 1fr 1fr auto", alignItems: "end" }}>
          <label>Product<br /><input value={newName} onChange={(e) => setNewName(e.target.value)} /></label>
          <label>SKU (optional)<br /><input value={newSku} onChange={(e) => setNewSku(e.target.value)} /></label>
          <label>Material Type<br />
            <select value={newMt ?? ""} onChange={(e) => setNewMt(Number(e.target.value))}>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <button onClick={add} disabled={!newName.trim() || !newMt}>Add</button>
        </div>
      </div>

      {msg && <div style={{ marginTop: 10 }}>{msg}</div>}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left" style={{ borderBottom: "1px solid #eee", padding: "8px 6px" }}>Product</th>
              <th align="left" style={{ borderBottom: "1px solid #eee", padding: "8px 6px" }}>SKU</th>
              <th align="left" style={{ borderBottom: "1px solid #eee", padding: "8px 6px" }}>Material Type</th>
              <th align="right" style={{ borderBottom: "1px solid #eee", padding: "8px 6px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td style={{ borderBottom: "1px solid #f3f3f3", padding: "8px 6px" }}>
                  <input value={p.name} onChange={(e) => setItems(prev => prev.map(x => x.id===p.id ? { ...x, name: e.target.value } : x))} style={{ width: "100%" }} />
                </td>
                <td style={{ borderBottom: "1px solid #f3f3f3", padding: "8px 6px" }}>
                  <input value={p.sku_code ?? ""} onChange={(e) => setItems(prev => prev.map(x => x.id===p.id ? { ...x, sku_code: e.target.value } : x))} style={{ width: "100%" }} />
                </td>
                <td style={{ borderBottom: "1px solid #f3f3f3", padding: "8px 6px" }}>
                  <select value={p.material_type_id} onChange={(e) => setItems(prev => prev.map(x => x.id===p.id ? { ...x, material_type_id: Number(e.target.value) } : x))} style={{ width: "100%" }}>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </td>
                <td style={{ borderBottom: "1px solid #f3f3f3", padding: "8px 6px" }} align="right">
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button onClick={() => saveRow(p)}>Save</button>
                    <button onClick={() => del(p.id)}>Deactivate</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}




function GlobalParAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const data = await api<any[]>(`/api/reorder`);
      // /api/reorder returns par + total_on_hand as strings; but we want editable par.
      // We'll re-fetch full products list instead with material types.
      const products = await api<any[]>(`/api/products?query=`);
      // We'll build a simple list from /api/reorder for global par editing.
      setRows(data.map((d) => ({
        sku_id: d.sku_id,
        product: d.product,
        sku: d.sku,
        material_type: d.material_type,
        par: d.par, // string "0.0"
      })));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.product.toLowerCase().includes(q) || (r.sku ? r.sku.toLowerCase().includes(q) : false) || (r.material_type ? r.material_type.toLowerCase().includes(q) : false));
  }, [rows, filter]);

  async function saveRow(r: any) {
    setMsg("");
    // Update via product endpoint (MVP updates first sku row); we'll call /api/products/:id isn't available here.
    // Instead, update via a dedicated endpoint would be cleaner; for now, use a lightweight endpoint on skus.
    const resp = await fetch(`/api/skus/${r.sku_id}/par`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ par: r.par }),
    });
    if (!resp.ok) setMsg(await resp.text());
    else setMsg("Saved.");
  }

  return (
    <Section title="Global PAR (one PAR per product)">
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", alignItems: "center" }}>
        <label>Filter (optional)<br />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Type product, SKU, or material…" style={{ width: "100%" }} />
        </label>
        <div />
      </div>

      {msg && <div style={{ marginTop: 10 }}>{msg}</div>}
      {loading && <div style={{ marginTop: 10 }}>Loading…</div>}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left" style={{ borderBottom: "1px solid #eee", padding: "8px 6px" }}>Material</th>
              <th align="left" style={{ borderBottom: "1px solid #eee", padding: "8px 6px" }}>Product</th>
              <th align="left" style={{ borderBottom: "1px solid #eee", padding: "8px 6px" }}>SKU</th>
              <th align="right" style={{ borderBottom: "1px solid #eee", padding: "8px 6px" }}>Global PAR</th>
              <th align="right" style={{ borderBottom: "1px solid #eee", padding: "8px 6px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.sku_id}>
                <td style={{ borderBottom: "1px solid #f3f3f3", padding: "8px 6px" }}>{r.material_type}</td>
                <td style={{ borderBottom: "1px solid #f3f3f3", padding: "8px 6px" }}>{r.product}</td>
                <td style={{ borderBottom: "1px solid #f3f3f3", padding: "8px 6px" }}>{r.sku ?? ""}</td>
                <td style={{ borderBottom: "1px solid #f3f3f3", padding: "6px 6px" }} align="right">
                  <input value={r.par} onChange={(e) => setRows(prev => prev.map(x => x.sku_id===r.sku_id ? { ...x, par: e.target.value } : x))}
                    style={{ width: 90, textAlign: "right" }} inputMode="decimal" />
                </td>
                <td style={{ borderBottom: "1px solid #f3f3f3", padding: "6px 6px" }} align="right">
                  <button onClick={() => saveRow(r)}>Save</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
