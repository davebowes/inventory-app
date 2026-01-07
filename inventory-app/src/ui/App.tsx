import React, { useEffect, useMemo, useState } from "react";

type View = "onhand" | "reorder" | "settings";

type Location = { id: number; name: string };

type OnHandRow = {
  product_id: number;
  name: string;
  material_type: string;
  qty: number; // whole units
};

type ReorderRow = {
  id: number;
  name: string;
  material_type: string;
  sku: string | null;
  par_qty: number;
  total_on_hand: number;
  order_qty: number;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function App() {
  const [view, setView] = useState<View>("onhand");

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.brandRow}>
          <div style={styles.dot} />
          <div>
            <div style={styles.title}>FASTSIGNS Inventory</div>
            <div style={styles.sub}>Global PAR • Multi-location On-Hand • Whole-unit ordering</div>
          </div>
        </div>

        <nav style={styles.nav}>
          <NavButton active={view === "onhand"} onClick={() => setView("onhand")}>
            On-Hand
          </NavButton>
          <NavButton active={view === "reorder"} onClick={() => setView("reorder")}>
            Reorder
          </NavButton>
          <NavButton active={view === "settings"} onClick={() => setView("settings")}>
            Settings
          </NavButton>
        </nav>
      </header>

      <main style={styles.main}>
        {view === "onhand" && <OnHand />}
        {view === "reorder" && <Reorder />}
        {view === "settings" && <Settings />}
      </main>

      {/* Mobile bottom nav */}
      <div style={styles.bottomNav}>
        <BottomNavButton active={view === "onhand"} onClick={() => setView("onhand")}>
          On-Hand
        </BottomNavButton>
        <BottomNavButton active={view === "reorder"} onClick={() => setView("reorder")}>
          Reorder
        </BottomNavButton>
        <BottomNavButton active={view === "settings"} onClick={() => setView("settings")}>
          Settings
        </BottomNavButton>
      </div>
    </div>
  );
}

function NavButton({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.tab,
        ...(active ? styles.tabActive : null),
      }}
    >
      {children}
    </button>
  );
}

function BottomNavButton({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.bottomBtn,
        ...(active ? styles.bottomBtnActive : null),
      }}
    >
      {children}
    </button>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      <div>{children}</div>
    </section>
  );
}

