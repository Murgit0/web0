import { json } from './cors.js';
import { withDb, uuid } from './db.js';
import { validUsername } from './sanitize.js';

const SESSION_DAYS = 30;

async function hashPassword(password, saltB64) {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function newSalt() {
  const s = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...s));
}

export async function register(request, env) {
  const body = await request.json().catch(() => ({}));
  const { username, password, display_name } = body;
  if (!validUsername(username) || typeof password !== 'string' || password.length < 8) {
    return json({ error: 'Invalid username or password (min 8 chars)' }, 400);
  }
  return withDb(env, async (db) => {
    const existing = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
    if (existing) return json({ error: 'Username taken' }, 409);
    const salt = newSalt();
    const password_hash = await hashPassword(password, salt);
    const id = uuid();
    await db.batch([
      db.prepare('INSERT INTO users (id, username, password_hash, salt, display_name) VALUES (?, ?, ?, ?, ?)').bind(
        id, username, password_hash, salt, display_name || username
      ),
      db.prepare('INSERT INTO profiles (user_id) VALUES (?)').bind(id),
    ]);
    const session = await createSession(db, id);
    return json({ user: { id, username, display_name: display_name || username }, token: session.token });
  });
}

export async function login(request, env) {
  const body = await request.json().catch(() => ({}));
  const { username, password } = body;
  if (!validUsername(username) || typeof password !== 'string') {
    return json({ error: 'Invalid credentials' }, 400);
  }
  return withDb(env, async (db) => {
    const user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
    if (!user) return json({ error: 'Invalid credentials' }, 401);
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.password_hash) return json({ error: 'Invalid credentials' }, 401);
    const session = await createSession(db, user.id);
    return json({
      user: { id: user.id, username: user.username, display_name: user.display_name },
      token: session.token,
    });
  });
}

async function createSession(db, userId) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const id = uuid();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await db.prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)').bind(id, userId, token, expires).run();
  return { token };
}

export async function resolveUser(request, env) {
  const token =
    request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ||
    request.headers.get('X-Session-Token');
  if (!token) return null;
  return withDb(env, async (db) => {
    const row = await db
      .prepare(
        `SELECT u.id, u.username, u.display_name FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > datetime('now')`
      )
      .bind(token)
      .first();
    return row || null;
  });
}

export function requireUser(user) {
  if (!user) return json({ error: 'Unauthorized' }, 401);
  return null;
}
