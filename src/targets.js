// Targets and prizes: goals set by the admin, measured per worker over a week / month / quarter / year.
import { db, listRows } from './db.js';
import { taskViews, activity } from './tasks.js';

export const METRICS = {
  tasks_done: { label: 'Tasks finished', unit: '' },
  hours_on_tasks: { label: 'Hours worked on tasks', unit: 'h' },
  on_time_pct: { label: 'Finished within the time estimate', unit: '%' },
  efficiency_pct: { label: 'Efficiency (estimated ÷ actual time)', unit: '%' },
  overtime_hours: { label: 'Overtime hours (approved)', unit: 'h' },
};
const iso = (d) => d.toISOString().slice(0, 10);
const add = (d, n) => new Date(d.getTime() + n * 864e5);
/** First and last day (YYYY-MM-DD) and a key for the period that contains `at`. Weeks run Sunday to Saturday. */
export function periodOf(period, at = new Date()) {
  const y = at.getUTCFullYear(); const m = at.getUTCMonth();
  if (period === 'week') { const s = add(at, -at.getUTCDay()); return { from: iso(s), to: iso(add(s, 6)), key: `W${iso(s)}` }; }
  if (period === 'quarter') { const q = Math.floor(m / 3); return { from: iso(new Date(Date.UTC(y, q * 3, 1))), to: iso(new Date(Date.UTC(y, q * 3 + 3, 0))), key: `Q${y}-${q + 1}` }; }
  if (period === 'year') return { from: `${y}-01-01`, to: `${y}-12-31`, key: `Y${y}` };
  return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))), key: `M${y}-${String(m + 1).padStart(2, '0')}` };
}
const onTask = (t, uid) => t.assignee_id === uid || (t.team || []).includes(uid);

/** Progress of every active target for the given workers (all workers when `onlyUser` is empty). */
export function targetProgress(onlyUser = null, at = new Date()) {
  const targets = listRows('targets').filter((t) => t.active !== 0);
  const workers = db.prepare("SELECT id, name FROM users WHERE role='worker' AND active=1").all().filter((u) => !onlyUser || u.id === onlyUser);
  const awards = listRows('target_awards'); const out = [];
  const cache = new Map();
  for (const t of targets) {
    const per = periodOf(t.period || 'month', at); const ck = per.key;
    if (!cache.has(ck)) cache.set(ck, { done: taskViews("t.status='done' AND t.done_at >= ? AND t.done_at <= ?", [`${per.from}T00:00:00.000Z`, `${per.to}T23:59:59.999Z`]), act: new Map() });
    const c = cache.get(ck);
    for (const u of workers.filter((x) => !t.user_id || x.id === t.user_id)) {
      let value = 0; const mine = c.done.filter((d) => onTask(d, u.id));
      if (t.metric === 'tasks_done') value = mine.length;
      else if (t.metric === 'hours_on_tasks' || t.metric === 'overtime_hours') {
        if (!c.act.has(u.id)) c.act.set(u.id, activity(per.from, per.to, u.id));
        const a = c.act.get(u.id);
        value = t.metric === 'hours_on_tasks' ? a.perDay.reduce((s, d) => s + d.task_min, 0) / 60 : a.overtime.filter((o) => o.status === 'approved').reduce((s, o) => s + (o.minutes || 0), 0) / 60;
      } else {
        const withEst = mine.filter((d) => d.estimate_min > 0 && d.actual_min > 0);
        if (t.metric === 'on_time_pct') value = withEst.length ? (withEst.filter((d) => d.actual_min <= d.estimate_min * 1.1).length / withEst.length) * 100 : 0;
        else value = withEst.length ? (withEst.reduce((s, d) => s + d.estimate_min, 0) / withEst.reduce((s, d) => s + d.actual_min, 0)) * 100 : 0;
      }
      value = Math.round(value * 10) / 10; const goal = Number(t.goal) || 0;
      out.push({ target: t, user_id: u.id, user_name: u.name, period: per, value, goal, pct: goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0, achieved: goal > 0 && value >= goal, award: awards.find((a) => a.target_id === t.id && a.user_id === u.id && a.period_key === per.key) || null });
    }
  }
  return out;
}
