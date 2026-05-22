import { api } from './api.js';

export async function runEasterChecks() {
  const h = new Date().getHours();
  if (h === 3) {
    document.title = document.title.includes('wake') ? 'web0' : 'wake up';
    try {
      const data = await api('/easter/check');
      if (data.rain) {
        const el = document.getElementById('status');
        if (el) el.textContent = `3am wheat rain: +${data.rain} 🌾`;
      }
      if (data.mug) {
        const el = document.getElementById('status');
        if (el) el.textContent = (el.textContent || '') + ' Golden mug!';
      }
    } catch (_) {}
  }
}

setInterval(runEasterChecks, 60000);
runEasterChecks();
