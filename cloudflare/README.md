# Cloudflare Worker scripts (`web0-backend`)

**All code you deploy to the Worker lives in this folder.**

## Upload all `.js` files (recommended)

Set **`index.js`** as the main module. Upload **every** file below into the same Worker (no subfolders needed).

In the Cloudflare dashboard → Worker `web0-backend` → **Edit code** (or upload folder), include **all** of these:

| File | Role |
|------|------|
| `index.js` | Entry — **set as main module** |
| `router.js` | `/db/*` routing |
| `auth.js` | Register / login / sessions |
| `db.js` | `env.D1` helper |
| `cors.js` | CORS for GitHub Pages |
| `rateLimit.js` | Write rate limits |
| `sanitize.js` | HTML / input validation |
| `sites.js` | Site CRUD |
| `economy.js` | Wheat, farm, shop, leaderboard |
| `casino.js` | Casino bets |
| `heist.js` | Real-user heists |
| `mug.js` | Mug drops, catch, memorial API |
| `poll.js` | D1 realtime events + `GET /db/poll` |
| `games.js` | Scores, matches, wagers |
| `profiles.js` | Profiles + wall |
| `easter.js` | 3am checks |

**Binding (required):** variable name **`D1`** → D1 database `web0`.

**Do not** add Durable Object bindings.

## Option B — Single file (easiest for dashboard paste)

1. From this directory run: `npm install && npm run bundle`
2. Upload or paste **`worker.upload.js`** as the only script (main handler).
3. Same **`D1`** binding as above.

Regenerate the bundle after any change to the `.js` files in this folder.

## Optional environment variables

| Name | Purpose |
|------|---------|
| `ADMIN_SECRET` | Protects `POST /db/mug/spawn` |

## Verify

```bash
curl https://web0-backend.weeblye0.workers.dev/
curl https://web0-backend.weeblye0.workers.dev/db/health
```

## Database

Run SQL from repo root (not uploaded to Worker):

- New DB: `../infra/schema.sql`
- Existing DB: `../infra/migrations/001_realtime_events.sql`
