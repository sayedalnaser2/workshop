import ExcelJS from 'exceljs';
import { db, getSetting, listRows } from './db.js';
import { quoteTotals } from '../public/js/calc.js';

const D = (s) => (s ? new Date(s + 'T00:00:00Z') : null);
const money = '#,##0.000';

/** Build an .xlsx laid out like the TALENTS workbook (same sheet names / cell positions), so it can be re-imported. */
export async function exportWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Workshop Manager';
  const head = (ws, row, labels) => { ws.getRow(row).values = labels; ws.getRow(row).font = { bold: true }; ws.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } }; };

  // ---- Setup: counters, price list, employees
  const su = wb.addWorksheet('Setup');
  const c = getSetting('counters');
  su.getCell('B2').value = 'NxtPayment'; su.getCell('C2').value = c.payment;
  su.getCell('B4').value = 'NxtQuote'; su.getCell('C4').value = c.quote;
  su.getCell('B6').value = 'NxtInv'; su.getCell('C6').value = c.invoice;
  su.getCell('B8').value = 'NxtRec'; su.getCell('C8').value = c.receipt;
  su.getCell('B19').value = 'EMPLOYEE'; su.getCell('C19').value = 'SALARY';
  listRows('employees').forEach((e, i) => { su.getCell(20 + i, 2).value = e.name; su.getCell(20 + i, 3).value = e.salary; });
  su.getCell('H2').value = 'MAINTENANCE'; su.getCell('I2').value = '-';
  listRows('price_items').forEach((p, i) => { su.getCell(3 + i, 8).value = p.name; if (p.type !== 'note') su.getCell(3 + i, 9).value = p.rate; if (p.note) su.getCell(3 + i, 11).value = p.note; });
  su.getColumn(8).width = 70; su.getColumn(2).width = 28;

  // ---- Orders List (header row 11, data from 12)
  const ol = wb.addWorksheet('Orders List', { views: [{ state: 'frozen', ySplit: 11 }] });
  head(ol, 11, [null, '#', 'Inv', 'Client', 'Site', 'Mob', 'G.Amount', 'Paid', 'Balance', 'Profit', 'Done.', null, null, 'Date']);
  const ledger = db.prepare(`SELECT o.*, IFNULL((SELECT SUM(amount) FROM receipts r WHERE r.order_inv=o.inv),0) paid, IFNULL((SELECT SUM(amount) FROM purchases p WHERE p.order_inv=o.inv),0) cost FROM orders o ORDER BY date, id`).all();
  ledger.forEach((o, i) => { const r = 12 + i; ol.getRow(r).values = [null, i + 1, o.inv, o.client, o.site, o.mobile, o.amount, o.paid, Math.round((o.amount - o.paid) * 100) / 100, Math.round((o.amount - o.cost) * 100) / 100, o.done ? 'Done' : '', null, null, D(o.date)]; ol.getCell(r, 14).numFmt = 'dd/mm/yyyy'; });
  [7, 8, 9, 10].forEach((n) => { ol.getColumn(n).numFmt = money; });
  ol.columns.forEach((col, i) => { col.width = [4, 5, 11, 30, 22, 12, 11, 11, 11, 11, 8, 4, 4, 12][i] || 10; });

  // ---- Rec.List
  const rl = wb.addWorksheet('Rec.List'); head(rl, 11, [null, '#', 'Date', 'Rec#', 'Order', 'Client', 'Amount', 'Account', 'Method', 'Ref']);
  rl.getRow(12).values = [null, 0, D('2021-01-01'), '-', '-', '-', 0];
  db.prepare('SELECT * FROM receipts ORDER BY date, id').all().forEach((r, i) => { rl.getRow(13 + i).values = [null, i + 1, D(r.date), r.no, r.order_inv, r.client, r.amount, r.account || '', r.method || '', r.ref || '']; rl.getCell(13 + i, 3).numFmt = 'dd/mm/yyyy'; });
  rl.columns.forEach((col, i) => { col.width = [4, 5, 12, 10, 12, 30, 12][i]; });

  // ---- Pay.List
  const pl = wb.addWorksheet('Pay.List'); head(pl, 11, [null, '#', 'Date', 'PAY-VOU', 'Paid to', 'Amount', 'Done', 'Account', 'Method', 'Ref']);
  db.prepare('SELECT * FROM payments ORDER BY date, id').all().forEach((r, i) => { pl.getRow(12 + i).values = [null, i + 1, D(r.date), r.no, r.paid_to, r.amount, r.done ? 'Done' : '', r.account || '', r.method || '', r.ref || '']; pl.getCell(12 + i, 3).numFmt = 'dd/mm/yyyy'; });
  pl.columns.forEach((col, i) => { col.width = [4, 5, 12, 10, 34, 12, 8][i]; });

  // ---- Pur.List (data from row 13 like the original)
  const pu = wb.addWorksheet('Pur.List'); head(pu, 11, [null, '#', 'Date', 'P.V.', 'invoice', 'Supplier', 'Amount', 'Order']);
  db.prepare('SELECT * FROM purchases ORDER BY date, id').all().forEach((r, i) => { pu.getRow(13 + i).values = [null, i + 1, D(r.date), r.pv, r.invoice, r.supplier, r.amount, r.order_inv]; pu.getCell(13 + i, 3).numFmt = 'dd/mm/yyyy'; });
  pu.columns.forEach((col, i) => { col.width = [4, 5, 12, 10, 14, 30, 12, 12][i]; });

  // ---- one sheet per quotation, same cell layout as "Q26 70"
  const used = new Set(['Setup', 'Orders List', 'Rec.List', 'Pay.List', 'Pur.List']);
  for (const q of db.prepare('SELECT * FROM quotes ORDER BY date, id').all().map((x) => ({ ...x, items: JSON.parse(x.items || '[]') }))) {
    let name = /^\d{6}$/.test(q.number) ? `Q${q.number.slice(0, 2)} ${q.number.slice(2)}` : /^Q\d{4}\d{3}$/.test(q.number) ? `Q${q.number.slice(1, 3)} ${q.number.slice(-3)}` : `Q00 ${q.number}`.slice(0, 31);
    for (let n = 2; used.has(name); n++) name = `${name.replace(/ \(\d+\)$/, '')} (${n})`;
    used.add(name);
    const ws = wb.addWorksheet(name);
    ws.getCell('B7').value = 'QUOTE       :'; ws.getCell('D7').value = q.number;
    ws.getCell('B9').value = 'DATE         :'; ws.getCell('D9').value = D(q.date); ws.getCell('D9').numFmt = 'dd/mm/yyyy';
    ws.getCell('I9').value = 'Mob:'; ws.getCell('J9').value = q.mobile;
    ws.getCell('B11').value = 'Client        :'; ws.getCell('D11').value = q.client;
    ws.getCell('I11').value = 'W/Site:'; ws.getCell('J11').value = q.site;
    ws.getRow(13).values = [null, '#', 'Size', null, 'Description', null, null, null, 'Qty', 'Unit']; ws.getRow(14).values = [null, null, 'Widh', 'Height'];
    ws.getCell('B15').value = q.title; ws.getCell('L9').value = 'Colour:'; ws.getCell('M9').value = q.colour || '';
    let r = 16, n = 0;
    for (const it of q.items) {
      if (it.kind === 'note') { ws.getCell(r, 5).value = it.desc; r++; continue; }
      n++; ws.getRow(r).values = [null, n, it.w, it.h, it.desc, null, null, null, it.qty, it.price]; r++;
      for (const line of String(it.note || '').split('\n').filter(Boolean)) { ws.getCell(r, 5).value = line; r++; }
    }
    const foot = Math.max(r + 1, 42); const T = quoteTotals(q);
    ws.getCell(foot, 10).value = { formula: `SUMPRODUCT(I16:I${foot - 2},J16:J${foot - 2})`, result: T.subtotal };
    ws.getCell(foot + 1, 8).value = 'Disc'; ws.getCell(foot + 1, 10).value = q.discount || 0;
    ws.getCell(foot + 2, 8).value = 'Amount'; ws.getCell(foot + 2, 10).value = { formula: `J${foot}-J${foot + 1}`, result: T.amount };
    ws.getCell(foot + 3, 8).value = q.vat_rate; ws.getCell(foot + 3, 10).value = { formula: `J${foot + 2}*H${foot + 3}%`, result: T.vat };
    ws.getCell(foot + 4, 10).value = q.vat_waived || 0;
    ws.getCell(foot + 5, 8).value = 'Grand Amount'; ws.getCell(foot + 5, 10).value = { formula: `J${foot + 2}+J${foot + 3}-J${foot + 4}`, result: T.grand };
    ws.getCell(foot + 9, 2).value = 'Prepared \\\\'; ws.getCell(foot + 9, 4).value = q.prepared_by || '';
    ws.getColumn(5).width = 60; ws.getColumn(4).width = 14; ws.getColumn(2).width = 14; ws.getColumn(10).width = 12;
    ws.getColumn(10).numFmt = money;
  }
  // ---- stock, suppliers, catalogue, cash & bank, employee files
  const pn = Object.fromEntries(listRows('profiles').map((x) => [x.id, `${x.series || ''} ${x.name}`.trim()]));
  const gn = Object.fromEntries(listRows('glass_types').map((x) => [x.id, x.name]));
  const st = wb.addWorksheet('Stock'); head(st, 1, ['Kind (new/leftover)', 'Type', 'Profile / glass', 'Name', 'Code', 'Colour', 'Length cm', 'Width cm', 'Qty', 'Unit', 'Unit cost', 'Location', 'Reserved for', 'From order', 'Date', 'Note']);
  listRows('stock').forEach((r, i) => { st.getRow(2 + i).values = [r.kind, r.item_type, pn[r.profile_id] || gn[r.glass_id] || '', r.name, r.code, r.colour, r.length, r.width, r.qty, r.unit, r.unit_cost, r.location, r.reserved_for, r.order_inv, D(r.date), r.note]; });
  st.columns.forEach((c) => { c.width = 16; });
  const sp = wb.addWorksheet('Suppliers'); head(sp, 1, ['Name', 'Phone', 'Phone 2', 'Address', 'Email', 'Note']);
  listRows('suppliers').forEach((r, i) => { sp.getRow(2 + i).values = [r.name, r.phone, r.phone2, r.address, r.email, r.note]; }); sp.columns.forEach((c) => { c.width = 24; });
  const it = wb.addWorksheet('Items'); head(it, 1, ['Code', 'Item', 'Kind', 'Series', 'Supplier', 'Unit', 'Price', 'Note']);
  listRows('items').forEach((r, i) => { it.getRow(2 + i).values = [r.code, r.name, r.kind, r.series, r.supplier, r.unit, r.price, r.note]; }); it.columns.forEach((c) => { c.width = 22; });
  const cb = wb.addWorksheet('Cash & Bank'); head(cb, 1, ['Date', 'Account (cash/bank)', 'Direction (in/out)', 'Amount', 'Category', 'Party', 'Note']);
  db.prepare('SELECT * FROM cash_entries ORDER BY date, id').all().forEach((r, i) => { cb.getRow(2 + i).values = [D(r.date), r.account, r.direction, r.amount, r.category, r.party, r.note]; cb.getCell(2 + i, 1).numFmt = 'dd/mm/yyyy'; }); cb.columns.forEach((c) => { c.width = 18; });
  const em = wb.addWorksheet('Employees'); head(em, 1, ['Name', 'Salary', 'Active (yes/no)', 'Trade', 'Nationality', 'CPR / ID', 'Passport', 'Phone', 'Joined', 'Permit expires', 'Bank / IBAN', 'Emergency contact', 'Address', 'Note']);
  listRows('employees').forEach((r, i) => { em.getRow(2 + i).values = [r.name, r.salary, r.active ? 'yes' : 'no', r.role, r.nationality, r.id_no, r.passport_no, r.phone, D(r.join_date), D(r.permit_expiry), r.iban, r.emergency, r.address, r.note]; }); em.columns.forEach((c) => { c.width = 18; });
  return wb.xlsx.writeBuffer();
}
