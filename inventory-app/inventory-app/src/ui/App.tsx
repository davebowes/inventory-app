import React, { useEffect, useMemo, useRef, useState } from "react";
import { Api, Location, MaterialType, Vendor, Product, ReorderRow } from "./api";

type View = "onhand" | "reorder" | "settings";
type SettingsTab = "products" | "locations" | "materialTypes" | "vendors" | "import";

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
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [materialTypeId, setMaterialTypeId] = useState<number | "all">("all");
  const [products, setProducts] = useState<Product[]>([]);
  const [locationId, setLocationId] = useState<number | "">("");
  const [qtyByProductId, setQtyByProductId] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  async function load() {
    try {
      const [locs, prods, vends, mats] = await Promise.all([Api.listLocations(), Api.listProducts(), Api.listVendors(), Api.listMaterialTypes()]);
      setLocations(locs);
      setVendors(vends);
      setMaterialTypes([...mats].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
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
        for (const p of products) {
          if (p.location_ids?.includes(Number(locationId))) map[p.id] = "0.0";
        }
        for (const r of rows) map[r.product_id] = fmt1(r.qty);
        setQtyByProductId(map);
      } catch (e: any) {
        onError(e?.message || "Failed to load on‑hand quantities");
      }
    }
    void loadOnHand();
  }, [locationId, products]);

  const location = useMemo(() => locations.find((l) => l.id === locationId) ?? null, [locations, locationId]);

  const visibleProducts = useMemo(() => {
    if (locationId === "") return [] as Product[];
    const lid = Number(locationId);
    return products.filter((p) => {
      if (!(p.location_ids ?? []).includes(lid)) return false;
      if (materialTypeId === "all") return true;
      return (p.material_type_id ?? -1) === materialTypeId;
    });
  }, [products, locationId, materialTypeId]);

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
    <Card title="On‑Hand">
      <div className="stickyBar onhandSticky noPrint">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
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

          <label className="label">Materials</label>
          <select
            value={materialTypeId === "all" ? "all" : String(materialTypeId)}
            onChange={(e) => setMaterialTypeId(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="select"
          >
            <option value="all">All</option>
            {materialTypes.map((mt) => (
              <option key={mt.id} value={mt.id}>
                {mt.name}
              </option>
            ))}
          </select>
        </div>

        <button
          className="btn danger"
          disabled={clearing}
          onClick={() => {
            if (!confirm("Clear ALL on-hands for a new inventory? This cannot be undone.")) return;
            void (async () => {
              try {
                setClearing(true);
                await Api.clearOnHand();
                // Reset current location view to zeros
                const map: Record<number, string> = {};
                for (const p of products) {
                  if (p.location_ids?.includes(Number(locationId))) map[p.id] = "0.0";
                }
                setQtyByProductId(map);
              } catch (e: any) {
                onError(e?.message || "Failed to clear on-hands");
              } finally {
                setClearing(false);
              }
            })();
          }}
          type="button"
        >
          {clearing ? "Clearing…" : "Clear all on‑hands"}
        </button>
      </div>
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

          {visibleProducts.length === 0 ? (
            <div className="hint" style={{ marginTop: 8 }}>
              No items are assigned to <b>{location?.name ?? "this location"}</b>. Assign products to this location in <b>Settings → Products</b>.
            </div>
          ) : (
            <>

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
                  {visibleProducts.map((p) => (
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
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => setQtyByProductId((m) => ({ ...m, [p.id]: e.target.value }))}
                          onBlur={() => void save(p.id)}
                          className="qtyInput"
                        />
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
              {visibleProducts.map((p) => (
              <div key={p.id} className="mobileRow">
                <div className="mobileRowLeft">
                  <div className="mobileRowTitle">{p.name}</div>
                  <div className="mobileRowSub">{p.sku}</div>
                </div>
                <div className="mobileRowRight">
                  <div className="qtyStepper">
                    <button
                      type="button"
                      className="stepBtn"
                      aria-label="Decrease"
                      onClick={() => {
                        setQtyByProductId((m) => {
                          const cur = Number(m[p.id] ?? "0");
                          const next = fmt1(clampNonNeg(round1((Number.isFinite(cur) ? cur : 0) - 1)));
                          return { ...m, [p.id]: next };
                        });
                        void save(p.id);
                      }}
                    >
                      −
                    </button>
                    <input
                      value={qtyByProductId[p.id] ?? "0.0"}
                      inputMode="decimal"
                      type="number"
                      step={0.1}
                      min={0}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setQtyByProductId((m) => ({ ...m, [p.id]: e.target.value }))}
                      onBlur={() => void save(p.id)}
                      className="qtyInputMobileBig"
                    />
                    <button
                      type="button"
                      className="stepBtn"
                      aria-label="Increase"
                      onClick={() => {
                        setQtyByProductId((m) => {
                          const cur = Number(m[p.id] ?? "0");
                          const next = fmt1(round1((Number.isFinite(cur) ? cur : 0) + 1));
                          return { ...m, [p.id]: next };
                        });
                        void save(p.id);
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>

            </>
          )}
        </>
      )}
    </Card>
  );
}

function Reorder({ onError }: { onError: (m: string) => void }) {
  const [rows, setRows] = useState<ReorderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [collapsedVendors, setCollapsedVendors] = useState<Record<string, boolean>>({});
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const [vendorStickyTop, setVendorStickyTop] = useState(66);

  type VendorGroup = { vendor: string; materials: Array<{ name: string; rows: ReorderRow[] }> };

  async function load() {
    setLoading(true);
    try {
      const data = await Api.reorder();
      // API already filters to_order > 0, but keep a defensive filter.
      setRows(data.filter((r) => r.to_order > 0));
    } catch (e: any) {
      onError(e?.message || "Failed to load reorder list");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return;

    const update = () => {
      const h = el.getBoundingClientRect().height;
      setVendorStickyTop(Math.round(h) + 12);
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);


  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const vendor = (r.vendor_name ?? "").toLowerCase();
      const mt = (r.material_type_name ?? "").toLowerCase();
      const sku = (r.sku ?? "").toLowerCase();
      const name = (r.name ?? "").toLowerCase();
      return vendor.includes(q) || mt.includes(q) || sku.includes(q) || name.includes(q);
    });
  }, [rows, search]);

  const totalToOrder = useMemo(() => filteredRows.reduce((sum, r) => sum + r.to_order, 0), [filteredRows]);

  const groups = useMemo((): VendorGroup[] => {
    const vendorMap = new Map<string, Map<string, ReorderRow[]>>();
    for (const r of filteredRows) {
      const vendor = (r.vendor_name ?? "No Vendor").trim() || "No Vendor";
      const mat = (r.material_type_name ?? "Uncategorized").trim() || "Uncategorized";
      if (!vendorMap.has(vendor)) vendorMap.set(vendor, new Map());
      const matMap = vendorMap.get(vendor)!;
      if (!matMap.has(mat)) matMap.set(mat, []);
      matMap.get(mat)!.push(r);
    }

    const vendorEntries = Array.from(vendorMap.entries()).sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()));
    return vendorEntries.map(([vendor, matMap]) => {
      const materialEntries = Array.from(matMap.entries()).sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()));
      const materials = materialEntries.map(([name, list]) => ({ name, rows: [...list].sort((a, b) => b.to_order - a.to_order) }));
      return { vendor, materials };
    });
  }, [filteredRows]);

  useEffect(() => {
    // Keep collapse state in sync as vendors appear/disappear
    setCollapsedVendors((cur) => {
      const next: Record<string, boolean> = { ...cur };
      const vendors = new Set(groups.map((g) => g.vendor));
      for (const key of Object.keys(next)) {
        if (!vendors.has(key)) delete next[key];
      }
      return next;
    });
  }, [groups]);

  function handlePrint() {
    window.print();
  }

  function buildEmailBody() {
    const now = new Date();
    const lines: string[] = [];
    lines.push(`Inventory order list (${now.toLocaleDateString()})`);
    lines.push("");

    for (const vg of groups) {
      lines.push(vg.vendor);
      for (const mg of vg.materials) {
        lines.push(`  ${mg.name}`);
        for (const r of mg.rows) {
          lines.push(`    - ${r.name} (${r.sku}): ${String(r.to_order)}`);
        }
        lines.push("");
      }
      lines.push("");
    }

    return lines.join("\n").trim();
  }

  function handleEmail() {
    const subject = `Inventory Order – ${new Date().toLocaleDateString()}`;
    const body = buildEmailBody();
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <Card
      title="Reorder"
      right={
        <div className="row" style={{ gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div className="label">
            Total: <b>{fmt1(totalToOrder)}</b>
          </div>
          <button onClick={handlePrint} className="btn" type="button">
            Print
          </button>
          <button onClick={handleEmail} className="btn" type="button">
            Email
          </button>
          <button onClick={() => void load()} disabled={loading} className="btn" type="button">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      }
    >
      <div className="hint">Only items that need ordering are shown, grouped by vendor and material type.</div>

      <div className="stickyBar noPrint" ref={stickyRef}>
        <input
          className="input searchInput"
          placeholder="Search vendor, SKU, product…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btnSecondary"
            onClick={() => setCollapsedVendors(Object.fromEntries(groups.map((g) => [g.vendor, true])))}
            disabled={groups.length === 0}
          >
            Collapse all
          </button>
          <button
            type="button"
            className="btnSecondary"
            onClick={() => setCollapsedVendors({})}
            disabled={groups.length === 0}
          >
            Expand all
          </button>
        </div>
      </div>

      <div className="noPrint">
        {filteredRows.length === 0 ? (
          <div style={{ padding: 6 }}>
            Nothing to order right now. (Tip: set PAR in Settings → Products, then update on‑hand.)
          </div>
        ) : (
          <div className="vendorStack">
            {groups.map((vg) => (
              <div key={vg.vendor} className="vendorBlock">
                <div className="vendorHeader" style={{ top: vendorStickyTop }}>
                  <button
                    type="button"
                    className="vendorHeaderBtn"
                    onClick={() =>
                      setCollapsedVendors((cur) => ({ ...cur, [vg.vendor]: !cur[vg.vendor] }))
                    }
                    aria-expanded={!collapsedVendors[vg.vendor]}
                  >
                    <span className="vendorHeaderName">{vg.vendor}</span>
                    <span className="vendorHeaderMeta">
                      {collapsedVendors[vg.vendor] ? "Show" : "Hide"} ({vg.materials.reduce((n, m) => n + m.rows.length, 0)})
                    </span>
                  </button>
                </div>
                {!collapsedVendors[vg.vendor] && (
                  <div className="groupStack">
                    {vg.materials.map((mg) => (
                      <div key={mg.name} className="groupBlock">
                        <div className="groupHeader">{mg.name}</div>

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
                            {mg.rows.map((r) => (
                              <tr key={r.product_id}>
                                <td className="td">{r.sku}</td>
                                <td className="td">{r.name}</td>
                                <td className="td">{fmt1(r.par)}</td>
                                <td className="td">{fmt1(r.total_on_hand)}</td>
                                <td className="td strong">{String(r.to_order)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile compact list */}
                      <div className="mobileOnly">
                        <div className="mobileReorderList">
                          {mg.rows.map((r) => (
                            <div key={r.product_id} className="mobileReorderRow">
                              <div className="mobileRowLeft">
                                <div className="mobileRowTitle">{r.name}</div>
                                <div className="mobileRowSku">{r.sku}</div>
                              </div>
                              <div className="mobileOrderPill">{String(r.to_order)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="printOnly">
        <h1 style={{ margin: 0, fontSize: 18 }}>Inventory Order List</h1>
        <div style={{ marginTop: 6, fontSize: 12, color: "#111" }}>{new Date().toLocaleDateString()}</div>
        <div style={{ marginTop: 12, display: "grid", gap: 14 }}>
          {groups.map((vg) => (
            <div key={vg.vendor}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>{vg.vendor}</div>
              {vg.materials.map((mg) => (
                <div key={mg.name} style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>{mg.name}</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {mg.rows.map((r) => (
                      <li key={r.product_id}>
                        {r.name} ({r.sku}) — {String(r.to_order)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
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
          <TopNavButton active={tab === "vendors"} onClick={() => setTab("vendors")}>
            Vendors
          </TopNavButton>
          <TopNavButton active={tab === "import"} onClick={() => setTab("import")}>
            Import
          </TopNavButton>
        </div>
      }
    >
      {tab === "import" && <ImportSettings onError={onError} />}
      {tab === "products" && <ProductsSettings onError={onError} />}
      {tab === "locations" && <LocationsSettings onError={onError} />}
      {tab === "vendors" && <VendorsSettings onError={onError} />}
      {tab === "materialTypes" && <MaterialTypesSettings onError={onError} />}

      <div className="settingsCredit">Created by Dave Bowes</div>
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
    <div className="settingsSection">
      <div className="row settingsRow">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Location name"
          className="input"
        />
        <button onClick={() => void add()} className="btn" type="button">
          Add
        </button>
      </div>

      <div className="list">
        {items.map((l) => (
          <div key={l.id} className="listRow">
            <div className="listName">{l.name}</div>
            <button onClick={() => void del(l.id)} className="btnDanger" type="button">
              Delete
            </button>
          </div>
        ))}
        {items.length === 0 && <div className="muted">No locations yet.</div>}
      </div>
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
    <div className="settingsSection">
      <div className="row settingsRow">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Material type name"
          className="input"
        />
        <button onClick={() => void add()} className="btn" type="button">
          Add
        </button>
      </div>

      <div className="list">
        {items.map((mt) => (
          <div key={mt.id} className="listRow">
            <div className="listName">{mt.name}</div>
            <button onClick={() => void del(mt.id)} className="btnDanger" type="button">
              Delete
            </button>
          </div>
        ))}
        {items.length === 0 && <div className="muted">No material types yet.</div>}
      </div>
    </div>
  );
}



function VendorsSettings({ onError }: { onError: (m: string) => void }) {
  const [items, setItems] = useState<Vendor[]>([]);
  const [name, setName] = useState("");

  async function load() {
    try {
      const v = await Api.listVendors();
      setItems([...v].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
    } catch (e: any) {
      onError(e.message || "Failed to load vendors");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add() {
    const n = name.trim();
    if (!n) return;
    try {
      await Api.createVendor(n);
      setName("");
      await load();
    } catch (e: any) {
      onError(e.message || "Failed to create vendor");
    }
  }

  async function del(id: number) {
    if (!confirm("Delete this vendor? Products using it will be set to no vendor.")) return;
    try {
      await Api.deleteVendor(id);
      await load();
    } catch (e: any) {
      onError(e.message || "Failed to delete vendor");
    }
  }

  return (
    <div className="settingsSection">
      <div className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vendor name" className="input" />
        <button className="btn" onClick={add}>Add</button>
      </div>
      <div className="list">
        {items.map((v) => (
          <div key={v.id} className="listRow">
            <div className="listName">{v.name}</div>
            <button className="btnDanger" onClick={() => del(v.id)}>Delete</button>
          </div>
        ))}
        {items.length === 0 && <div className="muted">No vendors yet.</div>}
      </div>
    </div>
  );
}

function ImportSettings({ onError }: { onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [dedupMode, setDedupMode] = useState<"update" | "skip">("update");
  const [preview, setPreview] = useState<any>(null);
  const [lastResult, setLastResult] = useState<any>(null);

  function parseCsv(csv: string): Array<Record<string, string>> {
    const rows: string[][] = [];
    let cur = "";
    let inQuotes = false;
    const row: string[] = [];
    const pushCell = () => {
      row.push(cur);
      cur = "";
    };
    const pushRow = () => {
      // trim trailing empty cells
      while (row.length && row[row.length - 1] === "") row.pop();
      if (row.length) rows.push([...row]);
      row.length = 0;
    };

    for (let i = 0; i < csv.length; i++) {
      const ch = csv[i];
      if (inQuotes) {
        if (ch === '"') {
          const next = csv[i + 1];
          if (next === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        continue;
      }
      if (ch === ",") {
        pushCell();
        continue;
      }
      if (ch === "\n") {
        pushCell();
        pushRow();
        continue;
      }
      if (ch === "\r") continue;
      cur += ch;
    }
    pushCell();
    pushRow();

    if (!rows.length) return [];
    const headersRaw = rows[0].map((h) => (h ?? "").trim());
    const headers = headersRaw.map((h) =>
      h
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^\w]/g, "")
    );

    const out: Array<Record<string, string>> = [];
    for (let r = 1; r < rows.length; r++) {
      const rec: Record<string, string> = {};
      for (let c = 0; c < headers.length; c++) {
        const key = headers[c];
        if (!key) continue;
        rec[key] = (rows[r][c] ?? "").trim();
      }
      // skip empty lines
      if (Object.values(rec).every((v) => !v)) continue;
      out.push(rec);
    }
    return out;
  }

  function mapRow(rec: Record<string, string>) {
    // Accept a few header variants:
    // location: location / loc
    // material_type: material_type / materialtype / category / type
    // sku: sku / item_sku
    // name: name / product / material
    // notes: notes / note
    // par: par / global_par
    // on_hand: on_hand / onhand / qty / quantity
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        if (rec[k] !== undefined && rec[k] !== "") return rec[k];
      }
      return "";
    };

    const location = pick("location", "loc", "location_name");
    const material_type = pick("material_type", "materialtype", "category", "type", "material_category");
    const vendor = pick("vendor", "vendor_name", "supplier", "supplier_name");
    const sku = pick("sku", "item_sku");
    const name = pick("name", "product", "material", "product_name");
    const notes = pick("notes", "note");
    const par = pick("par", "global_par");
    const on_hand = pick("on_hand", "onhand", "qty", "quantity");

    return {
      location: location || undefined,
      material_type: material_type || undefined,
      vendor: vendor || undefined,
      sku,
      name,
      notes: notes || undefined,
      par: par || undefined,
      on_hand: on_hand || undefined,
    };
  }

  function buildRows() {
    const recs = parseCsv(text);
    const rows = recs.map(mapRow);
    const clean = rows
      .map((r) => ({ ...r, sku: (r.sku ?? "").trim().toUpperCase(), name: (r.name ?? "").trim() }))
      .filter((r) => r.sku && r.name);
    const invalid = rows.length - clean.length;
    return { clean, invalid, total: rows.length };
  }

  return (
    <Card
      title="Import CSV"
      right={
        <div className="muted">
          Tip: you can paste CSV below or upload a .csv file.
        </div>
      }
    >
      <div className="stack">
        <div className="muted">
          <div><b>Required columns:</b> sku, name</div>
          <div><b>Optional:</b> material_type, vendor, par, notes, location, on_hand</div>
          <div className="mutedSmall" style={{ marginTop: 6 }}>
            If you include <b>location</b> + <b>on_hand</b>, it will also set on‑hand quantities per location.
            You can include multiple rows for the same SKU across different locations.
          </div>
        </div>

        <div className="rowWrap">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const t = await f.text();
              setText(t);
            }}
          />
          <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <label className="radio">
                <input
                  type="radio"
                  name="dedup"
                  checked={dedupMode === "update"}
                  onChange={() => setDedupMode("update")}
                />
                <span>Update existing by SKU</span>
              </label>
              <label className="radio">
                <input
                  type="radio"
                  name="dedup"
                  checked={dedupMode === "skip"}
                  onChange={() => setDedupMode("skip")}
                />
                <span>Skip duplicates</span>
              </label>
            </div>
            <button
              className="btnSecondary"
              disabled={busy || !text.trim()}
              onClick={() => {
                (async () => {
                  try {
                    setBusy(true);
                    setLastResult(null);
                    const { clean } = buildRows();
                    if (!clean.length) {
                      onError("No valid rows found (need sku + name).");
                      return;
                    }
                    const result = await Api.importPreview(clean as any, dedupMode);
                    setPreview(result);
                  } catch (e: any) {
                    onError(e?.message || "Preview failed");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              {busy ? "Working…" : "Preview"}
            </button>
            <button
              className="btn primary"
              disabled={busy || !text.trim()}
              onClick={() => {
                (async () => {
                  try {
                    setBusy(true);
                    const { clean } = buildRows();
                    if (!clean.length) {
                      onError("No valid rows found (need sku + name).");
                      return;
                    }
                    const result = await Api.importRows(clean as any, dedupMode);
                    setLastResult(result);
                    setPreview(null);
                  } catch (e: any) {
                    onError(e?.message || "Import failed");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              {busy ? "Importing…" : "Import"}
            </button>
          </div>
        </div>

        <textarea
          className="csvBox"
          rows={10}
          placeholder={`sku,name,material_type,par,location,on_hand
SKU-001,1/2 MDF,Sheet Goods,10.5,Warehouse,7.2
SKU-001,1/2 MDF,Sheet Goods,10.5,Shop,2.0`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        {(() => {
          const { invalid, total } = buildRows();
          if (!total) return null;
          return (
            <div className="mutedSmall">
              Parsed {total} row(s). {invalid ? `${invalid} row(s) missing SKU or name will be ignored.` : ""}
            </div>
          );
        })()}

        {preview && (
          <div className="cardSub">
            <b>Preview</b>
            <div className="mutedSmall" style={{ marginTop: 6 }}>
              Mode: <b>{preview.dedup_mode}</b> • Rows received: {preview.rows_received} • Valid rows: {preview.rows_imported}
              <div style={{ marginTop: 6 }}>
                Products: <b>{preview.will_insert_products}</b> new • {preview.will_update_products ? <><b>{preview.will_update_products}</b> will be updated</> : null}
                {preview.will_skip_product_updates ? <><b>{preview.will_skip_product_updates}</b> duplicates will not update</> : null}
              </div>
              <div style={{ marginTop: 6 }}>
                New references to be created automatically: Locations {preview.new_locations.length} • Material Types {preview.new_material_types.length} • Vendors {preview.new_vendors.length}
              </div>
              {(preview.new_locations.length || preview.new_material_types.length || preview.new_vendors.length) ? (
                <div className="mutedSmall" style={{ marginTop: 6 }}>
                  {preview.new_locations.length ? <div><b>Locations:</b> {preview.new_locations.join(", ")}</div> : null}
                  {preview.new_material_types.length ? <div><b>Material Types:</b> {preview.new_material_types.join(", ")}</div> : null}
                  {preview.new_vendors.length ? <div><b>Vendors:</b> {preview.new_vendors.join(", ")}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {lastResult && (
          <div className="cardSub">
            <b>Import complete.</b>
            <div className="mutedSmall" style={{ marginTop: 6 }}>
              Mode: <b>{lastResult.dedup_mode}</b> • Rows received: {lastResult.rows_received} • Rows imported: {lastResult.rows_imported} •
              Products inserted: {lastResult.products_inserted} • Products updated: {lastResult.products_updated} • Product updates skipped: {lastResult.product_updates_skipped} •
              Locations seen: {lastResult.locations_seen} • Material Types seen: {lastResult.material_types_seen} • Vendors seen: {(lastResult as any).vendors_seen ?? 0} •
              On‑hand rows updated: {lastResult.on_hand_upserts}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function ProductsSettings({ onError }: { onError: (m: string) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [material_type_id, setMaterialTypeId] = useState<number | "">("");
  const [vendor_id, setVendorId] = useState<number | "">("");
  const [lastVendorId, setLastVendorId] = useState<number | "">("");
  // Keep blank by default so the placeholder shows "par" instead of "0.0".
  const [par, setPar] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"sku" | "name" | "material" | "vendor" | "par" | "locations", string>>>({});

  const [confirmingClearAll, setConfirmingClearAll] = useState(false);

  const [editing, setEditing] = useState<Product | null>(null);
  const editFormRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      const [prods, mts, locs, vends] = await Promise.all([Api.listProducts(), Api.listMaterialTypes(), Api.listLocations(), Api.listVendors()]);
      setProducts(prods);
      setMaterialTypes([...mts].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));
      setLocations(locs);
      setVendors([...vends].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())));

      // Ensure a sensible default selection when adding new products
      setSelectedLocationIds((cur) => (cur.length ? cur : locs[0] ? [locs[0].id] : []));
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
    setVendorId(lastVendorId);
    setPar("");
    setNotes("");
    setSelectedLocationIds(locations[0] ? [locations[0].id] : []);
    setEditing(null);
    setConfirmingClearAll(false);
    setFieldErrors({});
  }

  async function submit() {
    const n = name.trim();
    const s = sku.trim().toUpperCase();
    const pNum = Number(par);
    const p = round1(pNum);
    const mtId = material_type_id === "" ? null : material_type_id;
    const vId = vendor_id === "" ? null : vendor_id;

    const errs: typeof fieldErrors = {};

    // Inline validation (show messages instead of silently blocking)
    if (!s) errs.sku = "SKU is required";
    else {
      const dup = products.some((p) => (editing ? p.id !== editing.id : true) && (p.sku ?? "").toUpperCase() === s);
      if (dup) errs.sku = "SKU already exists";
    }
    if (!n) errs.name = "Product name is required";
    if (material_type_id === "") errs.material = "Material type is required";
    if (vendor_id === "") errs.vendor = "Vendor is required";
    if (!par.trim() || !Number.isFinite(pNum)) errs.par = "PAR is required";
    else if (pNum <= 0) errs.par = "PAR must be > 0";
    if (selectedLocationIds.length === 0) errs.locations = "Select at least one location";

    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    const notesClean = notes.trim() || null;

    try {
      if (editing) {
        await Api.updateProduct(editing.id, { name: n, sku: s, material_type_id: mtId, vendor_id: vId, par: p, notes: notesClean, location_ids: selectedLocationIds });
      } else {
        await Api.createProduct({ name: n, sku: s, material_type_id: mtId, vendor_id: vId, par: p, notes: notesClean, location_ids: selectedLocationIds });
      }
      resetForm();
      await load();
    } catch (e: any) {
      // Common inline errors
      const msg = e?.message || "Failed to save product";
      if (msg.toLowerCase().includes("sku") && msg.toLowerCase().includes("exists")) {
        setFieldErrors((cur) => ({ ...cur, sku: "SKU already exists" }));
        return;
      }
      onError(msg);
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
    setVendorId(p.vendor_id ?? "");
    setPar(fmt1(p.par));
    setNotes((p.notes ?? "").toString());
    setSelectedLocationIds((p.location_ids ?? []).slice());

    // On mobile, jump to the edit form so it isn't missed.
    requestAnimationFrame(() => {
      editFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div>
      <div className="hint">Products carry a <b>global PAR</b>. On‑hand is tracked per location.</div>

      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        {!confirmingClearAll ? (
          <button className="btnDanger" type="button" onClick={() => setConfirmingClearAll(true)}>
            Clear all products
          </button>
        ) : (
          <div className="dangerConfirm">
            <div className="dangerConfirmText">
              <b>Danger:</b> This will permanently delete <b>all products</b>, their assigned locations, and all on‑hand entries.
              <div style={{ marginTop: 2 }}>This cannot be undone.</div>
            </div>
            <div className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                className="btnDanger"
                type="button"
                onClick={() => {
                  void (async () => {
                    try {
                      await Api.clearAllProducts();
                      resetForm();
                      await load();
                    } catch (e: any) {
                      onError(e?.message || "Failed to clear all products");
                    }
                  })();
                }}
              >
                Yes, clear everything
              </button>
              <button className="btnSecondary" type="button" onClick={() => setConfirmingClearAll(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div ref={editFormRef} className="formGrid">
        <div className="field">
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value.toUpperCase().replace(/\s+/g, ""))}
            onBlur={() => setSku((s) => s.trim().toUpperCase().replace(/\s+/g, ""))}
            placeholder="SKU"
            className={fieldErrors.sku ? "input inputError" : "input"}
          />
          {fieldErrors.sku && <div className="fieldError">{fieldErrors.sku}</div>}
        </div>

        <div className="field">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setName((s) => s.trim())}
            placeholder="Product name"
            className={fieldErrors.name ? "input inputError" : "input"}
          />
          {fieldErrors.name && <div className="fieldError">{fieldErrors.name}</div>}
        </div>

        <div className="field">
          <select
            value={material_type_id}
            onChange={(e) => setMaterialTypeId(e.target.value ? Number(e.target.value) : "")}
            className={fieldErrors.material ? "select inputError" : "select"}
          >
          <option value="" disabled>
            Material type…
          </option>
          {materialTypes.map((mt) => (
            <option key={mt.id} value={mt.id}>
              {mt.name}
            </option>
          ))}
          </select>
          {fieldErrors.material && <div className="fieldError">{fieldErrors.material}</div>}
        </div>

        <div className="field">
          <select
            value={vendor_id}
            onChange={(e) => {
              const val = e.target.value ? Number(e.target.value) : "";
              setVendorId(val);
              if (val !== "") setLastVendorId(val);
            }}
            className={fieldErrors.vendor ? "select inputError" : "select"}
          >
          <option value="" disabled>
            Vendor…
          </option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
          </select>
          {fieldErrors.vendor && <div className="fieldError">{fieldErrors.vendor}</div>}
        </div>

        <div className="field">
          <input
            value={par}
            onChange={(e) => setPar(e.target.value)}
            placeholder="par"
            inputMode="decimal"
            type="number"
            step={0.1}
            min={0}
            className={fieldErrors.par ? "input parInput inputError" : "input parInput"}
          />
          {fieldErrors.par && <div className="fieldError">{fieldErrors.par}</div>}
        </div>

        <div className="field fieldSpan2">
          <textarea
            className="textarea"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <div className="locationPicker">
          <div className="label" style={{ marginBottom: 6 }}>Locations (required)</div>
          {locations.length === 0 ? (
            <div className="muted">Add locations first in Settings → Locations.</div>
          ) : (
            <div className="locationChips">
              {locations.map((l) => {
                const checked = selectedLocationIds.includes(l.id);
                return (
                  <label key={l.id} className={checked ? "chip chipOn" : "chip"}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSelectedLocationIds((cur) => {
                          const set = new Set(cur);
                          if (set.has(l.id)) set.delete(l.id);
                          else set.add(l.id);
                          return Array.from(set);
                        });
                      }}
                    />
                    <span>{l.name}</span>
                  </label>
                );
              })}
            </div>
          )}
          {fieldErrors.locations && <div className="fieldError" style={{ marginTop: 6 }}>{fieldErrors.locations}</div>}
        </div>
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

      {/* Desktop: table view */}
      <div className="desktopOnly tableWrap" style={{ marginTop: 14 }}>
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

      {/* Mobile: compact card list (avoids squished table) */}
      <div className="mobileOnly" style={{ marginTop: 14 }}>
        {products.map((p) => (
          <div key={p.id} className="pCard">
            <div className="pCardTop">
              <div className="pCardSku">{p.sku}</div>
              <div className="pCardPar">PAR {fmt1(p.par)}</div>
            </div>
            <div className="pCardName">{p.name}</div>
            <div className="pCardMeta">{p.material_type_name ?? "Uncategorized"}</div>
            <div className="pCardActions">
              <button onClick={() => startEdit(p)} className="btn" type="button">
                Edit
              </button>
              <button onClick={() => void del(p.id)} className="btnDanger" type="button">
                Delete
              </button>
            </div>
          </div>
        ))}
        {products.length === 0 && <div className="muted">No products yet.</div>}
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
    /* Space for mobile bottom nav + iOS safe area */
    padding-bottom: calc(96px + env(safe-area-inset-bottom));
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

  .stickyBar {
    position: sticky;
    top: 0;
    z-index: 30;
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 10px;
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .searchInput { min-width: 220px; flex: 1 1 220px; }

  .radio {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #111827;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: #f9fafb;
  }
  .radio input { width: 16px; height: 16px; }

  .input, .select {
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid #d1d5db;
    min-width: 180px;
    font-size: 14px;
  }

  .textarea {
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid #d1d5db;
    font-size: 14px;
    resize: vertical;
  }

  .inputError {
    border-color: #ef4444 !important;
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.10);
  }
  .fieldError {
    font-size: 12px;
    color: #b91c1c;
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
  .btn.danger {
    border-color: var(--red);
    background: var(--red);
    color: #ffffff;
  }
  .btn.danger:disabled {
    opacity: 0.7;
    cursor: not-allowed;
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

  .parInput {
    width: 70px;
    max-width: 70px;
  }

  .formGrid {
    display: grid;
    /* Keep everything on one row on desktop while staying compact */
    grid-template-columns: 120px 1.6fr 1fr 1fr 70px;
    gap: 10px;
    align-items: end;
  }

  /* Make inputs in the product form shrink instead of forcing overflow */
  .formGrid .input, .formGrid .select { min-width: 0; }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .fieldSpan2 { grid-column: 1 / -1; }

  .dangerConfirm {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    border: 1px solid #fecaca;
    background: #fff1f2;
    padding: 10px 12px;
    border-radius: 14px;
    max-width: 100%;
  }
  .dangerConfirmText {
    font-size: 12px;
    color: #111827;
    line-height: 1.25;
  }

  .locationPicker { grid-column: 1 / -1; }
  .locationChips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: #f9fafb;
    cursor: pointer;
    user-select: none;
  }
  .chip input { width: 16px; height: 16px; }
  .chipOn { background: #e0f2fe; border-color: #7dd3fc; }

  /* Mobile product list cards */
  .pCard {
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 12px;
    background: #ffffff;
    box-shadow: 0 1px 0 rgba(0,0,0,0.03);
    display: grid;
    gap: 6px;
    margin-bottom: 10px;
  }
  .pCardTop { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
  .pCardSku { font-weight: 900; letter-spacing: 0.2px; }
  .pCardPar { font-size: 12px; color: #111827; background: #fef3c7; border: 1px solid #fde68a; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
  .pCardName { font-weight: 700; }
  .pCardMeta { font-size: 12px; color: var(--muted); }
  .pCardActions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 4px; }

  .groupStack { display: grid; gap: 12px; padding-top: 8px; }

  .vendorStack { display: grid; gap: 14px; }
  .vendorBlock { border: 1px solid var(--border); border-radius: 16px; overflow: hidden; background: #ffffff; }
  .stickyBar {
    position: sticky;
    top: 0;
    z-index: 30;
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: #ffffff;
    margin-bottom: 12px;
  }

  .searchInput { min-width: 220px; width: 100%; }


  .onhandSticky { top: 0; }
  @media (max-width: 640px) {
    .onhandSticky { flex-direction: column; align-items: stretch; }
    .onhandSticky .row { justify-content: flex-start; }
  }


  .radio { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #111827; }
  .radio input { width: 16px; height: 16px; }

  .vendorHeader {
    position: sticky;
    top: 66px; /* below sticky search bar */
    z-index: 20;
    padding: 0;
    background: #ef4444;
    border-bottom: 1px solid #dc2626;
    color: #ffffff;
  }
  .vendorHeaderBtn {
    width: 100%;
    color: inherit;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: none;
    background: transparent;
    cursor: pointer;
  }
  .vendorHeaderName { font-weight: 900; }
  .vendorHeaderMeta { font-size: 12px; color: rgba(255,255,255,0.9); }

  .groupBlock { border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
  .groupHeader { padding: 10px 12px; font-weight: 800; background: #111827; color: #ffffff; }

  /* Mobile reorder */
  .mobileReorderList { display: grid; gap: 8px; padding: 10px; }
  .mobileReorderRow {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: #ffffff;
  }

  .qtyStepper { display: inline-flex; align-items: center; gap: 8px; }
  .stepBtn {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
  }

  .mobileRowLeft { min-width: 0; }

  .mobileRowTitle {
    font-weight: 800;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 58vw;
  }

  .mobileRowSku {
    font-size: 12px;
    color: var(--muted);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 58vw;
  }

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


  /* Settings lists */
  .list { display: grid; gap: 10px; margin-top: 12px; }
  .listRow {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: #ffffff;
  }
  .listName { font-weight: 800; }

  .settingsCredit {
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 12px;
    text-align: center;
  }

  /* Mobile on-hand */
  .mobileRowHeader {
    display: grid;
    grid-template-columns: 1fr 120px;
    gap: 10px;
    padding: 10px 8px;
    color: #374151;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
  }

  .mobileRows { display: grid; }

  .mobileRow {
    display: grid;
    grid-template-columns: 1fr 120px;
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
    padding: 8px 10px;
    border-radius: 12px;
    border: 1px solid #d1d5db;
    font-size: 16px;
    text-align: right;
  }

  .qtyInputMobileBig {
    width: 84px;
    padding: 10px 10px;
    border-radius: 10px;
    border: 1px solid #d1d5db;
    font-size: 16px;
    text-align: right;
  }

  .mobileRowSub {
    margin-top: 2px;
    font-size: 12px;
    color: #6b7280;
    line-height: 1.1;
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
    /* Add a little buffer for iPhone home-indicator / fullscreen */
    padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
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

    .appShell { padding: 12px; padding-bottom: calc(98px + env(safe-area-inset-bottom)); }
    .appTitle { font-size: 22px; }

    .input, .select { min-width: 0; width: 100%; }

    .formGrid {
      grid-template-columns: 1fr;
    }

    .dangerConfirm { flex-direction: column; }

    .card { padding: 12px; border-radius: 16px; }

    .dangerConfirm {
      flex-direction: column;
      align-items: stretch;
    }
  }

  /* Extra-tight phones */
  @media (max-width: 420px) {
    .mobileRowTitle { font-size: 13px; }
    .mobileRowSku { font-size: 11px; }

    .mobileOrderPill {
      font-size: 14px;
      padding: 8px 10px;
      min-width: 64px;
    }

    .qtyInputMobile { font-size: 14px; }
    .qtyInputMobileBig {
      font-size: 16px;
      width: 88px;
      padding: 8px 8px;
    }

    .mobileRowHeader { font-size: 11px; }
    .mobileRowSub { font-size: 11px; }
  }

  .rowWrap { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .csvBox {
    width: 100%;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 12px;
    line-height: 1.35;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 10px;
  }



/* Print */
.printOnly { display: none; }

@media print {
  body { background: #ffffff !important; }
  .mobileBottomNav, .topNav, .hint, .btn, .input, .pill, .settingsCredit { display: none !important; }
  .noPrint { display: none !important; }
  .printOnly { display: block !important; }
  .card { border: none !important; box-shadow: none !important; }
  .groupBlock { border: none !important; }
  .groupHeader { background: transparent !important; color: #000 !important; padding: 0 !important; margin-bottom: 6px; }
}
`;
