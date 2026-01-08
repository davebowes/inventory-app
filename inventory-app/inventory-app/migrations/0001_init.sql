-- Inventory App schema (clean) — empty products/locations by default
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS material_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT,
  material_type_id INTEGER NOT NULL,
  par_qty REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (material_type_id) REFERENCES material_types(id)
);

CREATE TABLE IF NOT EXISTS product_locations (
  product_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  PRIMARY KEY (product_id, location_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS on_hands (
  product_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  qty REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (product_id, location_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

-- Seed default material types (safe to re-run)
INSERT OR IGNORE INTO material_types (name) VALUES
('Roll Material'),
('Ink'),
('Hardware'),
('Vinyl'),
('Laminate'),
('Other');
