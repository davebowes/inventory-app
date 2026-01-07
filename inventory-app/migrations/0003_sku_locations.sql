-- 0003_sku_locations.sql
-- Map which products/SKUs are stocked in which locations (used for counting UI).
-- This does NOT affect reorder math; reorder still uses SUM(on_hand) across all locations vs global PAR.

CREATE TABLE IF NOT EXISTS sku_locations (
  sku_id INTEGER NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  PRIMARY KEY (sku_id, location_id)
);

-- Backfill: if any on_hand exists for a sku/location, mark it as stocked there.
INSERT OR IGNORE INTO sku_locations (sku_id, location_id)
SELECT DISTINCT sku_id, location_id FROM on_hand;

-- Backfill legacy: if any par_levels exist (older version), mark as stocked there too.
INSERT OR IGNORE INTO sku_locations (sku_id, location_id)
SELECT DISTINCT sku_id, location_id FROM par_levels;
