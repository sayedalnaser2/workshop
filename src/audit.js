// Audit trail: who changed what and when. Written by the API for every create / change / delete of business data.
import { db, SCHEMA } from './db.js';

const SKIP = new Set(['task_logs', 'task_sessions']); // high-volume, already kept as the task timeline
const LABEL_KEYS = ['number', 'inv', 'no', 'po', 'name', 'title', 'client', 'paid_to', 'supplier', 'code'];
const short = (v) => { if (v == null || v === '') return ''; if (typeof v === 'object') return Array.isArray(v) ? `${v.length} line(s)` : '(changed)'; const s = String(v); return s.length > 80 ? s.slice(0, 77) + '…' : s; };

export const labelOf = (row) => { for (const k of LABEL_KEYS) if (row?.[k]) return String(row[k]).slice(0, 80); return row?.id ? `#${row.id}` : ''; };

/** Fields whose value differs between two row versions. */
export function diff(table, before, after) {
  const out = [];
  for (const k of Object.keys(SCHEMA[table].cols)) {
    if (!(k in after)) continue;
    const a = before?.[k] ?? null; const b = after[k] ?? null;
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if ((a === null || a === '') && (b === null || b === '')) continue;
    out.push({ f: k, from: short(a), to: short(b) });
  }
  return out;
}

/** The few fields worth showing for a new or deleted row. */
export const notable = (row) => ['date', 'client', 'supplier', 'paid_to', 'amount', 'total', 'qty', 'discount', 'status', 'kind', 'order_inv'].filter((k) => row?.[k] != null && row[k] !== '' && typeof row[k] !== 'object').slice(0, 5).map((k) => ({ f: k, from: '', to: String(row[k]) }));

export function audit(user, table, rowId, action, label, changes = null) {
  if (SKIP.has(table)) return;
  try {
    db.prepare('INSERT INTO audit_log(user_id,user_name,tbl,row_id,label,action,changes) VALUES(?,?,?,?,?,?,?)')
      .run(user?.id ?? null, user?.name ?? '', table, rowId ?? null, label || '', action, changes && changes.length ? JSON.stringify(changes.slice(0, 40)) : null);
  } catch (e) { console.error('audit failed:', e.message); }
}

export function listAudit({ table = '', user = 0, from = '', to = '', q = '', limit = 100, offset = 0 } = {}) {
  const where = []; const args = [];
  if (table) { where.push('tbl=?'); args.push(table); }
  if (user) { where.push('user_id=?'); args.push(user); }
  if (from) { where.push('ts>=?'); args.push(from); }
  if (to) { where.push('ts<?'); args.push(to + ' 99'); }
  if (q) { where.push('(label LIKE ? OR changes LIKE ? OR user_name LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM audit_log ${w}`).get(...args).n;
  const rows = db.prepare(`SELECT * FROM audit_log ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, Math.min(500, limit), offset).map((r) => ({ ...r, changes: r.changes ? JSON.parse(r.changes) : [] }));
  const tables = db.prepare('SELECT DISTINCT tbl FROM audit_log ORDER BY tbl').all().map((r) => r.tbl);
  return { total, rows, tables };
}
