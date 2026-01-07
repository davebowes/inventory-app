import { useEffect, useState } from "react";

/* =====================
   TYPES
===================== */
type Location = {
  id: number;
  name: string;
};
type MaterialType = { id: number; name: string };

type Product = {
  id: number;
  name: string;
  material_type: string;
  sku: string | null;
  par_qty: number;
  total_on_hand?: number;
};

/* =====================
   API HELPER
===================== */
async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "content-type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* =====================
   APP
===================== */
export default function App() {
  const [view, setView] = useState<"settings">("settings");

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.title}>Inventory</h1>
      </header>

      <main style={styles.main}>
        {view === "settings" && <Settings />}
      </main>
    </div>
  );
}

/* =====================
   SETTINGS
===================== */
function Settings() {
  const [tab, setTab] = useState<"products" | "locations">("products");

  return (
    <Card title="Settings">
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tabBtn, ...(tab === "products" ? styles.tabActive : {}) }}
          onClick={() => setTab("products")}
        >
          Products
        </button>
        <button
          style={{ ...styles.tabBtn, ...(tab === "locations" ? styles.tabActive : {}) }}
          onClick={() => setTab("locations")}
        >
          Locations
        </button>
      </div>

      {tab === "products" ? <ProductsAdmin /> : <LocationsAdmin />}
    </Card>
  );
}


/* =====================
   LOCATIONS ADMIN
===================== */
function LocationsAdmin() {
  const [rows, setRows] = useState<Location[]>([]);
  const [name, setName] = useState("");

  async function load() {
    setRows(await api<Location[]>("/locations"));
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!name.trim()) return;
    await api("/locations", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setName("");
    load();
  }

  async function del(id: number) {
    if (!confirm("Delete location?")) return;
    await api(`/locations/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <div style={styles.row}>
        <input
          placeholder="New location"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={styles.input}
        />
        <button style={styles.primaryBtn} onClick={add}>
          Add
        </button>
      </div>

      <ul style={styles.list}>
        {rows.map((l) => (
          <li key={l.id} style={styles.listItem}>
            {l.name}
            <button style={styles.btn} onClick={() => del(l.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/* =====================
   PRODUCTS ADMIN
===================== */
function ProductsAdmin() {
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  const [newRow, setNewRow] = useState({
    name: "",
    material_type: "",
    sku: "",
    par_qty: 0,
  });

  const [editing, setEditing] = useState<Product | null>(null);
  const [locIds, setLocIds] = useState<number[]>([]);

  async function load() {
    const [p, l] = await Promise.all([
      api<Product[]>("/products"),
      api<Location[]>("/locations"),
    ]);
    setProducts(p);
    setLocations(l);
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!newRow.name || !newRow.material_type) return;
    await api("/products", {
      method: "POST",
      body: JSON.stringify({
        name: newRow.name,
        material_type: newRow.material_type,
        sku: newRow.sku || null,
        par_qty: Number(newRow.par_qty || 0),
      }),
    });
    setNewRow({ name: "", material_type: "", sku: "", par_qty: 0 });
    load();
  }

  async function save(p: Product) {
    await api(`/products/${p.id}`, {
      method: "PUT",
      body: JSON.stringify(p),
    });
    load();
  }

  async function del(id: number) {
    if (!confirm("Delete product?")) return;
    await api(`/products/${id}`, { method: "DELETE" });
    load();
  }

  async function editLocations(p: Product) {
    setEditing(p);
    const assigned = await api<Location[]>(`/products/${p.id}/locations`);
    setLocIds(assigned.map((x) => x.id));
  }

  async function saveLocations() {
    if (!editing) return;
    await api(`/products/${editing.id}/locations`, {
      method: "PUT",
      body: JSON.stringify({ locationIds: locIds }),
    });
    setEditing(null);
    load();
  }

  return (
    <>
      <div style={styles.grid}>
        <input
          placeholder="Product name"
          value={newRow.name}
          onChange={(e) => setNewRow({ ...newRow, name: e.target.value })}
          style={styles.input}
        />
        <input
          placeholder="Material type"
          value={newRow.material_type}
          onChange={(e) => setNewRow({ ...newRow, material_type: e.target.value })}
          style={styles.input}
        />
        <input
          placeholder="SKU (optional)"
          value={newRow.sku}
          onChange={(e) => setNewRow({ ...newRow, sku: e.target.value })}
          style={styles.input}
        />
        <input
          type="number"
          placeholder="PAR"
          value={newRow.par_qty}
          onChange={(e) => setNewRow({ ...newRow, par_qty: Number(e.target.value) })}
          style={styles.input}
        />
        <button style={styles.primaryBtn} onClick={add}>
          Add Product
        </button>
      </div>

      <table style={styles.table}>
        <thead>
          <tr>
            <th>Material</th>
            <th>Name</th>
            <th>SKU</th>
            <th>PAR</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.material_type}</td>
              <td>{p.name}</td>
              <td>{p.sku ?? ""}</td>
              <td>{p.par_qty}</td>
              <td>
                <button style={styles.btn} onClick={() => editLocations(p)}>
                  Locations
                </button>
                <button style={styles.btn} onClick={() => save(p)}>
                  Save
                </button>
                <button style={styles.btn} onClick={() => del(p.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <Card title={`Locations — ${editing.name}`}>
          {locations.map((l) => (
            <label key={l.id} style={styles.checkbox}>
              <input
                type="checkbox"
                checked={locIds.includes(l.id)}
                onChange={() =>
                  setLocIds((prev) =>
                    prev.includes(l.id)
                      ? prev.filter((x) => x !== l.id)
                      : [...prev, l.id]
                  )
                }
              />
              {l.name}
            </label>
          ))}

          <div style={styles.row}>
            <button style={styles.btn} onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button style={styles.primaryBtn} onClick={saveLocations}>
              Save Locations
            </button>
          </div>
        </Card>
      )}
    </>
  );
}

/* =====================
   UI HELPERS
===================== */
function Card({ title, children }: { title: string; children: any }) {
  return (
    <div style={styles.card}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/* =====================
   STYLES
===================== */
const styles: any = {
  app: { fontFamily: "system-ui, sans-serif", padding: 16 },
  header: { marginBottom: 16 },
  title: { margin: 0 },
  main: { maxWidth: 1000, margin: "0 auto" },

  card: {
    background: "#fff",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 4px 12px rgba(0,0,0,.08)",
  },

  tabs: { display: "flex", gap: 8, marginBottom: 12 },
  tabBtn: { padding: "6px 12px", borderRadius: 8 },
  tabActive: { background: "#c8102e", color: "#fff" },

  grid: { display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" },
  row: { display: "flex", gap: 8, marginTop: 12 },
  list: { listStyle: "none", padding: 0 },
  listItem: { display: "flex", justifyContent: "space-between", marginBottom: 6 },

  input: { padding: 8, borderRadius: 8, border: "1px solid #ccc" },
  btn: { padding: "6px 10px" },
  primaryBtn: {
    padding: "6px 12px",
    background: "#c8102e",
    color: "#fff",
    borderRadius: 8,
  },

  table: { width: "100%", marginTop: 12, borderCollapse: "collapse" },
  checkbox: { display: "flex", gap: 8, marginBottom: 6 },
};
