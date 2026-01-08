import { useEffect, useMemo, useState } from "react";

type Location = { id: number; name: string };
type MaterialType = { id: number; name: string };

type Product = {
  id: number;
  name: string;
  sku: string | null;
  material_type_id: number;
  material_type: string;
  par_qty: number; // 1 decimal allowed
  total_on_hand?: number; // computed by API (sum across all locations)
};

type InventoryRow = {
  product_id: number;
  name: string;
  material_type: string;
  sku: string | null;
  par_qty: number;
  on_hand_qty: number | ""; // editable
};

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      ...(opts.headers || {}),
    },
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    // try JSON
    try {
      const j = text ? JSON.parse(text) : null;
      throw new Error(j?.error || j?.message || text || `Request failed: ${res.status}`);
    } catch {
      throw new Error(text || `Request failed: ${res.status}`);
    }
  }

  return (text ? JSON.parse(text) : null) as T;
}

export default function App() {
  const [view, setView] = useState<"onhand" | "settings">("onhand");

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.brand}>
          <div style={styles.brandDot} />
          <div>
            <div style={styles.brandTitle}>Inventory</div>
            <div style={styles.brandSub}>FASTSIGNS-style inventory + ordering</div>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.tabs}>
          <TabButton active={view === "onhand"} onClick={() => setView("onhand")}>
            On-Hand
          </TabButton>
          <TabButton active={view === "settings"} onClick={() => setView("settings")}>
            Settings
          </TabButton>
        </div>

        <div style={{ marginTop: 12 }}>
          {view === "onhand" ? <OnHandEntry /> : <Settings />}
        </div>
      </main>

      <footer style={styles.footer}>
        <span style={styles.footerText}>Mobile-ready • Cloudflare Pages + D1</span>
      </footer>
    </div>
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
   ON-HAND ENTRY (per location)
