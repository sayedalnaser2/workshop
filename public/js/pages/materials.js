import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, dataTable, editRow, confirmBox, toast, guard } from '../ui.js';

const TABS = {
  profiles: {
    label: 'Aluminium profiles', title: 'profile', blank: { bar_length: 600 },
    fields: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name', required: true }, { key: 'series', label: 'Series' }, { key: 'color', label: 'Colour / finish' }, { key: 'bar_length', label: 'Bar length (cm)', type: 'number' }, { key: 'price_bar', label: 'Price per bar (BD)', type: 'number' }, { key: 'weight_m', label: 'Weight kg/m', type: 'number' }, { key: 'min_qty', label: 'Alert when new stock falls below (bars)', type: 'number', hint: 'Leave empty for no alert' }],
    cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'series', label: 'Series' }, { key: 'color', label: 'Finish' }, { key: 'bar_length', label: 'Bar cm', num: true }, { key: 'price_bar', label: 'Price / bar', num: true, render: (r) => money(r.price_bar) }, { key: 'min_qty', label: 'Alert below', num: true, render: (r) => (r.min_qty ? r.min_qty : '') }],
    search: ['code', 'name', 'series'],
  },
  glass_types: {
    label: 'Glass types', title: 'glass type', blank: {},
    fields: [{ key: 'name', label: 'Name', required: true }, { key: 'thickness', label: 'Thickness' }, { key: 'price_m2', label: 'Price per m² (BD)', type: 'number' }, { key: 'min_qty', label: 'Alert when new stock falls below (sheets)', type: 'number', hint: 'Leave empty for no alert' }],
    cols: [{ key: 'name', label: 'Name' }, { key: 'thickness', label: 'Thickness' }, { key: 'price_m2', label: 'Price / m²', num: true, render: (r) => money(r.price_m2) }, { key: 'min_qty', label: 'Alert below', num: true, render: (r) => (r.min_qty ? r.min_qty : '') }], search: ['name'],
  },
  accessories: {
    label: 'Accessories & hardware', title: 'accessory', blank: { unit: 'ea' },
    fields: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name', required: true }, { key: 'unit', label: 'Unit (ea, m, set…)' }, { key: 'price', label: 'Unit price (BD)', type: 'number' }, { key: 'min_qty', label: 'Alert when new stock falls below', type: 'number', hint: 'Leave empty for no alert' }],
    cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'unit', label: 'Unit' }, { key: 'price', label: 'Price', num: true, render: (r) => money(r.price) }, { key: 'min_qty', label: 'Alert below', num: true, render: (r) => (r.min_qty ? r.min_qty : '') }], search: ['code', 'name'],
  },
};

export async function render(el) {
  let tab = sessionStorage.getItem('mat-tab') || 'profiles';
  const draw = async () => {
    const cfg = TABS[tab];
    const rows = await api.get(`t/${tab}`);
    el.innerHTML = `<div class="ph"><h1>Profiles, Glass &amp; Accessories</h1><span class="sub">Material library used by Models, cutting lists and cost estimates</span></div>
      <div class="tbar"><div class="seg">${Object.entries(TABS).map(([k, c]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${c.label}</button>`).join('')}</div><span class="grow"></span><button class="btn primary" id="new">+ New ${cfg.title}</button></div><div id="t"></div>`;
    $$('.seg button', el).forEach((b) => (b.onclick = () => { tab = b.dataset.t; sessionStorage.setItem('mat-tab', tab); draw(); }));
    const open = (row) => editRow({ table: tab, title: row ? `Edit ${cfg.title}` : `New ${cfg.title}`, fields: cfg.fields, row, defaults: cfg.blank, onSaved: async () => { await refresh(); draw(); } });
    $('#new', el).onclick = () => open(null);
    const t = $('#t', el);
    dataTable(t, { cols: cfg.cols, rows, search: cfg.search, page: 200, onRow: open, actions: () => '<button class="btn sm danger" data-act="del">Delete</button>' });
    t.addEventListener('act', guard(async (e) => { if (e.detail.act === 'del' && await confirmBox(`Delete "${e.detail.row.name}"?`)) { await api.del(`t/${tab}/${e.detail.row.id}`); await refresh(); toast('Deleted'); draw(); } }));
  };
  draw();
}
