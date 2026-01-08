import React, { useEffect, useMemo, useState } from "react";
import { Api, Location, MaterialType, Product, ReorderRow } from "./api";

type View = "onhand" | "reorder" | "settings";
type SettingsTab = "products" | "locations" | "materialTypes";

function round1(n: number) {
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
    <div className="appShell">
      <style>{styles}</style>

      <div className="appHeader">
        <h1 className="appTitle">Inventory</h1>

        {/* Desktop top nav */}
        <div className="desktopOnly topNav">
          <TopNavButton active={view === "onhand"} onClick={() => setView("onhand")}>
            On‑Hand
          </TopNavButton>
          <TopNavButton active={view === "reorder"} onClick={() => setView("reorder")}>
            Reorder
          </TopNavButton>
          <TopNavButton active={view === "settings"} onClick={() => setView("settings")}>
            Settings
          </TopNavButton>
        </div>
      </div>

      {error && (
        <div className="errorBox">
          <b>Something went wrong:</b> {error}
          <div style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="appBody">
        {view === "onhand" && <OnHand onError={setError} />}
        {view === "reorder" && <Reorder onError={setError} />}
        {view === "settings" && <Settings onError={setError} />}
      </div>

      {/* Mobile bottom nav */}
      <div className="mobileOnly bottomNav" role="navigation" aria-label="Primary">
        <BottomNavButton active={view === "onhand"} color="blue" onClick={() => setView("onhand")}>
          On‑Hand
        </BottomNavButton>
        <BottomNavButton active={view === "reorder"} color="amber" onClick={() => setView("reorder")}>
          Reorder
        </BottomNavButton>
        <BottomNavButton active={view === "settings"} color="slate" onClick={() => setView("settings")}>
          Settings
        </BottomNavButton>
      </div>
    </div>
  );
}

function TopNavButton(props: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={props.active ? "topNavBtn topNavBtnActive" : "topNavBtn"}
      type="button"
    >
      {props.children}
    </button>
  );
}

function BottomNavButton(props: {
  active?: boolean;
  color: "blue" | "amber" | "slate";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`bottomNavBtn ${props.color} ${props.active ? "active" : ""}`}
    >
      {props.children}
    </button>
  );
}

