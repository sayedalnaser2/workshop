import { db, insertRow, updateRow, getRow, getSetting } from './db.js';

const nowIso = () => new Date().toISOString();
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
/** The lead, or anyone on the team. Unassigned tasks are open to everyone. */
export const isOnTask = (t, uid) => {
  if (!t.assignee_id || t.assignee_id === uid) return true;
  let team = t.team; if (!Array.isArray(team)) { try { team = JSON.parse(team || '[]') || []; } catch { team = []; } }
  return team.includes(uid);
};
export const STATUSES = ['todo', 'doing', 'blocked', 'done'];

import { cfgOf, dayOf, windows, shiftMinutes, onClock, sessionSegments, totalMin } from '../public/js/shift.js';

const shiftCfg = () => cfgOf(getSetting('shift'));
/** Each person's own working hours: the workshop shift with whatever they override (hours, breaks, days); the time zone is shared. */
export function cfgMap() {
  const base = cfgOf(getSetting('shift')); const own = {};
  for (const r of db.prepare('SELECT id, shift FROM users WHERE shift IS NOT NULL').all()) { try { own[r.id] = JSON.parse(r.shift) || {}; } catch {} }
  return (uid) => cfgOf({ ...base, ...(own[uid] || {}), tz: base.tz });
}
const presence = () => new Set(db.prepare('SELECT user_id, day FROM work_days').all().map((r) => `${r.user_id}|${r.day}`));
const seen = new Set();
/** Being signed in during a working day counts as being at work that day. Call on every authenticated request. */
export function markPresent(userId) {
  const day = dayOf(Date.now(), shiftCfg()); const k = `${userId}|${day}`;
  if (seen.has(k)) return; seen.add(k);
  db.prepare('INSERT OR IGNORE INTO work_days(user_id, day, first_seen) VALUES(?,?,?)').run(userId, day, nowIso());
}
const effMin = (s, now, cfgFor, pres) => totalMin(sessionSegments(s, cfgFor(s.user_id), (day) => pres.has(`${s.user_id}|${day}`), now));

/**
 * Tasks with who/what/how-long attached. Time on a task is counted automatically while a worker is "on" it during
 * working hours (see shift.js), so actual_min needs no timer. ticking = counting right now.
 */
