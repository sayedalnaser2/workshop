import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, qty as fq, num, today, dmy, dataTable, editRow, confirmBox, toast, guard, badge, modal, datalist, formHTML, readForm } from '../ui.js';
import { leftoverValue } from '../stock.js';

const COL = { white: '#f3f3f0', brown: '#6b4a2f', black: '#222', bronze: '#8c6a3d', silver: '#bfc5cc', wood: '#a5733b', grey: '#8a8f98', gold: '#c9a227', champagne: '#d9c7a1', 'dark grey': '#555a63', natural: '#d8dadd' };
export const dot = (c) => (c ? `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${COL[String(c).toLowerCase()] || 'var(--muted)'};border:1px solid var(--line);vertical-align:-1px;margin-right:5px"></span>${esc(c)}` : '<span class="muted">—</span>');
const TYPES = [['profile', 'Aluminium profile'], ['glass', 'Glass'], ['accessory', 'Accessory / hardware'], ['other', 'Other']];

export async function render(el) {
  let tab = sessionStorage.getItem('stock-tab') || 'new';
  const draw = async () => {
    const rows = (await api.get('t/stock')).map((r) => ({ ...r, label: stockName(r), value: (r.unit_cost || 0) * (r.qty || 0) }));
    const mine = rows.filter((r) => r.kind === tab);
    const sumv = (k) => rows.filter((r) => r.kind === k && r.qty > 0).reduce((s, r) => s + r.value, 0);
    const pcs = (k) => rows.filter((r) => r.kind === k).reduce((s, r) => s + Math.max(0, r.qty || 0), 0);
    el.innerHTML = `<div class="ph"><h1>Stock</h1><span class="sub">New stock (full bars, sheets, hardware) and leftovers (cut-offs you can reuse)</span><span class="grow"></span><button class="btn primary" id="new">+ ${tab === 'new' ? 'Add new stock' : 'Add leftover'}</button></div>
      <div class="cards"><div class="card stat"><div class="k">New stock value</div><div class="v">${money(sumv('new'), 2)}</div></div><div class="card stat"><div class="k">Leftover pieces</div><div class="v">${fq(pcs('leftover'))}</div></div><div class="card stat"><div class="k">Leftover value</div><div class="v">${money(sumv('leftover'), 2)}</div></div><div class="card stat"><div class="k">Reserved leftovers</div><div class="v">${fq(rows.filter((r) => r.kind === 'leftover' && r.reserved_for).reduce((s, r) => s + r.qty, 0))}</div></div></div>
      <div class="tbar"><div class="seg"><button data-t="new" class="${tab === 'new' ? 'on' : ''}">New stock</button><button data-t="leftover" class="${tab === 'leftover' ? 'on' : ''}">Leftovers</button></div></div><div id="t"></div>`;
    $$('.seg button', el).forEach((b) => (b.onclick = () => { tab = b.dataset.t; sessionStorage.setItem('stock-tab', tab); draw(); }));
    const open = (row) => form(row, tab, draw);
    $('#new', el).onclick = () => open(null);
    const sizeOf = (r) => (r.item_type === 'glass' ? `${fq(r.length)} × ${fq(r.width)} cm` : r.length ? `${fq(r.length)} cm` : '');
    const cols = [
      { key: 'label', label: 'Item', render: (r) => `<b>${esc(r.label)}</b>${r.code ? `<div class="muted" style="font-size:11px">${esc(r.code)}</div>` : ''}` },
      { key: 'item_type', label: 'Type', render: (r) => esc(TYPES.find((t) => t[0] === r.item_type)?.[1] || '') },
      { key: 'colour', label: 'Colour', render: (r) => dot(r.colour) },
      { key: 'length', label: tab === 'new' ? 'Bar / size' : 'Length / size', num: true, render: sizeOf },
      { key: 'qty', label: 'Qty', num: true, render: (r) => `<b class="${r.qty <= 0 ? 'neg' : ''}">${fq(r.qty)}</b> <span class="muted">${esc(r.unit || (r.kind === 'leftover' ? 'pcs' : ''))}</span>` },
      { key: 'unit_cost', label: tab === 'new' ? 'Cost each' : 'Value each', num: true, render: (r) => money(r.unit_cost, 2) },
      { key: 'value', label: 'Value', num: true, render: (r) => money(r.value, 2) },
      { key: 'location', label: 'Location' },
    ];
    if (tab === 'leftover') cols.push({ key: 'reserved_for', label: 'Reserved', render: (r) => (r.reserved_for ? badge(r.reserved_for, 'warn') : '') }, { key: 'order_inv', label: 'From', render: (r) => esc(r.order_inv || '') });
    const t = $('#t', el);
    dataTable(t, {
      rows: mine, search: ['label', 'code', 'colour', 'location', 'order_inv', 'reserved_for'], page: 100, empty: tab === 'new' ? 'No new stock recorded yet.' : 'No leftovers recorded yet — they are saved automatically from the Cutting List.',
      cols, onRow: open, filters: [{ label: 'In stock', fn: (r) => r.qty > 0 }, { label: 'All' }, ...(tab === 'leftover' ? [{ label: 'Reserved', fn: (r) => r.reserved_for }] : [])],
      actions: () => '<button class="btn sm" data-act="use">Use</button> <button class="btn sm danger" data-act="del">Delete</button>',
      foot: (l) => `<tr><td colspan="4">Total (${l.length})</td><td class="num">${fq(l.reduce((s, r) => s + r.qty, 0))}</td><td></td><td class="num">${money(l.filter((r) => r.qty > 0).reduce((s, r) => s + r.value, 0), 2)}</td><td colspan="3"></td></tr>`,
    });
    t.addEventListener('act', guard(async (e) => {
      const { act, row } = e.detail;
      if (act === 'del' && await confirmBox(`Delete ${row.label}?`)) { await api.del(`t/stock/${row.id}`); toast('Deleted'); draw(); }
      if (act === 'use') {
        const w = document.createElement('div'); w.innerHTML = formHTML([{ key: 'n', label: `How many ${row.unit || 'pieces'} did you take? (have ${fq(row.qty)})`, type: 'number', default: 1 }, { key: 'note', label: 'Used for (order / note)' }], {});
        modal({ title: `Use ${row.label}`, body: w, buttons: [{ label: 'Cancel' }, { label: 'Take from stock', kind: 'primary', onClick: async () => { const d = readForm(w, [{ key: 'n', type: 'number' }, { key: 'note' }]); await api.put(`t/stock/${row.id}`, { qty: Math.max(0, row.qty - (d.n || 0)), note: [row.note, d.note && `Used ${d.n} for ${d.note}`].filter(Boolean).join(' · ') }); toast('Stock updated'); draw(); } }] });
      }
    }));
  };
  draw();
}

