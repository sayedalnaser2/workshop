import { scene, draw3D, pick3D, placeRuns, unproject, frontsOf, runStarts } from '../kitchen-3d.js';
import { S } from '../app.js';
import { api, $, $$, esc, money, qty as fq, num, today, dmy, toast, guard, confirmBox, modal, formHTML, readForm, dataTable, badge, datalist } from '../ui.js';
import { colourOptions } from '../ui.js';
import { shelfCount, hasSkirt, layoutSlots, slotsFromCab, addSlot, slotHeights, CAB_TYPES, DEFAULT_STYLE, DEFAULT_COUNTER, APPLIANCES, SLOT_KINDS, DIRS, ACCESSORIES, slotsOf, kitchenModel, priceKitchen, cutKey, CUT_MODES, hasTopSheet, openDoorsOf, hasHiddenHandle, mergeCabinets, splitCabinet, mergeSaving } from '../kitchen.js';
import { elevationSVG, planSVG, sheetSVG } from '../kitchen-draw.js';
import { docHeader, docFooter, L, AR, wordsBlock, termsBlock } from '../doc.js';
import { openPoDialog } from '../po-dialog.js';

const isWorker = () => S.me?.role === 'worker';
const KINDS = [['panel', 'Boards / sheets', 'sheet'], ['handle', 'Handles', ''], ['hinge', 'Hinges', 'pcs'], ['drawer', 'Drawer systems', 'set'], ['marble', 'Countertop stone', 'm²'], ['glass', 'Door glass', 'm²'], ['profile', 'Door frame profiles (aluminium)', 'bar'], ['profile_colour', 'Profile colours', ''], ['preset', 'Cabinet presets', ''], ['general', 'Rates & other prices', '']];
const GEN_NOTE = {};

/** Options from the database → { kind: { name: row } }, marble also keyed "name|thickness"; general → numbers. */
function optionsMap(list) {
  const m = {};
  for (const o of list) {
    const k = (m[o.kind] ||= {});
    if (o.kind === 'general') { k[o.name] = Number(o.price) || 0; GEN_NOTE[o.name] = o.note; continue; }
    k[o.name] = o; if (o.kind === 'marble' && o.meta?.thickness) k[`${o.name}|${o.meta.thickness}`] = o;
  }
  m.alu = {}; for (const p of S.profiles || []) if (p.code) m.alu[p.code] = { price: Number(p.price_bar) || 0, name: p.name, bar: p.bar_length };
  return m;
}
/** Each cabinet's name in the cut list (its label, or A1, A2… by run and place) → what it is and its size W × D × H. */
function cabNames(spec) {
  const m = new Map();
  (spec.runs || []).forEach((run, ri) => (run.cabinets || []).forEach((c, ci) => { const name = c.label || `${String.fromCharCode(65 + (ri % 26))}${ci + 1}`; const t = CAB_TYPES[c.type] || CAB_TYPES.base; m.set(name, `${t.label} ${+c.w || 0}×${+c.d || 0}×${+c.h || 0}`); }));
  return m;
}
const cabOf = (label) => { const i = String(label).lastIndexOf(' · '); return i < 0 ? '' : label.slice(0, i); };
/** The cabinets a row of the cut list comes from: "A1 Base cabinet 100×60×70". */
const cabCell = (names, cabs) => [...cabs].filter(Boolean).map((c) => `<div style="white-space:nowrap"><b>${esc(c)}</b>${names.get(c) ? ` <span class="muted" style="font-size:12px">${esc(names.get(c))}</span>` : ''}</div>`).join('') || '<span class="muted">—</span>';
/** Every aluminium profile piece of a kitchen, one row each: which cabinet, which part, which profile (code + name), length, how many. */
function profileRows(model, sty) {
  const nameOf = (code) => (S.profiles || []).find((x) => x.code === code)?.name || '';
  const split = (label) => { const i = String(label).lastIndexOf(' · '); return i < 0 ? ['', label] : [label.slice(0, i), label.slice(i + 3)]; };
  const rows = [];
  for (const g of model.carcassBars || []) for (const x of g.parts) { const [cab, part] = split(x.label); rows.push({ cab, part, code: g.code, name: nameOf(g.code), len: x.len, qty: x.qty, cut: 'straight' }); }
  if (model.profile) { const code = String(sty.profile || '').split(' ')[0] || '28456'; const nm = nameOf(code) || String(sty.profile || '').split(' ').slice(1).join(' '); for (const f of model.frames) { const [cab, part] = split(f.label); rows.push({ cab, part: `${part} — height`, code, name: nm, len: f.h, qty: 2 * f.qty, cut: '45°' }, { cab, part: `${part} — width`, code, name: nm, len: f.w, qty: 2 * f.qty, cut: '45°' }); } }
  return rows.sort((a, b) => String(a.cab).localeCompare(String(b.cab), undefined, { numeric: true }) || String(a.code).localeCompare(String(b.code), undefined, { numeric: true })); // cabinet by cabinet
}
const profTag = (code, name) => `<span class="badge blue" style="font-weight:700">${esc(code)}</span>${name ? ` <span class="muted" style="font-size:12px">${esc(name)}</span>` : ''}`;
const namesOf = (list, kind) => [...new Set(list.filter((o) => o.kind === kind).map((o) => o.name))];

export async function render(el, [id, tab]) {
  if (id === 'options' && !isWorker()) return optionsPage(el);
  if (id) return editor(el, Number(id), isWorker() ? (tab === 'view3d' ? 'view3d' : 'sheet') : tab || 'design');
  return list(el);
}

// ------------------------------------------------------------------ list
async function list(el) {
  const rows = await api.get('t/kitchens');
  const opts = isWorker() ? null : optionsMap(await api.get('t/kitchen_options'));
  const view = rows.map((k) => { const m = kitchenModel(k.spec || {}); const p = opts ? priceKitchen(m, opts) : null; return { ...k, m, base: m.meters.base, wall: m.meters.wall, tall: m.meters.tall, counter: m.tops.run_m, price: p?.suggested || 0, cost: p?.cost || 0 }; });
  el.innerHTML = `<div class="ph"><h1>Kitchens</h1><span class="sub">Design cabinets and countertops, get the cut list, hardware, boards and a price</span><span class="grow"></span>${isWorker() ? '' : '<a class="btn" href="#/kitchens/options">Options &amp; prices</a><button class="btn primary" id="new">+ New kitchen</button>'}</div><div id="t"></div>`;
  $('#new', el)?.addEventListener('click', () => newKitchen());
  const t = $('#t', el);
  dataTable(t, {
    rows: view, search: ['name', 'client', 'order_inv', 'quote_no'], empty: 'No kitchens yet — start one with “New kitchen”.',
    cols: [{ key: 'name', label: 'Kitchen', render: (r) => `<b>${esc(r.name)}</b><div class="muted" style="font-size:11px">${esc(r.client || '')}</div>` }, { key: 'order_inv', label: 'Order', render: (r) => esc(r.order_inv || r.quote_no || '') },
      { key: 'base', label: 'Base', num: true, render: (r) => `${fq(r.base)} m` }, { key: 'wall', label: 'Wall', num: true, render: (r) => `${fq(r.wall)} m` }, { key: 'tall', label: 'Tall', num: true, render: (r) => `${fq(r.tall)} m` }, { key: 'counter', label: 'Countertop', num: true, render: (r) => `${fq(r.counter)} m` },
      ...(isWorker() ? [] : [{ key: 'price', label: 'Price (BD)', num: true, render: (r) => (r.price ? money(r.price, 2) : '<span class="muted">—</span>') }]),
      { key: 'status', label: 'Status', render: (r) => badge(r.status || 'draft', r.status === 'approved' ? 'ok' : '') }],
    onRow: (r) => (location.hash = `#/kitchens/${r.id}`),
    actions: () => `<button class="btn sm primary" data-act="3d">🧊 3D</button>${isWorker() ? '' : ' <button class="btn sm" data-act="dup">Duplicate</button> <button class="btn sm danger" data-act="del">Delete</button>'}`,
  });
  t.addEventListener('act', guard(async (e) => {
    const { act, row } = e.detail;
    if (act === '3d') { location.hash = `#/kitchens/${row.id}/view3d`; return; }
    if (act === 'del' && await confirmBox(`Delete kitchen “${row.name}”?`)) { await api.del(`t/kitchens/${row.id}`); render(el, []); }
    if (act === 'dup') { const { id, created_at, ...c } = row; delete c.m; delete c.base; delete c.wall; delete c.tall; delete c.counter; delete c.price; delete c.cost; const n = await api.post('t/kitchens', { ...c, name: `${row.name} (copy)` }); location.hash = `#/kitchens/${n.id}`; }
  }));
}

const TEMPLATES = {
  straight: { label: 'Straight (one wall)', runs: (w) => [{ name: 'Main wall', cabinets: fill(w, ['base', 'base', 'sink', 'drawers', 'base']) }, { name: 'Wall units', cabinets: fill(w, ['wall', 'wall', 'wall', 'wall', 'wall']) }] },
  l: { label: 'L-shaped (two walls)', runs: (w) => [{ name: 'Wall A', cabinets: fill(w, ['base', 'sink', 'drawers', 'base', 'corner']) }, { name: 'Wall B', cabinets: fill(Math.round(w * .7), ['base', 'hob', 'base', 'gap']) }, { name: 'Wall units A', cabinets: fill(w, ['wall', 'wall', 'wall', 'wall']) }] },
  u: { label: 'U-shaped (three walls)', runs: (w) => [{ name: 'Left', cabinets: fill(Math.round(w * .6), ['corner', 'base', 'base']) }, { name: 'Back', cabinets: fill(w, ['base', 'sink', 'drawers', 'hob', 'base']) }, { name: 'Right', cabinets: fill(Math.round(w * .6), ['base', 'base', 'corner']) }] },
  island: { label: 'Straight + island', runs: (w) => [{ name: 'Main wall', cabinets: fill(w, ['base', 'base', 'sink', 'drawers', 'base']) }, { name: 'Wall units', cabinets: fill(w, ['wall', 'wall', 'wall', 'wall', 'wall']) }, { name: 'Island', island: true, overhang: 30, cabinets: fill(Math.round(w * .5), ['drawers', 'base', 'hob']).map((c) => ({ ...c, d: 60 })) }] },
  empty: { label: 'Empty — I will add cabinets', runs: () => [{ name: 'Main wall', cabinets: [] }] },
};
/** Spread a target length over a list of cabinet types, keeping standard heights, depths and doors. */
function fill(total, types) {
  const std = types.map((t) => ({ ...CAB_TYPES[t], type: t })); const sum = std.reduce((a, c) => a + c.w, 0); const f = total / sum;
  return std.map((c) => ({ type: c.type, label: '', w: Math.max(30, Math.round((c.w * f) / 5) * 5), h: c.h, d: c.d, doors: c.doors, drawers: c.drawers, shelves: c.shelves, glazed: 0 }));
}
const cabinetOf = (type) => { const t = CAB_TYPES[type]; return { type, label: '', w: t.w, h: t.h, d: t.d, doors: t.doors, drawers: t.drawers, shelves: t.shelves, glazed: 0, ...(t.hood ? { y: 150 } : t.shelf ? { y: 130 } : {}) }; };

async function newKitchen() {
  const orders = (await api.get('ledger')).filter((o) => !o.done);
  const w = document.createElement('div');
  const fields = [{ key: 'name', label: 'Kitchen name', required: true, placeholder: 'e.g. Villa 12 kitchen' }, { key: 'client', label: 'Client' }, { key: 'order_inv', label: 'Order / invoice', list: 'dl-ko' },
    { key: 'tpl', label: 'Start from', type: 'select', options: Object.entries(TEMPLATES).map(([k, v]) => [k, v.label]) }, { key: 'len', label: 'Main wall length (cm)', type: 'number', default: 360 }];
  w.innerHTML = datalist('dl-ko', orders.map((o) => o.inv)) + formHTML(fields, { tpl: 'straight', len: 360 });
  modal({ title: 'New kitchen', body: w, buttons: [{ label: 'Cancel' }, { label: 'Create', kind: 'primary', onClick: async () => {
    const d = readForm(w, fields); if (!d.name) { toast('Give the kitchen a name', 'err'); return false; }
    const o = orders.find((x) => x.inv === d.order_inv); const opt = await api.get('t/kitchen_options');
    const first = (kind) => opt.find((x) => x.kind === kind)?.name || '';
    const style = { ...DEFAULT_STYLE, carcass: first('panel'), door: first('panel'), back: first('panel'), handle: first('handle'), hinge: first('hinge'), drawer: first('drawer'), glass: first('glass'), profile_in: first('profile_colour'), profile_out: first('profile_colour') };
    const k = await api.post('t/kitchens', { name: d.name, client: d.client || o?.client || '', order_inv: d.order_inv, status: 'draft', spec: { style, counter: { ...DEFAULT_COUNTER, material: first('marble') }, runs: TEMPLATES[d.tpl].runs(d.len || 360) } });
    location.hash = `#/kitchens/${k.id}`;
  } }] });
}

