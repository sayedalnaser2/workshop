import crypto from 'node:crypto';
import { db, getSetting, setSetting } from './db.js';
import { ROLES, PAGE_LABELS, LOCKED_PAGES } from '../public/js/perm.js';

const secret = () => {
  let s = getSetting('session_secret');
  if (!s) { s = crypto.randomBytes(32).toString('hex'); setSetting('session_secret', s); }
  return s;
};
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const pub = (u) => { if (!u) return null; let shift = null; try { shift = u.shift ? JSON.parse(u.shift) : null; } catch {} let perms = null; try { perms = u.perms ? JSON.parse(u.perms) : null; } catch {} return { id: u.id, username: u.username, name: u.name, role: u.role, creator: u.creator ? 1 : 0, active: u.active ? 1 : 0, created_at: u.created_at, shift, perms }; };

// Databases from before user accounts had one shared password: keep it as the "admin" user.
(function migrate() {
  const old = getSetting('auth');
  if (old && !db.prepare('SELECT COUNT(*) n FROM users').get().n) db.prepare("INSERT INTO users(username,name,role,salt,hash,active) VALUES('admin','Admin','admin',?,?,1)").run(old.salt, old.hash);
})();

export const needsSetup = () => db.prepare('SELECT COUNT(*) n FROM users').get().n === 0;
export const listUsers = () => db.prepare('SELECT * FROM users ORDER BY role, username').all().map(pub);
export const getUser = (id) => pub(db.prepare('SELECT * FROM users WHERE id=?').get(id));
const bad = (m) => Object.assign(new Error(m), { status: 400 });

function validate({ username, name, role, password }, creating) {
  if (creating || username !== undefined) { if (!/^[a-z0-9._-]{3,30}$/i.test(String(username || ''))) throw bad('Username must be 3–30 letters, numbers, dots or dashes.'); }
  if (role !== undefined && !ROLES[role]) throw bad('Unknown role.');
  if (creating || password) { if (!password || String(password).length < 6) throw bad('Password must have at least 6 characters.'); }
}
/** Only the parts of a personal shift we understand. */
const cleanShift = (s) => { const o = {}; if (/^\d{1,2}:\d{2}$/.test(s.start || '')) o.start = s.start; if (/^\d{1,2}:\d{2}$/.test(s.end || '')) o.end = s.end; if (Array.isArray(s.breaks)) o.breaks = s.breaks.filter((b) => b && /^\d{1,2}:\d{2}$/.test(b.from || '') && /^\d{1,2}:\d{2}$/.test(b.to || '')).map((b) => ({ from: b.from, to: b.to })); if (Array.isArray(s.days)) o.days = s.days.map(Number).filter((d) => d >= 0 && d <= 6); return o; };
/** A person's own page settings: only known pages, only none / view / edit, never the admin-only pages. null when nothing differs from the role. */
const cleanPerms = (p) => { const pages = {}; for (const [k, v] of Object.entries(p?.pages || {})) if (k in PAGE_LABELS && !LOCKED_PAGES.includes(k) && ['none', 'view', 'edit'].includes(v)) pages[k] = v; return Object.keys(pages).length ? { pages } : null; };
const activeAdmins = (exceptId = 0) => db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1 AND id<>?").get(exceptId).n;