export function taskViews(where = '1=1', params = []) {
  const nowMs = Date.now(); const cfgFor = cfgMap(); const cfg = cfgFor(0); const pres = presence();
  const rows = db.prepare(`
    SELECT t.*, u.name AS assignee_name, o.client, o.site, o.gps AS site_gps, COALESCE(NULLIF(t.quote_no, ''), o.quote_no) AS quote_no,
      (SELECT MAX(l.ts) FROM task_logs l WHERE l.task_id = t.id) AS last_activity
    FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id LEFT JOIN orders o ON o.inv = t.order_inv AND t.order_inv <> ''
    WHERE ${where} ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'blocked' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END, CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, IFNULL(t.due, '9999'), t.id DESC`).all(...params);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const sess = db.prepare(`SELECT * FROM task_sessions WHERE task_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const by = {}; for (const s of sess) (by[s.task_id] ||= []).push(s);
  const today = dayOf(nowMs, cfg);
  const names = Object.fromEntries(db.prepare('SELECT id, name FROM users').all().map((u) => [u.id, u.name]));
  return rows.map((r) => {
    const ss = by[r.id] || []; const opens = ss.filter((s) => !s.ended); const open = opens.at(-1);
    const actual = ss.reduce((a, s) => a + effMin(s, nowMs, cfgFor, pres), 0);
    let team = []; try { team = JSON.parse(r.team || '[]') || []; } catch { team = []; }
    return { ...r, team, team_names: team.map((id) => names[id]).filter(Boolean), actual_min: Math.round(actual * 10) / 10, running_since: open?.started || null, running_by: [...new Set(opens.map((x) => x.user_name))].join(', ') || null, ticking: opens.some((x) => onClock(nowMs, cfgFor(x.user_id)) && pres.has(`${x.user_id}|${today}`)) };
  });
}
export const taskView = (id) => taskViews('t.id = ?', [id])[0] || null;
export const logsFor = (id, limit = 200) => db.prepare('SELECT * FROM task_logs WHERE task_id=? ORDER BY ts DESC, id DESC LIMIT ?').all(id, limit);
export const sessionsFor = (id) => { const now = Date.now(); const cfgFor = cfgMap(); const pres = presence(); return db.prepare('SELECT * FROM task_sessions WHERE task_id=? ORDER BY started DESC').all(id).map((s) => ({ ...s, minutes: Math.round(effMin(s, now, cfgFor, pres) * 10) / 10 })); };

/** The shift clock for one person today: windows, minutes so far, and the task they are on. */
export function shiftStatus(user) {
  const nowMs = Date.now(); const cfg = cfgMap()(user.id); const pres = presence(); const day = dayOf(nowMs, cfg);
  const wins = windows(day, cfg);
  const mine = db.prepare('SELECT s.*, t.title FROM task_sessions s JOIN tasks t ON t.id = s.task_id WHERE s.user_id = ?').all(user.id);
  const cur = mine.filter((s) => !s.ended).at(-1) || null;
  const taskToday = mine.reduce((a, s) => a + sessionSegments(s, cfg, (d) => pres.has(`${user.id}|${d}`), nowMs).filter((x) => x.day === day).reduce((x, y) => x + y.min, 0), 0);
  const ot = db.prepare('SELECT * FROM overtime WHERE user_id=? AND day=? ORDER BY id').all(user.id, day);
  return { cfg, day, windows: wins.map(([a, b]) => [new Date(a).toISOString(), new Date(b).toISOString()]), shift_min: shiftMinutes(day, cfg, nowMs), task_min: Math.round(taskToday * 10) / 10, on_clock: onClock(nowMs, cfg), current: cur ? { task_id: cur.task_id, title: cur.title, since: cur.started } : null, overtime: { open: db.prepare('SELECT * FROM overtime WHERE user_id=? AND ended IS NULL AND started IS NOT NULL').get(user.id) || null, today_min: Math.round(ot.filter((r) => r.status !== 'rejected').reduce((a, r) => a + (r.minutes || 0), 0)), rows: ot } };
}

/** What a signed-in person sees on their own task list: their tasks, plus unassigned open ones they can pick up. */
export function myTasks(user) {
  const rows = taskViews("(t.assignee_id = ? OR EXISTS (SELECT 1 FROM json_each(IFNULL(t.team, '[]')) WHERE value = ?) OR (t.assignee_id IS NULL AND t.status <> 'done')) AND IFNULL(t.hidden, 0) = 0 AND (t.status <> 'done' OR t.done_at >= ?)", [user.id, user.id, new Date(Date.now() - 3 * 864e5).toISOString()]);
  return rows.map((t) => ({ ...t, recent: logsFor(t.id, 4) }));
}

function stopRunning(userId, at, exceptTask = 0) {
  db.prepare('UPDATE task_sessions SET ended=? WHERE ended IS NULL AND user_id=? AND task_id<>?').run(at, userId, exceptTask);
}
const log = (task, user, kind, text = '', progress = null, minutes = null) =>
  insertRow('task_logs', { task_id: task.id, user_id: user.id, user_name: user.name, ts: nowIso(), kind, text: text || '', progress, minutes });

/**
 * One worker action on a task. Time is only counted while a timer session is open, so it reflects real working time.
 * actions: claim, start, pause, update, blocked, unblock, done, reopen, add_time
 */
export function taskAction(user, id, body) {
  const t = getRow('tasks', id); if (!t) throw bad('Task not found', 404);
  const manager = user.role === 'admin' || user.role === 'account';
  if (!manager && (t.hidden || !isOnTask(t, user.id))) throw bad(t.hidden ? 'Task not found' : 'This task is assigned to someone else.', t.hidden ? 404 : 403);
  const a = body.action; const text = String(body.text || '').trim().slice(0, 1000); const at = nowIso();
  const open = db.prepare('SELECT * FROM task_sessions WHERE task_id=? AND user_id=? AND ended IS NULL').get(id, user.id);
  if (t.status === 'done' && !['reopen', 'update'].includes(a)) throw bad('This task is already done.');

  if (a === 'claim' || (!t.assignee_id && ['start', 'update', 'done', 'add_time'].includes(a) && !manager)) {
    updateRow('tasks', id, { assignee_id: user.id }); log(t, user, 'assigned', `${user.name} took this task`);
    if (a === 'claim') return taskView(id);
  }
  if (a === 'start') {
    stopRunning(user.id, at, id);
    if (!open) insertRow('task_sessions', { task_id: id, user_id: user.id, user_name: user.name, started: at, ended: null, kind: 'shift' });
    updateRow('tasks', id, { status: 'doing', started_at: t.started_at || at });
    if (!open) log(t, user, 'start', text);
  } else if (a === 'pause') {
    if (!open) throw bad('You are not on this task.');
    db.prepare('UPDATE task_sessions SET ended=? WHERE id=?').run(at, open.id); log(t, user, 'pause', text);
  } else if (a === 'update') {
    const pr = body.progress === undefined || body.progress === null || body.progress === '' ? t.progress : Math.max(0, Math.min(100, Number(body.progress) || 0));
    if (!text && pr === t.progress) throw bad('Write a short update or change the progress.');
    updateRow('tasks', id, { progress: pr, status: t.status === 'todo' ? 'doing' : t.status === 'blocked' ? 'doing' : t.status, started_at: t.started_at || at });
    log(t, user, 'update', text, pr);
  } else if (a === 'blocked') {
    if (!text) throw bad('Say what is blocking you.');
    if (open) db.prepare('UPDATE task_sessions SET ended=? WHERE id=?').run(at, open.id);
    updateRow('tasks', id, { status: 'blocked' }); log(t, user, 'blocked', text);
  } else if (a === 'unblock') {
    updateRow('tasks', id, { status: 'doing' }); log(t, user, 'unblock', text);
  } else if (a === 'done') {
    db.prepare('UPDATE task_sessions SET ended=? WHERE task_id=? AND ended IS NULL').run(at, id);
    updateRow('tasks', id, { status: 'done', progress: 100, done_at: at, started_at: t.started_at || at });
    const v = taskView(id); log(t, user, 'done', text, 100, v.actual_min);
  } else if (a === 'reopen') {
    updateRow('tasks', id, { status: 'doing', done_at: null }); log(t, user, 'reopen', text);
  } else if (a === 'add_time') {
    const m = Number(body.minutes); if (!(m > 0) || m > 720) throw bad('Enter between 1 and 720 minutes.');
    const end = new Date(); const start = new Date(end.getTime() - m * 60000);
    insertRow('task_sessions', { task_id: id, user_id: user.id, user_name: user.name, started: start.toISOString(), ended: end.toISOString(), kind: 'manual' });
    updateRow('tasks', id, { status: t.status === 'todo' ? 'doing' : t.status, started_at: t.started_at || start.toISOString() });
    log(t, user, 'time', text || 'Time added manually', null, m);
  } else if (a === 'need_helper') {
    updateRow('tasks', id, { needs_helper: 1, helper_note: text }); log(t, user, 'helper', text || 'Needs a helper');
  } else if (a === 'helper_ok' && manager) {
    updateRow('tasks', id, { needs_helper: 0 }); log(t, user, 'helper', 'Helper request closed');
  } else throw bad('Unknown action.');
  return taskView(id);
}

/** Hooks for tasks created/edited by managers through the generic table API. */
export function onTaskCreated(task, user) {
  log(task, user, 'created', task.assignee_id ? `Assigned to ${db.prepare('SELECT name FROM users WHERE id=?').get(task.assignee_id)?.name || 'someone'}` : 'Created, not assigned yet');
}
export function onTaskUpdated(before, after, user) {
  if (before.assignee_id !== after.assignee_id) log(after, user, 'assigned', after.assignee_id ? `Assigned to ${db.prepare('SELECT name FROM users WHERE id=?').get(after.assignee_id)?.name}` : 'Unassigned');
  if (JSON.stringify(before.team || null) !== JSON.stringify(after.team || null)) { const n = (a) => (a || []).map((id) => db.prepare('SELECT name FROM users WHERE id=?').get(id)?.name).filter(Boolean); log(after, user, 'assigned', (after.team || []).length ? `Team: ${n(after.team).join(', ')}` : 'Team cleared'); }
  if ((after.team || []).length > (before.team || []).length && after.needs_helper) { updateRow('tasks', after.id, { needs_helper: 0 }); log(after, user, 'helper', 'Helper added — request closed'); }
  if ((before.hidden || 0) !== (after.hidden || 0)) log(after, user, 'hidden', after.hidden ? 'Task hidden from lists' : 'Task shown again');
  if (before.estimate_min !== after.estimate_min) log(after, user, 'estimate', `Estimate changed to ${after.estimate_min || 0} min`, null, after.estimate_min);
}

/** Worker activity between two instants (ISO, or YYYY-MM-DD days): feed, hours per worker per day, finished tasks. */
export function activity(from, to, userId = null) {
  const a = from.length === 10 ? `${from}T00:00:00.000Z` : from; const b = to.length === 10 ? `${to}T23:59:59.999Z` : to;
  const uf = userId ? ' AND l.user_id = ?' : ''; const up = userId ? [userId] : [];
  const logs = db.prepare(`SELECT l.*, t.title, t.stage, t.order_inv, t.estimate_min FROM task_logs l JOIN tasks t ON t.id = l.task_id WHERE l.ts >= ? AND l.ts <= ?${uf} ORDER BY l.ts DESC LIMIT 1000`).all(a, b, ...up);
  const nowMs = Date.now(); const cfgFor = cfgMap(); const cfg = cfgFor(0); const pres = presence();
  const day0 = dayOf(Date.parse(a), cfg); const day1 = dayOf(Math.min(Date.parse(b), nowMs), cfg);
  const names = Object.fromEntries(db.prepare('SELECT id, name FROM users').all().map((u) => [u.id, u.name]));
  const workers = new Set(db.prepare("SELECT id FROM users WHERE role='worker'").all().map((u) => u.id));
  const sess = db.prepare(`SELECT s.*, t.title FROM task_sessions s JOIN tasks t ON t.id = s.task_id WHERE s.started <= ? AND IFNULL(s.ended, ?) >= ?${uf.replace('l.', 's.')} ORDER BY s.started`).all(b, new Date(nowMs).toISOString(), a, ...up);
  const per = {}; const row = (uid, day) => (per[`${uid}|${day}`] ||= { user_id: uid, user_name: names[uid] || '?', day, shift_min: 0, task_min: 0, tasks: {} });
  for (const r of db.prepare('SELECT * FROM work_days WHERE day >= ? AND day <= ?' + (userId ? ' AND user_id = ?' : '')).all(day0, day1, ...up)) if (workers.has(r.user_id)) row(r.user_id, r.day).shift_min = shiftMinutes(r.day, cfgFor(r.user_id), nowMs);
  for (const s of sess) for (const seg of sessionSegments(s, cfgFor(s.user_id), (d) => pres.has(`${s.user_id}|${d}`), nowMs)) {
    if (seg.day < day0 || seg.day > day1) continue;
    const r = row(s.user_id, seg.day); r.task_min += seg.min; const t = (r.tasks[s.task_id] ||= { task_id: s.task_id, title: s.title, min: 0 }); t.min += seg.min;
  }
  const overtime = db.prepare(`SELECT o.*, t.title FROM overtime o LEFT JOIN tasks t ON t.id = o.task_id WHERE o.day >= ? AND o.day <= ?${userId ? ' AND o.user_id = ?' : ''} ORDER BY o.day DESC, o.id DESC`).all(day0, dayOf(Date.parse(b), cfg), ...up);
  for (const o of overtime) if (o.status !== 'rejected') { const r = row(o.user_id, o.day); r.overtime_min = (r.overtime_min || 0) + (o.minutes || 0); }
  const perDay = Object.values(per).map((r) => ({ ...r, overtime_min: Math.round(r.overtime_min || 0), task_min: Math.round(r.task_min), shift_min: Math.round(r.shift_min), tasks: Object.values(r.tasks).map((t) => ({ ...t, min: Math.round(t.min) })) }));
  const done = taskViews("t.status = 'done' AND t.done_at >= ? AND t.done_at <= ?" + (userId ? ' AND t.assignee_id = ?' : ''), [a, b, ...up]);
  const group = (key) => { const m = {}; for (const t of done) { const k = key(t) || '—'; const e = (m[k] ||= { key: k, n: 0, est: 0, actual: 0, withEst: 0 }); e.n++; e.actual += t.actual_min; if (t.estimate_min > 0) { e.est += t.estimate_min; e.withEst += t.actual_min; } } return Object.values(m); };
  return { logs, perDay, done, overtime, byStage: group((t) => t.stage), byWorker: group((t) => t.assignee_name) };
}

/** Overtime: a worker starts and stops it (or adds minutes by hand); the admin approves it. It is never counted as shift time. */
export function overtimeAction(user, body) {
  const a = body.action; const now = new Date(); const cfg = cfgMap()(user.id); const day = dayOf(now.getTime(), cfg);
  const open = db.prepare('SELECT * FROM overtime WHERE user_id=? AND ended IS NULL AND started IS NOT NULL').get(user.id);
  const text = String(body.text || '').trim().slice(0, 300);
  if (a === 'start') {
    if (open) throw bad('Overtime is already running — stop it first.');
    const cur = db.prepare('SELECT task_id FROM task_sessions WHERE user_id=? AND ended IS NULL ORDER BY id DESC').get(user.id);
    return insertRow('overtime', { user_id: user.id, user_name: user.name, day, started: now.toISOString(), ended: null, minutes: 0, task_id: body.task_id || cur?.task_id || null, note: text, status: 'pending', kind: 'clock' });
  }
  if (a === 'stop') {
    if (!open) throw bad('Overtime is not running.');
    const min = Math.min(720, Math.max(1, Math.round((now.getTime() - Date.parse(open.started)) / 60000)));
    return updateRow('overtime', open.id, { ended: now.toISOString(), minutes: min, note: text || open.note });
  }
  if (a === 'add') {
    const m = Math.round(Number(body.minutes)); if (!(m > 0) || m > 720) throw bad('Enter between 1 and 720 minutes.');
    return insertRow('overtime', { user_id: user.id, user_name: user.name, day: /^\d{4}-\d\d-\d\d$/.test(body.day || '') ? body.day : day, started: null, ended: null, minutes: m, task_id: body.task_id || null, note: text, status: 'pending', kind: 'manual' });
  }
  throw bad('Unknown overtime action.');
}

/** Per day for one person: time on tasks, shift, overtime, and which tasks (used to fill attendance). */
export function dayReport(userId, from, to) { const r = activity(from, to, userId); const days = {}; for (const d of r.perDay) days[d.day] = { task_min: d.task_min, shift_min: d.shift_min, overtime_min: d.overtime_min || 0, tasks: d.tasks }; return days; }
