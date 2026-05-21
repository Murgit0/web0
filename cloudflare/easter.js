import { json } from './cors.js';
import { withDb, uuid } from './db.js';
import { requireUser } from './auth.js';
import { spawnMug } from './mug.js';

export async function checkEaster(request, env, user) {
  const tz = request.headers.get('X-User-Tz') || '0';
  const offset = parseInt(tz, 10) || 0;
  const local = new Date(Date.now() + offset * 60000);
  const hour = local.getUTCHours();
  const is3am = hour === 3;
  const result = { is3am, effects: [] };
  if (!is3am) return json(result);
  result.effects.push('wake_up');
  if (user) {
    const unauth = requireUser(user);
    if (!unauth) {
      return withDb(env, async (db) => {
        if (Math.random() < 0.15) {
          const rain = Math.floor(Math.random() * 151) + 50;
          await db
            .prepare('UPDATE profiles SET wheat_balance = wheat_balance + ? WHERE user_id = ?')
            .bind(rain, user.id)
            .run();
          result.effects.push('wheat_rain');
          result.rain = rain;
        }
        if (Math.random() < 0.15) {
          const mug = await spawnMug(db, true);
          result.effects.push('golden_mug');
          result.mug = mug;
        }
        return json(result);
      });
    }
  }
  return json(result);
}
