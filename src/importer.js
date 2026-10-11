import ExcelJS from 'exceljs';
import { db, tx, insertRow, getSetting, setSetting } from './db.js';
import { priceFor, guessPriceType } from '../public/js/calc.js';
import { linkModelsToPriceItems } from './seed.js';

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
    title: str(ws.getCell('B15')), items, discount, vat_rate: vatCell ?? 10, vat_waived: waived, prepared_by: prepared,
  };
}

export async function importWorkbook(file, { log = () => {} } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const out = {};
  const sheet = (n) => wb.getWorksheet(n);

  tx(() => {
    for (const t of ['price_items', 'quotes', 'orders', 'receipts', 'payments', 'purchases', 'employees']) db.exec(`DELETE FROM ${t}`);

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
      insertRow('employees', { name, salary: num(su.getCell(r, 3)) ?? 0, active: 1 });
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
      insertRow('receipts', { no, date: date(rl.getCell(r, 3)), order_inv: str(rl.getCell(r, 5)), client: str(rl.getCell(r, 6)), amount: amt, method: '' });
      c++;
    }
    out.receipts = c;

    // ---- Payment vouchers ---------------------------------------------------------------
    const pl = sheet('Pay.List'); c = 0;
    for (let r = 12; r <= pl.rowCount; r++) {
      const no = str(pl.getCell(r, 4)); const amt = num(pl.getCell(r, 6));
      if (!no || no === '-' || amt == null) continue;
      insertRow('payments', { no, date: date(pl.getCell(r, 3)), paid_to: str(pl.getCell(r, 5)), amount: amt, done: isDone(pl.getCell(r, 7)), category: '', lines: [] });
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
  });
  log(out);
  return out;
}
