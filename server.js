import http from 'node:http';
import { readFile, writeFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import {
  db, SCHEMA, getSetting, setSetting, nextNumber, insertRow, updateRow, deleteRow, getRow, listRows, tx,
} from './src/db.js';
import { hasPassword, setPassword, checkPassword, makeToken, validToken, cookieOf } from './src/auth.js';
import { importWorkbook } from './src/importer.js';
import { seedLibrary } from './src/seed.js';
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

const bootstrap = () => ({
  settings: Object.fromEntries(db.prepare('SELECT key FROM settings').all().filter((r) => !['auth', 'session_secret'].includes(r.key)).map((r) => [r.key, getSetting(r.key)])),
  price_items: listRows('price_items'), profiles: listRows('profiles'), accessories: listRows('accessories'),
  glass_types: listRows('glass_types'), models: listRows('models'), employees: listRows('employees'),
  next: { quote: nextNumber('quote'), invoice: nextNumber('invoice'), receipt: nextNumber('receipt'), payment: nextNumber('payment') },
});

const AUTO = { quotes: ['number', 'quote'], orders: ['inv', 'invoice'], receipts: ['no', 'receipt'], payments: ['no', 'payment'] };

// ------------------------------------------------------------------ router
async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api\//, '').split('/');
  const m = req.method;

  // --- auth (no session needed)
  if (p[0] === 'me') return send(res, 200, { needsSetup: !hasPassword(), loggedIn: validToken(cookieOf(req, 'ws')) });
  if (p[0] === 'login' && m === 'POST') {
    const { password } = await readJson(req);
    if (!hasPassword()) { if (!password || password.length < 6) return send(res, 400, { error: 'Choose a password with at least 6 characters.' }); setPassword(password); }
    else if (!checkPassword(password)) { await new Promise((r) => setTimeout(r, 400)); return send(res, 401, { error: 'Wrong password.' }); }
    return send(res, 200, { ok: true }, { 'Set-Cookie': `ws=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 86400}` });
  }
  if (p[0] === 'logout') return send(res, 200, { ok: true }, { 'Set-Cookie': 'ws=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  if (!validToken(cookieOf(req, 'ws'))) return send(res, 401, { error: 'Not signed in.' });

  if (p[0] === 'bootstrap') return send(res, 200, bootstrap());
  if (p[0] === 'summary') return send(res, 200, summary());
  if (p[0] === 'ledger') return send(res, 200, ordersLedger());

  if (p[0] === 'password' && m === 'POST') {
    const { current, password } = await readJson(req);
    if (!checkPassword(current)) return send(res, 401, { error: 'Current password is wrong.' });
    if (!password || password.length < 6) return send(res, 400, { error: 'New password must have at least 6 characters.' });
    setPassword(password); return send(res, 200, { ok: true });
  }
  if (p[0] === 'settings' && m === 'PUT') {
    const body = await readJson(req);
    for (const [k, v] of Object.entries(body)) if (!['auth', 'session_secret'].includes(k)) setSetting(k, v);
    return send(res, 200, bootstrap().settings);
  }
  if (p[0] === 'backup') {
    const out = { exported: new Date().toISOString(), settings: bootstrap().settings };
    for (const t of Object.keys(SCHEMA)) out[t] = listRows(t);
    return send(res, 200, out, { 'Content-Disposition': `attachment; filename="workshop-backup-${new Date().toISOString().slice(0, 10)}.json"` });
  }
  if (p[0] === 'import' && m === 'POST') {
    const buf = await readBody(req, 60e6);
    const tmp = path.join(os.tmpdir(), `import-${Date.now()}.xlsm`);
    await writeFile(tmp, buf);
    try { return send(res, 200, { ok: true, imported: await importWorkbook(tmp) }); }
    catch (e) { return send(res, 400, { error: 'Could not read that workbook: ' + e.message }); }
    finally { unlink(tmp).catch(() => {}); }
  }
  if (p[0] === 'quotes' && p[2] === 'to-order' && m === 'POST') {
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
    if (!id && m === 'GET') return send(res, 200, listRows(t));
    if (id && m === 'GET') { const r = getRow(t, id); return r ? send(res, 200, r) : send(res, 404, { error: 'Not found' }); }
    if (!id && m === 'POST') {
      const body = await readJson(req);
      const row = tx(() => {
        const a = AUTO[t];
        if (a && !body[a[0]]) body[a[0]] = nextNumber(a[1], body.date, true);
        return insertRow(t, body);
      });
      return send(res, 201, row);
    }
    if (id && m === 'PUT') { if (!getRow(t, id)) return send(res, 404, { error: 'Not found' }); return send(res, 200, updateRow(t, id, await readJson(req))); }
    if (id && m === 'DELETE') { deleteRow(t, id); return send(res, 200, { ok: true }); }
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
    send(res, 500, { error: e.message });
  }
}).listen(PORT, () => console.log(`Workshop running on http://localhost:${PORT}`));
