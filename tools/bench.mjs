// Usage: node tools/bench.mjs [baseUrl] [username] [password]
// Times the main API calls and static files, and reports how many bytes travel (with and without compression).
const base = process.argv[2] || 'http://localhost:3000'; const user = process.argv[3] || 'admin'; const pw = process.argv[4] || 'secret1';
const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pw }) });
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
import http from 'node:http';
// raw request so we count the bytes that really travel (fetch would silently decompress)
const raw = (path, enc) => new Promise((resolve, reject) => {
  const t = performance.now(); const u = new URL(base + path);
  http.get({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers: { Cookie: cookie, 'Accept-Encoding': enc || 'identity' } }, (r) => {
    let n = 0; r.on('data', (c) => (n += c.length)); r.on('end', () => resolve({ ms: performance.now() - t, bytes: n, status: r.statusCode, enc: r.headers['content-encoding'] || '' }));
  }).on('error', reject);
});
const get = async (path, enc) => raw(path, enc);
const getOld = async (path, enc) => {
  const t = performance.now();
  const r = await fetch(base + path, { headers: { Cookie: cookie, 'Accept-Encoding': enc || 'identity' } });
  const buf = Buffer.from(await r.arrayBuffer());
  return { ms: performance.now() - t, bytes: buf.length, status: r.status, enc: r.headers.get('content-encoding') || '' };
};
const median = async (path, enc, n = 7) => { const rs = []; for (let i = 0; i < n; i++) rs.push(await get(path, enc)); rs.sort((a, b) => a.ms - b.ms); return rs[Math.floor(n / 2)]; };
const fmt = (b) => (b > 1024 ? (b / 1024).toFixed(0) + ' KB' : b + ' B');
console.log('API (median of 7)'.padEnd(26), 'time'.padStart(9), 'plain'.padStart(10), 'gzip/br'.padStart(10));
for (const p of ['/api/bootstrap', '/api/summary', '/api/ledger', '/api/t/purchases', '/api/t/receipts', '/api/t/quotes', '/api/tasks-view', '/api/t/orders']) {
  const a = await median(p); const c = await get(p, 'br, gzip');
  console.log(p.padEnd(26), (a.ms.toFixed(1) + ' ms').padStart(9), fmt(a.bytes).padStart(10), fmt(c.bytes).padStart(10));
}
// first page load: everything the browser must fetch for the dashboard
const index = await (await fetch(base + '/', { headers: { Cookie: cookie } })).text();
const seen = new Set(['/', '/index.html']); const queue = ['/css/style.css', '/js/app.js'];
for (const m of index.matchAll(/(?:src|href)="(\/[^"]+)"/g)) queue.push(m[1]);
let files = 0, plain = 0, comp = 0, ms = 0; const pageMods = ['dashboard'];
while (queue.length) {
  const p = queue.shift(); if (seen.has(p) || /\.(png|ico)$/.test(p)) continue; seen.add(p);
  const a = await get(p); if (a.status !== 200) continue; const c = await get(p, 'br, gzip');
  files++; plain += a.bytes; comp += c.bytes; ms += a.ms;
  if (/\.js$/.test(p)) { const src = await (await fetch(base + p)).text(); for (const m of src.matchAll(/(?:from\s+|import\()\s*['"`](\.{1,2}\/[^'"`$]+\.js)['"`]/g)) { const url = new URL(m[1], base + p).pathname; queue.push(url); } }
}
const dash = new Set(); // pages imported on boot + the dashboard
console.log(`\nFirst load (HTML+CSS+JS reachable from the entry): ${files} requests, ${fmt(plain)} plain, ${fmt(comp)} compressed`);
