import http from 'node:http';
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import {
  db, SCHEMA, getSetting, setSetting, nextNumber, insertRow, updateRow, deleteRow, getRow, listRows, tx,
} from './src/db.js';
import { needsSetup, syncEmployees, authenticate, createUser, updateUser, deleteUser, listUsers, setOwnPassword, makeToken, userFromToken, cookieOf, verifyOwnPassword } from './src/auth.js';
import { tableAccess, hasAny, hasEditAny, seesMoney } from './public/js/perm.js';
import { importWorkbook } from './src/importer.js';
import { DEFAULT_CHART, buildEntries, trialBalance, statements, accountLedger, DEBIT_TYPES } from './public/js/accounting.js';
import { seedBankAccounts, linkBankToChart, seedChart, seedLibrary, seedKitchenOptions, seedExtraModels, seedKitchenPresets, seedBalexco, seedAluKitchen } from './src/seed.js';
import { isOnTask, taskViews, taskView, myTasks, taskAction, logsFor, sessionsFor, activity, onTaskCreated, onTaskUpdated, markPresent, shiftStatus, overtimeAction, dayReport } from './src/tasks.js';
import { targetProgress, METRICS } from './src/targets.js';
import { exportWorkbook } from './src/exporter.js';
import { exportActivity } from './src/activity-export.js';
import { purgeOldPhotos, photoStats } from './src/retention.js';
import { quoteTotals, approvalFor, discountPct } from './public/js/calc.js';
import { vatReport, orderVat, vatIn } from './public/js/vat.js';
import { audit, diff, labelOf, listAudit, notable } from './src/audit.js';
import { respond, staticServer, throttleCheck, throttleFail, throttleOk, runBackup, listBackups, backupDir } from './src/web.js';

