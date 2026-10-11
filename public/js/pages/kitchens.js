import { S } from '../app.js';
import { api, $, $$, esc, money, qty as fq, num, today, dmy, toast, guard, confirmBox, modal, formHTML, readForm, dataTable, badge, datalist } from '../ui.js';
import { CAB_TYPES, DEFAULT_STYLE, DEFAULT_COUNTER, kitchenModel, priceKitchen } from '../kitchen.js';
import { elevationSVG, planSVG, sheetSVG } from '../kitchen-draw.js';
import { docHeader, docFooter, L, AR, wordsBlock, termsBlock } from '../doc.js';
import { openPoDialog } from '../po-dialog.js';

const isWorker = () => S.me?.role === 'worker';
const KINDS = [['panel', 'Boards / sheets', 'sheet'], ['handle', 'Handles', ''], ['hinge', 'Hinges', 'pcs'], ['drawer', 'Drawer systems', 'set'], ['marble', 'Countertop stone', 'm²'], ['glass', 'Door glass', 'm²'], ['profile_colour', 'Profile colours', ''], ['preset', 'Cabinet presets', ''], ['general', 'Rates & other prices', '']];
const GEN_NOTE = {};

/** Options from the database → { kind: { name: row } }, marble also keyed "name|thickness"; general → numbers. */
function optionsMap(list) {
  const m = {};
  for (const o of list) {
    const k = (m[o.kind] ||= {});
    if (o.kind === 'general') { k[o.name] = Number(o.price) || 0; GEN_NOTE[o.name] = o.note; continue; }
    k[o.name] = o; if (o.kind === 'marble' && o.meta?.thickness) k[`${o.name}|${o.meta.thickness}`] = o;
  }
  return m;
}
const namesOf = (list, kind) => [...new Set(list.filter((o) => o.kind === kind).map((o) => o.name))];

