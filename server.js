import http from 'node:http';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import {
  db, SCHEMA, getSetting, setSetting, nextNumber, insertRow, updateRow, deleteRow, getRow, listRows, tx,
} from './src/db.js';
import { needsSetup, authenticate, createUser, updateUser, deleteUser, listUsers, setOwnPassword, makeToken, userFromToken, cookieOf } from './src/auth.js';
import { tableAccess } from './public/js/perm.js';
import { importWorkbook } from './src/importer.js';
import { seedLibrary, seedKitchenOptions, seedExtraModels, seedKitchenPresets, seedBalexco } from './src/seed.js';
import { isOnTask, taskViews, taskView, myTasks, taskAction, logsFor, sessionsFor, activity, onTaskCreated, onTaskUpdated, markPresent, shiftStatus } from './src/tasks.js';
import { exportWorkbook } from './src/exporter.js';
import { quoteTotals, approvalFor, discountPct } from './public/js/calc.js';
import { vatReport, orderVat } from './public/js/vat.js';
import { audit, diff, labelOf, listAudit, notable } from './src/audit.js';
import { respond, staticServer, throttleCheck, throttleFail, throttleOk, runBackup, listBackups, backupDir } from './src/web.js';

seedLibrary(); seedKitchenOptions(); seedExtraModels(); seedKitchenPresets(); seedBalexco();

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEV = process.env.WORKSHOP_DEV === '1';
// the bundled, minified build when it exists (npm start builds it), otherwise the readable sources
const PUBLIC = !DEV && existsSync(path.join(ROOT, 'dist/index.html')) ? path.join(ROOT, 'dist') : path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;

