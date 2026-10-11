import { api, $, esc, money } from '../ui.js';
import { barChart } from './dashboard.js';

export async function render(el) {
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