const ROLE_TITLE = { admin: 'Admin', account: 'Accounts', sales: 'Sales', worker: 'Worker' };
/** Every login is also an employee: make sure each user has an employee record (matching a not-yet-linked employee of the same name, else creating one). */
export function syncEmployees() {
  const emps = db.prepare('SELECT id, name, user_id FROM employees').all();
  for (const u of db.prepare('SELECT id, name, role, active FROM users').all()) {
    if (emps.some((e) => e.user_id === u.id)) continue;
    const same = emps.find((e) => !e.user_id && String(e.name || '').trim().toLowerCase() === String(u.name || '').trim().toLowerCase());
    if (same) { db.prepare('UPDATE employees SET user_id=? WHERE id=?').run(u.id, same.id); same.user_id = u.id; }
    else { const r = db.prepare('INSERT INTO employees(name,salary,active,user_id,role) VALUES(?,?,?,?,?)').run(u.name, 0, u.active ? 1 : 0, u.id, ROLE_TITLE[u.role] || u.role); emps.push({ id: Number(r.lastInsertRowid), name: u.name, user_id: u.id }); }
  }
}
const isCreator = (actor) => !!actor && !!actor.creator;
const hasCreator = () => !!db.prepare('SELECT id FROM users WHERE creator=1').get();
/** An admin makes his own account the creator — once, only while there is no creator, and only with his own password. */
export function claimCreator(id, password) {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id); if (!u || u.role !== 'admin' || !u.active) throw bad('Only an admin can become the creator.');
  if (hasCreator()) throw bad('There is already a creator — there can only be one.');
  if (!checkHash(u, String(password || ''))) throw Object.assign(new Error('Wrong password.'), { status: 403 });
  db.prepare('UPDATE users SET creator=1 WHERE id=?').run(id); return getUser(id);
}
export function createUser(d, actor = null) {
  const wantsCreator = d.role === 'creator'; if (wantsCreator) d = { ...d, role: 'admin' };
  validate(d, true);
  if (wantsCreator && hasCreator()) throw bad('There is already a creator — there can only be one.');
  if (d.role === 'admin' && !wantsCreator && actor && !isCreator(actor) && hasCreator()) throw bad('Only the creator can make new admins.');
  if (db.prepare('SELECT id FROM users WHERE username=?').get(d.username)) throw bad('That username is already taken.');
  const salt = crypto.randomBytes(16).toString('hex');
  const r = db.prepare('INSERT INTO users(username,name,role,salt,hash,active,creator) VALUES(?,?,?,?,?,1,?)').run(d.username, d.name || d.username, d.role || 'worker', salt, hash(d.password, salt), wantsCreator ? 1 : 0);
  syncEmployees();
  return getUser(Number(r.lastInsertRowid));
}
export function updateUser(id, d, selfId, actor = null) {
  const cur = db.prepare('SELECT * FROM users WHERE id=?').get(id); if (!cur) throw Object.assign(new Error('User not found'), { status: 404 });
  if (d.role === 'creator') throw bad('The creator account is made once, when a new user is added.');
  validate(d, false);
  if (cur.creator) { // the creator: only he can edit his own name, password and shift; nobody changes his role or switches him off
    if (id !== selfId) throw bad('Only the creator can change the creator account.');
    if ((d.role !== undefined && d.role !== 'admin') || d.active === false || d.active === 0) throw bad('The creator cannot be demoted or deactivated.');
  } else if (actor && !isCreator(actor) && id !== selfId && cur.role === 'admin' && hasCreator()) throw bad('Only the creator can change an admin.');
  else if (actor && !isCreator(actor) && d.role === 'admin' && cur.role !== 'admin' && hasCreator()) throw bad('Only the creator can make someone an admin.');
  const role = d.role ?? cur.role; const active = d.active === undefined ? cur.active : d.active ? 1 : 0;
  if ((cur.role === 'admin' && cur.active) && (role !== 'admin' || !active) && activeAdmins(id) === 0) throw bad('There must be at least one active admin.');
  if (id === selfId && !active) throw bad('You cannot deactivate your own account.');
  if (d.username && d.username.toLowerCase() !== cur.username.toLowerCase() && db.prepare('SELECT id FROM users WHERE username=? AND id<>?').get(d.username, id)) throw bad('That username is already taken.');
  db.prepare('UPDATE users SET username=?, name=?, role=?, active=? WHERE id=?').run(d.username ?? cur.username, d.name ?? cur.name, role, active, id);
  db.prepare('UPDATE employees SET name=?, active=? WHERE user_id=?').run(d.name ?? cur.name, active, id); // the employee follows the login
  if ('perms' in d) db.prepare('UPDATE users SET perms=? WHERE id=?').run(d.perms && typeof d.perms === 'object' && role !== 'admin' ? JSON.stringify(cleanPerms(d.perms)) : null, id); // null = just follow the role
  if ('shift' in d) db.prepare('UPDATE users SET shift=? WHERE id=?').run(d.shift && typeof d.shift === 'object' ? JSON.stringify(cleanShift(d.shift)) : null, id); // null = the workshop's default hours
  if (d.password) { const salt = crypto.randomBytes(16).toString('hex'); db.prepare('UPDATE users SET salt=?, hash=? WHERE id=?').run(salt, hash(d.password, salt), id); }
  return getUser(id);
}
export function deleteUser(id, selfId, actor = null) {
  const cur = db.prepare('SELECT * FROM users WHERE id=?').get(id); if (!cur) return;
  if (cur.creator) throw bad('The creator account can never be deleted.');
  if (actor && !isCreator(actor) && cur.role === 'admin' && hasCreator()) throw bad('Only the creator can delete an admin.');
  if (id === selfId) throw bad('You cannot delete your own account.');
  if (cur.role === 'admin' && cur.active && activeAdmins(id) === 0) throw bad('There must be at least one active admin.');
  db.prepare('UPDATE employees SET user_id=NULL, active=0, left_date=COALESCE(left_date, date(\'now\')) WHERE user_id=?').run(id); // keep the employee and their pay history, but they have left
  db.prepare('DELETE FROM users WHERE id=?').run(id);
}
export function setOwnPassword(id, current, password) {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!checkHash(u, current)) throw Object.assign(new Error('Current password is wrong.'), { status: 401 });
  validate({ password }, false); if (!password) throw bad('Enter a new password.');
  const salt = crypto.randomBytes(16).toString('hex'); db.prepare('UPDATE users SET salt=?, hash=? WHERE id=?').run(salt, hash(password, salt), id);
}
const checkHash = (u, pw) => { if (!u || typeof pw !== 'string') return false; const x = Buffer.from(hash(pw, u.salt), 'hex'); const y = Buffer.from(u.hash, 'hex'); return x.length === y.length && crypto.timingSafeEqual(x, y); };
/** Returns the public user, or null for a wrong username/password or a deactivated account. */
export function authenticate(username, password) {
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(username || ''));
  return u && u.active && checkHash(u, password) ? pub(u) : null;
}

