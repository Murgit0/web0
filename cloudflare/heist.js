import { json } from './cors.js';
import { withDb, uuid } from './db.js';
import { requireUser } from './auth.js';
import { validUsername } from './sanitize.js';

const HEIST_COST = 25;
const MAX_STEAL = 200;

export async function attemptHeist(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const targetUsername = body.target_username;
  if (!validUsername(targetUsername)) return json({ error: 'Invalid target' }, 400);
  return withDb(env, async (db) => {
    const target = await db.prepare('SELECT id, username FROM users WHERE username = ?').bind(targetUsername).first();
    if (!target) return json({ error: 'User not found' }, 404);
    if (target.id === user.id) return json({ error: 'Cannot heist yourself' }, 400);
    const recent = await db
      .prepare(
        `SELECT id FROM heist_log WHERE attacker_id = ? AND target_id = ? AND created_at > datetime('now', '-1 day')`
      )
      .bind(user.id, target.id)
      .first();
    if (recent) return json({ error: 'Cooldown: 24h per target' }, 429);
    const attacker = await db.prepare('SELECT wheat_balance FROM profiles WHERE user_id = ?').bind(user.id).first();
    if ((attacker?.wheat_balance ?? 0) < HEIST_COST) return json({ error: 'Need 25 wheat' }, 400);
    const victim = await db.prepare('SELECT wheat_balance FROM profiles WHERE user_id = ?').bind(target.id).first();
    const success = Math.random() < 0.3;
    let amount = 0;
    if (success) {
      amount = Math.min(MAX_STEAL, Math.floor((victim?.wheat_balance ?? 0) * 0.1));
      await db.prepare('UPDATE profiles SET wheat_balance = wheat_balance - ? WHERE user_id = ?').bind(amount, target.id).run();
      await db.prepare('UPDATE profiles SET wheat_balance = wheat_balance + ? WHERE user_id = ?').bind(amount - HEIST_COST, user.id).run();
    } else {
      await db.prepare('UPDATE profiles SET wheat_balance = wheat_balance - ? WHERE user_id = ?').bind(HEIST_COST, user.id).run();
    }
    await db
      .prepare('INSERT INTO heist_log (id, attacker_id, target_id, success, amount) VALUES (?, ?, ?, ?, ?)')
      .bind(uuid(), user.id, target.id, success ? 1 : 0, amount)
      .run();
    return json({ success, amount, cost: HEIST_COST });
  });
}
