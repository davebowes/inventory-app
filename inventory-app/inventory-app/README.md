# Inventory App (Cloudflare Pages + D1)

This is a clean, known-good baseline.

## What’s included
- Products (name, optional SKU, material type dropdown, global PAR with 1 decimal)
- Locations
- Assign products to multiple locations
- Enter on-hands per location (1 decimal)
- D1 database tables and migrations

## Cloudflare setup (simple)
1) Create a D1 database (example name: `inventory_db`)
2) Run the SQL in `migrations/0001_init.sql` in the D1 Console (one section at a time if needed)
3) Pages project:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/` (repo root)
4) Pages → Settings → Functions → D1 bindings:
   - Variable name: `DB`
   - Select your D1 database

Deploy.

## Dev locally
```bash
npm install
npm run dev
```
