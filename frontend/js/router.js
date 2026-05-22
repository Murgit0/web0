const RESERVED = new Set(['dashboard', 'builder', 'forum', 'chat', 'farm', 'casino', 'shop', 'kitchen', 'memorial', 'login', 'register', 'profile', 'games', 'secrets', 'js', 'css', 'assets']);

export function parseRoute() {
  let path = location.pathname.replace(/\.html$/, '');
  if (path.endsWith('/')) path = path.slice(0, -1);
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { page: 'home' };
  if (parts[0] === 'builder' && parts[1]) return { page: 'builder', siteId: parts[1] };
  if (parts[0] === 'forum') return { page: 'forum' };
  if (RESERVED.has(parts[0])) return { page: parts[0] };
  return { page: 'site', slug: parts[0] };
}

export function go(path) {
  history.pushState({}, '', path);
  routePage();
}

export function routePage() {
  const r = parseRoute();
  const map = {
    home: '/index.html',
    dashboard: '/dashboard.html',
    builder: `/builder.html?id=${r.siteId || ''}`,
    forum: '/forum.html',
    farm: '/farm.html',
    casino: '/casino.html',
    shop: '/shop.html',
    kitchen: '/kitchen.html',
    memorial: '/memorial.html',
    login: '/login.html',
    register: '/register.html',
    profile: '/profile.html',
    games: '/games/index.html',
    secrets: '/secrets.html',
    site: `/site.html?slug=${encodeURIComponent(r.slug || '')}`,
  };
  const target = map[r.page];
  if (target && !location.pathname.endsWith(target.split('?')[0].replace(/^\//, ''))) {
    if (r.page === 'site') location.href = target;
    else if (r.page === 'builder') location.href = target;
  }
}
