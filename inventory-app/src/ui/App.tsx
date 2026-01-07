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
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
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
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<Settings>("/api/settings").then(setS);
  }, []);

  async function save() {
    if (!s) return;
    setMsg("");
    await api("/api/settings", { method: "PUT", body: JSON.stringify(s) });
    setMsg("Saved.");
  }

  if (!s) return <Section title="Settings">Loading…</Section>;

  return (
    <Section title="Settings (email defaults)">
      <div style={{ display: "grid", gap: 10 }}>
        <label>Default TO emails<br />
          <input value={s.default_to_emails} onChange={(e) => setS({ ...s, default_to_emails: e.target.value })} placeholder="purchasing@company.com" />
        </label>
        <label>Default CC emails (optional)<br />
          <input value={s.default_cc_emails} onChange={(e) => setS({ ...s, default_cc_emails: e.target.value })} placeholder="manager@company.com" />
        </label>
        <label>From name<br />
          <input value={s.from_name} onChange={(e) => setS({ ...s, from_name: e.target.value })} />
        </label>
        <label>From email<br />
          <input value={s.from_email} onChange={(e) => setS({ ...s, from_email: e.target.value })} placeholder="noreply@yourdomain.com" />
        </label>
        <label>Subject prefix<br />
          <input value={s.subject_prefix} onChange={(e) => setS({ ...s, subject_prefix: e.target.value })} />
        </label>
        <button onClick={save}>Save Settings</button>
        {msg && <div>{msg}</div>}
      </div>
    </Section>
  );
}
