import { S, refresh } from '../app.js';
import { api, $, esc, money, dmy, today, dataTable, editRow, confirmBox, toast, guard, datalist, badge } from '../ui.js';

export async function render(el) {
  const [rows, ledger] = await Promise.all([api.get('t/purchases'), api.get('ledger')]);
  const suppliers = [...new Set(rows.map((r) => r.supplier))];
  el.innerHTML = `<div class="ph"><h1>Purchases</h1><span class="sub">Materials and supplies, optionally charged to an order so profit per order is accurate</span><span class="grow"></span><button class="btn primary" id="new">+ New purchase</button></div>${datalist('dl-sup', suppliers)}${datalist('dl-ord', ledger.map((o) => o.inv))}<div id="t"></div>`;
  const fields = [{ key: 'date', label: 'Date', type: 'date' }, { key: 'supplier', label: 'Supplier', list: 'dl-sup', required: true }, { key: 'invoice', label: 'Supplier invoice #' }, { key: 'pv', label: 'Payment voucher #' }, { key: 'amount', label: 'Amount incl. VAT (BD)', type: 'number', required: true }, { key: 'vat', label: 'VAT included in the amount (BD)', type: 'number', hint: 'From the supplier invoice. Leave empty if unknown.' }, { key: 'order_inv', label: 'Charge to order', list: 'dl-ord', hint: 'Order / invoice # (optional)' }, { key: 'note', label: 'Note', full: true }];
  const open = (row) => editRow({ table: 'purchases', title: row ? 'Edit purchase' : 'New purchase', fields, row, defaults: { date: today() }, extra: datalist('dl-sup', suppliers) + datalist('dl-ord', ledger.map((o) => o.inv)), setup: (w) => { const v = $('[name=vat]', w); const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; const rate = Number(S.settings.vat_rate ?? 10); b.textContent = `Work out ${rate}% VAT`; b.onclick = () => { const a = parseFloat($('[name=amount]', w).value) || 0; v.value = Math.round(a * rate / (100 + rate) * 1000) / 1000; }; v.closest('label').appendChild(b); }, onSaved: async () => render(el) });
  $('#new', el).onclick = () => open(null);
  const t = $('#t', el);
  dataTable(t, {
    rows, search: ['supplier', 'invoice', 'pv', 'order_inv', 'note'], page: 60,
    cols: [{ key: 'date', label: 'Date', render: (r) => (r.hidden ? `<s class="muted">${dmy(r.date)}</s> ` + badge('hidden', 'warn') : dmy(r.date)) }, { key: 'supplier', label: 'Supplier' }, { key: 'invoice', label: 'Invoice' }, { key: 'pv', label: 'P.V.' }, { key: 'order_inv', label: 'Order' }, { key: 'vat', label: 'VAT', num: true, render: (r) => (r.vat != null ? money(r.vat, 3) : '') }, { key: 'amount', label: 'Amount', num: true, render: (r) => money(r.amount, 3) }],
    onRow: open, actions: (r) => `<button class="btn sm" data-act="hide" title="Hidden purchases are ignored in every total">${r.hidden ? 'Show' : 'Hide'}</button> <button class="btn sm danger" data-act="del">Delete</button>`,
    filters: [{ label: 'Active', fn: (r) => !r.hidden }, { label: 'Hidden', fn: (r) => r.hidden }, { label: 'All' }],
    foot: (l) => { const a = l.filter((r) => !r.hidden); return `<tr><td colspan="5">Total (${a.length}${l.length !== a.length ? ', hidden ones not counted' : ''})</td><td class="num">${money(a.reduce((s, r) => s + (r.vat || 0), 0), 3)}</td><td class="num">${money(a.reduce((s, r) => s + r.amount, 0), 3)}</td><td></td></tr>`; },
  });
  t.addEventListener('act', guard(async (e) => { if (e.detail.act === 'hide') { await api.put(`t/purchases/${e.detail.row.id}`, { hidden: e.detail.row.hidden ? 0 : 1 }); toast(e.detail.row.hidden ? 'Purchase counted again' : 'Purchase hidden — ignored in all totals'); render(el); }
  if (e.detail.act === 'del' && await confirmBox('Delete this purchase?')) { await api.del(`t/purchases/${e.detail.row.id}`); toast('Deleted'); render(el); } }));
}
