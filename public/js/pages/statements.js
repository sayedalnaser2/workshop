import { S } from '../app.js';
import { api, $, esc, money, dmy, today, dataTable } from '../ui.js';
import { printView, docHeader, L, AR } from '../doc.js';

export async function render(el, [client]) {
  const [ledger, receipts, credits] = await Promise.all([api.get('ledger'), api.get('t/receipts'), api.get('t/credit_notes')]);
  if (client) return statement(el, decodeURIComponent(client), ledger, receipts, credits.filter((c) => c.status === 'approved'));
  const by = {};
  for (const o of ledger) { const k = (o.client || '—').trim().toUpperCase(); const e = (by[k] ||= { client: o.client || '—', orders: 0, amount: 0, paid: 0, balance: 0 }); e.orders++; e.amount += o.amount; e.paid += o.paid; e.balance += o.balance; }
  const rows = Object.values(by).map((r) => ({ ...r, balance: Math.round(r.balance * 100) / 100 }));
  el.innerHTML = `<div class="ph"><h1>Account Statements</h1><span class="sub">Pick a customer to see — and print — everything invoiced and collected</span></div><div id="t"></div>`;
  dataTable($('#t', el), {
    rows, search: ['client'], page: 60,
    cols: [{ key: 'client', label: 'Customer' }, { key: 'orders', label: 'Orders', num: true }, { key: 'amount', label: 'Invoiced', num: true, render: (r) => money(r.amount, 2) }, { key: 'paid', label: 'Paid', num: true, render: (r) => money(r.paid, 2) }, { key: 'balance', label: 'Balance', num: true, render: (r) => `<span class="${r.balance > 0 ? 'neg' : ''}">${money(r.balance, 2)}</span>` }],
    filters: [{ label: 'All' }, { label: 'With balance', fn: (r) => r.balance > 0.0005 }], onRow: (r) => (location.hash = `#/statements/${encodeURIComponent(r.client)}`),
  });
}

function statement(el, client, ledger, receipts, credits = []) {
  const key = client.trim().toUpperCase();
  const orders = ledger.filter((o) => (o.client || '—').trim().toUpperCase() === key);
  const invs = new Set(orders.map((o) => o.inv));
  const entries = [];
  for (const o of orders) entries.push({ date: o.date, desc: `Invoice ${o.inv}${o.site ? ' – ' + o.site : ''}`, debit: o.amount, credit: 0, k: 0 });
  for (const r of receipts) if (invs.has(r.order_inv)) entries.push({ date: r.date, desc: `Receipt ${r.no} (${r.order_inv})`, debit: 0, credit: r.amount, k: 1 });
  for (const c of credits) if (invs.has(c.order_inv)) entries.push({ date: c.date, desc: `Credit note ${c.no} (${c.order_inv})${c.reason ? ' – ' + c.reason : ''}`, debit: 0, credit: c.total, k: 2 });
  entries.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.k - b.k);
  let bal = 0;
  for (const e of entries) { bal += e.debit - e.credit; e.bal = bal; }
  const tD = entries.reduce((s, e) => s + e.debit, 0), tC = entries.reduce((s, e) => s + e.credit, 0);
  const html = `${docHeader('ACCOUNT STATEMENT', AR.statement)}<div class="meta"><div><b>${L('customer', 'Customer')}:</b> ${esc(client)}</div><div><b>${L('date', 'DATE')}:</b> ${dmy(today())}</div></div>
    <table><thead><tr><th>${L('date', 'Date')}</th><th>${L('description', 'Description')}</th><th class="n">${L('debit', 'Debit')}</th><th class="n">${L('credit', 'Credit')}</th><th class="n">${L('balance', 'Balance')}</th></tr></thead><tbody>${entries.map((e) => `<tr><td>${dmy(e.date)}</td><td>${esc(e.desc)}</td><td class="n">${e.debit ? money(e.debit, 2) : ''}</td><td class="n">${e.credit ? money(e.credit, 2) : ''}</td><td class="n">${money(e.bal, 2)}</td></tr>`).join('') || '<tr><td colspan="5">No transactions</td></tr>'}
    <tr><td colspan="2"><b>${L('total', 'Total')}</b></td><td class="n"><b>${money(tD, 2)}</b></td><td class="n"><b>${money(tC, 2)}</b></td><td class="n"><b>${money(tD - tC, 2)}</b></td></tr></tbody></table>
    <p style="margin-top:14px;font-size:14px"><b>${L('balance', 'Balance')} BD ${money(tD - tC, 2)}</b></p>`;
  printView(el, { back: '#/statements', html });
}
