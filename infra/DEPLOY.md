# Deploy web0

## 1. D1 (Cloudflare dashboard)

1. Create database `web0`.
2. Console → paste and run `infra/schema.sql`.

## 2. Worker `web0-backend`

All Worker scripts are in **`/cloudflare`**. See [cloudflare/README.md](../cloudflare/README.md).

**Quick:** paste `cloudflare/worker.upload.js` (or upload all `.js` files with `index.js` as entry).

1. **Bindings:**
   - `D1` → database `web0` (variable name must be `D1`)
3. Optional var: `ADMIN_SECRET` for `POST /db/mug/spawn` (manual mug drops).

   Realtime: D1 table `realtime_events` + `GET /db/poll` (no Durable Objects).

4. Deploy. URL: `https://web0-backend.weeblye0.workers.dev`

## 3. GitHub Pages

1. Repo Settings → Pages → deploy from `/frontend` on `main`.
2. Site: `https://web0.murgit0.github.io/`

## 4. Flarum

Embed URL in `frontend/js/config.js`: `https://web0.xo.je/forum/public/`

## 5. Kitchen PNG

Download [AC Illust #24090144](https://en.ac-illust.com/clip-art/24090144/kitchen-at-dusk--pixel-art-) → `frontend/assets/kitchen/kitchen-at-dusk.png` and update `kitchen.html` img `src`.
