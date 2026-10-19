import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, qty as fq, num, today, dmy, toast, guard, confirmBox, modal, formHTML, readForm, datalist } from '../ui.js';
import { seesMoney } from '../perm.js';
import { setBoards } from '../kitchen.js';

const MATERIALS = ['MDF', 'Fibre board', 'Plywood', 'Melamine', 'Chipboard', 'HPL', 'Veneered', 'Solid wood', 'Acrylic', 'Other'];
const pieceTxt = (r) => `${fq(Math.max(r.length, r.width))} × ${fq(Math.min(r.length, r.width))} cm`;

/** The "Sheets" tab of Stock & Leftovers: the sheet types you add, new sheets and used (leftover) pieces by type. */
export async function renderSheets(el, redraw) {
  const types = await api.get('t/board_types'); const stock = await api.get('t/board_stock');
  S.board_types = types; S.board_stock = stock; setBoards({ types, stock });
  const $$$ = seesMoney(S.me);
  const typeOf = (id) => types.find((t) => t.id === id);
  const sum = (tid, kind) => stock.filter((r) => r.type_id === tid && r.kind === kind).reduce((a, r) => a + Math.max(0, +r.qty || 0), 0);
  const val = (r) => (+r.unit_cost || 0) * Math.max(0, +r.qty || 0);
  const totalNew = stock.filter((r) => r.kind === 'new').reduce((a, r) => a + Math.max(0, +r.qty || 0), 0);
  const totalUsed = stock.filter((r) => r.kind === 'used').reduce((a, r) => a + Math.max(0, +r.qty || 0), 0);
  const stockValue = stock.reduce((a, r) => a + val(r), 0);
  el.innerHTML = `<div class="cards"><div class="card stat"><div class="k">Sheet types</div><div class="v">${types.length}</div></div><div class="card stat"><div class="k">New sheets</div><div class="v">${fq(totalNew)}</div></div><div class="card stat"><div class="k">Used pieces (cut first)</div><div class="v">${fq(totalUsed)}</div></div>${$$$ ? `<div class="card stat"><div class="k">Stock value</div><div class="v">${money(stockValue, 2)}</div></div>` : ''}</div>
    <div class="card" style="margin-bottom:14px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3 style="margin:0">Sheet types</h3><span class="muted">Add the boards you work with: thickness, size and price. Kitchens pick from this list.</span><span class="grow"></span><button class="btn primary" id="newtype">+ Add a sheet type</button></div>
      <table class="grid" style="margin-top:10px"><thead><tr><th>Type</th><th>Material</th><th class="num">Thickness mm</th><th class="num">Sheet cm</th>${$$$ ? '<th class="num">Price / new sheet</th>' : ''}<th class="num">New in stock</th><th class="num">Used pieces</th><th></th></tr></thead><tbody>${types.map((t) => `<tr data-t="${t.id}"><td><b>${esc(t.name)}</b>${t.colour ? ` <span class="muted">${esc(t.colour)}</span>` : ''}${t.note ? `<div class="muted" style="font-size:11px">${esc(t.note)}</div>` : ''}</td><td>${esc(t.material || '')}</td><td class="num">${t.thickness ? fq(t.thickness) : ''}</td><td class="num">${fq(t.sheet_w)} × ${fq(t.sheet_h)}</td>${$$$ ? `<td class="num">${money(t.price || 0, 2)}</td>` : ''}<td class="num">${fq(sum(t.id, 'new'))}</td><td class="num">${fq(sum(t.id, 'used'))}</td><td class="act"><button class="btn sm" data-addnew>+ New sheets</button> <button class="btn sm" data-addused>+ Used piece</button> <button class="btn sm" data-edittype>Edit</button> <button class="btn sm danger" data-deltype>×</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted" style="padding:14px">No sheet types yet — add the first one (for example “MDF 18 mm white”, 244 × 122, price 10).</td></tr>'}</tbody></table></div>
    <div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3 style="margin:0">Sheets in stock</h3><span class="muted">New sheets and used pieces. A kitchen always cuts the used pieces of its type first.</span></div>
      <table class="grid" style="margin-top:10px"><thead><tr><th>Type</th><th>Kind</th><th class="num">Size cm</th><th class="num">Qty</th>${$$$ ? '<th class="num">Cost each</th><th class="num">Value</th>' : ''}<th>Location</th><th>Note</th><th></th></tr></thead><tbody>${stock.map((r) => { const t = typeOf(r.type_id); return `<tr data-s="${r.id}"><td>${esc(t ? t.name : '—')}</td><td>${r.kind === 'used' ? '<span class="badge warn">Used</span>' : '<span class="badge ok">New</span>'}</td><td class="num">${r.kind === 'used' ? pieceTxt(r) : t ? `${fq(t.sheet_w)} × ${fq(t.sheet_h)}` : ''}</td><td class="num">${fq(r.qty)}</td>${$$$ ? `<td class="num">${money(r.unit_cost || 0, 2)}</td><td class="num">${money(val(r), 2)}</td>` : ''}<td>${esc(r.location || '')}</td><td class="muted">${esc(r.note || '')}${r.source ? ` <span style="font-size:11px">${esc(r.source)}</span>` : ''}</td><td class="act"><button class="btn sm" data-take>Use</button> <button class="btn sm" data-edit>Edit</button> <button class="btn sm danger" data-del>×</button></td></tr>`; }).join('') || '<tr><td colspan="9" class="muted" style="padding:14px">Nothing in stock yet.</td></tr>'}</tbody></table></div>`;

  const typeForm = (row) => {
    const w = document.createElement('div'); const v = row || { material: 'MDF', thickness: 18, sheet_w: 244, sheet_h: 122, price: 0 };
    const fields = [{ key: 'name', label: 'Name', hint: 'e.g. MDF 18 mm white · Oak veneer 18 mm' }, { key: 'material', label: 'Material', list: 'dl-mat' }, { key: 'thickness', label: 'Thickness (mm)', type: 'number' }, { key: 'colour', label: 'Colour / finish', list: 'dl-col' }, { key: 'sheet_w', label: 'Sheet length (cm)', type: 'number' }, { key: 'sheet_h', label: 'Sheet width (cm)', type: 'number' }, ...($$$ ? [{ key: 'price', label: 'Price of one new sheet (BD)', type: 'number' }] : []), { key: 'note', label: 'Note', full: true }];
    w.innerHTML = datalist('dl-mat', MATERIALS) + datalist('dl-col', S.settings.colours || []) + formHTML(fields, v);
    modal({ title: row ? 'Edit sheet type' : 'New sheet type', body: w, wide: true, buttons: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => {
      const d = readForm(w, fields); if (!d.name) { toast('Give the type a name', 'err'); return false; } if (!(d.sheet_w > 0 && d.sheet_h > 0)) { toast('Enter the sheet size', 'err'); return false; }
      if (types.some((t) => t.id !== row?.id && t.name.toLowerCase() === d.name.toLowerCase())) { toast('A type with this name exists', 'err'); return false; }
      row ? await api.put(`t/board_types/${row.id}`, d) : await api.post('t/board_types', d); await refresh(); toast('Saved'); redraw();
    } }] });
  };
  const stockForm = (row, kind, typeId) => {
    const w = document.createElement('div'); const k = row?.kind || kind; const t0 = typeOf(row?.type_id || typeId);
    const v = row || { kind: k, type_id: typeId, qty: 1, length: k === 'new' ? t0?.sheet_w : '', width: k === 'new' ? t0?.sheet_h : '', unit_cost: k === 'new' ? t0?.price || 0 : 0, date: today() };
    const fields = [{ key: 'type_id', label: 'Sheet type', type: 'select', options: types.map((t) => [t.id, t.name]) }, { key: 'length', label: 'Length (cm)', type: 'number' }, { key: 'width', label: 'Width (cm)', type: 'number' }, { key: 'qty', label: 'Quantity', type: 'number' }, ...($$$ ? [{ key: 'unit_cost', label: k === 'used' ? 'Value of one used piece (BD)' : 'Cost of one sheet (BD)', type: 'number' }] : []), { key: 'location', label: 'Location (rack)' }, { key: 'note', label: 'Note', full: true }];
    w.innerHTML = formHTML(fields, v); const g = (n) => $(`[name=${n}]`, w);
    g('type_id').onchange = () => { const t = typeOf(Number(g('type_id').value)); if (t && k === 'new') { g('length').value = t.sheet_w; g('width').value = t.sheet_h; if ($$$) g('unit_cost').value = t.price || 0; } };
    modal({ title: `${row ? 'Edit' : 'Add'} ${k === 'used' ? 'used piece' : 'new sheets'}`, body: w, wide: true, buttons: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => {
      const d = readForm(w, fields); d.type_id = Number(d.type_id); d.kind = k; d.date = row?.date || today(); if (!d.type_id) { toast('Choose the type', 'err'); return false; } if (!(d.qty > 0)) { toast('Enter the quantity', 'err'); return false; } if (k === 'used' && !(d.length > 0 && d.width > 0)) { toast('Enter the size of the piece', 'err'); return false; }
      if (!$$$ && !row) d.unit_cost = 0;
      row ? await api.put(`t/board_stock/${row.id}`, d) : await api.post('t/board_stock', d); await refresh(); toast('Saved'); redraw();
    } }] });
  };
  $('#newtype', el).onclick = () => typeForm(null);
  el.addEventListener('click', guard(async (e) => {
    const b = e.target.closest('button'); if (!b) return; const tr = b.closest('tr'); if (!tr) return;
    if (tr.dataset.t) { const t = typeOf(Number(tr.dataset.t)); if (b.matches('[data-edittype]')) typeForm(t); if (b.matches('[data-addnew]')) stockForm(null, 'new', t.id); if (b.matches('[data-addused]')) stockForm(null, 'used', t.id);
      if (b.matches('[data-deltype]')) { if (stock.some((r) => r.type_id === t.id && r.qty > 0)) { toast('This type still has stock — use or delete that first', 'err'); return; } if (await confirmBox(`Delete the type “${t.name}”? Kitchens that use it keep the name but lose the price and size.`)) { await api.del(`t/board_types/${t.id}`); await refresh(); redraw(); } } return; }
    if (tr.dataset.s) { const r = stock.find((x) => x.id === Number(tr.dataset.s));
      if (b.matches('[data-edit]')) stockForm(r, r.kind);
      if (b.matches('[data-del]') && await confirmBox('Delete this stock line?')) { await api.del(`t/board_stock/${r.id}`); await refresh(); redraw(); }
      if (b.matches('[data-take]')) { const w = document.createElement('div'); w.innerHTML = formHTML([{ key: 'n', label: `How many did you take? (have ${fq(r.qty)})`, type: 'number', default: 1 }], {});
        modal({ title: `Use ${typeOf(r.type_id)?.name || 'sheet'}${r.kind === 'used' ? ' ' + pieceTxt(r) : ''}`, body: w, buttons: [{ label: 'Cancel' }, { label: 'Take from stock', kind: 'primary', onClick: async () => { const n = readForm(w, [{ key: 'n', type: 'number' }]).n; if (!(n > 0) || n > r.qty) { toast(`Between 0 and ${fq(r.qty)}`, 'err'); return false; } n === r.qty ? await api.del(`t/board_stock/${r.id}`) : await api.put(`t/board_stock/${r.id}`, { qty: r.qty - n }); await refresh(); toast('Taken from stock'); redraw(); } }] }); } }
  }));
}
