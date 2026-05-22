import { json } from './cors.js';
import { withDb, uuid } from './db.js';
import { sanitizeHtml, sanitizeCss, sanitizeJs, validSlug } from './sanitize.js';
import { requireUser } from './auth.js';

export async function listSites(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  return withDb(env, async (db) => {
    const { results } = await db
      .prepare('SELECT id, slug, title, created_at FROM sites WHERE owner_id = ? ORDER BY created_at DESC')
      .bind(user.id)
      .all();
    return json({ sites: results });
  });
}

export async function listPublicSites(request, env) {
  return withDb(env, async (db) => {
    const limit = Math.min(parseInt(new URL(request.url).searchParams.get('limit') || '8', 10), 50);
    const { results } = await db
      .prepare('SELECT id, slug, title, created_at FROM sites ORDER BY created_at DESC LIMIT ?')
      .bind(limit)
      .all();
    return json({ sites: results });
  });
}

export async function getSite(request, env, idOrSlug) {
  return withDb(env, async (db) => {
    const site = await db
      .prepare('SELECT id, slug, title, html, css, js, blocks_meta, owner_id, created_at FROM sites WHERE id = ? OR slug = ?')
      .bind(idOrSlug, idOrSlug)
      .first();
    if (!site) return json({ error: 'Not found' }, 404);
    return json({ site });
  });
}

export async function createSite(request, env, user) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  const slug = (body.slug || '').toLowerCase();
  const title = (body.title || 'My Site').slice(0, 80);
  if (!validSlug(slug)) return json({ error: 'Invalid slug' }, 400);
  return withDb(env, async (db) => {
    const taken = await db.prepare('SELECT id FROM sites WHERE slug = ?').bind(slug).first();
    if (taken) return json({ error: 'Slug taken' }, 409);
    const id = uuid();
    await db
      .prepare('INSERT INTO sites (id, owner_id, slug, title) VALUES (?, ?, ?, ?)')
      .bind(id, user.id, slug, title)
      .run();
    return json({ site: { id, slug, title } }, 201);
  });
}

export async function updateSite(request, env, user, id) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  const body = await request.json().catch(() => ({}));
  return withDb(env, async (db) => {
    const site = await db.prepare('SELECT * FROM sites WHERE id = ?').bind(id).first();
    if (!site) return json({ error: 'Not found' }, 404);
    if (site.owner_id !== user.id) return json({ error: 'Forbidden' }, 403);
    const html = sanitizeHtml(body.html ?? site.html);
    const css = sanitizeCss(body.css ?? site.css);
    const js = sanitizeJs(body.js ?? site.js);
    const title = (body.title ?? site.title).slice(0, 80);
    const blocks_meta = JSON.stringify(body.blocks_meta ?? JSON.parse(site.blocks_meta || '{}'));
    await db
      .prepare('UPDATE sites SET html = ?, css = ?, js = ?, blocks_meta = ?, title = ? WHERE id = ?')
      .bind(html, css, js, blocks_meta, title, id)
      .run();
    return json({ ok: true });
  });
}

export async function deleteSite(request, env, user, id) {
  const unauth = requireUser(user);
  if (unauth) return unauth;
  return withDb(env, async (db) => {
    const site = await db.prepare('SELECT owner_id FROM sites WHERE id = ?').bind(id).first();
    if (!site) return json({ error: 'Not found' }, 404);
    if (site.owner_id !== user.id) return json({ error: 'Forbidden' }, 403);
    await db.prepare('DELETE FROM sites WHERE id = ?').bind(id).run();
    return json({ ok: true });
  });
}
