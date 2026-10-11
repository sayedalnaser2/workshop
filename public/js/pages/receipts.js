import { S, refresh } from '../app.js';
import { api, $, esc, money, dmy, today, dataTable, editRow, confirmBox, toast, guard, datalist, num, wireRef, requireRef, REF_LABEL } from '../ui.js';
import { amountInWords } from '../calc.js';
import { printView, docHeader } from '../doc.js';

export async function render(el, [a, b, c]) {
  if (a === 'new') return form(el, b ? Number(b) : null);
  if (a && b === 'print') return print(el, Number(a));
  return list(el);
}

async function list(el) {
  const rows = await api.get('t/receipts');
  el.innerHTML = `<div class="ph"><h1>Customer Receipts</h1><span class="sub">Money collected from customers, per order</span><span class="grow"></span><a class="btn primary" href="#/receipts/new">+ New receipt</a></div><div id="t"></div>`;
  const t = $('#t', el);
  dataTable(t, {
    rows, search: ['no', 'order_inv', 'client', 'method', 'ref'], page: 60,
    cols: [{ key: 'no', label: 'Rec #', render: (r) => `<b>${esc(r.no)}</b>` }, { key: 'date', label: 'Date', render: (r) => dmy(r.date) }, { key: 'order_inv', label: 'Order' }, { key: 'client', label: 'Client' }, { key: 'method', label: 'Paid by', render: (r) => esc(r.method || '') + (r.ref ? ` <span class="muted">#${esc(r.ref)}</span>` : '') }, { key: 'amount', label: 'Amount', num: true, render: (r) => money(r.amount, 2) }],
    onRow: (r) => (location.hash = `#/receipts/${r.id}/print`),
    actions: () => '<button class="btn sm" data-act="edit">Edit</button> <button class="btn sm danger" data-act="del">Delete</button>',
    foot: (l) => `<tr><td colspan="5">Total (${l.length})</td><td class="num">${money(l.reduce((s, r) => s + r.amount, 0), 2)}</td><td></td></tr>`,
  });
  t.addEventListener('act', guard(async (e) => {
    const { act, row } = e.detail;
    if (act === 'del' && await confirmBox(`Delete receipt ${row.no}?`)) { await api.del(`t/receipts/${row.id}`); await refresh(); list(el); }
    if (act === 'edit') editRow({ table: 'receipts', title: `Edit ${row.no}`, row, fields: fields([]), before: (d, w) => requireRef(d, w), setup: (w) => wireRef(w), onSaved: async () => list(el) });
  }));
}
const fields = (orders) => [
  { key: 'no', label: 'Receipt #', hint: 'Leave blank for the next number: ' + S.next.receipt }, { key: 'date', label: 'Date', type: 'date' },
  { key: 'order_inv', label: 'Order / invoice #', list: 'dl-orders' }, { key: 'client', label: 'Client' },
  { key: 'amount', label: 'Amount (BD)', type: 'number', required: true }, { key: 'method', label: 'Paid by', type: 'select', options: ['', 'Cash', 'Benefit', 'Cheque', 'Bank transfer'] }, { key: 'ref', label: 'Reference number' }, { key: 'account', label: 'Paid into', type: 'select', options: [['', 'Automatic (cash → cash box, others → bank)'], ['cash', 'Cash box'], ['bank', 'Bank account']] }, { key: 'note', label: 'Note', full: true },
];