===================== */
function OnHandEntry() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number>(0);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadLocations() {
    const locs = await api<Location[]>("/locations");
    setLocations(locs);
    if (!locationId && locs.length) setLocationId(locs[0].id);
  }

  async function loadInventory(lid: number) {
    const data = await api<any[]>(`/inventory?location_id=${lid}`);
    setRows(
      data.map((r) => ({
        product_id: Number(r.product_id),
        name: String(r.name ?? ""),
        material_type: String(r.material_type ?? ""),
        sku: r.sku ?? null,
        par_qty: Number(r.par_qty ?? 0),
        on_hand_qty: r.on_hand_qty === null || r.on_hand_qty === undefined ? 0 : Number(r.on_hand_qty),
      }))
    );
  }

  useEffect(() => {
    loadLocations().catch((e) => setMsg(e.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (locationId) {
      loadInventory(locationId).catch((e) => setMsg(e.message || String(e)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  function setQty(product_id: number, val: string) {
    const cleaned = val === "" ? "" : Number(val);
    setRows((prev) =>
      prev.map((r) => (r.product_id === product_id ? { ...r, on_hand_qty: cleaned } : r))
    );
  }

  async function save() {
    if (!locationId) return;
    setSaving(true);
    setMsg("");
    try {
      // keep 1 decimal max (store as REAL)
      const items = rows.map((r) => ({
        product_id: r.product_id,
        qty: r.on_hand_qty === "" ? 0 : Number(Number(r.on_hand_qty || 0).toFixed(1)),
      }));

      await api("/inventory", {
        method: "PUT",
        body: JSON.stringify({ location_id: locationId, items }),
      });

      setMsg("Saved on-hands.");
      await loadInventory(locationId);
    } catch (e: any) {
      setMsg(e?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="On-Hand Entry">
      <div style={styles.helpBlock}>
        Select a location, then enter current on-hand (up to 1 decimal place).
      </div>

      <label style={styles.label}>
        Location
        <select
          value={locationId || ""}
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

      {msg ? <div style={styles.msg}>{msg}</div> : null}

      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Material</th>
              <th style={styles.th}>Product</th>
              <th style={styles.th}>SKU</th>
              <th style={{ ...styles.th, textAlign: "right" }}>On-Hand</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.product_id}>
                <td style={styles.tdMuted}>{r.material_type}</td>
                <td style={styles.td}>{r.name}</td>
                <td style={styles.tdMuted}>{r.sku ?? ""}</td>
                <td style={{ ...styles.td, textAlign: "right" }}>
                  <input
                    value={r.on_hand_qty}
                    onChange={(e) => setQty(r.product_id, e.target.value)}
                    style={{ ...styles.input, width: 120, textAlign: "right" }}
                    inputMode="decimal"
                    step="0.1"
                    type="number"
                    placeholder="0.0"
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td style={styles.tdMuted} colSpan={4}>
                  No products assigned to this location yet. Go to Settings → Products → Locations…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button style={styles.primaryBtn} onClick={save} disabled={saving} type="button">
          {saving ? "Saving…" : "Save On-Hands"}
        </button>
      </div>
    </Card>
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
    await api(`/locations/${id}`, { method: "DELETE" });
    await load();
    setMsg("Location deleted.");
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
    await api(`/material-types/${id}`, { method: "DELETE" });
    await load();
    setMsg("Material type deleted.");
  }

  return (
    <>
      <div style={styles.sectionTitle}>Material Types</div>
      <div style={styles.helpBlock}>
        These control the dropdown on Products and how orders are grouped.
      </div>

      <div style={styles.grid2}>
        <label style={styles.label}>
          Add a new material type
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={styles.input}
            placeholder="Example: Substrate"
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
                  No material types found.
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
    material_type_id: 0,
    sku: "",
    par_qty: 0,
  });

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingLocIds, setEditingLocIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);

  async function load() {
    setMsg("");
    const [p, l, t] = await Promise.all([
      api<Product[]>("/products"),
      api<Location[]>("/locations"),
      api<MaterialType[]>("/material-types"),
    ]);
    setProducts(
      p.map((x) => ({
        ...x,
        par_qty: Number(x.par_qty ?? 0),
        material_type: x.material_type ?? typeById.get(x.material_type_id) ?? "",
      }))
    );
    setLocations(l);
    setTypes(t);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addProduct() {
    const name = newRow.name.trim();
    const material_type_id = Number(newRow.material_type_id || 0);
    const sku = newRow.sku.trim() || null;
    const par_qty = Number(Number(newRow.par_qty || 0).toFixed(1));

    if (!name) return setMsg("Product name is required.");
    if (!material_type_id) return setMsg("Material type is required.");

    setBusy(true);
    setMsg("");
    try {
      await api("/products", {
        method: "POST",
        body: JSON.stringify({ name, material_type_id, sku, par_qty }),
      });
      setNewRow({ name: "", material_type_id: 0, sku: "", par_qty: 0 });
      await load();
      setMsg("Product added.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProduct(p: Product) {
    const name = String(p.name ?? "").trim();
    const material_type_id = Number(p.material_type_id || 0);
    const sku = String(p.sku ?? "").trim() || null;
    const par_qty = Number(Number(p.par_qty || 0).toFixed(1));

    if (!name) return setMsg("Product name is required.");
    if (!material_type_id) return setMsg("Material type is required.");

    setBusy(true);
    setMsg("");
    try {
      await api(`/products/${p.id}`, {
        method: "PUT",
        body: JSON.stringify({ name, material_type_id, sku, par_qty }),
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
        One global PAR per product (1 decimal). Total on-hand is summed across all locations.
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
            value={newRow.material_type_id || ""}
            onChange={(e) => setNewRow({ ...newRow, material_type_id: Number(e.target.value) })}
            style={styles.input}
          >
            <option value="">Select…</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
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
          Global PAR (1 decimal)
          <input
            value={String(newRow.par_qty)}
            onChange={(e) => setNewRow({ ...newRow, par_qty: Number(e.target.value || 0) })}
            style={styles.input}
            type="number"
            step="0.1"
            inputMode="decimal"
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
                    value={p.material_type_id}
                    onChange={(e) =>
                      setProducts((prev) =>
                        prev.map((x) =>
                          x.id === p.id ? { ...x, material_type_id: Number(e.target.value) } : x
                        )
                      )
                    }
                    style={styles.input}
                  >
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
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
                    style={{ ...styles.input, width: 120, textAlign: "right" }}
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                  />
                </td>

                <td style={{ ...styles.td, textAlign: "right" }}>
                  <div style={styles.actions}>
                    <button
                      style={styles.btn}
                      onClick={() => openLocations(p)}
                      disabled={busy}
                      type="button"
                    >
                      Locations…
                    </button>
                    <button
                      style={styles.primaryBtnSmall}
                      onClick={() => saveProduct(p)}
                      disabled={busy}
                      type="button"
                    >
                      Save
                    </button>
                    <button
                      style={styles.btn}
                      onClick={() => deleteProduct(p.id)}
                      disabled={busy}
                      type="button"
                    >
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
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  header: { maxWidth: 1100, width: "100%", margin: "0 auto" },
  brand: { display: "flex", alignItems: "center", gap: 12 },
  brandDot: {
    width: 14,
    height: 14,
    borderRadius: 99,
    background: FS_RED,
    boxShadow: "0 8px 24px rgba(200,16,46,.25)",
  },
  brandTitle: { fontWeight: 900, fontSize: 22, lineHeight: 1.1 },
  brandSub: { color: FS_GRAY, fontSize: 13, marginTop: 2 },

  main: { maxWidth: 1100, width: "100%", margin: "0 auto" },
  footer: { maxWidth: 1100, width: "100%", margin: "0 auto", paddingTop: 4 },
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
  tabActive: { borderColor: FS_RED, background: FS_RED, color: "white" },

  sectionTitle: { fontWeight: 900, fontSize: 16, marginBottom: 6 },
  help: { color: FS_GRAY, fontSize: 12, marginTop: 6 },
  helpBlock: { color: FS_GRAY, fontSize: 13, marginBottom: 10, lineHeight: 1.35 },

  grid2: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 },
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
  td: { padding: 12, borderBottom: `1px solid ${FS_BORDER}`, verticalAlign: "top" },
  tdMuted: { padding: 12, borderBottom: `1px solid ${FS_BORDER}`, verticalAlign: "top", color: FS_GRAY },

  actions: { display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" },

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
  modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
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
