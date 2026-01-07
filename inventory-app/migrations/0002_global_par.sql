-- 0002_global_par.sql
-- Convert PAR to a single global PAR per SKU (stored on skus.par_qty_tenths)
-- NOTE: We keep par_levels table for history, but the app will no longer use it for reorder math.

ALTER TABLE skus ADD COLUMN par_qty_tenths INTEGER NOT NULL DEFAULT 0;

-- If you previously used per-location PARs, set global PAR to the MAX PAR found for that SKU.
UPDATE skus
SET par_qty_tenths = COALESCE((
  SELECT MAX(pl.par_qty_tenths)
  FROM par_levels pl
  WHERE pl.sku_id = skus.id
), 0);
