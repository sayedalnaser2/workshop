import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, qty as fq, num, today, dmy, toast, guard, confirmBox, dataTable, badge, datalist } from '../ui.js';
import { quoteTotals, priceFor, amountInWords, modelCost } from '../calc.js';
import { printView, docHeader } from '../doc.js';
import { quotePieces, allocateLeftovers } from '../stock.js';
import { openPoDialog } from '../po-dialog.js';
import { dot } from './stock.js';

const STATUS = { draft: ['Draft', ''], sent: ['Sent', 'blue'], accepted: ['Accepted', 'ok'], rejected: ['Rejected', 'bad'] };
const blankItem = () => ({ w: null, h: null, desc: '', note: '', qty: 1, price: 0, manual: false, model_id: null, glass_id: null, colour: '' });

export async function render(el, [a, b]) {
  if (a === 'new') return editor(el, null);
  if (a && b === 'print') return printQuote(el, Number(a));
  if (a) return editor(el, Number(a));
  return list(el);
}

// ------------------------------------------------------------------ list
async function list(el) {
  const rows = (await api.get('t/quotes')).map((q) => ({ ...q, total: quoteTotals(q).grand, count: (q.items || []).length }));
  el.innerHTML = `<div class="ph"><h1>Quotations</h1><span class="sub">Price quotations for doors, windows and partitions</span><span class="grow"></span><a class="btn primary" href="#/quotes/new">+ New quotation</a></div><div id="t"></div>`;
  const t = $('#t', el);
  dataTable(t, {
    rows, search: ['number', 'client', 'site', 'mobile'], page: 50, empty: 'No quotations yet — create the first one.',
    cols: [
      { key: 'number', label: 'Quote #', render: (r) => `<b>${esc(r.number)}</b>` },
      { key: 'date', label: 'Date', render: (r) => dmy(r.date) },
      { key: 'client', label: 'Client' }, { key: 'site', label: 'Site' },
      { key: 'count', label: 'Items', num: true },
      { key: 'total', label: 'Total (BD)', num: true, render: (r) => money(r.total) },
      { key: 'status', label: 'Status', render: (r) => badge(...(STATUS[r.status] || STATUS.draft)) + (r.order_inv ? ` <a href="#/orders" class="badge">${esc(r.order_inv)}</a>` : '') },
    ],
    filters: [{ label: 'All' }, { label: 'Draft', fn: (r) => r.status === 'draft' }, { label: 'Sent', fn: (r) => r.status === 'sent' }, { label: 'Accepted', fn: (r) => r.status === 'accepted' }],
    onRow: (r) => (location.hash = `#/quotes/${r.id}`),
    actions: () => `<button class="btn sm" data-act="print">Print</button> <button class="btn sm" data-act="dup">Duplicate</button> <button class="btn sm danger" data-act="del">Delete</button>`,
    foot: (l) => `<tr><td colspan="5">Total</td><td class="num">${money(l.reduce((s, r) => s + r.total, 0))}</td><td colspan="2"></td></tr>`,
  });
  t.addEventListener('act', guard(async (e) => {
    const { act, row } = e.detail;
    if (act === 'print') location.hash = `#/quotes/${row.id}/print`;
    if (act === 'dup') { const c = await duplicate(row.id); location.hash = `#/quotes/${c.id}`; }
    if (act === 'del' && await confirmBox(`Delete quotation ${row.number}?`)) { await api.del(`t/quotes/${row.id}`); toast('Deleted'); list(el); }
  }));
}
async function duplicate(id) {
  const q = await api.get(`t/quotes/${id}`);
  const { id: _i, number, created_at, order_inv, ...rest } = q;
  return api.post('t/quotes', { ...rest, date: today(), status: 'draft', notes: `Copy of ${number}` });
}

