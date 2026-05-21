import { json } from './cors.js';
import { withDb, uuid } from './db.js';
import { requireUser } from './auth.js';

const GROWTH_MS = 60000; // 1 min demo; use 3600000 for 1hr in prod
const HARVEST_WHEAT = 15;
const HARVEST_CROPS = 10;
const USER_PLOTS = 4;

export async function getBalance(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  return withDb(env, async (db) => {
    const p = await db.prepare('SELECT wheat_balance, crop_balance FROM profiles WHERE user_id = ?').bind(user.id).first();
    return json({ wheat: p?.wheat_balance ?? 0, crops: p?.crop_balance ?? 0 });
  });
}

async function adjustWheat(db, userId, delta, reason) {
  await db.prepare('UPDATE profiles SET wheat_balance = wheat_balance + ? WHERE user_id = ?').bind(delta, userId).run();
  await db.prepare('INSERT INTO wheat_ledger (id, user_id, delta, reason) VALUES (?, ?, ?, ?)').bind(uuid(), userId, delta, reason).run();
}

export async function getFarm(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  return withDb(env, async (db) => {
    const { results: plots } = await db
      .prepare('SELECT * FROM farm_plots WHERE user_id = ? ORDER BY plot_index')
      .bind(user.id)
      .all();
    while (plots.length < USER_PLOTS) {
      const idx = plots.length;
      await db.prepare('INSERT INTO farm_plots (id, user_id, plot_index) VALUES (?, ?, ?)').bind(uuid(), user.id, idx).run();
      plots.push({ plot_index: idx, crop: null, planted_at: null });
    }
    const { results: globalPlots } = await db.prepare('SELECT * FROM global_farm ORDER BY plot_index').all();
    const weather = await db.prepare('SELECT * FROM weather_state WHERE id = 1').first();
    return json({ plots, globalPlots, weather });
  });
}

export async function plantPlot(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const plotIndex = parseInt(body.plot_index, 10);
  const crop = (body.crop || 'wheat').slice(0, 20);
  if (plotIndex < 0 || plotIndex >= USER_PLOTS) return json({ error: 'Invalid plot' }, 400);
  return withDb(env, async (db) => {
    const plot = await db
      .prepare('SELECT * FROM farm_plots WHERE user_id = ? AND plot_index = ?')
      .bind(user.id, plotIndex)
      .first();
    if (plot?.crop) return json({ error: 'Plot occupied' }, 400);
    await db
      .prepare('UPDATE farm_plots SET crop = ?, planted_at = datetime("now") WHERE user_id = ? AND plot_index = ?')
      .bind(crop, user.id, plotIndex)
      .run();
    return json({ ok: true });
  });
}

export async function harvestPlot(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const plotIndex = parseInt(body.plot_index, 10);
  return withDb(env, async (db) => {
    const plot = await db
      .prepare('SELECT * FROM farm_plots WHERE user_id = ? AND plot_index = ?')
      .bind(user.id, plotIndex)
      .first();
    if (!plot?.crop || !plot.planted_at) return json({ error: 'Nothing to harvest' }, 400);
    const planted = new Date(plot.planted_at + 'Z').getTime();
    if (Date.now() - planted < GROWTH_MS) return json({ error: 'Still growing' }, 400);
    const weather = await db.prepare('SELECT yield_modifier FROM weather_state WHERE id = 1').first();
    const mod = weather?.yield_modifier ?? 1;
    const wheat = Math.round(HARVEST_WHEAT * mod);
    const crops = Math.round(HARVEST_CROPS * mod);
    await db
      .prepare('UPDATE farm_plots SET crop = NULL, planted_at = NULL WHERE user_id = ? AND plot_index = ?')
      .bind(user.id, plotIndex)
      .run();
    await db
      .prepare('UPDATE profiles SET wheat_balance = wheat_balance + ?, crop_balance = crop_balance + ? WHERE user_id = ?')
      .bind(wheat, crops, user.id)
      .run();
    await adjustWheat(db, user.id, 0, 'harvest'); // ledger entry for crops via separate if needed
    return json({ wheat, crops });
  });
}

export async function plantGlobal(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const plotIndex = parseInt(body.plot_index, 10);
  const crop = (body.crop || 'wheat').slice(0, 20);
  if (plotIndex < 0 || plotIndex > 7) return json({ error: 'Invalid plot' }, 400);
  return withDb(env, async (db) => {
    const g = await db.prepare('SELECT * FROM global_farm WHERE plot_index = ?').bind(plotIndex).first();
    if (g?.crop) return json({ error: 'Plot occupied' }, 400);
    await db
      .prepare('UPDATE global_farm SET crop = ?, planted_by = ?, planted_at = datetime("now") WHERE plot_index = ?')
      .bind(crop, user.id, plotIndex)
      .run();
    return json({ ok: true });
  });
}

