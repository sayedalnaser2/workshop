import { db, insertRow, updateRow, getRow } from './db.js';

const nowIso = () => new Date().toISOString();
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
export const STATUSES = ['todo', 'doing', 'blocked', 'done'];

/** Tasks with who/what/how-long attached. where: SQL condition on t (with params). */
export function taskViews(where = '1=1', params = []) {
  const now = nowIso();
  const rows = db.prepare(`
    SELECT t.*, u.name AS assignee_name, o.client, o.site,
      IFNULL((SELECT SUM((julianday(IFNULL(s.ended, ?)) - julianday(s.started)) * 1440) FROM task_sessions s WHERE s.task_id = t.id), 0) AS actual_min,
      (SELECT s.started FROM task_sessions s WHERE s.task_id = t.id AND s.ended IS NULL ORDER BY s.id DESC LIMIT 1) AS running_since,
      (SELECT s.user_name FROM task_sessions s WHERE s.task_id = t.id AND s.ended IS NULL ORDER BY s.id DESC LIMIT 1) AS running_by,
      (SELECT MAX(l.ts) FROM task_logs l WHERE l.task_id = t.id) AS last_activity
    FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id LEFT JOIN orders o ON o.inv = t.order_inv AND t.order_inv <> ''
    WHERE ${where} ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'blocked' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END, CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, IFNULL(t.due, '9999'), t.id DESC`).all(now, ...params);
  return rows.map((r) => ({ ...r, actual_min: Math.round(r.actual_min * 10) / 10 }));
}
export const taskView = (id) => taskViews('t.id = ?', [id])[0] || null;
export const logsFor = (id, limit = 200) => db.prepare('SELECT * FROM task_logs WHERE task_id=? ORDER BY ts DESC, id DESC LIMIT ?').all(id, limit);
export const sessionsFor = (id) => db.prepare('SELECT * FROM task_sessions WHERE task_id=? ORDER BY started DESC').all(id);

/** What a signed-in person sees on their own task list: their tasks, plus unassigned open ones they can pick up. */
export function myTasks(user) {
  const rows = taskViews("(t.assignee_id = ? OR (t.assignee_id IS NULL AND t.status <> 'done')) AND (t.status <> 'done' OR t.done_at >= ?)", [user.id, new Date(Date.now() - 3 * 864e5).toISOString()]);
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
  if (!manager && t.assignee_id && t.assignee_id !== user.id) throw bad('This task is assigned to someone else.', 403);
  const a = body.action; const text = String(body.text || '').trim().slice(0, 1000); const at = nowIso();
  const open = db.prepare('SELECT * FROM task_sessions WHERE task_id=? AND user_id=? AND ended IS NULL').get(id, user.id);
  if (t.status === 'done' && !['reopen', 'update'].includes(a)) throw bad('This task is already done.');

  if (a === 'claim' || (!t.assignee_id && ['start', 'update', 'done', 'add_time'].includes(a) && !manager)) {
    updateRow('tasks', id, { assignee_id: user.id }); log(t, user, 'assigned', `${user.name} took this task`);
    if (a === 'claim') return taskView(id);
  }
  if (a === 'start') {
    stopRunning(user.id, at, id);
    if (!open) insertRow('task_sessions', { task_id: id, user_id: user.id, user_name: user.name, started: at, ended: null });
    updateRow('tasks', id, { status: 'doing', started_at: t.started_at || at });
    if (!open) log(t, user, 'start', text);
  } else if (a === 'pause') {
    if (!open) throw bad('The timer is not running.');
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
    insertRow('task_sessions', { task_id: id, user_id: user.id, user_name: user.name, started: start.toISOString(), ended: end.toISOString() });
    updateRow('tasks', id, { status: t.status === 'todo' ? 'doing' : t.status, started_at: t.started_at || start.toISOString() });
    log(t, user, 'time', text || 'Time added manually', null, m);
  } else throw bad('Unknown action.');
  return taskView(id);
}

/** Hooks for tasks created/edited by managers through the generic table API. */
export function onTaskCreated(task, user) {
  log(task, user, 'created', task.assignee_id ? `Assigned to ${db.prepare('SELECT name FROM users WHERE id=?').get(task.assignee_id)?.name || 'someone'}` : 'Created, not assigned yet');
}
export function onTaskUpdated(before, after, user) {
  if (before.assignee_id !== after.assignee_id) log(after, user, 'assigned', after.assignee_id ? `Assigned to ${db.prepare('SELECT name FROM users WHERE id=?').get(after.assignee_id)?.name}` : 'Unassigned');
  if (before.estimate_min !== after.estimate_min) log(after, user, 'estimate', `Estimate changed to ${after.estimate_min || 0} min`, null, after.estimate_min);
}

/** Worker activity between two dates (YYYY-MM-DD), plus estimate-vs-actual for tasks finished in that range. */
export function activity(from, to, userId = null) {
  const a = from.length === 10 ? `${from}T00:00:00.000Z` : from; const b = to.length === 10 ? `${to}T23:59:59.999Z` : to; // the browser sends local-day boundaries as ISO
  const uf = userId ? ' AND user_id = ?' : ''; const up = userId ? [userId] : [];
  const logs = db.prepare(`SELECT l.*, t.title, t.stage, t.order_inv, t.estimate_min FROM task_logs l JOIN tasks t ON t.id = l.task_id WHERE l.ts >= ? AND l.ts <= ?${uf.replace('user_id', 'l.user_id')} ORDER BY l.ts DESC LIMIT 1000`).all(a, b, ...up);
  const now = nowIso();
  const sessions = db.prepare(`SELECT s.*, IFNULL(s.ended, ?) AS end_eff, t.title, t.stage, t.order_inv FROM task_sessions s JOIN tasks t ON t.id = s.task_id WHERE s.started <= ? AND IFNULL(s.ended, ?) >= ?${uf.replace('user_id', 's.user_id')} ORDER BY s.started DESC LIMIT 2000`).all(now, b, now, a, ...up);
  const done = taskViews("t.status = 'done' AND t.done_at >= ? AND t.done_at <= ?" + (userId ? ' AND t.assignee_id = ?' : ''), [a, b, ...up]);
  const group = (key) => { const m = {}; for (const t of done) { const k = key(t) || '—'; const e = (m[k] ||= { key: k, n: 0, est: 0, actual: 0, withEst: 0 }); e.n++; e.actual += t.actual_min; if (t.estimate_min > 0) { e.est += t.estimate_min; e.withEst += t.actual_min; } } return Object.values(m); };
  return { logs, sessions, done, byStage: group((t) => t.stage), byWorker: group((t) => t.assignee_name) };
}
