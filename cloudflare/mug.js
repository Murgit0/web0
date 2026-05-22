import { json } from './cors.js';
import { withDb, uuid } from './db.js';
import { requireUser } from './auth.js';
import { pushEvent } from './poll.js';

export async function getKitchenState(request, env) {
  return withDb(env, async (db) => {
    const shards = await db.prepare('SELECT count FROM mug_shards WHERE id = 1').first();
    const kitchen = await db.prepare('SELECT drought FROM kitchen_state WHERE id = 1').first();
    const active = await db
      .prepare("SELECT * FROM mug_drops WHERE status = 'active' ORDER BY created_at DESC LIMIT 1")
      .first();
    return json({ shards: shards?.count ?? 0, drought: kitchen?.drought ?? 0, activeDrop: active });
  });
}

export async function listMemorial(request, env) {
  return withDb(env, async (db) => {
    const { results } = await db
      .prepare('SELECT drop_number, cause, died_at FROM mug_memorial ORDER BY died_at DESC LIMIT 200')
      .all();
    return json({ memorial: results });
  });
}

export async function catchMug(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const dropId = body.drop_id;
  return withDb(env, async (db) => {
    const kitchen = await db.prepare('SELECT drought FROM kitchen_state WHERE id = 1').first();
    if (kitchen?.drought) return json({ error: 'Mug drought active' }, 403);
    const drop = await db.prepare('SELECT * FROM mug_drops WHERE id = ? AND status = ?').bind(dropId, 'active').first();
    if (!drop) return json({ error: 'No active mug' }, 400);
    const existing = await db.prepare('SELECT id FROM mug_catches WHERE drop_id = ?').bind(dropId).first();
    if (existing) return json({ error: 'Already caught' }, 400);
    const created = new Date(drop.created_at + 'Z').getTime();
    const windowMs = body.golden ? 4000 : 2000;
    if (Date.now() - created > windowMs) return json({ error: 'Too late' }, 400);
    await db
      .prepare('INSERT INTO mug_catches (id, user_id, drop_id, drop_number) VALUES (?, ?, ?, ?)')
      .bind(uuid(), user.id, dropId, drop.drop_number)
      .run();
    await db.prepare("UPDATE mug_drops SET status = 'caught' WHERE id = ?").bind(dropId).run();
    if (body.golden) {
      await db
        .prepare('INSERT OR IGNORE INTO badges (id, user_id, badge) VALUES (?, ?, ?)')
        .bind(uuid(), user.id, '3am_mug')
        .run();
    }
    return json({ ok: true, drop_number: drop.drop_number });
  });
}

export async function cleanKitchen(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  return withDb(env, async (db) => {
    await db.prepare('UPDATE mug_shards SET count = 0, updated_at = datetime("now") WHERE id = 1').run();
    await db.prepare('UPDATE kitchen_state SET drought = 0, updated_at = datetime("now") WHERE id = 1').run();
    await db
      .prepare('INSERT OR IGNORE INTO badges (id, user_id, badge) VALUES (?, ?, ?)')
      .bind(uuid(), user.id, 'mug_janitor')
      .run();
    return json({ ok: true });
  });
}

export async function spawnMug(db, golden = false) {
  const numRow = await db.prepare('SELECT MAX(drop_number) as n FROM mug_drops').first();
  const dropNumber = (numRow?.n ?? 0) + 1;
  const id = uuid();
  await db
    .prepare('INSERT INTO mug_drops (id, drop_number, status) VALUES (?, ?, ?)')
    .bind(id, dropNumber, 'active')
    .run();
  if (Math.random() < 0.5) {
    await shatterMug(db, dropNumber, 'shattered on landing');
    const shatter = { type: 'shatter', dropNumber };
    await pushEvent(db, 'mug:drop', shatter);
    if (Math.random() < 0.5) return spawnMug(db, golden);
    return shatter;
  }
  const drop = { type: 'drop', dropId: id, dropNumber, golden };
  await pushEvent(db, 'mug:drop', drop);
  return drop;
}

export async function shatterMug(db, dropNumber, cause) {
  await db
    .prepare('INSERT INTO mug_memorial (id, drop_number, cause) VALUES (?, ?, ?)')
    .bind(uuid(), dropNumber, cause)
    .run();
  const shards = await db.prepare('SELECT count FROM mug_shards WHERE id = 1').first();
  const newCount = (shards?.count ?? 0) + Math.floor(Math.random() * 3) + 1;
  await db.prepare('UPDATE mug_shards SET count = ?, updated_at = datetime("now") WHERE id = 1').bind(newCount).run();
  if (newCount > 20) {
    await db.prepare('UPDATE kitchen_state SET drought = 1, updated_at = datetime("now") WHERE id = 1').run();
  }
}
