import { S, refresh } from '../app.js';
import { api, $, esc, money, dmy, today, dataTable, editRow, confirmBox, toast, guard, badge, modal } from '../ui.js';

export async function render(el, [id]) {
  if (id) return detail(el, Number(id));
  const rows = await api.get('ledger');
  const sum = (k, l = rows) => l.reduce((s, r) => s + (r[k] || 0), 0);
  el.innerHTML = `<div class="ph"><h1>Orders &amp; Invoices</h1><span class="sub">Customer ledger — what was sold, collected and what is still due</span><span class="grow"></span><button class="btn primary" id="new">+ New order</button></div>
    <div class="cards"><div class="card stat"><div class="k">Invoiced</div><div class="v">${money(sum('amount'), 2)}</div></div><div class="card stat"><div class="k">Collected</div><div class="v">${money(sum('paid'), 2)}</div></div><div class="card stat"><div class="k">Outstanding</div><div class="v ${sum('balance') > 0 ? 'neg' : ''}">${money(sum('balance'), 2)}</div></div><div class="card stat"><div class="k">Profit (invoiced − linked purchases)</div><div class="v">${money(sum('profit'), 2)}</div></div></div><div id="t"></div>`;
  const fields = [
    { key: 'inv', label: 'Invoice / order #', hint: 'Leave blank for the next number: ' + S.next.invoice }, { key: 'date', label: 'Date', type: 'date' },
    { key: 'client', label: 'Client', required: true }, { key: 'mobile', label: 'Mobile' }, { key: 'site', label: 'Site' },
    { key: 'amount', label: 'Gross amount (BD)', type: 'number' }, { key: 'done', label: 'Work completed', type: 'check' }, { key: 'note', label: 'Note', full: true },
  ];
  const open = (row) => editRow({ table: 'orders', title: row ? `Edit ${row.inv}` : 'New order', fields, row, defaults: { date: today() }, onSaved: async () => { await refresh(); render(el, []); } });
  $('#new', el).onclick = () => open(null);
  const t = $('#t', el);
  dataTable(t, {
    rows, search: ['inv', 'client', 'site', 'mobile'], page: 60,
    cols: [
      { key: 'inv', label: 'Inv', render: (r) => `<b>${esc(r.inv)}</b>` }, { key: 'date', label: 'Date', render: (r) => dmy(r.date) },
      { key: 'client', label: 'Client' }, { key: 'site', label: 'Site' }, { key: 'mobile', label: 'Mobile' },
      { key: 'amount', label: 'G.Amount', num: true, render: (r) => money(r.amount, 2) }, { key: 'paid', label: 'Paid', num: true, render: (r) => money(r.paid, 2) },
      { key: 'balance', label: 'Balance', num: true, render: (r) => `<span class="${r.balance > 0.0005 ? 'neg' : ''}">${money(r.balance, 2)}</span>` },
      { key: 'profit', label: 'Profit', num: true, render: (r) => money(r.profit, 2) },
      { key: 'done', label: 'Status', render: (r) => (r.done ? badge('Done', 'ok') : badge('Open', 'warn')) },
    ],
    filters: [{ label: 'All' }, { label: 'Open', fn: (r) => !r.done }, { label: 'Unpaid', fn: (r) => r.balance > 0.0005 }],
    onRow: (r) => (location.hash = `#/orders/${r.id}`),
    actions: () => '<button class="btn sm" data-act="edit">Edit</button>',
    foot: (l) => `<tr><td colspan="5">Total (${l.length})</td><td class="num">${money(sum('amount', l), 2)}</td><td class="num">${money(sum('paid', l), 2)}</td><td class="num">${money(sum('balance', l), 2)}</td><td class="num">${money(sum('profit', l), 2)}</td><td colspan="2"></td></tr>`,
  });
  t.addEventListener('act', (e) => open(e.detail.row));
}

async function detail(el, id) {
  const [ledger, receipts, purchases] = await Promise.all([api.get('ledger'), api.get('t/receipts'), api.get('t/purchases')]);
  const o = ledger.find((x) => x.id === id); if (!o) { el.innerHTML = '<p class="err">Order not found</p>'; return; }
  const rec = receipts.filter((r) => r.order_inv === o.inv); const pur = purchases.filter((p) => p.order_inv === o.inv);
  el.innerHTML = `<div class="ph"><h1>${esc(o.inv)} — ${esc(o.client)}</h1>${o.done ? badge('Done', 'ok') : badge('Open', 'warn')}<span class="grow"></span><a class="btn" href="#/orders">← Orders</a></div>
  <div class="cards"><div class="card stat"><div class="k">Gross amount</div><div class="v">${money(o.amount, 2)}</div></div><div class="card stat"><div class="k">Paid</div><div class="v">${money(o.paid, 2)}</div></div><div class="card stat"><div class="k">Balance</div><div class="v ${o.balance > 0 ? 'neg' : 'pos'}">${money(o.balance, 2)}</div></div><div class="card stat"><div class="k">Purchases / Profit</div><div class="v">${money(o.cost, 2)} <small class="muted">/ ${money(o.profit, 2)}</small></div></div></div>
  <div class="card"><div class="form" style="grid-template-columns:repeat(4,1fr)"><div><span class="muted">Date</span><br>${dmy(o.date)}</div><div><span class="muted">Site</span><br>${esc(o.site)}</div><div><span class="muted">Mobile</span><br>${esc(o.mobile)}</div><div><span class="muted">Quotation</span><br>${esc(o.quote_no || '—')}</div></div></div>
  <div class="cols2" style="margin-top:14px;align-items:start">
   <div class="card"><h3>Receipts (${rec.length})</h3><table class="grid"><thead><tr><th>Rec #</th><th>Date</th><th class="num">Amount</th><th></th></tr></thead><tbody>${rec.map((r) => `<tr><td>${esc(r.no)}</td><td>${dmy(r.date)}</td><td class="num">${money(r.amount, 2)}</td><td class="act"><a class="btn sm" href="#/receipts/${r.id}/print">Print</a></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No receipts yet</td></tr>'}</tbody></table></div>
   <div class="card"><h3>Purchases charged to this order (${pur.length})</h3><table class="grid"><thead><tr><th>Date</th><th>Supplier</th><th class="num">Amount</th></tr></thead><tbody>${pur.map((p) => `<tr><td>${dmy(p.date)}</td><td>${esc(p.supplier)}</td><td class="num">${money(p.amount, 2)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">None</td></tr>'}</tbody></table></div></div>
  <div class="sticky-actions"><a class="btn primary" href="#/receipts/new/${o.id}">+ Receive payment</a><a class="btn" href="#/statements/${encodeURIComponent(o.client)}">Customer statement</a><button class="btn" id="done">${o.done ? 'Re-open order' : 'Mark as done'}</button><button class="btn danger" id="del">Delete order</button></div>`;
  $('#done', el).onclick = guard(async () => { await api.put(`t/orders/${id}`, { done: o.done ? 0 : 1 }); toast('Updated'); detail(el, id); });
  $('#del', el).onclick = guard(async () => { if (await confirmBox(`Delete order ${o.inv}? Receipts keep their reference.`)) { await api.del(`t/orders/${id}`); location.hash = '#/orders'; } });
}
