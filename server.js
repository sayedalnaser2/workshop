import http from 'node:http';
import { readFile, writeFile, unlink, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import {
  db, SCHEMA, getSetting, setSetting, nextNumber, insertRow, updateRow, deleteRow, getRow, listRows, tx,
} from './src/db.js';
import { needsSetup, authenticate, createUser, updateUser, deleteUser, listUsers, setOwnPassword, makeToken, userFromToken, cookieOf } from './src/auth.js';
import { tableAccess } from './public/js/perm.js';
import { importWorkbook } from './src/importer.js';
import { seedLibrary } from './src/seed.js';
import { taskViews, taskView, myTasks, taskAction, logsFor, sessionsFor, activity, onTaskCreated, onTaskUpdated, markPresent, shiftStatus } from './src/tasks.js';
import { exportWorkbook } from './src/exporter.js';
import { quoteTotals } from './public/js/calc.js';

seedLibrary();

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const send = (res, code, body, headers = {}) => {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { 'Content-Type': isObj ? 'application/json' : 'text/plain; charset=utf-8', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
};
const readBody = (req, limit = 25e6) => new Promise((resolve, reject) => {
  const chunks = []; let n = 0;
  req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
const readJson = async (req) => { const b = await readBody(req, 5e6); return b.length ? JSON.parse(b.toString('utf8')) : {}; };

// ------------------------------------------------------------------ computed views
const ordersLedger = () => db.prepare(`
  SELECT o.*,
    IFNULL((SELECT SUM(amount) FROM receipts r WHERE r.order_inv = o.inv), 0) AS paid,
    IFNULL((SELECT SUM(amount) FROM purchases p WHERE p.order_inv = o.inv), 0) AS cost
  FROM orders o ORDER BY o.date DESC, o.id DESC`).all().map((o) => ({
  ...o, paid: o.paid, balance: Math.round((o.amount - o.paid) * 100) / 100, profit: Math.round((o.amount - o.cost) * 100) / 100,
}));

function summary() {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const t = {
    invoiced: one('SELECT IFNULL(SUM(amount),0) v FROM orders').v,
    received: one('SELECT IFNULL(SUM(amount),0) v FROM receipts').v,
    purchases: one('SELECT IFNULL(SUM(amount),0) v FROM purchases').v,
    payments: one('SELECT IFNULL(SUM(amount),0) v FROM payments').v,
    openOrders: one('SELECT COUNT(*) v FROM orders WHERE done IS NOT 1').v,
    quotesOpen: one("SELECT COUNT(*) v FROM quotes WHERE status IN ('draft','sent')").v,
  };
  const ledger = ordersLedger();
  const debtors = {};
  for (const o of ledger) if (o.balance > 0.0005) { const k = (o.client || '—').trim().toUpperCase(); (debtors[k] ||= { client: o.client, balance: 0, orders: 0 }); debtors[k].balance += o.balance; debtors[k].orders++; }
  const byYear = db.prepare(`
    SELECT y, SUM(inv) invoiced, SUM(rec) received, SUM(pur) purchases, SUM(pay) payments FROM (
      SELECT substr(date,1,4) y, amount inv, 0 rec, 0 pur, 0 pay FROM orders
      UNION ALL SELECT substr(date,1,4), 0, amount, 0, 0 FROM receipts
      UNION ALL SELECT substr(date,1,4), 0, 0, amount, 0 FROM purchases
      UNION ALL SELECT substr(date,1,4), 0, 0, 0, amount FROM payments)
    WHERE y IS NOT NULL GROUP BY y ORDER BY y`).all();
  const monthly = db.prepare(`
    SELECT m, SUM(inv) invoiced, SUM(rec) received FROM (
      SELECT substr(date,1,7) m, amount inv, 0 rec FROM orders UNION ALL SELECT substr(date,1,7), 0, amount FROM receipts)
    WHERE m IS NOT NULL GROUP BY m ORDER BY m DESC LIMIT 12`).all().reverse();
  const salary = one(`SELECT IFNULL(SUM(p.amount),0) v FROM payments p JOIN employees e ON upper(p.paid_to) LIKE '%'||upper(e.name)||'%'`).v;
  return {
    ...t, balance: Math.round((t.invoiced - t.received) * 100) / 100, salary,
    debtors: Object.values(debtors).sort((a, b) => b.balance - a.balance).slice(0, 10), byYear, monthly,
    profit: Math.round((t.invoiced - t.purchases - t.payments) * 100) / 100,
  };
}

const forbid = () => Object.assign(new Error('You do not have permission to do that.'), { status: 403 });
/** Workers see quantities and sizes, never prices, costs or money. */
function redact(table, r) {
  if (!r) return r;
  switch (table) {
    case 'profiles': return { ...r, price_bar: 0 };
    case 'accessories': return { ...r, price: 0 };
    case 'glass_types': return { ...r, price_m2: 0 };
    case 'stock': return { ...r, unit_cost: 0 };
    case 'quotes': return { ...r, discount: 0, vat_waived: 0, notes: '', mobile: '', items: (r.items || []).map((i) => ({ ...i, price: 0 })) };
    default: return r;
  }
}
const bootstrap = (role = 'admin') => role === 'worker' ? ({
  settings: Object.fromEntries(['colours', 'bar_kerf', 'min_offcut', 'leftover_pct'].map((k) => [k, getSetting(k)]).concat([['company', { name: getSetting('company')?.name }]])),
  price_items: [], profiles: listRows('profiles').map((r) => redact('profiles', r)), accessories: listRows('accessories').map((r) => redact('accessories', r)),
  glass_types: listRows('glass_types').map((r) => redact('glass_types', r)), models: listRows('models'), employees: [], next: {},
}) : ({
  settings: Object.fromEntries(db.prepare('SELECT key FROM settings').all().filter((r) => !['auth', 'session_secret'].includes(r.key)).map((r) => [r.key, getSetting(r.key)])),
  price_items: listRows('price_items'), profiles: listRows('profiles'), accessories: listRows('accessories'),
  glass_types: listRows('glass_types'), models: listRows('models'), employees: listRows('employees'),
  next: { quote: nextNumber('quote'), invoice: nextNumber('invoice'), receipt: nextNumber('receipt'), payment: nextNumber('payment'), po: nextNumber('po') },
});

/** Benefit and cheque payments must carry their number. */
const REF_LABEL = { Benefit: 'Benefit number', Cheque: 'Cheque number' };
function checkRef(t, body, existing = {}) {
  if (t !== 'receipts' && t !== 'payments') return;
  if (existing.id && !('method' in body) && !('ref' in body)) return; // e.g. moving between cash and bank
  const m = { ...existing, ...body };
  if (REF_LABEL[m.method] && !String(m.ref ?? '').trim()) throw Object.assign(new Error(`${REF_LABEL[m.method]} is required when paying by ${m.method}.`), { status: 400 });
}
const AUTO = { quotes: ['number', 'quote'], orders: ['inv', 'invoice'], receipts: ['no', 'receipt'], payments: ['no', 'payment'], purchase_orders: ['po', 'po'] };

// ------------------------------------------------------------------ router
async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api\//, '').split('/');
  const m = req.method;

  // --- auth (no session needed)
  if (p[0] === 'me') { const user = userFromToken(cookieOf(req, 'ws')); return send(res, 200, { needsSetup: needsSetup(), loggedIn: !!user, user }); }
  if (p[0] === 'login' && m === 'POST') {
    const { username, password, name } = await readJson(req);
    let user;
    if (needsSetup()) user = createUser({ username, name: name || username, role: 'admin', password }); // first run: this person becomes the admin
    else { user = authenticate(username, password); if (!user) { await new Promise((r) => setTimeout(r, 400)); return send(res, 401, { error: 'Wrong username or password, or the account is switched off.' }); } }
    return send(res, 200, { ok: true, user }, { 'Set-Cookie': `ws=${makeToken(user.id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 86400}` });
  }
  if (p[0] === 'logout') return send(res, 200, { ok: true }, { 'Set-Cookie': 'ws=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  const user = userFromToken(cookieOf(req, 'ws'));
  if (!user) return send(res, 401, { error: 'Not signed in.' });
  markPresent(user.id);
  const role = user.role; const isAA = role === 'admin' || role === 'account';
  const need = (ok) => { if (!ok) throw forbid(); };

  if (p[0] === 'bootstrap') return send(res, 200, bootstrap(role));
  if (p[0] === 'summary') { need(isAA); return send(res, 200, summary()); }
  if (p[0] === 'ledger') { need(isAA); return send(res, 200, ordersLedger()); }

  // --- tasks: workers use these endpoints (never the raw tables) so they only ever touch their own work
  if (p[0] === 'staff') { need(isAA); return send(res, 200, listUsers().filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, role: u.role }))); }
  if (p[0] === 'shift') return send(res, 200, shiftStatus(user));
  if (p[0] === 'my-tasks') return send(res, 200, myTasks(user));
  if (p[0] === 'tasks-view') { need(isAA); return send(res, 200, taskViews()); }
  if (p[0] === 'activity') {
    need(isAA); const q = url.searchParams; const today = new Date().toISOString().slice(0, 10);
    return send(res, 200, activity(q.get('from') || today, q.get('to') || today, q.get('user') ? Number(q.get('user')) : null));
  }
  if (p[0] === 'tasks' && p[1]) {
    const tid = Number(p[1]); const t = taskView(tid); if (!t) return send(res, 404, { error: 'Task not found' });
    if (!isAA && t.assignee_id && t.assignee_id !== user.id) throw forbid();
    if (m === 'GET' && !p[2]) return send(res, 200, { task: t, logs: logsFor(tid), sessions: sessionsFor(tid) });
    if (m === 'POST' && p[2] === 'action') return send(res, 200, taskAction(user, tid, await readJson(req)));
  }
  if (p[0] === 'users') {
    need(role === 'admin');
    const uid = p[1] ? Number(p[1]) : null;
    if (!uid && m === 'GET') return send(res, 200, listUsers());
    if (!uid && m === 'POST') return send(res, 201, createUser(await readJson(req)));
    if (uid && m === 'PUT') return send(res, 200, updateUser(uid, await readJson(req), user.id));
    if (uid && m === 'DELETE') { deleteUser(uid, user.id); return send(res, 200, { ok: true }); }
  }

  if (p[0] === 'password' && m === 'POST') {
    const { current, password } = await readJson(req);
    setOwnPassword(user.id, current, password); return send(res, 200, { ok: true });
  }
  if (p[0] === 'settings' && m === 'PUT') {
    need(role === 'admin');
    const body = await readJson(req);
    for (const [k, v] of Object.entries(body)) if (!['auth', 'session_secret'].includes(k)) setSetting(k, v);
    return send(res, 200, bootstrap().settings);
  }
  if (p[0] === 'backup') {
    need(role === 'admin');
    const out = { exported: new Date().toISOString(), settings: bootstrap().settings };
    for (const t of Object.keys(SCHEMA)) out[t] = listRows(t);
    return send(res, 200, out, { 'Content-Disposition': `attachment; filename="workshop-backup-${new Date().toISOString().slice(0, 10)}.json"` });
  }
  if (p[0] === 'export.xlsx') {
    need(isAA);
    const buf = Buffer.from(await exportWorkbook());
    return send(res, 200, buf, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="TALENTS-export-${new Date().toISOString().slice(0, 10)}.xlsx"` });
  }
  if (p[0] === 'import' && m === 'POST') {
    need(role === 'admin');
    const buf = await readBody(req, 60e6);
    const tmp = path.join(os.tmpdir(), `import-${Date.now()}.xlsm`);
    await writeFile(tmp, buf);
    try { return send(res, 200, { ok: true, imported: await importWorkbook(tmp) }); }
    catch (e) { return send(res, 400, { error: 'Could not read that workbook: ' + e.message }); }
    finally { unlink(tmp).catch(() => {}); }
  }
  if (p[0] === 'assign-accounts' && m === 'POST') {
    need(isAA);
    const { account } = await readJson(req);
    if (!['cash', 'bank'].includes(account)) return send(res, 400, { error: 'account must be cash or bank' });
    const a = db.prepare("UPDATE receipts SET account=? WHERE account IS NULL OR account=''").run(account).changes;
    const b = db.prepare("UPDATE payments SET account=? WHERE account IS NULL OR account=''").run(account).changes;
    return send(res, 200, { receipts: Number(a), payments: Number(b) });
  }
  // employee documents: raw upload / download, stored under DATA_DIR/files
  if (p[0] === 'employee-docs' && p[2] === 'file') {
    need(isAA);
    const id = Number(p[1]); const d = getRow('employee_docs', id);
    if (!d) return send(res, 404, { error: 'Not found' });
    if (m === 'POST') {
      const name = (url.searchParams.get('name') || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 80);
      const buf = await readBody(req, 15e6);
      const dir = path.join(process.env.DATA_DIR || path.resolve('data'), 'files'); await mkdir(dir, { recursive: true });
      const file = `${id}-${Date.now()}-${name}`; await writeFile(path.join(dir, file), buf);
      return send(res, 200, updateRow('employee_docs', id, { file_name: name, file_path: file }));
    }
    if (!d.file_path) return send(res, 404, { error: 'No file attached' });
    const buf = await readFile(path.join(process.env.DATA_DIR || path.resolve('data'), 'files', path.basename(d.file_path))).catch(() => null);
    if (!buf) return send(res, 404, { error: 'File missing' });
    return send(res, 200, buf, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${encodeURIComponent(d.file_name || 'file')}"` });
  }
  if (p[0] === 'quotes' && p[2] === 'to-order' && m === 'POST') {
    need(isAA);
    const q = getRow('quotes', Number(p[1]));
    if (!q) return send(res, 404, { error: 'Quote not found' });
    if (q.order_inv) return send(res, 400, { error: `Already converted to ${q.order_inv}` });
    const o = tx(() => {
      const inv = nextNumber('invoice', new Date().toISOString(), true);
      const order = insertRow('orders', { inv, date: new Date().toISOString().slice(0, 10), client: q.client, site: q.site, mobile: q.mobile, amount: Math.round(quoteTotals(q).grand * 1000) / 1000, done: 0, quote_no: q.number });
      updateRow('quotes', q.id, { order_inv: inv, status: 'accepted' });
      return order;
    });
    return send(res, 200, o);
  }

  // --- generic CRUD
  if (p[0] === 't' && SCHEMA[p[1]]) {
    const t = p[1]; const id = p[2] ? Number(p[2]) : null;
    const acc = tableAccess(role, t);
    if (!acc || (m !== 'GET' && acc !== 'rw')) throw forbid();
    const worker = role === 'worker';
    if (!id && m === 'GET') return send(res, 200, worker ? listRows(t).map((r) => redact(t, r)) : listRows(t));
    if (id && m === 'GET') { const r = getRow(t, id); return r ? send(res, 200, worker ? redact(t, r) : r) : send(res, 404, { error: 'Not found' }); }
    if (!id && m === 'POST') {
      const body = await readJson(req);
      const row = tx(() => {
        checkRef(t, body);
        if (t === 'tasks') { body.status = body.status || 'todo'; body.progress = body.progress ?? 0; body.created_by = user.id; }
        if (worker && t === 'stock') { delete body.unit_cost; if (body.kind === 'leftover' && body.profile_id) { const pr = getRow('profiles', Number(body.profile_id)); body.unit_cost = pr && pr.bar_length > 0 ? Math.round((pr.price_bar / pr.bar_length) * (body.length || 0) * ((getSetting('leftover_pct') ?? 60) / 100) * 1000) / 1000 : 0; } }
        const a = AUTO[t];
        if (a && !body[a[0]]) body[a[0]] = nextNumber(a[1], body.date, true);
        const created = insertRow(t, body); if (t === 'tasks') onTaskCreated(created, user); return created;
      });
      return send(res, 201, row);
    }
    if (id && m === 'PUT') { const cur = getRow(t, id); if (!cur) return send(res, 404, { error: 'Not found' }); const body = await readJson(req); checkRef(t, body, cur); if (worker) delete body.unit_cost;
      if (t === 'tasks') { if (body.status === 'done' && cur.status !== 'done') { body.done_at = new Date().toISOString(); body.progress = 100; } else if (body.status && body.status !== 'done' && cur.status === 'done') body.done_at = null; }
      const saved = updateRow(t, id, body); if (t === 'tasks') onTaskUpdated(cur, saved, user); return send(res, 200, saved); }
    if (id && m === 'DELETE') { if (t === 'tasks') { db.prepare('DELETE FROM task_logs WHERE task_id=?').run(id); db.prepare('DELETE FROM task_sessions WHERE task_id=?').run(id); } deleteRow(t, id); return send(res, 200, { ok: true }); }
  }
  return send(res, 404, { error: 'Unknown endpoint' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
    const s = await stat(file).catch(() => null);
    if (!s || s.isDirectory()) file = path.join(PUBLIC, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch (e) {
    console.error(e);
    send(res, e.status || 500, { error: e.message });
  }
}).listen(PORT, () => console.log(`Workshop running on http://localhost:${PORT}`));
