// cors.js
var ALLOWED_ORIGIN = "https://web0.murgit0.github.io";
function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-Token, X-User-Tz",
    ...extra
  };
}
function handleCors() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({ "Content-Type": "application/json", ...extra })
  });
}

// db.js
function getDb(env) {
  const db = env.D1;
  if (!db) throw new Error('D1 binding "D1" not configured');
  return db;
}
async function withDb(env, fn) {
  const db = getDb(env);
  await db.prepare("PRAGMA foreign_keys = ON").run();
  return fn(db);
}
function uuid() {
  return crypto.randomUUID();
}

// sanitize.js
var FORBIDDEN = /<script\b|javascript:|on\w+\s*=/gi;
function sanitizeHtml(html) {
  if (!html || typeof html !== "string") return "";
  let out = html.replace(FORBIDDEN, "");
  out = out.replace(/<iframe\b/gi, '<iframe sandbox=""');
  return out.slice(0, 2e5);
}
function sanitizeCss(css) {
  if (!css || typeof css !== "string") return "";
  return css.replace(/expression\s*\(|javascript:/gi, "").slice(0, 1e5);
}
function sanitizeJs(js) {
  return "";
}
function validSlug(slug) {
  return typeof slug === "string" && /^[a-z0-9-]{2,32}$/.test(slug);
}
function validUsername(u) {
  return typeof u === "string" && /^[a-zA-Z0-9_]{3,24}$/.test(u);
}

// auth.js
var SESSION_DAYS = 30;
async function hashPassword(password, saltB64) {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 1e5, hash: "SHA-256" },
    key,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
function newSalt() {
  const s = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...s));
}
async function register(request, env) {
  const body = await request.json().catch(() => ({}));
  const { username, password, display_name } = body;
  if (!validUsername(username) || typeof password !== "string" || password.length < 8) {
    return json({ error: "Invalid username or password (min 8 chars)" }, 400);
  }
  return withDb(env, async (db) => {
    const existing = await db.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existing) return json({ error: "Username taken" }, 409);
    const salt = newSalt();
    const password_hash = await hashPassword(password, salt);
    const id = uuid();
    await db.batch([
      db.prepare("INSERT INTO users (id, username, password_hash, salt, display_name) VALUES (?, ?, ?, ?, ?)").bind(
        id,
        username,
        password_hash,
        salt,
        display_name || username
      ),
      db.prepare("INSERT INTO profiles (user_id) VALUES (?)").bind(id)
    ]);
    const session = await createSession(db, id);
    return json({ user: { id, username, display_name: display_name || username }, token: session.token });
  });
}
async function login(request, env) {
  const body = await request.json().catch(() => ({}));
  const { username, password } = body;
  if (!validUsername(username) || typeof password !== "string") {
    return json({ error: "Invalid credentials" }, 400);
  }
  return withDb(env, async (db) => {
    const user = await db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
    if (!user) return json({ error: "Invalid credentials" }, 401);
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.password_hash) return json({ error: "Invalid credentials" }, 401);
    const session = await createSession(db, user.id);
    return json({
      user: { id: user.id, username: user.username, display_name: user.display_name },
      token: session.token
    });
  });
}
async function createSession(db, userId) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const id = uuid();
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await db.prepare("INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)").bind(id, userId, token, expires).run();
  return { token };
}
async function resolveUser(request, env) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("X-Session-Token");
  if (!token) return null;
  return withDb(env, async (db) => {
    const row = await db.prepare(
      `SELECT u.id, u.username, u.display_name FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > datetime('now')`
    ).bind(token).first();
    return row || null;
  });
}
function requireUser(user) {
  if (!user) return json({ error: "Unauthorized" }, 401);
  return null;
}

