// Shift clock: time on a task is counted automatically during working hours — no timer to press.
// Pure functions, shared by the server and the demo. All "days" are local calendar days (YYYY-MM-DD) in cfg.tz.

export const DEFAULT_SHIFT = { start: '07:00', end: '16:00', breaks: [{ from: '12:00', to: '12:30' }], days: [0, 1, 2, 3, 4, 6], tz: 180 }; // Sun–Thu + Sat, UTC+3 (Bahrain)
export const cfgOf = (s) => ({ ...DEFAULT_SHIFT, ...(s || {}) });
const toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const dayOf = (ms, cfg) => new Date(ms + cfg.tz * 60000).toISOString().slice(0, 10);
const dayStartMs = (day, cfg) => Date.parse(day + 'T00:00:00Z') - cfg.tz * 60000; // local midnight, as UTC ms
const dow = (day) => new Date(day + 'T00:00:00Z').getUTCDay();

/** Working windows of a day as [startMs, endMs] pairs: the shift minus its breaks. Empty on days off. */
export function windows(day, cfg) {
  if (!cfg.days.includes(dow(day))) return [];
  let segs = [[toMin(cfg.start), toMin(cfg.end)]];
  for (const b of cfg.breaks || []) {
    const [bf, bt] = [toMin(b.from), toMin(b.to)]; const out = [];
    for (const [s, e] of segs) { if (bt <= s || bf >= e) out.push([s, e]); else { if (bf > s) out.push([s, bf]); if (bt < e) out.push([bt, e]); } }
    segs = out;
  }
  const base = dayStartMs(day, cfg);
  return segs.filter(([s, e]) => e > s).map(([s, e]) => [base + s * 60000, base + e * 60000]);
}
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / 60000;

/** Minutes of shift that have passed on a day (the whole shift for past days, so far for today, 0 for the future). */
export function shiftMinutes(day, cfg, nowMs) {
  return windows(day, cfg).reduce((s, [a, b]) => s + Math.max(0, Math.min(b, nowMs) - a) / 60000, 0);
}
/** Is this instant inside working time (and the day a working day)? */
export function onClock(ms, cfg) { return windows(dayOf(ms, cfg), cfg).some(([a, b]) => ms >= a && ms < b); }

/**
 * Effective minutes of a task session, split per day. 'shift' sessions only count inside working windows on days the
 * worker was present (isPresent(day)); other sessions (older timer sessions, manual time) count exactly as recorded.
 */
export function sessionSegments(s, cfg, isPresent, nowMs) {
  const a = Date.parse(s.started); const b = s.ended ? Date.parse(s.ended) : nowMs;
  if (!(b > a)) return [];
  if (s.kind !== 'shift') return [{ day: dayOf(a, cfg), min: (b - a) / 60000 }];
  const out = []; const d0 = dayStartMs(dayOf(a, cfg), cfg);
  for (let d = d0, n = 0; d < b && n < 400; d += 864e5, n++) {
    const day = dayOf(d + 12 * 3600e3, cfg); if (!isPresent(day)) continue;
    const min = windows(day, cfg).reduce((t, [w0, w1]) => t + overlap(a, b, w0, w1), 0);
    if (min > 0) out.push({ day, min });
  }
  return out;
}
export const totalMin = (segs) => segs.reduce((s, x) => s + x.min, 0);
export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const parseBreaks = (txt) => String(txt || '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).map((x) => { const m = x.match(/^(\d{1,2}:\d{2})\s*[-–to]+\s*(\d{1,2}:\d{2})$/i); return m ? { from: m[1].padStart(5, '0'), to: m[2].padStart(5, '0') } : null; }).filter(Boolean);