// responses over 1 KB are compressed when the browser accepts it (res.req gives us its Accept-Encoding)
const send = (res, code, body, headers = {}) => respond(res.req, res, code, body, headers);
const readBody = (req, limit = 25e6) => new Promise((resolve, reject) => {
  const chunks = []; let n = 0;
  req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
const readJson = async (req) => { const b = await readBody(req, 5e6); return b.length ? JSON.parse(b.toString('utf8')) : {}; };

// ------------------------------------------------------------------ computed views
// one pass over receipts and purchases instead of two sub-queries per order
const ordersLedger = () => db.prepare(`
  SELECT o.*, IFNULL(r.paid, 0) AS paid, IFNULL(p.cost, 0) AS cost, IFNULL(c.credit, 0) AS credit
  FROM orders o
  LEFT JOIN (SELECT order_inv, SUM(amount) AS paid FROM receipts GROUP BY order_inv) r ON r.order_inv = o.inv
  LEFT JOIN (SELECT order_inv, SUM(total) AS credit FROM credit_notes WHERE status = 'approved' GROUP BY order_inv) c ON c.order_inv = o.inv
  LEFT JOIN (SELECT order_inv, SUM(amount) AS cost FROM purchases GROUP BY order_inv) p ON p.order_inv = o.inv
  ORDER BY o.date DESC, o.id DESC`).all().map((o) => ({
  ...o, paid: o.paid, balance: Math.round((o.amount - o.credit - o.paid) * 100) / 100, profit: Math.round((o.amount - o.credit - o.cost) * 100) / 100,
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
    credits: one("SELECT IFNULL(SUM(total),0) v FROM credit_notes WHERE status='approved'").v,
    pendingApprovals: one("SELECT (SELECT COUNT(*) FROM quotes WHERE approval='pending') + (SELECT COUNT(*) FROM credit_notes WHERE status='pending') v").v,
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
    ...t, balance: Math.round((t.invoiced - t.credits - t.received) * 100) / 100, salary,
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
  next: { quote: nextNumber('quote'), invoice: nextNumber('invoice'), receipt: nextNumber('receipt'), payment: nextNumber('payment'), po: nextNumber('po'), credit: nextNumber('credit') },
});

/** Benefit and cheque payments must carry their number. */
const REF_LABEL = { Benefit: 'Benefit number', Cheque: 'Cheque number' };
function checkRef(t, body, existing = {}) {
  if (t !== 'receipts' && t !== 'payments') return;
  if (existing.id && !('method' in body) && !('ref' in body)) return; // e.g. moving between cash and bank
  const m = { ...existing, ...body };
  if (REF_LABEL[m.method] && !String(m.ref ?? '').trim()) throw Object.assign(new Error(`${REF_LABEL[m.method]} is required when paying by ${m.method}.`), { status: 400 });
}
const AUTO = { quotes: ['number', 'quote'], orders: ['inv', 'invoice'], receipts: ['no', 'receipt'], payments: ['no', 'payment'], purchase_orders: ['po', 'po'], credit_notes: ['no', 'credit'] };


// ------------------------------------------------------------------ approvals, credit notes, files
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const approvalCfg = () => ({ discount_pct: 10, credit_notes: true, ...(getSetting('approvals') || {}) });

/** Quotation saved by a user: work out whether the discount needs the admin, and keep sent/accepted off until it is approved. */
function quoteApproval(body, cur, user) {
  const merged = { ...(cur || {}), ...body };
  const a = approvalFor(merged, cur, Number(approvalCfg().discount_pct) || 0, user.role === 'admin');
  if (a.approval === 'pending' && ['sent', 'accepted'].includes(merged.status)) body.status = 'draft'; // cannot go out until the admin approves the discount
  body.approval = a.approval; body.approved_disc = a.approved_disc;
  if (a.approval !== 'pending') body.approval_note = a.approval ? (cur?.approval === 'approved' && user.role !== 'admin' ? cur.approval_note : `Approved by ${user.name}`) : '';
  else body.approval_note = '';
}
/** Totals of a credit note come from its lines, never from the browser. */
function creditTotals(c) {
  const lines = (c.lines || []).filter((l) => l && (Number(l.qty) || 0) * (Number(l.price) || 0) !== 0 || l?.desc);
  const net = Math.round(lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0) * 1000) / 1000;
  const vat = Math.round(net * (Number(c.vat_rate) || 0) / 100 * 1000) / 1000;
  return { lines, net, vat, total: Math.round((net + vat) * 1000) / 1000 };
}
function checkCredit(c, selfId = 0) {
  if (!(c.total > 0)) throw bad('A credit note needs at least one line with an amount.');
  const o = c.order_inv && db.prepare('SELECT amount FROM orders WHERE inv=?').get(c.order_inv);
  if (o) {
    const other = db.prepare("SELECT IFNULL(SUM(total),0) v FROM credit_notes WHERE order_inv=? AND status IN ('approved','pending') AND id<>?").get(c.order_inv, selfId).v;
    if (c.total + other > o.amount + 0.0005) throw bad(`Credit notes for ${c.order_inv} would be BD ${(c.total + other).toFixed(3)}, more than the invoice (BD ${o.amount.toFixed(3)}).`);
  }
}

const FILE_TYPES = { 'image/jpeg': 'inline', 'image/png': 'inline', 'image/webp': 'inline', 'image/gif': 'inline', 'application/pdf': 'inline' };
const filesDir = () => path.join(process.env.DATA_DIR || path.resolve('data'), 'files');

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
    else {
      const wait = throttleCheck(req, username); if (wait) return send(res, 429, { error: `Too many wrong passwords. Try again in ${wait} seconds.` });
      user = authenticate(username, password);
      if (!user) { throttleFail(req, username); await new Promise((r) => setTimeout(r, 400)); return send(res, 401, { error: 'Wrong username or password, or the account is switched off.' }); }
      throttleOk(req, username);
    }
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
  if (p[0] === 'staff') return send(res, 200, listUsers().filter((u) => u.active).map((u) => (isAA ? { id: u.id, name: u.name, role: u.role } : { id: u.id, name: u.name }))); // names only for workers (calendar teams)
  if (p[0] === 'shift') return send(res, 200, shiftStatus(user));
  if (p[0] === 'my-tasks') return send(res, 200, myTasks(user));
  if (p[0] === 'tasks-view') { need(isAA); return send(res, 200, taskViews()); }
  if (p[0] === 'activity') {
    need(isAA); const q = url.searchParams; const today = new Date().toISOString().slice(0, 10);
    return send(res, 200, activity(q.get('from') || today, q.get('to') || today, q.get('user') ? Number(q.get('user')) : null));
  }
  if (p[0] === 'tasks' && p[1]) {
    const tid = Number(p[1]); const t = taskView(tid); if (!t) return send(res, 404, { error: 'Task not found' });
    if (!isAA && t.hidden) return send(res, 404, { error: 'Task not found' }); // hidden tasks do not exist for workers
    if (!isAA && !isOnTask(t, user.id)) throw forbid();
    if (m === 'GET' && !p[2]) return send(res, 200, { task: t, logs: logsFor(tid), sessions: sessionsFor(tid) });
    if (m === 'POST' && p[2] === 'action') return send(res, 200, taskAction(user, tid, await readJson(req)));
  }

  // --- approvals: discounts above the limit and credit notes made by Accounts wait for the admin
  if (p[0] === 'approvals') {
    need(isAA);
    if (!p[1] && m === 'GET') {
      const quotes = db.prepare("SELECT id, number, client, date, discount, approval, approval_note, items, vat_rate, vat_waived, prepared_by FROM quotes WHERE approval IN ('pending','rejected') ORDER BY id DESC").all().map((q) => ({ ...q, items: JSON.parse(q.items || '[]') })).map((q) => ({ id: q.id, number: q.number, client: q.client, date: q.date, discount: q.discount, pct: discountPct(q), total: quoteTotals(q).grand, approval: q.approval, note: q.approval_note, prepared_by: q.prepared_by }));
      const credits = db.prepare("SELECT id, no, client, date, order_inv, total, reason, status, requested_by, approval_note FROM credit_notes WHERE status IN ('pending','rejected') ORDER BY id DESC").all();
      return send(res, 200, { limit: approvalCfg().discount_pct, quotes, credits });
    }
    if (m === 'POST' && (p[1] === 'quotes' || p[1] === 'credit_notes') && p[2]) {
      need(role === 'admin');
      const { decision, note = '' } = await readJson(req); const id = Number(p[2]);
      if (!['approve', 'reject'].includes(decision)) throw bad('Decision must be approve or reject.');
      const cur = getRow(p[1], id); if (!cur) return send(res, 404, { error: 'Not found' });
      const patch = p[1] === 'quotes'
        ? (decision === 'approve' ? { approval: 'approved', approved_disc: cur.discount, approval_note: `Approved by ${user.name}${note ? ': ' + note : ''}` } : { approval: 'rejected', approved_disc: 0, approval_note: `Rejected by ${user.name}${note ? ': ' + note : ''}` })
        : (decision === 'approve' ? { status: 'approved', approval_note: `Approved by ${user.name}${note ? ': ' + note : ''}` } : { status: 'rejected', approval_note: `Rejected by ${user.name}${note ? ': ' + note : ''}` });
      const saved = updateRow(p[1], id, patch);
      audit(user, p[1], id, decision === 'approve' ? 'approved' : 'rejected', labelOf(saved), [{ f: 'decision', from: '', to: decision + (note ? ` — ${note}` : '') }]);
      return send(res, 200, saved);
    }
  }
  if (p[0] === 'audit' && m === 'GET') {
    need(role === 'admin'); const q = url.searchParams;
    return send(res, 200, listAudit({ table: q.get('table') || '', user: Number(q.get('user')) || 0, from: q.get('from') || '', to: q.get('to') || '', q: q.get('q') || '', limit: Number(q.get('limit')) || 100, offset: Number(q.get('offset')) || 0 }));
  }
  if (p[0] === 'vat-report' && m === 'GET') {
    need(isAA); const q = url.searchParams;
    const credits = listRows('credit_notes').filter((c) => c.status === 'approved');
    return send(res, 200, vatReport({ orders: listRows('orders'), quotes: listRows('quotes'), credits, purchases: listRows('purchases'), payments: listRows('payments'), settings: { vat_rate: getSetting('vat_rate'), purchase_vat_default: getSetting('purchase_vat_default') } }, q.get('from') || '', q.get('to') || ''));
  }

  // --- photos and files on orders, tasks and site surveys
  if (p[0] === 'files') {
    const canTouch = (type, key) => {
      if (isAA) return ['order', 'task', 'survey', 'quote', 'kitchen'].includes(type);
      if (type === 'task') { const t = taskView(Number(key)); return !!t && !t.hidden && isOnTask(t, user.id); }
      return type === 'survey';
    };
    if (!p[1] && m === 'GET') {
      const type = url.searchParams.get('ref_type') || ''; const key = url.searchParams.get('ref_key') || '';
      if (!canTouch(type, key)) throw forbid();
      return send(res, 200, db.prepare('SELECT id, ref_type, ref_key, tag, kind, file_name, mime, note, user_name, size, created_at FROM attachments WHERE ref_type=? AND ref_key=? ORDER BY id').all(type, key));
    }
    if (!p[1] && m === 'POST') {
      const q = url.searchParams; const type = q.get('ref_type') || ''; const key = q.get('ref_key') || '';
      if (!key || !canTouch(type, key)) throw forbid();
      const buf = await readBody(req, 14e6); if (!buf.length) throw bad('Empty file.');
      const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase(); const name = (q.get('name') || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 80);
      await mkdir(filesDir(), { recursive: true });
      const file = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`; await writeFile(path.join(filesDir(), file), buf);
      const row = insertRow('attachments', { ref_type: type, ref_key: key, tag: q.get('tag') || '', kind: q.get('kind') || 'file', file_name: name, file_path: file, mime: FILE_TYPES[mime] ? mime : 'application/octet-stream', note: q.get('note') || '', user_name: user.name, size: buf.length });
      audit(user, 'attachments', row.id, 'created', `${type} ${key}: ${name}`);
      const { file_path: _f, ...pub } = row; return send(res, 201, pub);
    }
    if (p[1] && (m === 'GET' || m === 'DELETE')) {
      const a = getRow('attachments', Number(p[1])); if (!a) return send(res, 404, { error: 'Not found' });
      if (!canTouch(a.ref_type, a.ref_key)) throw forbid();
      if (m === 'DELETE') {
        if (!isAA && a.user_name !== user.name) throw forbid();
        deleteRow('attachments', a.id); unlink(path.join(filesDir(), path.basename(a.file_path))).catch(() => {});
        audit(user, 'attachments', a.id, 'deleted', `${a.ref_type} ${a.ref_key}: ${a.file_name}`); return send(res, 200, { ok: true });
      }
      const buf = await readFile(path.join(filesDir(), path.basename(a.file_path))).catch(() => null); if (!buf) return send(res, 404, { error: 'File missing' });
      return send(res, 200, buf, { 'Content-Type': a.mime || 'application/octet-stream', 'Content-Disposition': `${FILE_TYPES[a.mime] || 'attachment'}; filename="${encodeURIComponent(a.file_name || 'file')}"`, 'Cache-Control': 'private, max-age=3600' });
    }
  }
  if (p[0] === 'users') {
    need(role === 'admin');
    const uid = p[1] ? Number(p[1]) : null;
    if (!uid && m === 'GET') return send(res, 200, listUsers());
    if (!uid && m === 'POST') { const b = await readJson(req); const u = createUser(b); audit(user, 'users', u.id, 'created', `${u.name} (${u.role})`); return send(res, 201, u); }
    if (uid && m === 'PUT') { const b = await readJson(req); const before = listUsers().find((x) => x.id === uid); const u = updateUser(uid, b, user.id); audit(user, 'users', uid, 'updated', u.name, [...['name', 'username', 'role', 'active'].filter((k) => before && before[k] !== u[k]).map((k) => ({ f: k, from: String(before[k]), to: String(u[k]) })), ...(b.password ? [{ f: 'password', from: '', to: '(reset)' }] : [])]); return send(res, 200, u); }
    if (uid && m === 'DELETE') { const before = listUsers().find((x) => x.id === uid); deleteUser(uid, user.id); audit(user, 'users', uid, 'deleted', before?.name || ''); return send(res, 200, { ok: true }); }
  }

  if (p[0] === 'password' && m === 'POST') {
    const { current, password } = await readJson(req);
    setOwnPassword(user.id, current, password); return send(res, 200, { ok: true });
  }
  if (p[0] === 'settings' && m === 'PUT') {
    need(role === 'admin');
    const body = await readJson(req);
    const changed = [];
    for (const [k, v] of Object.entries(body)) if (!['auth', 'session_secret'].includes(k)) { if (JSON.stringify(getSetting(k)) !== JSON.stringify(v)) changed.push({ f: k, from: '', to: typeof v === 'object' ? '(changed)' : String(v) }); setSetting(k, v); }
    if (changed.length) audit(user, 'settings', null, 'updated', 'Settings', changed);
    return send(res, 200, bootstrap().settings);
  }
  if (p[0] === 'backups') { // automatic daily copies of the database
    need(role === 'admin');
    if (!p[1]) return send(res, 200, await listBackups());
    if (!/^workshop-\d{4}-\d\d-\d\d\.db$/.test(p[1])) return send(res, 400, { error: 'Bad file name' });
    const buf = await readFile(path.join(backupDir(), p[1])).catch(() => null);
    return buf ? send(res, 200, buf, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${p[1]}"` }) : send(res, 404, { error: 'Not found' });
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
    try { const imported = await importWorkbook(tmp); audit(user, 'import', null, 'imported', 'Excel workbook', Object.entries(imported).map(([k, v]) => ({ f: k, from: '', to: String(v) }))); return send(res, 200, { ok: true, imported }); }
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
    if (q.approval === 'pending' || q.approval === 'rejected') return send(res, 400, { error: q.approval === 'pending' ? 'This quotation has a discount waiting for the admin to approve it.' : `The admin did not approve the discount. ${q.approval_note || ''} Lower the discount and save again.` });
    const o = tx(() => {
      const inv = nextNumber('invoice', new Date().toISOString(), true);
      const T = quoteTotals(q);
      const order = insertRow('orders', { inv, date: new Date().toISOString().slice(0, 10), client: q.client, site: q.site, mobile: q.mobile, amount: Math.round(T.grand * 1000) / 1000, vat: Math.round(Math.max(0, T.vat - T.waived) * 1000) / 1000, client_vat: q.client_vat || '', done: 0, quote_no: q.number });
      updateRow('quotes', q.id, { order_inv: inv, status: 'accepted' });
      audit(user, 'orders', order.id, 'created', `${inv} from ${q.number}`);
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
    // a worker's calendar only holds the jobs they are on
    const visible = (r) => !(worker && t === 'events') || (r.team || []).map(Number).includes(user.id);
    if (!id && m === 'GET') return send(res, 200, worker ? listRows(t).filter(visible).map((r) => redact(t, r)) : listRows(t));
    if (id && m === 'GET') { const r = getRow(t, id); return r && visible(r) ? send(res, 200, worker ? redact(t, r) : r) : send(res, 404, { error: 'Not found' }); }
    if (!id && m === 'POST') {
      const body = await readJson(req);
      const row = tx(() => {
        checkRef(t, body);
        if (t === 'tasks') { body.status = body.status || 'todo'; body.progress = body.progress ?? 0; body.created_by = user.id; }
        if (worker && t === 'stock') { delete body.unit_cost; if (body.kind === 'leftover' && body.profile_id) { const pr = getRow('profiles', Number(body.profile_id)); body.unit_cost = pr && pr.bar_length > 0 ? Math.round((pr.price_bar / pr.bar_length) * (body.length || 0) * ((getSetting('leftover_pct') ?? 60) / 100) * 1000) / 1000 : 0; } }
        if (t === 'quotes') quoteApproval(body, null, user);
        if (t === 'surveys') { body.surveyor = body.surveyor || user.name; body.status = body.status || 'open'; }
        if (t === 'events') body.status = body.status || 'planned';
        if (t === 'credit_notes') {
          Object.assign(body, creditTotals(body)); checkCredit(body);
          body.status = user.role === 'admin' || !approvalCfg().credit_notes ? 'approved' : 'pending'; body.requested_by = user.name;
          body.approval_note = body.status === 'approved' ? `Approved by ${user.name}` : '';
        }
        const a = AUTO[t];
        if (a && !body[a[0]]) body[a[0]] = nextNumber(a[1], body.date, true);
        const created = insertRow(t, body); if (t === 'tasks') onTaskCreated(created, user);
        audit(user, t, created.id, 'created', labelOf(created), notable(created)); return created;
      });
      return send(res, 201, row);
    }
    if (id && m === 'PUT') {
      const cur = getRow(t, id); if (!cur || !visible(cur)) return send(res, 404, { error: 'Not found' });
      const body = await readJson(req); checkRef(t, body, cur); if (worker) delete body.unit_cost;
      if (t === 'tasks' && 'hidden' in body) { need(role === 'admin'); body.hidden = body.hidden ? 1 : 0; } // only an admin hides or shows tasks
      if (t === 'tasks') { if (body.status === 'done' && cur.status !== 'done') { body.done_at = new Date().toISOString(); body.progress = 100; } else if (body.status && body.status !== 'done' && cur.status === 'done') body.done_at = null; }
      if (t === 'quotes') {
        if (user.role !== 'admin') { delete body.approval; delete body.approved_disc; delete body.approval_note; }
        quoteApproval(body, cur, user);
      }
      if (t === 'credit_notes') {
        if (user.role !== 'admin') { delete body.status; delete body.approval_note; }
        const merged = { ...cur, ...body }; Object.assign(body, creditTotals(merged)); checkCredit({ ...merged, ...body }, id);
        if (user.role !== 'admin' && approvalCfg().credit_notes && ['approved', 'rejected'].includes(cur.status)) body.status = 'pending'; // changed after a decision: needs a new one
      }
      const saved = updateRow(t, id, body); if (t === 'tasks') onTaskUpdated(cur, saved, user);
      const ch = diff(t, cur, saved); if (ch.length) audit(user, t, id, 'updated', labelOf(saved), ch);
      return send(res, 200, saved);
    }
    if (id && m === 'DELETE') {
      const cur = getRow(t, id);
      if (t === 'tasks') { db.prepare('DELETE FROM task_logs WHERE task_id=?').run(id); db.prepare('DELETE FROM task_sessions WHERE task_id=?').run(id); }
      if (t === 'credit_notes' && cur?.status === 'approved' && user.role !== 'admin') throw bad('Only the admin can delete an approved credit note.', 403);
      deleteRow(t, id); audit(user, t, id, 'deleted', labelOf(cur), cur ? notable(cur).map((c) => ({ f: c.f, from: c.to, to: '' })) : null);
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: 'Unknown endpoint' });
}

const serveStatic = staticServer(PUBLIC, { dev: DEV });
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/healthz') return await send(res, 200, { ok: true });
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return await serveStatic(req, res, decodeURIComponent(url.pathname));
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) await send(res, e.status || 500, { error: e.message }); else res.end();
  }
});
server.keepAliveTimeout = 65000;
server.listen(PORT, () => console.log(`Workshop running on http://localhost:${PORT}${PUBLIC.endsWith('dist') ? ' (production build)' : ' (development, unbundled)'}`));

// a consistent copy of the database every day (kept for 14 days), and tidy-up on shutdown
const backup = () => runBackup().then((n) => n && console.log(`Backup saved: ${n}`)).catch((e) => console.error('Backup failed:', e.message));
setTimeout(backup, 5000).unref(); setInterval(backup, 6 * 3600e3).unref();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { db.exec('PRAGMA optimize'); } catch {} server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