// sites.js
async function listSites(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  return withDb(env, async (db) => {
    const { results } = await db.prepare("SELECT id, slug, title, created_at FROM sites WHERE owner_id = ? ORDER BY created_at DESC").bind(user.id).all();
    return json({ sites: results });
  });
}
async function listPublicSites(request, env) {
  return withDb(env, async (db) => {
    const limit = Math.min(parseInt(new URL(request.url).searchParams.get("limit") || "8", 10), 50);
    const { results } = await db.prepare("SELECT id, slug, title, created_at FROM sites ORDER BY created_at DESC LIMIT ?").bind(limit).all();
    return json({ sites: results });
  });
}
async function getSite(request, env, idOrSlug) {
  return withDb(env, async (db) => {
    const site = await db.prepare("SELECT id, slug, title, html, css, js, blocks_meta, owner_id, created_at FROM sites WHERE id = ? OR slug = ?").bind(idOrSlug, idOrSlug).first();
    if (!site) return json({ error: "Not found" }, 404);
    return json({ site });
  });
}
async function createSite(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const slug = (body.slug || "").toLowerCase();
  const title = (body.title || "My Site").slice(0, 80);
  if (!validSlug(slug)) return json({ error: "Invalid slug" }, 400);
  return withDb(env, async (db) => {
    const taken = await db.prepare("SELECT id FROM sites WHERE slug = ?").bind(slug).first();
    if (taken) return json({ error: "Slug taken" }, 409);
    const id = uuid();
    await db.prepare("INSERT INTO sites (id, owner_id, slug, title) VALUES (?, ?, ?, ?)").bind(id, user.id, slug, title).run();
    return json({ site: { id, slug, title } }, 201);
  });
}
async function updateSite(request, env, user, id) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  return withDb(env, async (db) => {
    const site = await db.prepare("SELECT * FROM sites WHERE id = ?").bind(id).first();
    if (!site) return json({ error: "Not found" }, 404);
    if (site.owner_id !== user.id) return json({ error: "Forbidden" }, 403);
    const html = sanitizeHtml(body.html ?? site.html);
    const css = sanitizeCss(body.css ?? site.css);
    const js = sanitizeJs(body.js ?? site.js);
    const title = (body.title ?? site.title).slice(0, 80);
    const blocks_meta = JSON.stringify(body.blocks_meta ?? JSON.parse(site.blocks_meta || "{}"));
    await db.prepare("UPDATE sites SET html = ?, css = ?, js = ?, blocks_meta = ?, title = ? WHERE id = ?").bind(html, css, js, blocks_meta, title, id).run();
    return json({ ok: true });
  });
}
async function deleteSite(request, env, user, id) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  return withDb(env, async (db) => {
    const site = await db.prepare("SELECT owner_id FROM sites WHERE id = ?").bind(id).first();
    if (!site) return json({ error: "Not found" }, 404);
    if (site.owner_id !== user.id) return json({ error: "Forbidden" }, 403);
    await db.prepare("DELETE FROM sites WHERE id = ?").bind(id).run();
    return json({ ok: true });
  });
}

