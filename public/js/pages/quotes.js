import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, qty as fq, num, today, dmy, toast, guard, confirmBox, dataTable, badge, datalist } from '../ui.js';
import { quoteTotals, hasVat, priceFor, modelCost, amountInWords } from '../calc.js';
import { printView, docHeader, L, wordsBlock, termsBlock, AR } from '../doc.js';
import { elevationSVG, planSVG } from '../kitchen-draw.js';
import { kitchenModel } from '../kitchen.js';
import { quotePieces, allocateLeftovers, accessoriesFor } from '../stock.js';
import { openPoDialog } from '../po-dialog.js';
import { dot } from './stock.js';
import { drawModel, HAND_KINDS, SWING_KINDS } from '../drawings.js';
import { modal, formHTML, readForm, gpsRow, wireGps, mapLink, parseGps, colourOptions } from '../ui.js';
import { glazingNote } from '../glazing.js';

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
      { key: 'client', label: 'Client' }, { key: 'site', label: 'Site', render: (r) => `${esc(r.site || '')} ${mapLink(r.gps, r.site)}` },
      { key: 'count', label: 'Items', num: true },
      { key: 'total', label: 'Total (BD)', num: true, render: (r) => money(r.total) },
      { key: 'status', label: 'Status', render: (r) => badge(...(STATUS[r.status] || STATUS.draft)) + (r.approval === 'pending' ? ' ' + badge('Discount waiting', 'warn') : r.approval === 'rejected' ? ' ' + badge('Discount refused', 'bad') : '') + (r.order_inv ? ` <a href="#/orders" class="badge">${esc(r.order_inv)}</a>` : '') },
    ],
    filterKey: 'quotes',
    filters: [{ label: 'All' }, { label: 'Open', fn: (r) => r.status === 'draft' || r.status === 'sent' }, { label: 'Draft', fn: (r) => r.status === 'draft' }, { label: 'Sent', fn: (r) => r.status === 'sent' }, { label: 'Accepted', fn: (r) => r.status === 'accepted' }],
    onRow: (r) => (location.hash = `#/quotes/${r.id}`),
    actions: () => `<button class="btn sm" data-act="print">Print</button> <button class="btn sm" data-act="dup">Duplicate</button>`,
    foot: (l) => `<tr><td colspan="5">Total</td><td class="num">${money(l.reduce((s, r) => s + r.total, 0))}</td><td colspan="2"></td></tr>`,
  });
  t.addEventListener('act', guard(async (e) => {
    const { act, row } = e.detail;
    if (act === 'print') location.hash = `#/quotes/${row.id}/print`;
    if (act === 'dup') { const c = await duplicate(row.id); location.hash = `#/quotes/${c.id}`; }
  }));
}
async function duplicate(id) {
  const q = await api.get(`t/quotes/${id}`);
  const { id: _i, number, created_at, order_inv, ...rest } = q;
  return api.post('t/quotes', { ...rest, date: today(), status: 'draft', notes: `Copy of ${number}` });
}

