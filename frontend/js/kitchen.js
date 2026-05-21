import { api } from './api.js';
import { onChannel } from './ws.js';
import { getUser } from './api.js';

let activeDrop = null;
let visits = parseInt(localStorage.getItem('web0_visits') || '0', 10) + 1;
localStorage.setItem('web0_visits', String(visits));

export async function initKitchen() {
  const ticker = document.getElementById('visitor-ticker');
  if (ticker) ticker.textContent = String(visits).padStart(8, '0');

  await refreshKitchen();
  setInterval(refreshKitchen, 4000);

  onChannel('mug:drop', (msg) => {
    if (msg.payload) showMugDrop(msg.payload);
  });

  document.getElementById('mug-sprite')?.addEventListener('click', tryCatch);
  document.getElementById('catch-btn')?.addEventListener('click', tryCatch);
  document.getElementById('clean-btn')?.addEventListener('click', cleanKitchen);
}

async function refreshKitchen() {
  try {
    const data = await api('/mug/kitchen');
    document.getElementById('shard-count').textContent = data.shards;
    document.getElementById('drought-msg').style.display = data.drought ? 'block' : 'none';
    if (data.activeDrop && data.activeDrop.status === 'active') {
      showMugDrop({
        dropId: data.activeDrop.id,
        dropNumber: data.activeDrop.drop_number,
        type: 'drop',
      });
    }
  } catch (e) {
    document.getElementById('status').textContent = e.message;
  }
}

function showMugDrop(payload) {
  if (payload.type === 'shatter') {
    document.getElementById('status').textContent = `Mug #${payload.dropNumber} shattered!`;
    document.getElementById('mug-sprite').style.display = 'none';
    return;
  }
  activeDrop = payload;
  const mug = document.getElementById('mug-sprite');
  mug.style.display = 'block';
  mug.title = `Mug #${payload.dropNumber}`;
  const hud = document.getElementById('catch-hud');
  hud.classList.add('active');
  setTimeout(() => hud.classList.remove('active'), payload.golden ? 4000 : 2000);
}

async function tryCatch() {
  if (!getUser()) {
    location.href = '/login.html';
    return;
  }
  if (!activeDrop?.dropId) return;
  try {
    await api('/mug/catch', {
      method: 'POST',
      body: JSON.stringify({ drop_id: activeDrop.dropId, golden: !!activeDrop.golden }),
    });
    document.getElementById('status').textContent = `Caught mug #${activeDrop.dropNumber}!`;
    document.getElementById('mug-sprite').style.display = 'none';
    document.getElementById('catch-hud').classList.remove('active');
    activeDrop = null;
  } catch (e) {
    document.getElementById('status').textContent = e.message;
  }
}

async function cleanKitchen() {
  if (!getUser()) return location.href = '/login.html';
  try {
    await api('/mug/clean', { method: 'POST', body: '{}' });
    document.getElementById('status').textContent = 'Kitchen cleaned. Janitor badge?';
    refreshKitchen();
  } catch (e) {
    document.getElementById('status').textContent = e.message;
  }
}
