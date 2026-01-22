export type ID = number;

export type Location = { id: ID; name: string };
export type MaterialType = { id: ID; name: string };
export type Vendor = { id: ID; name: string };

export type Product = {
  id: ID;
  name: string;
  sku: string;
  material_type_id: ID | null;
  material_type_name?: string | null;
  vendor_id: ID | null;
  vendor_name?: string | null;
  par: number; // global par
  notes?: string | null;
  location_ids: ID[]; // assigned locations
};

export type OnHandRow = {
  product_id: ID;
  sku: string;
  name: string;
  material_type_name: string | null;
  qty: number;
  location_id: ID;
};

export type ReorderRow = {
  product_id: ID;
  sku: string;
  name: string;
  vendor_name: string | null;
  material_type_name: string | null;
  par: number;
  total_on_hand: number;
  to_order: number;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export const Api = {
  // locations
  listLocations: () => api<Location[]>(`/locations`),
  createLocation: (name: string) => api<Location>(`/locations`, { method: "POST", body: JSON.stringify({ name }) }),
  deleteLocation: (id: ID) => api<{ ok: true }>(`/locations/${id}`, { method: "DELETE" }),

  // material types
  listMaterialTypes: () => api<MaterialType[]>(`/material-types`),
  createMaterialType: (name: string) => api<MaterialType>(`/material-types`, { method: "POST", body: JSON.stringify({ name }) }),
  deleteMaterialType: (id: ID) => api<{ ok: true }>(`/material-types/${id}`, { method: "DELETE" }),

  // vendors
  listVendors: () => api<Vendor[]>(`/vendors`),
  createVendor: (name: string) => api<Vendor>(`/vendors`, { method: "POST", body: JSON.stringify({ name }) }),
  deleteVendor: (id: ID) => api<{ ok: true }>(`/vendors/${id}`, { method: "DELETE" }),

  // products
  listProducts: () => api<Product[]>(`/products`),
  createProduct: (p: { name: string; sku: string; material_type_id: ID | null; vendor_id: ID | null; par: number; notes?: string | null; location_ids: ID[] }) =>
    api<Product>(`/products`, { method: "POST", body: JSON.stringify(p) }),
  updateProduct: (id: ID, p: { name: string; sku: string; material_type_id: ID | null; vendor_id: ID | null; par: number; notes?: string | null; location_ids: ID[] }) =>
    api<Product>(`/products/${id}`, { method: "PUT", body: JSON.stringify(p) }),
  deleteProduct: (id: ID) => api<{ ok: true }>(`/products/${id}`, { method: "DELETE" }),
  clearAllProducts: () => api<{ ok: true }>(`/products?all=1`, { method: "DELETE" }),

  // on hand
  listOnHandByLocation: (location_id: ID) => api<OnHandRow[]>(`/on-hand?location_id=${location_id}`),
  upsertOnHand: (row: { product_id: ID; location_id: ID; qty: number }) =>
    api<{ ok: true }>(`/on-hand`, { method: "PUT", body: JSON.stringify(row) }),
  clearOnHand: (location_id?: ID) =>
    api<{ ok: true }>(`/on-hand${location_id ? `?location_id=${location_id}` : ""}`, { method: "DELETE" }),

  // import
  importPreview: (rows: Array<{ location?: string; material_type?: string; vendor?: string; sku: string; name: string; notes?: string; par?: number | string; on_hand?: number | string }>, dedup_mode: "update" | "skip") =>
    api<{
      ok: true;
      dry_run: true;
      dedup_mode: "update" | "skip";
      rows_received: number;
      rows_imported: number;
      new_locations: string[];
      new_material_types: string[];
      new_vendors: string[];
      existing_skus: string[];
      will_insert_products: number;
      will_update_products: number;
      will_skip_product_updates: number;
      on_hand_rows: number;
    }>(`/import`, { method: "POST", body: JSON.stringify({ rows, dry_run: true, dedup_mode }) }),

  importRows: (rows: Array<{ location?: string; material_type?: string; vendor?: string; sku: string; name: string; notes?: string; par?: number | string; on_hand?: number | string }>, dedup_mode: "update" | "skip") =>
    api<{
      ok: true;
      dedup_mode: "update" | "skip";
      rows_received: number;
      rows_imported: number;
      locations_seen: number;
      material_types_seen: number;
      vendors_seen: number;
      products_inserted: number;
      products_updated: number;
      product_updates_skipped: number;
      on_hand_upserts: number;
    }>(`/import`, { method: "POST", body: JSON.stringify({ rows, dedup_mode }) }),

  // reorder
  reorder: () => api<ReorderRow[]>(`/reorder`),
};
