import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const dir = process.env.DATA_DIR || path.resolve('data');
mkdirSync(dir, { recursive: true });
export const db = new DatabaseSync(path.join(dir, 'workshop.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -20000; PRAGMA mmap_size = 134217728; PRAGMA busy_timeout = 5000;');

// Re-use compiled statements: the API runs the same few queries thousands of times.
{
  const compile = db.prepare.bind(db); const cache = new Map();
  db.prepare = (sql) => {
    let st = cache.get(sql);
    if (!st) { if (cache.size > 400) cache.clear(); st = compile(sql); cache.set(sql, st); }
    return st;
  };
}

// Column definitions per table. `json: true` columns are stored as JSON text.
export const SCHEMA = {
  price_items: { cols: { name: 'TEXT', rate: 'REAL', type: 'TEXT', unit: 'TEXT', note: 'TEXT', model_id: 'INTEGER', sort: 'INTEGER', vat: 'INTEGER' }, order: 'sort, id' },
  quotes: {
    cols: { number: 'TEXT', date: 'TEXT', client: 'TEXT', mobile: 'TEXT', site: 'TEXT', gps: 'TEXT', customer_id: 'INTEGER', title: 'TEXT', items: 'JSON', discount: 'REAL', vat_rate: 'REAL', vat_waived: 'REAL', status: 'TEXT', prepared_by: 'TEXT', notes: 'TEXT', order_inv: 'TEXT', colour: 'TEXT', client_vat: 'TEXT', disc_mode: 'TEXT', approval: 'TEXT', approved_disc: 'REAL', approval_note: 'TEXT' },
    order: 'date DESC, id DESC',
  },
  orders: { cols: { inv: 'TEXT', date: 'TEXT', client: 'TEXT', site: 'TEXT', gps: 'TEXT', customer_id: 'INTEGER', mobile: 'TEXT', amount: 'REAL', done: 'INTEGER', quote_no: 'TEXT', note: 'TEXT', vat: 'REAL', client_vat: 'TEXT' }, order: 'date DESC, id DESC' },
  receipts: { cols: { no: 'TEXT', date: 'TEXT', order_inv: 'TEXT', client: 'TEXT', amount: 'REAL', method: 'TEXT', ref: 'TEXT', note: 'TEXT', account: 'TEXT' }, order: 'date DESC, id DESC' },
  payments: { cols: { no: 'TEXT', date: 'TEXT', paid_to: 'TEXT', amount: 'REAL', done: 'INTEGER', category: 'TEXT', lines: 'JSON', note: 'TEXT', account: 'TEXT', employee_id: 'INTEGER', method: 'TEXT', ref: 'TEXT' }, order: 'date DESC, id DESC' },
  purchases: { cols: { date: 'TEXT', pv: 'TEXT', invoice: 'TEXT', supplier: 'TEXT', amount: 'REAL', order_inv: 'TEXT', note: 'TEXT', vat: 'REAL', hidden: 'INTEGER' }, order: 'date DESC, id DESC' },
  employees: { cols: { name: 'TEXT', salary: 'REAL', active: 'INTEGER', note: 'TEXT', user_id: 'INTEGER', role: 'TEXT', nationality: 'TEXT', id_no: 'TEXT', passport_no: 'TEXT', phone: 'TEXT', join_date: 'TEXT', left_date: 'TEXT', permit_expiry: 'TEXT', iban: 'TEXT', emergency: 'TEXT', address: 'TEXT' }, order: 'name' },
  profiles: { cols: { code: 'TEXT', name: 'TEXT', series: 'TEXT', bar_length: 'REAL', price_bar: 'REAL', weight_m: 'REAL', color: 'TEXT', min_qty: 'REAL' }, order: 'series, name' },
  accessories: { cols: { code: 'TEXT', name: 'TEXT', unit: 'TEXT', price: 'REAL', min_qty: 'REAL' }, order: 'name' },
  glass_types: { cols: { name: 'TEXT', price_m2: 'REAL', thickness: 'TEXT', min_qty: 'REAL' }, order: 'name' },
  models: { cols: { name: 'TEXT', series: 'TEXT', kind: 'TEXT', category: 'TEXT', def_w: 'REAL', def_h: 'REAL', spec: 'JSON', note: 'TEXT' }, order: 'category, name' },
  suppliers: { cols: { name: 'TEXT', phone: 'TEXT', phone2: 'TEXT', address: 'TEXT', email: 'TEXT', note: 'TEXT' }, order: 'name' },
  items: { cols: { code: 'TEXT', name: 'TEXT', kind: 'TEXT', series: 'TEXT', supplier: 'TEXT', unit: 'TEXT', price: 'REAL', profile_id: 'INTEGER', glass_id: 'INTEGER', accessory_id: 'INTEGER', note: 'TEXT' }, order: 'kind, series, code' },
  stock: { cols: { kind: 'TEXT', item_type: 'TEXT', profile_id: 'INTEGER', glass_id: 'INTEGER', name: 'TEXT', code: 'TEXT', colour: 'TEXT', length: 'REAL', width: 'REAL', qty: 'REAL', unit: 'TEXT', unit_cost: 'REAL', location: 'TEXT', reserved_for: 'TEXT', order_inv: 'TEXT', date: 'TEXT', note: 'TEXT' }, order: 'kind, name, colour, length DESC' },
  purchase_orders: { cols: { po: 'TEXT', date: 'TEXT', supplier: 'TEXT', order_inv: 'TEXT', quote_no: 'TEXT', status: 'TEXT', lines: 'JSON', total: 'REAL', note: 'TEXT', paid: 'INTEGER', paid_date: 'TEXT', paid_method: 'TEXT', paid_ref: 'TEXT', paid_no: 'TEXT', pay_log: 'JSON' }, order: 'date DESC, id DESC' },
  cash_entries: { cols: { date: 'TEXT', account: 'TEXT', direction: 'TEXT', amount: 'REAL', category: 'TEXT', party: 'TEXT', note: 'TEXT' }, order: 'date DESC, id DESC' },
  employee_events: { cols: { employee_id: 'INTEGER', date: 'TEXT', type: 'TEXT', amount: 'REAL', note: 'TEXT' }, order: 'date DESC, id DESC' },
  attendance: { cols: { employee_id: 'INTEGER', date: 'TEXT', status: 'TEXT', hours: 'REAL', site: 'TEXT', note: 'TEXT' }, order: 'date' },
  kitchens: { cols: { name: 'TEXT', client: 'TEXT', customer_id: 'INTEGER', order_inv: 'TEXT', quote_no: 'TEXT', status: 'TEXT', spec: 'JSON', notes: 'TEXT' }, order: 'id DESC' },
  kitchen_options: { cols: { kind: 'TEXT', name: 'TEXT', price: 'REAL', unit: 'TEXT', meta: 'JSON', note: 'TEXT', sort: 'INTEGER' }, order: 'kind, sort, name' },
  tasks: { cols: { order_inv: 'TEXT', quote_no: 'TEXT', title: 'TEXT', description: 'TEXT', stage: 'TEXT', assignee_id: 'INTEGER', team: 'JSON', hidden: 'INTEGER', needs_helper: 'INTEGER', helper_note: 'TEXT', status: 'TEXT', progress: 'REAL', estimate_min: 'REAL', due: 'TEXT', priority: 'TEXT', created_by: 'INTEGER', started_at: 'TEXT', done_at: 'TEXT', note: 'TEXT' }, order: 'id DESC' },
  task_logs: { cols: { task_id: 'INTEGER', user_id: 'INTEGER', user_name: 'TEXT', ts: 'TEXT', kind: 'TEXT', text: 'TEXT', progress: 'REAL', minutes: 'REAL' }, order: 'ts DESC' },
  task_sessions: { cols: { task_id: 'INTEGER', user_id: 'INTEGER', user_name: 'TEXT', started: 'TEXT', ended: 'TEXT', kind: 'TEXT' }, order: 'started DESC' },
  employee_docs: { cols: { employee_id: 'INTEGER', type: 'TEXT', number: 'TEXT', expiry: 'TEXT', file_name: 'TEXT', file_path: 'TEXT', note: 'TEXT' }, order: 'expiry' },
  customers: { cols: { code: 'TEXT', name: 'TEXT', mobile: 'TEXT', mobile2: 'TEXT', email: 'TEXT', address: 'TEXT', gps: 'TEXT', locations: 'JSON', vat_no: 'TEXT', note: 'TEXT', active: 'INTEGER' }, order: 'id DESC' },
  customer_credits: { cols: { client: 'TEXT', mobile: 'TEXT', amount: 'REAL', used: 'REAL', date: 'TEXT', expires: 'TEXT', order_inv: 'TEXT', note: 'TEXT', status: 'TEXT', log: 'JSON' }, order: 'date DESC, id DESC' },
  credit_notes: { cols: { no: 'TEXT', date: 'TEXT', order_inv: 'TEXT', client: 'TEXT', client_vat: 'TEXT', lines: 'JSON', vat_rate: 'REAL', net: 'REAL', vat: 'REAL', total: 'REAL', reason: 'TEXT', status: 'TEXT', requested_by: 'TEXT', approval_note: 'TEXT' }, order: 'date DESC, id DESC' },
  events: { cols: { date: 'TEXT', end_date: 'TEXT', start: 'TEXT', end: 'TEXT', kind: 'TEXT', title: 'TEXT', order_inv: 'TEXT', quote_no: 'TEXT', client: 'TEXT', site: 'TEXT', mobile: 'TEXT', team: 'JSON', status: 'TEXT', note: 'TEXT' }, order: 'date, start' },
  surveys: { cols: { date: 'TEXT', client: 'TEXT', mobile: 'TEXT', site: 'TEXT', gps: 'TEXT', customer_id: 'INTEGER', status: 'TEXT', items: 'JSON', notes: 'TEXT', quote_no: 'TEXT', surveyor: 'TEXT' }, order: 'date DESC, id DESC' },
  overtime: { cols: { user_id: 'INTEGER', user_name: 'TEXT', day: 'TEXT', started: 'TEXT', ended: 'TEXT', minutes: 'REAL', task_id: 'INTEGER', note: 'TEXT', status: 'TEXT', kind: 'TEXT' }, order: 'day DESC, id DESC' },
  targets: { cols: { name: 'TEXT', metric: 'TEXT', period: 'TEXT', goal: 'REAL', prize: 'TEXT', prize_amount: 'REAL', user_id: 'INTEGER', active: 'INTEGER', note: 'TEXT' }, order: 'id' },
  target_awards: { cols: { target_id: 'INTEGER', user_id: 'INTEGER', period_key: 'TEXT', awarded_on: 'TEXT', note: 'TEXT' }, order: 'id DESC' },
  accounts: { cols: { code: 'TEXT', name: 'TEXT', type: 'TEXT', parent_id: 'INTEGER', sys: 'TEXT', note: 'TEXT', active: 'INTEGER' }, order: 'code' },
  bank_accounts: { cols: { key: 'TEXT', name: 'TEXT', bank: 'TEXT', number: 'TEXT', opening: 'REAL', print: 'INTEGER', active: 'INTEGER', note: 'TEXT', coa_id: 'INTEGER', sort: 'INTEGER' }, order: 'sort, id' },
  journals: { cols: { no: 'TEXT', date: 'TEXT', description: 'TEXT', lines: 'JSON', note: 'TEXT' }, order: 'date DESC, id DESC' },
  notes: { cols: { text: 'TEXT', color: 'TEXT', done: 'INTEGER', pinned: 'INTEGER', audience: 'TEXT', author: 'TEXT', author_id: 'INTEGER' }, order: 'pinned DESC, id DESC' },
  attachments: { cols: { ref_type: 'TEXT', ref_key: 'TEXT', tag: 'TEXT', kind: 'TEXT', file_name: 'TEXT', file_path: 'TEXT', mime: 'TEXT', note: 'TEXT', user_name: 'TEXT', size: 'INTEGER' }, order: 'id' },
};

const ddl = [];
for (const [t, s] of Object.entries(SCHEMA)) {
  const cols = Object.entries(s.cols).map(([c, ty]) => `${c} ${ty === 'JSON' ? 'TEXT' : ty}`).join(', ');
  ddl.push(`CREATE TABLE IF NOT EXISTS ${t} (id INTEGER PRIMARY KEY AUTOINCREMENT, ${cols}, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
}
ddl.push('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);');
ddl.push('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE COLLATE NOCASE, name TEXT, role TEXT, salt TEXT, hash TEXT, active INTEGER DEFAULT 1, shift TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);');
ddl.push('CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT CURRENT_TIMESTAMP, user_id INTEGER, user_name TEXT, tbl TEXT, row_id INTEGER, label TEXT, action TEXT, changes TEXT);');
ddl.push('CREATE TABLE IF NOT EXISTS work_days (user_id INTEGER, day TEXT, first_seen TEXT, PRIMARY KEY (user_id, day));');
ddl.push('CREATE INDEX IF NOT EXISTS ix_receipts_order ON receipts(order_inv);');
ddl.push('CREATE INDEX IF NOT EXISTS ix_purchases_order ON purchases(order_inv);');
ddl.push('CREATE INDEX IF NOT EXISTS ix_orders_inv ON orders(inv);');
db.exec(ddl.join('\n'));
// older databases: users gained a personal shift
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'shift')) db.exec('ALTER TABLE users ADD COLUMN shift TEXT');
// … and personal permissions on top of the role
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'perms')) db.exec('ALTER TABLE users ADD COLUMN perms TEXT');
// add columns introduced after a database was first created
for (const [t, sc] of Object.entries(SCHEMA)) {
  const have = new Set(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name));
  for (const [c, ty] of Object.entries(sc.cols)) if (!have.has(c)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${ty === 'JSON' ? 'TEXT' : ty}`);
}
db.exec(`CREATE INDEX IF NOT EXISTS ix_receipts_date ON receipts(date); CREATE INDEX IF NOT EXISTS ix_purchases_date ON purchases(date); CREATE INDEX IF NOT EXISTS ix_orders_date ON orders(date);
  CREATE INDEX IF NOT EXISTS ix_payments_date ON payments(date); CREATE INDEX IF NOT EXISTS ix_quotes_date ON quotes(date); CREATE INDEX IF NOT EXISTS ix_tasks_status ON tasks(status, hidden);
  CREATE INDEX IF NOT EXISTS ix_tasks_order ON tasks(order_inv); CREATE INDEX IF NOT EXISTS ix_sess_open ON task_sessions(ended, user_id); CREATE INDEX IF NOT EXISTS ix_tl_ts ON task_logs(ts);`);
db.exec('CREATE INDEX IF NOT EXISTS ix_audit_ts ON audit_log(ts); CREATE INDEX IF NOT EXISTS ix_audit_tbl ON audit_log(tbl, row_id); CREATE INDEX IF NOT EXISTS ix_att_ref ON attachments(ref_type, ref_key); CREATE INDEX IF NOT EXISTS ix_ev_date ON events(date); CREATE INDEX IF NOT EXISTS ix_cn_order ON credit_notes(order_inv);');
db.exec('CREATE INDEX IF NOT EXISTS ix_stock_profile ON stock(profile_id, kind); CREATE INDEX IF NOT EXISTS ix_tl ON task_logs(task_id); CREATE INDEX IF NOT EXISTS ix_ts ON task_sessions(task_id, user_id); CREATE INDEX IF NOT EXISTS ix_att ON attendance(employee_id, date); CREATE INDEX IF NOT EXISTS ix_ev ON employee_events(employee_id);');

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
    vat_no: '',
    bank: '',
  },
  vat_rate: 10,
  counters: { quote: 1, invoice: 1, receipt: 1, payment: 1, po: 1, credit: 1, journal: 1 },
  approvals: { discount_pct: 10, credit_notes: true },
  purchase_vat_default: false,
  colours: ['White', 'Brown', 'Black', 'Bronze', 'Silver', 'Wood', 'Grey'],
  opening: { cash: 0, bank: 0 },
  leftover_pct: 60,
  min_offcut: 30,
  shift: { start: '07:00', end: '16:00', breaks: [{ from: '12:00', to: '12:30' }], days: [0, 1, 2, 3, 4, 6], tz: 180 },
  task_templates: [{ stage: 'Cutting', title: 'Cut profiles & glass', minutes: 120 }, { stage: 'Assembly', title: 'Assemble frames & fit glass', minutes: 240 }, { stage: 'Delivery', title: 'Deliver to site', minutes: 60 }, { stage: 'Installation', title: 'Install on site', minutes: 300 }],
  task_stages: ['Cutting', 'Assembly', 'Glazing', 'Painting', 'Delivery', 'Installation', 'Maintenance', 'Other'],
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
  locations: ['Living room', 'Majlis', 'Dining room', 'Master bedroom', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Maid room', 'Kitchen', 'Bathroom', 'Main entrance', 'Balcony', 'Staircase', 'Laundry', 'Store room', 'Garage', 'Office', 'Roof'],
  photo_retention_months: 6,
  accessory_markup: 25,
  glass_sheet: { w: 321, h: 225 },
  discount_mode: 'after',
  about: { text: '', services: ['Aluminium windows and doors', 'Glass partitions, shower screens and railings', 'Curtain wall and shop fronts', 'Kitchen cabinets and countertops'], mission: '' },
  intro_line: 'Fabrication of aluminium with all accessories',
};
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) if (getSetting(k) === null) setSetting(k, v);

const pad = (n, w = 3) => String(n).padStart(w, '0');
const ym = (date) => {
  const d = date ? new Date(date) : new Date();
  return String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1, 2);
};

/**
 * Peek or allocate the next document number: the two-digit year followed by a four-digit running number (260001, 260002 …).
 * Every kind (quote, invoice, receipt, payment, po, credit) counts on its own and starts again at 0001 on 1 January.
 */
export function nextNumber(kind, date, consume = false) {
  if (!['quote', 'invoice', 'receipt', 'payment', 'po', 'credit', 'journal'].includes(kind)) throw new Error('bad kind');
  const c = getSetting('counters'); const yy = String(new Date().getFullYear()).slice(2);
  const was = (c.year || {})[kind];
  const n = was && was !== yy ? 1 : (c[kind] || 1); // a new year starts again at 1; a counter with no year recorded yet keeps its value
  if (consume) { c[kind] = n + 1; c.year = { ...(c.year || {}), [kind]: yy }; setSetting('counters', c); }
  return `${yy}${pad(n, 4)}`;
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