export const stockName = (r) => r.name || (r.profile_id ? (() => { const p = S.profiles.find((x) => x.id === r.profile_id); return p ? `${p.series || ''} ${p.name}`.trim() : ''; })() : '') || (r.glass_id ? S.glass_types.find((g) => g.id === r.glass_id)?.name || 'Glass' : '') || '(unnamed)';

function form(row, kind, done) {
  const isLeft = (row?.kind || kind) === 'leftover';
  const v = row || { kind, item_type: 'profile', qty: 1, date: today(), unit: isLeft ? 'pcs' : 'bar' };
  const w = document.createElement('div');
  const colours = S.settings.colours || [];
  const fields = [
    { key: 'item_type', label: 'Type', type: 'select', options: TYPES },
    { key: 'profile_id', label: 'Profile', type: 'select', options: [['', '— choose —'], ...S.profiles.map((p) => [p.id, `${p.series || ''} · ${p.name}${p.code ? ' (' + p.code + ')' : ''}`])] },
    { key: 'glass_id', label: 'Glass type', type: 'select', options: [['', '— choose —'], ...S.glass_types.map((g) => [g.id, g.name])] },
    { key: 'name', label: 'Name (if not a profile / glass type)', hint: 'e.g. Hinge set, Silicone' },
    { key: 'colour', label: 'Colour', list: 'dl-col' },
    { key: 'length', label: isLeft ? 'Length (cm)' : 'Bar length / glass width (cm)', type: 'number' },
    { key: 'width', label: 'Glass height (cm)', type: 'number', hint: 'glass only' },
    { key: 'qty', label: 'Quantity', type: 'number' },
    { key: 'unit', label: 'Unit', hint: 'bar, pcs, m², ea…' },
    { key: 'unit_cost', label: isLeft ? 'Value of one piece (BD)' : 'Cost of one (BD)', type: 'number', hint: isLeft ? `Pre-filled as ${S.settings.leftover_pct ?? 60}% of the new-profile price` : '' },
    { key: 'location', label: 'Location (rack / shelf)' }, { key: 'order_inv', label: 'From order / quote' },
    { key: 'note', label: 'Note', full: true },
  ];
  w.innerHTML = datalist('dl-col', colours) + formHTML(fields, v);
  const g = (n) => $(`[name=${n}]`, w);
  const showHide = () => { const t = g('item_type').value; ['profile_id'].forEach((n) => (g(n).closest('label').hidden = t !== 'profile')); g('glass_id').closest('label').hidden = t !== 'glass'; g('width').closest('label').hidden = t !== 'glass'; g('colour').closest('label').hidden = t === 'glass'; g('name').closest('label').hidden = t === 'profile' || t === 'glass'; };
  const suggest = () => { if (!isLeft || g('item_type').value !== 'profile' || g('unit_cost').dataset.touched) return; const p = S.profiles.find((x) => x.id === Number(g('profile_id').value)); if (p && num(g('length').value)) g('unit_cost').value = leftoverValue(p, num(g('length').value), S.settings.leftover_pct ?? 60); };
  g('item_type').onchange = showHide; g('unit_cost').oninput = () => { g('unit_cost').dataset.touched = 1; };
  g('profile_id').onchange = () => { const p = S.profiles.find((x) => x.id === Number(g('profile_id').value)); if (p) { if (!isLeft) { g('length').value = p.bar_length; g('unit_cost').value = p.price_bar || 0; } g('unit').value = isLeft ? 'pcs' : 'bar'; } suggest(); };
  g('length').oninput = suggest;
  showHide();
  modal({
    title: row ? 'Edit stock line' : isLeft ? 'Add leftover' : 'Add new stock', body: w, wide: true, buttons: [{ label: 'Cancel' }, {
      label: 'Save', kind: 'primary', onClick: async () => {
        const d = readForm(w, fields.map((f) => (['item_type', 'profile_id', 'glass_id'].includes(f.key) ? { ...f, type: f.type } : f)));
        d.profile_id = d.profile_id ? Number(d.profile_id) : null; d.glass_id = d.glass_id ? Number(d.glass_id) : null; d.kind = row?.kind || kind; d.date = row?.date || today();
        if (d.item_type === 'profile' && !d.profile_id) { toast('Choose the profile', 'err'); return false; }
        if (d.item_type === 'glass' && !d.glass_id) { toast('Choose the glass type', 'err'); return false; }
        if (d.item_type !== 'profile' && d.item_type !== 'glass' && !d.name) { toast('Give the item a name', 'err'); return false; }
        if (d.item_type === 'profile') d.name = ''; if (d.item_type === 'glass') d.name = '';
        row ? await api.put(`t/stock/${row.id}`, d) : await api.post('t/stock', d);
        toast('Saved'); done();
      },
    }],
  });
}
