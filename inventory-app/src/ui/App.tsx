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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ sku_id: number; product: string; sku: string | null }[]>([]);
  const [skuId, setSkuId] = useState<number | null>(null);
  const [onHand, setOnHand] = useState<string>("0.0");
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    api<Location[]>("/api/locations").then((d) => {
      setLocations(d);
      setLocationId(d[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      api<typeof results>(`/api/search?query=${encodeURIComponent(query)}`).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function save() {
    setMsg("");
    if (!locationId || !skuId) { setMsg("Pick a location and an item."); return; }
    const v = Number(onHand);
    if (Number.isNaN(v)) { setMsg("On-hand must be a number like 0.0 or 2.3"); return; }
    await api("/api/onhand", { method: "POST", body: JSON.stringify({ locationId, skuId, onHand: v }) });
    setMsg("Saved.");
  }

  return (
    <Section title="On‑Hand Entry">
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", alignItems: "center" }}>
        <label>
          Location<br />
          <select value={locationId ?? ""} onChange={(e) => setLocationId(Number(e.target.value))} style={{ width: "100%" }}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>

        <label>
          Search Product / SKU<br />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a product name or SKU…" style={{ width: "100%" }} />
        </label>
      </div>

      {results.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Matches</div>
          <div style={{ display: "grid", gap: 6 }}>
            {results.slice(0, 12).map((r) => (
              <button key={r.sku_id} onClick={() => { setSkuId(r.sku_id); setQuery(`${r.product}${r.sku ? " ("+r.sku+")" : ""}`); setResults([]); }}>
                {r.product}{r.sku ? ` — ${r.sku}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr", marginTop: 12, alignItems: "center" }}>
        <label>
          On‑hand (0.1 increments)<br />
          <input value={onHand} onChange={(e) => setOnHand(e.target.value)} style={{ width: "100%" }} />
        </label>
        <div>
          <br />
          <button onClick={save} style={{ width: "100%" }}>Save On‑Hand</button>
        </div>
      </div>

      {msg && <div style={{ marginTop: 10 }}>{msg}</div>}
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
