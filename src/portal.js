// The customer portal: a customer opens client.<your domain>, types the order number and the code you sent, and sees only
// the progress of that one order, the photos you chose to show and the kitchen models you allowed. Nothing else, no money.
import crypto from 'node:crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { db, getSetting } from './db.js';
import { makePortalToken, portalOrderId } from './auth.js';
import { throttleCheck, throttleFail, throttleOk } from './web.js';

const cookieOf = (req, name) => { const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)); return m ? m[1] : ''; };
const norm = (s) => String(s || '').replace(/[\s-]+/g, '');
const same = (a, b) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const orderLocks = new Map(); // wrong codes per order, whoever tries: 10 misses and the order is locked for 15 minutes

/** An 8-digit code, shown as 1234 5678. */
export const newPortalCode = () => String(crypto.randomInt(0, 1e8)).padStart(8, '0');
export const showCode = (c) => (c ? `${c.slice(0, 4)} ${c.slice(4)}` : '');

const stageName = (t) => String(t.stage || '').trim() || 'Work';
function progressOf(inv) {
  const tasks = db.prepare("SELECT stage, status, progress, estimate_min FROM tasks WHERE order_inv=? AND IFNULL(hidden,0)=0").all(inv);
  let w = 0; let wp = 0; const stages = new Map();
  for (const t of tasks) {
    const wt = Number(t.estimate_min) > 0 ? Number(t.estimate_min) : 60; const pr = t.status === 'done' ? 100 : Math.max(0, Math.min(100, Number(t.progress) || 0));
    w += wt; wp += wt * pr; const s = stages.get(stageName(t)) || { name: stageName(t), n: 0, done: 0, w: 0, wp: 0 }; s.n++; if (t.status === 'done') s.done++; s.w += wt; s.wp += wt * pr; stages.set(s.name, s);
  }
  const list = [...stages.values()].map((s) => ({ name: s.name, tasks: s.n, done: s.done, progress: s.w ? Math.round(s.wp / s.w) : 0, state: s.done === s.n ? 'done' : s.wp > 0 ? 'doing' : 'todo' }));
  return { percent: w ? Math.round(wp / w) : null, stages: list };
}
export const portalOf = (o) => { const p = o.portal && typeof o.portal === 'object' ? o.portal : {}; return { photos: Array.isArray(p.photos) ? p.photos.map(Number) : [], kitchens: Array.isArray(p.kitchens) ? p.kitchens.map(Number) : [], message: String(p.message || '') }; };
const parse = (o) => { if (o && typeof o.portal === 'string') { try { o.portal = JSON.parse(o.portal); } catch { o.portal = {}; } } return o; };
const orderById = (id) => parse(db.prepare('SELECT * FROM orders WHERE id=?').get(id));
const safeSpec = (spec) => { const s = JSON.parse(JSON.stringify(spec || {})); if (s.style) { for (const k of ['profile_price', 'plinth_price', 'cut_mode', 'cut_dir']) delete s.style[k]; } delete s.cut_dir; delete s.stock_taken; return s; };

/** Handles /api/portal/*. Returns true when it answered. */
export async function portalApi(req, res, url, { send, readJson, filesDir }) {
  const p = url.pathname.replace(/^\/api\/portal\/?/, '').split('/').filter(Boolean); const m = req.method;
  if (p[0] === 'login' && m === 'POST') {
    const b = await readJson(req); const inv = String(b.order || '').trim(); const code = norm(b.code);
    const wait = throttleCheck(req, 'portal|' + inv); if (wait) return send(res, 429, { error: `Too many tries. Please wait ${wait} seconds.` });
    const lock = orderLocks.get(inv.toLowerCase()); if (lock && lock.until > Date.now()) return send(res, 429, { error: 'This page is locked for a while after too many wrong codes. Please try again later or call us.' });
    const o = inv ? parse(db.prepare('SELECT * FROM orders WHERE inv=? COLLATE NOCASE').get(inv)) : null;
    const ok = !!(o && o.portal_code && code && same(norm(o.portal_code), code));
    if (!ok) {
      throttleFail(req, 'portal|' + inv); await new Promise((r) => setTimeout(r, 500));
      if (o) { const l = orderLocks.get(inv.toLowerCase()) || { n: 0, until: 0 }; l.n++; if (l.n >= 10) { l.until = Date.now() + 15 * 60000; l.n = 0; } orderLocks.set(inv.toLowerCase(), l); if (orderLocks.size > 5000) orderLocks.clear(); }
      return send(res, 401, { error: 'The order number or the code is not right.' });
    }
    throttleOk(req, 'portal|' + inv); orderLocks.delete(inv.toLowerCase());
    return send(res, 200, { ok: true }, { 'Set-Cookie': `cp=${makePortalToken(o.id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 86400}` });
  }
  if (p[0] === 'logout') return send(res, 200, { ok: true }, { 'Set-Cookie': 'cp=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  const id = portalOrderId(cookieOf(req, 'cp')); const o = id ? orderById(id) : null;
  if (!o || !o.portal_code) return send(res, 401, { error: 'Please sign in.' }); // switching the code off ends every open visit
  const pf = portalOf(o);
  if (p[0] === 'me') {
    const photos = pf.photos.length ? db.prepare(`SELECT id, file_name, note, tag, created_at FROM attachments WHERE id IN (${pf.photos.map(() => '?').join(',')}) AND mime LIKE 'image/%' ORDER BY id`).all(...pf.photos) : [];
    const kitchens = pf.kitchens.length ? db.prepare(`SELECT id, name FROM kitchens WHERE id IN (${pf.kitchens.map(() => '?').join(',')}) ORDER BY id`).all(...pf.kitchens) : [];
    const co = getSetting('company') || {};
    return send(res, 200, { inv: o.inv, client: o.client, date: o.date, done: !!o.done, message: pf.message, ...progressOf(o.inv), photos: photos.map((a) => ({ id: a.id, name: a.file_name, note: a.note || '', tag: a.tag || '', date: String(a.created_at || '').slice(0, 10) })), kitchens, company: { name: co.name || '', name_ar: co.name_ar || '', phones: co.phones || '' }, colour_defs: getSetting('colour_defs') || [] });
  }
  if (p[0] === 'photo' && p[1]) {
    const aid = Number(p[1]); if (!pf.photos.includes(aid)) return send(res, 404, { error: 'Not found' });
    const a = db.prepare('SELECT * FROM attachments WHERE id=?').get(aid); if (!a || !/^image\//.test(a.mime || '')) return send(res, 404, { error: 'Not found' });
    const buf = await readFile(path.join(filesDir(), path.basename(a.file_path))).catch(() => null); if (!buf) return send(res, 404, { error: 'Not found' });
    return send(res, 200, buf, { 'Content-Type': a.mime, 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': 'inline' });
  }
  if (p[0] === 'kitchen' && p[1]) {
    const kid = Number(p[1]); if (!pf.kitchens.includes(kid)) return send(res, 404, { error: 'Not found' });
    const k = db.prepare('SELECT id, name, spec FROM kitchens WHERE id=?').get(kid); if (!k) return send(res, 404, { error: 'Not found' });
    let spec = {}; try { spec = typeof k.spec === 'string' ? JSON.parse(k.spec) : k.spec; } catch {}
    return send(res, 200, { id: k.id, name: k.name, spec: safeSpec(spec) });
  }
  return send(res, 404, { error: 'Unknown endpoint' });
}
