import { json } from './cors.js';
import { withDb, uuid } from './db.js';

/** Push a realtime event to D1 (replaces Durable Object broadcast). */
export async function pushEvent(db, channel, payload) {
  await db
    .prepare('INSERT INTO realtime_events (id, channel, payload) VALUES (?, ?, ?)')
    .bind(uuid(), channel, JSON.stringify(payload))
    .run();
}

export async function pollEvents(request, env) {
  const url = new URL(request.url);
  const since = url.searchParams.get('since') || '1970-01-01T00:00:00Z';
  const channel = url.searchParams.get('channel') || 'mug:drop';
  return withDb(env, async (db) => {
    const { results } = await db
      .prepare(
        `SELECT id, channel, payload, created_at FROM realtime_events
         WHERE channel = ? AND created_at > ? ORDER BY created_at ASC LIMIT 50`
      )
      .bind(channel, since)
      .all();
    const events = results.map((r) => ({
      id: r.id,
      channel: r.channel,
      payload: JSON.parse(r.payload),
      created_at: r.created_at,
    }));
    return json({ events, server_time: new Date().toISOString() });
  });
}
