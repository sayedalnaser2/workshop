import { S } from './app.js';
import { api, $, $$, esc, money, qty as fq, num, today, toast, modal, datalist } from './ui.js';
import { poSuggestions } from './stock.js';

/** Choose suppliers and items for a purchase order. quote is optional: with one, lines are suggested from its models. */
export async function openPoDialog({ quote = null, orderInv = '', lines: given = null, onDone }) {
  const [suppliers, items, stock] = await Promise.all([api.get('t/suppliers'), api.get('t/items'), api.get('t/stock')]);
  let lines = given ? given.map((l) => ({ ...l })) : quote ? poSuggestions(quote, { models: S.models, profiles: S.profiles, accessories: S.accessories, glassTypes: S.glass_types, items, stock, kerf: S.settings.bar_kerf || 0 }) : [];
  lines.forEach((l) => { l.on = l.on ?? l.qty > 0; });
  const wrap = document.createElement('div');
  wrap.innerHTML = `${datalist('dl-pocol', S.settings.colours || [])}${datalist('dl-cat', items.map((i) => `${i.name}${i.code ? ' [' + i.code + ']' : ''} — ${i.supplier || ''}`))}
    <p class="muted" style="margin-top:0">${quote ? `Suggested from <b>${esc(quote.number)}</b>: bars needed after using leftovers, minus what is already in new stock. ` : ''}Pick the supplier for each line — one purchase order is created per supplier.</p>
    <div class="items-wrap"><table class="items" style="min-width:860px"><thead><tr><th></th><th>Item</th><th>Colour</th><th class="tot">Needed</th><th class="tot">In stock</th><th>Order qty</th><th>Unit</th><th>Price</th><th>Supplier</th><th class="tot">Total</th><th></th></tr></thead><tbody id="pol"></tbody></table></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><input id="addcat" list="dl-cat" placeholder="Add from catalogue (type item name)…" style="max-width:340px"><button class="btn" id="addBlank">+ Blank line</button></div>
    <label class="field check" style="margin-top:8px"><input type="checkbox" id="showAll"><span>Show every supplier, not just those that offer the product</span></label>
    <p class="muted" id="sum" style="text-align:right"></p>`;
  // only suppliers whose catalogue lists the product are offered (tick the box to see every supplier)
  let showAll = false; const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const offers = (l) => { const names = new Set(); for (const i of items) { if (!i.supplier) continue; if ((l.profile_id && i.profile_id === l.profile_id) || (l.glass_id && i.glass_id === l.glass_id) || (l.accessory_id && i.accessory_id === l.accessory_id) || (l.code && i.code && norm(i.code) === norm(l.code)) || (l.name && i.name && norm(i.name) === norm(l.name))) names.add(i.supplier); } return names; };
  const supOpts = (l) => { const o = offers(l); const pool = showAll || !o.size ? suppliers.map((x) => x.name) : [...o]; return `<option value="">— supplier —</option>` + [...new Set([...pool, l.supplier].filter(Boolean))].sort().map((n) => `<option ${n === l.supplier ? 'selected' : ''}>${esc(n)}</option>`).join(''); };
  const supHint = (l) => { const o = offers(l); return o.size ? `<div class="muted" style="font-size:11px">${o.size} supplier(s) offer this</div>` : '<div class="neg" style="font-size:11px">No supplier lists this — add it to a catalogue</div>'; };
  const draw = () => {
    $('#pol', wrap).innerHTML = lines.map((l, i) => `<tr data-i="${i}"><td><input type="checkbox" data-k="on" ${l.on ? 'checked' : ''}></td>
      <td style="min-width:200px"><input data-k="name" value="${esc(l.name)}"><div class="muted" style="font-size:11px">${esc(l.code || '')}</div></td>
      <td><input data-k="colour" list="dl-pocol" value="${esc(l.colour || '')}" style="width:100px"></td><td class="tot">${l.need != null ? fq(l.need) : ''}</td><td class="tot">${l.inStock != null ? fq(l.inStock) : ''}</td>
      <td><input data-k="qty" type="number" step="any" class="w-q" value="${l.qty}"></td><td><input data-k="unit" value="${esc(l.unit || '')}" style="width:90px"></td>
      <td><input data-k="price" type="number" step="any" class="w-m" value="${l.price ?? 0}"></td><td><select data-k="supplier" style="min-width:150px">${supOpts(l)}</select>${supHint(l)}</td>
      <td class="tot" data-t>${money(num(l.qty) * num(l.price))}</td><td><button class="btn sm danger" data-rm>×</button></td></tr>`).join('') || '<tr><td colspan="11" class="muted" style="padding:14px">No lines yet — add items from the catalogue below.</td></tr>';
    sum();
  };
  const sum = () => { const on = lines.filter((l) => l.on && num(l.qty) > 0); $('#sum', wrap).innerHTML = `${on.length} line(s) · ${new Set(on.map((l) => l.supplier || '?')).size} supplier(s) · <b>BD ${money(on.reduce((s, l) => s + num(l.qty) * num(l.price), 0), 2)}</b>`; };
  wrap.addEventListener('input', (e) => { const tr = e.target.closest('tr[data-i]'); if (!tr) return; const l = lines[Number(tr.dataset.i)]; const k = e.target.dataset.k; if (!k) return; l[k] = e.target.type === 'checkbox' ? e.target.checked : ['qty', 'price'].includes(k) ? num(e.target.value) : e.target.value; $('[data-t]', tr).textContent = money(num(l.qty) * num(l.price)); sum(); });
  wrap.addEventListener('change', (e) => {
    if (e.target.id === 'showAll') { showAll = e.target.checked; draw(); return; }
    if (e.target.dataset.k === 'supplier') { const tr = e.target.closest('tr'); const l = lines[Number(tr.dataset.i)]; const cat = items.find((i) => i.supplier === l.supplier && ((l.profile_id && i.profile_id === l.profile_id) || (l.glass_id && i.glass_id === l.glass_id) || (l.accessory_id && i.accessory_id === l.accessory_id) || (l.code && i.code === l.code))); if (cat?.price) { l.price = cat.price; draw(); } }
    if (e.target.id === 'addcat') { const v = e.target.value; const it = items.find((i) => `${i.name}${i.code ? ' [' + i.code + ']' : ''} — ${i.supplier || ''}` === v); if (it) { lines.push({ on: true, kind: it.kind || 'other', profile_id: it.profile_id, glass_id: it.glass_id, accessory_id: it.accessory_id, name: it.name, code: it.code, colour: '', qty: 1, unit: it.unit || 'ea', price: it.price || 0, supplier: it.supplier || '' }); e.target.value = ''; draw(); } }
  });
  wrap.addEventListener('click', (e) => { if (e.target.matches('[data-rm]')) { lines.splice(Number(e.target.closest('tr').dataset.i), 1); draw(); } if (e.target.id === 'addBlank') { lines.push({ on: true, kind: 'other', name: '', qty: 1, unit: 'ea', price: 0, supplier: '' }); draw(); } });
  draw();
  modal({
    title: orderInv ? `Purchase order for ${orderInv}` : 'New purchase order', body: wrap, wide: true, buttons: [
      { label: 'Skip for now', close: true },
      {
        label: 'Create purchase order(s)', kind: 'primary', onClick: async () => {
          const on = lines.filter((l) => l.on && num(l.qty) > 0 && l.name);
          if (!on.length) { toast('Tick at least one line', 'err'); return false; }
          if (on.some((l) => !l.supplier)) { toast('Choose a supplier for every ticked line', 'err'); return false; }
          const groups = {}; on.forEach((l) => (groups[l.supplier] ||= []).push(l));
          const made = [];
          for (const [supplier, ls] of Object.entries(groups)) {
            const clean = ls.map(({ on: _o, need, inStock, ...r }) => r);
            made.push(await api.post('t/purchase_orders', { date: today(), supplier, order_inv: orderInv || '', quote_no: quote?.number || '', status: 'draft', lines: clean, total: Math.round(clean.reduce((s, l) => s + num(l.qty) * num(l.price), 0) * 1000) / 1000 }));
          }
          toast(`Created ${made.map((m) => m.po).join(', ')}`);
          onDone?.(made);
        },
      },
    ],
  });
}
