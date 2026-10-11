import crypto from 'node:crypto';
import { getSetting, setSetting } from './db.js';

const secret = () => {
  let s = getSetting('session_secret');
  if (!s) { s = crypto.randomBytes(32).toString('hex'); setSetting('session_secret', s); }
  return s;
};
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');

export const hasPassword = () => !!getSetting('auth');

export function setPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  setSetting('auth', { salt, hash: hash(pw, salt) });
}
export function checkPassword(pw) {
  const a = getSetting('auth');
  if (!a || typeof pw !== 'string') return false;
  const x = Buffer.from(hash(pw, a.salt), 'hex');
  const y = Buffer.from(a.hash, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const sign = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('hex');
export function makeToken(days = 30) {
  const exp = String(Date.now() + days * 864e5);
  return `${exp}.${sign(exp)}`;
}
export function validToken(tok) {
  if (!tok) return false;
  const [exp, sig] = tok.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = Buffer.from(sign(exp));
  const got = Buffer.from(sig);
  return good.length === got.length && crypto.timingSafeEqual(good, got);
}
export const cookieOf = (req, name) => (req.headers.cookie || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1];
