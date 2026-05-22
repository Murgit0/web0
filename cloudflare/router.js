import { handleCors, json } from './cors.js';
import { resolveUser } from './auth.js';
import * as auth from './auth.js';
import * as sites from './sites.js';
import * as economy from './economy.js';
import * as casino from './casino.js';
import * as heist from './heist.js';
import * as mug from './mug.js';
import * as games from './games.js';
import * as profiles from './profiles.js';
import * as easter from './easter.js';
import { checkRateLimit } from './rateLimit.js';
import { withDb } from './db.js';
import { spawnMug } from './mug.js';
import * as poll from './poll.js';

export async function handleDb(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/db\/?/, '') || '';
  const parts = path.split('/').filter(Boolean);
  const method = request.method;
  const user = await resolveUser(request, env);

  if (method === 'OPTIONS') return handleCors();

  const write = ['POST', 'PUT', 'DELETE'].includes(method);
  if (write) {
    const ip = request.headers.get('cf-connecting-ip') || 'anon';
    if (!checkRateLimit(`${ip}:${user?.id || 'x'}`)) return json({ error: 'Rate limited' }, 429);
  }

  try {
    if (parts[0] === 'auth' && parts[1] === 'register' && method === 'POST') return auth.register(request, env);
    if (parts[0] === 'auth' && parts[1] === 'login' && method === 'POST') return auth.login(request, env);

    if (parts[0] === 'sites' && parts.length === 1 && method === 'GET') {
      if (url.searchParams.has('public')) return sites.listPublicSites(request, env);
      return sites.listSites(request, env, user);
    }
    if (parts[0] === 'sites' && parts.length === 1 && method === 'POST') return sites.createSite(request, env, user);
    if (parts[0] === 'sites' && parts.length === 2 && method === 'GET') return sites.getSite(request, env, parts[1]);
    if (parts[0] === 'sites' && parts.length === 2 && method === 'PUT') return sites.updateSite(request, env, user, parts[1]);
    if (parts[0] === 'sites' && parts.length === 2 && method === 'DELETE') return sites.deleteSite(request, env, user, parts[1]);

    if (parts[0] === 'wheat' && parts[1] === 'balance' && method === 'GET') return economy.getBalance(request, env, user);
    if (parts[0] === 'farm' && parts[1] === 'state' && method === 'GET') return economy.getFarm(request, env, user);
    if (parts[0] === 'farm' && parts[1] === 'plant' && method === 'POST') return economy.plantPlot(request, env, user);
    if (parts[0] === 'farm' && parts[1] === 'harvest' && method === 'POST') return economy.harvestPlot(request, env, user);
    if (parts[0] === 'farm' && parts[1] === 'global' && parts[2] === 'plant' && method === 'POST') return economy.plantGlobal(request, env, user);
    if (parts[0] === 'farm' && parts[1] === 'global' && parts[2] === 'harvest' && method === 'POST') return economy.harvestGlobal(request, env, user);
    if (parts[0] === 'farm' && parts[1] === 'sell' && method === 'POST') return economy.sellCrops(request, env, user);

    if (parts[0] === 'shop' && parts.length === 1 && method === 'GET') return economy.shopList();
    if (parts[0] === 'shop' && parts[1] === 'buy' && method === 'POST') return economy.shopBuy(request, env, user);
    if (parts[0] === 'leaderboard' && method === 'GET') return economy.leaderboard(request, env);

    if (parts[0] === 'casino' && parts[1] === 'bet' && method === 'POST') return casino.bet(request, env, user);
    if (parts[0] === 'heist' && method === 'POST') return heist.attemptHeist(request, env, user);

    if (parts[0] === 'mug' && parts[1] === 'spawn' && method === 'POST') {
      const secret = request.headers.get('X-Admin-Secret');
      if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) return json({ error: 'Forbidden' }, 403);
      return withDb(env, async (db) => {
        const mugEvent = await spawnMug(db, false);
        return json({ mug: mugEvent });
      });
    }
    if (parts[0] === 'mug' && parts[1] === 'kitchen' && method === 'GET') return mug.getKitchenState(request, env);
    if (parts[0] === 'mug' && parts[1] === 'memorial' && method === 'GET') return mug.listMemorial(request, env);
    if (parts[0] === 'mug' && parts[1] === 'catch' && method === 'POST') return mug.catchMug(request, env, user);
    if (parts[0] === 'mug' && parts[1] === 'clean' && method === 'POST') return mug.cleanKitchen(request, env, user);

    if (parts[0] === 'games' && parts[1] === 'score' && method === 'POST') return games.submitScore(request, env, user);
    if (parts[0] === 'games' && parts[1] === 'leaderboard' && parts[2] && method === 'GET') {
      return games.gameLeaderboard(request, env, parts[2]);
    }
    if (parts[0] === 'poll' && method === 'GET') return poll.pollEvents(request, env);

    if (parts[0] === 'games' && parts[1] === 'match' && method === 'POST') return games.createMatch(request, env, user);
    if (parts[0] === 'games' && parts[1] === 'match' && parts[2] && parts.length === 3 && method === 'GET') {
      return games.getMatch(request, env, parts[2]);
    }
    if (parts[0] === 'games' && parts[1] === 'match' && parts[2] && parts[3] === 'join' && method === 'POST') {
      return games.joinMatch(request, env, user, parts[2]);
    }
    if (parts[0] === 'games' && parts[1] === 'match' && parts[2] && parts[3] === 'resolve' && method === 'POST') {
      return games.resolveMatch(request, env, user, parts[2]);
    }

    if (parts[0] === 'profiles' && parts[1] === 'me' && method === 'GET') return profiles.me(request, env, user);
    if (parts[0] === 'profiles' && parts[1] === 'me' && method === 'PUT') return profiles.updateProfile(request, env, user);
    if (parts[0] === 'profiles' && parts[1] && parts[2] === 'wall' && method === 'POST') {
      return profiles.postWall(request, env, user, parts[1]);
    }
    if (parts[0] === 'profiles' && parts[1] && method === 'GET') return profiles.getProfile(request, env, parts[1]);

    if (parts[0] === 'easter' && parts[1] === 'check' && method === 'GET') return easter.checkEaster(request, env, user);

    if (parts[0] === 'health' && method === 'GET') return json({ ok: true, service: 'web0-backend' });

    return json({ error: 'Not found', path }, 404);
  } catch (e) {
    return json({ error: e.message || 'Server error' }, 500);
  }
}
