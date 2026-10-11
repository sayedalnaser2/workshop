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
    cols: { number: 'TEXT', date: 'TEXT', client: 'TEXT', mobile: 'TEXT', site: 'TEXT', title: 'TEXT', items: 'JSON', discount: 'REAL', vat_rate: 'REAL', vat_waived: 'REAL', status: 'TEXT', prepared_by: 'TEXT', notes: 'TEXT', order_inv: 'TEXT', colour: 'TEXT' },
    order: 'date DESC, id DESC',
  },
  orders: { cols: { inv: 'TEXT', date: 'TEXT', client: 'TEXT', site: 'TEXT', mobile: 'TEXT', amount: 'REAL', done: 'INTEGER', quote_no: 'TEXT', note: 'TEXT' }, order: 'date DESC, id DESC' },
  receipts: { cols: { no: 'TEXT', date: 'TEXT', order_inv: 'TEXT', client: 'TEXT', amount: 'REAL', method: 'TEXT', note: 'TEXT', account: 'TEXT' }, order: 'date DESC, id DESC' },
  payments: { cols: { no: 'TEXT', date: 'TEXT', paid_to: 'TEXT', amount: 'REAL', done: 'INTEGER', category: 'TEXT', lines: 'JSON', note: 'TEXT', account: 'TEXT', employee_id: 'INTEGER' }, order: 'date DESC, id DESC' },
  purchases: { cols: { date: 'TEXT', pv: 'TEXT', invoice: 'TEXT', supplier: 'TEXT', amount: 'REAL', order_inv: 'TEXT', note: 'TEXT' }, order: 'date DESC, id DESC' },
  employees: { cols: { name: 'TEXT', salary: 'REAL', active: 'INTEGER', note: 'TEXT', role: 'TEXT', nationality: 'TEXT', id_no: 'TEXT', passport_no: 'TEXT', phone: 'TEXT', join_date: 'TEXT', left_date: 'TEXT', permit_expiry: 'TEXT', iban: 'TEXT', emergency: 'TEXT', address: 'TEXT' }, order: 'name' },
  profiles: { cols: { code: 'TEXT', name: 'TEXT', series: 'TEXT', bar_length: 'REAL', price_bar: 'REAL', weight_m: 'REAL', color: 'TEXT' }, order: 'series, name' },
  accessories: { cols: { code: 'TEXT', name: 'TEXT', unit: 'TEXT', price: 'REAL' }, order: 'name' },
  glass_types: { cols: { name: 'TEXT', price_m2: 'REAL', thickness: 'TEXT' }, order: 'name' },
  models: { cols: { name: 'TEXT', series: 'TEXT', kind: 'TEXT', category: 'TEXT', def_w: 'REAL', def_h: 'REAL', spec: 'JSON', note: 'TEXT' }, order: 'category, name' },
  suppliers: { cols: { name: 'TEXT', phone: 'TEXT', phone2: 'TEXT', address: 'TEXT', email: 'TEXT', note: 'TEXT' }, order: 'name' },
  items: { cols: { code: 'TEXT', name: 'TEXT', kind: 'TEXT', series: 'TEXT', supplier: 'TEXT', unit: 'TEXT', price: 'REAL', profile_id: 'INTEGER', glass_id: 'INTEGER', accessory_id: 'INTEGER', note: 'TEXT' }, order: 'kind, series, code' },
  stock: { cols: { kind: 'TEXT', item_type: 'TEXT', profile_id: 'INTEGER', glass_id: 'INTEGER', name: 'TEXT', code: 'TEXT', colour: 'TEXT', length: 'REAL', width: 'REAL', qty: 'REAL', unit: 'TEXT', unit_cost: 'REAL', location: 'TEXT', reserved_for: 'TEXT', order_inv: 'TEXT', date: 'TEXT', note: 'TEXT' }, order: 'kind, name, colour, length DESC' },
  purchase_orders: { cols: { po: 'TEXT', date: 'TEXT', supplier: 'TEXT', order_inv: 'TEXT', quote_no: 'TEXT', status: 'TEXT', lines: 'JSON', total: 'REAL', note: 'TEXT' }, order: 'date DESC, id DESC' },
  cash_entries: { cols: { date: 'TEXT', account: 'TEXT', direction: 'TEXT', amount: 'REAL', category: 'TEXT', party: 'TEXT', note: 'TEXT' }, order: 'date DESC, id DESC' },
  employee_events: { cols: { employee_id: 'INTEGER', date: 'TEXT', type: 'TEXT', amount: 'REAL', note: 'TEXT' }, order: 'date DESC, id DESC' },
  attendance: { cols: { employee_id: 'INTEGER', date: 'TEXT', status: 'TEXT', hours: 'REAL', site: 'TEXT', note: 'TEXT' }, order: 'date' },
  employee_docs: { cols: { employee_id: 'INTEGER', type: 'TEXT', number: 'TEXT', expiry: 'TEXT', file_name: 'TEXT', file_path: 'TEXT', note: 'TEXT' }, order: 'expiry' },
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
// add columns introduced after a database was first created
for (const [t, sc] of Object.entries(SCHEMA)) {
  const have = new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name));
  for (const [c, ty] of Object.entries(sc.cols)) if (!have.has(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${ty === 'JSON' ? 'TEXT' : ty}`);
}
db.exec('CREATE INDEX IF NOT EXISTS ix_stock_profile ON stock(profile_id, kind); CREATE INDEX IF NOT EXISTS ix_att ON attendance(employee_id, date); CREATE INDEX IF NOT EXISTS ix_ev ON employee_events(employee_id);');

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
  counters: { quote: 1, invoice: 1, receipt: 1, payment: 1, po: 1 },
  colours: ['White', 'Brown', 'Black', 'Bronze', 'Silver', 'Wood', 'Grey'],
  opening: { cash: 0, bank: 0 },
  leftover_pct: 60,
  min_offcut: 30,
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
    case 'po': return `PO${ym(date)}${pad(n)}`;
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
