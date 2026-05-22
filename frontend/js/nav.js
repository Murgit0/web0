import { SITE_NAME } from './config.js';
import { renderNavUser } from './auth-ui.js';

export function injectNav() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  nav.innerHTML = `
    <div class="box">
      <strong class="blink">${SITE_NAME}</strong> —
      <a href="/">home</a>
      <a href="/dashboard.html">dashboard</a>
      <a href="/kitchen.html">kitchen</a>
      <a href="/farm.html">farm</a>
      <a href="/casino.html">casino</a>
      <a href="/shop.html">shop</a>
      <a href="/games/">games</a>
      <a href="/forum.html">forum</a>
      <a href="/memorial.html">memorial</a>
      <a href="/guestbook.html">guestbook</a>
      <span id="nav-user"></span>
    </div>`;
  renderNavUser(document.getElementById('nav-user'));
}