// ------------------------------------------------------------------ editor
async function editor(el, id, tab) {
  const k = await api.get(`t/kitchens/${id}`).catch(() => null);
  if (!k) { el.innerHTML = '<p class="err">Kitchen not found.</p>'; return; }
  const worker = isWorker();
  const optList = worker ? [] : await api.get('t/kitchen_options');
  const opts = optionsMap(optList);
  k.spec ||= {}; k.spec.style = { ...DEFAULT_STYLE, ...(k.spec.style || {}) }; k.spec.counter = { ...DEFAULT_COUNTER, ...(k.spec.counter || {}) }; k.spec.runs ||= [];
  let model = kitchenModel(k.spec); let dirty = false; let view = sessionStorage.getItem('kv') || 'elev';
  const spec = k.spec; const TABS = worker ? [['sheet', 'Production sheet'], ['view3d', '3D view']] : [['design', 'Design'], ['view3d', '3D view'], ['cuts', 'Cut list & boards'], ['counter', 'Countertop'], ['price', 'Price'], ['proposal', 'Customer page'], ['sheet', 'Production sheet']];
  el.innerHTML = `<div id="kit"></div>`; const root = $('#kit', el);
  // undo / redo of every change made to the kitchen (the picture, the table, the panel): snapshots of the whole design; quick successive edits (a drag, typing) count as one step
  const hist = { undo: [], redo: [], cur: JSON.stringify(k.spec || {}), at: 0, after: null };
  const touch = () => {
    dirty = true; model = kitchenModel(spec); const b = $('#save', root); if (b) b.textContent = 'Save changes ●';
    const now = JSON.stringify(spec); if (now !== hist.cur) { if (Date.now() - hist.at > 700 || !hist.undo.length) { hist.undo.push(hist.cur); if (hist.undo.length > 60) hist.undo.shift(); } hist.at = Date.now(); hist.cur = now; hist.redo.length = 0; }
    hist.after?.();
  };
  const restore = (snap) => { const o = JSON.parse(snap); for (const key of Object.keys(spec)) delete spec[key]; Object.assign(spec, o); hist.cur = snap; hist.at = 0; dirty = true; model = kitchenModel(spec); const b = $('#save', root); if (b) b.textContent = 'Save changes ●'; };
  const stepBack = (dir) => { const from = dir < 0 ? hist.undo : hist.redo; if (!from.length) return false; (dir < 0 ? hist.redo : hist.undo).push(hist.cur); restore(from.pop()); return true; };
  const head = () => `<div class="ph"><a class="btn" href="#/kitchens">← Kitchens</a><h1>${esc(k.name)}</h1>${badge(k.status || 'draft', k.status === 'approved' ? 'ok' : '')}<span class="sub">${[k.client, k.order_inv].filter(Boolean).map(esc).join(' · ')}</span><span class="grow"></span>${worker ? '' : '<button class="btn primary" id="save">Save</button>'}</div>
    <div class="tbar"><div class="seg">${TABS.map(([t, l]) => `<button data-tab="${t}" class="${t === tab ? 'on' : ''}">${l}</button>`).join('')}</div></div><div id="pane"></div>`;
  const draw = () => {
    root.innerHTML = head(); const pane = $('#pane', root);
    $$('[data-tab]', root).forEach((b) => (b.onclick = () => { tab = b.dataset.tab; draw(); }));
    $('#save', root)?.addEventListener('click', guard(async () => { await api.put(`t/kitchens/${id}`, { name: k.name, client: k.client, order_inv: k.order_inv, quote_no: k.quote_no, status: k.status, notes: k.notes, spec }); dirty = false; toast('Kitchen saved'); $('#save', root).textContent = 'Save'; }));
    ({ design, view3d, cuts, counter: counterTab, price, proposal, sheet }[tab])(pane);
  };

  // ---------------------------------------------------------------- design
  function design(pane) {
    const sel = (kind, key, label, blank) => `<label class="field"><span>${label}</span><select data-style="${key}">${blank ? '<option value="">same as carcass</option>' : '<option value="">— choose —</option>'}${(kind === 'profile_colour' ? colourOptions([...new Set([...namesOf(optList, kind), ...(S.settings.colours || [])])], spec.style[key]) : colourOptions(kind === 'panel' ? [...new Set([...(S.board_types || []).map((b) => b.name), ...namesOf(optList, kind)])] : namesOf(optList, kind), spec.style[key]))}</select></label>`; // the profile colours also offer your own colours
    pane.innerHTML = `<div class="kgrid"><div class="card"><div style="display:flex;gap:8px;align-items:center"><h3 style="margin:0">Drawing</h3><span class="grow"></span><div class="seg"><button data-v="elev" class="${view === 'elev' ? 'on' : ''}">Front</button><button data-v="plan" class="${view === 'plan' ? 'on' : ''}">Plan</button></div><button class="btn sm primary" id="open3d">🧊 Open 3D</button></div><div id="draw" style="margin-top:8px;overflow-x:auto"></div></div><div id="sum" class="card"></div></div>
      <div style="margin-top:14px">
        <div class="card"><div class="form" style="grid-template-columns:repeat(3,1fr)">
          <label class="field"><span>Kitchen name</span><input id="kname" value="${esc(k.name)}"></label><label class="field"><span>Client</span><input id="kclient" value="${esc(k.client || '')}"></label>
          <label class="field"><span>Order / invoice</span><input id="korder" value="${esc(k.order_inv || '')}"></label>
          ${sel('panel', 'carcass', 'Carcass board')}${sel('panel', 'door', spec.style.kind === 'aluminium' ? 'Infill panel inside the frames' : 'Doors & drawer fronts', true)}${sel('panel', 'back', 'Back panels', true)}
          <label class="field"><span>Sheet for the visible sides (the ends of the cabinets)</span><select data-style="end_sheet"><option value="">— same as the carcass —</option>${colourOptions([...new Set([...(S.board_types || []).map((b) => b.name), ...namesOf(optList, 'panel')])], spec.style.end_sheet)}</select><small class="muted">The side the customer sees at the end of a run is cut from this sheet</small></label>
          ${spec.style.kind === 'aluminium' ? `${sel('panel', 'white22', 'White sheet 2.2 cm (carcass)')}${sel('panel', 'white16', 'White sheet 1.6 cm (tall-unit lining)')}${sel('panel', 'design', 'Design sheet (tall-unit sides)')}<label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="hh" ${spec.style.hidden_handle ? 'checked' : ''}> <span>Hidden handle (L-shape profile, taller doors)</span></label>` : ''}
          <label class="field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="basetop" ${spec.style.base_top ? 'checked' : ''}> <span>Base units get a top sheet (leave off when marble sits on them; each unit can still be set in the 3D view)</span></label>
          <label class="field"><span>Skirting (plinth) profile</span><select id="pprof"><option value="">— boards (no profile) —</option>${S.profiles.filter((p) => p.use === 'Kitchen plinth (skirting)').map((p) => `<option value="${p.id}" ${spec.style.plinth_profile_id === p.id ? 'selected' : ''}>${esc([p.code, p.name].filter(Boolean).join(' · '))}${p.face_w ? ` — ${p.face_w} mm` : ''}</option>`).join('')}</select><small class="muted">Skirting cut from a bar instead of a board</small></label>
          <label class="field"><span>Kitchen type</span><select data-style="kind"><option value="wood" ${spec.style.kind !== 'aluminium' ? 'selected' : ''}>Wood / board kitchen</option><option value="aluminium" ${spec.style.kind === 'aluminium' ? 'selected' : ''}>Aluminium kitchen (framed doors)</option></select></label>
          ${spec.style.kind === 'aluminium' ? `<label class="field"><span>Frame profile from your profile list</span><select id="fprof"><option value="">— choose a profile —</option>${(() => { const use = S.profiles.filter((p) => p.use === 'Kitchen door frame'); const list = use.length ? use : S.profiles; return list.map((p) => `<option value="${p.id}" ${spec.style.frame_profile_id === p.id ? 'selected' : ''}>${esc([p.code, p.name, p.series].filter(Boolean).join(' · '))}${p.face_w ? ` — ${p.face_w} mm` : ''}</option>`).join(''); })()}</select><small class="muted">Sets the frame width, bar length and price per bar from the profile</small></label>${sel('profile', 'profile', 'Door frame profile')}<label class="field"><span>Frame width cm</span><input data-style="frame_w" type="number" step="any" value="${spec.style.frame_w ?? 4.5}"></label><label class="field"><span>Profile bar length cm</span><input data-style="bar_len" type="number" step="any" value="${spec.style.bar_len ?? 600}"></label>` : ''}
          ${sel('handle', 'handle', 'Handle')}${sel('hinge', 'hinge', 'Hinges')}${sel('drawer', 'drawer', 'Drawers')}
          <label class="field"><span>Door colour (drawing &amp; sheets)</span><select data-style="door_colour">${colourOptions(S.settings.colours, spec.style.door_colour, '— not set —')}</select></label>${sel('glass', 'glass', 'Glazed doors')}${sel('profile_colour', 'profile_in', 'Profile colour (inside)')}${sel('profile_colour', 'profile_out', 'Profile colour (outside)')}
          <label class="field"><span>Status</span><select id="kstatus">${['draft', 'quoted', 'approved', 'in production', 'installed'].map((s) => `<option ${k.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>
          <details style="margin-top:10px"><summary style="cursor:pointer;font-weight:600">Board and layout settings</summary><div class="form" style="grid-template-columns:repeat(4,1fr);margin-top:8px">${[['t', 'Board thickness cm'], ['back_t', 'Back thickness cm'], ['plinth', 'Plinth height cm'], ['wall_height', 'Wall units start at cm'], ['sheet_w', 'Sheet width cm'], ['sheet_h', 'Sheet height cm'], ['kerf', 'Saw kerf cm'], ['gap', 'Door gap cm']].map(([key, l]) => `<label class="field"><span>${l}</span><input type="number" step="any" data-style="${key}" value="${spec.style[key]}"></label>`).join('')}</div></details></div>
        <div id="runs"></div><div style="margin-top:10px"><button class="btn" id="addRun">+ Add a wall / run</button></div>
        <div class="card" style="margin-top:14px"><label class="field"><span>Notes for the workshop</span><textarea id="knotes" rows="3">${esc(k.notes || '')}</textarea></label></div>
      </div>`;
    const redrawSide = () => {
      $('#draw', pane).innerHTML = view === 'plan' ? planSVG(spec, model, { maxW: 980 }) : elevationSVG(spec, { maxW: 980 });
      const m = model.meters; const ct = model.tops; const p = worker ? null : priceKitchen(model, opts);
      $('#sum', pane).innerHTML = `<div class="k muted" style="font-size:12px;text-transform:uppercase">Summary</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-top:6px"><span>Base cabinets</span><b>${fq(m.base)} m <span class="muted">(${m.base_n})</span></b><span>Wall cabinets</span><b>${fq(m.wall)} m <span class="muted">(${m.wall_n})</span></b><span>Tall units</span><b>${fq(m.tall)} m <span class="muted">(${m.tall_n})</span></b><span>Countertop</span><b>${fq(ct.run_m)} m · ${fq(Math.round(ct.area_m2 * 100) / 100)} m²</b><span>Boards</span><b>${Object.values(model.sheets).reduce((a, x) => a + (x.newCount || 0), 0)} sheets</b>${p ? `<span>Cost estimate</span><b>${p.cost ? 'BD ' + money(p.cost, 2) : '<span class="muted">enter prices</span>'}</b><span>Suggested price</span><b style="font-size:16px">${p.suggested ? 'BD ' + money(p.suggested, 2) : '—'}</b>` : ''}</div>`;
    };
    $('#basetop', pane)?.addEventListener('change', (e) => { spec.style.base_top = e.target.checked; touch(); draw(); });
    $('#hh', pane)?.addEventListener('change', (e) => { spec.style.hidden_handle = e.target.checked; touch(); draw(); });
    $('#pprof', pane)?.addEventListener('change', (e) => { const p = S.profiles.find((x) => x.id === Number(e.target.value)); if (!p) { for (const q of ['plinth_profile_id', 'plinth_profile', 'plinth_price', 'plinth_bar_len']) delete spec.style[q]; touch(); redrawSide(); return; } spec.style.plinth_profile_id = p.id; spec.style.plinth_profile = [p.code, p.name].filter(Boolean).join(' '); if (p.face_w) spec.style.plinth = Math.round(p.face_w) / 10; spec.style.plinth_price = Number(p.price_bar) || 0; spec.style.plinth_bar_len = p.bar_length || 600; touch(); draw(); });
    $('#fprof', pane)?.addEventListener('change', (e) => { const p = S.profiles.find((x) => x.id === Number(e.target.value)); if (!p) { delete spec.style.frame_profile_id; delete spec.style.profile_price; touch(); redrawSide(); return; } spec.style.frame_profile_id = p.id; spec.style.profile = [p.code, p.name].filter(Boolean).join(' '); if (p.face_w) spec.style.frame_w = Math.round(p.face_w) / 10; if (p.bar_length) spec.style.bar_len = p.bar_length; spec.style.profile_price = Number(p.price_bar) || 0; touch(); draw(); });
    $('#open3d', pane).onclick = () => { tab = 'view3d'; draw(); };
    $$('[data-v]', pane).forEach((b) => (b.onclick = () => { view = b.dataset.v; sessionStorage.setItem('kv', view); $$('[data-v]', pane).forEach((x) => x.classList.toggle('on', x === b)); redrawSide(); }));
    const bind = (id2, f) => { const e = $(id2, pane); e.oninput = () => { f(e.value); dirty = true; $('#save', root).textContent = 'Save changes ●'; $('h1', root).textContent = k.name; }; };
    bind('#kname', (v) => (k.name = v)); bind('#kclient', (v) => (k.client = v)); bind('#korder', (v) => (k.order_inv = v)); bind('#knotes', (v) => (k.notes = v));
    $('#kstatus', pane).onchange = (e) => { k.status = e.target.value; touch(); };
    $$('[data-style]', pane).forEach((e) => (e.onchange = () => { spec.style[e.dataset.style] = e.tagName === 'SELECT' ? e.value : num(e.value); touch(); if (e.dataset.style === 'kind') { draw(); return; } redrawSide(); }));
    const presetsList = () => optList.filter((o) => o.kind === 'preset');
    const typeOpts = (sel) => Object.entries(CAB_TYPES).map(([t, v]) => `<option value="${t}" ${sel === t ? 'selected' : ''}>${v.label}</option>`).join('');
    const drawRuns = () => {
      $('#runs', pane).innerHTML = spec.runs.map((run, ri) => {
        const tot = run.cabinets.reduce((a, c) => a + (+c.w || 0), 0);
        return `<div class="card" style="margin-top:12px" data-run="${ri}"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input data-rn style="max-width:220px;font-weight:700" value="${esc(run.name || '')}" placeholder="Run name"><span class="muted">${tot} cm</span><label style="display:flex;gap:4px;align-items:center;font-size:12px" title="A free-standing run in the middle of the room"><input type="checkbox" data-island ${run.island ? 'checked' : ''} style="width:auto"> Island</label><span class="muted" style="font-size:12px" title="Where this run stands in the 3D view (cm from the back-left corner). Leave blank for automatic.">3D: x <input data-px type="number" placeholder="${placeRuns(spec)[ri].x}" value="${run.place?.x ?? ''}" style="width:56px"> z <input data-pz type="number" placeholder="${placeRuns(spec)[ri].z}" value="${run.place?.z ?? ''}" style="width:56px"> <select data-pr style="width:70px"><option value="">auto</option>${[0, 90, 180, 270].map((r) => `<option value="${r}" ${run.place && +run.place.rot === r ? 'selected' : ''}>${r}°</option>`).join('')}</select></span>${run.island ? `<label style="display:flex;gap:4px;align-items:center;font-size:12px">seating overhang <input data-over type="number" step="any" value="${run.overhang ?? 30}" style="width:64px"> cm</label>` : ''}<span class="grow"></span><select data-preset style="width:150px" title="Add a saved cabinet"><option value="">+ From preset…</option>${presetsList().map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>${['base', 'drawers', 'sink', 'hob', 'corner', 'wall', 'tall', 'gap'].map((t) => `<button class="btn sm" data-add="${t}">+ ${CAB_TYPES[t].label.split(' ')[0]}</button>`).join('')}<button class="btn sm danger" data-rmrun title="Delete this run">Delete run</button></div>
          <div class="items-wrap"><table class="items" style="min-width:720px;margin-top:6px"><thead><tr><th></th><th>Type</th><th>Label</th><th>W</th><th>D</th><th>H</th><th>Doors</th><th>Drawers</th><th>Shelves</th><th>Glazed</th><th></th></tr></thead><tbody>${run.cabinets.map((c, ci) => `<tr data-c="${ci}"><td class="n">${ci + 1}</td><td><select data-f="type" style="width:130px">${typeOpts(c.type)}</select></td><td><input data-f="label" value="${esc(c.label || '')}" style="width:80px"></td>${['w', 'd', 'h', 'doors', 'drawers', 'shelves', 'glazed'].map((f) => `<td><input data-f="${f}" type="number" step="any" class="w-q" value="${c[f] ?? 0}"></td>`).join('')}<td style="white-space:nowrap"><button class="btn sm" data-savepreset title="Save this cabinet as a preset">★</button><button class="btn sm" data-mv="-1" title="Move left">←</button><button class="btn sm" data-mv="1" title="Move right">→</button><button class="btn sm" data-dup title="Duplicate">⧉</button><button class="btn sm danger" data-rm>×</button></td></tr>`).join('') || '<tr><td colspan="11" class="muted" style="padding:10px">No cabinets yet — use the + buttons above.</td></tr>'}</tbody></table></div></div>`;
      }).join('');
      redrawSide();
    };
    const runsEl = $('#runs', pane);
    runsEl.addEventListener('input', (e) => {
      const tr = e.target.closest('tr[data-c]'); const card = e.target.closest('[data-run]'); if (!card) return; const run = spec.runs[Number(card.dataset.run)];
      if (e.target.matches('[data-rn]')) { run.name = e.target.value; touch(); redrawSide(); return; }
      if (e.target.matches('[data-over]')) { run.overhang = num(e.target.value); touch(); redrawSide(); return; }
      if (e.target.matches('[data-px],[data-pz]')) { const c = e.target.closest('[data-run]'); const px = $('[data-px]', c).value; const pz = $('[data-pz]', c).value; if (px === '' && pz === '') delete run.place; else run.place = { x: num(px), z: num(pz), rot: run.place?.rot || placeRuns(spec)[Number(c.dataset.run)].rot }; touch(); return; }
      if (!tr || !e.target.dataset.f) return; const f = e.target.dataset.f; const c = run.cabinets[Number(tr.dataset.c)];
      c[f] = ['label'].includes(f) ? e.target.value : e.target.tagName === 'SELECT' ? e.target.value : num(e.target.value);
      touch(); redrawSide();
    });
    runsEl.addEventListener('change', (e) => {
      const card = e.target.closest('[data-run]'); const run = card && spec.runs[Number(card.dataset.run)];
      if (e.target.matches('[data-pr]')) { const auto = placeRuns({ ...spec, runs: spec.runs.map((r, i) => (i === Number(card.dataset.run) ? { ...r, place: null } : r)) })[Number(card.dataset.run)]; run.place = { x: run.place?.x ?? auto.x, z: run.place?.z ?? auto.z, rot: e.target.value === '' ? auto.rot : Number(e.target.value) }; touch(); drawRuns(); return; }
      if (e.target.matches('[data-island]')) { run.island = e.target.checked; if (run.island && run.overhang == null) run.overhang = 30; touch(); drawRuns(); return; }
      if (e.target.matches('[data-preset]')) { const o = presetsList().find((x) => x.id === Number(e.target.value)); if (o) { run.cabinets.push({ ...cabinetOf(o.meta?.type || 'base'), ...o.meta }); touch(); drawRuns(); } return; }
    });
    runsEl.addEventListener('change', (e) => { if (e.target.dataset.f === 'type') { const card = e.target.closest('[data-run]'); const c = spec.runs[Number(card.dataset.run)].cabinets[Number(e.target.closest('tr').dataset.c)]; Object.assign(c, { ...cabinetOf(e.target.value), label: c.label, w: c.w }); touch(); drawRuns(); } });
    runsEl.addEventListener('click', (e) => {
      const card = e.target.closest('[data-run]'); if (!card) return; const ri = Number(card.dataset.run); const run = spec.runs[ri];
      if (e.target.dataset.add) { run.cabinets.push(cabinetOf(e.target.dataset.add)); touch(); drawRuns(); }
      if (e.target.matches('[data-rmrun]')) { spec.runs.splice(ri, 1); touch(); drawRuns(); }
      const tr = e.target.closest('tr[data-c]'); if (!tr) return; const ci = Number(tr.dataset.c);
      if (e.target.matches('[data-savepreset]')) return savePreset(run.cabinets[ci]);
      if (e.target.matches('[data-rm]')) { run.cabinets.splice(ci, 1); touch(); drawRuns(); }
      if (e.target.matches('[data-dup]')) { run.cabinets.splice(ci + 1, 0, { ...run.cabinets[ci] }); touch(); drawRuns(); }
      if (e.target.dataset.mv) { const j = ci + Number(e.target.dataset.mv); if (j >= 0 && j < run.cabinets.length) { [run.cabinets[ci], run.cabinets[j]] = [run.cabinets[j], run.cabinets[ci]]; touch(); drawRuns(); } }
    });
    $('#addRun', pane).onclick = () => { spec.runs.push({ name: `Run ${spec.runs.length + 1}`, cabinets: [] }); touch(); drawRuns(); };
    drawRuns();
  }

  function savePreset(c) {
    const f = [{ key: 'name', label: 'Preset name', required: true, default: `${(CAB_TYPES[c.type] || {}).label || 'Cabinet'} ${c.w}` }];
    const w = document.createElement('div'); w.innerHTML = formHTML(f, {});
    modal({ title: 'Save cabinet as a preset', body: w, buttons: [{ label: 'Cancel' }, { label: 'Save preset', kind: 'primary', onClick: async () => {
      const d = readForm(w, f); if (!d.name) { toast('Give it a name', 'err'); return false; }
      const { type, label, w: cw, h, d: cd, doors, drawers, shelves, glazed } = c;
      const row = await api.post('t/kitchen_options', { kind: 'preset', name: d.name, price: 0, unit: '', meta: { type, label: '', w: cw, h, d: cd, doors, drawers, shelves, glazed: glazed || 0 }, sort: 2000 + optList.length });
      optList.push(row); toast('Preset saved — find it under “From preset” in any run'); if (tab === 'design') draw();
    } }] });
  }

  // ---------------------------------------------------------------- 3D view
  function view3d(pane) {
    const v = view3d.v ||= { yaw: -0.55, pitch: 0.45, zoom: 1 }; v.selected = view3d.sel && spec.runs[view3d.sel.ri]?.cabinets[view3d.sel.ci] ? view3d.sel : null; v.hover = null; delete v.bounds;
    const canEdit = !worker; let edit = canEdit && view3d.edit === true;
    pane.innerHTML = `<div class="k3stage" id="stage"><canvas id="c3"></canvas>
      <div class="k3tl"><div class="k3bar">${canEdit ? `<button class="btn sm" id="editBtn" title="Switch editing on to drag cabinets into position and add new ones">✎ Edit</button>` : ''}<span class="muted" id="k3hint"></span></div><div class="k3bar" id="k3add" hidden></div></div>
      <div class="k3tr"><div class="k3bar">${canEdit ? '<button class="btn sm" id="undoBtn" title="Go back one step (Ctrl+Z)">↶ Back</button><button class="btn sm" id="redoBtn" title="Redo (Ctrl+Y)">↷</button>' : ''}<button class="btn sm" data-oc="1">Open all</button><button class="btn sm" data-oc="0">Close all</button><button class="btn sm" data-p="front">Front</button><button class="btn sm" data-p="corner">Corner</button><button class="btn sm" data-p="top">From above</button><button class="btn sm" data-z="1.5" title="Zoom in">＋</button><button class="btn sm" data-z="0.67" title="Zoom out">－</button><button class="btn sm" data-zreset title="Back to the whole kitchen">Reset</button><button class="btn sm" id="fs" title="Full screen, for showing the customer">⛶</button></div></div>
      <div class="k3panel" id="k3p" hidden></div></div>`;
    const stage = $('#stage', pane); const cv = $('#c3', pane); const key = (r) => `${r.ri}|${r.ci}`;
    const tgt = (view3d.open ||= {}); const cur = (view3d.cur ||= {}); let raf = 0;
    // the picture always fits the window it is shown in
    const fit = () => { const dpr = Math.min(2, window.devicePixelRatio || 1); const w = Math.max(320, Math.round(stage.clientWidth * dpr)); const h = Math.max(240, Math.round(stage.clientHeight * dpr)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } };
    const go = () => { if (!cv.isConnected) return; fit(); draw3D(cv, scene(spec, cur), v); };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => go()) : null; ro?.observe(stage);
    const animate = () => { cancelAnimationFrame(raf); const step = () => { let more = false; for (const k2 of new Set([...Object.keys(tgt), ...Object.keys(cur)])) { const a = cur[k2] || 0; const b = tgt[k2] || 0; if (Math.abs(a - b) > 0.01) { cur[k2] = a + (b - a) * 0.22; more = true; } else if (a !== b) cur[k2] = b; } go(); if (more && cv.isConnected) raf = requestAnimationFrame(step); }; step(); };
    const frontKey = (r, f) => `${key(r)}|${f}`; const effOpen = (r, f) => (tgt[frontKey(r, f)] ?? tgt[key(r)] ?? 0);
    const setOpen = (r, val) => { for (const k2 of Object.keys(tgt)) if (k2.startsWith(key(r) + '|')) delete tgt[k2]; tgt[key(r)] = val; for (const k2 of Object.keys(cur)) if (k2.startsWith(key(r) + '|')) cur[k2] = cur[key(r)] || 0; animate(); };
    const setFront = (r, f, val) => { tgt[frontKey(r, f)] = val; animate(); };
    const cabOf = (r) => r && spec.runs[r.ri]?.cabinets[r.ci];
    const FIELDS = [['label', 'Label', 'text'], ['w', 'Width cm'], ['d', 'Depth cm'], ['h', 'Height cm'], ['doors', 'Doors (0 = open)'], ['drawers', 'Drawers'], ['glazed', 'Glazed doors'], ['shelves', 'Shelves']];
    const kindOf = (c) => CAB_TYPES[c.type] || CAB_TYPES.base;
    const slotRows = (c) => { const n = (c.slots || []).length; const nm = (i) => (n === 1 ? 'Only' : i === n - 1 ? 'Top' : i === 0 ? 'Bottom' : 'Middle'); return [...(c.slots || []).keys()].reverse().map((i) => { const sl = c.slots[i]; return `<tr data-sl="${i}"><td style="white-space:nowrap"><span class="muted" style="font-size:11px">${nm(i)}</span><br><button class="btn sm" data-slup title="Move this door / space up" ${i === n - 1 ? 'disabled' : ''}>▲</button><button class="btn sm" data-sldn title="Move it down" ${i === 0 ? 'disabled' : ''}>▼</button></td><td><select data-sk style="max-width:120px">${Object.entries(SLOT_KINDS).map(([k2, l]) => `<option value="${k2}" ${sl.k === k2 ? 'selected' : ''}>${l}</option>`).join('')}</select>${['door', 'glass'].includes(sl.k) ? `<br><select data-sd title="how it opens" style="max-width:120px;margin-top:3px">${['auto', 'left', 'right', 'up', 'down', 'slide', 'shutter'].map((k2) => `<option value="${k2}" ${(sl.dir || 'auto') === k2 ? 'selected' : ''}>${DIRS[k2]}</option>`).join('')}</select>` : ''}</td><td><input data-sh type="number" step="any" value="${sl.h || ''}" placeholder="rest" style="width:58px"></td><td>${['door', 'glass'].includes(sl.k) ? `<input data-sn type="number" min="1" max="3" value="${sl.n || 1}" style="width:44px" title="doors side by side">` : ''}</td><td><button class="btn sm danger" data-slx>×</button></td></tr>`; }).join(''); };
    const panel = () => {
      const box = $('#k3p', pane); const c = cabOf(v.selected);
      if (!c) { box.hidden = !edit; box.innerHTML = '<h3 style="margin-top:0">Nothing selected</h3><p class="muted">Click a cabinet to change its size, doors, drawers, accessories and how its doors open. With <b>Edit</b> on, drag cabinets to move them and add new ones from the toolbar.</p>'; return; }
      box.hidden = false;
      const run = spec.runs[v.selected.ri]; const t = kindOf(c); const slots = layoutSlots(c); const canLayout = !(t.gap || t.shelf || t.hood || t.corner); const nd = Math.round(+c.drawers || 0);
      const fronts = frontsOf(c); const r0 = v.selected; const btn = (f, l) => `<button class="btn sm ${effOpen(r0, f) > 0.5 ? 'primary' : ''}" data-front="${f}">${l}</button>`;
      const hasDoors = !t.gap && !t.shelf && !t.hood && (t.corner || slots ? true : (+c.doors || 0) > 0);
      box.innerHTML = `<div style="display:flex;align-items:center;gap:6px"><h3 style="margin:0;flex:1">${esc(t.label)}${c.label ? ` — ${esc(c.label)}` : ''}</h3><button class="btn sm" data-none title="Close">×</button></div><div class="muted" style="margin-bottom:8px">${esc(run.name || 'Run ' + (v.selected.ri + 1))} · position ${v.selected.ci + 1} of ${run.cabinets.length}</div>
        <div class="form" style="grid-template-columns:1fr 1fr"><label class="field full"><span>Type</span><select data-f="type">${Object.entries(CAB_TYPES).map(([k2, x]) => `<option value="${k2}" ${c.type === k2 ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>
        ${t.gap ? `<label class="field full"><span>Appliance in this space</span><select data-f="appliance"><option value="">— none (empty gap) —</option>${Object.entries(APPLIANCES).map(([k2, a2]) => `<option value="${k2}" ${c.appliance === k2 ? 'selected' : ''}>${a2[0]}</option>`).join('')}</select></label>` : ''}
        ${FIELDS.filter(([k2]) => !(t.gap || t.shelf || t.hood) || ['label', 'w', 'h', 'd'].includes(k2)).map(([k2, l, ty]) => `<label class="field"><span>${l}</span><input data-f="${k2}" ${ty === 'text' ? '' : 'type="number" step="any" min="0"'} value="${esc(c[k2] ?? '')}"></label>`).join('')}
        ${t.wall ? `<label class="field"><span>Space before it cm</span><input data-f="gap_before" type="number" step="any" min="0" value="${esc(c.gap_before ?? 0)}" title="Space between this unit and the one before it (or the tall unit)"></label><label class="field"><span>Mount height cm</span><input data-f="y" type="number" step="any" value="${esc(c.y ?? '')}" placeholder="${spec.style.wall_height ?? 140}"></label>` : ''}
        ${t.shelf ? `<label class="field"><span>Shelves stacked</span><input data-f="stack" type="number" min="1" max="12" step="1" value="${shelfCount(c)}" title="How many floating shelves above each other"></label><label class="field"><span>Space between cm</span><input data-f="stack_gap" type="number" min="0" step="any" value="${esc(c.stack_gap ?? 30)}"></label>` : ''}
        ${t.corner ? `<label class="field"><span>Return leg on the</span><select data-f="side"><option value="">automatic</option><option value="right" ${c.side === 'right' ? 'selected' : ''}>right</option><option value="left" ${c.side === 'left' ? 'selected' : ''}>left</option></select></label>` : ''}</div>
        ${!t.gap && !t.shelf && !t.hood && !slots && !t.corner && (+c.doors || 0) === 0 && nd === 0 ? '<p class="muted" style="margin:6px 0 0">No doors and no drawers: this cabinet is left <b>open</b>.</p>' : ''}
        ${hasDoors ? `<div class="form" style="grid-template-columns:1fr;margin-top:8px"><label class="field"><span>Door opening direction</span><select data-f="dir">${Object.entries(DIRS).map(([k2, l]) => `<option value="${k2}" ${(c.dir || 'auto') === k2 ? 'selected' : ''}>${l}${k2 === 'auto' ? ' (pairs open outwards)' : ''}</option>`).join('')}</select></label></div>` : ''}
        ${(+c.doors || 0) > 0 && nd > 0 && !slots ? `<div class="form" style="grid-template-columns:1fr 1fr;margin-top:8px"><label class="field full"><span>Drawers sit…</span><select data-mx="mode"><option value="stack" ${c.mixed?.mode !== 'side' ? 'selected' : ''}>on top of the doors</option><option value="side" ${c.mixed?.mode === 'side' ? 'selected' : ''}>beside the doors</option></select></label>${c.mixed?.mode === 'side' ? `<label class="field"><span>Drawer part width cm</span><input data-mx="dw" type="number" step="any" value="${c.mixed.dw ?? ''}"></label><label class="field"><span>Drawers on</span><select data-mx="left"><option value="">the right</option><option value="1" ${c.mixed.left ? 'selected' : ''}>the left</option></select></label>` : `<label class="field"><span>Drawer part height cm</span><input data-mx="dh" type="number" step="any" value="${c.mixed?.dh ?? ''}" placeholder="auto"></label>`}</div>` : ''}
        ${canLayout ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--line,#dde3ea)"><b>Door layout — top to bottom</b><div class="muted" style="font-size:12px;margin:2px 0 6px">Add a door (or drawer, oven…) anywhere in this unit: the others shrink to make room and nothing else changes.</div>
          ${c.slots?.length ? `<table class="mini"><thead><tr><th>Place</th><th>What</th><th>Height cm</th><th>Across</th><th></th></tr></thead><tbody>${slotRows(c)}</tbody></table><div class="muted" style="font-size:12px;margin:4px 0">Used ${fq(slotHeights(c.slots, +c.h || 0).reduce((a, x) => a + x, 0))} of ${fq(c.h)} cm · an empty height takes what is left.</div>` : '<div class="muted" style="font-size:12px;margin-bottom:6px">Plain unit. Adding a door below turns its doors and drawers into a layout you can change.</div>'}
          <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center"><select id="addKind">${['door', 'drawer', 'open', 'oven', 'micro', 'coffee', 'fridge', 'glass'].map((k2) => `<option value="${k2}">${SLOT_KINDS[k2]}</option>`).join('')}</select><select id="addPos"><option value="top">on top</option><option value="middle">in the middle</option><option value="bottom">at the bottom</option></select><button class="btn sm primary" data-addslot>+ Add</button>${c.slots?.length ? '<button class="btn sm" data-fitslots title="Scale the heights so they fill the unit">Fit height</button><button class="btn sm" data-noslots title="Back to the plain doors / drawers fields">Plain again</button>' : ''}</div></div>` : ''}
        ${spec.style.end_sheet && !t.gap && !t.shelf && !t.hood && !t.corner ? `<div style="margin-top:10px;font-size:13px"><b>Visible sides</b> <span class="muted">— cut from ${esc(spec.style.end_sheet)}</span><div style="display:flex;gap:14px;margin-top:4px"><label style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-endside="end_left" ${(c.end_left ?? v.selected.ci === 0) ? 'checked' : ''}> Left side</label><label style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-endside="end_right" ${(c.end_right ?? v.selected.ci === run.cabinets.length - 1) ? 'checked' : ''}> Right side</label></div></div>` : ''}
        ${!slots && !t.corner && Math.round(+c.doors || 0) >= 2 ? `<div style="margin-top:10px;font-size:13px"><b>Doors</b> <span class="muted">— untick a place to leave it open (no door)</span><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">${Array.from({ length: Math.round(+c.doors || 0) }, (_, i) => `<label style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-opendoor="${i}" ${openDoorsOf(c).has(i) ? '' : 'checked'}> Door ${i + 1}</label>`).join('')}</div></div>` : ''}
        ${spec.style.kind === 'aluminium' && !t.wall && !t.tall && !t.gap && !t.shelf && !t.hood && !t.corner ? `<label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13px"><input type="checkbox" data-hiddenh ${hasHiddenHandle(c, spec.style) ? 'checked' : ''}> <b>Hidden handle</b> <span class="muted">— over the doors only; joins the next unit's into one piece</span></label>` : ''}
        ${!t.wall && !t.tall && !t.gap && !t.shelf && !t.hood ? `<label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13px"><input type="checkbox" data-topsheet ${hasTopSheet(c, spec.style) ? 'checked' : ''}> <b>Top sheet</b> <span class="muted">— off when the marble sits on it</span></label>` : ''}
        ${!t.wall && !t.shelf && !t.hood ? `<label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13px"><input type="checkbox" data-skirt ${hasSkirt(c) ? 'checked' : ''}> <b>Skirting (plinth) under this unit</b> <span class="muted">— legs and a skirting board; off = it stands on the floor</span></label>` : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn sm" data-mv="-1">◀ Move left</button><button class="btn sm" data-mv="1">Move right ▶</button><button class="btn sm" data-dup>Copy</button><button class="btn sm danger" data-del>Delete</button></div>
        ${!t.gap && !t.shelf ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--line,#dde3ea)"><b>Accessories</b><div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;margin-top:4px">${Object.entries(ACCESSORIES).map(([k2, [l]]) => `<label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" data-acc="${k2}" ${(c.acc || []).includes(k2) ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>` : ''}
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line,#dde3ea)">${fronts.length > 1 ? `<div style="margin-bottom:8px"><div class="muted" style="font-size:12px;margin-bottom:4px">Open one at a time</div><div style="display:flex;gap:4px;flex-wrap:wrap">${fronts.map((f) => btn(f.key, f.label)).join('')}</div></div>` : ''}${fronts.length ? `<button class="btn sm ${(tgt[key(r0)] || 0) > 0.5 ? 'primary' : ''}" data-toggle>${(tgt[key(r0)] || 0) > 0.5 ? 'Close' : 'Open'} ${fronts.length > 1 ? 'all of it' : 'it'}</button>` : '<span class="muted">Nothing to open here.</span>'}</div>
        ${t.gap || t.shelf || t.hood || t.corner || slots ? '' : `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line,#dde3ea)"><b>Make it fewer parts</b><div class="muted" style="font-size:12px;margin:2px 0 6px">Joining two neighbours into one cabinet saves a carcass: fewer panels, quicker to make, cheaper.</div>${[['next', 1], ['prev', -1]].map(([nm, dd]) => { const o = run.cabinets[v.selected.ci + dd]; const m = o && (dd > 0 ? mergeCabinets(c, o) : mergeCabinets(o, c)); const sv = m?.cab && (dd > 0 ? mergeSaving(c, o, spec.style) : mergeSaving(o, c, spec.style)); return `<div style="margin:4px 0"><button class="btn sm" data-join="${dd}" ${m?.cab ? '' : 'disabled'} title="${esc(m?.error || '')}">${dd > 0 ? 'Join with next ▶' : '◀ Join with previous'}</button> <span class="muted" style="font-size:12px">${!o ? 'nothing there' : m.cab ? `${fq(m.cab.w)} cm wide · saves ${sv.panels} panels (${fq(sv.m2)} m²)${sv.legs ? ` and ${sv.legs} legs/hangers` : ''}` : esc(m.error)}</span></div>`; }).join('')}<button class="btn sm" data-split ${(+c.w || 0) >= 60 ? '' : 'disabled'}>Split into two</button></div>`}`;
    };
    const changed = () => { touch(); go(); };
    const refresh3 = () => { for (const k2 of Object.keys(tgt)) delete tgt[k2]; for (const k2 of Object.keys(cur)) delete cur[k2]; v.selected = view3d.sel; panel(); go(); };
    const box0 = $('#k3p', pane);
    // add tools (Edit mode)
    const ADD = [['base', '+ Base'], ['drawers', '+ Drawers'], ['sink', '+ Sink'], ['hob', '+ Hob'], ['corner', '+ Corner'], ['wall', '+ Wall'], ['wall_corner', '+ Wall corner'], ['tall', '+ Tall'], ['shelf', '+ Floating shelf'], ['hood', '+ Hood'], ['gap', '+ Gap'], ['gap:fridge', '+ Fridge'], ['gap:dishwasher', '+ Dishwasher'], ['gap:washer', '+ Washer'], ['gap:dryer', '+ Dryer'], ['gap:freezer', '+ Freezer'], ['gap:oven', '+ Oven'], ['gap:cooker', '+ Cooker'], ['sample', '★ One of each appliance']];
    const addCab = (spec2) => {
      if (spec2 === 'sample') {
        const mk = (appl) => ({ ...cabinetOf('gap'), appliance: appl, label: APPLIANCES[appl][0], h: appl === 'fridge' || appl === 'freezer' ? 190 : APPLIANCES[appl][1] });
        const tallUnit = { ...cabinetOf('tall'), label: 'Oven, microwave & coffee', slots: [{ k: 'oven', h: 60, n: 1 }, { k: 'micro', h: 38, n: 1 }, { k: 'coffee', h: 45, n: 1 }, { k: 'door', h: 57, n: 1, dir: 'auto' }] };
        spec.runs.push({ name: 'Appliances', cabinets: [...['fridge', 'freezer', 'dishwasher', 'washer', 'dryer', 'cooker'].map(mk), tallUnit] });
        view3d.sel = { ri: spec.runs.length - 1, ci: 0 }; touch(); refresh3(); return;
      }
      const [type, appl] = spec2.split(':'); const base = { ...cabinetOf(type) }; if (appl) { base.appliance = appl; base.label = APPLIANCES[appl][0]; if (appl === 'fridge' || appl === 'freezer') base.h = 190; else base.h = APPLIANCES[appl][1]; }
      if (!spec.runs.length) spec.runs.push({ name: 'Run 1', cabinets: [] });
      const ri = v.selected ? v.selected.ri : 0; const arr = spec.runs[ri].cabinets; const at = v.selected ? v.selected.ci + 1 : arr.length;
      arr.splice(at, 0, base); view3d.sel = { ri, ci: at }; touch(); refresh3();
    };
    const drawAddBar = () => { const bar = $('#k3add', pane); bar.hidden = !edit; if (edit) bar.innerHTML = `<span class="muted">Add after the selected one:</span>${ADD.map(([k2, l]) => `<button class="btn sm" data-add="${k2}">${l}</button>`).join('')}<label class="muted" style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="moveRun"> move the whole run</label>`; $('#editBtn', pane)?.classList.toggle('primary', edit); const hint = $('#k3hint', pane); hint.textContent = edit ? 'Drag a cabinet to move it along its run (wall units keep the space you leave, close to or away from a tall unit) · Shift+drag moves the whole run' : 'Drag to turn · scroll or pinch to zoom (right-drag to move the picture) · click a cabinet to select it; click a door or drawer to open or close it'; cv.style.cursor = edit ? 'move' : 'grab'; };
    $('#editBtn', pane)?.addEventListener('click', () => { edit = !edit; view3d.edit = edit; drawAddBar(); panel(); });
    $('#k3add', pane).addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (b) addCab(b.dataset.add); });
    $('#fs', pane).onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else stage.requestFullscreen?.(); };
    document.addEventListener('fullscreenchange', go, { once: true });
    box0.addEventListener('input', (e) => { const mx = e.target.dataset.mx; const cm = cabOf(v.selected); if (mx && cm && mx !== 'mode' && mx !== 'left') { cm.mixed = { ...(cm.mixed || { mode: 'stack' }), [mx]: num(e.target.value) }; changed(); return; }
      const trs = e.target.closest('tr[data-sl]'); if (trs && cm) { const sl = cm.slots[Number(trs.dataset.sl)]; if (e.target.matches('[data-sh]')) { // whatever you resize, the top one takes up the difference (the second from the top when you resize the top one itself)
          const H = +cm.h || 0; const i = Number(trs.dataset.sl); const n = cm.slots.length; const hs = slotHeights(cm.slots, H); cm.slots.forEach((x, q) => { x.h = Math.round(hs[q] * 10) / 10; });
          if (n > 1) { const ab = i === n - 1 ? n - 2 : n - 1; const others = cm.slots.reduce((a2, x, q) => a2 + (q === i || q === ab ? 0 : x.h), 0); const want = Math.max(3, num(e.target.value)); const room = Math.max(3, Math.round((H - others - 3) * 10) / 10); const mine = Math.min(want, room); cm.slots[i].h = mine; cm.slots[ab].h = Math.round(Math.max(3, H - others - mine) * 10) / 10; const box2 = $(`#k3p tr[data-sl="${ab}"] [data-sh]`, pane); if (box2) box2.value = cm.slots[ab].h; if (mine !== want) e.target.value = mine; } else sl.h = num(e.target.value);
        } if (e.target.matches('[data-sn]')) sl.n = Math.max(1, Math.min(3, Math.round(num(e.target.value) || 1))); changed(); return; }
      const f = e.target.dataset.f; const c = cabOf(v.selected); if (!c || !f || ['type', 'dir', 'side', 'appliance'].includes(f)) return; c[f] = f === 'label' ? e.target.value : e.target.value === '' && f === 'y' ? '' : num(e.target.value); changed(); });
    box0.addEventListener('change', (e) => { const c = cabOf(v.selected); if (!c) return;
      if (e.target.dataset.mx) { const mx = e.target.dataset.mx; c.mixed = { ...(c.mixed || {}), [mx]: mx === 'left' ? !!e.target.value : e.target.value }; if (mx === 'mode' && e.target.value === 'side' && !c.mixed.dw) c.mixed.dw = Math.round((+c.w || 0) * 0.4); touch(); panel(); go(); return; }
      if (e.target.matches('[data-skirt]')) { c.skirt = e.target.checked; changed(); return; }
      if (e.target.matches('[data-topsheet]')) { c.top_sheet = e.target.checked; changed(); return; }
      if (e.target.matches('[data-endside]')) { c[e.target.dataset.endside] = e.target.checked; changed(); return; }
      if (e.target.matches('[data-hiddenh]')) { c.hidden_handle = e.target.checked; changed(); return; }
      if (e.target.matches('[data-opendoor]')) { const i = Number(e.target.dataset.opendoor); const n = Math.round(+c.doors || 0); const set = openDoorsOf(c); if (e.target.checked) set.delete(i); else set.add(i); if (set.size >= n) { e.target.checked = true; toast('Keep at least one door — or set Doors to 0 for an open cabinet', 'err'); return; } c.open_doors = [...set].sort((a, b) => a - b); if (!c.open_doors.length) delete c.open_doors; changed(); return; }
      if (e.target.dataset.acc) { const k2 = e.target.dataset.acc; const set = new Set(c.acc || []); if (e.target.checked) set.add(k2); else set.delete(k2); c.acc = [...set]; changed(); return; }
      const trs = e.target.closest('tr[data-sl]'); if (trs && e.target.matches('[data-sh]')) return; if (trs) { const sl = c.slots[Number(trs.dataset.sl)]; if (e.target.matches('[data-sk]')) { sl.k = e.target.value; const H = +c.h || 0; const others = c.slots.reduce((a2, x) => a2 + (x === sl ? 0 : +x.h || 0), 0); if (APPLIANCES[sl.k]) { sl.n = 1; sl.h = Math.max(15, Math.min(sl.k === 'fridge' ? 140 : APPLIANCES[sl.k][1], H - others)); } const over = c.slots.reduce((a2, x) => a2 + (+x.h || 0), 0) - H; if (over > 0.05) { const top = [...c.slots].reverse().find((x) => x !== sl && x.h > 0); if (top) top.h = Math.max(5, Math.round((top.h - over) * 10) / 10); } touch(); panel(); go(); } if (e.target.matches('[data-sd]')) { sl.dir = e.target.value; changed(); } return; }
      const f = e.target.dataset.f; if (f === 'type') { Object.assign(c, { ...cabinetOf(e.target.value), label: c.label }); delete c.slots; touch(); panel(); go(); }
      if (f === 'dir') { c.dir = e.target.value; changed(); } if (f === 'side') { c.side = e.target.value || undefined; changed(); } if (f === 'appliance') { c.appliance = e.target.value || undefined; if (c.appliance && !c.label) c.label = APPLIANCES[c.appliance][0]; if (c.appliance === 'fridge' || c.appliance === 'freezer') c.h = Math.max(+c.h || 0, 180); touch(); panel(); go(); } });
    box0.addEventListener('click', (e) => {
      const r = v.selected; const c = cabOf(r); const el2 = e.target.closest('button'); if (!el2) return;
      if (!c) return; const arr = spec.runs[r.ri].cabinets;
      if (el2.matches('[data-noslots]')) { delete c.slots; touch(); panel(); go(); return; }
      if (el2.matches('[data-addslot]')) { c.slots = addSlot(c, $('#addKind', box0).value, $('#addPos', box0).value); touch(); panel(); go(); return; }
      if (el2.matches('[data-fitslots]')) { const H = +c.h || 0; const hs = slotHeights(c.slots, H); const sum = hs.reduce((a2, x) => a2 + x, 0) || 1; c.slots.forEach((x, i) => { x.h = Math.round(hs[i] * (H / sum) * 10) / 10; }); touch(); panel(); go(); return; }
      if (el2.matches('[data-slup],[data-sldn]')) { const i = Number(el2.closest('tr').dataset.sl); const j = i + (el2.matches('[data-slup]') ? 1 : -1); if (j >= 0 && j < c.slots.length) { [c.slots[i], c.slots[j]] = [c.slots[j], c.slots[i]]; touch(); panel(); go(); } return; }
      if (el2.matches('[data-slx]')) { c.slots.splice(Number(el2.closest('tr').dataset.sl), 1); if (!c.slots.length) delete c.slots; touch(); panel(); go(); return; }
      if (el2.matches('[data-mv]')) { const j = r.ci + Number(el2.dataset.mv); if (j >= 0 && j < arr.length) { [arr[r.ci], arr[j]] = [arr[j], arr[r.ci]]; view3d.sel = { ri: r.ri, ci: j }; touch(); refresh3(); } }
      if (el2.matches('[data-dup]')) { arr.splice(r.ci + 1, 0, JSON.parse(JSON.stringify(c))); view3d.sel = { ri: r.ri, ci: r.ci + 1 }; touch(); refresh3(); }
      if (el2.matches('[data-front]')) { const f = el2.dataset.front; setFront(r, f, effOpen(r, f) > 0.5 ? 0 : 1); panel(); return; }
      if (el2.matches('[data-toggle]')) { setOpen(r, (tgt[key(r)] || 0) > 0.5 ? 0 : 1); panel(); return; }
      if (el2.matches('[data-join]')) { const dd = Number(el2.dataset.join); const o = arr[r.ci + dd]; const m = dd > 0 ? mergeCabinets(c, o) : mergeCabinets(o, c); if (m.error) return toast(m.error, 'err'); const i0 = Math.min(r.ci, r.ci + dd); arr.splice(i0, 2, m.cab); view3d.sel = { ri: r.ri, ci: i0 }; touch(); toast('Joined into one cabinet'); return refresh3(); }
      if (el2.matches('[data-split]')) { const sp = splitCabinet(c); if (sp.error) return toast(sp.error, 'err'); arr.splice(r.ci, 1, ...sp.cabs); touch(); toast('Split into two cabinets'); return refresh3(); }
      if (el2.matches('[data-del]')) { arr.splice(r.ci, 1); view3d.sel = null; touch(); refresh3(); }
      if (el2.matches('[data-none]')) { view3d.sel = null; refresh3(); }
    });
    // mouse / touch: a short press selects, a drag turns the view, two fingers pinch to zoom; in Edit mode a drag moves the cabinet under the pointer
    const pts = new Map(); let drag = null; let pinch = 0; let mv = null; let lastMid = null; let pan = null;
    const at = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
    const uvOf = (pl, x, z) => ({ 0: [x - pl.x, z - pl.z], 90: [z - pl.z, x - pl.x], 180: [pl.x - x, pl.z - z], 270: [pl.z - z, pl.x - x] }[pl.rot] || [x - pl.x, z - pl.z]);
    const planeOf = (c) => { const t = kindOf(c); const y0 = t.wall ? (Number.isFinite(+c.y) && c.y !== '' && c.y !== undefined ? +c.y : spec.style.wall_height ?? 140) : hasSkirt(c) ? spec.style.plinth ?? 10 : 0; return y0 + (+c.h || 0) / 2; };
    cv.onpointerdown = (e) => {
      cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (e.button === 1 || e.button === 2) { pan = { x: e.clientX, y: e.clientY, px: v.panX || 0, py: v.panY || 0 }; cv.style.cursor = 'grabbing'; return; }
      if (pts.size > 1) { drag = null; mv = null; const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); return; }
      const [x, y] = at(e); const hit = edit ? pick3D(cv, x, y) : null;
      if (hit) { view3d.sel = { ri: hit.ri, ci: hit.ci }; v.selected = view3d.sel; const c = cabOf(hit); const pl = placeRuns(spec)[hit.ri]; const p0 = unproject(cv, x, y, planeOf(c)); const [u0] = p0 ? uvOf(pl, p0.x, p0.z) : [0];
        const start = runStarts(spec, hit.ri)[hit.ci] ?? 0;
        mv = { ri: hit.ri, c, p0, u0, start, pl, whole: e.shiftKey || $('#moveRun', pane)?.checked, x: e.clientX, y: e.clientY, moved: false, y0: planeOf(c) }; panel(); go(); return; }
      drag = { x: e.clientX, y: e.clientY, yaw: v.yaw, pitch: v.pitch, moved: false };
    };
    cv.onpointermove = (e) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pan) { const sc = cv.width / cv.getBoundingClientRect().width; v.panX = pan.px + (e.clientX - pan.x) * sc; v.panY = pan.py + (e.clientY - pan.y) * sc; go(); return; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const mx = (a[0] + b[0]) / 2; const my = (a[1] + b[1]) / 2; const sc = cv.width / cv.getBoundingClientRect().width; if (pinch) { if (lastMid) { v.panX = (v.panX || 0) + (mx - lastMid[0]) * sc; v.panY = (v.panY || 0) + (my - lastMid[1]) * sc; } zoomBy(d / pinch); } lastMid = [mx, my]; pinch = d; return; }
      if (mv) {
        if (!mv.moved && Math.abs(e.clientX - mv.x) + Math.abs(e.clientY - mv.y) < 5) return;
        if (!mv.moved) { mv.moved = true; v.bounds = cv._bounds; } // keep the frame still while moving
        const [x, y] = at(e); const p = unproject(cv, x, y, mv.y0); if (!p || !mv.p0) return;
        if (mv.whole) { const run = spec.runs[mv.ri]; const base = mv.pl; run.place = { x: Math.round((base.x + p.x - mv.p0.x) / 5) * 5, z: Math.round((base.z + p.z - mv.p0.z) / 5) * 5, rot: base.rot }; changed(); return; }
        // which run is the pointer over? (inside a run's footprint, in run coordinates)
        const pls = placeRuns(spec); let ri = view3d.sel.ri;
        const movingWall = !!(CAB_TYPES[mv.c.type] || {}).wall; const isWallRun = (rn) => rn.cabinets.length > 0 && rn.cabinets.every((q) => (CAB_TYPES[q.type] || {}).wall);
        spec.runs.forEach((rn, i) => { if (i === view3d.sel.ri || !rn.cabinets.length || isWallRun(rn) !== movingWall) return; const [uu, vv] = uvOf(pls[i], p.x, p.z); const len = rn.cabinets.reduce((a, q) => a + (+q.w || 0), 0); const dep = Math.max(...rn.cabinets.map((q) => +q.d || 0), 40); if (uu > -10 && uu < len + 10 && vv > -5 && vv < dep + 10) ri = i; });
        const [uu] = uvOf(pls[ri], p.x, p.z); const w = +mv.c.w || 0; const center = ri === view3d.sel.ri ? mv.start + w / 2 + (uu - mv.u0) : uu;
        const from = spec.runs[view3d.sel.ri].cabinets; const idx = from.indexOf(mv.c); if (idx >= 0) from.splice(idx, 1);
        const dest = spec.runs[ri].cabinets; const st0 = runStarts({ ...spec, runs: spec.runs.map((r, i) => (i === ri ? { ...r, cabinets: dest } : r)) }, ri); let pos = 0; dest.forEach((q, j) => { if (st0[j] + (+q.w || 0) / 2 < center) pos++; });
        const moved = ri !== view3d.sel.ri || pos !== idx; dest.splice(pos, 0, mv.c); if (movingWall) { mv.c.gap_before = 0; const s0 = runStarts(spec, ri)[pos]; mv.c.gap_before = Math.max(0, Math.round(center - w / 2 - s0)); } /* a wall unit keeps the space you drag it to */ view3d.sel = { ri, ci: pos }; if (moved) { for (const k2 of Object.keys(tgt)) delete tgt[k2]; for (const k2 of Object.keys(cur)) delete cur[k2]; } v.selected = view3d.sel; // open/closed states are kept per position, so they restart
        if (ri !== mv.ri) { mv.ri = ri; mv.pl = pls[ri]; mv.start = center - w / 2; mv.u0 = uu; }
        changed(); return;
      }
      if (drag) { const dx = e.clientX - drag.x; const dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; if (drag.moved) { v.yaw = drag.yaw + dx * 0.008; v.pitch = Math.max(0.02, Math.min(1.5, drag.pitch + dy * 0.006)); go(); } return; }
      const [x, y] = at(e); const h = pick3D(cv, x, y); const old = v.hover; v.hover = h; cv.style.cursor = h ? (edit ? 'move' : 'pointer') : edit ? 'move' : 'grab';
      if ((h?.ri) !== (old?.ri) || (h?.ci) !== (old?.ci)) go();
    };
    cv.onpointerup = (e) => {
      pts.delete(e.pointerId); lastMid = null;
      if (pan) { pan = null; drag = null; pinch = 0; cv.style.cursor = edit ? 'move' : 'grab'; return; }
      if (mv) { const was = mv; mv = null; delete v.bounds; if (was.moved) { panel(); go(); } else go(); drag = null; pinch = 0; return; }
      if (drag && !drag.moved) { const [x, y] = at(e); const hit = pick3D(cv, x, y); view3d.sel = hit && { ri: hit.ri, ci: hit.ci }; v.selected = view3d.sel; if (!edit && hit && ['front', 'glass', 'infill', 'handle', 'tray'].includes(hit.kind)) hit.front ? setFront(hit, hit.front, effOpen(hit, hit.front) > 0.5 ? 0 : 1) : setOpen(hit, (tgt[key(hit)] || 0) > 0.5 ? 0 : 1); panel(); go(); }
      drag = null; pinch = 0;
    };
    cv.onpointercancel = (e) => { pan = null; mv = null; drag = null; pts.delete(e.pointerId); pinch = 0; delete v.bounds; go(); };
    cv.onpointerleave = () => { if (v.hover) { v.hover = null; go(); } };
    const ZMIN = 0.3; const ZMAX = 25;
    const zoomBy = (r, sx, sy) => { const z0 = v.zoom || 1; const z1 = Math.max(ZMIN, Math.min(ZMAX, z0 * r)); const k = z1 / z0; const cx = sx ?? cv.width / 2; const cy = sy ?? cv.height / 2; v.panX = (v.panX || 0) + (cx - cv.width / 2 - (v.panX || 0)) * (1 - k); v.panY = (v.panY || 0) + (cy - cv.height / 2 - (v.panY || 0)) * (1 - k); v.zoom = z1; go(); };
    cv.onwheel = (e) => { e.preventDefault(); const [x, y] = at(e); zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, x, y); };
    cv.oncontextmenu = (e) => e.preventDefault();
    $$('[data-z]', pane).forEach((b2) => (b2.onclick = () => zoomBy(Number(b2.dataset.z))));
    $('[data-zreset]', pane).onclick = () => { v.zoom = 1; v.panX = 0; v.panY = 0; go(); };
    $$('[data-oc]', pane).forEach((b) => (b.onclick = () => { spec.runs.forEach((run, ri) => run.cabinets.forEach((_, ci) => { for (const k2 of Object.keys(tgt)) if (k2.startsWith(`${ri}|${ci}|`)) delete tgt[k2]; tgt[`${ri}|${ci}`] = Number(b.dataset.oc); })); animate(); panel(); }));
    $$('[data-p]', pane).forEach((b) => (b.onclick = () => { Object.assign(v, { front: { yaw: 0, pitch: 0.08 }, corner: { yaw: -0.55, pitch: 0.45 }, top: { yaw: 0, pitch: 1.5 } }[b.dataset.p]); go(); }));
    const updUndo = () => { const u = $('#undoBtn', pane); const r = $('#redoBtn', pane); if (u) u.disabled = !hist.undo.length; if (r) r.disabled = !hist.redo.length; };
    const stepTo = (dir) => { if (!stepBack(dir)) return; if (view3d.sel && !spec.runs[view3d.sel.ri]?.cabinets[view3d.sel.ci]) view3d.sel = null; refresh3(); updUndo(); toast(dir < 0 ? 'Went back one step' : 'Redone', 'ok'); };
    $('#undoBtn', pane)?.addEventListener('click', () => stepTo(-1)); $('#redoBtn', pane)?.addEventListener('click', () => stepTo(1));
    hist.after = () => { if (cv.isConnected) updUndo(); }; updUndo();
    const keys = (e) => { if (!cv.isConnected) { document.removeEventListener('keydown', keys); return; } if (e.target.closest?.('input,textarea,select')) return; if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey && view3d.sel) { const arr = spec.runs[view3d.sel.ri]?.cabinets; if (arr?.[view3d.sel.ci]) { e.preventDefault(); arr.splice(view3d.sel.ci, 1); view3d.sel = null; touch(); refresh3(); } return; } if (!(e.ctrlKey || e.metaKey)) return; const kk = e.key.toLowerCase(); if (kk === 'z' && !e.shiftKey) { e.preventDefault(); stepTo(-1); } else if (kk === 'y' || (kk === 'z' && e.shiftKey)) { e.preventDefault(); stepTo(1); } };
    document.addEventListener('keydown', keys);
    drawAddBar(); panel(); animate();
  }

  // ---------------------------------------------------------------- cut list
  const openSheets = new Set(); // sheet drawings left open stay open when the plan is redrawn
  function cuts(pane) {
    const sty = spec.style; const alu = sty.kind === 'aluminium'; const mats = [...(sty.end_sheet ? [['end', `Visible sides — ${sty.end_sheet}`]] : []), ...(alu ? [['white22', `White sheet 2.2 cm — ${sty.white22 || 'board not chosen'}`], ['white16', `White sheet 1.6 cm — ${sty.white16 || 'board not chosen'}`], ['design', `Design sheet — ${sty.design || 'board not chosen'}`]] : []), ['carcass', `Carcass — ${sty.carcass || 'board not chosen'}`], ['door', sty.kind === 'aluminium' ? `Infill panels in the aluminium frames — ${sty.door || sty.carcass || 'board not chosen'}` : `Doors & fronts — ${sty.door || sty.carcass || 'board not chosen'}`], ['back', `Backs — ${sty.back || sty.carcass || 'board not chosen'}`]];
    const sw = (m) => [model.sheets[m].sw, model.sheets[m].sh];
    const hw = model.hw; const t = (r) => `<tr><td>${esc(r.label)}</td><td>${cabCell(names, r.cabs || [])}</td><td class="num">${fq(r.w)} × ${fq(r.h)}</td><td class="num">${r.qty}</td><td class="num">${r.edge ? fq(r.edge) : ''}</td></tr>`;
    const names = cabNames(spec);
    const group = (arr) => { const m = new Map(); for (const p of arr) { const key = `${p.label.replace(/^.* · /, '')}|${p.w}|${p.h}|${p.edge}`; const e = m.get(key) || { ...p, label: p.label.replace(/^.* · /, ''), qty: 0, cabs: new Set() }; e.qty += p.qty; e.cabs.add(cabOf(p.label)); m.set(key, e); } return [...m.values()]; };
    pane.innerHTML = `<div class="cards">${alu ? `<div class="card stat"><div class="k">White 2.2 / 1.6 sheets</div><div class="v">${model.sheets.white22.newCount} / ${model.sheets.white16.newCount}</div></div><div class="card stat"><div class="k">Design sheets</div><div class="v">${model.sheets.design.newCount}</div></div>` : `<div class="card stat"><div class="k">Carcass sheets</div><div class="v">${model.sheets.carcass.newCount}</div></div>`}<div class="card stat"><div class="k">Door sheets</div><div class="v">${model.sheets.door.newCount}</div></div><div class="card stat"><div class="k">Back sheets</div><div class="v">${model.sheets.back.newCount}</div></div><div class="card stat"><div class="k">Edge banding</div><div class="v">${fq(Math.round(model.edge_m * 10) / 10)} m</div></div></div>
      <div class="card" style="margin-bottom:14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><b>Sheet cutting plan</b><span class="seg">${Object.entries(CUT_MODES).map(([v, l]) => `<button type="button" data-cutmode="${v}" class="${(sty.cut_mode || 'optimal') === v ? 'on' : ''}">${esc(l)}</button>`).join('')}</span><span class="muted" style="font-size:12px">Turn any part with ↔ / ↕ in its row; Auto lets the plan choose. Every plan uses edge-to-edge (panel saw) cuts. Used pieces from the stock are always cut first.</span><span class="grow"></span><button class="btn" id="takestock" title="Remove the used pieces and new sheets of this plan from the stock and add the offcuts back as used pieces">▥ Take from stock</button></div>
      ${mats.filter(([m]) => !alu || model.panels[m].length).map(([m, title]) => `<div class="card" style="margin-bottom:14px"><div style="display:flex;gap:8px;align-items:center"><h3 style="margin:0">${esc(title)}</h3><span class="grow"></span><span class="muted">${model.sheets[m].usedCount ? `<b style="color:var(--warn)">${model.sheets[m].usedCount} used piece(s) from stock</b> + ` : ''}${model.sheets[m].newCount} new sheet(s) of ${sw(m)[0]}×${sw(m)[1]}${model.sheets[m].type ? ' · ' + esc(model.sheets[m].type) : ''} · ${fq(Math.round(model.sheets[m].area * 100) / 100)} m² of parts</span></div>
        ${model.panels[m].length ? `<table class="grid" style="margin-top:8px"><thead><tr><th>Part</th><th>Cabinet</th><th class="num">Size cm</th><th class="num">Qty</th><th class="num">Edge band cm each</th><th>On the sheet</th></tr></thead><tbody>${group(model.panels[m]).map((r) => { const key = cutKey(m, r); const v = (spec.cut_dir || {})[key] || ''; return `<tr><td>${esc(r.label)}</td><td>${cabCell(names, r.cabs)}</td><td class="num">${fq(r.w)} × ${fq(r.h)}</td><td class="num">${r.qty}</td><td class="num">${r.edge ? fq(r.edge) : ''}</td><td><span class="seg" data-dirkey="${esc(key)}">${[['', 'Auto'], ['h', `↔ ${fq(r.w)} along`], ['v', `↕ ${fq(r.w)} across`]].map(([d, l]) => `<button type="button" data-dir="${d}" class="${v === d ? 'on' : ''}" title="${d === 'h' ? `The ${fq(r.w)} side runs along the sheet's length` : d === 'v' ? `The ${fq(r.w)} side runs across the sheet` : 'Let the plan turn it to save board'}" style="padding:3px 8px;font-size:12px">${l}</button>`).join('')}</span></td></tr>`; }).join('')}</tbody></table><details style="margin-top:8px" data-sheets="${m}" ${openSheets.has(m) ? 'open' : ''}><summary style="cursor:pointer;font-weight:600">Show how the sheets are cut</summary><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:8px">${model.sheets[m].sheets.map((s, i) => `<div><div class="muted" style="font-size:12px">${s.source === 'used' ? `<span class="badge warn">Used piece ${fq(s.w)} × ${fq(s.h)}</span>` : `New sheet ${i + 1 - model.sheets[m].usedCount}`} — ${Math.round(s.used * 100)}% used</div>${sheetSVG(s, s.w || sw(m)[0], s.h || sw(m)[1], { width: 360 })}</div>`).join('')}</div>${model.sheets[m].unfit.length ? `<p class="err">Does not fit a sheet: ${model.sheets[m].unfit.map((p) => `${p.label} ${p.w}×${p.h}`).join(', ')}</p>` : ''}</details>` : '<p class="muted">Nothing in this group yet.</p>'}</div>`).join('')}
      ${(() => { const rows = profileRows(model, sty); return rows.length ? `<div class="card" style="margin-bottom:14px"><h3 style="margin:0 0 6px">Profile cutting list — every piece with its profile</h3><table class="grid"><thead><tr><th>Cabinet</th><th>Part</th><th>Profile</th><th class="num">Length cm</th><th class="num">Qty</th><th>Cut</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${cabCell(names, [r.cab])}</td><td>${esc(r.part)}</td><td>${profTag(r.code, r.name)}</td><td class="num">${fq(r.len)}</td><td class="num">${r.qty}</td><td>${r.cut}</td></tr>`).join('')}</tbody></table></div>` : ''; })()}
      ${(model.carcassBars || []).length ? `<div class="card" style="margin-bottom:14px"><h3 style="margin:0 0 6px">Cabinet frames — aluminium profiles</h3>${model.carcassBars.map((g) => { const pr = (S.profiles || []).find((x) => x.code === g.code); return `<details style="margin-top:8px" open><summary style="cursor:pointer;font-weight:600">${esc(g.code)}${pr ? ' — ' + esc(pr.name) : ''} <span class="muted" style="font-weight:400">· ${g.bars.length} bar(s) of ${sty.bar_len || 600} cm · ${fq(Math.round(g.metres * 100) / 100)} m · straight cuts</span></summary><table class="grid" style="margin-top:6px"><thead><tr><th>Part</th><th>Cabinet</th><th class="num">Length cm</th><th class="num">Qty</th></tr></thead><tbody>${group(g.parts.map((x) => ({ label: x.label, w: x.len, h: 0, qty: x.qty, edge: 0 }))).map((r) => `<tr><td>${esc(r.label)} ${profTag(g.code, pr?.name)}</td><td>${cabCell(names, r.cabs)}</td><td class="num">${fq(r.w)}</td><td class="num">${r.qty}</td></tr>`).join('')}</tbody></table><table class="grid" style="margin-top:6px"><thead><tr><th>Bar</th><th>Pieces</th><th class="num">Offcut</th></tr></thead><tbody>${g.bars.map((bar, i) => `<tr><td><b>${i + 1}</b></td><td>${bar.items.map((x) => `<span style="white-space:nowrap"><b>${fq(x.len)}</b> <span class="muted" style="font-size:11px">${esc(String(x.label || '').replace(' · ', ' '))}</span></span>`).join(' &nbsp;+&nbsp; ')}</td><td class="num">${fq(bar.free)} cm</td></tr>`).join('')}</tbody></table>${g.unfit.length ? `<p class="err">${g.unfit.length} piece(s) are longer than a bar.</p>` : ''}</details>`; }).join('')}</div>` : ''}
      ${model.profile ? `<div class="card" style="margin-bottom:14px"><div style="display:flex;gap:8px;align-items:center"><h3 style="margin:0">Door frames — ${profTag(String(sty.profile || '').split(' ')[0] || '28456', (S.profiles || []).find((x) => x.code === (String(sty.profile || '').split(' ')[0] || '28456'))?.name || String(sty.profile || '').split(' ').slice(1).join(' '))} <span class="muted" style="font-weight:400;font-size:12px">height and width pieces from the same profile</span></h3><span class="grow"></span><span class="muted">${model.profile.bars.length} bar(s) of ${sty.bar_len} cm · ${fq(Math.round(model.profile.metres * 100) / 100)} m of profile · ${model.profile.corners} corners</span></div>
        <table class="grid" style="margin-top:8px"><thead><tr><th>Door / front</th><th>Cabinet</th><th class="num">Size cm</th><th class="num">Qty</th></tr></thead><tbody>${group(model.frames.map((f) => ({ ...f, edge: 0 }))).map(t).join('')}</tbody></table>
        <details style="margin-top:8px" open><summary style="cursor:pointer;font-weight:600">Cutting plan for the bars — every piece is cut at 45° at both ends (the length is the longest side)</summary><table class="grid" style="margin-top:6px"><thead><tr><th>Bar</th><th>Pieces, in cutting order</th><th class="num">Used</th><th class="num">Offcut</th></tr></thead><tbody>${model.profile.bars.map((b, i) => `<tr><td><b>${i + 1}</b></td><td>${b.items.map((x) => `<span style="white-space:nowrap"><b>${fq(x.len)}</b> <span class="muted" style="font-size:11px">${esc(String(x.label || '').replace(/^.* · /, ''))}</span></span>`).join(' &nbsp;+&nbsp; ')}</td><td class="num">${fq(Math.round((+sty.bar_len || 600) - b.free))}</td><td class="num">${fq(b.free)} cm</td></tr>`).join('')}</tbody></table>${model.profile.unfit.length ? `<p class="err">${model.profile.unfit.length} piece(s) are longer than a bar.</p>` : ''}</details></div>` : ''}
      ${model.skirtBars ? `<div class="card" style="margin-bottom:14px"><div style="display:flex;gap:8px;align-items:center"><h3 style="margin:0">Skirting — ${esc(sty.plinth_profile)}</h3><span class="grow"></span><span class="muted">${model.skirtBars.bars.length} bar(s) of ${sty.plinth_bar_len || 600} cm · ${fq(Math.round(model.skirtBars.metres * 100) / 100)} m · straight cuts</span></div><table class="grid" style="margin-top:6px"><thead><tr><th>Bar</th><th>Pieces</th><th class="num">Offcut</th></tr></thead><tbody>${model.skirtBars.bars.map((bar, i) => `<tr><td><b>${i + 1}</b></td><td>${bar.items.map((x) => `<b>${fq(x.len)}</b> <span class="muted" style="font-size:11px">${esc(String(x.label || '').replace(/^.* · /, '').replace(/^Skirting$/, ''))}</span>`).join(' + ')}</td><td class="num">${fq(bar.free)} cm</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="cols2" style="align-items:start"><div class="card"><h3>Hardware</h3><table class="grid"><tbody><tr><td>Hinges ${sty.hinge ? `<span class="muted">${esc(sty.hinge)}</span>` : ''}</td><td class="num">${hw.hinges}</td></tr><tr><td>Drawer sets ${sty.drawer ? `<span class="muted">${esc(sty.drawer)}</span>` : ''}</td><td class="num">${hw.slides}</td></tr><tr><td>Handles ${sty.handle ? `<span class="muted">${esc(sty.handle)}</span>` : ''}</td><td class="num">${hw.handles} <span class="muted">(${fq(Math.round(hw.handleLen) / 100)} m)</span></td></tr><tr><td>Plinth legs</td><td class="num">${hw.legs}</td></tr><tr><td>Wall hangers</td><td class="num">${hw.hangers}</td></tr>${hw.shutters ? `<tr><td>Roller shutter sets</td><td class="num">${hw.shutters}</td></tr>` : ''}${hw.tracks ? `<tr><td>Sliding door tracks</td><td class="num">${hw.tracks}</td></tr>` : ''}${hw.lifts ? `<tr><td>Lift-up mechanisms</td><td class="num">${hw.lifts}</td></tr>` : ''}<tr><td>Shelf pins</td><td class="num">${hw.pins}</td></tr></tbody></table></div>
      <div class="card"><h3>Glazed doors</h3>${model.glass.length ? `<table class="grid"><thead><tr><th>Glass (${esc(sty.glass || '—')})</th><th class="num">Size</th><th class="num">Qty</th></tr></thead><tbody>${model.glass.map((g) => `<tr><td>Door glass</td><td class="num">${g.w} × ${g.h}</td><td class="num">${g.qty}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No glazed doors.</p>'}</div></div>
      ${(model.appliances.length || Object.keys(model.accessories).length) ? `<div class="cols2" style="align-items:start;margin-top:14px"><div class="card"><h3>Appliance spaces</h3>${model.appliances.length ? `<table class="grid"><thead><tr><th>Appliance</th><th class="num">Opening W × H × D cm</th></tr></thead><tbody>${model.appliances.map((a2) => `<tr><td>${esc((APPLIANCES[a2.k] || [a2.k === 'hood' ? 'Cooker hood' : a2.k])[0])}</td><td class="num">${fq(a2.w)} × ${fq(a2.h)} × ${fq(a2.d)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">None.</p>'}</div><div class="card"><h3>Accessories</h3>${Object.keys(model.accessories).length ? `<table class="grid"><tbody>${Object.entries(model.accessories).map(([k2, n]) => `<tr><td>${esc(ACCESSORIES[k2]?.[0] || k2)}</td><td class="num">${n}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">None added.</p>'}</div></div>` : ''}`;
    $('#takestock', pane)?.addEventListener('click', guard(async () => {
      const rows = Object.entries(model.sheets).filter(([, x]) => x.type && x.sheets.length).map(([m, x]) => ({ m, x, t: (S.board_types || []).find((b) => b.name === x.type) })).filter((r) => r.t);
      if (!rows.length) { toast('Choose sheet types from your Stock › Sheets list first (Design tab)', 'err'); return; }
      const minSide = +S.settings.min_offcut || 30; const offcuts = rows.flatMap(({ x, t }) => x.sheets.flatMap((s) => { const best = [...(s.free || [])].sort((a, b) => b.w * b.h - a.w * a.h)[0]; return best && Math.min(best.w, best.h) >= minSide ? [{ t, w: Math.max(best.w, best.h), h: Math.min(best.w, best.h) }] : []; }));
      const lines = rows.map(({ x, t }) => `<li><b>${esc(t.name)}</b>: ${x.newCount} new sheet(s)${x.usedCount ? `, ${x.usedCount} used piece(s)` : ''}</li>`).join('');
      const w = document.createElement('div'); w.innerHTML = `<p>This takes the following out of the stock:</p><ul>${lines}</ul><p>${offcuts.length ? `${offcuts.length} offcut(s) of at least ${minSide} cm on the short side go back into stock as used pieces.` : 'No offcut is big enough to keep.'}</p>${spec.stock_taken ? `<p class="err">Already taken on ${esc(dmy(spec.stock_taken))} — taking again removes the same amount twice.</p>` : ''}`;
      modal({ title: 'Take from stock', body: w, buttons: [{ label: 'Cancel' }, { label: 'Take from stock', kind: 'primary', onClick: async () => {
        const fresh = await api.get('t/board_stock'); const take = async (type, kind, w2, h2, n) => { // remove n from the matching lines
          let left = n; for (const r of fresh.filter((q) => q.type_id === type.id && q.kind === kind && (kind === 'new' || (Math.max(q.length, q.width) === w2 && Math.min(q.length, q.width) === h2)))) { if (left <= 0) break; const d = Math.min(left, r.qty); left -= d; d >= r.qty ? await api.del(`t/board_stock/${r.id}`) : await api.put(`t/board_stock/${r.id}`, { qty: r.qty - d }); r.qty -= d; }
          return left; };
        for (const { x, t } of rows) { await take(t, 'new', 0, 0, x.newCount); for (const s of x.sheets.filter((q) => q.source === 'used')) await take(t, 'used', s.w, s.h, 1); }
        for (const o of offcuts) await api.post('t/board_stock', { type_id: o.t.id, kind: 'used', length: Math.round(o.w * 10) / 10, width: Math.round(o.h * 10) / 10, qty: 1, unit_cost: Math.round((o.t.price || 0) * (o.w * o.h) / ((o.t.sheet_w * o.t.sheet_h) || 1) * ((+S.settings.leftover_pct) || 60) / 100 * 1000) / 1000, source: `Offcut of ${k.name || 'kitchen'}`, date: today() });
        spec.stock_taken = today(); touch(); await refresh(); toast('Stock updated'); cuts(pane);
      } }] });
    }));
    $$('[data-cutmode]', pane).forEach((b) => (b.onclick = () => { spec.style.cut_mode = b.dataset.cutmode; touch(); cuts(pane); }));
    $$('[data-dirkey] [data-dir]', pane).forEach((b) => (b.onclick = () => { const key = b.closest('[data-dirkey]').dataset.dirkey; spec.cut_dir = { ...(spec.cut_dir || {}) }; if (b.dataset.dir) spec.cut_dir[key] = b.dataset.dir; else delete spec.cut_dir[key]; const det = b.closest('.card')?.querySelector('[data-sheets]'); if (det) openSheets.add(det.dataset.sheets); touch(); cuts(pane); }));
    $$('[data-sheets]', pane).forEach((d) => d.addEventListener('toggle', () => { if (d.open) openSheets.add(d.dataset.sheets); else openSheets.delete(d.dataset.sheets); }));
  }

  // ---------------------------------------------------------------- countertop
  function counterTab(pane) {
    const c = spec.counter; const ct = model.tops;
    const stones = namesOf(optList, 'marble'); const thick = [...new Set(optList.filter((o) => o.kind === 'marble' && o.name === c.material).map((o) => o.meta?.thickness).filter(Boolean))];
    pane.innerHTML = `<div class="cols2" style="align-items:start"><div class="card"><h3>Countertop settings</h3><div class="form">
      <label class="field"><span>Stone / material</span><select data-c="material"><option value="">— choose —</option>${stones.map((n) => `<option ${c.material === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <label class="field"><span>Thickness cm</span><input data-c="thickness" type="number" step="any" list="dl-th" value="${c.thickness}"><datalist id="dl-th">${thick.map((x) => `<option value="${x}">`).join('')}</datalist></label>
      <label class="field"><span>Front overhang cm</span><input data-c="front" type="number" step="any" value="${c.front}"></label><label class="field"><span>Overhang at each end cm</span><input data-c="side" type="number" step="any" value="${c.side}"></label>
      <label class="field"><span>Back splash height cm (0 = none)</span><input data-c="splash_h" type="number" step="any" value="${c.splash_h}"></label><label class="field"><span>Waste allowance %</span><input data-c="waste" type="number" step="any" value="${c.waste}"></label>
      <label class="field"><span>Slab size (cm)</span><div style="display:flex;gap:6px"><input data-c="slab_w" type="number" value="${c.slab_w}"><input data-c="slab_h" type="number" value="${c.slab_h}"></div></label>
      <label class="field"><span>Extra sink / hob cut-outs</span><div style="display:flex;gap:6px"><input data-c="extra_sinks" type="number" value="${c.extra_sinks}" title="extra sinks"><input data-c="extra_hobs" type="number" value="${c.extra_hobs}" title="extra hobs"></div></label></div>
      <p class="muted" style="margin-bottom:0">Cabinets with a worktop (base, drawer, sink, hob, corner) are joined into one piece; a tall unit or appliance gap breaks it. Sink and hob bases add their cut-outs automatically.</p></div>
      <div><div class="card"><h3>Pieces</h3><table class="grid"><thead><tr><th>Piece</th><th class="num">Length</th><th class="num">Depth</th><th class="num">Splash</th></tr></thead><tbody>${ct.pieces.map((p) => `<tr><td>${esc(p.runName || 'Run')}</td><td class="num">${fq(p.len)}</td><td class="num">${fq(p.depth)}</td><td class="num">${p.splash ? fq(p.splash) + ' × ' + fq(c.splash_h) : '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No worktop yet — add base cabinets.</td></tr>'}</tbody><tfoot><tr><td>Total</td><td class="num">${fq(ct.run_m)} m</td><td></td><td class="num">${fq(Math.round(ct.area_m2 * 100) / 100)} m²</td></tr></tfoot></table>
      <p class="muted" style="margin:8px 0 0">Edge to polish ${fq(Math.round(ct.polish_m * 10) / 10)} m · sink cut-outs ${ct.sinks} · hob cut-outs ${ct.hobs}${ct.corners ? ` · ${ct.corners} corner joint(s)` : ''} · stone needed ${fq(Math.round(ct.slab_area * 100) / 100)} m² incl. waste · ${ct.slabs.sheets.length} slab(s) of ${c.slab_w}×${c.slab_h}</p></div>
      <div class="card" style="margin-top:12px"><h3>Plan</h3><div style="overflow-x:auto">${planSVG(spec, model)}</div></div></div></div>
      ${ct.slabs.sheets.length ? `<div class="card" style="margin-top:14px"><h3>Cutting the slabs</h3><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">${ct.slabs.sheets.map((s, i) => `<div><div class="muted" style="font-size:12px">Slab ${i + 1} — ${Math.round(s.used * 100)}% used</div>${sheetSVG(s, c.slab_w, c.slab_h, { width: 380 })}</div>`).join('')}</div></div>` : ''}`;
    $$('[data-c]', pane).forEach((e) => (e.onchange = () => { c[e.dataset.c] = e.tagName === 'SELECT' ? e.value : num(e.value); touch(); counterTab(pane); }));
  }

  // ---------------------------------------------------------------- price
  function price(pane) {
    const p = priceKitchen(model, opts); const groups = [...new Set(p.lines.map((l) => l.group))]; const missing = p.lines.filter((l) => !l.price);
    pane.innerHTML = `<div class="cards"><div class="card stat"><div class="k">Cost estimate</div><div class="v">${money(p.cost, 2)}</div></div><div class="card stat"><div class="k">By your rates</div><div class="v">${p.byRates ? money(p.byRates, 2) : '—'}</div></div><div class="card stat"><div class="k">Cost + ${fq(p.markup)}% mark-up</div><div class="v">${p.byCost ? money(p.byCost, 2) : '—'}</div></div><div class="card stat"><div class="k">Suggested price</div><div class="v pos">${p.suggested ? money(p.suggested, 2) : '—'}</div></div></div>
      ${missing.length ? `<div class="card" style="margin-bottom:14px;border-color:var(--warn)"><b>${missing.length} item(s) have no price yet:</b> <span class="muted">${missing.map((l) => esc(l.label)).join(', ')}</span> <a href="#/kitchens/options">Enter prices →</a></div>` : ''}
      <div class="card"><h3>Cost breakdown</h3><table class="grid"><thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th class="num">Price</th><th class="num">Total</th></tr></thead><tbody>${groups.map((g) => `<tr><td colspan="5" style="background:var(--soft);font-weight:700">${esc(g)}</td></tr>${p.lines.filter((l) => l.group === g).map((l) => `<tr><td>${esc(l.label)}</td><td class="num">${fq(l.qty)}</td><td class="muted">${esc(l.unit)}</td><td class="num">${l.price ? money(l.price, 3) : '<span class="neg">—</span>'}</td><td class="num">${money(l.total, 2)}</td></tr>`).join('')}`).join('')}</tbody><tfoot><tr><td colspan="4">Total cost</td><td class="num">${money(p.cost, 2)}</td></tr></tfoot></table></div>
      <div class="card" style="margin-top:14px"><h3>Selling price by your rates</h3><table class="grid"><tbody>${[['Base cabinets', model.meters.base, p.rates.base], ['Wall cabinets', model.meters.wall, p.rates.wall], ['Tall units', model.meters.tall, p.rates.tall], ['Countertop', model.tops.run_m, p.rates.counter], ['Sink / hob cut-outs', model.tops.sinks + model.tops.hobs, p.rates.sinks]].map(([l, q, v]) => `<tr><td>${l}</td><td class="num">${fq(Math.round(q * 100) / 100)}</td><td class="num">${money(v, 2)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">Total</td><td class="num">${money(p.byRates, 2)}</td></tr></tfoot></table>${p.byRates ? '' : '<p class="muted">Enter your selling rates under Options &amp; prices to price by the metre.</p>'}</div>
      <div class="sticky-actions"><button class="btn primary" id="toQuote">Add to a quotation…</button><button class="btn" id="toPO">Purchase order for boards, hardware &amp; stone…</button></div>`;
    $('#toQuote', pane).onclick = guard(() => addToQuote(p));
    $('#toPO', pane).onclick = guard(async () => {
      const sup = await api.get('t/items'); const mk = (l) => { const it = sup.find((i) => i.name.toLowerCase() === (l.name || '').toLowerCase()); return { on: true, kind: 'other', name: l.label, code: '', colour: '', qty: Math.ceil(l.qty * 100) / 100, unit: l.unit, price: l.price || it?.price || 0, supplier: it?.supplier || '' }; };
      if (dirty) await api.put(`t/kitchens/${id}`, { spec }); dirty = false;
      openPoDialog({ lines: p.lines.filter((l) => ['Boards', 'Hardware', 'Countertop', 'Glass'].includes(l.group) && !/polish|cut-out/i.test(l.label)).map(mk), orderInv: k.order_inv || '', onDone: () => (location.hash = '#/pos') });
    });
  }

  async function addToQuote(p) {
    if (dirty) { await api.put(`t/kitchens/${id}`, { name: k.name, spec }); dirty = false; }
    const quotes = (await api.get('t/quotes')).filter((q) => !q.order_inv);
    const w = document.createElement('div');
    w.innerHTML = `<label class="field"><span>Add to</span><select id="qsel"><option value="new">A new quotation for ${esc(k.client || 'this client')}</option>${quotes.slice(0, 40).map((q) => `<option value="${q.id}">${esc(q.number)} · ${esc(q.client)}</option>`).join('')}</select></label>
      <p class="muted">Adds ${p.byRates ? 'one line per part, priced with your selling rates' : 'one line with the cost + mark-up price'}. You can still change prices on the quotation.</p>`;
    modal({ title: 'Add kitchen to a quotation', body: w, buttons: [{ label: 'Cancel' }, { label: 'Add', kind: 'primary', onClick: async () => {
      const m = model.meters; const sty = spec.style; const descr = (kind) => spec.runs.flatMap((r) => r.cabinets.filter((c) => (CAB_TYPES[c.type] || {})[kind]).map((c) => `${c.w}`)).join(' + ');
      const base = { kitchen_id: id, qty: 1, w: null, h: null, manual: true, model_id: null, glass_id: null, colour: '' };
      const notes = `${sty.carcass || ''}${sty.door && sty.door !== sty.carcass ? ' / doors ' + sty.door : ''}; handles ${sty.handle || '—'}; hinges ${sty.hinge || '—'}${model.hw.slides ? '; drawers ' + (sty.drawer || '—') : ''}`;
      const items = p.byRates ? [
        m.base > 0 && { ...base, desc: `Fabrication & installation of kitchen base cabinets — ${fq(Math.round(m.base * 100) / 100)} m (${m.base_n} units)`, note: notes, price: Math.round(p.rates.base * 100) / 100 },
        m.wall > 0 && { ...base, desc: `Fabrication & installation of kitchen wall cabinets — ${fq(Math.round(m.wall * 100) / 100)} m (${m.wall_n} units)`, note: '', price: Math.round(p.rates.wall * 100) / 100 },
        m.tall > 0 && { ...base, desc: `Fabrication & installation of kitchen tall units — ${fq(Math.round(m.tall * 100) / 100)} m (${m.tall_n} units)`, note: '', price: Math.round(p.rates.tall * 100) / 100 },
        model.tops.run_m > 0 && { ...base, desc: `Countertop ${spec.counter.material || ''} ${spec.counter.thickness} cm — ${fq(Math.round(model.tops.run_m * 100) / 100)} m`, note: `${model.tops.sinks ? model.tops.sinks + ' sink cut-out(s)' : ''}${model.tops.hobs ? ' ' + model.tops.hobs + ' hob cut-out(s)' : ''}`.trim(), price: Math.round((p.rates.counter + p.rates.sinks) * 100) / 100 },
      ].filter(Boolean) : [{ ...base, desc: `Fabrication & installation of kitchen — ${fq(Math.round((m.base + m.wall + m.tall) * 100) / 100)} m of cabinets${model.tops.run_m ? ' with ' + (spec.counter.material || 'countertop') : ''}`, note: notes, price: Math.round(p.byCost * 100) / 100 }];
      const sel = $('#qsel', w).value; let q;
      if (sel === 'new') q = await api.post('t/quotes', { client: k.client || '', date: today(), items, title: S.settings.intro_line || '', vat_rate: S.settings.vat_rate ?? 10, discount: 0, vat_waived: 0, status: 'draft', notes: `Kitchen design: ${k.name}` });
      else { const cur = await api.get(`t/quotes/${sel}`); q = await api.put(`t/quotes/${sel}`, { items: [...(cur.items || []), ...items] }); }
      k.quote_no = q.number; await api.put(`t/kitchens/${id}`, { quote_no: q.number, status: k.status === 'draft' ? 'quoted' : k.status }); toast(`Added to ${q.number}`); location.hash = `#/quotes/${q.id}`;
    } }] });
  }

  // ---------------------------------------------------------------- customer proposal (printable, with drawings)
  function proposal(pane) {
    const pp = (spec.proposal ||= { mode: 'total', plan: 1, price: null, message: '' });
    const p = priceKitchen(model, opts); const sty = spec.style; const vatRate = Number(S.settings.vat_rate ?? 10);
    const shown = pp.price != null && pp.price !== '' ? num(pp.price) : Math.round(p.suggested);
    const vat = Math.round(shown * vatRate) / 100; const total = shown + vat; const m = model.meters; const ct = model.tops;
    const parts = [['Base cabinets', m.base, `${m.base_n} units`, p.rates.base], ['Wall cabinets', m.wall, `${m.wall_n} units`, p.rates.wall], ['Tall units', m.tall, `${m.tall_n} units`, p.rates.tall], [`Countertop ${spec.counter.material || ''} ${spec.counter.thickness} cm`, ct.run_m, `${fq(Math.round(ct.area_m2 * 100) / 100)} m²`, p.rates.counter + p.rates.sinks]].filter((x) => x[1] > 0);
    const scale = p.byRates > 0 ? shown / p.byRates : 0;
    const priceRows = pp.mode === 'sections' && scale ? parts.map(([l, q, d, v]) => `<tr><td>${esc(l)}</td><td class="n">${fq(Math.round(q * 100) / 100)} m · ${esc(d)}</td><td class="n">${money(v * scale, 2)}</td></tr>`).join('') : '';
    pane.innerHTML = `<div class="printbar noprint" style="align-items:flex-end">
        <label class="field" style="width:180px"><span>Price shown (BD, before VAT)</span><input id="pp_price" type="number" step="any" value="${shown}"></label>
        <label class="field" style="width:200px"><span>Show</span><select id="pp_mode"><option value="total" ${pp.mode === 'total' ? 'selected' : ''}>One total</option><option value="sections" ${pp.mode === 'sections' ? 'selected' : ''} ${scale ? '' : 'disabled'}>Price by section${scale ? '' : ' (needs selling rates)'}</option><option value="none" ${pp.mode === 'none' ? 'selected' : ''}>No price (drawings only)</option></select></label>
        <label class="field" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="pp_plan" ${pp.plan ? 'checked' : ''}> <span>Include the plan view</span></label>
        <label class="field" style="flex:1;min-width:240px"><span>Message to the customer (optional)</span><input id="pp_msg" value="${esc(pp.message || '')}"></label>
        <button class="btn primary" id="print">Print / Save as PDF</button>${k.client ? '' : ''}</div>
      <div class="doc" data-noi18n>${docHeader('KITCHEN PROPOSAL', AR.proposal)}
        <div class="meta"><div><b>${L('client', 'Client')}:</b> ${esc(k.client || '')}</div><div><b>${L('date', 'DATE')}:</b> ${dmy(today())}</div><div><b>${L('kitchen', 'Kitchen')}:</b> ${esc(k.name)}</div><div><b>${L('quote', 'Ref')}:</b> ${esc(k.quote_no || k.order_inv || '')}</div></div>
        ${pp.message ? `<div class="banner">${esc(pp.message)}</div>` : ''}
        <h4 style="margin:10px 0 4px">${L('front', 'Front view')}</h4><div style="color:#111">${elevationSVG(spec, { maxW: 700 })}</div>
        ${pp.plan && model.tops.pieces.length ? `<h4 style="margin:10px 0 4px">${L('plan', 'Plan view')}</h4><div style="color:#111">${planSVG(spec, model, { maxW: 700 })}</div>` : ''}
        <h4 style="margin:12px 0 4px">${L('materials', 'Materials & specification')}</h4>
        <table><tbody>${[['Cabinet boards', sty.carcass], ['Doors & drawer fronts', [sty.door || sty.carcass, sty.door_colour].filter(Boolean).join(' — ')], ['Handles', sty.handle], ['Hinges', sty.hinge], ['Drawer system', model.hw.slides ? sty.drawer : ''], ['Countertop', ct.pieces.length ? `${spec.counter.material || ''} ${spec.counter.thickness} cm` : ''], ['Aluminium profile colour', [sty.profile_in, sty.profile_out].filter(Boolean).join(' / ')]].filter((r) => r[1]).map(([a, b]) => `<tr><td style="width:40%"><b>${a}</b></td><td>${esc(b)}</td></tr>`).join('')}<tr><td><b>Size</b></td><td>Base ${fq(Math.round(m.base * 100) / 100)} m · Wall ${fq(Math.round(m.wall * 100) / 100)} m · Tall ${fq(Math.round(m.tall * 100) / 100)} m${ct.run_m ? ` · Countertop ${fq(Math.round(ct.run_m * 100) / 100)} m` : ''}</td></tr></tbody></table>
        ${pp.mode === 'none' ? '' : `<h4 style="margin:12px 0 4px">${L('price', 'Price')}</h4><table><thead><tr><th>${L('description', 'Description')}</th><th class="n">${L('size', 'Quantity')}</th><th class="n">${L('amount', 'Amount (BD)')}</th></tr></thead><tbody>${priceRows || `<tr><td>Supply, fabrication and installation of the kitchen as shown</td><td class="n">1</td><td class="n">${money(shown, 2)}</td></tr>`}</tbody></table>
        <div class="tot"><div><span>${L('total', 'Total')}</span><span>${money(shown, 2)}</span></div>${vatRate ? `<div><span>${L('vat', 'VAT')} ${fq(vatRate)}%</span><span>${money(vat, 2)}</span></div>` : ''}<div class="g"><span>${L('grand', 'Grand Amount BD')}</span><span>${money(total, 2)}</span></div></div>${wordsBlock(total)}`}
        <p class="muted" style="font-size:11px">${AR.valid} · Valid for 14 days</p>
        <div class="sign"><div>${L('prepared', 'Prepared')}</div><div>${L('custSign', 'Customer acceptance')}</div></div>${termsBlock()}${docFooter()}</div>`;
    const upd = () => { pp.price = $('#pp_price', pane).value === '' ? null : num($('#pp_price', pane).value); pp.mode = $('#pp_mode', pane).value; pp.plan = $('#pp_plan', pane).checked ? 1 : 0; pp.message = $('#pp_msg', pane).value; touch(); };
    for (const id2 of ['#pp_price', '#pp_mode', '#pp_plan']) $(id2, pane).onchange = () => { upd(); proposal(pane); };
    $('#pp_msg', pane).onchange = () => { upd(); proposal(pane); };
    $('#print', pane).onclick = () => window.print();
  }

  // ---------------------------------------------------------------- production sheet
  function sheet(pane) {
    const sty = spec.style; const hw = model.hw; const ct = model.tops;
    const names = cabNames(spec); const cabTxt = (cabs) => [...cabs].filter(Boolean).map((c) => `${c}${names.get(c) ? ' (' + names.get(c) + ')' : ''}`).join(', ');
    const tbl = (arr) => { const mm = new Map(); for (const p of arr) { const key = `${p.label.replace(/^.* · /, '')}|${p.w}|${p.h}`; const e = mm.get(key) || { ...p, label: p.label.replace(/^.* · /, ''), qty: 0, cabs: new Set() }; e.qty += p.qty; e.cabs.add(cabOf(p.label)); mm.set(key, e); } return [...mm.values()].map((r) => `<tr><td>${esc(r.label)}</td><td style="font-size:11px">${esc(cabTxt(r.cabs))}</td><td class="n">${fq(r.w)} × ${fq(r.h)}</td><td class="n">${r.qty}</td></tr>`).join(''); };
    pane.innerHTML = `<div class="printbar"><button class="btn primary" id="print">Print / Save as PDF</button></div><div class="doc">${docHeader('KITCHEN PRODUCTION SHEET')}
      <div class="meta"><div><b>Kitchen:</b> ${esc(k.name)}</div><div><b>DATE:</b> ${dmy(today())}</div><div><b>Client:</b> ${esc(k.client || '')}</div><div><b>Order:</b> ${esc(k.order_inv || k.quote_no || '')}</div></div>
      <p style="margin:4px 0"><b>Boards:</b> ${esc(sty.carcass || '—')}${sty.door && sty.door !== sty.carcass ? ` · doors ${esc(sty.door)}` : ''} &nbsp; <b>Door colour:</b> ${esc(sty.door_colour || '—')} &nbsp; <b>Handle:</b> ${esc(sty.handle || '—')} &nbsp; <b>Hinges:</b> ${esc(sty.hinge || '—')} &nbsp; <b>Drawers:</b> ${esc(sty.drawer || '—')} &nbsp; <b>Profile:</b> ${esc(sty.profile_in || '—')} / ${esc(sty.profile_out || '—')}${spec.counter.material ? ` &nbsp; <b>Countertop:</b> ${esc(spec.counter.material)} ${spec.counter.thickness} cm` : ''}</p>
      ${k.notes ? `<p style="padding:6px 8px;background:#f2f4f8;border-radius:4px"><b>Notes:</b> ${esc(k.notes)}</p>` : ''}
      <div style="color:#111">${elevationSVG(spec, { maxW: 700 })}</div>
      <h4>Cabinets</h4><table><thead><tr><th>Run</th><th>#</th><th>Type</th><th class="n">W × D × H</th><th class="n">Doors</th><th class="n">Drawers</th><th class="n">Shelves</th></tr></thead><tbody>${spec.runs.flatMap((r) => r.cabinets.map((c, i) => `<tr><td>${esc(r.name || '')}</td><td>${i + 1}</td><td>${esc((CAB_TYPES[c.type] || {}).label || c.type)}${c.label ? ' · ' + esc(c.label) : ''}</td><td class="n">${c.w} × ${c.d} × ${c.h}</td><td class="n">${c.doors || ''}${c.glazed ? ` (${c.glazed} glazed)` : ''}</td><td class="n">${c.drawers || ''}</td><td class="n">${c.shelves || ''}</td></tr>`)).join('')}</tbody></table>
      ${['end', 'white22', 'white16', 'design', 'carcass', 'door', 'back'].map((mm) => (model.panels[mm].length ? `<h4>${{ carcass: 'Carcass boards', door: 'Doors & drawer fronts', back: 'Back panels', end: 'Visible sides', white22: 'White sheet 2.2 cm', white16: 'White sheet 1.6 cm', design: 'Design sheet' }[mm]} <span style="font-weight:400">— ${model.sheets[mm].newCount} new sheet(s)${model.sheets[mm].usedCount ? ` + ${model.sheets[mm].usedCount} used piece(s)` : ''}${model.sheets[mm].type ? ' · ' + esc(model.sheets[mm].type) : ''}</span></h4><table><thead><tr><th>Part</th><th>Cabinet</th><th class="n">Size cm</th><th class="n">Qty</th></tr></thead><tbody>${tbl(model.panels[mm])}</tbody></table>` : '')).join('')}
      ${(() => { const rows = profileRows(model, spec.style); return rows.length ? `<h4>Aluminium profiles</h4><table><thead><tr><th>Cabinet</th><th>Part</th><th>Profile</th><th class="n">Length cm</th><th class="n">Qty</th><th>Cut</th></tr></thead><tbody>${rows.map((r) => `<tr><td style="font-size:11px;white-space:nowrap">${esc(cabTxt([r.cab]))}</td><td>${esc(r.part)}</td><td><b>${esc(r.code)}</b>${r.name ? ' ' + esc(r.name) : ''}</td><td class="n">${fq(r.len)}</td><td class="n">${r.qty}</td><td>${r.cut}</td></tr>`).join('')}</tbody></table>` : ''; })()}
      <h4>Hardware</h4><p style="margin:2px 0">Hinges ${hw.hinges} · Drawer sets ${hw.slides} · Handles ${hw.handles} (${fq(Math.round(hw.handleLen) / 100)} m) · Legs ${hw.legs} · Wall hangers ${hw.hangers} · Shelf pins ${hw.pins}${model.glass.length ? ` · Glass ${model.glass.map((g) => `${g.w}×${g.h}`).join(', ')}` : ''}</p>
      ${ct.pieces.length ? `<h4>Countertop — ${esc(spec.counter.material || '')} ${spec.counter.thickness} cm</h4><table><thead><tr><th>Piece</th><th class="n">Length × depth</th><th class="n">Splash</th></tr></thead><tbody>${ct.pieces.map((p) => `<tr><td>${esc(p.runName || '')}</td><td class="n">${p.len} × ${p.depth}</td><td class="n">${p.splash ? p.splash + ' × ' + spec.counter.splash_h : ''}</td></tr>`).join('')}</tbody></table><p style="margin:4px 0">Sink cut-outs ${ct.sinks} · Hob cut-outs ${ct.hobs} · Polish ${fq(Math.round(ct.polish_m * 10) / 10)} m</p><div style="color:#111">${planSVG(spec, model, { maxW: 700 })}</div>` : ''}
      ${docFooter()}</div>`;
    $('#print', pane).onclick = () => window.print();
  }
  draw();
  window.addEventListener('beforeunload', (e) => { if (dirty && el.isConnected) { e.preventDefault(); e.returnValue = ''; } });
}

// ------------------------------------------------------------------ options & prices
async function optionsPage(el) {
  let kind = sessionStorage.getItem('ko-kind') || 'panel';
  const draw = async () => {
    const all = await api.get('t/kitchen_options'); const rows = all.filter((o) => o.kind === kind); const cfg = KINDS.find((x) => x[0] === kind);
    el.innerHTML = `<div class="ph"><a class="btn" href="#/kitchens">← Kitchens</a><h1>Kitchen options &amp; prices</h1><span class="sub">What you can choose in a kitchen, and what each choice costs</span></div>
      <div class="tbar"><div class="seg">${KINDS.map(([k2, l]) => `<button data-k="${k2}" class="${k2 === kind ? 'on' : ''}">${l}</button>`).join('')}</div><span class="grow"></span>${kind === 'general' || kind === 'preset' ? '' : '<button class="btn primary" id="add">+ Add</button>'}</div>
      <div class="card"><table class="grid"><thead><tr><th>${kind === 'general' ? 'Item' : 'Name'}</th>${kind === 'preset' ? '<th>Cabinet</th><th></th>' : ''}${kind === 'marble' ? '<th>Thickness cm</th>' : ''}${kind === 'profile_colour' || kind === 'preset' ? '' : `<th>Unit</th><th class="num">${kind === 'general' ? 'Value (BD, or % for mark-up)' : 'Price (BD)'}</th>`}<th></th></tr></thead><tbody>${kind === 'preset' ? rows.map((o) => `<tr data-id="${o.id}"><td><input data-f="name" value="${esc(o.name)}"></td><td class="muted">${esc((CAB_TYPES[o.meta?.type] || {}).label || '')} · ${o.meta?.w}×${o.meta?.h}×${o.meta?.d} cm · ${o.meta?.doors || 0} door(s), ${o.meta?.drawers || 0} drawer(s), ${o.meta?.shelves || 0} shelf/shelves</td><td><button class="btn sm danger" data-rm>×</button></td></tr>`).join('') : rows.map((o) => `<tr data-id="${o.id}"><td>${kind === 'general' ? esc(o.note || o.name) : `<input data-f="name" value="${esc(o.name)}">`}</td>${kind === 'marble' ? `<td><input data-f="thickness" type="number" step="any" value="${o.meta?.thickness ?? ''}" style="width:90px"></td>` : ''}${kind === 'profile_colour' ? '' : `<td>${kind === 'general' ? '' : `<input data-f="unit" value="${esc(o.unit || '')}" style="width:90px">`}</td><td class="num"><input data-f="price" type="number" step="any" value="${o.price ?? 0}" style="width:110px;text-align:right"></td>`}<td>${kind === 'general' ? '' : '<button class="btn sm danger" data-rm>×</button>'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nothing here yet</td></tr>'}</tbody></table>
      ${kind === 'preset' ? '<p class="muted">Presets are cabinets you use again and again. Save one with the ★ button on any cabinet in a kitchen, then add it to a run from “From preset”.</p>' : kind === 'panel' ? '<p class="muted">Price is per full sheet (size set per kitchen, 244 × 122 cm by default).</p>' : kind === 'handle' ? '<p class="muted">Use unit “m” for profile handles (priced per metre) or “pcs” for knobs and bar handles.</p>' : kind === 'marble' ? '<p class="muted">Price per m² for each stone and thickness.</p>' : ''}</div>`;
    $$('.seg button', el).forEach((b) => (b.onclick = () => { kind = b.dataset.k; sessionStorage.setItem('ko-kind', kind); draw(); }));
    $('#add', el)?.addEventListener('click', guard(async () => { await api.post('t/kitchen_options', { kind, name: kind === 'marble' ? 'New stone' : 'New item', unit: cfg[2], price: 0, meta: kind === 'marble' ? { thickness: 2 } : null, sort: 999 }); draw(); }));
    $('tbody', el).addEventListener('change', guard(async (e) => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return; const f = e.target.dataset.f; const id = Number(tr.dataset.id); const cur = all.find((x) => x.id === id);
      const body = f === 'thickness' ? { meta: { ...(cur.meta || {}), thickness: num(e.target.value) } } : { [f]: f === 'price' ? num(e.target.value) : e.target.value };
      await api.put(`t/kitchen_options/${id}`, body); toast('Saved');
    }));
    $('tbody', el).addEventListener('click', guard(async (e) => { if (e.target.matches('[data-rm]') && await confirmBox('Delete this option? Kitchens that use it keep the name but lose the price.')) { await api.del(`t/kitchen_options/${e.target.closest('tr').dataset.id}`); draw(); } }));
  };
  draw();
}
