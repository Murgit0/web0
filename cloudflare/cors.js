export const ALLOWED_ORIGIN = 'https://web0.murgit0.github.io';

export function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token, X-User-Tz',
    ...extra,
  };
}

export function handleCors() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({ 'Content-Type': 'application/json', ...extra }),
  });
}

export function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}
