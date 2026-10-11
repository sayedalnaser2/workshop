import ExcelJS from 'exceljs';
import { db, tx, insertRow, updateRow, getSetting, setSetting } from './db.js';
import { priceFor, guessPriceType } from '../public/js/calc.js';
import { linkModelsToPriceItems } from './seed.js';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

const unx = (v) => String(v).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
/** The old workbook kept its supplier list and item prices in a linked file; Excel caches a copy of those cells inside this one. */
async function cachedCatalogue(file) {
  try {
    const zip = await JSZip.loadAsync(await readFile(file));
    const vendors = []; const items = [];
    for (const name of Object.keys(zip.files).filter((n) => /^xl\/externalLinks\/externalLink\d+\.xml$/.test(n))) {
      const xml = await zip.file(name).async('string');
      const names = [...xml.matchAll(/<sheetName val="([^"]*)"/g)].map((m) => unx(m[1]));
      for (const m of xml.matchAll(/<sheetData sheetId="(\d+)"[^>]*>([\s\S]*?)<\/sheetData>/g)) {
        const rows = {};
        for (const c of m[2].matchAll(/<cell r="([A-Z]+)(\d+)"[^>]*><v>([^<]*)<\/v>/g)) (rows[c[2]] ||= {})[c[1]] = unx(c[3]);
        const list = Object.values(rows);
        if (names[Number(m[1])] === 'DB.Vender' && list.length > vendors.length) { vendors.length = 0; list.filter((r) => r.D).forEach((r) => vendors.push({ name: r.D, phone: r.F || '', phone2: r.G || '', address: [r.H, r.I, r.J].filter(Boolean).join(', '), email: r.K || '' })); }
        if (list.filter((r) => r.L && r.P).length > 40 && list.filter((r) => r.L && r.P).length > items.length) { items.length = 0; list.filter((r) => r.L && r.P && !isNaN(parseFloat(r.P))).forEach((r) => items.push({ code: r.L, series: r.M || '', name: `${r.N || ''} ${r.L}`.trim(), supplier: r.O || '', price: parseFloat(r.P) })); }
      }
    }
    return { vendors, items };
  } catch { return { vendors: [], items: [] }; }
}
const kindOf = (n = '') => (/glass/i.test(n) ? 'glass' : /hinge|handle|lock|acces|screw|roller|brush|rubber|silicone|button/i.test(n) ? 'accessory' : 'profile');

const raw = (c) => {
  let v = c?.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) v = v.result;
    else if (v.richText) v = v.richText.map((t) => t.text).join('');
    else if (v.text) v = v.text;
    else if (v.error) v = null;
  }
  if (v && typeof v === 'object' && !(v instanceof Date)) v = null;
  return v ?? null;
};
const str = (c) => { const v = raw(c); return v == null ? '' : v instanceof Date ? iso(v) : String(v).trim(); };
const num = (c) => { const v = raw(c); const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };
const iso = (d) => d.toISOString().slice(0, 10);
const date = (c) => { const v = raw(c); if (v instanceof Date) return iso(v); if (typeof v === 'string' && /^\d{4}-\d\d-\d\d/.test(v)) return v.slice(0, 10); return null; };
const isDone = (c) => str(c).toLowerCase() === 'done' ? 1 : 0;

function parseQuote(ws) {
  // locate the totals row (J = SUMPRODUCT(...)) — the sheet is a variable-length form
  let foot = 0;
  ws.eachRow((row, r) => { if (!foot && r > 15) { const f = row.getCell('J').value; if (f && typeof f === 'object' && String(f.formula || '').startsWith('SUMPRODUCT')) foot = r; } });
  if (!foot) return null;
  const items = [];
  for (let r = 16; r < foot; r++) {
    const b = num(ws.getCell(r, 2)); const e = str(ws.getCell(r, 5));
    const qty = num(ws.getCell(r, 9)); const jv = ws.getCell(r, 10);
    const hasPrice = num(jv) != null && num(jv) !== 0 && qty != null;
    if ((b != null || hasPrice) && e) {
      const w = num(ws.getCell(r, 3)), h = num(ws.getCell(r, 4));
      let price = num(jv);
      if (price == null && typeof jv.value !== 'object') price = null;
      items.push({ w, h, desc: e, note: '', qty: qty ?? 1, price: price ?? 0, _calc: price == null });
    } else if (e && items.length) {
      const last = items[items.length - 1];
      last.note = last.note ? last.note + '\n' + e : e;
    }
  }
  if (!items.length) return null;
  const discount = num(ws.getCell(foot + 1, 10)) ?? 0;
  const vatCell = num(ws.getCell(foot + 3, 8));
  const waived = num(ws.getCell(foot + 4, 10)) ?? 0;
  const prepared = str(ws.getCell(foot + 9, 4));
  return {
    number: str(ws.getCell('D7')), date: date(ws.getCell('D9')) ?? null,
    client: str(ws.getCell('D11')), mobile: str(ws.getCell('J9')), site: str(ws.getCell('J11')),
    title: str(ws.getCell('B15')), colour: str(ws.getCell('M9')), items, discount, vat_rate: vatCell ?? 10, vat_waived: waived, prepared_by: prepared,
  };
}

