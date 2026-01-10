-- Adds a product->location assignment table.
-- Run this once on your D1 database:
--   npx wrangler d1 execute db_inventory --remote --file=./migrations/0002_product_locations.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS product_locations (
  product_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  PRIMARY KEY (product_id, location_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_locations_location ON product_locations(location_id);
CREATE INDEX IF NOT EXISTS idx_product_locations_product ON product_locations(product_id);
