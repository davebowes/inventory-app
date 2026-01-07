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
  const [tab, setTab] = useState<"products" | "locations">("products");

  return (
    <Card title="Settings">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          style={{ ...styles.btn, ...(tab === "products" ? styles.tabActive : null) }}
          onClick={() => setTab("products")}
        >
          Products
        </button>
        <button
          style={{ ...styles.btn, ...(tab === "locations" ? styles.tabActive : null) }}
          onClick={() => setTab("locations")}
        >
          Locations
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        {tab === "products" && <ProductsAdmin />}
        {tab === "locations" && <LocationsAdmin />}
      </div>
    </Card>
  );
}
function LocationsAdmin() {
  const [rows, setRows] = useState<Location[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setMsg("");
    const data = await api<Location[]>("/locations");
    setRows(data);
  }

  useEffect(() => {
    load().catch((e) => setMsg(String(e.message || e)));
  }, []);

  async function add() {
    setMsg("");
    const n = name.trim();
    if (!n) return;

    await api("/locations", { method: "POST", body: JSON.stringify({ name: n }) });
    setName("");
    await load();
    setMsg("Location added.");
  }

  async function rename(id: number, newName: string) {
    setMsg("");
    const n = newName.trim();
    if (!n) return;

    await api(`/locations/${id}`, { method: "PUT", body: JSON.stringify({ name: n }) });
    await load();
    setMsg("Updated.");
  }

  async function del(id: number) {
    setMsg("");
    if (!confirm("Delete this location?")) return;

    await api(`/locations/${id}`, { method: "DELETE" });
    await load();
    setMsg("Deleted.");
  }

  return (
    <>
      <div style={styles.grid2}>
        <label style={styles.label}>
          New Location
          <input value={name} onChange={(e) => setName(e.target.value)} style={styles.input} />
        </label>
        <div style={{ display: "flex", alignItems: "end" }}>
          <button style={styles.btnPrimary} onClick={add}>Add Location</button>
        </div>
      </div>

      {msg && <div style={styles.msg}>{msg}</div>}

      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Location</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td style={styles.td}>
                  <input
                    defaultValue={l.name}
                    style={styles.input}
                    onBlur={(e) => rename(l.id, e.target.value)}
                  />
                </td>
                <td style={{ ...styles.td, textAlign: "right" }}>
                  <button style={styles.btn} onClick={() => del(l.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td style={styles.tdMuted} colSpan={2}>No locations yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProductsAdmin() {
  const [products, setProducts] = useState<any[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [msg, setMsg] = useState("");

  const [newRow, setNewRow] = useState({
    name: "",
    material_type: "",
    sku: "",
    par_qty: 0,
  });

  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [editingLocIds, setEditingLocIds] = useState<number[]>([]);

  async function load() {
    setMsg("");
    const [p, l] = await Promise.all([
      api<any[]>("/products"),
      api<Location[]>("/locations"),
    ]);
    setProducts(p);
    setLocations(l);
  }

  useEffect(() => {
    load().catch((e) => setMsg(String(e.message || e)));
  }, []);

  async function addProduct() {
    setMsg("");
    if (!newRow.name.trim() || !newRow.material_type.trim()) {
      setMsg("Product name and material type are required.");
      return;
    }
    await api("/products", {
      method: "POST",
      body: JSON.stringify({
        name: newRow.name.trim(),
        material_type: newRow.material_type.trim(),
        sku: newRow.sku.trim() || null,
        par_qty: Math.max(0, Math.floor(Number(newRow.par_qty || 0))),
      }),
    });
    setNewRow({ name: "", material_type: "", sku: "", par_qty: 0 });
    await load();
    setMsg("Product added.");
  }

  async function saveProduct(p: any) {
    setMsg("");
    await api(`/products/${p.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: String(p.name).trim(),
        material_type: String(p.material_type).trim(),
        sku: String(p.sku ?? "").trim() || null,
        par_qty: Math.max(0, Math.floor(Number(p.par_qty || 0))),
      }),
    });
    await load();
    setMsg("Saved.");
  }

  async function deleteProduct(id: number) {
    setMsg("");
    if (!confirm("Delete this product?")) return;
    await api(`/products/${id}`, { method: "DELETE" });
    await load();
    setMsg("Deleted.");
  }

  async function openLocations(p: any) {
    setMsg("");
    setEditingProduct(p);
    const assigned = await api<Location[]>(`/products/${p.id}/locations`);
    setEditingLocIds(assigned.map((x) => x.id));
  }

  async function saveLocations() {
    if (!editingProduct) return;
    await api(`/products/${editingProduct.id}/locations`, {
      method: "PUT",
      body: JSON.stringify({ locationIds: editingLocIds }),
    });
    setEditingProduct(null);
    await load();
    setMsg("Locations updated.");
  }

  function toggleLoc(id: number) {
    setEditingLocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <>
      <div style={styles.grid2}>
        <label style={styles.label}>
          Product Name
          <input value={newRow.name} onChange={(e) => setNewRow({ ...newRow, name: e.target.value })} style={styles.input} />
        </label>

        <label style={styles.label}>
          Material Type (for grouping)
          <input value={newRow.material_type} onChange={(e) => setNewRow({ ...newRow, material_type: e.target.value })} style={styles.input} />
        </label>

        <label style={styles.label}>
          SKU (optional)
          <input value={newRow.sku} onChange={(e) => setNewRow({ ...newRow, sku: e.target.value })} style={styles.input} />
        </label>

        <label style={styles.label}>
          Global PAR (whole units)
          <input
            value={String(newRow.par_qty)}
            onChange={(e) => setNewRow({ ...newRow, par_qty: Number(e.target.value || 0) })}
            style={styles.input}
            inputMode="numeric"
          />
        </label>

        <div style={{ display: "flex", alignItems: "end" }}>
          <button style={styles.btnPrimary} onClick={addProduct}>Add Product</button>
        </div>
      </div>

      {msg && <div style={styles.msg}>{msg}</div>}

      {editingProduct && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #e5e7eb", borderRadius: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>
            Stocked Locations — {editingProduct.name}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {locations.map((l) => (
              <label key={l.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={editingLocIds.includes(l.id)}
                  onChange={() => toggleLoc(l.id)}
                />
                {l.name}
              </label>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button style={styles.btn} onClick={() => setEditingProduct(null)}>Cancel</button>
            <button style={styles.btnPrimary} onClick={saveLocations}>Save Locations</button>
          </div>
        </div>
      )}

      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Material</th>
              <th style={styles.th}>Product</th>
              <th style={styles.th}>SKU</th>
              <th style={{ ...styles.th, textAlign: "right" }}>PAR</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td style={styles.tdMuted}>
                  <input
                    value={p.material_type}
                    style={styles.input}
                    onChange={(e) => setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, material_type: e.target.value } : x))}
                  />
                </td>
                <td style={styles.td}>
                  <input
                    value={p.name}
                    style={styles.input}
                    onChange={(e) => setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, name: e.target.value } : x))}
                  />
                </td>
                <td style={styles.tdMuted}>
                  <input
                    value={p.sku ?? ""}
                    style={styles.input}
                    onChange={(e) => setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, sku: e.target.value } : x))}
                  />
                </td>
                <td style={{ ...styles.td, textAlign: "right" }}>
                  <input
                    value={String(p.par_qty ?? 0)}
                    style={{ ...styles.input, width: 110, textAlign: "right" }}
                    inputMode="numeric"
                    onChange={(e) => setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, par_qty: Number(e.target.value || 0) } : x))}
                  />
                </td>
                <td style={{ ...styles.td, textAlign: "right" }}>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                    <button style={styles.btn} onClick={() => openLocations(p)}>Locations…</button>
                    <button style={styles.btnPrimary} onClick={() => saveProduct(p)}>Save</button>
                    <button style={styles.btn} onClick={() => deleteProduct(p.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td style={styles.tdMuted} colSpan={5}>No products yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
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
