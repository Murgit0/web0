import { handleCors, json } from './cors.js';
import { handleDb } from './router.js';
import { MugHub } from './MugHub.js';
export { MugHub };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return handleCors();

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({
        ok: true,
        service: 'web0-backend',
        db: '/db/*',
        ws: '/ws',
      });
    }

    if (url.pathname.startsWith('/db')) {
      return handleDb(request, env, ctx);
    }

    if (url.pathname === '/ws') {
      if (env.MUG_HUB) {
        const id = env.MUG_HUB.idFromName('global');
        const stub = env.MUG_HUB.get(id);
        return stub.fetch(request);
      }
      return new Response('WebSocket requires MUG_HUB Durable Object binding', { status: 503 });
    }

    return json({ error: 'Not found' }, 404);
  },
};
