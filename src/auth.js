import crypto from 'node:crypto';
import { db, getSetting, setSetting } from './db.js';
import { ROLES } from '../public/js/perm.js';

const secret = () => {
  let s = getSetting('session_secret');
  if (!s) { s = crypto.randomBytes(32).toString('hex'); setSetting('session_secret', s); }
  return s;
};
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const pub = (u) => (u ? { id: u.id, username: u.username, name: u.name, role: u.role, active: u.active ? 1 : 0, created_at: u.created_at } : null);

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
const activeAdmins = (exceptId = 0) => db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1 AND id<>?").get(exceptId).n;

export function createUser(d) {
  validate(d, true);
  if (db.prepare('SELECT id FROM users WHERE username=?').get(d.username)) throw bad('That username is already taken.');
  const salt = crypto.randomBytes(16).toString('hex');
  const r = db.prepare('INSERT INTO users(username,name,role,salt,hash,active) VALUES(?,?,?,?,?,1)').run(d.username, d.name || d.username, d.role || 'worker', salt, hash(d.password, salt));
  return getUser(Number(r.lastInsertRowid));
}
export function updateUser(id, d, selfId) {
  const cur = db.prepare('SELECT * FROM users WHERE id=?').get(id); if (!cur) throw Object.assign(new Error('User not found'), { status: 404 });
  validate(d, false);
  const role = d.role ?? cur.role; const active = d.active === undefined ? cur.active : d.active ? 1 : 0;
  if ((cur.role === 'admin' && cur.active) && (role !== 'admin' || !active) && activeAdmins(id) === 0) throw bad('There must be at least one active admin.');
  if (id === selfId && !active) throw bad('You cannot deactivate your own account.');
  if (d.username && d.username.toLowerCase() !== cur.username.toLowerCase() && db.prepare('SELECT id FROM users WHERE username=? AND id<>?').get(d.username, id)) throw bad('That username is already taken.');
  db.prepare('UPDATE users SET username=?, name=?, role=?, active=? WHERE id=?').run(d.username ?? cur.username, d.name ?? cur.name, role, active, id);
  if (d.password) { const salt = crypto.randomBytes(16).toString('hex'); db.prepare('UPDATE users SET salt=?, hash=? WHERE id=?').run(salt, hash(d.password, salt), id); }
  return getUser(id);
}
export function deleteUser(id, selfId) {
  const cur = db.prepare('SELECT * FROM users WHERE id=?').get(id); if (!cur) return;
  if (id === selfId) throw bad('You cannot delete your own account.');
  if (cur.role === 'admin' && cur.active && activeAdmins(id) === 0) throw bad('There must be at least one active admin.');
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
