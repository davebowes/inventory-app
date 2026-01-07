# Inventory App (Cloudflare + GitHub)

This repo is a working MVP for your inventory workflow:

- Products + optional SKUs
- Multiple locations
- PAR stored to **0.1** (tenths) and on-hand stored to **0.1**
- Order qty is **whole units only** (rounded up)
- One email sent that is **broken into sections by material type**
- 0-quantity order lines are **not shown**

## Tech
- Cloudflare Pages (frontend)
- Cloudflare Pages Functions (API)
- Cloudflare D1 (database)
- SendGrid (email delivery)

## What’s already loaded from your CSV
- Material types: Hardware, Ink, Roll Material, Substrate
- Locations: Back Room, Design Room, Ink, Left Rack, Other, Right Rack, Substrate Rack
- 72 products, 72 SKUs (optional), 72 PAR rows.

---

## Local setup

### 1) Install
```bash
npm install
```

### 2) Login to Cloudflare
```bash
npx wrangler login
```

### 3) Create a D1 database (one-time)
```bash
npx wrangler d1 create INVENTORY_DB
```
Copy the `database_id` it prints, and paste it into `wrangler.toml` under `database_id`.

### 4) Apply migrations + seed locally
```bash
npm run d1:migrate:local
npm run d1:seed:local
```

### 5) Run locally (Pages dev)
```bash
npm run dev
```
Frontend dev runs at Vite’s URL.

To run **Pages Functions + bindings locally**, build then:
```bash
npm run cf:dev
```

---

## Deploy to Cloudflare Pages (GitHub)

### 1) Push to GitHub
Create a GitHub repo and push this project.

### 2) Create the D1 database in Cloudflare
Cloudflare Dashboard → **Workers & Pages** → **D1** → Create database `INVENTORY_DB`.

### 3) Apply migrations + seed to production
From your computer:
```bash
npm run d1:migrate:prod
npm run d1:seed:prod
```

### 4) Create a Pages project connected to GitHub
Cloudflare Dashboard → **Workers & Pages** → **Pages** → Create application → Connect to GitHub repo.

Build settings:
- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`

### 5) Add bindings & env vars in Pages
In your Pages project → **Settings**:

**Bindings**
- D1 database binding: `DB` → connect to `INVENTORY_DB`

**Environment variables**
- `SENDGRID_API_KEY` = (your SendGrid API key)
- Optional:
  - `DEFAULT_FROM_NAME`
  - `DEFAULT_FROM_EMAIL`
  - `SUBJECT_PREFIX`

### 6) Deploy
Push to `main` → Pages builds and deploys.

---

## Using the app
- Go to **Settings** and set:
  - Default TO emails
  - (Optional) CC emails
  - From name/email
- Enter On‑Hand values
- Go to **Reorder** → Confirm & Send
