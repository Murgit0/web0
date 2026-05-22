export function getDb(env) {
  const db = env.D1;
  if (!db) throw new Error('D1 binding "D1" not configured');
  return db;
}

export async function withDb(env, fn) {
  const db = getDb(env);
  await db.prepare('PRAGMA foreign_keys = ON').run();
  return fn(db);
}

export function uuid() {
  return crypto.randomUUID();
}
