import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, qty as fq, num, toast, guard, confirmBox } from '../ui.js';
import { canWrite } from '../perm.js';
import { computeModel, modelCost } from '../calc.js';
import { drawModel, KINDS } from '../drawings.js';
import { LEAF_TYPES, newLayout, isDivider, leaves, dividers, split, merge, setType, setFraction, layoutToSpec } from '../designer.js';
import { isRubber } from '../stock.js';
import { TYPE_LABEL, glazingFits, glazingNote, thicknessRange, mmOf, BEADS } from '../glazing.js';

export async function render(el, [id]) {
  if (id) return editor(el, id === 'new' ? null : Number(id));
  const groups = {};
  for (const m of S.models) (groups[m.category || 'Other'] ||= []).push(m);
  el.innerHTML = `<div class="ph"><h1>Models</h1><span class="sub">Window &amp; door templates — a drawing plus the formulas that turn any W×H into cut lengths, glass sizes and accessories</span><span class="grow"></span>${canWrite(S.me?.role, 'models') ? '<a class="btn primary" href="#/models/new">+ New model</a>' : ''}</div>` +
    (Object.keys(groups).length ? Object.entries(groups).map(([g, ms]) => `<h3 style="margin:18px 0 8px">${esc(g)}</h3><div class="mgrid">${ms.map((m) => `<a class="card mcard" href="#/models/${m.id}" style="color:inherit">${drawModel(m.kind, m.def_w, m.def_h, { dims: false, layout: m.spec?.layout })}<b>${esc(m.name)}</b><span class="muted">${esc(m.series || '')} · ${fq(m.def_w)} × ${fq(m.def_h)} cm</span></a>`).join('')}</div>`).join('') : '<div class="card muted">No models yet.</div>');
}

const BLANK = () => ({ name: '', series: '', kind: 'fix', category: 'Window', def_w: 100, def_h: 100, note: '', spec: { match: '', params: {}, vars: [], profiles: [], glass: [], accessories: [] } });

