import { S, refresh } from '../app.js';
import { api, $, esc, money, dataTable, editRow, toast, guard, badge } from '../ui.js';
import { canWrite } from '../perm.js';

const TYPES = [['area', 'Per m² (windows: W×H, rounded to 5)'], ['fixed', 'Fixed price per unit'], ['length', 'Per metre of width (railings; height ignored)']];
const noVat = (r) => r.vat === 0;
/** Price-list items split by VAT: those that carry VAT and those that don't. Items can be moved from one list to the other. */
export async function renderVatItems(el, withVat) {
  const all = (await api.get('t/price_items')).filter((r) => r.type !== 'note'); const rows = all.filter((r) => (withVat ? !noVat(r) : noVat(r)));
  const write = canWrite(S.me, 'price_items'); const rate = Number(S.settings.vat_rate ?? 10);
  el.innerHTML = `<div class="ph"><h1>${withVat ? 'Items with VAT' : 'Items without VAT'}</h1><span class="sub">${withVat ? `Price-list items that are charged VAT (${rate}%). Move one to “without VAT” when it carries none.` : 'Price-list items that carry no VAT. Move one back when VAT applies.'}</span><span class="grow"></span><a class="btn" href="#/${withVat ? 'novatitems' : 'vatitems'}">${withVat ? 'Items without VAT →' : 'Items with VAT →'}</a>${write ? '<button class="btn primary" id="new">+ New item</button>' : ''}</div>
    <div class="cards"><div class="card stat"><div class="k">${withVat ? 'Items with VAT' : 'Items without VAT'}</div><div class="v">${rows.length}</div></div><div class="card stat"><div class="k">${withVat ? 'Items without VAT' : 'Items with VAT'}</div><div class="v">${all.length - rows.length}</div></div></div><div id="t"></div>
    <p class="muted" style="margin-top:10px">This is the default for new quotation lines. Each line on a quotation has its own VAT tickbox, and quotations and invoices already made are not changed.</p>`;
  const fields = [{ key: 'name', label: 'Description (as printed on the quotation)', required: true, full: true }, { key: 'type', label: 'Pricing', type: 'select', options: TYPES }, { key: 'rate', label: 'Rate (BD)', type: 'number' }, { key: 'unit', label: 'Unit', hint: 'm² or ea' }, { key: 'vat', label: 'Charge VAT on this item', type: 'check' }];
  const edit = (row) => editRow({ table: 'price_items', title: row ? 'Edit item' : withVat ? 'New item (with VAT)' : 'New item (without VAT)', fields, row: row && { ...row, vat: row.vat === 0 ? 0 : 1 }, defaults: { type: 'fixed', unit: 'ea', vat: withVat ? 1 : 0 }, before: (d) => ({ ...d, sort: row?.sort ?? 9999 }), onSaved: async () => { await refresh(); renderVatItems(el, withVat); } });
  $('#new', el)?.addEventListener('click', () => edit(null));
  const t = $('#t', el);
  dataTable(t, {
    rows, search: ['name'], page: 100, empty: withVat ? 'Every item is without VAT.' : 'No item is without VAT yet. Use “Move to without VAT” on an item in the other list.',
    cols: [{ key: 'name', label: 'Description' }, { key: 'type', label: 'Pricing', render: (r) => badge(r.type === 'area' ? 'per m²' : r.type === 'length' ? 'per metre' : 'fixed', r.type === 'fixed' ? '' : 'blue') }, { key: 'rate', label: 'Rate (BD)', num: true, render: (r) => money(r.rate) }, { key: 'unit', label: 'Unit' },
      ...(withVat ? [{ key: 'vatamt', label: `With ${rate}% VAT`, num: true, render: (r) => money((Number(r.rate) || 0) * (1 + rate / 100)) }] : [])],
    onRow: write ? edit : undefined, actions: write ? () => `<button class="btn sm" data-act="flip">${withVat ? 'Move to without VAT' : 'Move to with VAT'}</button>` : undefined,
  });
  t.addEventListener('act', guard(async (e) => { if (e.detail.act !== 'flip') return; await api.put(`t/price_items/${e.detail.row.id}`, { vat: withVat ? 0 : 1 }); await refresh(); toast(withVat ? 'Moved to items without VAT' : 'Moved to items with VAT'); renderVatItems(el, withVat); }));
}
export const render = (el) => renderVatItems(el, true);
