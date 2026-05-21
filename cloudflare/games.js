import { json } from './cors.js';
import { withDb, uuid } from './db.js';
import { requireUser } from './auth.js';

const GAME_REWARD = 15;
const MIN_BET = 5;
const MAX_BET_CAP = 500;

export async function submitScore(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const game = body.game;
  const score = parseInt(body.score, 10);
  if (!['snake', 'minesweeper'].includes(game) || score < 0) return json({ error: 'Invalid' }, 400);
  const threshold = game === 'snake' ? 50 : 60;
  return withDb(env, async (db) => {
    await db
      .prepare('INSERT INTO game_scores (id, user_id, game, score) VALUES (?, ?, ?, ?)')
      .bind(uuid(), user.id, game, score)
      .run();
    let reward = 0;
    if (score >= threshold) {
      reward = GAME_REWARD;
      await db
        .prepare('UPDATE profiles SET wheat_balance = wheat_balance + ? WHERE user_id = ?')
        .bind(reward, user.id)
        .run();
    }
    return json({ reward, score });
  });
}

export async function gameLeaderboard(request, env, game) {
  return withDb(env, async (db) => {
    const { results } = await db
      .prepare(
        `SELECT u.username, g.score, g.created_at FROM game_scores g
         JOIN users u ON u.id = g.user_id WHERE g.game = ?
         ORDER BY g.score DESC LIMIT 20`
      )
      .bind(game)
      .all();
    return json({ scores: results });
  });
}

export async function createMatch(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const game = body.game;
  const stake = parseInt(body.stake, 10);
  if (!['pong', 'ttt'].includes(game)) return json({ error: 'Invalid game' }, 400);
  return withDb(env, async (db) => {
    const p = await db.prepare('SELECT wheat_balance FROM profiles WHERE user_id = ?').bind(user.id).first();
    const balance = p?.wheat_balance ?? 0;
    const maxBet = Math.min(MAX_BET_CAP, Math.floor(balance * 0.1));
    if (stake < MIN_BET || stake > maxBet) return json({ error: `Stake ${MIN_BET}-${maxBet}` }, 400);
    const id = uuid();
    await db
      .prepare('INSERT INTO game_matches (id, game, player1_id, stake, status) VALUES (?, ?, ?, ?, ?)')
      .bind(id, game, user.id, stake, 'waiting')
      .run();
    return json({ match_id: id });
  });
}

export async function joinMatch(request, env, user, matchId) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  return withDb(env, async (db) => {
    const m = await db.prepare('SELECT * FROM game_matches WHERE id = ?').bind(matchId).first();
    if (!m || m.status !== 'waiting') return json({ error: 'Match unavailable' }, 400);
    if (m.player1_id === user.id) return json({ error: 'Cannot join own match' }, 400);
    const p = await db.prepare('SELECT wheat_balance FROM profiles WHERE user_id = ?').bind(user.id).first();
    if ((p?.wheat_balance ?? 0) < m.stake) return json({ error: 'Not enough wheat' }, 400);
    await db.prepare('UPDATE game_matches SET player2_id = ?, status = ? WHERE id = ?').bind(user.id, 'active', matchId).run();
    await db.prepare('UPDATE profiles SET wheat_balance = wheat_balance - ? WHERE user_id = ?').bind(m.stake, m.player1_id).run();
    await db.prepare('UPDATE profiles SET wheat_balance = wheat_balance - ? WHERE user_id = ?').bind(m.stake, user.id).run();
    const pot = m.stake * 2;
    const winnerCut = Math.floor(pot * 0.9);
    return json({ match_id: matchId, pot, winner_cut: winnerCut });
  });
}

export async function resolveMatch(request, env, user, matchId) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const winnerId = body.winner_id;
  return withDb(env, async (db) => {
    const m = await db.prepare('SELECT * FROM game_matches WHERE id = ?').bind(matchId).first();
    if (!m || m.status !== 'active') return json({ error: 'Invalid match' }, 400);
    if (winnerId !== m.player1_id && winnerId !== m.player2_id) return json({ error: 'Invalid winner' }, 400);
    const pot = m.stake * 2;
    const payout = Math.floor(pot * 0.9);
    await db.prepare('UPDATE profiles SET wheat_balance = wheat_balance + ? WHERE user_id = ?').bind(payout, winnerId).run();
    await db.prepare('UPDATE game_matches SET status = ? WHERE id = ?').bind('done', matchId).run();
    return json({ payout });
  });
}
