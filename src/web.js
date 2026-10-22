// HTTP helpers: compressed responses, cached static files, security headers, login throttling, backups.
import { readFile, stat, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';

const gzip = promisify(zlib.gzip); const brotli = promisify(zlib.brotliCompress);
export const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'geolocation=(self)' };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const COMPRESSIBLE = /^(text\/|application\/(json|javascript)|image\/svg)/;
const pick = (req) => { const a = req.headers['accept-encoding'] || ''; return /\bbr\b/.test(a) ? 'br' : /\bgzip\b/.test(a) ? 'gzip' : ''; };

async function encode(buf, enc, fast) {
  if (enc === 'br') return brotli(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: fast ? 4 : 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
  return gzip(buf, { level: fast ? 5 : 9 });
}

/** Send a body (object → JSON), compressing anything over 1 KB when the browser accepts it. */
export async function respond(req, res, code, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  const type = headers['Content-Type'] || (isObj ? 'application/json' : 'text/plain; charset=utf-8');
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(isObj ? JSON.stringify(body) : String(body));
  const h = { ...SECURITY, 'Content-Type': type, 'Cache-Control': 'no-store', ...headers };
  const enc = pick(req);
  if (enc && buf.length > 1024 && COMPRESSIBLE.test(type)) { buf = await encode(buf, enc, true); h['Content-Encoding'] = enc; h.Vary = 'Accept-Encoding'; }
  h['Content-Length'] = buf.length;
  res.writeHead(code, h); res.end(buf);
}

/** Static files: read once, compressed once per encoding, ETag + long caching for hashed build files. */
export function staticServer(root, { dev = false } = {}) {
  const cache = new Map();
  const HASHED = /\/assets\/[^/]+-[A-Z0-9]{8}\.(js|css)$/;
  const load = async (file) => {
    if (!dev && cache.has(file)) return cache.get(file);
    const s = await stat(file).catch(() => null); if (!s || s.isDirectory()) return null;
    const buf = await readFile(file); const type = MIME[path.extname(file)] || 'application/octet-stream';
    const e = { buf, type, etag: `"${crypto.createHash('sha1').update(buf).digest('base64url').slice(0, 20)}"`, enc: {} };
    if (!dev) cache.set(file, e);
    return e;
  };
  return async (req, res, pathname) => {
    let file = path.normalize(path.join(root, decodeURIComponent(pathname)));
    if (!file.startsWith(root)) return respond(req, res, 403, 'Forbidden');
    let e = await load(file); let rel = '/' + path.relative(root, file);
    if (!e) { file = path.join(root, 'index.html'); e = await load(file); rel = '/index.html'; } // single-page app: unknown paths get the app shell
    if (!e) return respond(req, res, 404, 'Not found');
    const h = { ...SECURITY, 'Content-Type': e.type, ETag: e.etag, 'Cache-Control': HASHED.test(rel) ? 'public, max-age=31536000, immutable' : 'no-cache' };
    if (req.headers['if-none-match'] === e.etag) { res.writeHead(304, h); return res.end(); }
    let buf = e.buf; const enc = COMPRESSIBLE.test(e.type) && e.buf.length > 512 ? pick(req) : '';
    if (enc) { buf = e.enc[enc] ||= await encode(e.buf, enc, dev); h['Content-Encoding'] = enc; h.Vary = 'Accept-Encoding'; }
    h['Content-Length'] = buf.length; res.writeHead(200, h); res.end(req.method === 'HEAD' ? undefined : buf);
  };
}

// ------------------------------------------------------------------ login throttling: 5 wrong passwords lock that user+address for a minute
const fails = new Map();
export const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
export function throttleCheck(req, username) {
  const k = `${clientIp(req)}|${String(username || '').toLowerCase()}`; const e = fails.get(k);
  return e && e.until > Date.now() ? Math.ceil((e.until - Date.now()) / 1000) : 0;
}
export function throttleFail(req, username) {
  const k = `${clientIp(req)}|${String(username || '').toLowerCase()}`; const e = fails.get(k) || { n: 0, until: 0 };
  e.n++; if (e.n >= 5) { e.until = Date.now() + 60000; e.n = 0; } fails.set(k, e);
  if (fails.size > 5000) fails.clear();
}
export const throttleOk = (req, username) => fails.delete(`${clientIp(req)}|${String(username || '').toLowerCase()}`);

// ------------------------------------------------------------------ automatic daily backups (SQLite VACUUM INTO — consistent, even while running)
export const backupDir = () => path.join(process.env.DATA_DIR || path.resolve('data'), 'backups');
export async function runBackup(keep = 14) {
  const dir = backupDir(); await mkdir(dir, { recursive: true });
  const name = `workshop-${new Date().toISOString().slice(0, 10)}.db`; const file = path.join(dir, name);
  if (existsSync(file)) return null;
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const all = (await readdir(dir)).filter((f) => /^workshop-\d{4}-\d\d-\d\d\.db$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) await unlink(path.join(dir, old)).catch(() => {});
  return name;
}
export async function listBackups() {
  const dir = backupDir(); const files = existsSync(dir) ? (await readdir(dir)).filter((f) => /^workshop-\d{4}-\d\d-\d\d\.db$/.test(f)).sort().reverse() : [];
  return Promise.all(files.map(async (name) => ({ name, size: (await stat(path.join(dir, name))).size })));
}
