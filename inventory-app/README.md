# Inventory App (Vite + Cloudflare Pages + D1)

## What it does
- Maintain **Products** (SKU, name, material type, global PAR)
- Maintain **Locations**
- Track **On‑Hand by location** (supports **1 decimal place**)
- Compute **Reorder list** using: `max(PAR - total_on_hand_all_locations, 0)` (supports **1 decimal place**)

## Database
This app expects a Cloudflare **D1** database bound as `DB`.

Run the migration in `migrations/0001_init.sql` once in your D1 console (or via `wrangler d1 execute`).

## Cloudflare Pages
- Frontend is static (Vite build)
- Backend is under `functions/api/*` and serves `/api/*`

## Notes
- Qty and PAR are stored as `REAL` and normalized to 1 decimal place in both UI and API.