function Card(props: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="cardHeader">
        <h2 className="cardTitle">{props.title}</h2>
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
      title="On‑Hand"
      right={
        <div className="row" style={{ gap: 8 }}>
          <label className="label">Location</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : "")}
            className="select"
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
          <div className="hint">
            Enter quantities with <b>one decimal place</b> (example: 12.3). Totals are summed across locations on the Reorder tab.
          </div>

          {/* Desktop table */}
          <div className="desktopOnly">
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="th">SKU</th>
                    <th className="th">Product</th>
                    <th className="th">Material Type</th>
                    <th className="th">PAR (global)</th>
                    <th className="th">On‑Hand @ {location?.name ?? "—"}</th>
                    <th className="th"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td className="td">{p.sku}</td>
                      <td className="td">{p.name}</td>
                      <td className="td">{p.material_type_name ?? "—"}</td>
                      <td className="td">{fmt1(p.par)}</td>
                      <td className="td">
                        <input
                          value={qtyByProductId[p.id] ?? "0.0"}
                          inputMode="decimal"
                          type="number"
                          step={0.1}
                          min={0}
                          onChange={(e) => setQtyByProductId((m) => ({ ...m, [p.id]: e.target.value }))}
                          onBlur={() => void save(p.id)}
                          className="qtyInput"
                        />
                      </td>
                      <td className="td">
                        <button onClick={() => void save(p.id)} disabled={savingId === p.id} className="btn">
                          {savingId === p.id ? "Saving…" : "Save"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile compact row table (no horizontal scroll) */}
          <div className="mobileOnly">
            <div className="mobileRowHeader">
              <div>Item</div>
              <div style={{ textAlign: "right" }}>On‑Hand</div>
            </div>
            <div className="mobileRows">
              {products.map((p) => (
                <div key={p.id} className="mobileRow">
                  <div className="mobileRowLeft">
                    <div className="mobileRowTitle">
                      {p.sku} — {p.name}
                    </div>
                    <div className="mobileRowMeta">
                      <span>{p.material_type_name ?? "—"}</span>
                      <span className="dot">•</span>
                      <span>PAR {fmt1(p.par)}</span>
                    </div>
                  </div>
                  <div className="mobileRowRight">
                    <input
                      value={qtyByProductId[p.id] ?? "0.0"}
                      inputMode="decimal"
                      type="number"
                      step={0.1}
                      min={0}
                      onChange={(e) => setQtyByProductId((m) => ({ ...m, [p.id]: e.target.value }))}
                      onBlur={() => void save(p.id)}
                      className="qtyInputMobile"
                      aria-label={`On-hand for ${p.sku}`}
                    />
                    <button
                      onClick={() => void save(p.id)}
                      disabled={savingId === p.id}
                      className={savingId === p.id ? "btnSmall disabled" : "btnSmall"}
                      type="button"
                    >
                      {savingId === p.id ? "…" : "Save"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
      // API already filters to_order > 0, but keep a defensive filter.
      const filtered = data.filter((r) => r.to_order > 0);
      setRows(filtered);
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

  const groups = useMemo(() => {
    const m = new Map<string, ReorderRow[]>();
    for (const r of rows) {
      const key = (r.material_type_name ?? "Uncategorized").trim() || "Uncategorized";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    // ensure stable order
    const entries = Array.from(m.entries()).sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()));
    for (const [, list] of entries) list.sort((a, b) => b.to_order - a.to_order);
    return entries;
  }, [rows]);

  return (
    <Card
      title="Reorder"
      right={
        <div className="row" style={{ gap: 10 }}>
          <div className="label">
            Total: <b>{fmt1(totalToOrder)}</b>
          </div>
          <button onClick={() => void load()} disabled={loading} className="btn" type="button">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      }
    >
      <div className="hint">Only items that need ordering are shown, grouped by material category.</div>

      {rows.length === 0 ? (
        <div style={{ padding: 6 }}>
          Nothing to order right now. (Tip: set PAR in Settings → Products, then update on‑hand.)
        </div>
      ) : (
        <div className="groupStack">
          {groups.map(([groupName, list]) => (
            <div key={groupName} className="groupBlock">
              <div className="groupHeader">{groupName}</div>

              {/* Desktop grouped table */}
              <div className="desktopOnly tableWrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">SKU</th>
                      <th className="th">Product</th>
                      <th className="th">PAR</th>
                      <th className="th">Total On‑Hand</th>
                      <th className="th">To Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.product_id}>
                        <td className="td">{r.sku}</td>
                        <td className="td">{r.name}</td>
                        <td className="td">{fmt1(r.par)}</td>
                        <td className="td">{fmt1(r.total_on_hand)}</td>
                        <td className="td strong">{fmt1(r.to_order)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile compact list */}
              <div className="mobileOnly">
                <div className="mobileReorderList">
                  {list.map((r) => (
                    <div key={r.product_id} className="mobileReorderRow">
                      <div className="mobileRowLeft">
                        <div className="mobileRowTitle">
                          {r.sku} — {r.name}
                        </div>
                        <div className="mobileRowMeta">
                          <span>On‑Hand {fmt1(r.total_on_hand)}</span>
                          <span className="dot">•</span>
                          <span>PAR {fmt1(r.par)}</span>
                        </div>
                      </div>
                      <div className="mobileOrderPill">{fmt1(r.to_order)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Settings({ onError }: { onError: (m: string) => void }) {
  const [tab, setTab] = useState<SettingsTab>("products");

  return (
    <Card
      title="Settings"
      right={
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <TopNavButton active={tab === "products"} onClick={() => setTab("products")}>
            Products
          </TopNavButton>
          <TopNavButton active={tab === "locations"} onClick={() => setTab("locations")}>
            Locations
          </TopNavButton>
          <TopNavButton active={tab === "materialTypes"} onClick={() => setTab("materialTypes")}>
            Material Types
          </TopNavButton>
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
      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New location name" className="input" />
        <button onClick={() => void add()} className="btn" type="button">
          Add
        </button>
      </div>

      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((l) => (
          <li key={l.id} style={{ marginBottom: 6 }}>
            {l.name}{" "}
            <button onClick={() => void del(l.id)} className="linkBtn" type="button">
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
    if (!confirm("Delete this material type? Products using it will become Uncategorized.")) return;
    try {
      await Api.deleteMaterialType(id);
      await load();
    } catch (e: any) {
      onError(e?.message || "Failed to delete material type");
    }
  }

  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New material type" className="input" />
        <button onClick={() => void add()} className="btn" type="button">
          Add
        </button>
      </div>

      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((mt) => (
          <li key={mt.id} style={{ marginBottom: 6 }}>
            {mt.name}{" "}
            <button onClick={() => void del(mt.id)} className="linkBtn" type="button">
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

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [material_type_id, setMaterialTypeId] = useState<number | "">("");
  const [par, setPar] = useState("0.0");

  const [editing, setEditing] = useState<Product | null>(null);

  async function load() {
    try {
      const [prods, mts] = await Promise.all([Api.listProducts(), Api.listMaterialTypes()]);
      setProducts(prods);
      setMaterialTypes(mts);
    } catch (e: any) {
      onError(e?.message || "Failed to load products");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function resetForm() {
    setName("");
    setSku("");
    setMaterialTypeId("");
    setPar("0.0");
    setEditing(null);
  }

  async function submit() {
    const n = name.trim();
    const s = sku.trim();
    const p = Math.max(0, round1(Number(par)));
    const mtId = material_type_id === "" ? null : material_type_id;

    if (!n || !s) return;

    try {
      if (editing) {
        await Api.updateProduct(editing.id, { name: n, sku: s, material_type_id: mtId, par: p });
      } else {
        await Api.createProduct({ name: n, sku: s, material_type_id: mtId, par: p });
      }
      resetForm();
      await load();
    } catch (e: any) {
      onError(e?.message || "Failed to save product");
    }
  }

  async function del(id: number) {
    if (!confirm("Delete this product? Its on‑hand entries will also be removed.")) return;
    try {
      await Api.deleteProduct(id);
      await load();
    } catch (e: any) {
      onError(e?.message || "Failed to delete product");
    }
  }

  function startEdit(p: Product) {
    setEditing(p);
    setName(p.name);
    setSku(p.sku);
    setMaterialTypeId(p.material_type_id ?? "");
    setPar(fmt1(p.par));
  }

  return (
    <div>
      <div className="hint">Products carry a <b>global PAR</b>. On‑hand is tracked per location.</div>

      <div className="formGrid">
        <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" className="input" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" className="input" />
        <select
          value={material_type_id}
          onChange={(e) => setMaterialTypeId(e.target.value ? Number(e.target.value) : "")}
          className="select"
        >
          <option value="">Uncategorized</option>
          {materialTypes.map((mt) => (
            <option key={mt.id} value={mt.id}>
              {mt.name}
            </option>
          ))}
        </select>
        <input
          value={par}
          onChange={(e) => setPar(e.target.value)}
          placeholder="PAR"
          inputMode="decimal"
          type="number"
          step={0.1}
          min={0}
          className="input"
        />

        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => void submit()} className="btn" type="button">
            {editing ? "Update" : "Add"}
          </button>
          {editing && (
            <button onClick={() => resetForm()} className="btnSecondary" type="button">
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="tableWrap" style={{ marginTop: 14 }}>
        <table className="table">
          <thead>
            <tr>
              <th className="th">SKU</th>
              <th className="th">Product</th>
              <th className="th">Material Type</th>
              <th className="th">PAR</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td className="td">{p.sku}</td>
                <td className="td">{p.name}</td>
                <td className="td">{p.material_type_name ?? "—"}</td>
                <td className="td">{fmt1(p.par)}</td>
                <td className="td">
                  <div className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button onClick={() => startEdit(p)} className="btn" type="button">
                      Edit
                    </button>
                    <button onClick={() => void del(p.id)} className="btnDanger" type="button">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td className="td" colSpan={5}>
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

const styles = `
  :root {
    --red: #E31837;
    --border: #e5e7eb;
    --text: #111827;
    --muted: #6b7280;
    --bg: #ffffff;
  }

  * { box-sizing: border-box; }

  .appShell {
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
    padding: 14px;
    max-width: 1100px;
    margin: 0 auto;
    padding-bottom: 90px; /* space for mobile bottom nav */
  }

  .appHeader {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    margin: 6px 0 10px;
  }

  .appTitle {
    margin: 0;
    color: var(--red);
    font-size: 26px;
    letter-spacing: -0.2px;
  }

  .topNav { display: flex; gap: 8px; flex-wrap: wrap; }

  .topNavBtn {
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    color: var(--text);
    cursor: pointer;
  }

  .topNavBtnActive {
    border: 1px solid #111827;
    background: #111827;
    color: #ffffff;
  }

  .errorBox {
    background: #fee2e2;
    border: 1px solid #fecaca;
    padding: 12px;
    border-radius: 12px;
    margin: 10px 0 12px;
  }

  .appBody { margin-top: 8px; }

  .card {
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 14px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    margin-bottom: 14px;
    background: var(--bg);
  }

  .cardHeader {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .cardTitle { margin: 0; font-size: 18px; }

  .row { display: flex; align-items: center; }
  .label { font-size: 12px; color: #374151; }
  .hint { font-size: 12px; color: var(--muted); margin-bottom: 10px; }

  .input, .select {
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid #d1d5db;
    min-width: 180px;
    font-size: 14px;
  }

  .select { background: #ffffff; }

  .btn {
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid #111827;
    background: #111827;
    color: #ffffff;
    cursor: pointer;
  }

  .btnSecondary {
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    color: #111827;
    cursor: pointer;
  }

  .btnDanger {
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid #ef4444;
    background: #ef4444;
    color: #ffffff;
    cursor: pointer;
  }

  .btnSmall {
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid #111827;
    background: #111827;
    color: #ffffff;
    cursor: pointer;
    font-size: 12px;
    min-width: 56px;
  }

  .btnSmall.disabled { opacity: 0.6; }

  .linkBtn {
    border: none;
    background: transparent;
    color: #ef4444;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    font-size: 12px;
  }

  .tableWrap { overflow: hidden; border: 1px solid var(--border); border-radius: 14px; }

  .table {
    width: 100%;
    border-collapse: collapse;
  }

  .th {
    text-align: left;
    font-size: 12px;
    color: #374151;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    background: #f9fafb;
    white-space: nowrap;
  }

  .td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
    font-size: 14px;
  }

  .td.strong { font-weight: 800; }

  .qtyInput {
    width: 130px;
    padding: 8px 10px;
    border-radius: 12px;
    border: 1px solid #d1d5db;
    font-size: 14px;
  }

  .formGrid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    align-items: end;
  }

  .groupStack { display: grid; gap: 12px; }

  .groupBlock { border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
  .groupHeader { padding: 10px 12px; font-weight: 800; background: #111827; color: #ffffff; }

  /* Mobile reorder */
  .mobileReorderList { display: grid; gap: 8px; padding: 10px; }
  .mobileReorderRow {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 10px 10px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: #ffffff;
  }

  .mobileRowLeft { min-width: 0; }

  .mobileRowTitle {
    font-weight: 700;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 62vw;
  }

  .mobileRowMeta {
    font-size: 12px;
    color: var(--muted);
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .dot { opacity: 0.6; }

  .mobileOrderPill {
    font-weight: 900;
    font-size: 16px;
    padding: 10px 12px;
    border-radius: 999px;
    background: #fef3c7;
    border: 1px solid #f59e0b;
    min-width: 72px;
    text-align: center;
  }

  /* Mobile on-hand */
  .mobileRowHeader {
    display: grid;
    grid-template-columns: 1fr 140px;
    gap: 10px;
    padding: 10px 8px;
    color: #374151;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
  }

  .mobileRows { display: grid; }

  .mobileRow {
    display: grid;
    grid-template-columns: 1fr 140px;
    gap: 10px;
    padding: 12px 8px;
    border-bottom: 1px solid var(--border);
  }

  .mobileRowRight {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    align-items: center;
    justify-content: end;
  }

  .qtyInputMobile {
    width: 100%;
    padding: 10px 10px;
    border-radius: 12px;
    border: 1px solid #d1d5db;
    font-size: 16px;
    text-align: right;
  }

  /* Mobile bottom nav */
  .bottomNav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    padding: 10px 12px;
    background: rgba(255,255,255,0.92);
    backdrop-filter: blur(10px);
    border-top: 1px solid var(--border);
  }

  .bottomNavBtn {
    padding: 12px 10px;
    border-radius: 14px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    font-weight: 800;
    cursor: pointer;
  }

  .bottomNavBtn.blue { background: #eff6ff; border-color: #93c5fd; }
  .bottomNavBtn.amber { background: #fffbeb; border-color: #fbbf24; }
  .bottomNavBtn.slate { background: #f8fafc; border-color: #cbd5e1; }

  .bottomNavBtn.active { outline: 3px solid rgba(17,24,39,0.18); }

  /* Responsive helpers */
  .desktopOnly { display: block; }
  .mobileOnly { display: none; }

  @media (max-width: 720px) {
    .desktopOnly { display: none; }
    .mobileOnly { display: block; }

    .appShell { padding: 12px; padding-bottom: 92px; }
    .appTitle { font-size: 22px; }

    .input, .select { min-width: 0; width: 100%; }

    .formGrid {
      grid-template-columns: 1fr;
    }

    .card { padding: 12px; border-radius: 16px; }
  }
`;
