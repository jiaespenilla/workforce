# 🚀 Deploying Unified Workforce online (Cloudflare)

Two pieces are deployed: the **API** (Cloudflare Worker, already live) and the
**frontend** (Cloudflare Pages — this guide).

## 1. API (Worker) — already deployed ✅

Live at `https://cadensiq.celestsolutions.workers.dev`.
To update it after backend changes:

```bash
cd worker
wrangler deploy
```

> ⚠️ If you changed `schema.sql`, also run:
> ```bash
> wrangler d1 execute workforce --file=./schema.sql --remote
> ```

## 2. Frontend (Cloudflare Pages) — one-time setup

### Option A: Connect GitHub (auto-deploy on every push) — recommended

1. Go to **dash.cloudflare.com** → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. Select the **`workforce`** repository → **Begin setup**
3. Build settings:
   - **Framework preset:** `None`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Before saving, expand **Environment variables (advanced)** and add:
   - Name: `VITE_API_URL`
   - Value: `https://cadensiq.celestsolutions.workers.dev`
5. **Save and deploy**

Every future `git push` to `master` now automatically redeploys. 🎉

### Option B: Direct upload (manual)

```bash
npm run build
npx wrangler pages deploy dist --project-name=cadensiq
```

## 3. Share with your client

Your app will be live at:

```
https://cadensiq.pages.dev        (or <project>.pages.dev)
```

Custom domain (optional): Pages project → **Custom domains** → add e.g.
`app.celestsolutions.com` (domain must be added to your Cloudflare account).

## Kiosk on the company phone

Open `https://<your-pages-url>/kiosk` on the phone → browser menu →
**"Add to Home Screen"** → launches full-screen as an app.

## Environment variables reference

| Variable | Where | Purpose |
|---|---|---|
| `VITE_API_URL` | Frontend build env / `.env` | URL of the Worker API |
| `AUTH_SECRET` | Worker secret (`wrangler secret put AUTH_SECRET`) | Signs login tokens |
