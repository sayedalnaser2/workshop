import { S } from '../app.js';
import { api, $, $$, esc, money, dmy, today, toast, guard } from '../ui.js';
import { barChart } from './dashboard.js';

export async function render(el) {
  let tab = sessionStorage.getItem('rep-tab') || 'overview';
  el.innerHTML = `<div class="tbar"><div class="seg"><button data-t="overview">Overview</button><button data-t="vat">VAT report</button><button data-t="pnl">Profit &amp; loss by month</button></div></div><div id="rp"></div>`;
  const show = () => { $$('.seg button', el).forEach((b) => b.classList.toggle('on', b.dataset.t === tab)); const pane = $('#rp', el); ({ overview, vat: vatTab, pnl: pnlTab }[tab])(pane); };
  $$('.seg button', el).forEach((b) => (b.onclick = () => { tab = b.dataset.t; sessionStorage.setItem('rep-tab', tab); show(); }));
  show();
}

// ------------------------------------------------------------------ period picker shared by the VAT and P&L tabs
const iso = (d) => d.toISOString().slice(0, 10);
const periods = () => {
  const n = new Date(); const y = n.getUTCFullYear(); const m = n.getUTCMonth(); const q = Math.floor(m / 3);
  const ym = (yy, mm, last) => iso(new Date(Date.UTC(yy, mm + (last ? 1 : 0), last ? 0 : 1)));
  return { 'This month': [ym(y, m), ym(y, m, 1)], 'Last month': [ym(y, m - 1), ym(y, m - 1, 1)], 'This quarter': [ym(y, q * 3), ym(y, q * 3 + 2, 1)], 'Last quarter': [ym(y, q * 3 - 3), ym(y, q * 3 - 1, 1)], 'This year': [`${y}-01-01`, `${y}-12-31`], 'Last year': [`${y - 1}-01-01`, `${y - 1}-12-31`], 'All time': ['', ''] };
};
const getRange = () => { try { return JSON.parse(sessionStorage.getItem('rep-range')) || { name: 'This year', from: periods()['This year'][0], to: periods()['This year'][1] }; } catch { return { name: 'This year', from: periods()['This year'][0], to: periods()['This year'][1] }; } };
function picker(pane, r, redraw) {
  return `<div class="tbar">${Object.keys(periods()).map((n) => `<button class="btn sm ${r.name === n ? 'primary' : ''}" data-p="${n}">${n}</button>`).join('')}<span class="grow"></span><label class="muted">From <input type="date" id="rf" value="${r.from}" style="width:150px"></label><label class="muted">To <input type="date" id="rt" value="${r.to}" style="width:150px"></label></div>`;
}
function bindPicker(pane, r, redraw) {
  const set = (x) => { try { sessionStorage.setItem('rep-range', JSON.stringify(x)); } catch {} redraw(); };
  $$('[data-p]', pane).forEach((b) => (b.onclick = () => { const [from, to] = periods()[b.dataset.p]; set({ name: b.dataset.p, from, to }); }));
  $('#rf', pane).onchange = (e) => set({ name: 'Custom', from: e.target.value, to: r.to }); $('#rt', pane).onchange = (e) => set({ name: 'Custom', from: r.from, to: e.target.value });
}
const mname = (m) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const csv = (rows) => rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
const download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };

// ------------------------------------------------------------------ VAT return
async function vatTab(pane) {
  const r = getRange(); const d = await api.get(`vat-report?from=${r.from}&to=${r.to}`); const t = d.totals;
  pane.innerHTML = `${picker(pane, r)}
    <div class="cards"><div class="card stat"><div class="k">VAT collected (sales)</div><div class="v">${money(t.output_vat, 3)}</div></div><div class="card stat"><div class="k">less credit notes</div><div class="v">− ${money(t.credit_vat, 3)}</div></div><div class="card stat"><div class="k">VAT paid (purchases)</div><div class="v">− ${money(t.input_vat, 3)}</div></div><div class="card stat"><div class="k">${t.vat_payable >= 0 ? 'VAT payable to the NBR' : 'VAT to claim back'}</div><div class="v ${t.vat_payable > 0 ? 'neg' : 'pos'}">${money(Math.abs(t.vat_payable), 3)}</div></div></div>
    ${d.noVatPurchases ? `<div class="card" style="margin-bottom:12px;border-color:var(--warn)"><b>${d.noVatPurchases} purchase(s) have no VAT figure</b>, so no VAT paid is counted for them. Enter the VAT on each purchase, or in Settings choose “treat purchases without a VAT figure as VAT-inclusive”.</div>` : ''}
    ${d.estimated ? `<div class="card muted" style="margin-bottom:12px">${d.estimated} purchase(s) have VAT worked out from the ${S.settings.vat_rate}% rate because no figure was entered.</div>` : ''}
    <div class="card"><h3>By month (BD)</h3><table class="grid"><thead><tr><th>Month</th><th class="num">Sales (excl. VAT)</th><th class="num">VAT collected</th><th class="num">Credit notes VAT</th><th class="num">Purchases (excl. VAT)</th><th class="num">VAT paid</th><th class="num">VAT payable</th></tr></thead><tbody>${d.rows.map((x) => `<tr><td><b>${mname(x.m)}</b></td><td class="num">${money(x.revenue, 3)}</td><td class="num">${money(x.output_vat, 3)}</td><td class="num">${money(x.credit_vat, 3)}</td><td class="num">${money(x.purchases_net, 3)}</td><td class="num">${money(x.input_vat, 3)}</td><td class="num ${x.vat_payable > 0 ? 'neg' : 'pos'}">${money(x.vat_payable, 3)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No invoices or purchases in this period.</td></tr>'}</tbody><tfoot><tr><td>Total</td><td class="num">${money(t.revenue, 3)}</td><td class="num">${money(t.output_vat, 3)}</td><td class="num">${money(t.credit_vat, 3)}</td><td class="num">${money(t.purchases_net, 3)}</td><td class="num">${money(t.input_vat, 3)}</td><td class="num">${money(t.vat_payable, 3)}</td></tr></tfoot></table>
    <p class="muted" style="margin:8px 0 0">VAT collected comes from each invoice (the VAT on its quotation, or the standard ${S.settings.vat_rate}% when it was entered by hand). Credit notes reduce it. Check the figures against your own records before you file.</p></div>
    <div style="display:flex;gap:8px;margin:12px 0"><button class="btn" id="csvS">Download sales list (CSV)</button><button class="btn" id="csvP">Download purchases list (CSV)</button></div>
    <details class="card"><summary style="cursor:pointer;font-weight:600">Sales invoices and credit notes (${d.sales.length})</summary><table class="grid" style="margin-top:8px"><thead><tr><th>Date</th><th>Document</th><th>Customer</th><th>Customer VAT No.</th><th class="num">Net</th><th class="num">VAT</th><th class="num">Total</th></tr></thead><tbody>${d.sales.map((x) => `<tr><td>${dmy(x.date)}</td><td>${esc(x.kind)} ${esc(x.no)}</td><td>${esc(x.client || '')}</td><td>${esc(x.client_vat || '')}</td><td class="num">${money(x.net, 3)}</td><td class="num">${money(x.vat, 3)}</td><td class="num">${money(x.total, 3)}</td></tr>`).join('')}</tbody></table></details>
    <details class="card" style="margin-top:10px"><summary style="cursor:pointer;font-weight:600">Purchases (${d.purchases.length})</summary><table class="grid" style="margin-top:8px"><thead><tr><th>Date</th><th>Supplier</th><th>Invoice</th><th class="num">Net</th><th class="num">VAT</th><th class="num">Total</th></tr></thead><tbody>${d.purchases.map((x) => `<tr><td>${dmy(x.date)}</td><td>${esc(x.supplier || '')}</td><td>${esc(x.no || '')}</td><td class="num">${money(x.net, 3)}</td><td class="num">${money(x.vat, 3)}${x.estimated ? ' <span class="muted" title="no VAT entered">*</span>' : ''}</td><td class="num">${money(x.total, 3)}</td></tr>`).join('')}</tbody></table></details>`;
  bindPicker(pane, r, () => vatTab(pane));
  $('#csvS', pane).onclick = () => download(`sales-${r.from || 'all'}_${r.to || ''}.csv`, csv([['Date', 'Type', 'Number', 'Customer', 'Customer VAT No.', 'Net', 'VAT', 'Total'], ...d.sales.map((x) => [x.date, x.kind, x.no, x.client, x.client_vat, x.net, x.vat, x.total])]));
  $('#csvP', pane).onclick = () => download(`purchases-${r.from || 'all'}_${r.to || ''}.csv`, csv([['Date', 'Supplier', 'Invoice', 'Net', 'VAT', 'Total'], ...d.purchases.map((x) => [x.date, x.supplier, x.no, x.net, x.vat, x.total])]));
}

// ------------------------------------------------------------------ profit and loss
async function pnlTab(pane) {
  const r = getRange(); const d = await api.get(`vat-report?from=${r.from}&to=${r.to}`); const t = d.totals; const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '');
  pane.innerHTML = `${picker(pane, r)}
    <div class="cards"><div class="card stat"><div class="k">Sales (excl. VAT, after credit notes)</div><div class="v">${money(t.revenue, 2)}</div></div><div class="card stat"><div class="k">Purchases (excl. VAT)</div><div class="v">${money(t.purchases_net, 2)}</div></div><div class="card stat"><div class="k">Payments &amp; expenses</div><div class="v">${money(t.expenses, 2)}</div></div><div class="card stat"><div class="k">Profit</div><div class="v ${t.profit < 0 ? 'neg' : 'pos'}">${money(t.profit, 2)}</div><div class="muted">${pct(t.profit, t.revenue)} of sales</div></div></div>
    <div class="card"><h3>By month (BD)</h3><table class="grid"><thead><tr><th>Month</th><th class="num">Sales</th><th class="num">Purchases</th><th class="num">Payments &amp; expenses</th><th class="num">Profit</th><th class="num">Margin</th></tr></thead><tbody>${d.rows.map((x) => `<tr><td><b>${mname(x.m)}</b></td><td class="num">${money(x.revenue, 2)}</td><td class="num">${money(x.purchases_net, 2)}</td><td class="num">${money(x.expenses, 2)}</td><td class="num ${x.profit < 0 ? 'neg' : 'pos'}">${money(x.profit, 2)}</td><td class="num muted">${pct(x.profit, x.revenue)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nothing in this period.</td></tr>'}</tbody><tfoot><tr><td>Total</td><td class="num">${money(t.revenue, 2)}</td><td class="num">${money(t.purchases_net, 2)}</td><td class="num">${money(t.expenses, 2)}</td><td class="num">${money(t.profit, 2)}</td><td class="num">${pct(t.profit, t.revenue)}</td></tr></tfoot></table>
    <div style="margin-top:14px">${barChart(d.rows.map((x) => ({ label: x.m.slice(2), a: x.revenue, b: Math.max(0, x.profit) })), 'Sales', 'Profit')}</div>
    <p class="muted" style="margin:8px 0 0">Sales are by invoice date, purchases and payments by their own dates — this is an accrual-style view, not your cash position (see Cash &amp; Bank for that). Salaries and other payment vouchers count as expenses.</p></div>`;
  bindPicker(pane, r, () => pnlTab(pane));
}

async function overview(el) {
  const [s, ledger] = await Promise.all([api.get('summary'), api.get('ledger')]);
  const otherPay = Math.max(0, s.payments - s.salary);
  const top = [...ledger].filter((o) => o.amount > 0).sort((a, b) => b.profit - a.profit).slice(0, 10);
  const worst = [...ledger].filter((o) => o.amount > 0 && o.cost > 0).sort((a, b) => a.profit - b.profit).slice(0, 10);
  const tr = (o) => `<tr class="click" onclick="location.hash='#/orders/${o.id}'"><td>${esc(o.inv)}</td><td>${esc(o.client)}</td><td class="num">${money(o.amount, 2)}</td><td class="num">${money(o.cost, 2)}</td><td class="num ${o.profit < 0 ? 'neg' : ''}">${money(o.profit, 2)}</td></tr>`;
  el.innerHTML = `<div class="ph"><h1>Reports</h1><span class="sub">Yearly summary and ledger — the same figures as your Excel “Setup” ledger and yearly summary</span></div>
  <div class="cols2" style="align-items:start">
   <div class="card"><h3>Yearly summary (BD)</h3><table class="grid"><thead><tr><th>Year</th><th class="num">Invoiced</th><th class="num">Received</th><th class="num">Purchases</th><th class="num">Payments</th></tr></thead><tbody>${s.byYear.map((y) => `<tr><td><b>${y.y}</b></td><td class="num">${money(y.invoiced, 2)}</td><td class="num">${money(y.received, 2)}</td><td class="num">${money(y.purchases, 2)}</td><td class="num">${money(y.payments, 2)}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="num">${money(s.invoiced, 2)}</td><td class="num">${money(s.received, 2)}</td><td class="num">${money(s.purchases, 2)}</td><td class="num">${money(s.payments, 2)}</td></tr></tfoot></table>
    <div style="margin-top:14px">${barChart(s.byYear.map((y) => ({ label: y.y, a: y.invoiced, b: y.received })))}</div></div>
   <div class="card"><h3>Ledger</h3><table class="grid"><thead><tr><th>Ledger</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
     <tr><td>Collected receivable</td><td></td><td class="num">${money(s.received, 2)}</td></tr><tr><td>Trade receivable (still due)</td><td></td><td class="num">${money(s.balance, 2)}</td></tr>
     <tr><td>Purchases</td><td class="num">${money(s.purchases, 2)}</td><td></td></tr><tr><td>Salary</td><td class="num">${money(s.salary, 2)}</td><td></td></tr><tr><td>Other payments &amp; expenses</td><td class="num">${money(otherPay, 2)}</td><td></td></tr></tbody>
     <tfoot><tr><td>Result (received − purchases − payments)</td><td class="num" colspan="2">${money(s.received - s.purchases - s.payments, 2)}</td></tr></tfoot></table>
     <p class="muted" style="margin-top:8px">Salary = payments whose “paid to” contains an employee’s name.</p></div>
  </div>
  <div class="cols2" style="margin-top:14px;align-items:start">
   <div class="card"><h3>Most profitable orders</h3><table class="grid"><thead><tr><th>Inv</th><th>Client</th><th class="num">Amount</th><th class="num">Purchases</th><th class="num">Profit</th></tr></thead><tbody>${top.map(tr).join('')}</tbody></table></div>
   <div class="card"><h3>Lowest margin orders (with purchases)</h3><table class="grid"><thead><tr><th>Inv</th><th>Client</th><th class="num">Amount</th><th class="num">Purchases</th><th class="num">Profit</th></tr></thead><tbody>${worst.map(tr).join('')}</tbody></table></div>
  </div>`;
}