// ------------------------------------------------------------------ editor
async function editor(el, id) {
  const q = id ? await api.get(`t/quotes/${id}`) : { number: '', date: today(), client: '', mobile: '', site: '', title: S.settings.intro_line || '', items: [blankItem(), blankItem(), blankItem()], discount: 0, vat_rate: S.settings.vat_rate ?? 10, vat_waived: 0, status: 'draft', prepared_by: '', notes: '', colour: '' };
  if (!q.items?.length) q.items = [blankItem()];
  const all = await api.get('t/quotes');
  let stockRows = await api.get('t/stock');
  const clients = [...new Set(all.map((x) => x.client))];
  const lib = { profiles: S.profiles, accessories: S.accessories };
  const pi = (d) => S.price_items.find((p) => p.name.trim().toLowerCase() === String(d).trim().toLowerCase());

  el.innerHTML = `
  <div class="ph"><h1>${id ? 'Quotation ' + esc(q.number) : 'New quotation'}</h1>${id ? badge(...(STATUS[q.status] || STATUS.draft)) : ''}<span class="grow"></span><a class="btn" href="#/quotes">← All quotations</a></div>
  ${datalist('dl-clients', clients)}${datalist('dl-prices', S.price_items.filter((p) => p.type !== 'note').map((p) => p.name))}
  <div class="card"><div class="qhead">
    <label class="field"><span>Quote #</span><input id="number" value="${esc(q.number)}" placeholder="Auto: ${esc(S.next.quote)}"></label>
    <label class="field"><span>Date</span><input id="date" type="date" value="${esc(q.date)}"></label>
    <label class="field"><span>Client</span><input id="client" list="dl-clients" value="${esc(q.client)}" autocomplete="off"></label>
    <label class="field"><span>Mobile</span><input id="mobile" value="${esc(q.mobile)}"></label>
    <label class="field"><span>Site</span><input id="site" value="${esc(q.site)}"></label>
    <label class="field" style="grid-column: span 2"><span>Heading line (printed above the items)</span><input id="title" value="${esc(q.title)}"></label>
    <label class="field"><span>Colour (whole quotation)</span><select id="colour"><option value="">— not set —</option>${(S.settings.colours || []).map((c) => `<option ${q.colour === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    <label class="field"><span>Status</span><select id="status">${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${q.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
  </div></div>
  <div class="card" style="margin-top:14px"><div class="items-wrap"><table class="items"><thead><tr><th></th><th>Width cm</th><th>Height cm</th><th>Description (pick from price list or type)</th><th>Model</th><th>Glass</th><th>Colour</th><th>Qty</th><th>Unit price</th><th class="tot">Amount</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="addItem">+ Add item</button><button class="btn" id="addNote">+ Add heading / note line</button></div>
  </div>
  <div class="card" style="margin-top:14px" id="lo"></div>
  <div class="card" style="margin-top:14px"><div class="cols2">
    <div><label class="field"><span>Internal notes (not printed)</span><textarea id="notes" rows="3">${esc(q.notes || '')}</textarea></label><label class="field" style="margin-top:10px"><span>Prepared by</span><input id="prepared_by" value="${esc(q.prepared_by || '')}"></label><p class="words" id="words"></p><p class="muted" id="costline"></p></div>
    <div class="totals" id="totals"></div>
  </div></div>
  <div class="sticky-actions"><button class="btn primary" id="save">Save quotation</button>
    ${id ? `<a class="btn" href="#/quotes/${id}/print">Print preview</a><a class="btn" href="#/cutting/${id}">Cutting list</a><button class="btn" id="toOrder" ${q.order_inv ? 'disabled' : ''}>${q.order_inv ? 'Order ' + esc(q.order_inv) : 'Convert to order / invoice'}</button><button class="btn" id="dup">Duplicate</button><button class="btn danger" id="del">Delete</button>` : ''}</div>`;

  const tbody = $('#rows', el);
  const modelOpts = (sel) => `<option value="">—</option>` + S.models.map((m) => `<option value="${m.id}" ${Number(sel) === m.id ? 'selected' : ''}>${esc(m.name)} (${esc(m.series || '')})</option>`).join('');
  const glassOpts = (sel) => `<option value="">—</option>` + S.glass_types.map((g) => `<option value="${g.id}" ${Number(sel) === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('');

  const drawRows = () => {
    tbody.innerHTML = q.items.map((it, i) => {
      const isNote = it.kind === 'note';
      if (isNote) return `<tr data-i="${i}"><td class="n">${i + 1}</td><td colspan="9"><input data-k="desc" value="${esc(it.desc)}" placeholder="Heading or note line (e.g. MAINTENANCE:)" style="font-weight:600"></td><td>${rowBtns(i)}</td></tr>`;
      return `<tr data-i="${i}" class="${it.manual ? 'manual' : ''}">
        <td class="n">${i + 1}</td>
        <td><input class="w-s" data-k="w" type="number" step="any" value="${it.w ?? ''}"></td>
        <td><input class="w-s" data-k="h" type="number" step="any" value="${it.h ?? ''}"></td>
        <td style="min-width:300px"><input data-k="desc" list="dl-prices" value="${esc(it.desc)}" autocomplete="off"><div class="sub"><textarea data-k="note" rows="1" placeholder="Sub-description (e.g. W/1 – one side swing, other side fix)">${esc(it.note || '')}</textarea></div></td>
        <td><select data-k="model_id" style="width:120px">${modelOpts(it.model_id)}</select></td>
        <td><select data-k="glass_id" style="width:110px">${glassOpts(it.glass_id)}</select></td>
        <td><select data-k="colour" style="width:92px"><option value="">(as quote)</option>${(S.settings.colours || []).map((c) => `<option ${it.colour === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td>
        <td><input class="w-q" data-k="qty" type="number" step="any" value="${it.qty ?? 1}"></td>
        <td><input class="w-m price" data-k="price" type="number" step="any" value="${it.price ?? 0}" title="${it.manual ? 'Manual price' : 'Calculated from price list'}"></td>
        <td class="tot"><span data-tot>${money(num(it.qty) * num(it.price))}</span><div class="cost" data-cost></div><div class="cost" data-lo style="color:var(--ok)"></div></td>
        <td>${rowBtns(i)}</td></tr>`;
    }).join('');
    update();
  };
  const rowBtns = (i) => `<button class="btn sm" data-a="up" title="Move up">↑</button><button class="btn sm" data-a="dup" title="Duplicate">⧉</button><button class="btn sm danger" data-a="rm" title="Remove">×</button>`;

  function update() {
    const T = quoteTotals(q);
    let costTotal = 0;
    $$('tr[data-i]', tbody).forEach((tr) => {
      const it = q.items[Number(tr.dataset.i)]; if (it.kind === 'note') return;
      $('[data-tot]', tr).textContent = money(num(it.qty) * num(it.price));
      const m = S.models.find((x) => x.id === Number(it.model_id));
      let c = 0;
      if (m && it.w && it.h) c = modelCost(m, it.w, it.h, lib, S.glass_types.find((g) => g.id === Number(it.glass_id))).total * num(it.qty);
      costTotal += c; $('[data-cost]', tr).textContent = c ? `cost ≈ ${money(c, 2)}` : '';
      tr.classList.toggle('manual', !!it.manual);
    });
    $('#totals', el).innerHTML = `
      <div class="row"><span>Items total</span><b>${money(T.subtotal)}</b></div>
      <div class="row"><span>Discount <small class="muted">${T.subtotal ? '(' + T.discPct.toFixed(2) + '%)' : ''}</small></span><input id="discount" type="number" step="any" value="${q.discount || 0}"></div>
      <div class="row"><span>Amount</span><b>${money(T.amount)}</b></div>
      <div class="row"><span>VAT <input id="vat_rate" type="number" step="any" value="${q.vat_rate ?? 0}" style="width:60px"> %</span><b>${money(T.vat)}</b></div>
      <div class="row"><span>VAT adjustment <small class="muted">(enter VAT to waive)</small></span><input id="vat_waived" type="number" step="any" value="${q.vat_waived || 0}"></div>
      <div class="row grand"><span>Grand amount (BD)</span><span>${money(T.grand)}</span></div>`;
    $('#words', el).textContent = T.grand > 0 ? amountInWords(T.grand) : '';
    $('#costline', el).textContent = costTotal ? `Estimated material cost ≈ BD ${money(costTotal, 2)} → margin ≈ BD ${money(T.amount - costTotal, 2)} (before VAT)` : '';
    for (const [k] of [['discount'], ['vat_rate'], ['vat_waived']]) $('#' + k, el).oninput = (e) => { q[k] = num(e.target.value); update2(); };
    renderLO();
  }
  $('#colour', el).onchange = (e) => { q.colour = e.target.value; renderLO(); };
  let loTimer = 0;
  function renderLO() { clearTimeout(loTimer); loTimer = setTimeout(doLO, 120); }
  let lastRes = null;
  function doLO() {
    const box = $('#lo', el); if (!box) return;
    const common = { profiles: S.profiles, glassTypes: S.glass_types, kerf: S.settings.bar_kerf || 0, quoteNo: q.number || '' };
    const pieces = quotePieces(q, S.models, { profiles: S.profiles, accessories: S.accessories });
    const res = allocateLeftovers(pieces, stockRows, common); lastRes = res;
    const anyCol = allocateLeftovers(pieces.map((p) => ({ ...p, colour: '' })), stockRows, common);
    const nLeft = stockRows.filter((r) => r.kind === 'leftover' && r.qty > 0).reduce((s, r) => s + r.qty, 0);
    $$('tr[data-i]', tbody).forEach((tr) => { const i = Number(tr.dataset.i); const a = res.allocs.filter((x) => x.piece.item === i); const lo = $('[data-lo]', tr); if (lo) lo.textContent = a.length ? `♻ ${a.length} leftover · save ${money(a.reduce((s, x) => s + x.saving, 0), 2)}` : ''; });
    const profName = (id) => { const p = S.profiles.find((x) => x.id === id); return p ? `${p.series || ''} ${p.name}`.trim() : ''; };
    const reservedHere = q.number && stockRows.some((r) => r.reserved_for === q.number);
    let h = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h3 style="margin:0">♻ Leftovers that fit this quotation</h3><span class="muted">${nLeft} leftover piece(s) in stock</span></div>`;
    if (!pieces.length) h += '<p class="muted">Pick a <b>Model</b> and enter a width and height on the items. The pieces each window or door needs are then matched against your leftovers.</p>';
    else if (!res.allocs.length) h += `<p class="muted">No leftover fits yet${nLeft ? '' : ' — nothing in leftovers'}.${anyCol.allocs.length ? ` <b>${anyCol.allocs.length}</b> piece(s) would fit leftovers in a different colour.` : ''}</p>`;
    else {
      h += `<div class="cards" style="margin:10px 0"><div class="card stat"><div class="k">Pieces from leftovers</div><div class="v">${res.allocs.length} <small class="muted">of ${pieces.filter((p) => p.kind !== 'accessory').length}</small></div></div><div class="card stat"><div class="k">If bought new</div><div class="v">${money(res.newCost, 2)}</div></div><div class="card stat"><div class="k">Using leftovers</div><div class="v">${money(res.leftCost, 2)}</div></div><div class="card stat"><div class="k">Price difference</div><div class="v pos">− ${money(res.saving, 2)}</div></div></div>`;
      h += `<div class="items-wrap"><table class="grid"><thead><tr><th>Item</th><th>Piece</th><th class="num">Needs</th><th>Suggested leftover</th><th class="num">New cost</th><th class="num">Leftover cost</th><th class="num">Saves</th></tr></thead><tbody>${res.allocs.slice(0, 60).map((a) => { const p = a.piece, u = a.unit; return `<tr><td>#${p.item + 1} ${esc(p.model)}</td><td>${esc(p.label)}</td><td class="num">${p.kind === 'glass' ? `${p.w}×${p.h}` : p.length + ' cm'}</td><td>${p.kind === 'glass' ? esc(S.glass_types.find((g) => g.id === u.glass_id)?.name || 'Glass') + ` ${u.length}×${u.width}` : `${esc(profName(u.profile_id))} · ${dot(u.colour)} · <b>${u.length} cm</b>`}${u.location ? ` <span class="muted">(${esc(u.location)})</span>` : ''}${u.row.reserved_for ? ' ' + badge('reserved', 'warn') : ''}</td><td class="num">${money(a.newCost, 2)}</td><td class="num">${money(a.leftCost, 2)}</td><td class="num pos">${money(a.saving, 2)}</td></tr>`; }).join('')}${res.allocs.length > 60 ? `<tr><td colspan="7" class="muted">…and ${res.allocs.length - 60} more</td></tr>` : ''}</tbody></table></div>`;
      if (anyCol.allocs.length > res.allocs.length) h += `<p class="muted" style="margin-top:8px">${anyCol.allocs.length - res.allocs.length} more piece(s) would fit leftovers in another colour.</p>`;
      h += `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${id ? '<button class="btn primary" id="reserve">Reserve these leftovers for this quotation</button>' : '<span class="muted">Save the quotation to reserve them.</span>'}${reservedHere ? '<button class="btn" id="release">Release reservations</button>' : ''}</div>`;
    }
    box.innerHTML = h;
    $('#reserve', box)?.addEventListener('click', guard(async () => {
      if (!q.number) return toast('Save the quotation first', 'err');
      const used = {}; res.allocs.forEach((a) => { if (!a.unit.row.reserved_for) used[a.unit.id] = (used[a.unit.id] || 0) + 1; });
      for (const [rid, n] of Object.entries(used)) { const row = stockRows.find((r) => r.id === Number(rid)); if (!row) continue; if (n >= row.qty) await api.put(`t/stock/${row.id}`, { reserved_for: q.number }); else { const { id: _i, created_at, ...copy } = row; await api.put(`t/stock/${row.id}`, { qty: row.qty - n }); await api.post('t/stock', { ...copy, qty: n, reserved_for: q.number }); } }
      stockRows = await api.get('t/stock'); toast('Leftovers reserved'); doLO();
    }));
    $('#release', box)?.addEventListener('click', guard(async () => { for (const r of stockRows.filter((x) => x.reserved_for === q.number)) await api.put(`t/stock/${r.id}`, { reserved_for: '' }); stockRows = await api.get('t/stock'); toast('Released'); doLO(); }));
  }
  const update2 = () => { // totals only, keep focus in the inputs
    const T = quoteTotals(q);
    const rows = $$('#totals .row', el);
    rows[0].lastElementChild.textContent = money(T.subtotal);
    rows[1].firstElementChild.querySelector('small').textContent = T.subtotal ? `(${T.discPct.toFixed(2)}%)` : '';
    rows[2].lastElementChild.textContent = money(T.amount);
    rows[3].lastElementChild.textContent = money(T.vat);
    $('.grand span:last-child', el).textContent = money(T.grand);
    $('#words', el).textContent = T.grand > 0 ? amountInWords(T.grand) : '';
  };

  const reprice = (it) => {
    const p = pi(it.desc);
    if (p) { if (!it.manual) it.price = priceFor(p, num(it.w), num(it.h)); if (p.model_id && !it.model_id) it.model_id = p.model_id; }
  };
  tbody.addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-i]'); if (!tr) return;
    const it = q.items[Number(tr.dataset.i)]; const k = e.target.dataset.k; if (!k) return;
    const v = e.target.value;
    if (['w', 'h', 'qty', 'price'].includes(k)) it[k] = v === '' ? null : num(v); else it[k] = v;
    if (k === 'price') it.manual = true;
    if (['w', 'h', 'desc'].includes(k)) {
      const before = it.price; const hadModel = it.model_id; reprice(it);
      const pr = $('[data-k=price]', tr); if (pr && it.price !== before) pr.value = it.price;
      const ms = $('[data-k=model_id]', tr); if (ms && it.model_id !== hadModel) ms.value = it.model_id || '';
    }
    update();
  });
  tbody.addEventListener('change', (e) => { if (['model_id', 'glass_id'].includes(e.target.dataset.k)) { const it = q.items[Number(e.target.closest('tr').dataset.i)]; it[e.target.dataset.k] = e.target.value ? Number(e.target.value) : null; update(); } else if (e.target.dataset.k === 'colour') { q.items[Number(e.target.closest('tr').dataset.i)].colour = e.target.value; update(); } });
  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-a]'); if (!btn) return;
    const i = Number(btn.closest('tr').dataset.i);
    if (btn.dataset.a === 'rm') q.items.splice(i, 1);
    if (btn.dataset.a === 'dup') q.items.splice(i + 1, 0, { ...q.items[i] });
    if (btn.dataset.a === 'up' && i > 0) [q.items[i - 1], q.items[i]] = [q.items[i], q.items[i - 1]];
    if (!q.items.length) q.items.push(blankItem());
    drawRows();
  });
  // a manual price can be released again by double-clicking it
  tbody.addEventListener('dblclick', (e) => { if (e.target.dataset.k === 'price') { const it = q.items[Number(e.target.closest('tr').dataset.i)]; it.manual = false; reprice(it); drawRows(); toast('Price recalculated from the price list'); } });
  $('#addItem', el).onclick = () => { q.items.push(blankItem()); drawRows(); $$('tr[data-i]:last-child input', tbody)[1]?.focus(); };
  $('#addNote', el).onclick = () => { q.items.push({ kind: 'note', desc: '', qty: 0, price: 0 }); drawRows(); };

  const collect = () => ({
    number: $('#number', el).value.trim(), date: $('#date', el).value, client: $('#client', el).value.trim(), mobile: $('#mobile', el).value.trim(), site: $('#site', el).value.trim(),
    title: $('#title', el).value.trim(), colour: $('#colour', el).value, status: $('#status', el).value, notes: $('#notes', el).value, prepared_by: $('#prepared_by', el).value.trim(),
    items: q.items.filter((it) => it.kind === 'note' ? it.desc.trim() : (it.desc.trim() || it.price)), discount: q.discount || 0, vat_rate: q.vat_rate ?? 0, vat_waived: q.vat_waived || 0,
  });
  const save = async () => {
    const data = collect();
    if (!data.client) { toast('Enter the client name', 'err'); return null; }
    const saved = id ? await api.put(`t/quotes/${id}`, data) : await api.post('t/quotes', data);
    await refresh(); toast(`Saved ${saved.number}`); return saved;
  };
  $('#save', el).onclick = guard(async () => { const s = await save(); if (s && !id) location.hash = `#/quotes/${s.id}`; });
  if (id) {
    $('#toOrder', el).onclick = guard(async () => {
      if (!(await save())) return;
      if (!await confirmBox(`Create an order/invoice from ${q.number} for BD ${money(quoteTotals(collect()).grand)}?`, 'Create order', 'primary')) return;
      const o = await api.post(`quotes/${id}/to-order`, {}); await refresh(); toast(`Created ${o.inv}`); location.hash = '#/orders';
      const fresh = await api.get(`t/quotes/${id}`);
      openPoDialog({ quote: fresh, orderInv: o.inv, onDone: () => (location.hash = '#/pos') });
    });
    $('#dup', el).onclick = guard(async () => { const c = await duplicate(id); location.hash = `#/quotes/${c.id}`; });
    $('#del', el).onclick = guard(async () => { if (await confirmBox(`Delete quotation ${q.number}?`)) { await api.del(`t/quotes/${id}`); location.hash = '#/quotes'; } });
  }
  drawRows();
}

// ------------------------------------------------------------------ print
async function printQuote(el, id) {
  const q = await api.get(`t/quotes/${id}`);
  const T = quoteTotals(q);
  let n = 0;
  const rows = (q.items || []).map((it) => {
    if (it.kind === 'note') return `<tr><td></td><td colspan="5"><b>${esc(it.desc)}</b></td></tr>`;
    n++;
    return `<tr><td>${n}</td><td class="n">${it.w ? fq(it.w) : ''}${it.w && it.h ? ' × ' + fq(it.h) : ''}</td><td>${esc(it.desc)}${it.note ? `<div class="note">${esc(it.note).replace(/\n/g, '<br>')}</div>` : ''}</td><td class="n">${fq(it.qty)}</td><td class="n">${money(it.price, 2)}</td><td class="n">${money(num(it.qty) * num(it.price), 2)}</td></tr>`;
  }).join('');
  const terms = (S.settings.terms || []).map((t) => `<div>${esc(t)}</div>`).join('');
  const html = `${docHeader('QUOTATION')}
    <div class="meta"><div><b>QUOTE:</b> ${esc(q.number)}</div><div><b>Mob:</b> ${esc(q.mobile)}</div><div><b>DATE:</b> ${dmy(q.date)}</div><div><b>W/Site:</b> ${esc(q.site)}</div><div style="grid-column:1/-1"><b>Client:</b> ${esc(q.client)}</div></div>
    ${q.title ? `<div class="banner">${esc(q.title)}</div>` : ''}
    <table class="items-print"><thead><tr><th>#</th><th class="n">Size (W × H cm)</th><th>Description</th><th class="n">Qty</th><th class="n">Unit</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tot"><div><span>Total</span><span>${money(T.subtotal, 2)}</span></div>${T.discount ? `<div><span>Disc ${T.discPct.toFixed(2)}%</span><span>- ${money(T.discount, 2)}</span></div><div><span>Amount</span><span>${money(T.amount, 2)}</span></div>` : ''}${q.vat_rate ? `<div><span>VAT ${fq(q.vat_rate)}%</span><span>${money(T.vat, 2)}</span></div>` : ''}${T.waived ? `<div><span>VAT adjustment</span><span>- ${money(T.waived, 2)}</span></div>` : ''}<div class="g"><span>Grand Amount BD</span><span>${money(T.grand, 2)}</span></div></div>
    <p><b>Amount in words:</b> ${esc(amountInWords(T.grand))}</p>
    <div class="sign"><div>Prepared ${esc(q.prepared_by || '')}</div><div>Cust. Sign</div></div>
    <div class="terms">${terms}</div>`;
  printView(el, { back: `#/quotes/${id}`, html, extraButtons: `<a class="btn" href="#/cutting/${id}">Cutting list</a>` });
}
