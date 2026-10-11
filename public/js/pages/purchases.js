import { S, refresh } from '../app.js';
import { api, $, esc, money, dmy, today, dataTable, editRow, confirmBox, toast, guard, datalist } from '../ui.js';

export async function render(el) {
  const [rows, ledger] = await Promise.all([api.get('t/purchases'), api.get('ledger')]);
  const suppliers = [...new Set(rows.map((r) => r.supplier))];
  el.innerHTML = `<div class="ph"><h1>Purchases</h1><span class="sub">Materials and supplies, optionally charged to an order so profit per order is accurate</span><span class="grow"></span><button class="btn primary" id="new">+ New purchase</button></div>${datalist('dl-sup', suppliers)}${datalist('dl-ord', ledger.map((o) => o.inv))}<div id="t"></div>`;
  const fields = [{ key: 'date', label: 'Date', type: 'date' }, { key: 'supplier', label: 'Supplier', list: 'dl-sup', required: true }, { key: 'invoice', label: 'Supplier invoice #' }, { key: 'pv', label: 'Payment voucher #' }, { key: 'amount', label: 'Amount (BD)', type: 'number', required: true }, { key: 'order_inv', label: 'Charge to order', list: 'dl-ord', hint: 'Order / invoice # (optional)' }, { key: 'note', label: 'Note', full: true }];
  const open = (row) => editRow({ table: 'purchases', title: row ? 'Edit purchase' : 'New purchase', fields, row, defaults: { date: today() }, extra: datalist('dl-sup', suppliers) + datalist('dl-ord', ledger.map((o) => o.inv)), onSaved: async () => render(el) });
  $('#new', el).onclick = () => open(null);
  const t = $('#t', el);
  dataTable(t, {
    rows, search: ['supplier', 'invoice', 'pv', 'order_inv', 'note'], page: 60,
    cols: [{ key: 'date', label: 'Date', render: (r) => dmy(r.date) }, { key: 'supplier', label: 'Supplier' }, { key: 'invoice', label: 'Invoice' }, { key: 'pv', label: 'P.V.' }, { key: 'order_inv', label: 'Order' }, { key: 'amount', label: 'Amount', num: true, render: (r) => money(r.amount, 3) }],
    onRow: open, actions: () => '<button class="btn sm danger" data-act="del">Delete</button>',
    foot: (l) => `<tr><td colspan="5">Total (${l.length})</td><td class="num">${money(l.reduce((s, r) => s + r.amount, 0), 3)}</td><td></td></tr>`,
  });
  t.addEventListener('act', guard(async (e) => { if (e.detail.act === 'del' && await confirmBox('Delete this purchase?')) { await api.del(`t/purchases/${e.detail.row.id}`); toast('Deleted'); render(el); } }));
}
