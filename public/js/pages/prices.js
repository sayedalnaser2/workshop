import { S, refresh } from '../app.js';
import { api, $, esc, money, dataTable, editRow, confirmBox, toast, guard, badge } from '../ui.js';
import { guessPriceType } from '../calc.js';

const TYPES = [['area', 'Per m² (windows: W×H, rounded to 5)'], ['fixed', 'Fixed price per unit'], ['length', 'Per metre of width (railings; height ignored)'], ['note', 'Note / option line (no price)']];

export async function render(el) {
  const rows = await api.get('t/price_items');
  el.innerHTML = `<div class="ph"><h1>Price List</h1><span class="sub">Rates used to price quotation lines. Window rates are per m² (size in cm); doors &amp; other items are fixed prices.</span><span class="grow"></span><button class="btn primary" id="new">+ New item</button></div><div id="t"></div>
  <div class="card" style="margin-top:14px"><b>How prices are calculated</b><p class="muted" style="margin:6px 0 0">For a <i>per m²</i> item: price = round( width × height × rate ÷ 10 000 ÷ 5 ) × 5 — the same rule as your Excel sheet. A <i>fixed</i> item always uses its rate. You can still overwrite the price on any quotation line.</p></div>`;
  const fields = [
    { key: 'name', label: 'Description (as printed on the quotation)', required: true, full: true },
    { key: 'type', label: 'Pricing', type: 'select', options: TYPES },
    { key: 'rate', label: 'Rate (BD)', type: 'number' },
    { key: 'unit', label: 'Unit', hint: 'm² or ea' },
    { key: 'model_id', label: 'Linked model', type: 'select', options: [['', '— none —'], ...S.models.map((m) => [m.id, `${m.name} (${m.series || ''})`])] },
    { key: 'note', label: 'Internal note', full: true },
  ];
  const open = (row) => editRow({
    table: 'price_items', title: row ? 'Edit price item' : 'New price item', fields, row, defaults: { type: 'fixed', unit: 'ea' },
    before: (d) => ({ ...d, model_id: d.model_id ? Number(d.model_id) : null, sort: row?.sort ?? 9999 }), onSaved: async () => { await refresh(); render(el); },
  });
  $('#new', el).onclick = () => open(null);
  const t = $('#t', el);
  dataTable(t, {
    rows, search: ['name', 'note'], page: 100,
    cols: [
      { key: 'name', label: 'Description' },
      { key: 'type', label: 'Pricing', render: (r) => badge(r.type === 'area' ? 'per m²' : r.type === 'length' ? 'per metre' : r.type === 'note' ? 'note' : 'fixed', r.type === 'area' || r.type === 'length' ? 'blue' : '') },
      { key: 'rate', label: 'Rate (BD)', num: true, render: (r) => (r.type === 'note' ? '' : money(r.rate)) },
      { key: 'model_id', label: 'Model', render: (r) => esc(S.models.find((m) => m.id === r.model_id)?.name || '') },
    ],
    onRow: open, actions: () => '<button class="btn sm danger" data-act="del">Delete</button>',
  });
  t.addEventListener('act', guard(async (e) => { if (e.detail.act === 'del' && await confirmBox('Delete this price item?')) { await api.del(`t/price_items/${e.detail.row.id}`); await refresh(); toast('Deleted'); render(el); } }));
}