// economy.js
var GROWTH_MS = 6e4;
var HARVEST_WHEAT = 15;
var HARVEST_CROPS = 10;
var USER_PLOTS = 4;
async function getBalance(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  return withDb(env, async (db) => {
    const p = await db.prepare("SELECT wheat_balance, crop_balance FROM profiles WHERE user_id = ?").bind(user.id).first();
    return json({ wheat: p?.wheat_balance ?? 0, crops: p?.crop_balance ?? 0 });
  });
}
async function adjustWheat(db, userId, delta, reason) {
  await db.prepare("UPDATE profiles SET wheat_balance = wheat_balance + ? WHERE user_id = ?").bind(delta, userId).run();
  await db.prepare("INSERT INTO wheat_ledger (id, user_id, delta, reason) VALUES (?, ?, ?, ?)").bind(uuid(), userId, delta, reason).run();
}
async function getFarm(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  return withDb(env, async (db) => {
    const { results: plots } = await db.prepare("SELECT * FROM farm_plots WHERE user_id = ? ORDER BY plot_index").bind(user.id).all();
    while (plots.length < USER_PLOTS) {
      const idx = plots.length;
      await db.prepare("INSERT INTO farm_plots (id, user_id, plot_index) VALUES (?, ?, ?)").bind(uuid(), user.id, idx).run();
      plots.push({ plot_index: idx, crop: null, planted_at: null });
    }
    const { results: globalPlots } = await db.prepare("SELECT * FROM global_farm ORDER BY plot_index").all();
    const weather = await db.prepare("SELECT * FROM weather_state WHERE id = 1").first();
    return json({ plots, globalPlots, weather });
  });
}
async function plantPlot(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const plotIndex = parseInt(body.plot_index, 10);
  const crop = (body.crop || "wheat").slice(0, 20);
  if (plotIndex < 0 || plotIndex >= USER_PLOTS) return json({ error: "Invalid plot" }, 400);
  return withDb(env, async (db) => {
    const plot = await db.prepare("SELECT * FROM farm_plots WHERE user_id = ? AND plot_index = ?").bind(user.id, plotIndex).first();
    if (plot?.crop) return json({ error: "Plot occupied" }, 400);
    await db.prepare('UPDATE farm_plots SET crop = ?, planted_at = datetime("now") WHERE user_id = ? AND plot_index = ?').bind(crop, user.id, plotIndex).run();
    return json({ ok: true });
  });
}
async function harvestPlot(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const plotIndex = parseInt(body.plot_index, 10);
  return withDb(env, async (db) => {
    const plot = await db.prepare("SELECT * FROM farm_plots WHERE user_id = ? AND plot_index = ?").bind(user.id, plotIndex).first();
    if (!plot?.crop || !plot.planted_at) return json({ error: "Nothing to harvest" }, 400);
    const planted = (/* @__PURE__ */ new Date(plot.planted_at + "Z")).getTime();
    if (Date.now() - planted < GROWTH_MS) return json({ error: "Still growing" }, 400);
    const weather = await db.prepare("SELECT yield_modifier FROM weather_state WHERE id = 1").first();
    const mod = weather?.yield_modifier ?? 1;
    const wheat = Math.round(HARVEST_WHEAT * mod);
    const crops = Math.round(HARVEST_CROPS * mod);
    await db.prepare("UPDATE farm_plots SET crop = NULL, planted_at = NULL WHERE user_id = ? AND plot_index = ?").bind(user.id, plotIndex).run();
    await db.prepare("UPDATE profiles SET wheat_balance = wheat_balance + ?, crop_balance = crop_balance + ? WHERE user_id = ?").bind(wheat, crops, user.id).run();
    await adjustWheat(db, user.id, 0, "harvest");
    return json({ wheat, crops });
  });
}
async function plantGlobal(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const plotIndex = parseInt(body.plot_index, 10);
  const crop = (body.crop || "wheat").slice(0, 20);
  if (plotIndex < 0 || plotIndex > 7) return json({ error: "Invalid plot" }, 400);
  return withDb(env, async (db) => {
    const g = await db.prepare("SELECT * FROM global_farm WHERE plot_index = ?").bind(plotIndex).first();
    if (g?.crop) return json({ error: "Plot occupied" }, 400);
    await db.prepare('UPDATE global_farm SET crop = ?, planted_by = ?, planted_at = datetime("now") WHERE plot_index = ?').bind(crop, user.id, plotIndex).run();
    return json({ ok: true });
  });
}
async function harvestGlobal(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const plotIndex = parseInt(body.plot_index, 10);
  return withDb(env, async (db) => {
    const g = await db.prepare("SELECT * FROM global_farm WHERE plot_index = ?").bind(plotIndex).first();
    if (!g?.crop || !g.planted_at) return json({ error: "Nothing to harvest" }, 400);
    const planted = (/* @__PURE__ */ new Date(g.planted_at + "Z")).getTime();
    if (Date.now() - planted < GROWTH_MS) return json({ error: "Still growing" }, 400);
    const weather = await db.prepare("SELECT yield_modifier FROM weather_state WHERE id = 1").first();
    const mod = weather?.yield_modifier ?? 1;
    const totalWheat = Math.round(HARVEST_WHEAT * mod);
    const totalCrops = Math.round(HARVEST_CROPS * mod);
    const planterShare = g.planted_by === user.id ? 0.6 : 0.4;
    const harvesterShare = 1 - planterShare;
    const myWheat = Math.round(totalWheat * (g.planted_by === user.id ? planterShare + harvesterShare : harvesterShare));
    const myCrops = Math.round(totalCrops * (g.planted_by === user.id ? planterShare + harvesterShare : harvesterShare));
    if (g.planted_by && g.planted_by !== user.id) {
      const planterWheat = Math.round(totalWheat * 0.6);
      await db.prepare("UPDATE profiles SET wheat_balance = wheat_balance + ?, crop_balance = crop_balance + ? WHERE user_id = ?").bind(planterWheat, Math.round(totalCrops * 0.6), g.planted_by).run();
    }
    await db.prepare("UPDATE global_farm SET crop = NULL, planted_by = NULL, planted_at = NULL WHERE plot_index = ?").bind(plotIndex).run();
    await db.prepare("UPDATE profiles SET wheat_balance = wheat_balance + ?, crop_balance = crop_balance + ? WHERE user_id = ?").bind(myWheat, myCrops, user.id).run();
    return json({ wheat: myWheat, crops: myCrops });
  });
}
async function sellCrops(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const amount = Math.min(parseInt(body.amount || "0", 10), 1e3);
  return withDb(env, async (db) => {
    const p = await db.prepare("SELECT crop_balance FROM profiles WHERE user_id = ?").bind(user.id).first();
    if ((p?.crop_balance ?? 0) < amount) return json({ error: "Not enough crops" }, 400);
    const wheat = amount * 2;
    await db.prepare("UPDATE profiles SET crop_balance = crop_balance - ?, wheat_balance = wheat_balance + ? WHERE user_id = ?").bind(amount, wheat, user.id).run();
    return json({ wheat_gained: wheat });
  });
}
async function shopList() {
  return json({
    items: [
      { id: "nothing", name: "Nothing", cost: 50 },
      { id: "air", name: "Air", cost: 10 },
      { id: "pixel", name: "A Single Pixel", cost: 100 },
      { id: "tuesday", name: "The Concept of Tuesday", cost: 200 },
      { id: "curse", name: "A Curse", cost: 500 },
      { id: "void", name: "Void", cost: 0 },
      { id: "dignity", name: "Dave's Dignity", cost: 9999, sold_out: true },
      { id: "negative", name: "Negative Nothing", cost: -50 }
    ]
  });
}
async function shopBuy(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const itemId = body.item_id;
  const items = {
    nothing: 50,
    air: 10,
    pixel: 100,
    tuesday: 200,
    curse: 500,
    void: 0,
    negative: -50
  };
  if (!(itemId in items) || itemId === "dignity") return json({ error: "Invalid item" }, 400);
  const cost = items[itemId];
  return withDb(env, async (db) => {
    const p = await db.prepare("SELECT wheat_balance FROM profiles WHERE user_id = ?").bind(user.id).first();
    if (cost > 0 && (p?.wheat_balance ?? 0) < cost) return json({ error: "Not enough wheat" }, 400);
    await db.prepare("UPDATE profiles SET wheat_balance = wheat_balance - ? WHERE user_id = ?").bind(cost, user.id).run();
    await db.prepare("INSERT INTO shop_purchases (id, user_id, item_id, wheat_cost) VALUES (?, ?, ?, ?)").bind(uuid(), user.id, itemId, cost).run();
    return json({ ok: true, message: cost <= 0 ? "You gained wheat somehow." : "no" });
  });
}
async function leaderboard(request, env) {
  return withDb(env, async (db) => {
    const { results } = await db.prepare(
      `SELECT u.username, p.wheat_balance, p.crop_balance FROM profiles p
         JOIN users u ON u.id = p.user_id ORDER BY p.wheat_balance DESC LIMIT 20`
    ).all();
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
  return Math.round(sum / (n * n * mean) * 1e3) / 1e3;
}

// casino.js
var MIN_BET = 5;
var MAX_BET_CAP = 500;
async function bet(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const game = body.game;
  const betAmount = parseInt(body.bet, 10);
  if (!["slots", "flip", "dice"].includes(game)) return json({ error: "Invalid game" }, 400);
  return withDb(env, async (db) => {
    const p = await db.prepare("SELECT wheat_balance FROM profiles WHERE user_id = ?").bind(user.id).first();
    const balance = p?.wheat_balance ?? 0;
    const maxBet = Math.min(MAX_BET_CAP, Math.floor(balance * 0.1));
    if (betAmount < MIN_BET || betAmount > maxBet) {
      return json({ error: `Bet must be ${MIN_BET}-${maxBet}` }, 400);
    }
    if (balance < betAmount) return json({ error: "Not enough wheat" }, 400);
    let payout = 0;
    if (game === "slots") {
      const r = Math.random();
      if (r < 0.1) payout = betAmount * 3;
      else if (r < 0.3) payout = betAmount;
    } else if (game === "flip") {
      payout = Math.random() < 0.475 ? betAmount * 2 : 0;
    } else if (game === "dice") {
      const roll = Math.floor(Math.random() * 6) + 1;
      payout = roll >= 4 ? Math.floor(betAmount * 1.9) : 0;
    }
    const net = payout - betAmount;
    await db.prepare("UPDATE profiles SET wheat_balance = wheat_balance + ? WHERE user_id = ?").bind(net, user.id).run();
    await db.prepare("INSERT INTO casino_bets (id, user_id, game, bet, payout) VALUES (?, ?, ?, ?, ?)").bind(uuid(), user.id, game, betAmount, payout).run();
    return json({ payout, net, balance: balance + net });
  });
}

// heist.js
var HEIST_COST = 25;
var MAX_STEAL = 200;
async function attemptHeist(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const targetUsername = body.target_username;
  if (!validUsername(targetUsername)) return json({ error: "Invalid target" }, 400);
  return withDb(env, async (db) => {
    const target = await db.prepare("SELECT id, username FROM users WHERE username = ?").bind(targetUsername).first();
    if (!target) return json({ error: "User not found" }, 404);
    if (target.id === user.id) return json({ error: "Cannot heist yourself" }, 400);
    const recent = await db.prepare(
      `SELECT id FROM heist_log WHERE attacker_id = ? AND target_id = ? AND created_at > datetime('now', '-1 day')`
    ).bind(user.id, target.id).first();
    if (recent) return json({ error: "Cooldown: 24h per target" }, 429);
    const attacker = await db.prepare("SELECT wheat_balance FROM profiles WHERE user_id = ?").bind(user.id).first();
    if ((attacker?.wheat_balance ?? 0) < HEIST_COST) return json({ error: "Need 25 wheat" }, 400);
    const victim = await db.prepare("SELECT wheat_balance FROM profiles WHERE user_id = ?").bind(target.id).first();
    const success = Math.random() < 0.3;
    let amount = 0;
    if (success) {
      amount = Math.min(MAX_STEAL, Math.floor((victim?.wheat_balance ?? 0) * 0.1));
      await db.prepare("UPDATE profiles SET wheat_balance = wheat_balance - ? WHERE user_id = ?").bind(amount, target.id).run();
      await db.prepare("UPDATE profiles SET wheat_balance = wheat_balance + ? WHERE user_id = ?").bind(amount - HEIST_COST, user.id).run();
    } else {
      await db.prepare("UPDATE profiles SET wheat_balance = wheat_balance - ? WHERE user_id = ?").bind(HEIST_COST, user.id).run();
    }
    await db.prepare("INSERT INTO heist_log (id, attacker_id, target_id, success, amount) VALUES (?, ?, ?, ?, ?)").bind(uuid(), user.id, target.id, success ? 1 : 0, amount).run();
    return json({ success, amount, cost: HEIST_COST });
  });
}

// poll.js
async function pushEvent(db, channel, payload) {
  await db.prepare("INSERT INTO realtime_events (id, channel, payload) VALUES (?, ?, ?)").bind(uuid(), channel, JSON.stringify(payload)).run();
}
async function pollEvents(request, env) {
  const url = new URL(request.url);
  const since = url.searchParams.get("since") || "1970-01-01T00:00:00Z";
  const channel = url.searchParams.get("channel") || "mug:drop";
  return withDb(env, async (db) => {
    const { results } = await db.prepare(
      `SELECT id, channel, payload, created_at FROM realtime_events
         WHERE channel = ? AND created_at > ? ORDER BY created_at ASC LIMIT 50`
    ).bind(channel, since).all();
    const events = results.map((r) => ({
      id: r.id,
      channel: r.channel,
      payload: JSON.parse(r.payload),
      created_at: r.created_at
    }));
    return json({ events, server_time: (/* @__PURE__ */ new Date()).toISOString() });
  });
}

// mug.js
async function getKitchenState(request, env) {
  return withDb(env, async (db) => {
    const shards = await db.prepare("SELECT count FROM mug_shards WHERE id = 1").first();
    const kitchen = await db.prepare("SELECT drought FROM kitchen_state WHERE id = 1").first();
    const active = await db.prepare("SELECT * FROM mug_drops WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").first();
    return json({ shards: shards?.count ?? 0, drought: kitchen?.drought ?? 0, activeDrop: active });
  });
}
async function listMemorial(request, env) {
  return withDb(env, async (db) => {
    const { results } = await db.prepare("SELECT drop_number, cause, died_at FROM mug_memorial ORDER BY died_at DESC LIMIT 200").all();
    return json({ memorial: results });
  });
}
async function catchMug(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const dropId = body.drop_id;
  return withDb(env, async (db) => {
    const kitchen = await db.prepare("SELECT drought FROM kitchen_state WHERE id = 1").first();
    if (kitchen?.drought) return json({ error: "Mug drought active" }, 403);
    const drop = await db.prepare("SELECT * FROM mug_drops WHERE id = ? AND status = ?").bind(dropId, "active").first();
    if (!drop) return json({ error: "No active mug" }, 400);
    const existing = await db.prepare("SELECT id FROM mug_catches WHERE drop_id = ?").bind(dropId).first();
    if (existing) return json({ error: "Already caught" }, 400);
    const created = (/* @__PURE__ */ new Date(drop.created_at + "Z")).getTime();
    const windowMs = body.golden ? 4e3 : 2e3;
    if (Date.now() - created > windowMs) return json({ error: "Too late" }, 400);
    await db.prepare("INSERT INTO mug_catches (id, user_id, drop_id, drop_number) VALUES (?, ?, ?, ?)").bind(uuid(), user.id, dropId, drop.drop_number).run();
    await db.prepare("UPDATE mug_drops SET status = 'caught' WHERE id = ?").bind(dropId).run();
    if (body.golden) {
      await db.prepare("INSERT OR IGNORE INTO badges (id, user_id, badge) VALUES (?, ?, ?)").bind(uuid(), user.id, "3am_mug").run();
    }
    return json({ ok: true, drop_number: drop.drop_number });
  });
}
async function cleanKitchen(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  return withDb(env, async (db) => {
    await db.prepare('UPDATE mug_shards SET count = 0, updated_at = datetime("now") WHERE id = 1').run();
    await db.prepare('UPDATE kitchen_state SET drought = 0, updated_at = datetime("now") WHERE id = 1').run();
    await db.prepare("INSERT OR IGNORE INTO badges (id, user_id, badge) VALUES (?, ?, ?)").bind(uuid(), user.id, "mug_janitor").run();
    return json({ ok: true });
  });
}
async function spawnMug(db, golden = false) {
  const numRow = await db.prepare("SELECT MAX(drop_number) as n FROM mug_drops").first();
  const dropNumber = (numRow?.n ?? 0) + 1;
  const id = uuid();
  await db.prepare("INSERT INTO mug_drops (id, drop_number, status) VALUES (?, ?, ?)").bind(id, dropNumber, "active").run();
  if (Math.random() < 0.5) {
    await shatterMug(db, dropNumber, "shattered on landing");
    const shatter = { type: "shatter", dropNumber };
    await pushEvent(db, "mug:drop", shatter);
    if (Math.random() < 0.5) return spawnMug(db, golden);
    return shatter;
  }
  const drop = { type: "drop", dropId: id, dropNumber, golden };
  await pushEvent(db, "mug:drop", drop);
  return drop;
}
async function shatterMug(db, dropNumber, cause) {
  await db.prepare("INSERT INTO mug_memorial (id, drop_number, cause) VALUES (?, ?, ?)").bind(uuid(), dropNumber, cause).run();
  const shards = await db.prepare("SELECT count FROM mug_shards WHERE id = 1").first();
  const newCount = (shards?.count ?? 0) + Math.floor(Math.random() * 3) + 1;
  await db.prepare('UPDATE mug_shards SET count = ?, updated_at = datetime("now") WHERE id = 1').bind(newCount).run();
  if (newCount > 20) {
    await db.prepare('UPDATE kitchen_state SET drought = 1, updated_at = datetime("now") WHERE id = 1').run();
  }
}

// games.js
var GAME_REWARD = 15;
var MIN_BET2 = 5;
var MAX_BET_CAP2 = 500;
async function submitScore(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const game = body.game;
  const score = parseInt(body.score, 10);
  if (!["snake", "minesweeper"].includes(game) || score < 0) return json({ error: "Invalid" }, 400);
  const threshold = game === "snake" ? 50 : 60;
  return withDb(env, async (db) => {
    await db.prepare("INSERT INTO game_scores (id, user_id, game, score) VALUES (?, ?, ?, ?)").bind(uuid(), user.id, game, score).run();
    let reward = 0;
    if (score >= threshold) {
      reward = GAME_REWARD;
      await db.prepare("UPDATE profiles SET wheat_balance = wheat_balance + ? WHERE user_id = ?").bind(reward, user.id).run();
    }
    return json({ reward, score });
  });
}
async function gameLeaderboard(request, env, game) {
  return withDb(env, async (db) => {
    const { results } = await db.prepare(
      `SELECT u.username, g.score, g.created_at FROM game_scores g
         JOIN users u ON u.id = g.user_id WHERE g.game = ?
         ORDER BY g.score DESC LIMIT 20`
    ).bind(game).all();
    return json({ scores: results });
  });
}
async function createMatch(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const game = body.game;
  const stake = parseInt(body.stake, 10);
  if (!["pong", "ttt"].includes(game)) return json({ error: "Invalid game" }, 400);
  return withDb(env, async (db) => {
    const p = await db.prepare("SELECT wheat_balance FROM profiles WHERE user_id = ?").bind(user.id).first();
    const balance = p?.wheat_balance ?? 0;
    const maxBet = Math.min(MAX_BET_CAP2, Math.floor(balance * 0.1));
    if (stake < MIN_BET2 || stake > maxBet) return json({ error: `Stake ${MIN_BET2}-${maxBet}` }, 400);
    const id = uuid();
    await db.prepare("INSERT INTO game_matches (id, game, player1_id, stake, status) VALUES (?, ?, ?, ?, ?)").bind(id, game, user.id, stake, "waiting").run();
    await pushEvent(db, `game:match:${id}`, { type: "waiting", match_id: id, game });
    return json({ match_id: id });
  });
}
async function joinMatch(request, env, user, matchId) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  return withDb(env, async (db) => {
    const m = await db.prepare("SELECT * FROM game_matches WHERE id = ?").bind(matchId).first();
    if (!m || m.status !== "waiting") return json({ error: "Match unavailable" }, 400);
    if (m.player1_id === user.id) return json({ error: "Cannot join own match" }, 400);
    const p = await db.prepare("SELECT wheat_balance FROM profiles WHERE user_id = ?").bind(user.id).first();
    if ((p?.wheat_balance ?? 0) < m.stake) return json({ error: "Not enough wheat" }, 400);
    await db.prepare("UPDATE game_matches SET player2_id = ?, status = ? WHERE id = ?").bind(user.id, "active", matchId).run();
    await db.prepare("UPDATE profiles SET wheat_balance = wheat_balance - ? WHERE user_id = ?").bind(m.stake, m.player1_id).run();
    await db.prepare("UPDATE profiles SET wheat_balance = wheat_balance - ? WHERE user_id = ?").bind(m.stake, user.id).run();
    const pot = m.stake * 2;
    const winnerCut = Math.floor(pot * 0.9);
    const match = await db.prepare("SELECT * FROM game_matches WHERE id = ?").bind(matchId).first();
    await pushEvent(db, `game:match:${matchId}`, { type: "active", match });
    return json({ match_id: matchId, pot, winner_cut: winnerCut });
  });
}
async function getMatch(request, env, matchId) {
  return withDb(env, async (db) => {
    const m = await db.prepare("SELECT * FROM game_matches WHERE id = ?").bind(matchId).first();
    if (!m) return json({ error: "Not found" }, 404);
    return json({ match: m });
  });
}
async function resolveMatch(request, env, user, matchId) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const winnerId = body.winner_id;
  return withDb(env, async (db) => {
    const m = await db.prepare("SELECT * FROM game_matches WHERE id = ?").bind(matchId).first();
    if (!m || m.status !== "active") return json({ error: "Invalid match" }, 400);
    if (winnerId !== m.player1_id && winnerId !== m.player2_id) return json({ error: "Invalid winner" }, 400);
    const pot = m.stake * 2;
    const payout = Math.floor(pot * 0.9);
    await db.prepare("UPDATE profiles SET wheat_balance = wheat_balance + ? WHERE user_id = ?").bind(payout, winnerId).run();
    await db.prepare("UPDATE game_matches SET status = ? WHERE id = ?").bind("done", matchId).run();
    await pushEvent(db, `game:match:${matchId}`, { type: "done", winner_id: winnerId, payout });
    return json({ payout });
  });
}

