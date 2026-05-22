import { handleCors, json } from './cors.js';
import { handleDb } from './router.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return handleCors();

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({
        ok: true,
        service: 'web0-backend',
        db: '/db/*',
        realtime: 'D1 poll via GET /db/poll',
      });
    }

    if (url.pathname.startsWith('/db')) {
      return handleDb(request, env, ctx);
    }

    return json({ error: 'Not found' }, 404);
  },
};
