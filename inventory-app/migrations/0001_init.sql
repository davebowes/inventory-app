-- Inventory App (Cloudflare D1 / SQLite)
-- Run this once in your D1 console (or via wrangler d1 execute).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS material_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

-- Products: PAR is global and stored as REAL to support 1 decimal place.
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  material_type_id INTEGER,
  vendor_id INTEGER,
  par REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (material_type_id) REFERENCES material_types(id) ON DELETE SET NULL,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
);

-- On-hand quantities are tracked by (product, location).
-- Qty is REAL to support 1 decimal place.
CREATE TABLE IF NOT EXISTS on_hand (
  product_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  qty REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (product_id, location_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_on_hand_location ON on_hand(location_id);
CREATE INDEX IF NOT EXISTS idx_on_hand_product ON on_hand(product_id);
CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON products(vendor_id);