// ------------------------------------------------------------------ editor
async function editor(el, id) {
  const q = id ? await api.get(`t/quotes/${id}`) : { number: '', date: today(), client: '', mobile: '', site: '', title: S.settings.intro_line || '', items: [blankItem(), blankItem(), blankItem()], discount: 0, vat_rate: S.settings.vat_rate ?? 10, vat_waived: 0, status: 'draft', prepared_by: S.me?.name || '', notes: '', colour: '', disc_mode: S.settings.discount_mode || 'after' };
  if (!id) { try { const pf = JSON.parse(sessionStorage.getItem('prefill-quote') || 'null'); if (pf) { Object.assign(q, pf); sessionStorage.removeItem('prefill-quote'); } } catch {} }
  if (!q.disc_mode) q.disc_mode = 'before'; // older quotations keep the way they were worked out
  if (!q.prepared_by) q.prepared_by = S.me?.name || '';
  if (!q.items?.length) q.items = [blankItem()];
  const origStatus = q.status; let pw = '';
  const all = await api.get('t/quotes');
  let stockRows = await api.get('t/stock');
  const clients = [...new Set(all.map((x) => x.client))];
  const lib = { profiles: S.profiles, accessories: S.accessories };
  const pi = (d) => S.price_items.find((p) => p.name.trim().toLowerCase() === String(d).trim().toLowerCase());

  el.innerHTML = `
  <div class="ph"><h1>${id ? 'Quotation ' + esc(q.number) : 'New quotation'}</h1>${id ? badge(...(STATUS[q.status] || STATUS.draft)) : ''}<span class="grow"></span><a class="btn" href="#/quotes">← All quotations</a></div>
  ${datalist('dl-clients', clients)}${datalist('dl-prices', S.price_items.filter((p) => p.type !== 'note').map((p) => p.name))}
  <div id="apr"></div>
  <div class="card"><div class="qhead">
    <label class="field"><span>Quote #</span><input id="number" value="${esc(q.number)}" placeholder="Auto: ${esc(S.next.quote)}"></label>
    <label class="field"><span>Date</span><input id="date" type="date" value="${esc(q.date)}"></label>
    <label class="field"><span>Client <small id="custno" class="muted"></small></span><input id="client" list="dl-clients" value="${esc(q.client)}" autocomplete="off"></label>
    <label class="field"><span>Mobile</span><input id="mobile" value="${esc(q.mobile)}"></label>
    <label class="field"><span>Site <select id="locpick" hidden style="margin-left:6px;font-size:12px;max-width:180px" title="This customer's saved locations"></select></span><input id="site" value="${esc(q.site)}"></label>
    ${gpsRow('gps', q.gps)}
    <label class="field"><span>Client VAT No. (for tax invoice)</span><input id="client_vat" value="${esc(q.client_vat || '')}"></label>
    <label class="field"><span>Colour (whole quotation)</span><select id="colour">${colourOptions(S.settings.colours, q.colour, '— not set —')}</select></label>
    <label class="field"><span>Status</span><select id="status">${Object.entries(STATUS).map(([k, [l]]) => `<option value="${k}" ${q.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field" style="grid-column: 1 / -1"><span>Heading line (printed above the items)</span><input id="title" value="${esc(q.title)}"></label>
  </div></div>
  <div class="card" style="margin-top:14px"><div class="items-wrap"><table class="items"><thead><tr><th></th><th>Description (pick from the price list first)</th><th>Model</th><th>Width cm</th><th>Height cm</th><th>Hand / opens</th><th>Glass</th><th>Colour</th><th>Qty</th><th>Unit price</th><th title="Tick if VAT is charged on this line">VAT</th><th class="tot">Amount</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="addItem">+ Add item</button><button class="btn" id="addNote">+ Add heading / note line</button></div>
  </div>
  <div class="card" style="margin-top:14px" id="lo"></div>
  <div class="card" style="margin-top:14px" id="acc"></div>
  <div class="card" style="margin-top:14px"><div class="cols2">
    <div><label class="field"><span>Internal notes (not printed)</span><textarea id="notes" rows="3">${esc(q.notes || '')}</textarea></label><label class="field" style="margin-top:10px"><span>Prepared by</span><input id="prepared_by" value="${esc(q.prepared_by || '')}" readonly style="opacity:.8;cursor:not-allowed" title="Set automatically from the signed-in user"></label><p class="words" id="words"></p><p class="muted" id="costline"></p></div>
    <div class="totals" id="totals"></div>
  </div></div>
  <div class="sticky-actions"><button class="btn primary" id="save">Save quotation</button>
    ${id ? `<a class="btn" href="#/quotes/${id}/print">Print preview</a><a class="btn" href="#/cutting/${id}">Cutting list</a><button class="btn" id="toOrder" ${q.order_inv || q.approval === 'pending' || q.approval === 'rejected' ? 'disabled' : ''} ${q.approval === 'pending' || q.approval === 'rejected' ? 'title="Waiting for the admin to approve the discount"' : ''}>${q.order_inv ? 'Order ' + esc(q.order_inv) : 'Convert to order / invoice'}</button><button class="btn" id="dup">Duplicate</button>` : ''}</div>`;

  const tbody = $('#rows', el);
  // the description decides which models make sense: only models of the same kind of product (window / door / …) are offered
  const modelOf = (it) => S.models.find((m) => m.id === Number(it.model_id));
  const piOf = (it) => S.price_items.find((p) => p.id === it.pi_id);
  const modelOpts = (it) => { const base = S.models.find((m) => m.id === piOf(it)?.model_id); const list = base ? S.models.filter((m) => m.category === base.category) : S.models; return `<option value="">—</option>` + list.map((m) => `<option value="${m.id}" ${Number(it.model_id) === m.id ? 'selected' : ''}>${esc(m.name)} (${esc(m.series || '')})</option>`).join(''); };
  const handCell = (it) => { const k = modelOf(it)?.kind; return `${HAND_KINDS.includes(k) ? `<select data-k="hand" title="Hinge side, seen from outside"><option value="L" ${it.hand !== 'R' ? 'selected' : ''}>Left hand</option><option value="R" ${it.hand === 'R' ? 'selected' : ''}>Right hand</option></select>` : ''}${SWING_KINDS.includes(k) ? `<select data-k="swing" title="Which way it opens"><option value="out" ${it.swing !== 'in' ? 'selected' : ''}>Opens outside</option><option value="in" ${it.swing === 'in' ? 'selected' : ''}>Opens inside</option></select>` : ''}${!HAND_KINDS.includes(k) && !SWING_KINDS.includes(k) ? '<span class="muted">—</span>' : ''}`; };
  /** Drop what no longer applies to the chosen model (hand, opening direction, glass on a model without glass). */
  const normalise = (it) => { const m = modelOf(it); const k = m?.kind; if (HAND_KINDS.includes(k)) it.hand ||= 'L'; else delete it.hand; if (SWING_KINDS.includes(k)) it.swing ||= 'out'; else delete it.swing; if (m && !(m.spec?.glass || []).length) it.glass_id = null; };
  for (const it of q.items) if (it.kind !== 'note') { it.pi_id = pi(it.desc)?.id || null; normalise(it); }
  const glassOpts = (sel) => `<option value="">—</option>` + S.glass_types.map((g) => `<option value="${g.id}" ${Number(sel) === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('');

  const drawRows = () => {
    tbody.innerHTML = q.items.map((it, i) => {
      const isNote = it.kind === 'note';
      if (isNote) return `<tr data-i="${i}"><td class="n">${i + 1}</td><td colspan="12"><input data-k="desc" value="${esc(it.desc)}" placeholder="Heading or note line (e.g. MAINTENANCE:)" style="font-weight:600"></td><td>${rowBtns(i)}</td></tr>`;
      return `<tr data-i="${i}" class="${it.manual ? 'manual' : ''}">
        <td class="n">${i + 1}</td>
        <td style="min-width:300px"><input data-k="desc" list="dl-prices" value="${esc(it.desc)}" autocomplete="off">${it.kitchen_id ? `<a href="#/kitchens/${it.kitchen_id}" style="font-size:12px">🍳 open the kitchen design</a>` : ''}<div class="sub"><textarea data-k="note" rows="1" placeholder="Sub-description (e.g. W/1 – one side swing, other side fix)">${esc(it.note || '')}</textarea></div></td>
        <td><select data-k="model_id" style="width:130px">${modelOpts(it)}</select><div class="mini-draw" data-draw></div></td>
        <td><input class="w-s" data-k="w" type="number" step="any" value="${it.w ?? ''}"></td>
        <td><input class="w-s" data-k="h" type="number" step="any" value="${it.h ?? ''}"></td>
        <td style="min-width:104px">${handCell(it)}</td>
        <td><select data-k="glass_id" style="width:110px">${glassOpts(it.glass_id)}</select><div class="cost" data-fit style="text-align:left;max-width:150px"></div></td>
        <td><select data-k="colour" style="width:92px">${colourOptions(S.settings.colours, it.colour, '(as quote)')}</select></td>
        <td><input class="w-q" data-k="qty" type="number" step="any" value="${it.qty ?? 1}"></td>
        <td><input class="w-m price" data-k="price" type="number" step="any" value="${it.price ?? 0}" title="${it.manual ? 'Manual price' : 'Calculated from price list'}"></td>
        <td style="text-align:center"><input type="checkbox" data-k="vat" style="width:auto" ${hasVat(it) ? 'checked' : ''} title="${hasVat(it) ? 'VAT is charged on this line' : 'No VAT on this line'}"></td>
        <td class="tot"><span data-tot>${money(num(it.qty) * num(it.price))}</span><div class="cost" data-cost></div><div class="cost" data-lo style="color:var(--ok)"></div></td>
        <td>${rowBtns(i)}</td></tr>`;
    }).join('');
    update();
  };
  const rowBtns = (i) => `<button class="btn sm" data-a="up" title="Move up">↑</button><button class="btn sm" data-a="dup" title="Duplicate">⧉</button><button class="btn sm danger" data-a="rm" title="Remove">×</button>`;

  const limit = Number(S.settings.approvals?.discount_pct ?? 10); const isAdmin = S.me.role === 'admin';
  const aprBanner = (state) => {
    const a = state.approval; const box = $('#apr', el); if (!box) return;
    box.innerHTML = a === 'pending' ? `<div class="card" style="margin-bottom:12px;border-color:var(--warn)">⏳ <b>Waiting for the admin.</b> The discount is above ${limit}%. The quotation cannot be sent, accepted or turned into an order until it is approved. <a href="#/approvals">Approvals</a></div>`
      : a === 'rejected' ? `<div class="card" style="margin-bottom:12px;border-color:var(--bad)">✖ <b>The admin did not approve this discount.</b> ${esc(state.approval_note || '')} Lower the discount and save again.</div>`
      : a === 'approved' && limit ? `<div class="card" style="margin-bottom:12px;border-color:var(--ok)">✔ Discount approved. ${esc(state.approval_note || '')}</div>` : '';
  };
  aprBanner(q);
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
      const fitEl = $('[data-fit]', tr); if (fitEl) { const gn = glazingNote(m, S.glass_types.find((g) => g.id === Number(it.glass_id))); fitEl.textContent = gn?.best ? `bead ${gn.best.codes[0]} · ${gn.best.outerCode}+${gn.best.innerCode}` : gn ? '⚠ glass does not fit' : ''; fitEl.title = gn?.text || ''; fitEl.style.color = gn && !gn.best ? 'var(--bad)' : ''; }
      const dr = $('[data-draw]', tr); if (dr) { const key = [it.model_id, it.w, it.h, it.glass_id, it.colour || q.colour, it.hand, it.swing].join('|'); if (dr.dataset.k !== key) { dr.dataset.k = key; dr.innerHTML = m ? drawModel(m.kind, it.w || m.def_w, it.h || m.def_h, { dims: false, colour: it.colour || q.colour, glass: S.glass_types.find((g) => g.id === Number(it.glass_id))?.name, hand: it.hand, swing: it.swing, layout: m.spec?.layout }) : ''; } }
    });
    $('#totals', el).innerHTML = `
      <div class="row"><span>Items total</span><b id="t_sub">${money(T.subtotal)}</b></div>
      ${T.after ? '' : `<div class="row"><span>Discount <small class="muted" id="t_pct">${T.subtotal ? '(' + T.discPct.toFixed(2) + '%)' : ''}</small></span><input id="discount" type="number" step="any" value="${q.discount || 0}"></div>
      <div class="row"><span>Amount</span><b id="t_amount">${money(T.amount)}</b></div>`}
      <div class="row"><span>VAT <input id="vat_rate" type="number" step="any" value="${q.vat_rate ?? 0}" style="width:60px"> % <small class="muted" id="t_vbase">${T.exempt > 0.0005 ? `on ${money(T.vatBase)} (${money(T.exempt)} has no VAT)` : ''}</small></span><b id="t_vat">${money(T.vat)}</b></div>
      <div class="row"><span>VAT adjustment <small class="muted">(enter VAT to waive)</small></span><input id="vat_waived" type="number" step="any" value="${q.vat_waived || 0}"></div>
      ${T.after ? `<div class="row"><span>Total with VAT</span><b id="t_total">${money(T.total)}</b></div>
      <div class="row"><span>Discount <small class="muted" id="t_pct">${T.subtotal ? '(' + T.discPct.toFixed(2) + '%)' : ''}</small></span><input id="discount" type="number" step="any" value="${q.discount || 0}"></div>` : ''}
      <div class="row grand"><span>Grand amount (BD)</span><span id="t_grand">${money(T.grand)}</span></div>
      <div class="row"><span class="muted">Discount is taken</span><select id="disc_mode" style="width:130px"><option value="after" ${T.after ? 'selected' : ''}>after VAT</option><option value="before" ${T.after ? '' : 'selected'}>before VAT</option></select></div>
      <p class="neg" id="dwarn" style="margin:6px 0 0;text-align:right" ${limit > 0 && T.discPct > limit + 1e-9 && !isAdmin ? '' : 'hidden'}>Discount above ${limit}% — the admin will have to approve it.</p>`;
    $('#disc_mode', el).onchange = (e) => { q.disc_mode = e.target.value; update(); };
    $('#words', el).textContent = T.grand > 0 ? amountInWords(T.grand) : '';
    $('#costline', el).textContent = costTotal ? `Estimated material cost ≈ BD ${money(costTotal, 2)} → margin ≈ BD ${money(T.amount - costTotal - (T.after ? 0 : 0), 2)} (before VAT and discount)` : '';
    for (const [k] of [['discount'], ['vat_rate'], ['vat_waived']]) $('#' + k, el).oninput = (e) => { q[k] = num(e.target.value); update2(); };
    renderLO();
  }
  $('#colour', el).onchange = (e) => { q.colour = e.target.value; update(); };
  let loTimer = 0;
  function renderLO() { clearTimeout(loTimer); loTimer = setTimeout(doLO, 120); }
  let lastRes = null; let accMarkup = Number(S.settings.accessory_markup ?? 25);
  /** Accessories and rubber the quoted models need, with what they cost and a selling price. */
  function drawAcc(pieces) {
    const box = $('#acc', el); if (!box) return; const list = accessoriesFor(pieces, S.accessories);
    if (!list.length) { box.innerHTML = '<h3 style="margin:0">Accessories &amp; rubber</h3><p class="muted" style="margin:6px 0 0">Pick a model and a size on the items to see the hardware and rubber they need.</p>'; return; }
    const cost = list.reduce((a, e) => a + e.cost, 0); const rub = list.filter((e) => e.rubber); const rubCost = rub.reduce((a, e) => a + e.cost, 0);
    const f = (v) => money(v, 2);
    box.innerHTML = `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3 style="margin:0">Accessories &amp; rubber needed</h3><span class="grow"></span><label class="muted">Mark-up <input id="accmk" type="number" step="any" value="${accMarkup}" style="width:64px"> %</label></div>
      <div class="items-wrap"><table class="grid" style="margin-top:8px"><thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th class="num">Unit cost</th><th class="num">Cost</th><th class="num">Price</th><th>Used in</th></tr></thead><tbody>${list.map((e) => `<tr><td>${e.rubber ? '〰 ' : ''}${esc(e.name)} <span class="muted">${esc(e.code)}</span></td><td class="num">${fq(e.qty)}</td><td>${esc(e.unit)}</td><td class="num">${e.price ? money(e.price, 3) : '<span class="muted">—</span>'}</td><td class="num">${f(e.cost)}</td><td class="num" data-p="${e.cost}">${f(e.cost * (1 + accMarkup / 100))}</td><td class="muted" style="font-size:11px">${esc(e.models.join(', '))}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="4">Total accessories <span class="muted">(rubber ${f(rubCost)})</span></td><td class="num">${f(cost)}</td><td class="num" id="accTot">${f(cost * (1 + accMarkup / 100))}</td><td></td></tr></tfoot></table></div>${list.some((e) => !e.price) ? '<p class="muted" style="margin:6px 0 0">Items showing — have no price in Profiles, Glass &amp; Accessories yet.</p>' : ''}`;
    $('#accmk', box).oninput = (e) => { accMarkup = num(e.target.value); $$('[data-p]', box).forEach((td) => (td.textContent = f(Number(td.dataset.p) * (1 + accMarkup / 100)))); $('#accTot', box).textContent = f(cost * (1 + accMarkup / 100)); };
  }
  function doLO() {
    const box = $('#lo', el); if (!box) return;
    const common = { profiles: S.profiles, glassTypes: S.glass_types, kerf: S.settings.bar_kerf || 0, quoteNo: q.number || '' };
    const pieces = quotePieces(q, S.models, { profiles: S.profiles, accessories: S.accessories, glassTypes: S.glass_types });
    drawAcc(pieces);
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
    const T = quoteTotals(q); const set = (id2, v) => { const e = $('#' + id2, el); if (e) e.textContent = v; };
    set('t_sub', money(T.subtotal)); set('t_amount', money(T.amount)); set('t_vat', money(T.vat)); set('t_total', money(T.total)); set('t_grand', money(T.grand));
    set('t_pct', T.subtotal ? `(${T.discPct.toFixed(2)}%)` : ''); set('t_vbase', T.exempt > 0.0005 ? `on ${money(T.vatBase)} (${money(T.exempt)} has no VAT)` : '');
    $('#dwarn', el).hidden = !(limit > 0 && T.discPct > limit + 1e-9 && !isAdmin);
    $('#words', el).textContent = T.grand > 0 ? amountInWords(T.grand) : '';
  };

  const reprice = (it) => {
    const p = pi(it.desc);
    if (p) { if (!it.manual) it.price = priceFor(p, num(it.w), num(it.h)); }
  };
  tbody.addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-i]'); if (!tr) return;
    const it = q.items[Number(tr.dataset.i)]; const k = e.target.dataset.k; if (!k) return;
    if (k === 'vat') { it.vat = e.target.checked; e.target.title = it.vat ? 'VAT is charged on this line' : 'No VAT on this line'; update(); return; }
    const v = e.target.value;
    if (['w', 'h', 'qty', 'price'].includes(k)) it[k] = v === '' ? null : num(v); else it[k] = v;
    if (k === 'price') it.manual = true;
    if (['w', 'h', 'desc'].includes(k)) {
      const before = it.price; reprice(it);
      const pr = $('[data-k=price]', tr); if (pr && it.price !== before) pr.value = it.price;
    }
    update();
  });
  tbody.addEventListener('change', (e) => {
    const tr = e.target.closest('tr[data-i]'); if (!tr) return; const it = q.items[Number(tr.dataset.i)]; const k = e.target.dataset.k;
    if (k === 'desc' && it.kind !== 'note') {
      // choosing a different description replaces what no longer matches it: the model (and so hand / opening / glass) follows the new item
      const p = pi(it.desc);
      if (p && it.pi_id !== p.id) { it.pi_id = p.id; it.model_id = p.model_id || null; it.manual = false; it.vat = p.vat !== 0; /* the price item decides whether VAT applies; the box on the line can still be changed */ it.price = priceFor(p, num(it.w), num(it.h)); delete it.hand; delete it.swing; normalise(it); drawRows(); }
      else if (!p && it.pi_id) { it.pi_id = null; it.model_id = null; delete it.hand; delete it.swing; drawRows(); toast('The description no longer matches the price list, so the model was cleared'); }
      return;
    }
    if (k === 'model_id') { it.model_id = e.target.value ? Number(e.target.value) : null; delete it.hand; delete it.swing; normalise(it); drawRows(); return; }
    if (k === 'glass_id') { it.glass_id = e.target.value ? Number(e.target.value) : null; update(); } else if (k === 'colour') { it.colour = e.target.value; update(); } else if (k === 'hand' || k === 'swing') { it[k] = e.target.value; update(); }
  });
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

  { // the customer number, and the customer's details filled in when an existing customer is picked
    const customers = await api.get('t/customers').catch(() => []); const nm = (x) => String(x || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const find = () => customers.find((c) => nm(c.name) === nm($('#client', el).value)); const chip = () => { const c = find(); $('#custno', el).innerHTML = c ? `· <a href="#/customers/${c.id}">${esc(c.code)}</a>` : $('#client', el).value.trim() ? '· new customer' : ''; };
    const dl = $('#dl-clients', el); if (dl) dl.innerHTML = [...new Set([...customers.map((c) => c.name), ...clients])].map((n) => `<option value="${esc(n)}">`).join('');
    const pick = $('#locpick', el); const fillPick = () => { const c = find(); const ls = c ? (Array.isArray(c.locations) && c.locations.length ? c.locations : c.address ? [{ label: '', address: c.address, gps: c.gps || '' }] : []) : []; pick.hidden = ls.length < 2; pick.innerHTML = '<option value="">📍 saved locations…</option>' + ls.map((l, i) => `<option value="${i}">${esc(l.label || l.address || 'Site ' + (i + 1))}${l.label && l.address ? ' — ' + esc(l.address) : ''}</option>`).join(''); pick._ls = ls; };
    pick.addEventListener('change', () => { const l = pick._ls?.[Number(pick.value)]; if (!l) return; $('#site', el).value = l.address || ''; $('#site', el).dispatchEvent(new Event('input')); $('#gps', el).value = l.gps || ''; $('#gps', el).dispatchEvent(new Event('change')); pick.value = ''; });
    $('#client', el).addEventListener('input', () => { chip(); fillPick(); }); $('#client', el).addEventListener('change', () => { fillPick(); const c = find(); if (c) { if (!$('#mobile', el).value && c.mobile) $('#mobile', el).value = c.mobile; if (!$('#site', el).value && c.address) $('#site', el).value = c.address; if (!$('#gps', el).value && c.gps) { $('#gps', el).value = c.gps; $('#gps', el).dispatchEvent(new Event('change')); } if (!$('#client_vat', el).value && c.vat_no) $('#client_vat', el).value = c.vat_no; } chip(); }); chip(); fillPick();
  }
  wireGps(el, 'gps', '#site');
  const collect = () => ({
    client_vat: $('#client_vat', el).value.trim(), number: $('#number', el).value.trim(), date: $('#date', el).value, client: $('#client', el).value.trim(), mobile: $('#mobile', el).value.trim(), site: $('#site', el).value.trim(),
    gps: parseGps($('#gps', el).value), title: $('#title', el).value.trim(), colour: $('#colour', el).value, status: $('#status', el).value, notes: $('#notes', el).value, prepared_by: $('#prepared_by', el).value.trim(),
    items: q.items.filter((it) => it.kind === 'note' ? it.desc.trim() : (it.desc.trim() || it.price)), discount: q.discount || 0, vat_rate: q.vat_rate ?? 0, vat_waived: q.vat_waived || 0, disc_mode: q.disc_mode || 'before',
    ...(pw ? { password: pw } : {}),
  });
  const save = async () => {
    const data = collect();
    if (!data.client) { toast('Enter the client name', 'err'); return null; }
    const saved = id ? await api.put(`t/quotes/${id}`, data) : await api.post('t/quotes', data);
    pw = ''; await refresh();
    if (saved.approval === 'pending') { toast(`Saved ${saved.number} — the discount is waiting for the admin`, 'err'); $('#status', el).value = saved.status; }
    else toast(`Saved ${saved.number}`);
    aprBanner(saved); $('#toOrder', el)?.toggleAttribute('disabled', !!q.order_inv || saved.approval === 'pending' || saved.approval === 'rejected'); q.approval = saved.approval; q.approval_note = saved.approval_note; return saved;
  };
  // an accepted quotation goes back to draft only for the admin, who confirms with their password
  $('#status', el).onchange = (e) => {
    if (origStatus !== 'accepted' || e.target.value === 'accepted') { pw = ''; return; }
    const back = () => { e.target.value = 'accepted'; pw = ''; };
    if (!isAdmin) { toast('Only the admin can change an accepted quotation', 'err'); return back(); }
    const f = [{ key: 'password', label: 'Your admin password', type: 'password' }]; const w = document.createElement('div'); w.innerHTML = `<p>${esc(q.number)} was accepted. Enter your password to change it back.</p>` + formHTML(f, {});
    modal({ title: 'Confirm with your password', body: w, onClose: () => { if (!pw) back(); }, buttons: [{ label: 'Cancel' }, { label: 'Confirm', kind: 'primary', onClick: () => { const v = readForm(w, f).password; if (!v) { toast('Enter your password', 'err'); return false; } pw = v; } }] });
  };
  $('#save', el).onclick = guard(async () => { const s = await save(); if (s && !id) location.hash = `#/quotes/${s.id}`; });
  if (id) {
    $('#toOrder', el).onclick = guard(async () => {
      const sv = await save(); if (!sv) return;
      if (sv.approval === 'pending' || sv.approval === 'rejected') return toast('The discount must be approved by the admin first', 'err');
      if (!await confirmBox(`Create an order/invoice from ${q.number} for BD ${money(quoteTotals(collect()).grand)}?`, 'Create order', 'primary')) return;
      const o = await api.post(`quotes/${id}/to-order`, {}); await refresh(); toast(`Created ${o.inv}${o.credit_earned ? ` — the customer earned BD ${money(o.credit_earned, 2)} credit` : ''}`); location.hash = '#/orders';
      const fresh = await api.get(`t/quotes/${id}`);
      openPoDialog({ quote: fresh, orderInv: o.inv, onDone: () => (location.hash = '#/pos') });
    });
    $('#dup', el).onclick = guard(async () => { const c = await duplicate(id); location.hash = `#/quotes/${c.id}`; });
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
    const opt = [it.hand && (it.hand === 'R' ? 'Right hand' : 'Left hand'), it.swing && (it.swing === 'in' ? 'opens inside' : 'opens outside')].filter(Boolean).join(' · '); const optAr = [it.hand && (it.hand === 'R' ? 'يمين' : 'يسار'), it.swing && (it.swing === 'in' ? 'يفتح للداخل' : 'يفتح للخارج')].filter(Boolean).join(' · ');
    return `<tr><td>${n}</td><td class="n">${it.w ? fq(it.w) : ''}${it.w && it.h ? ' × ' + fq(it.h) : ''}</td><td>${esc(it.desc)}${hasVat(it) ? '' : ' ‡'}${opt ? `<div class="note">${opt} <span class="ar">${optAr}</span></div>` : ''}${it.note ? `<div class="note">${esc(it.note).replace(/\n/g, '<br>')}</div>` : ''}</td><td class="n">${fq(it.qty)}</td><td class="n">${money(it.price, 2)}</td><td class="n">${money(num(it.qty) * num(it.price), 2)}</td></tr>`;
  }).join('');
  // kitchens on this quotation come with their drawings
  const kids = [...new Set((q.items || []).map((i) => i.kitchen_id).filter(Boolean))];
  const kitchens = (await Promise.all(kids.map((k) => api.get(`t/kitchens/${k}`).catch(() => null)))).filter(Boolean);
  const drawings = kitchens.map((k) => { const spec = k.spec || {}; return `<div style="break-before:page"><h3>${L('kitchen', 'Kitchen design')}: ${esc(k.name)}</h3><div class="ar-title" style="margin:0 0 6px">${AR.design}</div><div style="color:#111">${elevationSVG(spec, { maxW: 700 })}</div><div style="color:#111;margin-top:8px">${planSVG(spec, kitchenModel(spec), { maxW: 700 })}</div></div>`; }).join('');
  const html = `${docHeader('QUOTATION', AR.quotation)}
    ${q.approval === 'pending' ? '<div class="stamp">DRAFT — DISCOUNT WAITING FOR APPROVAL</div>' : ''}
    <div class="meta"><div><b>${L('quote', 'QUOTE')}:</b> ${esc(q.number)}</div><div><b>${L('mobile', 'Mob')}:</b> ${esc(q.mobile)}</div><div><b>${L('date', 'DATE')}:</b> ${dmy(q.date)}</div><div><b>${L('site', 'W/Site')}:</b> ${esc(q.site)}</div><div style="grid-column:1/-1"><b>${L('client', 'Client')}:</b> ${esc(q.client)}${q.client_vat ? ` &nbsp; <b>${L('vatNo', 'VAT No.')}:</b> ${esc(q.client_vat)}` : ''}</div></div>
    ${q.title ? `<div class="banner">${esc(q.title)}</div>` : ''}
    <table class="items-print"><thead><tr><th>#</th><th class="n">${L('size', 'Size (W × H cm)')}</th><th>${L('description', 'Description')}</th><th class="n">${L('qty', 'Qty')}</th><th class="n">${L('unit', 'Unit')}</th><th class="n">${L('amount', 'Amount')}</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tot"><div><span>${L('total', 'Total')}</span><span>${money(T.subtotal, 2)}</span></div>${T.after ? `${q.vat_rate ? `<div><span>${L('vat', 'VAT')} ${fq(q.vat_rate)}%</span><span>${money(T.vat, 2)}</span></div>` : ''}${T.waived ? `<div><span>${L('vatAdj', 'VAT adjustment')}</span><span>- ${money(T.waived, 2)}</span></div>` : ''}${T.discount ? `<div><span>${L('total', 'Total with VAT')}</span><span>${money(T.total, 2)}</span></div><div><span>${L('disc', 'Disc')} ${T.discPct.toFixed(2)}%</span><span>- ${money(T.discount, 2)}</span></div>` : ''}` : `${T.discount ? `<div><span>${L('disc', 'Disc')} ${T.discPct.toFixed(2)}%</span><span>- ${money(T.discount, 2)}</span></div><div><span>${L('amount', 'Amount')}</span><span>${money(T.amount, 2)}</span></div>` : ''}${q.vat_rate ? `<div><span>${L('vat', 'VAT')} ${fq(q.vat_rate)}%</span><span>${money(T.vat, 2)}</span></div>` : ''}${T.waived ? `<div><span>${L('vatAdj', 'VAT adjustment')}</span><span>- ${money(T.waived, 2)}</span></div>` : ''}`}<div class="g"><span>${L('grand', 'Grand Amount BD')}</span><span>${money(T.grand, 2)}</span></div></div>
    ${T.exempt > 0.0005 && q.vat_rate ? `<p style="font-size:11px;margin:4px 0">‡ ${L('noVat', 'Not subject to VAT')} — VAT is charged on BD ${money(T.vatBase, 2)}</p>` : ''}
    ${wordsBlock(T.grand)}
    <div class="sign"><div>${L('prepared', 'Prepared')} ${esc(q.prepared_by || '')}</div><div>${L('custSign', 'Cust. Sign')}</div></div>
    ${termsBlock()}${drawings}`;
  printView(el, { back: `#/quotes/${id}`, html, extraButtons: `<a class="btn" href="#/cutting/${id}">Cutting list</a>` });
}
