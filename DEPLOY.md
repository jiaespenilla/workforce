# 🚀 Deploying Unified Workforce online (Cloudflare)

Single Worker serves both **API** and **frontend** (SPA) — built from the same repo.

## 1. Deploy (API + Frontend) — already live ✅

Live at `https://cadensiq.celestsolutions.workers.dev` (API + app).

From the project root after any change:

```bash
npm run build
npx wrangler deploy --config worker/wrangler.jsonc
```

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
