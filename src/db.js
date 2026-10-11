import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const dir = process.env.DATA_DIR || path.resolve('data');
mkdirSync(dir, { recursive: true });
export const db = new DatabaseSync(path.join(dir, 'workshop.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// Column definitions per table. `json: true` columns are stored as JSON text.
export const SCHEMA = {
  price_items: { cols: { name: 'TEXT', rate: 'REAL', type: 'TEXT', unit: 'TEXT', note: 'TEXT', model_id: 'INTEGER', sort: 'INTEGER' }, order: 'sort, id' },
  quotes: {
    cols: { number: 'TEXT', date: 'TEXT', client: 'TEXT', mobile: 'TEXT', site: 'TEXT', title: 'TEXT', items: 'JSON', discount: 'REAL', vat_rate: 'REAL', vat_waived: 'REAL', status: 'TEXT', prepared_by: 'TEXT', notes: 'TEXT', order_inv: 'TEXT' },
    order: 'date DESC, id DESC',
  },
  orders: { cols: { inv: 'TEXT', date: 'TEXT', client: 'TEXT', site: 'TEXT', mobile: 'TEXT', amount: 'REAL', done: 'INTEGER', quote_no: 'TEXT', note: 'TEXT' }, order: 'date DESC, id DESC' },
  receipts: { cols: { no: 'TEXT', date: 'TEXT', order_inv: 'TEXT', client: 'TEXT', amount: 'REAL', method: 'TEXT', note: 'TEXT' }, order: 'date DESC, id DESC' },
  payments: { cols: { no: 'TEXT', date: 'TEXT', paid_to: 'TEXT', amount: 'REAL', done: 'INTEGER', category: 'TEXT', lines: 'JSON', note: 'TEXT' }, order: 'date DESC, id DESC' },
  purchases: { cols: { date: 'TEXT', pv: 'TEXT', invoice: 'TEXT', supplier: 'TEXT', amount: 'REAL', order_inv: 'TEXT', note: 'TEXT' }, order: 'date DESC, id DESC' },
  employees: { cols: { name: 'TEXT', salary: 'REAL', active: 'INTEGER', note: 'TEXT' }, order: 'name' },
  profiles: { cols: { code: 'TEXT', name: 'TEXT', series: 'TEXT', bar_length: 'REAL', price_bar: 'REAL', weight_m: 'REAL', color: 'TEXT' }, order: 'series, name' },
  accessories: { cols: { code: 'TEXT', name: 'TEXT', unit: 'TEXT', price: 'REAL' }, order: 'name' },
  glass_types: { cols: { name: 'TEXT', price_m2: 'REAL', thickness: 'TEXT' }, order: 'name' },
  models: { cols: { name: 'TEXT', series: 'TEXT', kind: 'TEXT', category: 'TEXT', def_w: 'REAL', def_h: 'REAL', spec: 'JSON', note: 'TEXT' }, order: 'category, name' },
};

const ddl = [];
for (const [t, s] of Object.entries(SCHEMA)) {
  const cols = Object.entries(s.cols).map(([c, ty]) => `${c} ${ty === 'JSON' ? 'TEXT' : ty}`).join(', ');
  ddl.push(`CREATE TABLE IF NOT EXISTS ${t} (id INTEGER PRIMARY KEY AUTOINCREMENT, ${cols}, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
}
ddl.push('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);');
ddl.push('CREATE INDEX IF NOT EXISTS ix_receipts_order ON receipts(order_inv);');
ddl.push('CREATE INDEX IF NOT EXISTS ix_purchases_order ON purchases(order_inv);');
ddl.push('CREATE INDEX IF NOT EXISTS ix_orders_inv ON orders(inv);');
db.exec(ddl.join('\n'));

export const getSetting = (k, d = null) => {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
  if (!r) return d;
  try { return JSON.parse(r.value); } catch { return r.value; }
};
export const setSetting = (k, v) =>
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v));

export const DEFAULT_SETTINGS = {
  company: {
    name: 'TALENTS Fabrication & Aluminium',
    name_ar: 'المواهب للفبركة والالمنيوم',
    cr: '',
    email: 'talentsaluminum@gmail.com',
    phones: '+973 3664 55 48 | +973 3616 33 11',
    address: '',
    currency: 'BD',
  },
  vat_rate: 10,
  counters: { quote: 1, invoice: 1, receipt: 1, payment: 1 },
  terms: [
    '- Our delivery time will be within 30 days after our final measurement.',
    '- Payment 50% on acceptance this quotation, 25% while stages working & 25% before fixing on the site.',
    '- Our company has the legal right to take back the supplied materials if the customer fails to pay full amount in the delivery time.',
    '- This quotation is valid upto 14 days.',
  ],
  receipt_notes: [
    '- In the event of payment by Check, please use the following Name in pay to "TALENTS ALUMINIUM".',
    '- In the event of payment by Benefit App, please send a copy of the transaction via WhatsApp to +973 36645548.',
  ],
  bar_kerf: 0.5,
  intro_line: 'Fabrication of aluminium with all accessories',
};
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) if (getSetting(k) === null) setSetting(k, v);

const pad = (n, w = 3) => String(n).padStart(w, '0');
const ym = (date) => {
  const d = date ? new Date(date) : new Date();
  return String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1, 2);
};

/** Peek or allocate the next document number. kind: quote | invoice | receipt | payment */
export function nextNumber(kind, date, consume = false) {
  const c = getSetting('counters');
  const n = c[kind] || 1;
  if (consume) { c[kind] = n + 1; setSetting('counters', c); }
  switch (kind) {
    case 'quote': return `Q${ym(date)}${pad(n)}`;
    case 'invoice': return `I${ym(date)}${pad(n)}`;
    case 'receipt': return `R ${pad(n)}`;
    case 'payment': return `P ${pad(n)}`;
  }
  throw new Error('bad kind');
}

const enc = (t, row) => {
  const out = {};
  for (const [c, ty] of Object.entries(SCHEMA[t].cols)) {
    if (!(c in row)) continue;
    out[c] = ty === 'JSON' ? JSON.stringify(row[c] ?? null) : row[c] === '' ? null : row[c];
  }
  return out;
};
const dec = (t, r) => {
  if (!r) return r;
  for (const [c, ty] of Object.entries(SCHEMA[t].cols)) if (ty === 'JSON' && typeof r[c] === 'string') { try { r[c] = JSON.parse(r[c]); } catch { r[c] = null; } }
  return r;
};

export function insertRow(t, row) {
  const e = enc(t, row);
  const keys = Object.keys(e);
  const info = db.prepare(`INSERT INTO ${t}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...Object.values(e));
  return getRow(t, Number(info.lastInsertRowid));
}
export function updateRow(t, id, row) {
  const e = enc(t, row);
  const keys = Object.keys(e);
  if (keys.length) db.prepare(`UPDATE ${t} SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`).run(...Object.values(e), id);
  return getRow(t, id);
}
export const getRow = (t, id) => dec(t, db.prepare(`SELECT * FROM ${t} WHERE id=?`).get(id));
export const deleteRow = (t, id) => db.prepare(`DELETE FROM ${t} WHERE id=?`).run(id);
export const listRows = (t) => db.prepare(`SELECT * FROM ${t} ORDER BY ${SCHEMA[t].order}`).all().map((r) => dec(t, r));
export const tx = (fn) => {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
};
