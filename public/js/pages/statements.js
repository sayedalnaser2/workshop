import { api, $, esc, money, dmy, today, dataTable } from '../ui.js';
import { printView, docHeader, L, AR } from '../doc.js';
import { customerLedger } from '../accounting.js';

const PK = ['st-from', 'st-to']; // the period is remembered while you move between the list and a statement
const getP = () => { try { return PK.map((k) => sessionStorage.getItem(k) || ''); } catch { return ['', '']; } };
const setP = (i, v) => { try { sessionStorage.setItem(PK[i], v); } catch {} };
const periodText = (from, to) => (from || to ? `${from ? dmy(from) : '…'} – ${to ? dmy(to) : dmy(today())}` : 'All dates');

export async function render(el, [client]) {
  const [ledger, receipts, credits, accounts] = await Promise.all([api.get('ledger'), api.get('t/receipts'), api.get('t/credit_notes'), api.get('t/accounts').catch(() => [])]);
  const approved = credits.filter((c) => c.status === 'approved'); const ar = accounts.find((a) => a.sys === 'ar');
  if (client) return statement(el, decodeURIComponent(client), ledger, receipts, approved, ar);
  let [from, to] = getP();
  const draw = () => {
    const names = new Map(); for (const o of ledger) names.set((o.client || '—').trim().toUpperCase(), o.client || '—');
    const rows = [...names.values()].map((c) => { const l = customerLedger(c, ledger, receipts, approved, from, to); return { client: c, entries: l.entries.length, opening: l.opening, amount: l.debit, paid: l.credit, balance: l.balance }; }).filter((r) => r.entries || r.balance || r.opening);
    el.innerHTML = `<div class="ph"><h1>Customer Statements</h1><span class="sub">Pick a customer to see — and print — everything invoiced and collected${ar ? ` · control account ${esc(ar.code)}` : ''}</span><span class="grow"></span><label class="muted">From <input id="f" type="date" value="${esc(from)}"></label> <label class="muted">to <input id="t" type="date" value="${esc(to)}"></label></div><div id="t2"></div>`;
    $('#f', el).onchange = (e) => { from = e.target.value; setP(0, from); draw(); }; $('#t', el).onchange = (e) => { to = e.target.value; setP(1, to); draw(); };
    dataTable($('#t2', el), {
      rows, search: ['client'], page: 60,
      cols: [{ key: 'client', label: 'Customer' }, { key: 'entries', label: 'Entries', num: true }, ...(from ? [{ key: 'opening', label: 'Brought forward', num: true, render: (r) => money(r.opening, 2) }] : []), { key: 'amount', label: 'Invoiced', num: true, render: (r) => money(r.amount, 2) }, { key: 'paid', label: 'Paid', num: true, render: (r) => money(r.paid, 2) }, { key: 'balance', label: to ? `Balance at ${dmy(to)}` : 'Balance', num: true, render: (r) => `<b class="${r.balance > 0 ? 'neg' : ''}">${money(r.balance, 2)}</b>` }],
      filters: [{ label: 'All' }, { label: 'With balance', fn: (r) => r.balance > 0.0005 }], onRow: (r) => (location.hash = `#/statements/${encodeURIComponent(r.client)}`),
    });
  };
  draw();
}

function statement(el, client, ledger, receipts, credits, ar) {
  let [from, to] = getP();
  const draw = () => {
    const l = customerLedger(client, ledger, receipts, credits, from, to);
    const html = `${docHeader('ACCOUNT STATEMENT', AR.statement)}<div class="meta"><div><b>${L('customer', 'Customer')}:</b> ${esc(client)}</div><div><b>${L('date', 'DATE')}:</b> ${dmy(today())}</div>${ar ? `<div><b>${L('account', 'Account')}:</b> ${esc(ar.code)} — ${esc(ar.name)}</div>` : ''}<div><b>${L('period', 'Period')}:</b> ${esc(periodText(from, to))}</div></div>
      <table><thead><tr><th>${L('date', 'Date')}</th><th>${L('description', 'Description')}</th><th class="n">${L('debit', 'Debit')}</th><th class="n">${L('credit', 'Credit')}</th><th class="n">${L('balance', 'Balance')}</th></tr></thead><tbody>${from ? `<tr><td>${dmy(from)}</td><td><i>Balance brought forward</i></td><td></td><td></td><td class="n">${money(l.opening, 2)}</td></tr>` : ''}${l.entries.map((e) => `<tr><td>${dmy(e.date)}</td><td>${esc(e.desc)}</td><td class="n">${e.debit ? money(e.debit, 2) : ''}</td><td class="n">${e.credit ? money(e.credit, 2) : ''}</td><td class="n">${money(e.bal, 2)}</td></tr>`).join('') || '<tr><td colspan="5">No entries in this period.</td></tr>'}
      <tr><td colspan="2"><b>${L('total', 'Total')}</b></td><td class="n"><b>${money(l.debit, 2)}</b></td><td class="n"><b>${money(l.credit, 2)}</b></td><td class="n"><b>${money(l.balance, 2)}</b></td></tr></tbody></table>
      <p style="margin-top:14px;font-size:14px"><b>${L('balance', 'Balance')} BD ${money(l.balance, 2)}</b></p>`;
    printView(el, { back: '#/statements', html, extraButtons: `<label class="muted" style="margin-left:12px">From <input id="f" type="date" value="${esc(from)}"></label> <label class="muted">to <input id="t" type="date" value="${esc(to)}"></label>` });
    $('#f', el).onchange = (e) => { from = e.target.value; setP(0, from); draw(); }; $('#t', el).onchange = (e) => { to = e.target.value; setP(1, to); draw(); };
  };
  draw();
}
