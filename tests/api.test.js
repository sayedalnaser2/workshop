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
  assert.match(q.number, /^Q2610\d{3}$/);
  const o = (await call('amina', 'POST', `/api/quotes/${q.id}/to-order`, {})).data;
  assert.match(o.inv, /^I2610\d{3}$/); assert.equal(o.amount, 220);
  assert.equal((await call('amina', 'POST', `/api/quotes/${q.id}/to-order`, {})).status, 400); // only once
  const r = await call('amina', 'POST', '/api/t/receipts', { order_inv: o.inv, client: 'Test Co', amount: 100, method: 'Cash', date: '2026-10-11' });
  assert.equal(r.status, 201); assert.match(r.data.no, /^R \d{3}$/);
  const l = (await call('amina', 'GET', '/api/ledger')).data.find((x) => x.inv === o.inv);
  assert.equal(l.paid, 100); assert.equal(l.balance, 120);
});
test('Benefit and cheque payments need their number', async () => {
  for (const method of ['Benefit', 'Cheque']) {
    const bad = await call('amina', 'POST', '/api/t/receipts', { amount: 5, method, ref: '  ' });
    assert.equal(bad.status, 400); assert.match(bad.data.error, /number is required/);
    assert.equal((await call('amina', 'POST', '/api/t/receipts', { amount: 5, method, ref: '12345' })).status, 201);
  }
  assert.equal((await call('amina', 'POST', '/api/t/payments', { paid_to: 'X', amount: 5, method: 'Cheque' })).status, 400);
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
