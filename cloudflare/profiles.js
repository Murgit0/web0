import { json } from './cors.js';
import { withDb, uuid } from './db.js';
import { requireUser } from './auth.js';

export async function getProfile(request, env, username) {
  return withDb(env, async (db) => {
    const user = await db.prepare('SELECT id, username, display_name FROM users WHERE username = ?').bind(username).first();
    if (!user) return json({ error: 'Not found' }, 404);
    const profile = await db.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(user.id).first();
    const { results: badges } = await db.prepare('SELECT badge FROM badges WHERE user_id = ?').bind(user.id).all();
    const { results: mugs } = await db
      .prepare('SELECT drop_number, created_at FROM mug_catches WHERE user_id = ? ORDER BY created_at DESC')
      .bind(user.id)
      .all();
    const { results: wall } = await db
      .prepare(
        `SELECT w.body, w.created_at, u.username as author FROM profile_wall w
         JOIN users u ON u.id = w.author_id WHERE w.profile_user_id = ? ORDER BY w.created_at DESC LIMIT 50`
      )
      .bind(user.id)
      .all();
    return json({ user, profile, badges, mugs, wall });
  });
}

export async function updateProfile(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  return withDb(env, async (db) => {
    await db
      .prepare(
        `UPDATE profiles SET bio = ?, favorite_color = ?, obsession = ?, mood = ?,
         profile_song_url = ?, background_css = ? WHERE user_id = ?`
      )
      .bind(
        (body.bio || '').slice(0, 2000),
        (body.favorite_color || '#336699').slice(0, 32),
        (body.obsession || '').slice(0, 200),
        (body.mood || '😐').slice(0, 100),
        (body.profile_song_url || '').slice(0, 500),
        (body.background_css || '').slice(0, 500),
        user.id
      )
      .run();
    return json({ ok: true });
  });
}

export async function postWall(request, env, user, username) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const text = (body.body || '').slice(0, 500);
  if (!text) return json({ error: 'Empty' }, 400);
  return withDb(env, async (db) => {
    const target = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    if (!target) return json({ error: 'Not found' }, 404);
    await db
      .prepare('INSERT INTO profile_wall (id, profile_user_id, author_id, body) VALUES (?, ?, ?, ?)')
      .bind(uuid(), target.id, user.id, text)
      .run();
    return json({ ok: true });
  });
}

export async function me(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  return getProfile(request, env, user.username);
}