syncEmployees(); seedChart(DEFAULT_CHART); seedBankAccounts(); freezeAllVat(); seedLibrary(); seedKitchenOptions(); seedExtraModels(); seedKitchenPresets(); seedBalexco(); seedAluKitchen();

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
  LEFT JOIN (SELECT order_inv, SUM(amount) AS cost FROM purchases WHERE IFNULL(hidden,0)=0 GROUP BY order_inv) p ON p.order_inv = o.inv
  ORDER BY o.date DESC, o.id DESC`).all().map((o) => ({
  ...o, paid: o.paid, balance: Math.round((o.amount - o.credit - o.paid) * 100) / 100, profit: Math.round((o.amount - o.credit - o.cost) * 100) / 100,
}));

function summary() {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const t = {
    invoiced: one('SELECT IFNULL(SUM(amount),0) v FROM orders').v,
    received: one('SELECT IFNULL(SUM(amount),0) v FROM receipts').v,
    purchases: one('SELECT IFNULL(SUM(amount),0) v FROM purchases WHERE IFNULL(hidden,0)=0').v,
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
      UNION ALL SELECT substr(date,1,4), 0, 0, amount, 0 FROM purchases WHERE IFNULL(hidden,0)=0
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
const bootstrap = (user = { role: 'admin' }) => user.role === 'worker' && !seesMoney(user) ? ({
  settings: Object.fromEntries(['colours', 'bar_kerf', 'min_offcut', 'leftover_pct'].map((k) => [k, getSetting(k)]).concat([['company', { name: getSetting('company')?.name }]])),
  price_items: [], profiles: listRows('profiles').map((r) => redact('profiles', r)), accessories: listRows('accessories').map((r) => redact('accessories', r)),
  glass_types: listRows('glass_types').map((r) => redact('glass_types', r)), models: listRows('models'), employees: [], next: {},
}) : ({
  settings: Object.fromEntries(db.prepare('SELECT key FROM settings').all().filter((r) => !['auth', 'session_secret'].includes(r.key)).map((r) => [r.key, getSetting(r.key)])),
  price_items: listRows('price_items'), profiles: listRows('profiles'), accessories: listRows('accessories'),
  glass_types: listRows('glass_types'), models: listRows('models'), employees: listRows('employees'), bank_accounts: listRows('bank_accounts'),
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

/** Money in comes from an invoice; money out goes to a supplier (or is a salary to an employee). */
function moneyRules(t, body, cur = {}) {
  const m = { ...cur, ...body };
  if (t === 'receipts' && (!cur.id || 'order_inv' in body)) {
    const inv = String(m.order_inv || '').trim();
    if (!inv) throw bad('Money in must come from an invoice — choose the invoice this receipt is for.');
    if (!db.prepare('SELECT id FROM orders WHERE inv=?').get(inv)) throw bad(`There is no invoice ${inv}.`);
  }
  if (t === 'payments' && (!cur.id || 'paid_to' in body || 'employee_id' in body)) {
    const who = String(m.paid_to || '').trim().toLowerCase();
    if (!m.employee_id && !db.prepare('SELECT id FROM suppliers WHERE lower(name)=?').get(who)) throw bad('Money out must go to a supplier — choose one from the list (add the supplier first if it is new).');
  }
  if (t === 'cash_entries' && (!cur.id || 'direction' in body || 'party' in body || 'category' in body)) {
    if (m.category === 'Transfer') return;
    if (m.direction === 'in') throw bad('Money in must come from an invoice — record a receipt instead.');
    if (m.direction === 'out' && !db.prepare('SELECT id FROM suppliers WHERE lower(name)=?').get(String(m.party || '').trim().toLowerCase())) throw bad('Money out must go to a supplier.');
  }
}

/**
 * VAT is fixed on a document when it is made: changing the VAT rate (or an item's price or VAT setting) later only affects
 * new quotations, invoices and purchases. Anything saved without a VAT figure gets the one that applies right now.
 */
function freezeVat(t, body) {
  const rate = Number(getSetting('vat_rate') ?? 10);
  if (t === 'orders' && (body.vat == null || body.vat === '')) { const q = body.quote_no ? db.prepare('SELECT * FROM quotes WHERE number=?').get(body.quote_no) : null; const qn = q ? new Map([[q.number, { ...q, items: JSON.parse(q.items || '[]') }]]) : new Map(); body.vat = orderVat({ ...body, vat: null }, qn, rate); }
  if (t === 'purchases' && (body.vat == null || body.vat === '') && getSetting('purchase_vat_default')) body.vat = vatIn(Number(body.amount) || 0, rate);
  return body;
}
export function freezeAllVat() { // old records: pin the figure they would have shown today
  for (const o of listRows('orders').filter((x) => x.vat == null || x.vat === '')) updateRow('orders', o.id, { vat: freezeVat('orders', { ...o }).vat });
  if (getSetting('purchase_vat_default')) for (const p of listRows('purchases').filter((x) => x.vat == null || x.vat === '')) updateRow('purchases', p.id, { vat: freezeVat('purchases', { ...p }).vat });
}
const ledgerData = () => ({
  banks: listRows('bank_accounts'), accounts: listRows('accounts'), orders: listRows('orders'), quotes: listRows('quotes'), credits: listRows('credit_notes').filter((c) => c.status === 'approved'), receipts: listRows('receipts'), payments: listRows('payments'),
  purchases: listRows('purchases').filter((x) => !x.hidden), cash: listRows('cash_entries'), journals: listRows('journals'), settings: { vat_rate: getSetting('vat_rate'), purchase_vat_default: getSetting('purchase_vat_default'), opening: getSetting('opening') },
});
/** The chart is protected where postings depend on it; a journal voucher must balance. */
function accountingRules(t, body, cur = {}) {
  if (t === 'accounts') {
    const m = { ...cur, ...body };
    if (!String(m.code || '').trim() || !String(m.name || '').trim()) throw bad('An account needs a code and a name.');
    if (!['asset', 'liability', 'equity', 'income', 'expense'].includes(m.type)) throw bad('Choose the account type.');
    if (db.prepare('SELECT id FROM accounts WHERE lower(code)=lower(?) AND id<>?').get(String(m.code).trim(), cur.id || 0)) throw bad(`There is already an account with code ${m.code}.`);
    if (m.parent_id) { const par = getRow('accounts', Number(m.parent_id)); if (!par) throw bad('The parent account does not exist.'); if (par.type !== m.type) throw bad('An account must have the same type as its parent.'); if (cur.id && Number(m.parent_id) === cur.id) throw bad('An account cannot be its own parent.'); }
  }
  if (t === 'bank_accounts' && (!cur.id || 'name' in body) && !String(({ ...cur, ...body }).name || '').trim()) throw bad('Give the bank account a name.');
  if (t === 'journals' && (!cur.id || 'lines' in body)) {
    const lines = (({ ...cur, ...body }).lines || []).filter((l) => l && (Number(l.debit) || Number(l.credit)));
    if (lines.length < 2) throw bad('A journal voucher needs at least two lines.');
    let d = 0; let c = 0; const kids = new Set(db.prepare('SELECT DISTINCT parent_id p FROM accounts WHERE parent_id IS NOT NULL').all().map((x) => x.p));
    for (const l of lines) { if (!l.account_id || !getRow('accounts', Number(l.account_id))) throw bad('Every line needs an account.'); if (kids.has(Number(l.account_id))) throw bad('Post to a detail account, not to a heading that has accounts under it.'); if (Number(l.debit) < 0 || Number(l.credit) < 0) throw bad('Debit and credit cannot be negative.'); if (Number(l.debit) && Number(l.credit)) throw bad('A line is either a debit or a credit, not both.'); d += Number(l.debit) || 0; c += Number(l.credit) || 0; }
    if (Math.abs(d - c) > 0.0005) throw bad(`The voucher does not balance: debit ${d.toFixed(3)} and credit ${c.toFixed(3)}.`);
  }
}
const AUTO = { quotes: ['number', 'quote'], orders: ['inv', 'invoice'], receipts: ['no', 'receipt'], payments: ['no', 'payment'], purchase_orders: ['po', 'po'], credit_notes: ['no', 'credit'], journals: ['no', 'journal'] };


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
  const role = user.role; const isAA = hasAny(user, ['tasks']); // task managers (admin and accounts, or anyone given the Tasks page)
  const need = (ok) => { if (!ok) throw forbid(); };
  const needAny = (...pages) => need(hasAny(user, pages)); // at least view access to one of these pages
  const needEdit = (...pages) => need(hasEditAny(user, pages));

  if (p[0] === 'bootstrap') return send(res, 200, bootstrap(user));
  if (p[0] === 'summary') { needAny('reports', 'orders', 'receipts', 'payments', 'cashbank', 'quotes'); return send(res, 200, summary()); }
  if (p[0] === 'ledger') { needAny('orders', 'receipts', 'statements', 'reports', 'creditnotes', 'purchases', 'payments', 'cashbank', 'tasks'); return send(res, 200, ordersLedger()); }

  // --- tasks: workers use these endpoints (never the raw tables) so they only ever touch their own work
  if (p[0] === 'staff') return send(res, 200, listUsers().filter((u) => u.active).map((u) => (isAA ? { id: u.id, name: u.name, role: u.role } : { id: u.id, name: u.name }))); // names only for workers (calendar teams)
  if (p[0] === 'shift') return send(res, 200, shiftStatus(user));
  if (p[0] === 'my-tasks') return send(res, 200, myTasks(user));
  if (p[0] === 'tasks-view') { needAny('tasks', 'orders', 'activity'); return send(res, 200, taskViews()); }
  if (p[0] === 'activity') {
    needAny('activity'); const q = url.searchParams; const today = new Date().toISOString().slice(0, 10);
    return send(res, 200, activity(q.get('from') || today, q.get('to') || today, q.get('user') ? Number(q.get('user')) : null));
  }
  if (p[0] === 'photo-stats') { need(role === 'admin'); return send(res, 200, photoStats(Number(getSetting('photo_retention_months')) || 0)); }
  if (p[0] === 'purge-photos' && m === 'POST') { need(role === 'admin'); const n = await purgeOldPhotos(Number(getSetting('photo_retention_months')) || 0, filesDir()); audit(user, 'attachments', null, 'deleted', `${n} old photo(s) removed`); return send(res, 200, { deleted: n }); }
  if (p[0] === 'logo') { // the company logo shown on the login page and printouts
    need(role === 'admin');
    if (m === 'DELETE') { await unlink(path.join(filesDir(), 'logo.bin')).catch(() => {}); setSetting('logo', null); audit(user, 'settings', null, 'updated', 'Logo reset'); return send(res, 200, { ok: true }); }
    if (m === 'POST') {
      const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase(); if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) throw bad('The logo must be a PNG, JPG or WebP picture.');
      const buf = await readBody(req, 3e6); if (!buf.length) throw bad('Empty file.');
      await mkdir(filesDir(), { recursive: true }); await writeFile(path.join(filesDir(), 'logo.bin'), buf); setSetting('logo', { mime, v: Date.now() });
      audit(user, 'settings', null, 'updated', 'Logo changed'); return send(res, 200, { ok: true, v: getSetting('logo').v });
    }
  }
  if (p[0] === 'overtime' && m === 'POST') return send(res, 200, overtimeAction(user, await readJson(req)));
  if (p[0] === 'attendance-from-tasks') { // what each person did per day, to fill the attendance sheet
    needAny('employees'); const q = url.searchParams; const emp = getRow('employees', Number(q.get('employee_id'))); const month = String(q.get('month') || '').slice(0, 7);
    if (!emp || !/^\d{4}-\d\d$/.test(month)) throw bad('Employee and month are needed.');
    if (!emp.user_id) return send(res, 200, { linked: false, days: {} });
    const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
    return send(res, 200, { linked: true, user_id: emp.user_id, days: dayReport(emp.user_id, `${month}-01T00:00:00.000Z`, `${month}-${String(last).padStart(2, '0')}T23:59:59.999Z`) });
  }
  if (p[0] === 'targets' && m === 'GET') { // workers see their own progress, managers see everyone's
    const all = targetProgress(isAA ? null : user.id);
    return send(res, 200, { metrics: METRICS, targets: listRows('targets'), progress: all });
  }
  if (p[0] === 'target-awards' && m === 'POST') {
    need(role === 'admin'); const b = await readJson(req);
    const ex = db.prepare('SELECT id FROM target_awards WHERE target_id=? AND user_id=? AND period_key=?').get(Number(b.target_id), Number(b.user_id), String(b.period_key));
    if (ex) { deleteRow('target_awards', ex.id); audit(user, 'target_awards', ex.id, 'deleted', `${b.period_key}`); return send(res, 200, { removed: true }); }
    const row = insertRow('target_awards', { target_id: Number(b.target_id), user_id: Number(b.user_id), period_key: String(b.period_key), awarded_on: new Date().toISOString().slice(0, 10), note: String(b.note || '') });
    audit(user, 'target_awards', row.id, 'created', `Prize given for ${b.period_key}`); return send(res, 201, row);
  }
  if (p[0] === 'activity.xlsx') {
    needAny('activity'); const q = url.searchParams; const today = new Date().toISOString().slice(0, 10); const from = (q.get('from') || today).slice(0, 10); const to = (q.get('to') || today).slice(0, 10);
    const buf = Buffer.from(await exportActivity(from, to, q.get('user') ? Number(q.get('user')) : null));
    return send(res, 200, buf, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="worker-activity-${from}_${to}.xlsx"` });
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
    needAny('approvals');
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
  if (p[0] === 'accounting' && m === 'GET') { // the ledger behind the chart of accounts, trial balance and statements
    needAny('coa', 'journals', 'trialbalance', 'accstatement'); const q = url.searchParams; const from = q.get('from') || ''; const to = q.get('to') || '';
    const data = ledgerData(); const entries = buildEntries(data); const tb = trialBalance(data.accounts, entries, from, to);
    const acct = Number(q.get('account')) || 0; const a = acct && data.accounts.find((x) => x.id === acct);
    return send(res, 200, { accounts: data.accounts, tb, statements: statements(tb), ledger: a ? accountLedger(a, entries, from, to) : null, journals: data.journals.length });
  }
  if (p[0] === 'vat-report' && m === 'GET') {
    needAny('reports'); const q = url.searchParams;
    const credits = listRows('credit_notes').filter((c) => c.status === 'approved');
    return send(res, 200, vatReport({ orders: listRows('orders'), quotes: listRows('quotes'), credits, purchases: listRows('purchases').filter((p) => !p.hidden), payments: listRows('payments'), settings: { vat_rate: getSetting('vat_rate'), purchase_vat_default: getSetting('purchase_vat_default') } }, q.get('from') || '', q.get('to') || ''));
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
    if (uid && m === 'PUT') { const b = await readJson(req); const before = listUsers().find((x) => x.id === uid); const u = updateUser(uid, b, user.id); audit(user, 'users', uid, 'updated', u.name, [...['name', 'username', 'role', 'active'].filter((k) => before && before[k] !== u[k]).map((k) => ({ f: k, from: String(before[k]), to: String(u[k]) })), ...(b.password ? [{ f: 'password', from: '', to: '(reset)' }] : []), ...(JSON.stringify(before?.perms || null) !== JSON.stringify(u.perms || null) ? [{ f: 'permissions', from: JSON.stringify(before?.perms?.pages || {}), to: JSON.stringify(u.perms?.pages || {}) }] : [])]); return send(res, 200, u); }
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
    needAny('reports');
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
    needEdit('cashbank');
    const { account } = await readJson(req);
    if (account !== 'cash' && !db.prepare('SELECT id FROM bank_accounts WHERE key=?').get(account)) return send(res, 400, { error: 'account must be cash or one of the bank accounts' });
    const a = db.prepare("UPDATE receipts SET account=? WHERE account IS NULL OR account=''").run(account).changes;
    const b = db.prepare("UPDATE payments SET account=? WHERE account IS NULL OR account=''").run(account).changes;
    return send(res, 200, { receipts: Number(a), payments: Number(b) });
  }
  // employee documents: raw upload / download, stored under DATA_DIR/files
  if (p[0] === 'employee-docs' && p[2] === 'file') {
    (m === 'GET' ? needAny : needEdit)('employees');
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
    needEdit('orders');
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
    const acc = tableAccess(user, t);
    if (!acc || (m !== 'GET' && acc !== 'rw')) throw forbid();
    const worker = role === 'worker'; const hide = worker && !seesMoney(user); // workers see no prices or costs unless they were given a money page
    // a worker's calendar only holds the jobs they are on
    const visible = (r) => (!(worker && t === 'events') || (r.team || []).map(Number).includes(user.id)) && (!(worker && t === 'notes') || ['all', 'workers'].includes(r.audience || 'all'));
    if (!id && m === 'GET') return send(res, 200, worker ? listRows(t).filter(visible).map((r) => (hide ? redact(t, r) : r)) : listRows(t));
    if (id && m === 'GET') { const r = getRow(t, id); return r && visible(r) ? send(res, 200, hide ? redact(t, r) : r) : send(res, 404, { error: 'Not found' }); }
    if (!id && m === 'POST') {
      if (t === 'accounts') need(role === 'admin'); // only the admin adds accounts to the chart
      const body = await readJson(req);
      const row = tx(() => {
        checkRef(t, body); moneyRules(t, body); accountingRules(t, body); freezeVat(t, body);
        if (t === 'tasks') { body.status = body.status || 'todo'; body.progress = body.progress ?? 0; body.created_by = user.id; }
        if (worker && t === 'stock') { delete body.unit_cost; if (body.kind === 'leftover' && body.profile_id) { const pr = getRow('profiles', Number(body.profile_id)); body.unit_cost = pr && pr.bar_length > 0 ? Math.round((pr.price_bar / pr.bar_length) * (body.length || 0) * ((getSetting('leftover_pct') ?? 60) / 100) * 1000) / 1000 : 0; } }
        if (t === 'quotes') { body.prepared_by = user.name; quoteApproval(body, null, user); } // always the signed-in user
        if (t === 'surveys') { body.surveyor = body.surveyor || user.name; body.status = body.status || 'open'; }
        if (t === 'events') body.status = body.status || 'planned';
        if (t === 'notes') { body.author = user.name; body.author_id = user.id; body.audience = body.audience || 'staff'; }
        if (t === 'credit_notes') {
          Object.assign(body, creditTotals(body)); checkCredit(body);
          body.status = user.role === 'admin' || !approvalCfg().credit_notes ? 'approved' : 'pending'; body.requested_by = user.name;
          body.approval_note = body.status === 'approved' ? `Approved by ${user.name}` : '';
        }
        const a = AUTO[t];
        if (a && !body[a[0]]) body[a[0]] = nextNumber(a[1], body.date, true);
        let created = insertRow(t, body); if (t === 'tasks') onTaskCreated(created, user);
        if (t === 'bank_accounts') { if (!created.key) created = updateRow(t, created.id, { key: `bank-${created.id}` }); if (created.sort == null) created = updateRow(t, created.id, { sort: created.id }); created = linkBankToChart(created); }
        audit(user, t, created.id, 'created', labelOf(created), notable(created)); return created;
      });
      return send(res, 201, row);
    }
    if (id && m === 'PUT') {
      const cur = getRow(t, id); if (!cur || !visible(cur)) return send(res, 404, { error: 'Not found' });
      const body = await readJson(req); checkRef(t, body, cur); moneyRules(t, body, cur); accountingRules(t, body, cur); if (worker) delete body.unit_cost;
      if (t === 'overtime' && 'status' in body) need(role === 'admin'); // only the admin approves overtime
      if (t === 'tasks' && 'hidden' in body) { need(role === 'admin'); body.hidden = body.hidden ? 1 : 0; } // only an admin hides or shows tasks
      if (t === 'tasks') { if (body.status === 'done' && cur.status !== 'done') { body.done_at = new Date().toISOString(); body.progress = 100; } else if (body.status && body.status !== 'done' && cur.status === 'done') body.done_at = null; }
      if (t === 'quotes') {
        delete body.prepared_by; // set at creation, never edited
        if (user.role !== 'admin') { delete body.approval; delete body.approved_disc; delete body.approval_note; }
        // an accepted quotation goes back to draft only with the admin's own password
        if (cur.status === 'accepted' && body.status && body.status !== 'accepted') {
          if (user.role !== 'admin') throw bad('Only the admin can change an accepted quotation back to draft.', 403);
          if (!verifyOwnPassword(user.id, String(body.password || ''))) throw bad('Wrong password.', 403);
        }
        delete body.password;
        quoteApproval(body, cur, user);
      }
      if (t === 'credit_notes') {
        if (user.role !== 'admin') { delete body.status; delete body.approval_note; }
        const merged = { ...cur, ...body }; Object.assign(body, creditTotals(merged)); checkCredit({ ...merged, ...body }, id);
        if (user.role !== 'admin' && approvalCfg().credit_notes && ['approved', 'rejected'].includes(cur.status)) body.status = 'pending'; // changed after a decision: needs a new one
      }
      if (t === 'bank_accounts' && 'key' in body) delete body.key; // the key is what records point at; it never changes
      const saved = updateRow(t, id, body); if (t === 'tasks') onTaskUpdated(cur, saved, user);
      if (t === 'bank_accounts' && saved.coa_id && ('name' in body || 'active' in body)) updateRow('accounts', saved.coa_id, { ...(body.name ? { name: body.name } : {}), ...('active' in body ? { active: saved.active === 0 ? 0 : 1 } : {}) });
      const ch = diff(t, cur, saved); if (ch.length) audit(user, t, id, 'updated', labelOf(saved), ch);
      return send(res, 200, saved);
    }
    if (id && m === 'DELETE') {
      if (t === 'accounts') need(role === 'admin'); // …or deletes them
      if (t === 'bank_accounts') { const k = getRow(t, id)?.key; const used = k && ['receipts', 'payments', 'cash_entries'].some((tb) => db.prepare(`SELECT id FROM ${tb} WHERE account=?`).get(k)); if (used) throw bad('This bank account has receipts, vouchers or entries, so it cannot be deleted. Switch it off instead.'); if (k === 'bank') throw bad('The original bank account cannot be deleted. Switch it off or rename it.'); }
      if (t === 'quotes') throw bad('Quotations cannot be deleted. Set the status to Rejected instead.', 403);
      const cur = getRow(t, id);
      if (t === 'accounts') {
        if (db.prepare('SELECT id FROM accounts WHERE parent_id=?').get(id)) throw bad('Delete or move the accounts under it first.');
        if (buildEntries(ledgerData()).some((e) => e.account === id)) throw bad('This account already has entries (invoices, vouchers or journals post to it), so it cannot be deleted. Switch it off instead.');
      }
      if (t === 'tasks') { db.prepare('DELETE FROM task_logs WHERE task_id=?').run(id); db.prepare('DELETE FROM task_sessions WHERE task_id=?').run(id); }
      if (t === 'credit_notes' && cur?.status === 'approved' && user.role !== 'admin') throw bad('Only the admin can delete an approved credit note.', 403);
      if (t === 'bank_accounts') { const coa = getRow(t, id)?.coa_id; if (coa && !buildEntries(ledgerData()).some((e) => e.account === coa)) deleteRow('accounts', coa); }
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
    if (url.pathname === '/logo') { // public: the login page needs it before anyone is signed in
      const lg = getSetting('logo'); const own = lg?.mime ? await readFile(path.join(filesDir(), 'logo.bin')).catch(() => null) : null;
      const buf = own || await readFile(path.join(PUBLIC, 'img/logo.png'));
      return await send(res, 200, buf, { 'Content-Type': own ? lg.mime : 'image/png', 'Cache-Control': 'no-cache', ETag: `"logo-${own ? lg.v : 'default'}"` });
    }
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
const purge = () => purgeOldPhotos(Number(getSetting('photo_retention_months')) || 0, filesDir()).then((n) => n && console.log(`Removed ${n} old photo(s)`)).catch((e) => console.error('Photo clean-up failed:', e.message));
const backup = () => { purge(); return runBackup().then((n) => n && console.log(`Backup saved: ${n}`)).catch((e) => console.error('Backup failed:', e.message)); };
setTimeout(backup, 5000).unref(); setInterval(backup, 6 * 3600e3).unref();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { db.exec('PRAGMA optimize'); } catch {} server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
