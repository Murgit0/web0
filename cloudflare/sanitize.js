const FORBIDDEN = /<script\b|javascript:|on\w+\s*=/gi;

export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  let out = html.replace(FORBIDDEN, '');
  out = out.replace(/<iframe\b/gi, '<iframe sandbox=""');
  return out.slice(0, 200000);
}

export function sanitizeCss(css) {
  if (!css || typeof css !== 'string') return '';
  return css.replace(/expression\s*\(|javascript:/gi, '').slice(0, 100000);
}

export function sanitizeJs(js) {
  return '';
}

export function validSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9-]{2,32}$/.test(slug);
}

export function validUsername(u) {
  return typeof u === 'string' && /^[a-zA-Z0-9_]{3,24}$/.test(u);
}