// profiles.js
async function getProfile(request, env, username) {
  return withDb(env, async (db) => {
    const user = await db.prepare("SELECT id, username, display_name FROM users WHERE username = ?").bind(username).first();
    if (!user) return json({ error: "Not found" }, 404);
    const profile = await db.prepare("SELECT * FROM profiles WHERE user_id = ?").bind(user.id).first();
    const { results: badges } = await db.prepare("SELECT badge FROM badges WHERE user_id = ?").bind(user.id).all();
    const { results: mugs } = await db.prepare("SELECT drop_number, created_at FROM mug_catches WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all();
    const { results: wall } = await db.prepare(
      `SELECT w.body, w.created_at, u.username as author FROM profile_wall w
         JOIN users u ON u.id = w.author_id WHERE w.profile_user_id = ? ORDER BY w.created_at DESC LIMIT 50`
    ).bind(user.id).all();
    return json({ user, profile, badges, mugs, wall });
  });
}
async function updateProfile(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  return withDb(env, async (db) => {
    await db.prepare(
      `UPDATE profiles SET bio = ?, favorite_color = ?, obsession = ?, mood = ?,
         profile_song_url = ?, background_css = ? WHERE user_id = ?`
    ).bind(
      (body.bio || "").slice(0, 2e3),
      (body.favorite_color || "#336699").slice(0, 32),
      (body.obsession || "").slice(0, 200),
      (body.mood || "\u{1F610}").slice(0, 100),
      (body.profile_song_url || "").slice(0, 500),
      (body.background_css || "").slice(0, 500),
      user.id
    ).run();
    return json({ ok: true });
  });
}
async function postWall(request, env, user, username) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const text = (body.body || "").slice(0, 500);
  if (!text) return json({ error: "Empty" }, 400);
  return withDb(env, async (db) => {
    const target = await db.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (!target) return json({ error: "Not found" }, 404);
    await db.prepare("INSERT INTO profile_wall (id, profile_user_id, author_id, body) VALUES (?, ?, ?, ?)").bind(uuid(), target.id, user.id, text).run();
    return json({ ok: true });
  });
}
async function me(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  return getProfile(request, env, user.username);
}

