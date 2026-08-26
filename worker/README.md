# Unified Workforce API (Cloudflare Worker)

Backend for the People & Organization platform. D1 for data.
(R2 document storage is deferred — it requires enabling through the Cloudflare Dashboard.)

## One-time setup

```bash
cd worker
npm install -g wrangler        # if not installed
wrangler login                 # opens browser — use your Cloudflare account

# Create the database, then copy the D1 database_id into wrangler.jsonc
wrangler d1 create workforce

# Apply the schema
wrangler d1 execute workforce --file=./schema.sql --remote

# Set a real auth secret
wrangler secret put AUTH_SECRET   # paste a long random string when prompted
```

Also replace `database_id` in `wrangler.jsonc` with the id printed by `d1 create`.

## Local development

```bash
wrangler dev     # API on http://localhost:8787
```

Seeded accounts (created automatically on first login attempt):

| Account | Email / username | Password |
|---|---|---|
| Administrator | admin_celestine | Celest!ne2026! |
| Platform CEO | ceo@celestsolutions.com | P@ssw0rd2026! |

## Deploy

```bash
wrangler deploy
```

Note the deployed URL (e.g. https://unified-workforce-api.<your-subdomain>.workers.dev).

## Connect the frontend

Create `.env` in the project root:

```
VITE_API_URL=https://unified-workforce-api.<your-subdomain>.workers.dev
```

Then rebuild/redeploy the frontend (`npm run build`). Without this variable the
app keeps running in local demo mode (localStorage).
