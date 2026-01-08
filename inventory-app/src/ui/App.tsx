import { useEffect, useMemo, useState } from "react";

/* =====================
   TYPES
===================== */
type Location = {
  id: number;
  name: string;
};

type Product = {
  id: number;
  name: string;
  material_type: string;
  sku: string | null;
  par_qty: number;
  // returned by API, but we do NOT send this back on save:
  total_on_hand?: number;
};

type MaterialType = {
  id: number;
  name: string;
};

/* =====================
   API HELPER
===================== */
async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(opts.headers || {}),
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Request failed: ${res.status}`);
  }

  // allow empty responses safely
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/* =====================
   APP
===================== */
export default function App() {
  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.brand}>
          <div style={styles.brandDot} />
          <div>
            <div style={styles.brandTitle}>Inventory</div>
            <div style={styles.brandSub}>FASTSIGNS-style ordering</div>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        <Settings />
      </main>

      <footer style={styles.footer}>
        <span style={styles.footerText}>Mobile-ready • Cloudflare Pages</span>
      </footer>
    </div>
  );
}

/* =====================
   SETTINGS
===================== */
function Settings() {
  const [tab, setTab] = useState<"products" | "locations" | "types">("products");

  return (
    <Card title="Settings">
      <div style={styles.tabs}>
        <TabButton active={tab === "products"} onClick={() => setTab("products")}>
          Products
        </TabButton>
        <TabButton active={tab === "locations"} onClick={() => setTab("locations")}>
          Locations
        </TabButton>
        <TabButton active={tab === "types"} onClick={() => setTab("types")}>
          Material Types
        </TabButton>
      </div>

      <div style={{ marginTop: 12 }}>
        {tab === "products" ? (
          <ProductsAdmin />
        ) : tab === "locations" ? (
          <LocationsAdmin />
        ) : (
          <MaterialTypesAdmin />
        )}
      </div>
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: any;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.tabBtn,
        ...(active ? styles.tabActive : null),
      }}
      type="button"
    >
      {children}
    </button>
  );
}

/* =====================
   LOCATIONS ADMIN
===================== */
function LocationsAdmin() {
  const [rows, setRows] = useState<Location[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string>("");

  async function load() {
    setMsg("");
    const data = await api<Location[]>("/locations");
    setRows(data);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add() {
    const n = name.trim();
    if (!n) return;

    setMsg("");
    await api("/locations", { method: "POST", body: JSON.stringify({ name: n }) });
    setName("");
    await load();
    setMsg("Location added.");
  }

  async function rename(id: number, newName: string) {
    const n = newName.trim();
    if (!n) return;

    setMsg("");
    await api(`/locations/${id}`, { method: "PUT", body: JSON.stringify({ name: n }) });
    await load();
    setMsg("Location updated.");
  }

  async function del(id: number) {
  if (!confirm("Delete this location?")) return;

  setMsg("");
  try {
    await api(`/locations/${id}`, { method: "DELETE" });
    await load();
    setMsg("Location deleted.");
  } catch (e: any) {
    setMsg(e?.message || "Unable to delete location.");
  }
}


  return (
    <>
      <div style={styles.sectionTitle}>Locations</div>

      <div style={styles.grid2}>
        <label style={styles.label}>
          Add a new location
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={styles.input}
            placeholder="Example: Production"
          />
        </label>
        <div style={styles.alignBottom}>
          <button style={styles.primaryBtn} onClick={add} type="button">
            Add Location
          </button>
        </div>
      </div>

      {msg ? <div style={styles.msg}>{msg}</div> : null}

      <div style={{ overflowX: "auto", marginTop: 12 }}>
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
                  <div style={styles.help}>Edit then click away to save.</div>
                </td>
                <td style={{ ...styles.td, textAlign: "right" }}>
                  <button style={styles.btn} onClick={() => del(l.id)} type="button">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td style={styles.tdMuted} colSpan={2}>
                  No locations yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* =====================
   MATERIAL TYPES ADMIN
===================== */
function MaterialTypesAdmin() {
  const [rows, setRows] = useState<MaterialType[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setMsg("");
    const data = await api<MaterialType[]>("/material-types");
    setRows(data);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add() {
    const n = name.trim();
    if (!n) return;

    setMsg("");
    await api("/material-types", { method: "POST", body: JSON.stringify({ name: n }) });
    setName("");
    await load();
    setMsg("Material type added.");
  }

  async function del(id: number) {
    if (!confirm("Delete this material type?")) return;

    setMsg("");
    try {
      await api(`/material-types/${id}`, { method: "DELETE" });
      await load();
      setMsg("Material type deleted.");
    } catch (e: any) {
      // API sends JSON error or plain text. Show it.
      setMsg(e?.message || "Unable to delete.");
    }
  }

  return (
    <>
      <div style={styles.sectionTitle}>Material Types</div>
      <div style={styles.helpBlock}>
        These control the dropdown on Products and how orders are grouped (Roll Material, Ink, etc).
      </div>

      <div style={styles.grid2}>
        <label style={styles.label}>
          Add a new material type
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={styles.input}
            placeholder="Example: Banner"
          />
        </label>
        <div style={styles.alignBottom}>
          <button style={styles.primaryBtn} onClick={add} type="button">
            Add Type
          </button>
        </div>
      </div>

      {msg ? <div style={styles.msg}>{msg}</div> : null}

      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Type</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td style={styles.td}>{t.name}</td>
                <td style={{ ...styles.td, textAlign: "right" }}>
                  <button style={styles.btn} onClick={() => del(t.id)} type="button">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td style={styles.tdMuted} colSpan={2}>
                  No material types found. (Your DB table may not be created yet.)
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* =====================
   PRODUCTS ADMIN
===================== */
function ProductsAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [types, setTypes] = useState<MaterialType[]>([]);
  const [msg, setMsg] = useState("");

  const [newRow, setNewRow] = useState({
    name: "",
    material_type: "",
    sku: "",
    par_qty: 0,
  });

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingLocIds, setEditingLocIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const typeNames = useMemo(() => types.map((t) => t.name), [types]);

  async function load() {
    setMsg("");
    const [p, l, t] = await Promise.all([
      api<Product[]>("/products"),
      api<Location[]>("/locations"),
      api<MaterialType[]>("/material-types"),
    ]);
    setProducts(p);
    setLocations(l);
    setTypes(t);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addProduct() {
    const name = newRow.name.trim();
    const material_type = newRow.material_type.trim();
    const sku = newRow.sku.trim() || null;
    const par_qty = Math.max(0, Math.floor(Number(newRow.par_qty || 0)));

    if (!name) return setMsg("Product name is required.");
    if (!material_type) return setMsg("Material type is required.");

    setBusy(true);
    setMsg("");
    try {
      await api("/products", {
        method: "POST",
        body: JSON.stringify({ name, material_type, sku, par_qty }),
      });
      setNewRow({ name: "", material_type: "", sku: "", par_qty: 0 });
      await load();
      setMsg("Product added.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProduct(p: Product) {
    const name = String(p.name ?? "").trim();
    const material_type = String(p.material_type ?? "").trim();
    const sku = String(p.sku ?? "").trim() || null;
    const par_qty = Math.max(0, Math.floor(Number(p.par_qty || 0)));

    if (!name) return setMsg("Product name is required.");
    if (!material_type) return setMsg("Material type is required.");

    setBusy(true);
    setMsg("");
    try {
      // IMPORTANT: only send DB fields (not total_on_hand)
      await api(`/products/${p.id}`, {
        method: "PUT",
        body: JSON.stringify({ name, material_type, sku, par_qty }),
      });
      await load();
      setMsg("Saved.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(id: number) {
    if (!confirm("Delete this product?")) return;

    setBusy(true);
    setMsg("");
    try {
      await api(`/products/${id}`, { method: "DELETE" });
      await load();
      setMsg("Deleted.");
    } finally {
      setBusy(false);
    }
  }

  async function openLocations(p: Product) {
    setMsg("");
    setBusy(true);
    try {
      setEditingProduct(p);
      const assigned = await api<Location[]>(`/products/${p.id}/locations`);
      setEditingLocIds(assigned.map((x) => x.id));
    } finally {
      setBusy(false);
    }
  }

  function toggleLoc(id: number) {
    setEditingLocIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function saveLocations() {
    if (!editingProduct) return;

    setBusy(true);
    setMsg("");
    try {
      await api(`/products/${editingProduct.id}/locations`, {
        method: "PUT",
        body: JSON.stringify({ locationIds: editingLocIds }),
      });
      setEditingProduct(null);
      await load();
      setMsg("Locations updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div style={styles.sectionTitle}>Products</div>
      <div style={styles.helpBlock}>
        Material Type is used to group the order email. PAR and orders are whole units.
      </div>

      <div style={styles.formGrid}>
        <label style={styles.label}>
          Product Name
          <input
            value={newRow.name}
            onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
            style={styles.input}
            placeholder="Example: 54in Scrim Banner"
          />
        </label>

        <label style={styles.label}>
          Material Type
          <select
            value={newRow.material_type}
            onChange={(e) => setNewRow({ ...newRow, material_type: e.target.value })}
            style={styles.input}
          >
            <option value="">Select…</option>
            {types.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          SKU (optional)
          <input
            value={newRow.sku}
            onChange={(e) => setNewRow({ ...newRow, sku: e.target.value })}
            style={styles.input}
            placeholder="Optional"
          />
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

        <div style={styles.alignBottom}>
          <button style={styles.primaryBtn} onClick={addProduct} disabled={busy} type="button">
            Add Product
          </button>
        </div>
      </div>

      {msg ? <div style={styles.msg}>{msg}</div> : null}

      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Material Type</th>
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
                  <select
                    value={p.material_type}
                    onChange={(e) =>
                      setProducts((prev) =>
                        prev.map((x) => (x.id === p.id ? { ...x, material_type: e.target.value } : x))
                      )
                    }
                    style={styles.input}
                  >
                    {typeNames.length ? (
                      typeNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))
                    ) : (
                      <option value={p.material_type}>{p.material_type}</option>
                    )}
                  </select>
                </td>

                <td style={styles.td}>
                  <input
                    value={p.name}
                    onChange={(e) =>
                      setProducts((prev) =>
                        prev.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x))
                      )
                    }
                    style={styles.input}
                  />
                </td>

                <td style={styles.tdMuted}>
                  <input
                    value={p.sku ?? ""}
                    onChange={(e) =>
                      setProducts((prev) =>
                        prev.map((x) => (x.id === p.id ? { ...x, sku: e.target.value } : x))
                      )
                    }
                    style={styles.input}
                    placeholder="(optional)"
                  />
                </td>

                <td style={{ ...styles.td, textAlign: "right" }}>
                  <input
                    value={String(p.par_qty ?? 0)}
                    onChange={(e) =>
                      setProducts((prev) =>
                        prev.map((x) =>
                          x.id === p.id ? { ...x, par_qty: Number(e.target.value || 0) } : x
                        )
                      )
                    }
                    style={{ ...styles.input, width: 110, textAlign: "right" }}
                    inputMode="numeric"
                  />
                </td>

                <td style={{ ...styles.td, textAlign: "right" }}>
                  <div style={styles.actions}>
                    <button style={styles.btn} onClick={() => openLocations(p)} disabled={busy} type="button">
                      Locations…
                    </button>
                    <button style={styles.primaryBtnSmall} onClick={() => saveProduct(p)} disabled={busy} type="button">
                      Save
                    </button>
                    <button style={styles.btn} onClick={() => deleteProduct(p.id)} disabled={busy} type="button">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {products.length === 0 ? (
              <tr>
                <td style={styles.tdMuted} colSpan={5}>
                  No products yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Locations modal */}
      {editingProduct ? (
        <Modal onClose={() => setEditingProduct(null)} title={`Locations — ${editingProduct.name}`}>
          {locations.length === 0 ? (
            <div style={styles.helpBlock}>No locations exist yet. Add locations first.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {locations.map((l) => (
                <label key={l.id} style={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={editingLocIds.includes(l.id)}
                    onChange={() => toggleLoc(l.id)}
                  />
                  <span>{l.name}</span>
                </label>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
            <button style={styles.btn} onClick={() => setEditingProduct(null)} type="button">
              Cancel
            </button>
            <button style={styles.primaryBtn} onClick={saveLocations} disabled={busy} type="button">
              Save Locations
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/* =====================
   UI HELPERS
===================== */
function Card({ title, children }: { title: string; children: any }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.cardTitle}>{title}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: any;
  onClose: () => void;
}) {
  return (
    <div style={styles.modalOverlay} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div style={styles.modalTitle}>{title}</div>
          <button style={styles.iconBtn} onClick={onClose} type="button" aria-label="Close">
            ✕
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

/* =====================
   STYLES (FASTSIGNS-inspired)
===================== */
const FS_RED = "#C8102E";
const FS_DARK = "#111827";
const FS_GRAY = "#6B7280";
const FS_BORDER = "#E5E7EB";
const FS_BG = "#F7F7FA";

const styles: Record<string, any> = {
  app: {
    minHeight: "100vh",
    background: FS_BG,
    color: FS_DARK,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  header: {
    maxWidth: 1100,
    width: "100%",
    margin: "0 auto",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  brandDot: {
    width: 14,
    height: 14,
    borderRadius: 99,
    background: FS_RED,
    boxShadow: "0 8px 24px rgba(200,16,46,.25)",
  },
  brandTitle: { fontWeight: 900, fontSize: 22, lineHeight: 1.1 },
  brandSub: { color: FS_GRAY, fontSize: 13, marginTop: 2 },

  main: {
    maxWidth: 1100,
    width: "100%",
    margin: "0 auto",
  },

  footer: {
    maxWidth: 1100,
    width: "100%",
    margin: "0 auto",
    paddingTop: 4,
  },
  footerText: { color: FS_GRAY, fontSize: 12 },

  card: {
    background: "white",
    border: `1px solid ${FS_BORDER}`,
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 10px 30px rgba(17,24,39,.06)",
  },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  cardTitle: { fontWeight: 900, fontSize: 18 },

  tabs: { display: "flex", gap: 8, flexWrap: "wrap" },
  tabBtn: {
    border: `1px solid ${FS_BORDER}`,
    background: "white",
    borderRadius: 999,
    padding: "8px 12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  tabActive: {
    borderColor: FS_RED,
    background: FS_RED,
    color: "white",
  },

  sectionTitle: { fontWeight: 900, fontSize: 16, marginBottom: 6 },
  help: { color: FS_GRAY, fontSize: 12, marginTop: 6 },
  helpBlock: {
    color: FS_GRAY,
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 1.35,
  },

  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 12,
    alignItems: "end",
  },
  alignBottom: { display: "flex", alignItems: "end" },

  label: { display: "grid", gap: 6, fontSize: 13, fontWeight: 800, color: FS_DARK },
  input: {
    width: "100%",
    border: `1px solid ${FS_BORDER}`,
    borderRadius: 12,
    padding: "10px 10px",
    fontSize: 14,
    outline: "none",
    background: "white",
  },

  msg: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    border: `1px solid ${FS_BORDER}`,
    background: "white",
    color: FS_DARK,
    fontSize: 13,
  },

  btn: {
    border: `1px solid ${FS_BORDER}`,
    background: "white",
    borderRadius: 12,
    padding: "10px 12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  primaryBtn: {
    border: `1px solid ${FS_RED}`,
    background: FS_RED,
    color: "white",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(200,16,46,.18)",
  },
  primaryBtnSmall: {
    border: `1px solid ${FS_RED}`,
    background: FS_RED,
    color: "white",
    borderRadius: 12,
    padding: "10px 12px",
    fontWeight: 900,
    cursor: "pointer",
  },

  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    border: `1px solid ${FS_BORDER}`,
    borderRadius: 14,
    overflow: "hidden",
    background: "white",
  },
  th: {
    textAlign: "left",
    fontSize: 12,
    color: FS_GRAY,
    background: "#FBFBFD",
    padding: 12,
    borderBottom: `1px solid ${FS_BORDER}`,
    whiteSpace: "nowrap",
  },
  td: {
    padding: 12,
    borderBottom: `1px solid ${FS_BORDER}`,
    verticalAlign: "top",
  },
  tdMuted: {
    padding: 12,
    borderBottom: `1px solid ${FS_BORDER}`,
    verticalAlign: "top",
    color: FS_GRAY,
  },

  actions: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(17,24,39,.45)",
    display: "grid",
    placeItems: "center",
    padding: 14,
    zIndex: 50,
  },
  modal: {
    width: "min(680px, 96vw)",
    background: "white",
    borderRadius: 18,
    border: `1px solid ${FS_BORDER}`,
    boxShadow: "0 30px 80px rgba(0,0,0,.25)",
    padding: 14,
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: { fontWeight: 900, fontSize: 16 },
  iconBtn: {
    border: `1px solid ${FS_BORDER}`,
    background: "white",
    borderRadius: 12,
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: 900,
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 10px",
    border: `1px solid ${FS_BORDER}`,
    borderRadius: 12,
  },
};
