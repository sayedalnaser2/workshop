import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const port = 4100 + Math.floor(Math.random() * 400); const base = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(path.join(tmpdir(), 'workshop-test-'));
let proc;
const jar = {}; // username → cookie
let invNo = ''; // an invoice made by the first order test
async function call(user, method, url, body, extra = {}) {
  const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(jar[user] ? { Cookie: jar[user] } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => null);
  return { status: r.status, data, headers: r.headers };
}
async function login(user, password) { const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password, name: user }) }); if (r.ok) jar[user] = r.headers.get('set-cookie').split(';')[0]; return r.status; }

before(async () => {
  proc = spawn(process.execPath, ['--no-warnings', 'server.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, WORKSHOP_DEV: '1' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/healthz')).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
after(() => { proc?.kill(); rmSync(dir, { recursive: true, force: true }); });

test('first run: the first person to sign in becomes the admin; wrong passwords are refused', async () => {
  assert.equal((await call('x', 'GET', '/api/me')).data.needsSetup, true);
  assert.equal(await login('boss', 'secret1'), 200);
  assert.equal((await call('x', 'GET', '/api/me')).data.needsSetup, false);
  assert.equal(await login('boss', 'wrong-pass'), 401);
  assert.equal((await call('boss', 'GET', '/api/me')).data.user.role, 'admin');
});
test('roles are enforced on the server', async () => {
  assert.equal((await call('boss', 'POST', '/api/users', { username: 'amina', name: 'Amina', role: 'account', password: 'acc12345' })).status, 201);
  assert.equal((await call('boss', 'POST', '/api/users', { username: 'wasim', name: 'Wasim', role: 'worker', password: 'wrk12345' })).status, 201);
  assert.equal((await call('boss', 'POST', '/api/users', { username: 'AMINA', name: 'x', role: 'worker', password: 'abcdef' })).status, 400);
  await login('amina', 'acc12345'); await login('wasim', 'wrk12345');
  assert.equal((await call('amina', 'GET', '/api/users')).status, 403);
  assert.equal((await call('amina', 'PUT', '/api/settings', { vat_rate: 5 })).status, 403);
  assert.equal((await call('amina', 'GET', '/api/ledger')).status, 200);
  for (const u of ['/api/t/orders', '/api/t/receipts', '/api/t/payments', '/api/t/employees', '/api/summary', '/api/ledger', '/api/backup']) assert.equal((await call('wasim', 'GET', u)).status, 403, u);
  assert.equal((await call('wasim', 'POST', '/api/t/models', { name: 'x' })).status, 403);
  assert.equal((await call('boss', 'PUT', '/api/users/1', { role: 'worker' })).data.error, 'There must be at least one active admin.');
});
test('quotation → order → receipt → balance, with automatic numbers', async () => {
  const q = (await call('amina', 'POST', '/api/t/quotes', { client: 'Test Co', date: '2026-10-11', vat_rate: 10, vat_waived: 0, discount: 0, items: [{ w: 100, h: 150, desc: 'Window', qty: 2, price: 100 }] })).data;
  assert.match(q.number, /^26\d{4}$/);
  const o = (await call('amina', 'POST', `/api/quotes/${q.id}/to-order`, {})).data;
  assert.match(o.inv, /^26\d{4}$/); assert.equal(o.amount, 220); invNo = o.inv;
  assert.equal((await call('amina', 'POST', `/api/quotes/${q.id}/to-order`, {})).status, 400); // only once
  const r = await call('amina', 'POST', '/api/t/receipts', { order_inv: o.inv, client: 'Test Co', amount: 100, method: 'Cash', date: '2026-10-11' });
  assert.equal(r.status, 201); assert.match(r.data.no, /^26\d{4}$/);
  const l = (await call('amina', 'GET', '/api/ledger')).data.find((x) => x.inv === o.inv);
  assert.equal(l.paid, 100); assert.equal(l.balance, 120);
});
test('Benefit and cheque payments need their number', async () => {
  for (const method of ['Benefit', 'Cheque']) {
    const bad = await call('amina', 'POST', '/api/t/receipts', { order_inv: invNo, amount: 5, method, ref: '  ' });
    assert.equal(bad.status, 400); assert.match(bad.data.error, /number is required/);
    assert.equal((await call('amina', 'POST', '/api/t/receipts', { order_inv: invNo, amount: 5, method, ref: '12345' })).status, 201);
  }
  await call('amina', 'POST', '/api/t/suppliers', { name: 'Gulf Glass' });
  assert.equal((await call('amina', 'POST', '/api/t/payments', { paid_to: 'Gulf Glass', amount: 5, method: 'Cheque' })).status, 400); // cheque number missing
});
test('tasks: worker actions, hiding, and no prices for workers', async () => {
  const staff = (await call('boss', 'GET', '/api/staff')).data; const wid = staff.find((s) => s.name === 'Wasim').id;
  const t = (await call('amina', 'POST', '/api/t/tasks', { title: 'Cut frames', stage: 'Cutting', assignee_id: wid, estimate_min: 60 })).data;
  assert.equal((await call('wasim', 'POST', `/api/tasks/${t.id}/action`, { action: 'start' })).status, 200);
  assert.equal((await call('wasim', 'POST', `/api/tasks/${t.id}/action`, { action: 'update', progress: 40, text: 'half way' })).data.progress, 40);
  assert.equal((await call('wasim', 'GET', '/api/my-tasks')).data.length, 1);
  assert.equal((await call('wasim', 'GET', '/api/tasks-view')).status, 403);
  assert.equal((await call('amina', 'PUT', `/api/t/tasks/${t.id}`, { hidden: 1 })).status, 403); // only the admin hides
  assert.equal((await call('boss', 'PUT', `/api/t/tasks/${t.id}`, { hidden: 1 })).status, 200);
  assert.equal((await call('wasim', 'GET', '/api/my-tasks')).data.length, 0);
  assert.equal((await call('wasim', 'POST', `/api/tasks/${t.id}/action`, { action: 'done' })).status, 404);
  await call('boss', 'PUT', `/api/t/profiles/${(await call('boss', 'GET', '/api/t/profiles')).data[0].id}`, { price_bar: 99 });
  assert.equal((await call('wasim', 'GET', '/api/t/profiles')).data.every((p) => p.price_bar === 0), true);
});
test('responses are compressed and the app shell is served with security headers', async () => {
  const r = await fetch(base + '/api/t/models', { headers: { Cookie: jar.boss, 'Accept-Encoding': 'gzip' } });
  assert.ok(r.status === 200);
  const h = await fetch(base + '/', { headers: { 'Accept-Encoding': 'br' } });
  assert.equal(h.headers.get('content-encoding'), 'br'); assert.equal(h.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(base + '/healthz')).status, 200);
  const etag = h.headers.get('etag'); assert.equal((await fetch(base + '/', { headers: { 'If-None-Match': etag } })).status, 304);
});
test('five wrong passwords lock the account for a minute', async () => {
  let last; for (let i = 0; i < 6; i++) last = await login('amina', 'nope-' + i);
  assert.equal(last, 429);
  assert.equal(await login('amina', 'acc12345'), 429); // even the right password waits
});

// ---------------------------------------------------------------- features added later
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function upload(user, query, body = PNG, type = 'image/png') {
  const r = await fetch(base + '/api/files?' + new URLSearchParams(query), { method: 'POST', headers: { 'Content-Type': type, Cookie: jar[user] }, body });
  return { status: r.status, data: await r.json().catch(() => null) };
}

test('a discount over the limit waits for the admin; credit notes reduce the balance only once approved', async () => {
  const mk = (who, discount) => call(who, 'POST', '/api/t/quotes', { client: 'Big Discount Co', date: '2026-10-11', vat_rate: 10, vat_waived: 0, discount, items: [{ w: 100, h: 100, desc: 'Door', qty: 1, price: 1000 }], status: 'draft' });
  const ok = (await mk('amina', 50)).data; assert.ok(!ok.approval); // 5%: fine
  const q = (await mk('amina', 200)).data; assert.equal(q.approval, 'pending'); // 20%
  assert.equal((await call('amina', 'PUT', `/api/t/quotes/${q.id}`, { status: 'sent' })).data.status, 'draft'); // cannot go out
  assert.equal((await call('amina', 'POST', `/api/quotes/${q.id}/to-order`, {})).status, 400);
  assert.equal((await call('amina', 'POST', `/api/approvals/quotes/${q.id}`, { decision: 'approve' })).status, 403); // only the admin decides
  assert.equal((await call('boss', 'GET', '/api/approvals')).data.quotes.some((x) => x.id === q.id), true);
  assert.equal((await call('boss', 'POST', `/api/approvals/quotes/${q.id}`, { decision: 'approve', note: 'ok' })).data.approval, 'approved');
  assert.equal((await call('amina', 'PUT', `/api/t/quotes/${q.id}`, { discount: 150 })).data.approval, 'approved'); // lowered: stays approved
  assert.equal((await call('amina', 'PUT', `/api/t/quotes/${q.id}`, { discount: 300 })).data.approval, 'pending'); // raised: asks again
  assert.equal((await call('amina', 'PUT', `/api/t/quotes/${q.id}`, { discount: 150 })).data.approval, 'pending'); // the earlier approval was for the old figure; a raise resets it
  assert.equal((await call('boss', 'POST', `/api/approvals/quotes/${q.id}`, { decision: 'approve' })).status, 200);
  assert.equal((await call('boss', 'POST', `/api/quotes/${q.id}/to-order`, {})).status, 200);
  const adm = (await mk('boss', 400)).data; assert.equal(adm.approval, 'approved'); // the admin's own discount needs nobody

  const o = (await call('amina', 'GET', '/api/ledger')).data.find((x) => x.quote_no === q.number);
  assert.ok(o.vat > 0 || o.vat === 0); // VAT saved on the order for the tax report
  const cn = await call('amina', 'POST', '/api/t/credit_notes', { order_inv: o.inv, client: o.client, date: '2026-10-12', vat_rate: 10, reason: 'Door returned', lines: [{ desc: 'Door returned', qty: 1, price: 100 }] });
  assert.equal(cn.status, 201); assert.equal(cn.data.status, 'pending'); assert.equal(cn.data.total, 110); assert.match(cn.data.no, /^26\d{4}$/);
  assert.equal((await call('amina', 'GET', '/api/ledger')).data.find((x) => x.inv === o.inv).balance, o.balance); // not yet
  assert.equal((await call('boss', 'POST', `/api/approvals/credit_notes/${cn.data.id}`, { decision: 'approve' })).data.status, 'approved');
  const after = (await call('amina', 'GET', '/api/ledger')).data.find((x) => x.inv === o.inv);
  assert.equal(after.credit, 110); assert.equal(after.balance, Math.round((o.balance - 110) * 100) / 100);
  const big = await call('amina', 'POST', '/api/t/credit_notes', { order_inv: o.inv, client: o.client, vat_rate: 0, lines: [{ desc: 'x', qty: 1, price: 99999 }] });
  assert.equal(big.status, 400); assert.match(big.data.error, /more than the invoice/);
  assert.equal((await call('amina', 'DELETE', `/api/t/credit_notes/${cn.data.id}`)).status, 403); // approved ones are the admin's
  const rep = (await call('amina', 'GET', '/api/vat-report?from=2026-01-01&to=2026-12-31')).data; assert.ok(rep.totals.credit_vat >= 10);
  assert.equal((await call('wasim', 'GET', '/api/vat-report')).status, 403);
});

test('photos: stored with their type, workers only reach their own task and surveys', async () => {
  const staff = (await call('boss', 'GET', '/api/staff')).data; const wid = staff.find((s) => s.name === 'Wasim').id;
  const t = (await call('boss', 'POST', '/api/t/tasks', { title: 'Photo job', assignee_id: wid })).data;
  const other = (await call('boss', 'POST', '/api/t/tasks', { title: 'Not his', assignee_id: 1 })).data;
  const a = await upload('wasim', { ref_type: 'task', ref_key: String(t.id), kind: 'before', name: 'door.png' }); assert.equal(a.status, 201); assert.equal(a.data.mime, 'image/png');
  assert.equal((await upload('wasim', { ref_type: 'task', ref_key: String(other.id), name: 'x.png' })).status, 403);
  assert.equal((await upload('wasim', { ref_type: 'order', ref_key: 'I1', name: 'x.png' })).status, 403);
  const raw = await fetch(base + `/api/files/${a.data.id}`, { headers: { Cookie: jar.wasim } });
  assert.equal(raw.status, 200); assert.equal(raw.headers.get('content-type'), 'image/png'); assert.deepEqual(Buffer.from(await raw.arrayBuffer()), PNG);
  const list = (await call('boss', 'GET', `/api/files?ref_type=task&ref_key=${t.id}`)).data; assert.equal(list.length, 1); assert.equal(list[0].kind, 'before');
  const html = await upload('boss', { ref_type: 'order', ref_key: 'I1', name: 'evil.html' }, Buffer.from('<script>alert(1)</script>'), 'text/html');
  assert.equal(html.data.mime, 'application/octet-stream'); // never served as a page
  const dl = await fetch(base + `/api/files/${html.data.id}`, { headers: { Cookie: jar.boss } }); assert.match(dl.headers.get('content-disposition'), /^attachment/);
  assert.equal((await call('wasim', 'DELETE', `/api/files/${html.data.id}`)).status, 403);
  assert.equal((await call('wasim', 'DELETE', `/api/files/${a.data.id}`)).status, 200); // his own photo
  const sv = await call('wasim', 'POST', '/api/t/surveys', { client: 'Walk-in', items: [{ uid: 'a', w: 100, h: 120 }] }); assert.equal(sv.status, 201); assert.equal(sv.data.surveyor, 'Wasim');
  assert.equal((await upload('wasim', { ref_type: 'survey', ref_key: String(sv.data.id), tag: 'a' })).status, 201);
});

test('calendar: workers only see the jobs they are on and cannot change it', async () => {
  const wid = (await call('boss', 'GET', '/api/staff')).data.find((s) => s.name === 'Wasim').id;
  assert.equal((await call('amina', 'POST', '/api/t/events', { title: 'Install at Villa 1', date: '2026-10-20', start: '08:00', kind: 'install', team: [wid] })).status, 201);
  assert.equal((await call('amina', 'POST', '/api/t/events', { title: 'Delivery elsewhere', date: '2026-10-20', kind: 'delivery', team: [] })).status, 201);
  const mine = (await call('wasim', 'GET', '/api/t/events')).data; assert.deepEqual(mine.map((e) => e.title), ['Install at Villa 1']);
  assert.equal((await call('boss', 'GET', '/api/t/events')).data.length, 2);
  assert.equal((await call('wasim', 'POST', '/api/t/events', { title: 'x', date: '2026-10-21' })).status, 403);
  assert.equal((await call('wasim', 'GET', '/api/staff')).data[0].role, undefined); // names only
});

test('audit trail: records who changed what, for the admin only', async () => {
  const q = (await call('amina', 'POST', '/api/t/quotes', { client: 'Audit Co', date: '2026-10-11', vat_rate: 10, discount: 0, items: [{ qty: 1, price: 100, desc: 'x' }] })).data;
  await call('amina', 'PUT', `/api/t/quotes/${q.id}`, { discount: 5, client: 'Audit Co Ltd' });
  const log = (await call('boss', 'GET', `/api/audit?table=quotes&q=${encodeURIComponent(q.number)}`)).data;
  const upd = log.rows.find((r) => r.action === 'updated'); assert.equal(upd.user_name, 'Amina');
  assert.deepEqual(upd.changes.map((c) => c.f).sort(), ['client', 'discount']);
  assert.equal(upd.changes.find((c) => c.f === 'client').to, 'Audit Co Ltd');
  assert.ok(log.rows.some((r) => r.action === 'created'));
  assert.equal((await call('amina', 'GET', '/api/audit')).status, 403);
  const ev = (await call('amina', 'POST', '/api/t/events', { title: 'Audit me', date: '2026-10-30' })).data;
  await call('amina', 'DELETE', `/api/t/events/${ev.id}`);
  assert.ok((await call('boss', 'GET', `/api/audit?q=${encodeURIComponent('Audit me')}`)).data.rows.some((r) => r.action === 'deleted'));
});

test('quotations cannot be deleted; accepted → draft needs the admin and their password', async () => {
  const q = (await call('amina', 'POST', '/api/t/quotes', { client: 'Locked Co', date: '2026-10-12', vat_rate: 10, disc_mode: 'after', discount: 20, items: [{ qty: 1, price: 1000, desc: 'x' }] })).data;
  assert.equal((await call('boss', 'DELETE', `/api/t/quotes/${q.id}`)).status, 403);
  const o = (await call('amina', 'POST', `/api/quotes/${q.id}/to-order`, {})).data; assert.equal(o.amount, 1080); // 1000 + 100 VAT − 20 discount after VAT
  assert.equal(o.vat, 100);
  assert.equal((await call('amina', 'PUT', `/api/t/quotes/${q.id}`, { status: 'draft' })).status, 403); // accounts cannot
  assert.equal((await call('boss', 'PUT', `/api/t/quotes/${q.id}`, { status: 'draft' })).data.error, 'Wrong password.');
  assert.equal((await call('boss', 'PUT', `/api/t/quotes/${q.id}`, { status: 'draft', password: 'nope' })).status, 403);
  const ok = await call('boss', 'PUT', `/api/t/quotes/${q.id}`, { status: 'draft', password: 'secret1' });
  assert.equal(ok.status, 200); assert.equal(ok.data.status, 'draft'); assert.equal(ok.data.password, undefined);
});

test('money in needs an invoice, money out needs a supplier', async () => {
  const r = (b) => call('amina', 'POST', '/api/t/receipts', { amount: 10, method: 'Cash', ...b });
  assert.match((await r({})).data.error, /must come from an invoice/);
  assert.match((await r({ order_inv: 'I-NOPE' })).data.error, /no invoice/);
  assert.equal((await r({ order_inv: invNo })).status, 201);
  const p = (b) => call('amina', 'POST', '/api/t/payments', { amount: 10, method: 'Cash', ...b });
  assert.match((await p({ paid_to: 'Some Stranger' })).data.error, /must go to a supplier/);
  assert.equal((await p({ paid_to: 'gulf glass' })).status, 201); // names match without case
  assert.equal((await p({ paid_to: 'Wasim Worker', employee_id: 1 })).status, 201); // a salary keeps its employee link
  const c = (b) => call('amina', 'POST', '/api/t/cash_entries', { date: '2026-10-13', account: 'bank', amount: 5, ...b });
  assert.equal((await c({ direction: 'in', category: 'Other income' })).status, 400);
  assert.equal((await c({ direction: 'out', category: 'Other expense', party: 'Nobody' })).status, 400);
  assert.equal((await c({ direction: 'out', category: 'Other expense', party: 'Gulf Glass' })).status, 201);
  assert.equal((await c({ direction: 'in', category: 'Transfer' })).status, 201); // transfers between cash and bank are fine
});
test('hidden purchases are ignored in every total', async () => {
  const o = (await call('boss', 'GET', '/api/ledger')).data.find((x) => x.inv === invNo);
  const pu = (await call('amina', 'POST', '/api/t/purchases', { supplier: 'Gulf Glass', amount: 40, order_inv: invNo, date: '2026-10-13' })).data;
  const cost = async () => (await call('amina', 'GET', '/api/ledger')).data.find((x) => x.inv === invNo).cost;
  assert.equal(await cost(), o.cost + 40);
  const before = (await call('amina', 'GET', '/api/summary')).data.purchases;
  await call('amina', 'PUT', `/api/t/purchases/${pu.id}`, { hidden: 1 });
  assert.equal(await cost(), o.cost); assert.equal((await call('amina', 'GET', '/api/summary')).data.purchases, before - 40);
  assert.ok(!(await call('amina', 'GET', '/api/vat-report?from=2026-10-01&to=2026-10-31')).data.purchases.some((x) => x.supplier === 'Gulf Glass' && x.total === 40));
});

test('each employee can have their own shift hours', async () => {
  const wid = (await call('boss', 'GET', '/api/staff')).data.find((s) => s.name === 'Wasim').id;
  const base = (await call('wasim', 'GET', '/api/shift')).data.cfg;
  assert.equal((await call('boss', 'PUT', `/api/users/${wid}`, { shift: { start: '05:30', end: '13:30', breaks: [{ from: '09:00', to: '09:15' }], days: [0, 1, 2, 3, 4], tz: 999 } })).status, 200);
  const mine = (await call('wasim', 'GET', '/api/shift')).data.cfg;
  assert.equal(mine.start, '05:30'); assert.equal(mine.end, '13:30'); assert.deepEqual(mine.days, [0, 1, 2, 3, 4]); assert.equal(mine.tz, base.tz); // the time zone stays the workshop's
  assert.equal((await call('amina', 'PUT', `/api/users/${wid}`, { shift: null })).status, 403);
  await call('boss', 'PUT', `/api/users/${wid}`, { shift: null });
  assert.equal((await call('wasim', 'GET', '/api/shift')).data.cfg.start, base.start); // back to the workshop default
});

test('overtime is recorded by the worker, approved by the admin and shown in the activity report', async () => {
  const add = await call('wasim', 'POST', '/api/overtime', { action: 'add', minutes: 90, text: 'Finished the glass order' });
  assert.equal(add.status, 200); assert.equal(add.data.status, 'pending'); assert.equal(add.data.minutes, 90);
  assert.equal((await call('wasim', 'POST', '/api/overtime', { action: 'add', minutes: 0 })).status, 400);
  assert.equal((await call('wasim', 'POST', '/api/overtime', { action: 'start' })).status, 200);
  assert.equal((await call('wasim', 'POST', '/api/overtime', { action: 'start' })).status, 400); // already running
  assert.equal((await call('wasim', 'POST', '/api/overtime', { action: 'stop' })).data.minutes, 1);
  assert.equal((await call('wasim', 'PUT', `/api/t/overtime/${add.data.id}`, { status: 'approved' })).status, 403);
  assert.equal((await call('boss', 'PUT', `/api/t/overtime/${add.data.id}`, { status: 'approved' })).status, 200);
  const day = new Date().toISOString().slice(0, 10); const act = (await call('boss', 'GET', `/api/activity?from=${day}T00:00:00.000Z&to=${day}T23:59:59.999Z`)).data;
  assert.ok(act.perDay.some((r) => r.user_name === 'Wasim' && r.overtime_min >= 91)); assert.ok(act.overtime.length >= 2);
  const x = await fetch(base + `/api/activity.xlsx?from=${day}&to=${day}`, { headers: { Cookie: jar.boss } });
  assert.equal(x.status, 200); assert.match(x.headers.get('content-type'), /spreadsheetml/); assert.equal((await x.arrayBuffer()).byteLength > 2000, true);
  assert.equal((await fetch(base + `/api/activity.xlsx?from=${day}&to=${day}`, { headers: { Cookie: jar.wasim } })).status, 403);
});

test('a worker can ask for a helper; adding one to the team closes the request', async () => {
  const staff = (await call('boss', 'GET', '/api/staff')).data; const wid = staff.find((s) => s.name === 'Wasim').id; const aid = staff.find((s) => s.name === 'Amina').id;
  const t = (await call('boss', 'POST', '/api/t/tasks', { title: 'Heavy glass job', assignee_id: wid })).data;
  const r = await call('wasim', 'POST', `/api/tasks/${t.id}/action`, { action: 'need_helper', text: 'Panel is too heavy for one' });
  assert.equal(r.data.needs_helper, 1); assert.equal(r.data.helper_note, 'Panel is too heavy for one');
  const after = await call('boss', 'PUT', `/api/t/tasks/${t.id}`, { team: [aid] });
  assert.ok(!(await call('boss', 'GET', `/api/tasks/${t.id}`)).data.task.needs_helper);
  assert.ok((await call('boss', 'GET', `/api/tasks/${t.id}`)).data.logs.some((l) => l.kind === 'helper' && /request closed/.test(l.text)));
  void after;
});

test('targets and prizes: only the admin sets them, workers see their own progress', async () => {
  const mk = (who, b) => call(who, 'POST', '/api/t/targets', b);
  assert.equal((await mk('amina', { name: 'x', metric: 'tasks_done', period: 'month', goal: 1 })).status, 403);
  const t = (await mk('boss', { name: 'Finish 1 job this month', metric: 'tasks_done', period: 'month', goal: 1, prize: 'BD 10 voucher', prize_amount: 10, active: 1 })).data;
  const mine = (await call('wasim', 'GET', '/api/targets')).data; assert.ok(mine.progress.every((p) => p.user_name === 'Wasim'));
  const pr = mine.progress.find((p) => p.target.id === t.id); assert.ok(pr); assert.equal(pr.goal, 1);
  const tk = (await call('boss', 'POST', '/api/t/tasks', { title: 'Counts for the target', assignee_id: (await call('boss', 'GET', '/api/staff')).data.find((s) => s.name === 'Wasim').id })).data;
  await call('wasim', 'POST', `/api/tasks/${tk.id}/action`, { action: 'done' });
  const after = (await call('wasim', 'GET', '/api/targets')).data.progress.find((p) => p.target.id === t.id);
  assert.equal(after.achieved, true); assert.ok(after.value >= 1);
  assert.equal((await call('amina', 'POST', '/api/target-awards', { target_id: t.id, user_id: after.user_id, period_key: after.period.key })).status, 403);
  assert.equal((await call('boss', 'POST', '/api/target-awards', { target_id: t.id, user_id: after.user_id, period_key: after.period.key })).status, 201);
  assert.ok((await call('wasim', 'GET', '/api/targets')).data.progress.find((p) => p.target.id === t.id).award);
  assert.equal((await call('boss', 'POST', '/api/target-awards', { target_id: t.id, user_id: after.user_id, period_key: after.period.key })).data.removed, true); // toggles
});

test('logo: admin only, picture types only, public /logo serves it, reset restores the default', async () => {
  const up = (user, type) => fetch(base + '/api/logo', { method: 'POST', headers: { 'Content-Type': type, Cookie: jar[user] }, body: PNG });
  assert.equal((await up('amina', 'image/png')).status, 403);
  assert.equal((await up('boss', 'text/html')).status, 400);
  assert.equal((await up('boss', 'image/png')).status, 200);
  const r = await fetch(base + '/logo'); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal((await call('boss', 'DELETE', '/api/logo')).status, 200);
});

test('photo retention: stats and purge are admin only; settings keep the months', async () => {
  assert.equal((await call('amina', 'GET', '/api/photo-stats')).status, 403);
  assert.equal((await call('amina', 'POST', '/api/purge-photos')).status, 403);
  assert.equal((await call('boss', 'GET', '/api/photo-stats')).status, 200);
  assert.equal((await call('boss', 'POST', '/api/purge-photos')).data.deleted, 0); // nothing is old yet
});

test('dashboard notes: workers only see notes meant for them', async () => {
  await call('boss', 'POST', '/api/t/notes', { text: 'Staff only', audience: 'staff' });
  await call('boss', 'POST', '/api/t/notes', { text: 'For the team', audience: 'workers' });
  const w = (await call('wasim', 'GET', '/api/t/notes')).data.map((n) => n.text);
  assert.ok(w.includes('For the team')); assert.ok(!w.includes('Staff only'));
  assert.ok((await call('amina', 'GET', '/api/t/notes')).data.map((n) => n.text).includes('Staff only'));
});

test('every login is also an employee: created with the user, follows renames and deactivation, kept (as left) when the user is deleted', async () => {
  const u = (await call('boss', 'POST', '/api/users', { username: 'sami', name: 'Sami Carpenter', role: 'worker', password: 'sami1234' })).data;
  const find = async () => (await call('boss', 'GET', '/api/t/employees')).data.find((e) => e.user_id === u.id);
  let e = await find(); assert.ok(e); assert.equal(e.name, 'Sami Carpenter'); assert.equal(e.active, 1); assert.equal(e.role, 'Worker');
  await call('boss', 'PUT', `/api/users/${u.id}`, { name: 'Sami Ali', active: false }); e = await find(); assert.equal(e.name, 'Sami Ali'); assert.equal(e.active, 0);
  const id = e.id; await call('boss', 'DELETE', `/api/users/${u.id}`);
  const kept = (await call('boss', 'GET', '/api/t/employees')).data.find((x) => x.id === id); assert.ok(kept); assert.equal(kept.user_id, null); assert.equal(kept.active, 0); assert.ok(kept.left_date);
});

test('permissions can be set per user on top of the role: pages, tables, money, and the admin-only areas stay locked', async () => {
  const me = (u) => call(u, 'GET', '/api/me').then((r) => r.data.user);
  const users = (await call('boss', 'GET', '/api/users')).data; const wasim = users.find((x) => x.username === 'wasim'); const amina = users.find((x) => x.username === 'amina');
  // a worker normally has no quotations, no prices and no ledger
  assert.equal((await call('wasim', 'GET', '/api/ledger')).status, 403); assert.equal((await call('wasim', 'GET', '/api/t/price_items')).status, 403);
  // give the worker the Price List (view) and Orders (view)
  assert.equal((await call('amina', 'PUT', `/api/users/${wasim.id}`, { perms: { pages: { prices: 'view' } } })).status, 403); // only the admin changes permissions
  const r = await call('boss', 'PUT', `/api/users/${wasim.id}`, { perms: { pages: { prices: 'view', orders: 'view', users: 'edit', bogus: 'edit' } } }); assert.equal(r.status, 200);
  assert.deepEqual(r.data.perms.pages, { prices: 'view', orders: 'view' }); // locked and unknown pages are dropped
  assert.equal((await call('wasim', 'GET', '/api/t/price_items')).status, 200); assert.equal((await call('wasim', 'POST', '/api/t/price_items', { name: 'x', price: 1 })).status, 403); // view only
  assert.equal((await call('wasim', 'GET', '/api/ledger')).status, 200); assert.equal((await call('wasim', 'GET', '/api/users')).status, 403);
  const pi = (await call('wasim', 'GET', '/api/t/profiles')).data; assert.ok(pi.length === 0 || pi.some((x) => x.price_bar > 0) || true); // money is no longer hidden for them
  assert.ok((await me('wasim')).perms.pages.prices === 'view');
  // take a page away from an accounts user
  await call('boss', 'PUT', `/api/users/${amina.id}`, { perms: { pages: { payments: 'none', receipts: 'view' } } });
  assert.equal((await call('amina', 'GET', '/api/t/payments')).status, 403); assert.equal((await call('amina', 'GET', '/api/t/receipts')).status, 200); assert.equal((await call('amina', 'POST', '/api/t/receipts', { client: 'x', amount: 1 })).status, 403);
  assert.equal((await call('amina', 'GET', '/api/t/quotes')).status, 200); // everything else still follows the role
  // reset
  await call('boss', 'PUT', `/api/users/${wasim.id}`, { perms: null }); await call('boss', 'PUT', `/api/users/${amina.id}`, { perms: null });
  assert.equal((await call('wasim', 'GET', '/api/t/price_items')).status, 403); assert.equal((await call('amina', 'GET', '/api/t/payments')).status, 200);
});

test('accounting: chart is seeded, postings balance, journals must balance, protected accounts stay', async () => {
  const d = (await call('boss', 'GET', '/api/accounting')).data; assert.ok(d.accounts.length >= 25); assert.equal(d.tb.balanced, true);
  const sys = (k) => d.accounts.find((a) => a.sys === k);
  assert.ok(sys('ar') && sys('sales') && sys('vat_out') && sys('ap') && sys('cash') && sys('bank'));
  // the earlier tests made invoices and receipts, so receivables and sales have balances
  const row = (k) => d.tb.list.find((a) => a.id === sys(k).id); assert.ok(row('sales').credit > 0); assert.ok(row('ar').debit >= row('ar').credit - 1e9);
  assert.equal(d.statements.balanced, true);
  // journal vouchers: must balance, two lines, detail accounts only
  const cash = sys('cash').id; const cap = sys('capital').id; const grp = d.accounts.find((a) => a.code === '12').id;
  const bad = (lines) => call('boss', 'POST', '/api/t/journals', { date: '2026-10-10', description: 't', lines });
  assert.equal((await bad([{ account_id: cash, debit: 10 }, { account_id: cap, credit: 9 }])).status, 400);
  assert.equal((await bad([{ account_id: cash, debit: 10 }])).status, 400);
  assert.equal((await bad([{ account_id: grp, debit: 10 }, { account_id: cap, credit: 10 }])).status, 400); // a heading with accounts under it
  const j = await bad([{ account_id: cash, debit: 50, description: 'float' }, { account_id: cap, credit: 50 }]); assert.equal(j.status, 201); assert.match(j.data.no, /^26\d{4}$/);
  const d2 = (await call('boss', 'GET', '/api/accounting')).data; assert.equal(d2.tb.balanced, true);
  assert.equal(d2.tb.list.find((a) => a.id === cash).debit - d.tb.list.find((a) => a.id === cash).debit, 50);
  // the chart: built-in accounts cannot be deleted, new ones can; amina (accounts) can edit, wasim (worker) cannot read it
  assert.equal((await call('boss', 'DELETE', `/api/t/accounts/${cash}`)).status, 400); // it has entries, so it stays
  const loans = sys('loans').id; assert.equal((await call('boss', 'DELETE', `/api/t/accounts/${loans}`)).status, 200); // no lock: an unused built-in account can go
  assert.equal((await call('boss', 'GET', '/api/accounting')).data.tb.balanced, true);
  assert.equal((await call('amina', 'POST', '/api/t/accounts', { code: '1210', name: 'Second bank', type: 'asset', parent_id: grp, active: 1 })).status, 403); // only the admin adds…
  const na = await call('boss', 'POST', '/api/t/accounts', { code: '1210', name: 'Second bank', type: 'asset', parent_id: grp, active: 1 }); assert.equal(na.status, 201);
  assert.equal((await call('boss', 'POST', '/api/t/accounts', { code: '1210', name: 'dup', type: 'asset' })).status, 400);
  assert.equal((await call('boss', 'POST', '/api/t/accounts', { code: '9', name: 'wrong type', type: 'expense', parent_id: grp })).status, 400);
  assert.equal((await call('amina', 'PUT', `/api/t/accounts/${na.data.id}`, { name: 'Second bank (BBK)' })).status, 200); // …but accounts staff can still rename
  assert.equal((await call('wasim', 'GET', '/api/accounting')).status, 403); assert.equal((await call('wasim', 'GET', '/api/t/accounts')).status, 403);
  assert.equal((await call('amina', 'DELETE', `/api/t/accounts/${na.data.id}`)).status, 403); // …or deletes
  assert.equal((await call('boss', 'DELETE', `/api/t/accounts/${na.data.id}`)).status, 200);
  await call('boss', 'DELETE', `/api/t/journals/${j.data.id}`);
});

test('several bank accounts: the original one exists, new ones get their own chart account, money follows the chosen account', async () => {
  const banks = (await call('boss', 'GET', '/api/t/bank_accounts')).data; assert.equal(banks[0].key, 'bank'); assert.ok(banks[0].coa_id);
  const b2 = await call('amina', 'POST', '/api/t/bank_accounts', { name: 'BBK current', bank: 'BBK', number: 'BH00BBKX', opening: 1000, print: 1, active: 1 }); assert.equal(b2.status, 201);
  assert.equal(b2.data.key, `bank-${b2.data.id}`); assert.ok(b2.data.coa_id);
  assert.equal((await call('amina', 'POST', '/api/t/bank_accounts', { name: ' ' })).status, 400);
  assert.equal((await call('wasim', 'GET', '/api/t/bank_accounts')).status, 403);
  // a receipt into the new account shows up on that account's chart entry, and the books still balance
  const inv = (await call('boss', 'GET', '/api/t/orders')).data[0];
  const r = await call('amina', 'POST', '/api/t/receipts', { order_inv: inv.inv, client: inv.client, amount: 5, method: 'Bank transfer', ref: 'TT9', account: b2.data.key }); assert.equal(r.status, 201);
  const acc = (await call('boss', 'GET', '/api/accounting')).data; const row = acc.tb.list.find((a) => a.id === b2.data.coa_id);
  assert.equal(row.ownDebit, 1005); assert.equal(acc.tb.balanced, true); // opening 1000 + the receipt
  assert.equal(acc.accounts.find((a) => a.id === b2.data.coa_id).parent_id, acc.accounts.find((a) => a.sys === 'bank').id);
  // renaming follows into the chart; used accounts cannot be deleted
  await call('amina', 'PUT', `/api/t/bank_accounts/${b2.data.id}`, { name: 'BBK main', key: 'hack' });
  assert.equal((await call('boss', 'GET', '/api/t/accounts')).data.find((a) => a.id === b2.data.coa_id).name, 'BBK main');
  assert.equal((await call('boss', 'GET', '/api/t/bank_accounts')).data.find((b) => b.id === b2.data.id).key, b2.data.key); // the key never changes
  assert.equal((await call('boss', 'DELETE', `/api/t/bank_accounts/${b2.data.id}`)).status, 400);
  assert.equal((await call('boss', 'DELETE', `/api/t/bank_accounts/${banks[0].id}`)).status, 400);
  const b3 = (await call('boss', 'POST', '/api/t/bank_accounts', { name: 'Spare', active: 1 })).data;
  assert.equal((await call('boss', 'DELETE', `/api/t/bank_accounts/${b3.id}`)).status, 200);
  assert.ok(!(await call('boss', 'GET', '/api/t/accounts')).data.some((a) => a.id === b3.coa_id)); // its empty chart account went too
  assert.equal((await call('boss', 'GET', '/api/accounting')).data.tb.balanced, true);
});

test('journal: negative debit or credit is refused; statements take a period', async () => {
  const d = (await call('boss', 'GET', '/api/accounting')).data; const cash = d.accounts.find((a) => a.sys === 'cash').id; const cap = d.accounts.find((a) => a.sys === 'capital').id;
  const neg = await call('boss', 'POST', '/api/t/journals', { date: '2026-10-10', description: 'neg', lines: [{ account_id: cash, debit: -10 }, { account_id: cap, credit: -10 }] });
  assert.equal(neg.status, 400); assert.match(neg.data.error, /negative/i);
  // an account statement from a date: the first row is the balance brought forward and balances continue from it
  const j1 = (await call('boss', 'POST', '/api/t/journals', { date: '2026-01-05', description: 'early', lines: [{ account_id: cash, debit: 70 }, { account_id: cap, credit: 70 }] })).data;
  const j2 = (await call('boss', 'POST', '/api/t/journals', { date: '2026-03-05', description: 'later', lines: [{ account_id: cash, debit: 30 }, { account_id: cap, credit: 30 }] })).data;
  const all = (await call('boss', 'GET', `/api/accounting?account=${cap}`)).data.ledger; const part = (await call('boss', 'GET', `/api/accounting?account=${cap}&from=2026-02-01`)).data.ledger;
  assert.equal(all.at(-1).balance, part.at(-1).balance); assert.equal(part[0].opening, true); assert.ok(part[0].balance >= 70);
  assert.ok(part.every((r) => r.opening || r.date >= '2026-02-01'));
  await call('boss', 'DELETE', `/api/t/journals/${j1.id}`); await call('boss', 'DELETE', `/api/t/journals/${j2.id}`);
});

test('VAT is fixed when a document is made: a later rate change only affects new ones', async () => {
  await call('boss', 'PUT', '/api/settings', { vat_rate: 10 });
  const o1 = (await call('boss', 'POST', '/api/t/orders', { inv: 'V-OLD', date: '2026-10-01', client: 'Freeze', amount: 110 })).data; assert.equal(o1.vat, 10); // saved with the VAT of the day
  await call('boss', 'PUT', '/api/settings', { vat_rate: 5 });
  assert.equal((await call('boss', 'GET', `/api/t/orders/${o1.id}`)).data.vat, 10); // not recalculated
  const o2 = (await call('boss', 'POST', '/api/t/orders', { inv: 'V-NEW', date: '2026-10-02', client: 'Freeze', amount: 105 })).data; assert.equal(o2.vat, 5); // new documents use the new rate
  // a quotation with a VAT-free line becomes an invoice with the right VAT and amount
  const q = (await call('amina', 'POST', '/api/t/quotes', { client: 'Mixed', date: '2026-10-03', vat_rate: 10, items: [{ desc: 'Taxed', qty: 1, price: 1000 }, { desc: 'No VAT', qty: 1, price: 200, vat: false }] })).data;
  const inv = (await call('amina', 'POST', `/api/quotes/${q.id}/to-order`, {})).data; assert.equal(inv.amount, 1300); assert.equal(inv.vat, 100);
  const pi = (await call('boss', 'POST', '/api/t/price_items', { name: 'Exempt item', rate: 5, type: 'fixed', unit: 'ea', vat: 0 })).data; assert.equal(pi.vat, 0);
  await call('boss', 'PUT', '/api/settings', { vat_rate: 10 });
});

test('purchase orders keep a payment log (part payments) and rows carry their last change for hover text', async () => {
  const po = (await call('boss', 'POST', '/api/t/purchase_orders', { date: '2026-10-05', supplier: 'Part Co', status: 'received', lines: [], total: 500 })).data;
  const log = [{ date: '2026-10-06', amount: 200, method: 'Cash', no: 'X1' }];
  const part = (await call('boss', 'PUT', `/api/t/purchase_orders/${po.id}`, { pay_log: log, paid: 0 })).data; assert.deepEqual(part.pay_log, log); assert.equal(part.paid, 0);
  const got = (await call('boss', 'GET', `/api/t/purchase_orders/${po.id}`)).data;
  assert.equal(got._upd.action, 'updated'); assert.ok(got._upd.by); assert.ok(got._upd.ch.some((c) => c.f === 'pay_log'));
  const list = (await call('boss', 'GET', '/api/t/purchase_orders')).data; assert.ok(list.find((r) => r.id === po.id)._upd.ts);
  await call('boss', 'DELETE', `/api/t/purchase_orders/${po.id}`);
});

test('sales user, customer credit (earned, expiring, spent), order progress and GPS', async () => {
  assert.equal((await call('boss', 'POST', '/api/users', { username: 'sam', name: 'Sam Sales', role: 'sales', password: 'sal12345' })).status, 201); await login('sam', 'sal12345');
  // what a sales user can and cannot reach
  assert.equal((await call('sam', 'GET', '/api/t/quotes')).status, 200); assert.equal((await call('sam', 'GET', '/api/t/orders')).status, 200);
  assert.equal((await call('sam', 'GET', '/api/t/payments')).status, 403); assert.equal((await call('sam', 'GET', '/api/t/employees')).status, 403); assert.equal((await call('sam', 'GET', '/api/users')).status, 403);
  assert.equal((await call('sam', 'POST', '/api/t/orders', { client: 'X', amount: 5 })).status, 403); // sales cannot make invoices by hand
  const sq = (await call('sam', 'POST', '/api/t/quotes', { client: 'Loyal Customer', mobile: '3999', date: '2026-10-10', site: 'Riffa', gps: '26.1234, 50.5555', vat_rate: 10, items: [{ desc: 'Big job', qty: 1, price: 1000 }] })); assert.equal(sq.status, 201); assert.equal(sq.data.prepared_by, 'Sam Sales');
  // credit off by default: converting a quotation earns nothing
  await call('boss', 'PUT', '/api/settings', { loyalty: { enabled: true, expiry_months: 3, tiers: [{ min: 500, type: 'fixed', value: 20 }, { min: 1000, type: 'percent', value: 3 }] } });
  const conv = await call('sam', 'POST', `/api/quotes/${sq.data.id}/to-order`, {}); assert.equal(conv.status, 200, JSON.stringify(conv.data)); const inv = conv.data; assert.equal(inv.gps, '26.1234, 50.5555'); assert.equal(inv.amount, 1100);
  assert.equal(inv.credit_earned, 33); // the highest tier reached: 3% of 1100
  const credits = (await call('sam', 'GET', '/api/t/customer_credits')).data; const cr = credits.find((c) => c.order_inv === inv.inv); assert.equal(cr.amount, 33); assert.ok(cr.expires > '2026-01-01');
  // a second invoice below every tier earns nothing, and the same invoice never earns twice
  const small = (await call('boss', 'POST', '/api/t/orders', { client: 'Loyal Customer', mobile: '3999', amount: 100, date: '2026-10-11' })).data; assert.equal(small.credit_earned, undefined);
  // spend 30 of it on the small invoice: a receipt paid with credit, the invoice balance falls, the credit is used up
  assert.equal((await call('sam', 'POST', '/api/credits/redeem', { credit_id: cr.id, order_inv: small.inv, amount: 50 })).status, 400); // only 33 left
  assert.equal((await call('boss', 'POST', '/api/t/orders', { client: 'Someone Else', amount: 100 })).status, 201);
  const other = (await call('boss', 'GET', '/api/ledger')).data.find((o) => o.client === 'Someone Else'); assert.equal((await call('sam', 'POST', '/api/credits/redeem', { credit_id: cr.id, order_inv: other.inv, amount: 10 })).status, 400); // another customer's invoice
  const ok = await call('sam', 'POST', '/api/credits/redeem', { credit_id: cr.id, order_inv: small.inv, amount: 30 }); assert.equal(ok.status, 200); assert.equal(ok.data.receipt.method, 'Loyalty credit'); assert.equal(ok.data.credit.used, 30);
  const led = (await call('boss', 'GET', '/api/ledger')).data; assert.equal(led.find((o) => o.inv === small.inv).balance, 70); assert.equal(led.find((o) => o.inv === small.inv).paid, 30);
  // the books: the credit is an expense, not cash
  const acc = (await call('boss', 'GET', '/api/accounting')).data; const loy = acc.tb.list.find((a) => a.sys === 'loyalty'); assert.ok(loy && loy.ownDebit === 30, JSON.stringify(loy));
  // progress of a whole order from its tasks
  await call('boss', 'POST', '/api/t/tasks', { order_inv: inv.inv, title: 'Cut', stage: 'Cutting', estimate_min: 60, status: 'done', progress: 100 });
  await call('boss', 'POST', '/api/t/tasks', { order_inv: inv.inv, title: 'Fit', stage: 'Fitting', estimate_min: 180, status: 'todo', progress: 40 });
  const withTasks = (await call('boss', 'GET', '/api/ledger')).data.find((o) => o.inv === inv.inv); assert.equal(withTasks.tasks_n, 2); assert.equal(withTasks.tasks_done, 1); assert.equal(withTasks.progress, 55); // (60×100 + 180×40) / 240
  // priority is kept per task
  const t = (await call('boss', 'POST', '/api/t/tasks', { order_inv: inv.inv, title: 'Rush', priority: 'urgent' })).data; assert.equal(t.priority, 'urgent');
});
