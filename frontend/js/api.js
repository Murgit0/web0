import { API_BASE } from './config.js';

export function getToken() {
  return sessionStorage.getItem('web0_token');
}

export function setToken(token) {
  if (token) sessionStorage.setItem('web0_token', token);
  else sessionStorage.removeItem('web0_token');
}

export function getUser() {
  const u = sessionStorage.getItem('web0_user');
  return u ? JSON.parse(u) : null;
}

export function setUser(user) {
  if (user) sessionStorage.setItem('web0_user', JSON.stringify(user));
  else sessionStorage.removeItem('web0_user');
}

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const tz = -new Date().getTimezoneOffset();
  headers['X-User-Tz'] = String(tz);
  const res = await fetch(`${API_BASE}/db${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