/* =========================
   ON-HAND (by location)
========================= */
function OnHand() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [rows, setRows] = useState<OnHandRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    api<Location[]>("/locations")
      .then((d) => {
        setLocations(d);
        setLocationId(d[0]?.id ?? null);
      })
      .catch((e) => setMsg(String(e.message || e)));
  }, []);

  async function load(locId: number) {
    setMsg("");
    const data = await api<OnHandRow[]>(`/onhand/${locId}`);
    setRows(data);
  }

  useEffect(() => {
    if (locationId) load(locationId).catch((e) => setMsg(String(e.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  function setQty(product_id: number, qtyStr: string) {
    const qty = Math.max(0, Math.floor(Number(qtyStr || 0)));
    if (Number.isNaN(qty)) return;
    setRows((prev) => prev.map((r) => (r.product_id === product_id ? { ...r, qty } : r)));
  }

  async function saveAll() {
    if (!locationId) return;
    setSaving(true);
    setMsg("");
    try {
      const payload = rows.map((r) => ({
        product_id: r.product_id,
        location_id: locationId,
        qty: Math.max(0, Math.floor(r.qty)),
      }));
      await api("/onhand", { method: "POST", body: JSON.stringify(payload) });
      setMsg("Saved.");
      await load(locationId);
    } catch (e: any) {
      setMsg(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="On-Hand Count (by Location)">
      <div style={styles.grid2}>
        <label style={styles.label}>
          Location
          <select
            value={locationId ?? ""}
            onChange={(e) => setLocationId(Number(e.target.value))}
            style={styles.input}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
          <button style={styles.btn} onClick={() => locationId && load(locationId)} disabled={!locationId}>
            Refresh
          </button>
          <button style={styles.btnPrimary} onClick={saveAll} disabled={!locationId || saving}>
            {saving ? "Saving…" : "Save On-Hands"}
          </button>
        </div>
      </div>

      <div style={styles.hint}>
        Enter whole units per location. Reorder uses <b>Global PAR</b> vs <b>total on-hand across all locations</b>.
      </div>

      {msg && <div style={styles.msg}>{msg}</div>}

      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Material</th>
              <th style={styles.th}>Product</th>
              <th style={{ ...styles.th, textAlign: "right" }}>On-Hand</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.product_id}>
                <td style={styles.tdMuted}>{r.material_type}</td>
                <td style={styles.td}>{r.name}</td>
                <td style={{ ...styles.td, textAlign: "right" }}>
                  <input
                    value={String(r.qty ?? 0)}
                    onChange={(e) => setQty(r.product_id, e.target.value)}
                    inputMode="numeric"
                    style={{ ...styles.input, width: 110, textAlign: "right" }}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td style={styles.tdMuted} colSpan={3}>
                  No products assigned to this location yet (we’ll add assignment UI in Settings next).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* =========================
   REORDER (Global PAR)
========================= */
function Reorder() {
  const [rows, setRows] = useState<ReorderRow[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    setMsg("");
    const data = await api<ReorderRow[]>("/reorder");
    setRows(data);
  }

  useEffect(() => {
    load().catch((e) => setMsg(String(e.message || e)));
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, ReorderRow[]>();
    for (const r of rows) {
      const key = r.material_type || "Other";
      m.set(key, [...(m.get(key) ?? []), r]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  return (
    <Card title="Reorder List (Global PAR vs Total On-Hand)">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button style={styles.btn} onClick={load}>
          Refresh
        </button>
        <span style={styles.pill}>Only shows items with order qty &gt; 0</span>
      </div>

      {msg && <div style={styles.msg}>{msg}</div>}

      {grouped.map(([material, items]) => (
        <div key={material} style={{ marginTop: 14 }}>
          <div style={styles.groupTitle}>{material}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>SKU</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>PAR</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>Total On-Hand</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>Order</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td style={styles.td}>{r.name}</td>
                    <td style={styles.tdMuted}>{r.sku ?? ""}</td>
                    <td style={{ ...styles.td, textAlign: "right" }}>{r.par_qty}</td>
                    <td style={{ ...styles.td, textAlign: "right" }}>{r.total_on_hand}</td>
                    <td style={{ ...styles.td, textAlign: "right", fontWeight: 900, color: "#E31837" }}>
                      {r.order_qty}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td style={styles.tdMuted} colSpan={5}>
                      No reorder items in this material type.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {rows.length === 0 && !msg && (
        <div style={{ marginTop: 12 }} className="muted">
          Nothing to order — your total on-hand meets or exceeds PAR.
        </div>
      )}
    </Card>
  );
}

/* =========================
   SETTINGS (placeholder)
========================= */
function Settings() {
  return (
    <Card title="Settings">
      <div style={styles.hint}>
        Next we’ll add full CRUD here:
        <ul style={{ margin: "8px 0 0 18px" }}>
          <li>Products (name, material, SKU optional, global PAR)</li>
          <li>Locations</li>
          <li>Assign products to multiple locations</li>
        </ul>
      </div>
    </Card>
  );
}

/* =========================
   Styles
========================= */
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f6f7f9",
    color: "#0f172a",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: "rgba(246,247,249,.92)",
    backdropFilter: "blur(10px)",
    borderBottom: "1px solid #e5e7eb",
    padding: "12px 14px",
  },
  brandRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: "#E31837",
    boxShadow: "0 0 0 4px rgba(227,24,55,.15)",
  },
  title: { fontWeight: 900, fontSize: 18, lineHeight: 1.1 },
  sub: { color: "#64748b", fontSize: 12, marginTop: 2 },
  nav: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  tab: {
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  },
  tabActive: {
    borderColor: "rgba(227,24,55,.35)",
    background: "rgba(227,24,55,.08)",
    color: "#E31837",
  },
  main: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: 14,
    paddingBottom: 88,
  },
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    boxShadow: "0 10px 30px rgba(2,6,23,.08)",
    padding: 14,
  },
  cardTitle: { fontWeight: 900, fontSize: 16, marginBottom: 10 },
  grid2: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "1fr 1fr",
  },
  label: { display: "grid", gap: 6, fontWeight: 800, fontSize: 13 },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fff",
  },
  btn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  },
  btnPrimary: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #E31837",
    background: "#E31837",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
  },
  hint: { color: "#64748b", fontSize: 13, marginTop: 10 },
  msg: { marginTop: 10, color: "#0f172a", fontWeight: 700 },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 10 },
  th: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: ".04em",
    color: "#64748b",
    textAlign: "left",
    padding: "10px 8px",
    borderBottom: "1px solid #e5e7eb",
    whiteSpace: "nowrap",
  },
  td: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" },
  tdMuted: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9", color: "#64748b" },
  groupTitle: { marginTop: 10, fontWeight: 900, color: "#0f172a" },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "#fff",
    fontSize: 12,
    color: "#64748b",
  },
  bottomNav: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    borderTop: "1px solid #e5e7eb",
    background: "rgba(255,255,255,.92)",
    backdropFilter: "blur(10px)",
    padding: 10,
    display: "none",
  },
  bottomBtn: {
    flex: 1,
    padding: "10px 8px",
    borderRadius: 14,
    border: "1px solid transparent",
    background: "transparent",
    fontWeight: 900,
    color: "#64748b",
    cursor: "pointer",
  },
  bottomBtnActive: {
    color: "#E31837",
    background: "rgba(227,24,55,.08)",
    borderColor: "rgba(227,24,55,.18)",
  },
};

// enable bottom nav on small screens
const media = window.matchMedia?.("(max-width: 760px)");
if (media?.matches) {
  styles.nav.display = "none";
  styles.bottomNav.display = "flex";
  styles.bottomNav.gap = 8;
  styles.bottomNav.maxWidth = 1100;
  (styles.bottomNav as any).margin = "0 auto";
}
