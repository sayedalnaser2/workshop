import { api, $, esc, money, dmy, today, dataTable } from '../ui.js';
import { printView, docHeader, L } from '../doc.js';
import { supplierLedger } from '../accounting.js';

const norm = (s) => String(s || '').trim().toUpperCase();

const PK = ['st-from', 'st-to']; // shared with the customer statements, so one period serves both
const getP = () => { try { return PK.map((k) => sessionStorage.getItem(k) || ''); } catch { return ['', '']; } };
const setP = (i, v) => { try { sessionStorage.setItem(PK[i], v); } catch {} };
const periodText = (from, to) => (from || to ? `${from ? dmy(from) : '…'} – ${to ? dmy(to) : dmy(today())}` : 'All dates');

export async function render(el, [supplier]) {
  const [suppliers, purchases, payments, accounts] = await Promise.all([api.get('t/suppliers'), api.get('t/purchases'), api.get('t/payments'), api.get('t/accounts').catch(() => [])]);
  const ap = accounts.find((a) => a.sys === 'ap');
  if (supplier) return statement(el, decodeURIComponent(supplier), purchases, payments, ap);
  let [from, to] = getP();
  const draw = () => {
    const names = new Map(); for (const s of suppliers) names.set(norm(s.name), s.name); for (const p of purchases) if (p.supplier && !names.has(norm(p.supplier))) names.set(norm(p.supplier), p.supplier);
    const rows = [...names.values()].map((n) => { const l = supplierLedger(n, purchases, payments, from, to); return { supplier: n, bought: l.credit, paid: l.debit, opening: l.opening, balance: l.balance, n: l.entries.length }; });
    el.innerHTML = `<div class="ph"><h1>Supplier Statements</h1><span class="sub">What we bought from each supplier, what we paid, and what we still owe${ap ? ` · control account ${esc(ap.code)}` : ''}</span><span class="grow"></span><label class="muted">From <input id="f" type="date" value="${esc(from)}"></label> <label class="muted">to <input id="t" type="date" value="${esc(to)}"></label></div>
      <div class="cards"><div class="card stat"><div class="k">We owe suppliers (trade payable)</div><div class="v ${rows.reduce((a, r) => a + Math.max(0, r.balance), 0) > 0 ? 'neg' : ''}">${money(rows.reduce((a, r) => a + r.balance, 0), 2)}</div></div></div><div id="t2"></div>`;
    $('#f', el).onchange = (e) => { from = e.target.value; setP(0, from); draw(); }; $('#t', el).onchange = (e) => { to = e.target.value; setP(1, to); draw(); };
    dataTable($('#t2', el), {
      rows, search: ['supplier'], page: 60,
      cols: [{ key: 'supplier', label: 'Supplier' }, { key: 'n', label: 'Entries', num: true }, ...(from ? [{ key: 'opening', label: 'Brought forward', num: true, render: (r) => money(r.opening, 2) }] : []), { key: 'bought', label: 'Purchased', num: true, render: (r) => money(r.bought, 2) }, { key: 'paid', label: 'Paid', num: true, render: (r) => money(r.paid, 2) }, { key: 'balance', label: to ? `We owe at ${dmy(to)}` : 'We owe', num: true, render: (r) => `<b class="${r.balance > 0.0005 ? 'neg' : ''}">${money(r.balance, 2)}</b>` }],
      filters: [{ label: 'All' }, { label: 'We owe', fn: (r) => r.balance > 0.0005 }], onRow: (r) => (location.hash = `#/supstatements/${encodeURIComponent(r.supplier)}`),
    });
  };
  draw();
}

function statement(el, supplier, purchases, payments, ap) {
  let [from, to] = getP();
  const draw = () => {
    const l = supplierLedger(supplier, purchases, payments, from, to);
    const html = `${docHeader('SUPPLIER STATEMENT', 'كشف حساب مورد')}<div class="meta"><div><b>${L('supplier', 'Supplier')}:</b> ${esc(supplier)}</div><div><b>${L('date', 'DATE')}:</b> ${dmy(today())}</div>${ap ? `<div><b>${L('account', 'Account')}:</b> ${esc(ap.code)} — ${esc(ap.name)}</div>` : ''}<div><b>${L('period', 'Period')}:</b> ${esc(periodText(from, to))}</div></div>
      <table><thead><tr><th>${L('date', 'Date')}</th><th>${L('description', 'Description')}</th><th class="n">${L('debit', 'Paid (Dr)')}</th><th class="n">${L('credit', 'Purchased (Cr)')}</th><th class="n">${L('balance', 'We owe')}</th></tr></thead><tbody>${from ? `<tr><td>${dmy(from)}</td><td><i>Balance brought forward</i></td><td></td><td></td><td class="n">${money(l.opening, 3)}</td></tr>` : ''}${l.entries.map((e) => `<tr><td>${dmy(e.date)}</td><td>${esc(e.desc)}</td><td class="n">${e.debit ? money(e.debit, 3) : ''}</td><td class="n">${e.credit ? money(e.credit, 3) : ''}</td><td class="n">${money(e.bal, 3)}</td></tr>`).join('') || '<tr><td colspan="5">No entries in this period.</td></tr>'}
      <tr><td colspan="2"><b>${L('total', 'Total')}</b></td><td class="n"><b>${money(l.debit, 3)}</b></td><td class="n"><b>${money(l.credit, 3)}</b></td><td class="n"><b>${money(l.balance, 3)}</b></td></tr></tbody></table>
      <p style="margin-top:14px;font-size:14px"><b>${l.balance > 0 ? 'Balance owed to supplier' : l.balance < 0 ? 'Supplier owes us (advance paid)' : 'Settled'}: BD ${money(Math.abs(l.balance), 3)}</b></p>`;
    printView(el, { back: '#/supstatements', html, extraButtons: `<label class="muted" style="margin-left:12px">From <input id="f" type="date" value="${esc(from)}"></label> <label class="muted">to <input id="t" type="date" value="${esc(to)}"></label>` });
    $('#f', el).onchange = (e) => { from = e.target.value; setP(0, from); draw(); }; $('#t', el).onchange = (e) => { to = e.target.value; setP(1, to); draw(); };
  };
  draw();
}
