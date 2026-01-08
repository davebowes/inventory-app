import React, { useEffect, useMemo, useState } from "react";
import { Api, Location, MaterialType, Product, ReorderRow } from "./api";

type View = "onhand" | "reorder" | "settings";
type SettingsTab = "products" | "locations" | "materialTypes";

function round1(n: number) {
  // normalize to 1 decimal place (supports inputs like 1, 1.2, 1.23)
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function fmt1(n: number) {
  const v = round1(n);
  return v.toFixed(1);
}

function clampNonNeg(n: number) {
  return n < 0 ? 0 : n;
}

export default function App() {
  const [view, setView] = useState<View>("onhand");
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ fontFamily: "system-ui", padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ color: "#E31837", margin: "8px 0 16px" }}>Inventory</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <NavButton active={view === "onhand"} onClick={() => setView("onhand")}>
          On‑Hand
        </NavButton>
        <NavButton active={view === "reorder"} onClick={() => setView("reorder")}>
          Reorder
        </NavButton>
        <NavButton active={view === "settings"} onClick={() => setView("settings")}>
          Settings
        </NavButton>
      </div>

      {error && (
        <div style={{ background: "#fee2e2", border: "1px solid #fecaca", padding: 12, borderRadius: 10, marginBottom: 12 }}>
          <b>Something went wrong:</b> {error}
          <div style={{ marginTop: 8 }}>
            <button onClick={() => setError(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {view === "onhand" && <OnHand onError={setError} />}
      {view === "reorder" && <Reorder onError={setError} />}
      {view === "settings" && <Settings onError={setError} />}
    </div>
  );
}

function NavButton(props: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        padding: "8px 12px",
        borderRadius: 999,
        border: props.active ? "1px solid #111827" : "1px solid #d1d5db",
        background: props.active ? "#111827" : "#ffffff",
        color: props.active ? "#ffffff" : "#111827",
        cursor: "pointer",
      }}
    >
      {props.children}
    </button>
  );
}

function Card(props: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, boxShadow: "0 1px 2px rgba(0,0,0,0.05)", marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{props.title}</h2>
        {props.right}
      </div>
      {props.children}
    </div>
  );
}