async function form(el, orderId) {
  const ledger = await api.get('ledger');
  const o = orderId ? ledger.find((x) => x.id === orderId) : null;
  el.innerHTML = `<div class="ph"><h1>New receipt</h1><span class="grow"></span><a class="btn" href="#/receipts">← Receipts</a></div>${datalist('dl-orders', ledger.filter((x) => x.balance > 0.0005 || x.id === orderId).map((x) => x.inv))}<div class="card" style="max-width:720px"><div id="f"></div><p class="muted" id="info"></p></div>`;
  const { formHTML, readForm } = await import('../ui.js');
  const defaults = { date: today(), order_inv: o?.inv || '', client: o?.client || '', amount: o && o.balance > 0 ? o.balance : '' };
  $('#f', el).innerHTML = formHTML(fields(), defaults) + '<div style="margin-top:14px;display:flex;gap:8px"><button class="btn primary" id="save">Save &amp; print</button><button class="btn" id="saveOnly">Save</button></div>';
  wireRef($('#f', el));
  const info = () => { const x = ledger.find((l) => l.inv === $('[name=order_inv]', el).value.trim()); if (x) { if (!$('[name=client]', el).value) $('[name=client]', el).value = x.client; $('#info', el).innerHTML = `${esc(x.client)} — order ${money(x.amount, 2)}, paid ${money(x.paid, 2)}, <b class="${x.balance > 0 ? 'neg' : 'pos'}">balance ${money(x.balance, 2)}</b>`; } else $('#info', el).textContent = ''; };
  $('[name=order_inv]', el).oninput = info; info();
  const save = (print) => guard(async () => {
    const d = readForm($('#f', el), fields());
    if (!d.amount) return toast('Enter the amount', 'err');
    requireRef(d, $('#f', el));
    if (!d.account) d.account = d.method === 'Cash' ? 'cash' : 'bank';
    const r = await api.post('t/receipts', d); await refresh(); toast(`Saved ${r.no}`);
    location.hash = print ? `#/receipts/${r.id}/print` : '#/receipts';
  });
  $('#save', el).onclick = save(true); $('#saveOnly', el).onclick = save(false);
}

async function print(el, id) {
  const [r, ledger] = await Promise.all([api.get(`t/receipts/${id}`), api.get('ledger')]);
  const o = ledger.find((x) => x.inv === r.order_inv);
  const receipts = (await api.get('t/receipts')).filter((x) => x.order_inv === r.order_inv && (x.date < r.date || (x.date === r.date && x.id <= r.id)));
  const paidBefore = receipts.filter((x) => x.id !== r.id).reduce((s, x) => s + x.amount, 0);
  const html = `${docHeader('RECEIPT')}
    <div class="meta"><div><b>Receipt:</b> ${esc(r.no)}</div><div><b>DATE:</b> ${dmy(r.date)}</div><div><b>Order:</b> ${esc(r.order_inv || '')}</div><div><b>Paid by:</b> ${esc(r.method || '')}${r.ref ? ` — ${esc(REF_LABEL[r.method] || 'Ref')} <b>${esc(r.ref)}</b>` : ''}</div><div style="grid-column:1/-1"><b>Customer:</b> ${esc(r.client || o?.client || '')}</div></div>
    <table><thead><tr><th>Date</th><th>Order</th><th>Customer</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Balance</th></tr></thead><tbody>
      ${o ? `<tr><td>${dmy(o.date)}</td><td>${esc(o.inv)}</td><td>${esc(o.client)}</td><td class="n">${money(o.amount, 2)}</td><td></td><td></td></tr>` : ''}
      ${paidBefore ? `<tr><td></td><td colspan="2">Previous payments</td><td></td><td class="n">${money(paidBefore, 2)}</td><td></td></tr>` : ''}
      <tr><td>${dmy(r.date)}</td><td colspan="2"><b>This receipt ${esc(r.no)}</b></td><td></td><td class="n"><b>${money(r.amount, 2)}</b></td><td class="n"><b>${o ? money(o.amount - paidBefore - r.amount, 2) : ''}</b></td></tr></tbody></table>
    <p style="margin-top:14px"><b>Received the sum of:</b> ${esc(amountInWords(r.amount))}</p>
    ${r.note ? `<p><b>Note:</b> ${esc(r.note)}</p>` : ''}
    <div class="sign"><div>Prepared</div><div>Customer</div></div>
    <div class="terms"><b>Note:</b>${(S.settings.receipt_notes || []).map((t) => `<div>${esc(t)}</div>`).join('')}</div>`;
  printView(el, { back: '#/receipts', html });
}
