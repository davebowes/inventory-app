-- Add vendors table and vendor_id on products
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

-- Add vendor_id to products (run once). If this fails because column exists, you can ignore.
ALTER TABLE products ADD COLUMN vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_vendor ON products(vendor_id);