// easter.js
async function checkEaster(request, env, user) {
  const tz = request.headers.get("X-User-Tz") || "0";
  const offset = parseInt(tz, 10) || 0;
  const local = new Date(Date.now() + offset * 6e4);
  const hour = local.getUTCHours();
  const is3am = hour === 3;
  const result = { is3am, effects: [] };
  if (!is3am) return json(result);
  result.effects.push("wake_up");
  if (user) {
    const unauth = requireUser(user);
    if (!unauth) {
      return withDb(env, async (db) => {
        if (Math.random() < 0.15) {
          const rain = Math.floor(Math.random() * 151) + 50;
          await db.prepare("UPDATE profiles SET wheat_balance = wheat_balance + ? WHERE user_id = ?").bind(rain, user.id).run();
          result.effects.push("wheat_rain");
          result.rain = rain;
        }
        if (Math.random() < 0.15) {
          const mug = await spawnMug(db, true);
          result.effects.push("golden_mug");
          result.mug = mug;
        }
        return json(result);
      });
    }
  }
  return json(result);
}

// rateLimit.js
var buckets = /* @__PURE__ */ new Map();
function checkRateLimit(key, limit = 30, windowMs = 6e5) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  if (b.count > limit) return false;
  return true;
}

// router.js
async function handleDb(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/db\/?/, "") || "";
  const parts = path.split("/").filter(Boolean);
  const method = request.method;
  const user = await resolveUser(request, env);
  if (method === "OPTIONS") return handleCors();
  const write = ["POST", "PUT", "DELETE"].includes(method);
  if (write) {
    const ip = request.headers.get("cf-connecting-ip") || "anon";
    if (!checkRateLimit(`${ip}:${user?.id || "x"}`)) return json({ error: "Rate limited" }, 429);
  }
  try {
    if (parts[0] === "auth" && parts[1] === "register" && method === "POST") return register(request, env);
    if (parts[0] === "auth" && parts[1] === "login" && method === "POST") return login(request, env);
    if (parts[0] === "sites" && parts.length === 1 && method === "GET") {
      if (url.searchParams.has("public")) return listPublicSites(request, env);
      return listSites(request, env, user);
    }
    if (parts[0] === "sites" && parts.length === 1 && method === "POST") return createSite(request, env, user);
    if (parts[0] === "sites" && parts.length === 2 && method === "GET") return getSite(request, env, parts[1]);
    if (parts[0] === "sites" && parts.length === 2 && method === "PUT") return updateSite(request, env, user, parts[1]);
    if (parts[0] === "sites" && parts.length === 2 && method === "DELETE") return deleteSite(request, env, user, parts[1]);
    if (parts[0] === "wheat" && parts[1] === "balance" && method === "GET") return getBalance(request, env, user);
    if (parts[0] === "farm" && parts[1] === "state" && method === "GET") return getFarm(request, env, user);
    if (parts[0] === "farm" && parts[1] === "plant" && method === "POST") return plantPlot(request, env, user);
    if (parts[0] === "farm" && parts[1] === "harvest" && method === "POST") return harvestPlot(request, env, user);
    if (parts[0] === "farm" && parts[1] === "global" && parts[2] === "plant" && method === "POST") return plantGlobal(request, env, user);
    if (parts[0] === "farm" && parts[1] === "global" && parts[2] === "harvest" && method === "POST") return harvestGlobal(request, env, user);
    if (parts[0] === "farm" && parts[1] === "sell" && method === "POST") return sellCrops(request, env, user);
    if (parts[0] === "shop" && parts.length === 1 && method === "GET") return shopList();
    if (parts[0] === "shop" && parts[1] === "buy" && method === "POST") return shopBuy(request, env, user);
    if (parts[0] === "leaderboard" && method === "GET") return leaderboard(request, env);
    if (parts[0] === "casino" && parts[1] === "bet" && method === "POST") return bet(request, env, user);
    if (parts[0] === "heist" && method === "POST") return attemptHeist(request, env, user);
    if (parts[0] === "mug" && parts[1] === "spawn" && method === "POST") {
      const secret = request.headers.get("X-Admin-Secret");
      if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) return json({ error: "Forbidden" }, 403);
      return withDb(env, async (db) => {
        const mugEvent = await spawnMug(db, false);
        return json({ mug: mugEvent });
      });
    }
    if (parts[0] === "mug" && parts[1] === "kitchen" && method === "GET") return getKitchenState(request, env);
    if (parts[0] === "mug" && parts[1] === "memorial" && method === "GET") return listMemorial(request, env);
    if (parts[0] === "mug" && parts[1] === "catch" && method === "POST") return catchMug(request, env, user);
    if (parts[0] === "mug" && parts[1] === "clean" && method === "POST") return cleanKitchen(request, env, user);
    if (parts[0] === "games" && parts[1] === "score" && method === "POST") return submitScore(request, env, user);
    if (parts[0] === "games" && parts[1] === "leaderboard" && parts[2] && method === "GET") {
      return gameLeaderboard(request, env, parts[2]);
    }
    if (parts[0] === "poll" && method === "GET") return pollEvents(request, env);
    if (parts[0] === "games" && parts[1] === "match" && method === "POST") return createMatch(request, env, user);
    if (parts[0] === "games" && parts[1] === "match" && parts[2] && parts.length === 3 && method === "GET") {
      return getMatch(request, env, parts[2]);
    }
    if (parts[0] === "games" && parts[1] === "match" && parts[2] && parts[3] === "join" && method === "POST") {
      return joinMatch(request, env, user, parts[2]);
    }
    if (parts[0] === "games" && parts[1] === "match" && parts[2] && parts[3] === "resolve" && method === "POST") {
      return resolveMatch(request, env, user, parts[2]);
    }
    if (parts[0] === "profiles" && parts[1] === "me" && method === "GET") return me(request, env, user);
    if (parts[0] === "profiles" && parts[1] === "me" && method === "PUT") return updateProfile(request, env, user);
    if (parts[0] === "profiles" && parts[1] && parts[2] === "wall" && method === "POST") {
      return postWall(request, env, user, parts[1]);
    }
    if (parts[0] === "profiles" && parts[1] && method === "GET") return getProfile(request, env, parts[1]);
    if (parts[0] === "easter" && parts[1] === "check" && method === "GET") return checkEaster(request, env, user);
    if (parts[0] === "health" && method === "GET") return json({ ok: true, service: "web0-backend" });
    return json({ error: "Not found", path }, 404);
  } catch (e) {
    return json({ error: e.message || "Server error" }, 500);
  }
}

// index.js
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return handleCors();
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        ok: true,
        service: "web0-backend",
        db: "/db/*",
        realtime: "D1 poll via GET /db/poll"
      });
    }
    if (url.pathname.startsWith("/db")) {
      return handleDb(request, env, ctx);
    }
    return json({ error: "Not found" }, 404);
  }
};
export {
  index_default as default
};
