# 🚀 Deploying Unified Workforce online (Cloudflare)

Single Worker serves both **API** and **frontend** (SPA) — built from the same repo.

## 1. Deploy (API + Frontend) — already live ✅

Live at `https://cadensiq.celestsolutions.workers.dev` (API + app).

From the project root after any change:

```bash
npm run lint          # ESLint (frontend + worker)
npx vitest run        # unit tests (incl. kiosk token contract tests)
npm run build         # Vite production build (route-level code splitting)
npx wrangler deploy --config worker/wrangler.jsonc
```

> The frontend is code-split: every page under `src/pages/` is lazy-loaded in
> `src/App.jsx`, so each deploy ships a small initial chunk (~130 kB) with the
> rest of the pages fetched on navigation. Keep new pages lazy-loaded.

### Worker module layout

The Worker entry point `worker/src/index.js` is a thin router. Handlers live in
domain modules under `worker/src/routes/`:

| Module | Routes |
|---|---|
| `routes/public.js` | login, public settings/roles, registration, kiosk pairing (`verify-token`), kiosk `identify`/`directory`, kiosk token punches (`/api/attendance` with `X-Kiosk-Token`) |
| `routes/auth.js` | `/api/me`, `/api/change-password`, `/api/bootstrap` |
| `routes/settings.js` | global + per-company settings, roles CRUD |
| `routes/companies.js` | companies + employees management |
| `routes/tasks.js` | tasks CRUD (with `assignee_id`/`assignee_email` normalization) |
| `routes/attendance.js` | authenticated punch history / punches |
| `routes/credentials.js` | QR / fingerprint / PIN credential management |
| `routes/orgUnits.js` | org units CRUD |
| `routes/kioskAdmin.js` | kiosk device tokens, WebAuthn registration |
| `routes/notifications.js` | notification inbox |
| `routes/admin.js` | tenant data reset |

Shared helpers live in `worker/src/lib/` (`kiosk.js`, `pagination.js`,
`crypto.js`, `db.js`, `seed.js`, …). Public routes always run **before** the
`requireAuth` gate — keep that ordering when adding new endpoints.

### Kiosk device tokens

Each company has one long-lived kiosk token (`uwk_…`, 48 hex chars) stored in
the `settings` table under `kiosk_device_token:<token>` → `companyId`.

- **Issue / view:** `GET /api/kiosk-token/<companyId>` (administrator).
- **Rotate:** `DELETE /api/kiosk-token/<companyId>` then `GET` again to mint a
  fresh token. The kiosk must be re-paired with the new token after rotation.
- The token is validated **format-first** (`kioskTokenCompanyId` in
  `worker/src/lib/kiosk.js`) so malformed tokens never reach a DB query —
  covered by `worker/src/lib/kiosk.test.js`.


The Worker is configured in `worker/wrangler.jsonc:27-32` to serve `dist/` via `assets`
(single-page-application fallback). No separate Pages project is needed.

> ⚠️ If you changed `worker/schema.sql`, also run:
> ```bash
> npx wrangler d1 execute workforce --file=worker/schema.sql --remote
> ```

### Auto-deploy via GitHub (optional)
Connect the repo as a **Worker** (not Pages) in Cloudflare Dashboard → Workers & Pages → Create → Worker → Connect to Git. Build command is `npm run build`, deploy command is `npx wrangler deploy --config worker/wrangler.jsonc`.

> Legacy note: earlier docs described a separate Cloudflare Pages frontend (`cadensiq.pages.dev`).
> That flow is deprecated — the current `wrangler.jsonc` `assets` binding replaced it.
> Set `VITE_API_URL` only for local dev (`.env`); production uses same-origin (`location.origin`).

## 2. Share with your client

Your app will be live at:

```
https://cadensiq.celestsolutions.workers.dev
https://cadensiq.pages.dev        (legacy Pages URL, if still active — prefer the workers.dev URL)
```

Custom domain (optional): Cloudflare Dashboard → Workers & Pages → `cadensiq` → **Custom domains** → add e.g.
`app.celestsolutions.com` (domain must be added to your Cloudflare account).

## Kiosk on the company phone

Open `https://<your-pages-url>/kiosk` on the phone → browser menu →
**"Add to Home Screen"** → launches full-screen as an app.

## Environment variables reference

| Variable | Where | Purpose |
|---|---|---|
| `VITE_API_URL` | Frontend build env / `.env` | URL of the Worker API |
| `AUTH_SECRET` | Worker secret (`wrangler secret put AUTH_SECRET`) | Signs login tokens |
