# Deploy web0

## 1. D1 (Cloudflare dashboard)

1. Create database `web0`.
2. Console → paste and run `infra/schema.sql`.

## 2. Worker `web0-backend`

1. Upload `/cloudflare` modules (ES modules, `index.js` entry).
2. **Bindings:**
   - `D1` → database `web0` (variable name must be `D1`)
   - `MUG_HUB` → Durable Object, class name `MugHub`, script `web0-backend`
3. **Durable Object migration:** add migration tag `v1` with class `MugHub` in Worker settings (or via CLI once).
3. Optional var: `ADMIN_SECRET` for `POST /db/mug/spawn` (manual mug drops).
4. Deploy. URL: `https://web0-backend.weeblye0.workers.dev`

## 3. GitHub Pages

1. Repo Settings → Pages → deploy from `/frontend` on `main`.
2. Site: `https://web0.murgit0.github.io/`

## 4. Flarum

Embed URL in `frontend/js/config.js`: `https://web0.xo.je/forum/public/`

## 5. Kitchen PNG

Download [AC Illust #24090144](https://en.ac-illust.com/clip-art/24090144/kitchen-at-dusk--pixel-art-) → `frontend/assets/kitchen/kitchen-at-dusk.png` and update `kitchen.html` img `src`.
