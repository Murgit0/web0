import { json } from './cors.js';
import { withDb, uuid } from './db.js';
import { requireUser } from './auth.js';

const MIN_BET = 5;
const MAX_BET_CAP = 500;

export async function bet(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const game = body.game;
  const betAmount = parseInt(body.bet, 10);
  if (!['slots', 'flip', 'dice'].includes(game)) return json({ error: 'Invalid game' }, 400);
  return withDb(env, async (db) => {
    const p = await db.prepare('SELECT wheat_balance FROM profiles WHERE user_id = ?').bind(user.id).first();
    const balance = p?.wheat_balance ?? 0;
    const maxBet = Math.min(MAX_BET_CAP, Math.floor(balance * 0.1));
    if (betAmount < MIN_BET || betAmount > maxBet) {
      return json({ error: `Bet must be ${MIN_BET}-${maxBet}` }, 400);
    }
    if (balance < betAmount) return json({ error: 'Not enough wheat' }, 400);
    let payout = 0;
    if (game === 'slots') {
      const r = Math.random();
      if (r < 0.1) payout = betAmount * 3;
      else if (r < 0.3) payout = betAmount;
    } else if (game === 'flip') {
      payout = Math.random() < 0.475 ? betAmount * 2 : 0;
    } else if (game === 'dice') {
      const roll = Math.floor(Math.random() * 6) + 1;
      payout = roll >= 4 ? Math.floor(betAmount * 1.9) : 0;
    }
    const net = payout - betAmount;
    await db.prepare('UPDATE profiles SET wheat_balance = wheat_balance + ? WHERE user_id = ?').bind(net, user.id).run();
    await db
      .prepare('INSERT INTO casino_bets (id, user_id, game, bet, payout) VALUES (?, ?, ?, ?, ?)')
      .bind(uuid(), user.id, game, betAmount, payout)
      .run();
    return json({ payout, net, balance: balance + net });
  });
}
