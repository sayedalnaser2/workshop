import { api, $, esc, money, dmy, today, dataTable } from '../ui.js';
import { printView, docHeader, L } from '../doc.js';
import { supplierLedger } from '../accounting.js';

const norm = (s) => String(s || '').trim().toUpperCase();

export async function render(el, [supplier]) {
  const [suppliers, purchases, payments] = await Promise.all([api.get('t/suppliers'), api.get('t/purchases'), api.get('t/payments')]);
  if (supplier) return statement(el, decodeURIComponent(supplier), purchases, payments);
  const names = new Map(); for (const s of suppliers) names.set(norm(s.name), s.name); for (const p of purchases) if (p.supplier && !names.has(norm(p.supplier))) names.set(norm(p.supplier), p.supplier);
  const rows = [...names.values()].map((n) => { const l = supplierLedger(n, purchases, payments); return { supplier: n, bought: l.credit, paid: l.debit, balance: l.balance, n: l.entries.length }; });
  el.innerHTML = `<div class="ph"><h1>Supplier Statements</h1><span class="sub">What we bought from each supplier, what we paid, and what we still owe</span></div>
    <div class="cards"><div class="card stat"><div class="k">We owe suppliers (trade payable)</div><div class="v ${rows.reduce((a, r) => a + Math.max(0, r.balance), 0) > 0 ? 'neg' : ''}">${money(rows.reduce((a, r) => a + r.balance, 0), 2)}</div></div></div><div id="t"></div>`;
  dataTable($('#t', el), {
    rows, search: ['supplier'], page: 60,
    cols: [{ key: 'supplier', label: 'Supplier' }, { key: 'n', label: 'Entries', num: true }, { key: 'bought', label: 'Purchased', num: true, render: (r) => money(r.bought, 2) }, { key: 'paid', label: 'Paid', num: true, render: (r) => money(r.paid, 2) }, { key: 'balance', label: 'We owe', num: true, render: (r) => `<b class="${r.balance > 0.0005 ? 'neg' : ''}">${money(r.balance, 2)}</b>` }],
    filters: [{ label: 'All' }, { label: 'We owe', fn: (r) => r.balance > 0.0005 }], onRow: (r) => (location.hash = `#/supstatements/${encodeURIComponent(r.supplier)}`),
  });
}

function statement(el, supplier, purchases, payments) {
  const l = supplierLedger(supplier, purchases, payments);
  const html = `${docHeader('SUPPLIER STATEMENT', 'كشف حساب مورد')}<div class="meta"><div><b>${L('supplier', 'Supplier')}:</b> ${esc(supplier)}</div><div><b>${L('date', 'DATE')}:</b> ${dmy(today())}</div></div>
    <table><thead><tr><th>${L('date', 'Date')}</th><th>${L('description', 'Description')}</th><th class="n">${L('debit', 'Paid (Dr)')}</th><th class="n">${L('credit', 'Purchased (Cr)')}</th><th class="n">${L('balance', 'We owe')}</th></tr></thead><tbody>${l.entries.map((e) => `<tr><td>${dmy(e.date)}</td><td>${esc(e.desc)}</td><td class="n">${e.debit ? money(e.debit, 3) : ''}</td><td class="n">${e.credit ? money(e.credit, 3) : ''}</td><td class="n">${money(e.bal, 3)}</td></tr>`).join('') || '<tr><td colspan="5">No entries yet.</td></tr>'}
    <tr><td colspan="2"><b>${L('total', 'Total')}</b></td><td class="n"><b>${money(l.debit, 3)}</b></td><td class="n"><b>${money(l.credit, 3)}</b></td><td class="n"><b>${money(l.balance, 3)}</b></td></tr></tbody></table>
    <p style="margin-top:14px;font-size:14px"><b>${l.balance > 0 ? 'Balance owed to supplier' : l.balance < 0 ? 'Supplier owes us (advance paid)' : 'Settled'}: BD ${money(Math.abs(l.balance), 3)}</b></p>`;
  printView(el, { back: '#/supstatements', html });
}
