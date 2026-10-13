import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, qty as fq, num, dataTable, editRow, confirmBox, toast, guard, badge } from '../ui.js';
import { openPoDialog } from '../po-dialog.js';

const KINDS = [['profile', 'Aluminium profile'], ['glass', 'Glass'], ['accessory', 'Accessory / hardware'], ['other', 'Other']];
const KIND_ICON = { profile: '▤', glass: '◻', accessory: '⚙', other: '•' };

const supplierFields = [{ key: 'name', label: 'Name', required: true, full: true }, { key: 'phone', label: 'Phone' }, { key: 'phone2', label: 'Phone 2' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' }, { key: 'note', label: 'Note', full: true }];
const itemFields = (suppliers) => [{ key: 'name', label: 'Item name', required: true, full: true }, { key: 'code', label: 'Code' }, { key: 'kind', label: 'Kind', type: 'select', options: KINDS }, { key: 'series', label: 'Series / group' }, { key: 'supplier', label: 'Supplier', type: 'select', options: ['', ...suppliers.map((s) => s.name)] }, { key: 'unit', label: 'Unit (bar, m², ea…)' }, { key: 'price', label: 'Price (BD)', type: 'number' },
  { key: 'profile_id', label: 'Linked profile (models)', type: 'select', options: [['', '— none —'], ...S.profiles.map((p) => [p.id, `${p.series || ''} · ${p.name}`])] }, { key: 'glass_id', label: 'Linked glass type', type: 'select', options: [['', '— none —'], ...S.glass_types.map((g) => [g.id, g.name])] }, { key: 'accessory_id', label: 'Linked accessory', type: 'select', options: [['', '— none —'], ...S.accessories.map((a) => [a.id, a.name])] }, { key: 'note', label: 'Note', full: true }];
const itemBefore = (d) => ({ ...d, profile_id: d.profile_id ? Number(d.profile_id) : null, glass_id: d.glass_id ? Number(d.glass_id) : null, accessory_id: d.accessory_id ? Number(d.accessory_id) : null });
const linkedName = (r) => S.profiles.find((p) => p.id === r.profile_id)?.name || S.glass_types.find((g) => g.id === r.glass_id)?.name || S.accessories.find((a) => a.id === r.accessory_id)?.name || '';
const copyOf = async (row) => { const { id, created_at, ...rest } = row; return api.post('t/items', { ...rest, name: `${row.name} (copy)` }); };

export async function render(el, [id]) {
  if (id) return store(el, Number(id));
  let tab = sessionStorage.getItem('sup-tab') || 'suppliers';
  const draw = async () => {
    const suppliers = await api.get('t/suppliers'); const items = await api.get('t/items');
    el.innerHTML = `<div class="ph"><h1>Suppliers &amp; Catalogue</h1><span class="sub">Who you buy from and their item prices — open a supplier to see their store</span><span class="grow"></span><button class="btn primary" id="new">+ ${tab === 'suppliers' ? 'New supplier' : 'New item'}</button></div>
      <div class="tbar"><div class="seg"><button data-t="suppliers" class="${tab === 'suppliers' ? 'on' : ''}">Suppliers (${suppliers.length})</button><button data-t="items" class="${tab === 'items' ? 'on' : ''}">Item catalogue (${items.length})</button></div></div><div id="t"></div>`;
    $$('.seg button', el).forEach((b) => (b.onclick = () => { tab = b.dataset.t; sessionStorage.setItem('sup-tab', tab); draw(); }));
    const t = $('#t', el);
    if (tab === 'suppliers') {
      const open = (row) => editRow({ table: 'suppliers', title: row ? 'Edit supplier' : 'New supplier', fields: supplierFields, row, onSaved: async () => draw() });
      $('#new', el).onclick = () => open(null);
      dataTable(t, { rows: suppliers.map((s) => ({ ...s, n: items.filter((i) => i.supplier === s.name).length })), search: ['name', 'phone', 'email', 'address'], cols: [{ key: 'name', label: 'Supplier', render: (r) => `<b>${esc(r.name)}</b>` }, { key: 'phone', label: 'Phone' }, { key: 'phone2', label: 'Phone 2' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' }, { key: 'n', label: 'Products', num: true }], onRow: (r) => (location.hash = `#/suppliers/${r.id}`), actions: () => '<button class="btn sm primary" data-act="store">Store</button> <button class="btn sm" data-act="edit">Edit</button> <button class="btn sm danger" data-act="del">Delete</button>' });
      t.addEventListener('act', guard(async (e) => { const { act, row } = e.detail; if (act === 'store') location.hash = `#/suppliers/${row.id}`; if (act === 'edit') open(row); if (act === 'del' && await confirmBox(`Delete ${row.name}?`)) { await api.del(`t/suppliers/${row.id}`); toast('Deleted'); draw(); } }));
    } else {
      const open = (row) => editRow({ table: 'items', title: row ? 'Edit item' : 'New catalogue item', fields: itemFields(suppliers), row, defaults: { kind: 'profile', unit: 'bar' }, before: itemBefore, onSaved: async () => draw() });
      $('#new', el).onclick = () => open(null);
      dataTable(t, { rows: items, search: ['name', 'code', 'supplier', 'series'], page: 100, cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Item' }, { key: 'kind', label: 'Kind' }, { key: 'series', label: 'Series' }, { key: 'supplier', label: 'Supplier' }, { key: 'price', label: 'Price', num: true, render: (r) => money(r.price, 3) }, { key: 'profile_id', label: 'Linked', render: (r) => esc(linkedName(r)) }], onRow: open, actions: () => '<button class="btn sm" data-act="dup" title="Make a copy of this item">Duplicate</button> <button class="btn sm danger" data-act="del">Delete</button>' });
      t.addEventListener('act', guard(async (e) => { const { act, row } = e.detail; if (act === 'dup') { await copyOf(row); toast('Copied — open the copy to change it'); draw(); } if (act === 'del' && await confirmBox(`Delete ${row.name}?`)) { await api.del(`t/items/${row.id}`); toast('Deleted'); draw(); } }));
    }
  };
  draw();
}

/** A supplier's store: their products as cards with prices; pick quantities and make a purchase order from them. */
async function store(el, id) {
  const [suppliers, allItems] = await Promise.all([api.get('t/suppliers'), api.get('t/items')]);
  const sup = suppliers.find((s) => s.id === id); if (!sup) { el.innerHTML = '<p class="err">Supplier not found.</p>'; return; }
  let kind = ''; let q = ''; const cart = new Map(); // item id → qty
  const items = () => allItems.filter((i) => i.supplier === sup.name);
  const reload = async () => { const fresh = await api.get('t/items'); allItems.splice(0, allItems.length, ...fresh); draw(); };
  el.innerHTML = `<div id="st"></div>`; const root = $('#st', el);
  const draw = () => {
    const mine = items(); const shown = mine.filter((i) => (!kind || i.kind === kind) && (!q || [i.name, i.code, i.series].some((v) => String(v || '').toLowerCase().includes(q.toLowerCase()))));
    const lines = [...cart.entries()].map(([iid, n]) => ({ it: mine.find((x) => x.id === iid), n })).filter((x) => x.it && x.n > 0); const total = lines.reduce((s, x) => s + x.n * (x.it.price || 0), 0);
    root.innerHTML = `<div class="ph"><a class="btn" href="#/suppliers">← Suppliers</a><h1>${esc(sup.name)}</h1><span class="sub">${[sup.phone, sup.phone2, sup.email, sup.address].filter(Boolean).map(esc).join(' · ')}</span><span class="grow"></span><button class="btn" id="editSup">Edit supplier</button><button class="btn primary" id="addP">+ Add product</button></div>
      ${sup.note ? `<div class="card" style="margin-bottom:12px">${esc(sup.note)}</div>` : ''}
      <div class="tbar"><input type="search" class="search" id="q" placeholder="Search this store…" value="${esc(q)}"><div class="seg"><button data-k="" class="${kind === '' ? 'on' : ''}">All (${mine.length})</button>${KINDS.map(([k, l]) => `<button data-k="${k}" class="${kind === k ? 'on' : ''}">${l.split(' ')[0]} (${mine.filter((i) => i.kind === k).length})</button>`).join('')}</div></div>
      <div class="mgrid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">${shown.map((i) => `<div class="card" data-id="${i.id}" style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;gap:6px;align-items:flex-start"><span style="font-size:20px;opacity:.6">${KIND_ICON[i.kind] || '•'}</span><div style="flex:1"><b>${esc(i.name)}</b><div class="muted" style="font-size:12px">${[i.code, i.series].filter(Boolean).map(esc).join(' · ')}</div></div></div>
        <div style="font-size:22px;font-weight:700">${i.price ? 'BD ' + money(i.price, 3) : '<span class="muted">no price</span>'} <small class="muted" style="font-size:12px;font-weight:400">per ${esc(i.unit || 'unit')}</small></div>
        ${linkedName(i) ? `<div class="muted" style="font-size:12px">Used for: ${esc(linkedName(i))}</div>` : ''}${i.note ? `<div style="font-size:12px">${esc(i.note)}</div>` : ''}
        <div style="display:flex;gap:6px;align-items:center;margin-top:auto"><input type="number" min="0" step="any" data-qty placeholder="Qty" value="${cart.get(i.id) || ''}" style="width:80px"><button class="btn sm primary" data-add>Add to order</button></div>
        <div style="display:flex;gap:6px"><button class="btn sm" data-edit>Edit</button><button class="btn sm" data-dup>Duplicate</button><button class="btn sm danger" data-del>Delete</button></div></div>`).join('') || `<div class="card muted" style="grid-column:1/-1">${mine.length ? 'Nothing matches.' : 'This supplier has no products yet — add one, or set the supplier on an item in the catalogue.'}</div>`}</div>
      ${lines.length ? `<div class="sticky-actions"><b>${lines.length} product(s) · BD ${money(total, 2)}</b><span class="grow"></span><button class="btn" id="clear">Clear</button><button class="btn primary" id="mkpo">Create purchase order…</button></div>` : ''}`;
    $('#q', root).oninput = (e) => { q = e.target.value; draw(); const i = $('#q', root); i.focus(); i.setSelectionRange(q.length, q.length); };
    $$('.seg button', root).forEach((b) => (b.onclick = () => { kind = b.dataset.k; draw(); }));
    $('#editSup', root).onclick = () => editRow({ table: 'suppliers', title: 'Edit supplier', fields: supplierFields, row: sup, onSaved: async (r) => { Object.assign(sup, r); draw(); } });
    $('#addP', root).onclick = () => editRow({ table: 'items', title: `New product from ${sup.name}`, fields: itemFields(suppliers), defaults: { kind: 'profile', unit: 'bar', supplier: sup.name }, before: itemBefore, onSaved: reload });
    root.onclick = guard(async (e) => {
      const card = e.target.closest('[data-id]'); const it = card && allItems.find((x) => x.id === Number(card.dataset.id));
      if (e.target.closest('#clear')) { cart.clear(); return draw(); }
      if (e.target.closest('#mkpo')) { openPoDialog({ lines: lines.map(({ it: x, n }) => ({ on: true, kind: x.kind || 'other', profile_id: x.profile_id, glass_id: x.glass_id, accessory_id: x.accessory_id, name: x.name, code: x.code, colour: '', qty: n, unit: x.unit || 'ea', price: x.price || 0, supplier: sup.name })), onDone: () => (location.hash = '#/pos') }); return; }
      if (!it) return;
      if (e.target.closest('[data-add]')) { const typed = num($('[data-qty]', card).value); cart.set(it.id, typed || (cart.get(it.id) || 0) + 1); toast(`${it.name} × ${fq(cart.get(it.id))} added`); return draw(); }
      if (e.target.closest('[data-edit]')) return editRow({ table: 'items', title: 'Edit item', fields: itemFields(suppliers), row: it, before: itemBefore, onSaved: reload });
      if (e.target.closest('[data-dup]')) { await copyOf(it); toast('Copied'); return reload(); }
      if (e.target.closest('[data-del]') && await confirmBox(`Delete ${it.name}?`)) { await api.del(`t/items/${it.id}`); cart.delete(it.id); toast('Deleted'); reload(); }
    });
  };
  draw();
  void badge; void refresh;
}