function OnHand({ onError }: { onError: (m: string) => void }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locationId, setLocationId] = useState<number | "">("");
  const [qtyByProductId, setQtyByProductId] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  async function load() {
    try {
      const [locs, prods] = await Promise.all([Api.listLocations(), Api.listProducts()]);
      setLocations(locs);
      setProducts(prods);

      const defaultLoc = locs[0]?.id ?? "";
      setLocationId((cur) => (cur === "" ? defaultLoc : cur));
    } catch (e: any) {
      onError(e?.message || "Failed to load On‑Hand view");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    async function loadOnHand() {
      if (locationId === "") return;
      try {
        const rows = await Api.listOnHandByLocation(locationId);
        const map: Record<number, string> = {};
        for (const p of products) map[p.id] = "0.0";
        for (const r of rows) map[r.product_id] = fmt1(r.qty);
        setQtyByProductId(map);
      } catch (e: any) {
        onError(e?.message || "Failed to load on‑hand quantities");
      }
    }
    void loadOnHand();
  }, [locationId, products]);

  const location = useMemo(() => locations.find((l) => l.id === locationId) ?? null, [locations, locationId]);

  async function save(product_id: number) {
    if (locationId === "") return;
    setSavingId(product_id);
    try {
      const raw = qtyByProductId[product_id] ?? "0";
      const num = round1(Number(raw));
      await Api.upsertOnHand({ product_id, location_id: locationId, qty: clampNonNeg(num) });
      setQtyByProductId((m) => ({ ...m, [product_id]: fmt1(clampNonNeg(num)) }));
    } catch (e: any) {
      onError(e?.message || "Failed to save on‑hand");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card
      title="On‑Hand by Location"
      right={
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "#374151" }}>Location</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : "")}
            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #d1d5db" }}
          >
            {locations.length === 0 && <option value="">No locations yet</option>}
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {locations.length === 0 ? (
        <div>
          Add a location first in <b>Settings → Locations</b>.
        </div>
      ) : products.length === 0 ? (
        <div>
          Add products in <b>Settings → Products</b>.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
            Enter quantities with <b>one decimal place</b> (example: 12.3). Total ordering is decided on the Reorder tab using <b>global PAR</b> vs total on‑hand across all locations.
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={th}>SKU</th>
                  <th style={th}>Product</th>
                  <th style={th}>Material Type</th>
                  <th style={th}>PAR (global)</th>
                  <th style={th}>On‑Hand @ {location?.name ?? "—"}</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td style={td}>{p.sku}</td>
                    <td style={td}>{p.name}</td>
                    <td style={td}>{p.material_type_name ?? "—"}</td>
                    <td style={td}>{fmt1(p.par)}</td>
                    <td style={td}>
                      <input
                        value={qtyByProductId[p.id] ?? "0.0"}
                        inputMode="decimal"
                        type="number"
                        step={0.1}
                        min={0}
                        onChange={(e) => setQtyByProductId((m) => ({ ...m, [p.id]: e.target.value }))}
                        onBlur={() => void save(p.id)}
                        style={{ width: 110, padding: "6px 10px", borderRadius: 10, border: "1px solid #d1d5db" }}
                      />
                    </td>
                    <td style={td}>
                      <button onClick={() => void save(p.id)} disabled={savingId === p.id} style={smallBtn}>
                        {savingId === p.id ? "Saving…" : "Save"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function Reorder({ onError }: { onError: (m: string) => void }) {
  const [rows, setRows] = useState<ReorderRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await Api.reorder();
      // show items to order first, but keep everything visible
      data.sort((a, b) => b.to_order - a.to_order);
      setRows(data);
    } catch (e: any) {
      onError(e?.message || "Failed to load reorder list");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const totalToOrder = useMemo(() => rows.reduce((sum, r) => sum + r.to_order, 0), [rows]);

  return (
    <Card
      title="Reorder List"
      right={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#374151" }}>
            Total to order: <b>{fmt1(totalToOrder)}</b>
          </div>
          <button onClick={() => void load()} disabled={loading} style={smallBtn}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      }
    >
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
        Reorder is calculated as <b>max(PAR − total on‑hand across all locations, 0)</b>.
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={th}>SKU</th>
              <th style={th}>Product</th>
              <th style={th}>Material Type</th>
              <th style={th}>PAR</th>
              <th style={th}>Total On‑Hand</th>
              <th style={th}>To Order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.product_id}>
                <td style={td}>{r.sku}</td>
                <td style={td}>{r.name}</td>
                <td style={td}>{r.material_type_name ?? "—"}</td>
                <td style={td}>{fmt1(r.par)}</td>
                <td style={td}>{fmt1(r.total_on_hand)}</td>
                <td style={{ ...td, fontWeight: r.to_order > 0 ? 700 : 400 }}>{fmt1(r.to_order)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td style={td} colSpan={6}>
                  No products yet. Add products in Settings → Products.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Settings({ onError }: { onError: (m: string) => void }) {
  const [tab, setTab] = useState<SettingsTab>("products");

  return (
    <Card
      title="Settings"
      right={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <NavButton active={tab === "products"} onClick={() => setTab("products")}>
            Products
          </NavButton>
          <NavButton active={tab === "locations"} onClick={() => setTab("locations")}>
            Locations
          </NavButton>
          <NavButton active={tab === "materialTypes"} onClick={() => setTab("materialTypes")}>
            Material Types
          </NavButton>
        </div>
      }
    >
      {tab === "products" && <ProductsSettings onError={onError} />}
      {tab === "locations" && <LocationsSettings onError={onError} />}
      {tab === "materialTypes" && <MaterialTypesSettings onError={onError} />}
    </Card>
  );
}

function LocationsSettings({ onError }: { onError: (m: string) => void }) {
  const [items, setItems] = useState<Location[]>([]);
  const [name, setName] = useState("");

  async function load() {
    try {
      setItems(await Api.listLocations());
    } catch (e: any) {
      onError(e?.message || "Failed to load locations");
    }
  }
  useEffect(() => void load(), []);

  async function add() {
    const n = name.trim();
    if (!n) return;
    try {
      await Api.createLocation(n);
      setName("");
      await load();
    } catch (e: any) {
      onError(e?.message || "Failed to add location");
    }
  }

  async function del(id: number) {
    if (!confirm("Delete this location? On‑hand entries for this location will also be removed.")) return;
    try {
      await Api.deleteLocation(id);
      await load();
    } catch (e: any) {
      onError(e?.message || "Failed to delete location");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New location name" style={input} />
        <button onClick={() => void add()} style={smallBtn}>
          Add
        </button>
      </div>

      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((l) => (
          <li key={l.id} style={{ marginBottom: 6 }}>
            {l.name}{" "}
            <button onClick={() => void del(l.id)} style={linkBtn}>
              Delete
            </button>
          </li>
        ))}
        {items.length === 0 && <li>No locations yet.</li>}
      </ul>
    </div>
  );
}

function MaterialTypesSettings({ onError }: { onError: (m: string) => void }) {
  const [items, setItems] = useState<MaterialType[]>([]);
  const [name, setName] = useState("");

  async function load() {
    try {
      setItems(await Api.listMaterialTypes());
    } catch (e: any) {
      onError(e?.message || "Failed to load material types");
    }
  }
  useEffect(() => void load(), []);

  async function add() {
    const n = name.trim();
    if (!n) return;
    try {
      await Api.createMaterialType(n);
      setName("");
      await load();
    } catch (e: any) {
      onError(e?.message || "Failed to add material type");
    }
  }

  async function del(id: number) {
    if (!confirm("Delete this material type? Products using it will be set to blank.")) return;
    try {
      await Api.deleteMaterialType(id);
      await load();
    } catch (e: any) {
      onError(e?.message || "Failed to delete material type");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New material type" style={input} />
        <button onClick={() => void add()} style={smallBtn}>
          Add
        </button>
      </div>

      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((m) => (
          <li key={m.id} style={{ marginBottom: 6 }}>
            {m.name}{" "}
            <button onClick={() => void del(m.id)} style={linkBtn}>
              Delete
            </button>
          </li>
        ))}
        {items.length === 0 && <li>No material types yet.</li>}
      </ul>
    </div>
  );
}

function ProductsSettings({ onError }: { onError: (m: string) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [draft, setDraft] = useState<Omit<Product, "id">>({
    name: "",
    sku: "",
    material_type_id: null,
    par: 0,
  });

  async function load() {
    try {
      const [prods, mts] = await Promise.all([Api.listProducts(), Api.listMaterialTypes()]);
      setProducts(prods);
      setMaterialTypes(mts);
    } catch (e: any) {
      onError(e?.message || "Failed to load products");
    }
  }
  useEffect(() => void load(), []);

  async function add() {
    const name = draft.name.trim();
    const sku = draft.sku.trim();
    if (!name || !sku) {
      onError("Product requires both a name and SKU.");
      return;
    }

    try {
      await Api.createProduct({
        ...draft,
        name,
        sku,
        par: clampNonNeg(round1(Number(draft.par))),
      });
      setDraft({ name: "", sku: "", material_type_id: null, par: 0 });
      await load();
    } catch (e: any) {
      onError(e?.message || "Failed to add product");
    }
  }

  async function update(p: Product, patch: Partial<Omit<Product, "id">>) {
    try {
      const next = {
        name: patch.name ?? p.name,
        sku: patch.sku ?? p.sku,
        material_type_id: patch.material_type_id ?? p.material_type_id ?? null,
        par: clampNonNeg(round1(Number(patch.par ?? p.par))),
      };
      await Api.updateProduct(p.id, next);
      await load();
    } catch (e: any) {
      onError(e?.message || "Failed to update product");
    }
  }

  async function del(id: number) {
    if (!confirm("Delete this product? This will remove its on‑hand entries too.")) return;
    try {
      await Api.deleteProduct(id);
      await load();
    } catch (e: any) {
      onError(e?.message || "Failed to delete product");
    }
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr 1fr auto", gap: 8, alignItems: "end", marginBottom: 12 }}>
        <div>
          <label style={label}>Product name</label>
          <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} style={input} />
        </div>

        <div>
          <label style={label}>SKU</label>
          <input value={draft.sku} onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))} style={input} />
        </div>

        <div>
          <label style={label}>Material type</label>
          <select
            value={draft.material_type_id ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, material_type_id: e.target.value ? Number(e.target.value) : null }))}
            style={input}
          >
            <option value="">—</option>
            {materialTypes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={label}>PAR (global)</label>
          <input
            value={String(draft.par)}
            type="number"
            step={0.1}
            min={0}
            inputMode="decimal"
            onChange={(e) => setDraft((d) => ({ ...d, par: Number(e.target.value) }))}
            style={input}
          />
        </div>

        <button onClick={() => void add()} style={smallBtn}>
          Add
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th style={th}>SKU</th>
              <th style={th}>Product</th>
              <th style={th}>Material Type</th>
              <th style={th}>PAR</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td style={td}>
                  <input value={p.sku} onChange={(e) => void update(p, { sku: e.target.value })} style={cellInput} />
                </td>
                <td style={td}>
                  <input value={p.name} onChange={(e) => void update(p, { name: e.target.value })} style={cellInput} />
                </td>
                <td style={td}>
                  <select
                    value={p.material_type_id ?? ""}
                    onChange={(e) => void update(p, { material_type_id: e.target.value ? Number(e.target.value) : null })}
                    style={cellInput}
                  >
                    <option value="">—</option>
                    {materialTypes.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={td}>
                  <input
                    value={fmt1(p.par)}
                    type="number"
                    step={0.1}
                    min={0}
                    inputMode="decimal"
                    onChange={(e) => void update(p, { par: Number(e.target.value) })}
                    style={cellInput}
                  />
                </td>
                <td style={td}>
                  <button onClick={() => void del(p.id)} style={linkBtn}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td style={td} colSpan={5}>
                  No products yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { borderBottom: "1px solid #e5e7eb", padding: "10px 8px", fontSize: 12, color: "#374151" };
const td: React.CSSProperties = { borderBottom: "1px solid #f3f4f6", padding: "10px 8px", verticalAlign: "top" };
const input: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid #d1d5db" };
const cellInput: React.CSSProperties = { width: "100%", padding: "6px 10px", borderRadius: 10, border: "1px solid #d1d5db" };
const smallBtn: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #111827", background: "#111827", color: "#fff", cursor: "pointer" };
const linkBtn: React.CSSProperties = { background: "transparent", border: "none", color: "#E31837", cursor: "pointer", padding: 0 };
const label: React.CSSProperties = { display: "block", fontSize: 12, color: "#374151", marginBottom: 4 };