const sign = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('hex');
/** A customer's pass to one order's portal page (a different cookie and a different kind of token from staff sign-in). */
export function makePortalToken(orderId, days = 30) { const p = `p${orderId}.${Date.now() + days * 864e5}`; return `${p}.${sign(p)}`; }
export function portalOrderId(tok) {
  if (!tok) return 0; const [pid, exp, sig] = tok.split('.'); if (!/^p\d+$/.test(pid || '') || !exp || !sig || Number(exp) < Date.now()) return 0;
  const good = Buffer.from(sign(`${pid}.${exp}`)); const got = Buffer.from(sig); if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return 0; return Number(pid.slice(1));
}
export function makeToken(uid, days = 30) { const p = `${uid}.${Date.now() + days * 864e5}`; return `${p}.${sign(p)}`; }
/** The signed-in user (re-read from the database, so role changes and deactivation apply at once), or null. */
export function userFromToken(tok) {
  if (!tok) return null;
  const [uid, exp, sig] = tok.split('.');
  if (!uid || !exp || !sig || Number(exp) < Date.now()) return null;
  const good = Buffer.from(sign(`${uid}.${exp}`)); const got = Buffer.from(sig);
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return null;
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(uid));
  return u && u.active ? pub(u) : null;
}
export const cookieOf = (req, name) => (req.headers.cookie || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1];

/** True when `password` is the signed-in person's own password (used to confirm sensitive changes). */
export const verifyOwnPassword = (id, password) => checkHash(db.prepare('SELECT * FROM users WHERE id=?').get(id), password);