export async function harvestGlobal(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const plotIndex = parseInt(body.plot_index, 10);
  return withDb(env, async (db) => {
    const g = await db.prepare('SELECT * FROM global_farm WHERE plot_index = ?').bind(plotIndex).first();
    if (!g?.crop || !g.planted_at) return json({ error: 'Nothing to harvest' }, 400);
    const planted = new Date(g.planted_at + 'Z').getTime();
    if (Date.now() - planted < GROWTH_MS) return json({ error: 'Still growing' }, 400);
    const weather = await db.prepare('SELECT yield_modifier FROM weather_state WHERE id = 1').first();
    const mod = weather?.yield_modifier ?? 1;
    const totalWheat = Math.round(HARVEST_WHEAT * mod);
    const totalCrops = Math.round(HARVEST_CROPS * mod);
    const planterShare = g.planted_by === user.id ? 0.6 : 0.4;
    const harvesterShare = 1 - planterShare;
    const myWheat = Math.round(totalWheat * (g.planted_by === user.id ? planterShare + harvesterShare : harvesterShare));
    const myCrops = Math.round(totalCrops * (g.planted_by === user.id ? planterShare + harvesterShare : harvesterShare));
    if (g.planted_by && g.planted_by !== user.id) {
      const planterWheat = Math.round(totalWheat * 0.6);
      await db
        .prepare('UPDATE profiles SET wheat_balance = wheat_balance + ?, crop_balance = crop_balance + ? WHERE user_id = ?')
        .bind(planterWheat, Math.round(totalCrops * 0.6), g.planted_by)
        .run();
    }
    await db
      .prepare('UPDATE global_farm SET crop = NULL, planted_by = NULL, planted_at = NULL WHERE plot_index = ?')
      .bind(plotIndex)
      .run();
    await db
      .prepare('UPDATE profiles SET wheat_balance = wheat_balance + ?, crop_balance = crop_balance + ? WHERE user_id = ?')
      .bind(myWheat, myCrops, user.id)
      .run();
    return json({ wheat: myWheat, crops: myCrops });
  });
}

export async function sellCrops(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const amount = Math.min(parseInt(body.amount || '0', 10), 1000);
  return withDb(env, async (db) => {
    const p = await db.prepare('SELECT crop_balance FROM profiles WHERE user_id = ?').bind(user.id).first();
    if ((p?.crop_balance ?? 0) < amount) return json({ error: 'Not enough crops' }, 400);
    const wheat = amount * 2;
    await db
      .prepare('UPDATE profiles SET crop_balance = crop_balance - ?, wheat_balance = wheat_balance + ? WHERE user_id = ?')
      .bind(amount, wheat, user.id)
      .run();
    return json({ wheat_gained: wheat });
  });
}

export async function shopList() {
  return json({
    items: [
      { id: 'nothing', name: 'Nothing', cost: 50 },
      { id: 'air', name: 'Air', cost: 10 },
      { id: 'pixel', name: 'A Single Pixel', cost: 100 },
      { id: 'tuesday', name: 'The Concept of Tuesday', cost: 200 },
      { id: 'curse', name: 'A Curse', cost: 500 },
      { id: 'void', name: 'Void', cost: 0 },
      { id: 'dignity', name: "Dave's Dignity", cost: 9999, sold_out: true },
      { id: 'negative', name: 'Negative Nothing', cost: -50 },
    ],
  });
}

export async function shopBuy(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const itemId = body.item_id;
  const items = {
    nothing: 50, air: 10, pixel: 100, tuesday: 200, curse: 500, void: 0, negative: -50,
  };
  if (!(itemId in items) || itemId === 'dignity') return json({ error: 'Invalid item' }, 400);
  const cost = items[itemId];
  return withDb(env, async (db) => {
    const p = await db.prepare('SELECT wheat_balance FROM profiles WHERE user_id = ?').bind(user.id).first();
    if (cost > 0 && (p?.wheat_balance ?? 0) < cost) return json({ error: 'Not enough wheat' }, 400);
    await db
      .prepare('UPDATE profiles SET wheat_balance = wheat_balance - ? WHERE user_id = ?')
      .bind(cost, user.id)
      .run();
    await db
      .prepare('INSERT INTO shop_purchases (id, user_id, item_id, wheat_cost) VALUES (?, ?, ?, ?)')
      .bind(uuid(), user.id, itemId, cost)
      .run();
    return json({ ok: true, message: cost <= 0 ? 'You gained wheat somehow.' : 'no' });
  });
}

export async function leaderboard(request, env) {
  return withDb(env, async (db) => {
    const { results } = await db
      .prepare(
        `SELECT u.username, p.wheat_balance, p.crop_balance FROM profiles p
         JOIN users u ON u.id = p.user_id ORDER BY p.wheat_balance DESC LIMIT 20`
      )
      .all();
    const balances = results.map((r) => r.wheat_balance);
    const gini = computeGini(balances);
    return json({ leaderboard: results, gini });
  });
}

function computeGini(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (2 * (i + 1) - n - 1) * sorted[i];
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return 0;
  return Math.round((sum / (n * n * mean)) * 1000) / 1000;
}

export { adjustWheat, HARVEST_WHEAT };
