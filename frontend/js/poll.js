import { API_BASE } from './config.js';

const listeners = new Map();
let since = new Date().toISOString();
let timer = null;

export async function pollOnce(channel = 'mug:drop') {
  const res = await fetch(`${API_BASE}/db/poll?since=${encodeURIComponent(since)}&channel=${encodeURIComponent(channel)}`);
  const data = await res.json();
  for (const ev of data.events || []) {
    if (ev.created_at && ev.created_at > since) since = ev.created_at;
    const cbs = listeners.get(ev.channel) || listeners.get(channel) || [];
    cbs.forEach((fn) => fn(ev.payload, ev));
  }
  return data;
}

export function onChannel(channel, fn) {
  if (!listeners.has(channel)) listeners.set(channel, []);
  listeners.get(channel).push(fn);
  startPolling();
}

export function startPolling(intervalMs = 2000) {
  if (timer) return;
  timer = setInterval(async () => {
    for (const ch of listeners.keys()) {
      try {
        await pollOnce(ch);
      } catch (_) {}
    }
  }, intervalMs);
}

export function pollMatch(matchId, fn) {
  const channel = `game:match:${matchId}`;
  onChannel(channel, fn);
  return setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/db/games/match/${matchId}`);
      const data = await res.json();
      if (data.match) fn(data.match, { channel });
    } catch (_) {}
  }, 2000);
}
