import { WS_BASE } from './config.js';
import { getToken } from './api.js';

let socket = null;
const listeners = new Map();

export function connectWs() {
  if (socket?.readyState === WebSocket.OPEN) return socket;
  const token = getToken();
  socket = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token || '')}`);
  socket.addEventListener('open', () => {
    if (token) socket.send(JSON.stringify({ type: 'auth', token }));
  });
  socket.addEventListener('message', (e) => {
    try {
      const msg = JSON.parse(e.data);
      const cbs = listeners.get(msg.channel) || [];
      cbs.forEach((fn) => fn(msg));
    } catch (_) {}
  });
  socket.addEventListener('close', () => {
    setTimeout(connectWs, 3000);
  });
  return socket;
}

export function onChannel(channel, fn) {
  if (!listeners.has(channel)) listeners.set(channel, []);
  listeners.get(channel).push(fn);
  connectWs();
}
