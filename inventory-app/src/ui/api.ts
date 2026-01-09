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
  location_ids: ID[]; // assigned locations
};

export type OnHandRow = {
  product_id: ID;
  location_id: ID;
  qty: number;
};

export type ReorderRow = {
  product_id: ID;
  sku: string;
  name: string;
  vendor_id: ID | null;
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

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  // If a Pages Function route isn't matched, Cloudflare often serves index.html.
  // Detect that and surface a helpful error instead of "Unexpected token <".
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text().catch(() => "");
    throw new Error(
      "API did not return JSON. This usually means the /functions API is not deployed or the /api route is not matching. " +
        (text ? `\n\nResponse starts with: ${text.slice(0, 80)}` : "")
    );
  }
  return (await res.json()) as T;
}

export const Api = {
  // locations
  listLocations: () => api<Location[]>(`/locations`),
  createLocation: (name: string) =>
    api<Location>(`/locations`, { method: "POST", body: JSON.stringify({ name }) }),
  deleteLocation: (id: ID) => api<{ ok: true }>(`/locations/${id}`, { method: "DELETE" }),

  // material types
  listMaterialTypes: () => api<MaterialType[]>(`/material-types`),
  createMaterialType: (name: string) =>
    api<MaterialType>(`/material-types`, { method: "POST", body: JSON.stringify({ name }) }),
  deleteMaterialType: (id: ID) => api<{ ok: true }>(`/material-types/${id}`, { method: "DELETE" }),

  // vendors
  listVendors: () => api<Vendor[]>(`/vendors`),
  createVendor: (name: string) => api<Vendor>(`/vendors`, { method: "POST", body: JSON.stringify({ name }) }),
  deleteVendor: (id: ID) => api<{ ok: true }>(`/vendors/${id}`, { method: "DELETE" }),



  // products
  listProducts: () => api<Product[]>(`/products`),
  createProduct: (p: Omit<Product, "id">) =>
    api<Product>(`/products`, { method: "POST", body: JSON.stringify(p) }),
  updateProduct: (id: ID, p: Omit<Product, "id">) =>
    api<Product>(`/products/${id}`, { method: "PUT", body: JSON.stringify(p) }),
  deleteProduct: (id: ID) => api<{ ok: true }>(`/products/${id}`, { method: "DELETE" }),
  clearAllProducts: () => api<{ ok: true }>(`/products?all=1`, { method: "DELETE" }),

  // on hand
  listOnHandByLocation: (location_id: ID) => api<OnHandRow[]>(`/on-hand?location_id=${location_id}`),
  upsertOnHand: (row: { product_id: ID; location_id: ID; qty: number }) =>
    api<{ ok: true }>(`/on-hand`, { method: "PUT", body: JSON.stringify(row) }),

  // on hand
  clearOnHand: (location_id?: ID) =>
    api<{ ok: true }>(`/on-hand${location_id ? `?location_id=${location_id}` : ""}`,
      { method: "DELETE" }
    ),


  // import
  importRows: (rows: Array<{ location?: string; material_type?: string; vendor?: string; sku: string; name: string; par?: number | string; on_hand?: number | string }>) =>
    api<{ ok: true; rows_received: number; rows_imported: number; locations_seen: number; material_types_seen: number; on_hand_upserts: number }>(
      `/import`,
      { method: "POST", body: JSON.stringify({ rows }) }
    ),

  // reorder
  reorder: () => api<ReorderRow[]>(`/reorder`),
};
