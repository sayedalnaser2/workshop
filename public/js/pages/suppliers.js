import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, dataTable, editRow, confirmBox, toast, guard } from '../ui.js';

export async function render(el) {
  let tab = sessionStorage.getItem('sup-tab') || 'suppliers';
  const draw = async () => {
    const suppliers = await api.get('t/suppliers'); const items = await api.get('t/items');
    el.innerHTML = `<div class="ph"><h1>Suppliers &amp; Catalogue</h1><span class="sub">Who you buy from and their item prices — used when you make a purchase order</span><span class="grow"></span><button class="btn primary" id="new">+ ${tab === 'suppliers' ? 'New supplier' : 'New item'}</button></div>
      <div class="tbar"><div class="seg"><button data-t="suppliers" class="${tab === 'suppliers' ? 'on' : ''}">Suppliers (${suppliers.length})</button><button data-t="items" class="${tab === 'items' ? 'on' : ''}">Item catalogue (${items.length})</button></div></div><div id="t"></div>`;
    $$('.seg button', el).forEach((b) => (b.onclick = () => { tab = b.dataset.t; sessionStorage.setItem('sup-tab', tab); draw(); }));
    const t = $('#t', el);
    if (tab === 'suppliers') {
      const fields = [{ key: 'name', label: 'Name', required: true, full: true }, { key: 'phone', label: 'Phone' }, { key: 'phone2', label: 'Phone 2' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' }, { key: 'note', label: 'Note', full: true }];
      const open = (row) => editRow({ table: 'suppliers', title: row ? 'Edit supplier' : 'New supplier', fields, row, onSaved: async () => draw() });
      $('#new', el).onclick = () => open(null);
      dataTable(t, { rows: suppliers.map((s) => ({ ...s, n: items.filter((i) => i.supplier === s.name).length })), search: ['name', 'phone', 'email', 'address'], cols: [{ key: 'name', label: 'Supplier', render: (r) => `<b>${esc(r.name)}</b>` }, { key: 'phone', label: 'Phone' }, { key: 'phone2', label: 'Phone 2' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' }, { key: 'n', label: 'Items', num: true }], onRow: open, actions: () => '<button class="btn sm danger" data-act="del">Delete</button>' });
    } else {
      const fields = [{ key: 'name', label: 'Item name', required: true, full: true }, { key: 'code', label: 'Code' }, { key: 'kind', label: 'Kind', type: 'select', options: [['profile', 'Aluminium profile'], ['glass', 'Glass'], ['accessory', 'Accessory / hardware'], ['other', 'Other']] }, { key: 'series', label: 'Series / group' }, { key: 'supplier', label: 'Supplier', type: 'select', options: ['', ...suppliers.map((s) => s.name)] }, { key: 'unit', label: 'Unit (bar, m², ea…)' }, { key: 'price', label: 'Price (BD)', type: 'number' },
        { key: 'profile_id', label: 'Linked profile (models)', type: 'select', options: [['', '— none —'], ...S.profiles.map((p) => [p.id, `${p.series || ''} · ${p.name}`])] }, { key: 'glass_id', label: 'Linked glass type', type: 'select', options: [['', '— none —'], ...S.glass_types.map((g) => [g.id, g.name])] }, { key: 'accessory_id', label: 'Linked accessory', type: 'select', options: [['', '— none —'], ...S.accessories.map((a) => [a.id, a.name])] }, { key: 'note', label: 'Note', full: true }];
      const open = (row) => editRow({ table: 'items', title: row ? 'Edit item' : 'New catalogue item', fields, row, defaults: { kind: 'profile', unit: 'bar' }, before: (d) => ({ ...d, profile_id: d.profile_id ? Number(d.profile_id) : null, glass_id: d.glass_id ? Number(d.glass_id) : null, accessory_id: d.accessory_id ? Number(d.accessory_id) : null }), onSaved: async () => draw() });
      $('#new', el).onclick = () => open(null);
      dataTable(t, { rows: items, search: ['name', 'code', 'supplier', 'series'], page: 100, cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' }, { key: 'kind', label: 'Kind' }, { key: 'series', label: 'Series' }, { key: 'supplier', label: 'Supplier' }, { key: 'price', label: 'Price', num: true, render: (r) => money(r.price, 3) }, { key: 'profile_id', label: 'Linked', render: (r) => esc(S.profiles.find((p) => p.id === r.profile_id)?.name || S.glass_types.find((g) => g.id === r.glass_id)?.name || S.accessories.find((a) => a.id === r.accessory_id)?.name || '') }], onRow: open, actions: () => '<button class="btn sm danger" data-act="del">Delete</button>' });
    }
    t.addEventListener('act', guard(async (e) => { if (e.detail.act === 'del' && await confirmBox(`Delete ${e.detail.row.name}?`)) { await api.del(`t/${tab}/${e.detail.row.id}`); toast('Deleted'); draw(); } }));
  };
  draw();
}
