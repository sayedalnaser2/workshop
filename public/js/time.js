// Duration + time helpers for task tracking.
export const fmtMin = (m) => { m = Math.round(Number(m) || 0); if (m <= 0) return '0m'; const h = Math.floor(m / 60); const r = m % 60; return h ? `${h}h ${String(r).padStart(2, '0')}m` : `${r}m`; };
export const fmtSec = (sec) => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = sec % 60; return h ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : `${m}m ${String(s).padStart(2, '0')}s`; };
/** "2h 30m", "2:30", "90", "1.5h", "45m" → minutes (or null when empty/unreadable). */
export function parseDur(txt) {
  const s = String(txt ?? '').trim().toLowerCase(); if (!s) return null;
  let m = s.match(/^(\d+):(\d{1,2})$/); if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?$/); if (m && (m[1] || m[2])) return Math.round((+m[1] || 0) * 60 + (+m[2] || 0));
  m = s.match(/^\d+(?:\.\d+)?$/); return m ? Math.round(+s) : null;
}
export const durText = (min) => (min ? `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}` : '');
export const localTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
export const localDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : ''); // YYYY-MM-DD in local time
export const niceDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export function ago(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
/** Estimate vs actual as a coloured pill: green within 10%, amber up to 30% over, red beyond. */
export function variance(est, actual) {
  if (!(est > 0)) return '<span class="muted">no estimate</span>';
  const pct = Math.round(((actual - est) / est) * 100);
  const cls = pct <= 10 ? 'ok' : pct <= 30 ? 'warn' : 'bad';
  return `<span class="badge ${cls}">${pct > 0 ? '+' : ''}${pct}%</span>`;
}
/** Keep every [data-live] counter ticking: shows base minutes + time since the page fetched them. */
export function startTicker(root) {
  const stamp = Date.now();
  const tick = () => {
    if (!root.isConnected) return clearInterval(id);
    root.querySelectorAll('[data-live]').forEach((el) => { el.textContent = fmtSec(Number(el.dataset.base) * 60 + (Date.now() - stamp) / 1000); });
  };
  if (root._tickId) clearInterval(root._tickId);
  const id = (root._tickId = setInterval(tick, 1000)); tick();
}
