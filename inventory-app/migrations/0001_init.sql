PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS material_types (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  material_type_id INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (material_type_id) REFERENCES material_types(id)
);

CREATE TABLE IF NOT EXISTS skus (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL,
  sku_code TEXT NULL,
  unit_name TEXT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS par_levels (
  sku_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  par_qty_tenths INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sku_id, location_id),
  FOREIGN KEY (sku_id) REFERENCES skus(id),
  FOREIGN KEY (location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS on_hand (
  sku_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  on_hand_qty_tenths INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sku_id, location_id),
  FOREIGN KEY (sku_id) REFERENCES skus(id),
  FOREIGN KEY (location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  default_to_emails TEXT NOT NULL DEFAULT '',
  default_cc_emails TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT 'Inventory',
  from_email TEXT NOT NULL DEFAULT '',
  subject_prefix TEXT NOT NULL DEFAULT 'Inventory Order'
);

INSERT INTO settings (id) VALUES (1)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS order_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  to_emails TEXT NOT NULL,
  cc_emails TEXT NOT NULL DEFAULT '',
  additional_emails TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  snapshot_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS order_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_run_id INTEGER NOT NULL,
  material_type_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  sku_code TEXT NULL,
  order_qty_units INTEGER NOT NULL,
  FOREIGN KEY (order_run_id) REFERENCES order_runs(id),
  FOREIGN KEY (material_type_id) REFERENCES material_types(id)
);

CREATE INDEX IF NOT EXISTS idx_products_material_type ON products(material_type_id);
CREATE INDEX IF NOT EXISTS idx_order_lines_run ON order_lines(order_run_id);
CREATE INDEX IF NOT EXISTS idx_par_levels_location ON par_levels(location_id);
CREATE INDEX IF NOT EXISTS idx_on_hand_location ON on_hand(location_id);
