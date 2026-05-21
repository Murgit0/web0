import { api, setToken, setUser, getUser } from './api.js';

export async function register(username, password, display_name) {
  const data = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, display_name }),
  });
  setToken(data.token);
  setUser(data.user);
  return data.user;
}

export async function login(username, password) {
  const data = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
  setUser(data.user);
  return data.user;
}

export function logout() {
  setToken(null);
  setUser(null);
  location.href = '/';
}

export function requireAuthRedirect() {
  if (!getUser()) {
    location.href = '/login.html';
    return false;
  }
  return true;
}

export function renderNavUser(el) {
  const u = getUser();
  if (!el) return;
  el.innerHTML = u
    ? `Hi <a href="/profile.html?u=${encodeURIComponent(u.username)}">${u.username}</a> · <a href="#" id="logout">logout</a>`
    : `<a href="/login.html">login</a> · <a href="/register.html">register</a>`;
  document.getElementById('logout')?.addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });
}
