-- Adds vendors support (safe to run on existing DB)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

-- If products already exists without vendor_id, add it.
ALTER TABLE products ADD COLUMN vendor_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_products_vendor_id ON products(vendor_id);