export async function render(el, [id, tab]) {
  if (id === 'options' && !isWorker()) return optionsPage(el);
  if (id) return editor(el, Number(id), isWorker() ? 'sheet' : tab || 'design');
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
    actions: isWorker() ? undefined : () => '<button class="btn sm" data-act="dup">Duplicate</button> <button class="btn sm danger" data-act="del">Delete</button>',
  });
  t.addEventListener('act', guard(async (e) => {
    const { act, row } = e.detail;
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
const cabinetOf = (type) => { const t = CAB_TYPES[type]; return { type, label: '', w: t.w, h: t.h, d: t.d, doors: t.doors, drawers: t.drawers, shelves: t.shelves, glazed: 0 }; };

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
  const spec = k.spec; const TABS = worker ? [['sheet', 'Production sheet']] : [['design', 'Design'], ['cuts', 'Cut list & boards'], ['counter', 'Countertop'], ['price', 'Price'], ['proposal', 'Customer page'], ['sheet', 'Production sheet']];
  el.innerHTML = `<div id="kit"></div>`; const root = $('#kit', el);
  const touch = () => { dirty = true; model = kitchenModel(spec); const b = $('#save', root); if (b) b.textContent = 'Save changes ●'; };
  const head = () => `<div class="ph"><a class="btn" href="#/kitchens">← Kitchens</a><h1>${esc(k.name)}</h1>${badge(k.status || 'draft', k.status === 'approved' ? 'ok' : '')}<span class="sub">${[k.client, k.order_inv].filter(Boolean).map(esc).join(' · ')}</span><span class="grow"></span>${worker ? '' : '<button class="btn primary" id="save">Save</button>'}</div>
    <div class="tbar"><div class="seg">${TABS.map(([t, l]) => `<button data-tab="${t}" class="${t === tab ? 'on' : ''}">${l}</button>`).join('')}</div></div><div id="pane"></div>`;
  const draw = () => {
    root.innerHTML = head(); const pane = $('#pane', root);
    $$('[data-tab]', root).forEach((b) => (b.onclick = () => { tab = b.dataset.tab; draw(); }));
    $('#save', root)?.addEventListener('click', guard(async () => { await api.put(`t/kitchens/${id}`, { name: k.name, client: k.client, order_inv: k.order_inv, quote_no: k.quote_no, status: k.status, notes: k.notes, spec }); dirty = false; toast('Kitchen saved'); $('#save', root).textContent = 'Save'; }));
    ({ design, cuts, counter: counterTab, price, proposal, sheet }[tab])(pane);
  };

  // ---------------------------------------------------------------- design
  function design(pane) {
    const sel = (kind, key, label, blank) => `<label class="field"><span>${label}</span><select data-style="${key}">${blank ? '<option value="">same as carcass</option>' : '<option value="">— choose —</option>'}${namesOf(optList, kind).map((n) => `<option ${spec.style[key] === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
    pane.innerHTML = `<div class="kgrid"><div class="card"><div style="display:flex;gap:8px;align-items:center"><h3 style="margin:0">Drawing</h3><span class="grow"></span><div class="seg"><button data-v="elev" class="${view === 'elev' ? 'on' : ''}">Front</button><button data-v="plan" class="${view === 'plan' ? 'on' : ''}">Plan</button></div></div><div id="draw" style="margin-top:8px;overflow-x:auto"></div></div><div id="sum" class="card"></div></div>
      <div style="margin-top:14px">
        <div class="card"><div class="form" style="grid-template-columns:repeat(3,1fr)">
          <label class="field"><span>Kitchen name</span><input id="kname" value="${esc(k.name)}"></label><label class="field"><span>Client</span><input id="kclient" value="${esc(k.client || '')}"></label>
          <label class="field"><span>Order / invoice</span><input id="korder" value="${esc(k.order_inv || '')}"></label>
          ${sel('panel', 'carcass', 'Carcass board')}${sel('panel', 'door', 'Doors & drawer fronts', true)}${sel('panel', 'back', 'Back panels', true)}
          ${sel('handle', 'handle', 'Handle')}${sel('hinge', 'hinge', 'Hinges')}${sel('drawer', 'drawer', 'Drawers')}
          <label class="field"><span>Door colour (drawing &amp; sheets)</span><select data-style="door_colour"><option value="">— not set —</option>${(S.settings.colours || []).map((c) => `<option ${spec.style.door_colour === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>${sel('glass', 'glass', 'Glazed doors')}${sel('profile_colour', 'profile_in', 'Profile colour (inside)')}${sel('profile_colour', 'profile_out', 'Profile colour (outside)')}
          <label class="field"><span>Status</span><select id="kstatus">${['draft', 'quoted', 'approved', 'in production', 'installed'].map((s) => `<option ${k.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>
          <details style="margin-top:10px"><summary style="cursor:pointer;font-weight:600">Board and layout settings</summary><div class="form" style="grid-template-columns:repeat(4,1fr);margin-top:8px">${[['t', 'Board thickness cm'], ['back_t', 'Back thickness cm'], ['plinth', 'Plinth height cm'], ['wall_height', 'Wall units start at cm'], ['sheet_w', 'Sheet width cm'], ['sheet_h', 'Sheet height cm'], ['kerf', 'Saw kerf cm'], ['gap', 'Door gap cm']].map(([key, l]) => `<label class="field"><span>${l}</span><input type="number" step="any" data-style="${key}" value="${spec.style[key]}"></label>`).join('')}</div></details></div>
        <div id="runs"></div><div style="margin-top:10px"><button class="btn" id="addRun">+ Add a wall / run</button></div>
        <div class="card" style="margin-top:14px"><label class="field"><span>Notes for the workshop</span><textarea id="knotes" rows="3">${esc(k.notes || '')}</textarea></label></div>
      </div>`;
    const redrawSide = () => {
      $('#draw', pane).innerHTML = view === 'plan' ? planSVG(spec, model, { maxW: 980 }) : elevationSVG(spec, { maxW: 980 });
      const m = model.meters; const ct = model.tops; const p = worker ? null : priceKitchen(model, opts);
      $('#sum', pane).innerHTML = `<div class="k muted" style="font-size:12px;text-transform:uppercase">Summary</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-top:6px"><span>Base cabinets</span><b>${fq(m.base)} m <span class="muted">(${m.base_n})</span></b><span>Wall cabinets</span><b>${fq(m.wall)} m <span class="muted">(${m.wall_n})</span></b><span>Tall units</span><b>${fq(m.tall)} m <span class="muted">(${m.tall_n})</span></b><span>Countertop</span><b>${fq(ct.run_m)} m · ${fq(Math.round(ct.area_m2 * 100) / 100)} m²</b><span>Boards</span><b>${model.sheets.carcass.sheets.length + model.sheets.door.sheets.length + model.sheets.back.sheets.length} sheets</b>${p ? `<span>Cost estimate</span><b>${p.cost ? 'BD ' + money(p.cost, 2) : '<span class="muted">enter prices</span>'}</b><span>Suggested price</span><b style="font-size:16px">${p.suggested ? 'BD ' + money(p.suggested, 2) : '—'}</b>` : ''}</div>`;
    };
    $$('[data-v]', pane).forEach((b) => (b.onclick = () => { view = b.dataset.v; sessionStorage.setItem('kv', view); $$('[data-v]', pane).forEach((x) => x.classList.toggle('on', x === b)); redrawSide(); }));
    const bind = (id2, f) => { const e = $(id2, pane); e.oninput = () => { f(e.value); dirty = true; $('#save', root).textContent = 'Save changes ●'; $('h1', root).textContent = k.name; }; };
    bind('#kname', (v) => (k.name = v)); bind('#kclient', (v) => (k.client = v)); bind('#korder', (v) => (k.order_inv = v)); bind('#knotes', (v) => (k.notes = v));
    $('#kstatus', pane).onchange = (e) => { k.status = e.target.value; touch(); };
    $$('[data-style]', pane).forEach((e) => (e.onchange = () => { spec.style[e.dataset.style] = e.tagName === 'SELECT' ? e.value : num(e.value); touch(); redrawSide(); }));
    const presetsList = () => optList.filter((o) => o.kind === 'preset');
    const typeOpts = (sel) => Object.entries(CAB_TYPES).map(([t, v]) => `<option value="${t}" ${sel === t ? 'selected' : ''}>${v.label}</option>`).join('');
    const drawRuns = () => {
      $('#runs', pane).innerHTML = spec.runs.map((run, ri) => {
        const tot = run.cabinets.reduce((a, c) => a + (+c.w || 0), 0);
        return `<div class="card" style="margin-top:12px" data-run="${ri}"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input data-rn style="max-width:220px;font-weight:700" value="${esc(run.name || '')}" placeholder="Run name"><span class="muted">${tot} cm</span><label style="display:flex;gap:4px;align-items:center;font-size:12px" title="A free-standing run in the middle of the room"><input type="checkbox" data-island ${run.island ? 'checked' : ''} style="width:auto"> Island</label>${run.island ? `<label style="display:flex;gap:4px;align-items:center;font-size:12px">seating overhang <input data-over type="number" step="any" value="${run.overhang ?? 30}" style="width:64px"> cm</label>` : ''}<span class="grow"></span><select data-preset style="width:150px" title="Add a saved cabinet"><option value="">+ From preset…</option>${presetsList().map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select>${['base', 'drawers', 'sink', 'hob', 'corner', 'wall', 'tall', 'gap'].map((t) => `<button class="btn sm" data-add="${t}">+ ${CAB_TYPES[t].label.split(' ')[0]}</button>`).join('')}<button class="btn sm danger" data-rmrun title="Delete this run">Delete run</button></div>
          <div class="items-wrap"><table class="items" style="min-width:720px;margin-top:6px"><thead><tr><th></th><th>Type</th><th>Label</th><th>W</th><th>H</th><th>D</th><th>Doors</th><th>Drawers</th><th>Shelves</th><th>Glazed</th><th></th></tr></thead><tbody>${run.cabinets.map((c, ci) => `<tr data-c="${ci}"><td class="n">${ci + 1}</td><td><select data-f="type" style="width:130px">${typeOpts(c.type)}</select></td><td><input data-f="label" value="${esc(c.label || '')}" style="width:80px"></td>${['w', 'h', 'd', 'doors', 'drawers', 'shelves', 'glazed'].map((f) => `<td><input data-f="${f}" type="number" step="any" class="w-q" value="${c[f] ?? 0}"></td>`).join('')}<td style="white-space:nowrap"><button class="btn sm" data-savepreset title="Save this cabinet as a preset">★</button><button class="btn sm" data-mv="-1" title="Move left">←</button><button class="btn sm" data-mv="1" title="Move right">→</button><button class="btn sm" data-dup title="Duplicate">⧉</button><button class="btn sm danger" data-rm>×</button></td></tr>`).join('') || '<tr><td colspan="11" class="muted" style="padding:10px">No cabinets yet — use the + buttons above.</td></tr>'}</tbody></table></div></div>`;
      }).join('');
      redrawSide();
    };
    const runsEl = $('#runs', pane);
    runsEl.addEventListener('input', (e) => {
      const tr = e.target.closest('tr[data-c]'); const card = e.target.closest('[data-run]'); if (!card) return; const run = spec.runs[Number(card.dataset.run)];
      if (e.target.matches('[data-rn]')) { run.name = e.target.value; touch(); redrawSide(); return; }
      if (e.target.matches('[data-over]')) { run.overhang = num(e.target.value); touch(); redrawSide(); return; }
      if (!tr || !e.target.dataset.f) return; const f = e.target.dataset.f; const c = run.cabinets[Number(tr.dataset.c)];
      c[f] = ['label'].includes(f) ? e.target.value : e.target.tagName === 'SELECT' ? e.target.value : num(e.target.value);
      touch(); redrawSide();
    });
    runsEl.addEventListener('change', (e) => {
      const card = e.target.closest('[data-run]'); const run = card && spec.runs[Number(card.dataset.run)];
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

  // ---------------------------------------------------------------- cut list
  function cuts(pane) {
    const sty = spec.style; const mats = [['carcass', `Carcass — ${sty.carcass || 'board not chosen'}`], ['door', `Doors & fronts — ${sty.door || sty.carcass || 'board not chosen'}`], ['back', `Backs — ${sty.back || sty.carcass || 'board not chosen'}`]];
    const hw = model.hw; const t = (r) => `<tr><td>${esc(r.label)}</td><td class="num">${fq(r.w)} × ${fq(r.h)}</td><td class="num">${r.qty}</td><td class="num">${r.edge ? fq(r.edge) : ''}</td></tr>`;
    const group = (arr) => { const m = new Map(); for (const p of arr) { const key = `${p.label.replace(/^.* · /, '')}|${p.w}|${p.h}|${p.edge}`; const e = m.get(key) || { ...p, label: p.label.replace(/^.* · /, ''), qty: 0 }; e.qty += p.qty; m.set(key, e); } return [...m.values()]; };
    pane.innerHTML = `<div class="cards"><div class="card stat"><div class="k">Carcass sheets</div><div class="v">${model.sheets.carcass.sheets.length}</div></div><div class="card stat"><div class="k">Door sheets</div><div class="v">${model.sheets.door.sheets.length}</div></div><div class="card stat"><div class="k">Back sheets</div><div class="v">${model.sheets.back.sheets.length}</div></div><div class="card stat"><div class="k">Edge banding</div><div class="v">${fq(Math.round(model.edge_m * 10) / 10)} m</div></div></div>
      ${mats.map(([m, title]) => `<div class="card" style="margin-bottom:14px"><div style="display:flex;gap:8px;align-items:center"><h3 style="margin:0">${esc(title)}</h3><span class="grow"></span><span class="muted">${model.sheets[m].sheets.length} sheet(s) of ${sty.sheet_w}×${sty.sheet_h} · ${fq(Math.round(model.sheets[m].area * 100) / 100)} m² of parts${model.sheets[m].sheets.length ? ' · ' + Math.round((model.sheets[m].area * 10000) / (model.sheets[m].sheets.length * sty.sheet_w * sty.sheet_h) * 100) + '% used' : ''}</span></div>
        ${model.panels[m].length ? `<table class="grid" style="margin-top:8px"><thead><tr><th>Part</th><th class="num">Size cm</th><th class="num">Qty</th><th class="num">Edge band cm each</th></tr></thead><tbody>${group(model.panels[m]).map(t).join('')}</tbody></table><details style="margin-top:8px"><summary style="cursor:pointer;font-weight:600">Show how the sheets are cut</summary><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:8px">${model.sheets[m].sheets.map((s, i) => `<div><div class="muted" style="font-size:12px">Sheet ${i + 1} — ${Math.round(s.used * 100)}% used</div>${sheetSVG(s, sty.sheet_w, sty.sheet_h, { width: 360 })}</div>`).join('')}</div>${model.sheets[m].unfit.length ? `<p class="err">Does not fit a sheet: ${model.sheets[m].unfit.map((p) => `${p.label} ${p.w}×${p.h}`).join(', ')}</p>` : ''}</details>` : '<p class="muted">Nothing in this group yet.</p>'}</div>`).join('')}
      <div class="cols2" style="align-items:start"><div class="card"><h3>Hardware</h3><table class="grid"><tbody><tr><td>Hinges ${sty.hinge ? `<span class="muted">${esc(sty.hinge)}</span>` : ''}</td><td class="num">${hw.hinges}</td></tr><tr><td>Drawer sets ${sty.drawer ? `<span class="muted">${esc(sty.drawer)}</span>` : ''}</td><td class="num">${hw.slides}</td></tr><tr><td>Handles ${sty.handle ? `<span class="muted">${esc(sty.handle)}</span>` : ''}</td><td class="num">${hw.handles} <span class="muted">(${fq(Math.round(hw.handleLen) / 100)} m)</span></td></tr><tr><td>Plinth legs</td><td class="num">${hw.legs}</td></tr><tr><td>Wall hangers</td><td class="num">${hw.hangers}</td></tr><tr><td>Shelf pins</td><td class="num">${hw.pins}</td></tr></tbody></table></div>
      <div class="card"><h3>Glazed doors</h3>${model.glass.length ? `<table class="grid"><thead><tr><th>Glass (${esc(sty.glass || '—')})</th><th class="num">Size</th><th class="num">Qty</th></tr></thead><tbody>${model.glass.map((g) => `<tr><td>Door glass</td><td class="num">${g.w} × ${g.h}</td><td class="num">${g.qty}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No glazed doors.</p>'}</div></div>`;
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
    const tbl = (arr) => { const mm = new Map(); for (const p of arr) { const key = `${p.label.replace(/^.* · /, '')}|${p.w}|${p.h}`; const e = mm.get(key) || { ...p, label: p.label.replace(/^.* · /, ''), qty: 0 }; e.qty += p.qty; mm.set(key, e); } return [...mm.values()].map((r) => `<tr><td>${esc(r.label)}</td><td class="n">${fq(r.w)} × ${fq(r.h)}</td><td class="n">${r.qty}</td></tr>`).join(''); };
    pane.innerHTML = `<div class="printbar"><button class="btn primary" id="print">Print / Save as PDF</button></div><div class="doc">${docHeader('KITCHEN PRODUCTION SHEET')}
      <div class="meta"><div><b>Kitchen:</b> ${esc(k.name)}</div><div><b>DATE:</b> ${dmy(today())}</div><div><b>Client:</b> ${esc(k.client || '')}</div><div><b>Order:</b> ${esc(k.order_inv || k.quote_no || '')}</div></div>
      <p style="margin:4px 0"><b>Boards:</b> ${esc(sty.carcass || '—')}${sty.door && sty.door !== sty.carcass ? ` · doors ${esc(sty.door)}` : ''} &nbsp; <b>Door colour:</b> ${esc(sty.door_colour || '—')} &nbsp; <b>Handle:</b> ${esc(sty.handle || '—')} &nbsp; <b>Hinges:</b> ${esc(sty.hinge || '—')} &nbsp; <b>Drawers:</b> ${esc(sty.drawer || '—')} &nbsp; <b>Profile:</b> ${esc(sty.profile_in || '—')} / ${esc(sty.profile_out || '—')}${spec.counter.material ? ` &nbsp; <b>Countertop:</b> ${esc(spec.counter.material)} ${spec.counter.thickness} cm` : ''}</p>
      ${k.notes ? `<p style="padding:6px 8px;background:#f2f4f8;border-radius:4px"><b>Notes:</b> ${esc(k.notes)}</p>` : ''}
      <div style="color:#111">${elevationSVG(spec, { maxW: 700 })}</div>
      <h4>Cabinets</h4><table><thead><tr><th>Run</th><th>#</th><th>Type</th><th class="n">W × H × D</th><th class="n">Doors</th><th class="n">Drawers</th><th class="n">Shelves</th></tr></thead><tbody>${spec.runs.flatMap((r) => r.cabinets.map((c, i) => `<tr><td>${esc(r.name || '')}</td><td>${i + 1}</td><td>${esc((CAB_TYPES[c.type] || {}).label || c.type)}${c.label ? ' · ' + esc(c.label) : ''}</td><td class="n">${c.w} × ${c.h} × ${c.d}</td><td class="n">${c.doors || ''}${c.glazed ? ` (${c.glazed} glazed)` : ''}</td><td class="n">${c.drawers || ''}</td><td class="n">${c.shelves || ''}</td></tr>`)).join('')}</tbody></table>
      ${['carcass', 'door', 'back'].map((mm) => (model.panels[mm].length ? `<h4>${{ carcass: 'Carcass boards', door: 'Doors & drawer fronts', back: 'Back panels' }[mm]} <span style="font-weight:400">— ${model.sheets[mm].sheets.length} sheet(s)</span></h4><table><thead><tr><th>Part</th><th class="n">Size cm</th><th class="n">Qty</th></tr></thead><tbody>${tbl(model.panels[mm])}</tbody></table>` : '')).join('')}
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