export async function importWorkbook(file, { log = () => {} } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const cat = await cachedCatalogue(file);
  const out = {};
  const sheet = (n) => wb.getWorksheet(n);

  tx(() => {
    for (const t of ['price_items', 'quotes', 'orders', 'receipts', 'payments', 'purchases']) db.exec(`DELETE FROM ${t}`);

    // ---- Setup: price list, counters, employees -------------------------------------
    const su = sheet('Setup');
    const counters = getSetting('counters');
    const cn = (r) => num(su.getCell(r, 3));
    if (cn(4)) counters.quote = cn(4);
    if (cn(6)) counters.invoice = cn(6);
    if (cn(8)) counters.receipt = cn(8);
    if (cn(2)) counters.payment = cn(2);
    setSetting('counters', counters);

    let n = 0; const items = [];
    for (let r = 3; r <= 120; r++) {
      const name = str(su.getCell(r, 8)); if (!name) continue;
      const rate = num(su.getCell(r, 9));
      items.push({ name, rate, note: str(su.getCell(r, 11)) });
    }
    for (const it of items) {
      const type = it.rate == null ? 'note' : guessPriceType(it.name);
      insertRow('price_items', { name: it.name, rate: it.rate ?? 0, type, unit: type === 'area' ? 'm²' : 'ea', note: it.note, sort: ++n });
    }
    out.price_items = items.length;

    let ne = 0;
    for (let r = 20; r <= 40; r++) {
      const name = str(su.getCell(r, 2)); if (!name) continue;
      // keep existing employee files: update by name, add only new people
      const have = db.prepare('SELECT id FROM employees WHERE lower(name)=lower(?)').get(name);
      if (have) updateRow('employees', have.id, { salary: num(su.getCell(r, 3)) ?? 0 }); else insertRow('employees', { name, salary: num(su.getCell(r, 3)) ?? 0, active: 1 });
      ne++;
    }
    out.employees = ne;

    // ---- Orders -------------------------------------------------------------------------
    const ol = sheet('Orders List'); let c = 0;
    for (let r = 12; r <= ol.rowCount; r++) {
      const inv = str(ol.getCell(r, 3)); if (!inv) continue;
      insertRow('orders', { inv, date: date(ol.getCell(r, 14)), client: str(ol.getCell(r, 4)), site: str(ol.getCell(r, 5)), mobile: str(ol.getCell(r, 6)), amount: num(ol.getCell(r, 7)) ?? 0, done: isDone(ol.getCell(r, 11)) });
      c++;
    }
    out.orders = c;

    // ---- Receipts -----------------------------------------------------------------------
    const rl = sheet('Rec.List'); c = 0;
    for (let r = 12; r <= rl.rowCount; r++) {
      const no = str(rl.getCell(r, 4)); const amt = num(rl.getCell(r, 7));
      if (!no || no === '-' || amt == null) continue;
      insertRow('receipts', { no, date: date(rl.getCell(r, 3)), order_inv: str(rl.getCell(r, 5)), client: str(rl.getCell(r, 6)), amount: amt, method: '', account: str(rl.getCell(r, 8)).toLowerCase() });
      c++;
    }
    out.receipts = c;

    // ---- Payment vouchers ---------------------------------------------------------------
    const pl = sheet('Pay.List'); c = 0;
    for (let r = 12; r <= pl.rowCount; r++) {
      const no = str(pl.getCell(r, 4)); const amt = num(pl.getCell(r, 6));
      if (!no || no === '-' || amt == null) continue;
      insertRow('payments', { no, date: date(pl.getCell(r, 3)), paid_to: str(pl.getCell(r, 5)), amount: amt, done: isDone(pl.getCell(r, 7)), category: '', lines: [], account: str(pl.getCell(r, 8)).toLowerCase() });
      c++;
    }
    out.payments = c;

    // ---- Purchases ----------------------------------------------------------------------
    const pu = sheet('Pur.List'); c = 0;
    for (let r = 13; r <= Math.min(pu.rowCount, 6000); r++) {
      const d = date(pu.getCell(r, 3)); const amt = num(pu.getCell(r, 7));
      if (!d || amt == null) continue;
      insertRow('purchases', { date: d, pv: str(pu.getCell(r, 4)), invoice: str(pu.getCell(r, 5)), supplier: str(pu.getCell(r, 6)), amount: amt, order_inv: str(pu.getCell(r, 8)) });
      c++;
    }
    out.purchases = c;

    // ---- Quotation sheets (Q26 70 …) ---------------------------------------------------
    c = 0;
    for (const ws of wb.worksheets) {
      if (!/^Q\d\d /i.test(ws.name)) continue;
      const q = parseQuote(ws); if (!q) continue;
      for (const it of q.items) {
        if (it._calc && it.price === 0) {
          // older quotes say "erection"; the current price list says "installation"
          const find = (d) => db.prepare('SELECT * FROM price_items WHERE lower(trim(name))=lower(trim(?))').get(d);
          const pi = find(it.desc) || find(it.desc.replace(/erection/i, 'installation'));
          if (pi) it.price = priceFor(pi, it.w, it.h);
        }
        delete it._calc;
      }
      if (!q.number) q.number = ws.name.replace(/\s+/g, '');
      insertRow('quotes', { ...q, status: 'sent', notes: `Imported from sheet "${ws.name}"` });
      c++;
    }
    out.quotes = c;
    linkModelsToPriceItems();

    // ---- suppliers & item prices (cached copy of the linked ALUMINUM workbook) ----------
    let ns = 0, ni = 0;
    for (const v of cat.vendors) if (!db.prepare('SELECT id FROM suppliers WHERE lower(name)=lower(?)').get(v.name)) { insertRow('suppliers', v); ns++; }
    for (const it of cat.items) {
      if (it.supplier && !db.prepare('SELECT id FROM suppliers WHERE lower(name)=lower(?)').get(it.supplier)) { insertRow('suppliers', { name: it.supplier }); ns++; }
      if (!db.prepare('SELECT id FROM items WHERE code=? AND supplier=?').get(it.code, it.supplier)) { insertRow('items', { ...it, kind: kindOf(it.name), unit: 'bar' }); ni++; }
    }
    if (ns || ni) { out.suppliers = ns; out.catalogue_items = ni; }

    // ---- sheets written by this app's own export (stock, cash & bank, employee files) --
    const sheetRows = (n, from = 2) => { const w = sheet(n); const rows = []; if (w) for (let r = from; r <= w.rowCount; r++) rows.push(w.getRow(r)); return rows; };
    const profMap = Object.fromEntries(db.prepare('SELECT * FROM profiles').all().map((p) => [`${p.series || ''} ${p.name}`.trim().toLowerCase(), p.id]));
    const glassMap = Object.fromEntries(db.prepare('SELECT * FROM glass_types').all().map((g) => [g.name.toLowerCase(), g.id]));
    if (sheet('Stock')) {
      db.exec('DELETE FROM stock'); let k = 0;
      for (const r of sheetRows('Stock')) {
        const g = (i) => str(r.getCell(i)); if (!g(1)) continue;
        insertRow('stock', { kind: g(1), item_type: g(2), profile_id: profMap[g(3).toLowerCase()] ?? null, glass_id: glassMap[g(3).toLowerCase()] ?? null, name: g(4), code: g(5), colour: g(6), length: num(r.getCell(7)), width: num(r.getCell(8)), qty: num(r.getCell(9)) ?? 0, unit: g(10), unit_cost: num(r.getCell(11)) ?? 0, location: g(12), reserved_for: g(13), order_inv: g(14), date: date(r.getCell(15)), note: g(16) }); k++;
      }
      out.stock = k;
    }
    if (sheet('Suppliers')) { for (const r of sheetRows('Suppliers')) { const g = (i) => str(r.getCell(i)); if (g(1) && !db.prepare('SELECT id FROM suppliers WHERE lower(name)=lower(?)').get(g(1))) insertRow('suppliers', { name: g(1), phone: g(2), phone2: g(3), address: g(4), email: g(5), note: g(6) }); } }
    if (sheet('Items')) {
      db.exec('DELETE FROM items'); let k = 0;
      for (const r of sheetRows('Items')) { const g = (i) => str(r.getCell(i)); if (!g(2)) continue; insertRow('items', { code: g(1), name: g(2), kind: g(3), series: g(4), supplier: g(5), unit: g(6), price: num(r.getCell(7)) ?? 0, note: g(8) }); k++; }
      out.catalogue_items = k;
    }
    if (sheet('Cash & Bank')) {
      db.exec('DELETE FROM cash_entries'); let k = 0;
      for (const r of sheetRows('Cash & Bank')) { const g = (i) => str(r.getCell(i)); if (!g(2)) continue; insertRow('cash_entries', { date: date(r.getCell(1)), account: g(2).toLowerCase(), direction: g(3).toLowerCase(), amount: num(r.getCell(4)) ?? 0, category: g(5), party: g(6), note: g(7) }); k++; }
      out.cash_entries = k;
    }
    if (sheet('Employees')) {
      for (const r of sheetRows('Employees')) {
        const g = (i) => str(r.getCell(i)); if (!g(1)) continue;
        const d = { name: g(1), salary: num(r.getCell(2)) ?? 0, active: g(3).toLowerCase() === 'no' ? 0 : 1, role: g(4), nationality: g(5), id_no: g(6), passport_no: g(7), phone: g(8), join_date: date(r.getCell(9)), permit_expiry: date(r.getCell(10)), iban: g(11), emergency: g(12), address: g(13), note: g(14) };
        const have = db.prepare('SELECT id FROM employees WHERE lower(name)=lower(?)').get(d.name);
        if (have) updateRow('employees', have.id, d); else insertRow('employees', d);
      }
    }
  });
  log(out);
  return out;
}
