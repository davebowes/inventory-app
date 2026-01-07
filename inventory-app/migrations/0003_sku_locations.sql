-- 0003_sku_locations.sql
CREATE TABLE IF NOT EXISTS sku_locations (
  sku_id INTEGER NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  PRIMARY KEY (sku_id, location_id)
);

INSERT OR IGNORE INTO sku_locations (sku_id, location_id)
SELECT DISTINCT sku_id, location_id FROM on_hand;

INSERT OR IGNORE INTO sku_locations (sku_id, location_id)
SELECT DISTINCT sku_id, location_id FROM par_levels;
