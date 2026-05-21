# web0

Chaotic retro miniweb: **GitHub Pages** frontend, **Cloudflare Worker + D1** backend, **Flarum** forum.

## URLs

| Service | URL |
|---------|-----|
| Frontend | https://web0.murgit0.github.io/ |
| API | https://web0-backend.weeblye0.workers.dev |
| API data | `{API}/db/*` |
| WebSocket | `wss://web0-backend.weeblye0.workers.dev/ws` |
| Forum | https://web0.xo.je/forum/public/ |

## Repo layout

```
frontend/     GitHub Pages (vanilla HTML/CSS/JS)
cloudflare/   Worker source (.js, env.D1)
infra/        schema.sql, DEPLOY.md
```

No `wrangler.toml` — bind D1 and Durable Objects in the Cloudflare dashboard. See [infra/DEPLOY.md](infra/DEPLOY.md).

## Features

- Username/password auth (PBKDF2, sessions)
- Site builder (GrapesJS) + public site renderer
- Wheat economy: farm (per-user + global), casino, shop, real-user heists
- Mug kitchen (pixel art), memorial, WebSocket drops
- Games: snake, minesweeper, pong/TTT wagers
- Profiles, wall, MP3 songs on Pages (`/assets/music/`)
- Flarum iframe at `/forum.html`
- 3am easter eggs

## Quick start (local)

Serve frontend: `npx serve frontend` then open http://localhost:3000

Worker must be deployed and D1 schema applied before API calls work.

## Manual mug spawn (admin)

```bash
curl -X POST https://web0-backend.weeblye0.workers.dev/db/mug/spawn \
  -H "X-Admin-Secret: YOUR_SECRET"
```

## License

Kitchen placeholder SVG included; replace with licensed asset from illustAC #24090144 (see `frontend/assets/kitchen/CREDITS.md`).