async function editor(el, id) {
  const m = id ? structuredClone(S.models.find((x) => x.id === id)) : BLANK();
  if (!m) { el.innerHTML = '<p class="err">Model not found.</p>'; return; }
  m.spec ||= {}; for (const k of ['vars', 'profiles', 'glass', 'accessories']) m.spec[k] ||= [];
  const test = { w: m.def_w || 100, h: m.def_h || 100, glass: S.glass_types[0]?.id || '', colour: '' };
  const lib = () => ({ profiles: S.profiles, accessories: S.accessories });

  el.innerHTML = `<div class="ph"><h1>${id ? esc(m.name) : 'New model'}</h1><span class="grow"></span><a class="btn" href="#/models">← All models</a></div>
  <div class="cols2" style="align-items:start">
   <div>
    <div class="card"><div class="form">
      <label class="field"><span>Name</span><input id="name" value="${esc(m.name)}"></label>
      <label class="field"><span>Series / system</span><input id="series" value="${esc(m.series || '')}" placeholder="45 Series"></label>
      <label class="field"><span>Drawing</span><select id="kind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${m.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Category</span><select id="category">${[...new Set(['Window', 'Door', 'Shower & Glass', 'Partition', 'Railing', 'Curtain wall', 'Mirror', 'Other', ...S.models.map((x) => x.category), m.category].filter(Boolean))].map((c) => `<option ${m.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="field"><span>Default width (cm)</span><input id="def_w" type="number" step="any" value="${m.def_w ?? ''}"></label>
      <label class="field"><span>Default height (cm)</span><input id="def_h" type="number" step="any" value="${m.def_h ?? ''}"></label>
      <label class="field full"><span>Auto-link to price-list items containing…</span><input id="match" value="${esc(m.spec.match || '')}" placeholder="e.g. Single Hinged window 45"><small>When you pick a price-list item whose name contains this text in a quotation, this model is attached automatically.</small></label>
      <label class="field full"><span>Glazing system (Balexco 45 chart)</span><select id="gtype"><option value="">— not used —</option>${Object.entries(TYPE_LABEL).map(([k, l]) => `<option value="${k}" ${m.spec.glazing?.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select><small>With a type chosen, quotations and cutting lists pick the glazing bead and gasket pair for the glass thickness and add the gasket metres.</small></label>
      <label class="field full"><span>Notes</span><textarea id="note" rows="2">${esc(m.note || '')}</textarea></label>
    </div></div>
    <div class="card" id="designer" hidden></div>
    <div class="card spec-sec" id="spec"></div>
    <div class="sticky-actions"><button class="btn primary" id="save">Save model</button>${id ? '<button class="btn" id="dup">Duplicate</button><button class="btn danger" id="del">Delete</button>' : ''}</div>
   </div>
   <div style="position:sticky;top:12px">
    <div class="card"><h3>Live preview</h3>
      <div class="form" style="grid-template-columns:1fr 1fr;margin-bottom:10px"><label class="field"><span>Width cm</span><input id="tw" type="number" step="any" value="${test.w}"></label><label class="field"><span>Height cm</span><input id="th" type="number" step="any" value="${test.h}"></label><label class="field"><span>Colour</span><select id="tc"><option value="">— default —</option>${(S.settings.colours || []).map((c) => `<option>${esc(c)}</option>`).join('')}</select></label><label class="field"><span>Glass</span><select id="tg">${S.glass_types.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label></div>
      <div class="draw" id="draw" style="text-align:center"></div><div id="calc"></div></div>
   </div>
  </div>`;

  const profOpt = (sel) => `<option value="">— profile —</option>` + S.profiles.map((p) => `<option value="${p.id}" ${Number(sel) === p.id ? 'selected' : ''}>${esc(p.series || '')} · ${esc(p.name)}${p.code ? ' (' + esc(p.code) + ')' : ''}</option>`).join('');
  const accOpt = (sel) => `<option value="">— accessory —</option>` + S.accessories.map((a) => `<option value="${a.id}" ${Number(sel) === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  const SECS = [
    { key: 'vars', title: 'Derived sizes', hint: 'Optional named values you can reuse below, e.g. LEAF = W/2', cols: [['name', 'Name', 'text', 'LEAF'], ['expr', 'Formula', 'text', 'W/2']] },
    { key: 'profiles', title: 'Aluminium profile pieces', hint: 'Cut length formula uses W and H in cm (e.g. W-4.4). Qty can also be a formula.', cols: [['label', 'Piece', 'text', 'Frame – height'], ['profile_id', 'Profile', 'prof'], ['len', 'Length', 'text', 'H'], ['qty', 'Qty', 'text', '2']] },
    { key: 'glass', title: 'Glass panes', hint: 'Pane size formulas in cm.', cols: [['label', 'Pane', 'text', 'Sash pane'], ['w', 'Width', 'text', 'W-14'], ['h', 'Height', 'text', 'H-14'], ['qty', 'Qty', 'text', '1']] },
    { key: 'accessories', title: 'Accessories & hardware', hint: 'Quantity formula, e.g. (W+H)*2/100 for metres of gasket.', cols: [['label', 'Item', 'text', 'Hinges'], ['accessory_id', 'Accessory', 'acc'], ['qty', 'Qty', 'text', '2']] },
  ];
  const drawSpec = () => {
    $('#spec', el).innerHTML = SECS.map((s) => `<div class="spec-sec"><h4>${s.title}</h4><div class="muted" style="font-size:12px;margin-bottom:4px">${s.hint}</div><table class="mini" data-sec="${s.key}"><thead><tr>${s.cols.map((c) => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead><tbody>${m.spec[s.key].map((r, i) => `<tr data-i="${i}">${s.cols.map(([k, , t, ph]) => `<td>${t === 'prof' ? `<select data-k="${k}">${profOpt(r[k])}</select>` : t === 'acc' ? `<select data-k="${k}">${accOpt(r[k])}</select>` : `<input data-k="${k}" value="${esc(r[k] ?? '')}" placeholder="${esc(ph || '')}">`}</td>`).join('')}<td><button class="btn sm danger" data-rm>×</button></td></tr>`).join('')}</tbody></table><button class="btn sm" data-add="${s.key}" style="margin-top:4px">+ Add row</button></div>`).join('');
  };
  const preview = () => {
    const model = { ...m, spec: { ...m.spec, params: {} } };
    const g = S.glass_types.find((x) => x.id === Number(test.glass));
    $('#draw', el).innerHTML = drawModel($('#kind', el).value, test.w, test.h, { colour: test.colour, glass: g?.name || '', layout: m.spec.layout });
    const r = computeModel(model, test.w, test.h, lib());
    const cost = modelCost(model, test.w, test.h, lib(), g);
    const f = (v) => (Number.isFinite(v) ? fq(Math.round(v * 100) / 100) : '<span class="err">?</span>');
    $('#calc', el).innerHTML = `
      ${r.profiles.length ? `<table class="grid" style="margin-top:8px"><thead><tr><th>Piece</th><th class="num">Length</th><th class="num">Qty</th></tr></thead><tbody>${r.profiles.map((p) => `<tr><td>${esc(p.label)}<div class="muted" style="font-size:11px">${esc(p.profile?.name || '—')}</div></td><td class="num">${f(p.length)}</td><td class="num">${f(p.qty)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${r.glass.length ? `<table class="grid" style="margin-top:8px"><thead><tr><th>Glass</th><th class="num">W × H</th><th class="num">Qty</th></tr></thead><tbody>${r.glass.map((p) => `<tr><td>${esc(p.label)}</td><td class="num">${f(p.w)} × ${f(p.h)}</td><td class="num">${f(p.qty)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${r.accessories.length ? `<table class="grid" style="margin-top:8px"><thead><tr><th>Accessory</th><th class="num">Qty</th></tr></thead><tbody>${r.accessories.map((p) => `<tr><td>${esc(p.accessory?.name || p.label)}</td><td class="num">${f(p.qty)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${(() => { const rb = r.accessories.filter((a) => isRubber(a.accessory || { name: a.label })); if (!rb.length) return ''; const tot = rb.reduce((t, a) => t + (Number(a.qty) || 0) * (Number(a.accessory?.price) || 0), 0); return `<p style="margin-top:8px"><b>Rubber / gaskets:</b> ${rb.map((a) => `${esc(a.accessory?.name || a.label)} ${f(a.qty)} ${esc(a.accessory?.unit || 'm')}`).join(' · ')} — cost ≈ BD ${money(tot, 2)}</p>`; })()}
      <div id="fit"></div>
      <p class="muted" style="margin-top:8px">${cost.total ? `Material cost ≈ BD ${money(cost.total, 2)} (profiles ${money(cost.profiles, 2)} · glass ${money(cost.glass, 2)} · accessories ${money(cost.accessories, 2)})` : 'Enter prices in Profiles, Glass &amp; Accessories to see a material cost estimate.'}</p>`;
    fitPanel();
  };
  const fitPanel = () => {
    const box = $('#fit', el); if (!box) return; const type = m.spec.glazing?.type; if (!type) { box.innerHTML = ''; return; }
    const g = S.glass_types.find((x) => x.id === Number(test.glass)); const gn = glazingNote(m, g); const r = thicknessRange(type);
    box.innerHTML = `<div style="margin-top:10px;padding:8px 10px;background:var(--soft);border-radius:6px;font-size:13px"><b>Glazing</b> — holds glass ${r ? r[0] + '–' + r[1] : ''} mm<div style="margin-top:4px;${gn && !gn.best ? 'color:var(--bad)' : ''}">${gn ? esc(gn.text) : 'Choose a glass type with a thickness (for example “6mm”) to see the bead and gaskets.'}</div>${gn?.fits?.length > 1 ? `<table class="grid" style="margin-top:6px"><thead><tr><th>Bead</th><th>Gaskets (outer + inner)</th></tr></thead><tbody>${gn.fits.map((f) => `<tr><td>${f.bead} mm · ${f.codes.join(' / ')}</td><td>${f.outer} + ${f.inner} → ${f.outerCode} + ${f.innerCode}</td></tr>`).join('')}</tbody></table>` : ''}</div>`;
  };
  const designer = () => {
    const box = $('#designer', el); const on = $('#kind', el).value === 'custom'; box.hidden = !on; if (!on) return;
    const lay = (m.spec.layout ||= newLayout());
    const ls = leaves(lay); const ds = dividers(lay);
    box.innerHTML = `<h3>Design with dividers</h3><div class="muted" style="font-size:12px;margin-bottom:8px">Start with one pane, split it with a vertical or horizontal divider, then choose how each pane works. “F” marks fixed glass.</div>
      <table class="mini"><thead><tr><th>Pane</th><th>Type</th><th>Split into</th><th></th></tr></thead><tbody>${ls.map((l, i) => `<tr data-p="${l.path}"><td>${i + 1}</td><td><select data-ty>${Object.entries(LEAF_TYPES).map(([k, t]) => `<option value="${k}" ${l.t === k ? 'selected' : ''}>${t}</option>`).join('')}</select></td><td><button class="btn sm" data-sp="v">| Vertical</button> <button class="btn sm" data-sp="h">— Horizontal</button></td><td></td></tr>`).join('')}</tbody></table>
      ${ds.length ? `<h4 style="margin-top:10px">Dividers</h4><table class="mini"><tbody>${ds.map((d, i) => `<tr data-p="${d.path}"><td>${d.d === 'v' ? 'Vertical' : 'Horizontal'} ${i + 1}</td><td><input type="range" min="5" max="95" value="${Math.round(d.f * 100)}" data-fr> <span>${Math.round(d.f * 100)}%</span></td><td><button class="btn sm danger" data-mg>Remove</button></td></tr>`).join('')}</tbody></table>` : ''}
      <div style="margin-top:10px"><button class="btn sm" id="genSpec">Generate cut formulas for this design</button> <small class="muted">Replaces the profile, glass and accessory rows below using the first frame / sash / divider profile you pick in each pane list — check the lengths afterwards.</small></div>`;
  };
  $('#designer', el).addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-p]'); const path = tr?.dataset.p;
    if (e.target.dataset.sp) { m.spec.layout = split(m.spec.layout, path, e.target.dataset.sp); designer(); preview(); }
    else if (e.target.matches('[data-mg]')) { m.spec.layout = merge(m.spec.layout, path); designer(); preview(); }
    else if (e.target.id === 'genSpec') {
      const byName = (re) => S.profiles.find((p) => re.test(p.name))?.id || S.profiles[0]?.id || '';
      const accBy = (re) => S.accessories.find((a) => re.test(a.name))?.id || '';
      const sp = layoutToSpec(m.spec.layout, { frame: byName(/frame/i), sash: byName(/sash|shutter/i), mullion: byName(/mullion|divid|bar/i) }, { hinge: accBy(/hinge/i), handle: accBy(/handle/i), roller: accBy(/roller/i), lock: accBy(/lock/i), silicone: accBy(/silicone/i), pile: accBy(/pile/i), rubber: accBy(/gasket|rubber/i) });
      m.spec.params = { ...sp.params, ...m.spec.params }; m.spec.vars = sp.vars; m.spec.profiles = sp.profiles; m.spec.glass = sp.glass; m.spec.accessories = sp.accessories;
      drawSpec(); preview(); toast('Formulas generated — pick the right profile for each row');
    }
  });
  $('#designer', el).addEventListener('change', (e) => { if (e.target.matches('[data-ty]')) { m.spec.layout = setType(m.spec.layout, e.target.closest('tr').dataset.p, e.target.value); preview(); } });
  $('#designer', el).addEventListener('input', (e) => { if (e.target.matches('[data-fr]')) { m.spec.layout = setFraction(m.spec.layout, e.target.closest('tr').dataset.p, Number(e.target.value) / 100); e.target.nextElementSibling.textContent = e.target.value + '%'; preview(); } });
  drawSpec(); preview(); fitPanel(); designer();
  const readOnly = !canWrite(S.me?.role, 'models');
  if (readOnly) {
    el.insertAdjacentHTML('afterbegin', '<div class="card" style="margin-bottom:12px;border-color:var(--warn)">View only — your account cannot change models.</div>');
    $$('input,select,textarea,#save,#dup,#del,[data-add],[data-rm]', el).filter((x) => !['tw', 'th', 'tg', 'tc'].includes(x.id)).forEach((x) => (x.disabled = true));
  }

  const spec = $('#spec', el);
  spec.addEventListener('input', (e) => { const tr = e.target.closest('tr[data-i]'); if (!tr) return; m.spec[tr.closest('table').dataset.sec][Number(tr.dataset.i)][e.target.dataset.k] = e.target.value; preview(); });
  spec.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') { const tr = e.target.closest('tr[data-i]'); m.spec[tr.closest('table').dataset.sec][Number(tr.dataset.i)][e.target.dataset.k] = e.target.value ? Number(e.target.value) : ''; preview(); } });
  spec.addEventListener('click', (e) => {
    if (e.target.dataset.add) { m.spec[e.target.dataset.add].push(e.target.dataset.add === 'glass' ? { qty: '1' } : { qty: '1' }); drawSpec(); }
    if (e.target.matches('[data-rm]')) { const tr = e.target.closest('tr'); m.spec[tr.closest('table').dataset.sec].splice(Number(tr.dataset.i), 1); drawSpec(); preview(); }
  });
  const origDraw = drawSpec;
  $('#tw', el).oninput = (e) => { test.w = num(e.target.value); preview(); };
  $('#th', el).oninput = (e) => { test.h = num(e.target.value); preview(); };
  $('#tg', el).onchange = (e) => { test.glass = e.target.value; preview(); fitPanel(); };
  $('#gtype', el).onchange = (e) => { m.spec.glazing = e.target.value ? { type: e.target.value } : null; fitPanel(); };
  $('#tc', el).onchange = (e) => { test.colour = e.target.value; preview(); };
  $('#kind', el).onchange = () => { designer(); preview(); };

  const collect = () => ({
    name: $('#name', el).value.trim(), series: $('#series', el).value.trim(), kind: $('#kind', el).value, category: $('#category', el).value,
    def_w: num($('#def_w', el).value), def_h: num($('#def_h', el).value), note: $('#note', el).value, spec: { ...m.spec, match: $('#match', el).value.trim() },
  });
  $('#save', el).onclick = guard(async () => {
    const d = collect(); if (!d.name) return toast('Give the model a name', 'err');
    const s = id ? await api.put(`t/models/${id}`, d) : await api.post('t/models', d);
    await refresh(); toast('Model saved'); if (!id) location.hash = `#/models/${s.id}`;
  });
  if (id) {
    $('#dup', el).onclick = guard(async () => { const d = collect(); d.name += ' (copy)'; const s = await api.post('t/models', d); await refresh(); location.hash = `#/models/${s.id}`; });
    $('#del', el).onclick = guard(async () => { if (await confirmBox(`Delete model "${m.name}"?`)) { await api.del(`t/models/${id}`); await refresh(); location.hash = '#/models'; } });
  }
}
