import { S } from '../app.js';
import { api, $, $$, esc, money, qty as fq, num, toast, guard } from '../ui.js';
import { computeModel, modelCost, nestBars } from '../calc.js';

const r1 = (n) => Math.round(n * 10) / 10;

export async function render(el, [quoteId]) {
  const quotes = await api.get('t/quotes');
  let lines = [{ model_id: S.models[0]?.id || '', w: S.models[0]?.def_w || 100, h: S.models[0]?.def_h || 100, qty: 1, glass_id: S.glass_types[0]?.id || '', label: '' }];
  let title = 'Cutting list';

  const loadQuote = (q) => {
    lines = [];
    let n = 0;
    for (const it of q.items || []) {
      if (it.kind === 'note') continue; n++;
      if (it.model_id && it.w && it.h) lines.push({ model_id: it.model_id, w: it.w, h: it.h, qty: it.qty || 1, glass_id: it.glass_id || S.glass_types[0]?.id || '', label: `#${n}` });
    }
    title = `Cutting list – ${q.number} – ${q.client}`;
    if (!lines.length) toast('None of the items in this quote has a model attached yet — pick a Model on each item first.', 'err');
  };
  if (quoteId) { const q = quotes.find((x) => x.id === Number(quoteId)); if (q) loadQuote(q); }

  el.innerHTML = `<div class="ph noprint"><h1>Cutting List &amp; Glass</h1><span class="sub">Profile cut lengths with bar optimisation, glass sizes and accessories for any set of windows/doors</span></div>
  <div class="card noprint"><div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:12px"><label class="field" style="min-width:260px"><span>Load from quotation</span><select id="qsel"><option value="">— choose —</option>${quotes.map((q) => `<option value="${q.id}" ${String(q.id) === String(quoteId) ? 'selected' : ''}>${esc(q.number)} · ${esc(q.client)}</option>`).join('')}</select></label>
  <label class="field" style="width:130px"><span>Saw kerf (cm)</span><input id="kerf" type="number" step="any" value="${S.settings.bar_kerf ?? 0.5}"></label></div>
  <div class="items-wrap"><table class="items" style="min-width:700px"><thead><tr><th></th><th>Label</th><th>Model</th><th>Width cm</th><th>Height cm</th><th>Qty</th><th>Glass</th><th></th></tr></thead><tbody id="lines"></tbody></table></div>
  <div style="margin-top:10px;display:flex;gap:8px"><button class="btn" id="add">+ Add line</button><span class="grow"></span><button class="btn primary" id="print">Print</button></div></div>
  <div id="out" style="margin-top:16px"></div>`;

  const drawLines = () => {
    $('#lines', el).innerHTML = lines.map((l, i) => `<tr data-i="${i}"><td class="n">${i + 1}</td><td><input data-k="label" value="${esc(l.label)}" style="width:90px"></td>
      <td><select data-k="model_id">${S.models.map((m) => `<option value="${m.id}" ${Number(l.model_id) === m.id ? 'selected' : ''}>${esc(m.name)} (${esc(m.series || '')})</option>`).join('')}</select></td>
      <td><input data-k="w" type="number" step="any" class="w-s" value="${l.w ?? ''}"></td><td><input data-k="h" type="number" step="any" class="w-s" value="${l.h ?? ''}"></td><td><input data-k="qty" type="number" step="1" class="w-q" value="${l.qty ?? 1}"></td>
      <td><select data-k="glass_id"><option value="">—</option>${S.glass_types.map((g) => `<option value="${g.id}" ${Number(l.glass_id) === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></td><td><button class="btn sm danger" data-rm>×</button></td></tr>`).join('');
  };
  const compute = () => {
    const kerf = num($('#kerf', el).value);
    const lib = { profiles: S.profiles, accessories: S.accessories };
    const byProf = {}; const glass = {}; const acc = {}; let cost = 0; const invalid = [];
    for (const l of lines) {
      const m = S.models.find((x) => x.id === Number(l.model_id)); if (!m || !(num(l.w) > 0 && num(l.h) > 0)) continue;
      const r = computeModel(m, l.w, l.h, lib); const n = Math.max(1, Math.round(num(l.qty)));
      const tag = `${l.label || m.name} ${fq(l.w)}×${fq(l.h)}`;
      const g = S.glass_types.find((x) => x.id === Number(l.glass_id));
      cost += modelCost(m, l.w, l.h, lib, g).total * n;
      for (const p of r.profiles) {
        if (!Number.isFinite(p.length) || !Number.isFinite(p.qty)) { invalid.push(`${m.name}: ${p.label}`); continue; }
        const key = p.profile_id || 0;
        const e = (byProf[key] ||= { profile: p.profile, pieces: [] });
        for (let i = 0; i < Math.round(p.qty) * n; i++) e.pieces.push({ length: r1(p.length), tag });
      }
      for (const p of r.glass) {
        if (!Number.isFinite(p.w) || !Number.isFinite(p.h)) continue;
        const key = `${g?.id || 0}|${r1(p.w)}|${r1(p.h)}`;
        const e = (glass[key] ||= { g, w: r1(p.w), h: r1(p.h), qty: 0, tags: new Set() }); e.qty += Math.round(p.qty) * n; e.tags.add(tag);
      }
      for (const a of r.accessories) { if (!Number.isFinite(a.qty)) continue; const key = a.accessory?.id || a.label; const e = (acc[key] ||= { name: a.accessory?.name || a.label, unit: a.accessory?.unit || '', qty: 0, price: a.accessory?.price || 0 }); e.qty += a.qty * n; }
    }
    // --- render
    let html = `<div class="card"><h3>${esc(title)}</h3>`;
    if (invalid.length) html += `<p class="err">Check formulas for: ${esc([...new Set(invalid)].join('; '))}</p>`;
    const profs = Object.values(byProf);
    if (!profs.length) html += '<p class="muted">Add at least one line with a model and size.</p>';
    for (const e of profs) {
      const barLen = e.profile?.bar_length || 600;
      const { bars, unfit } = nestBars(e.pieces, barLen, kerf);
      const totalLen = e.pieces.reduce((s, p) => s + p.length, 0);
      const waste = bars.length ? 1 - totalLen / (bars.length * barLen) : 0;
      html += `<div style="margin:16px 0"><h4 style="margin:0 0 4px">${esc(e.profile ? `${e.profile.series || ''} · ${e.profile.name}${e.profile.code ? ' (' + e.profile.code + ')' : ''}` : 'No profile selected')}</h4>
        <div class="muted">${e.pieces.length} pieces · ${fq(r1(totalLen))} cm total · <b>${bars.length} bars</b> of ${fq(barLen)} cm · waste ${(waste * 100).toFixed(1)}%${e.profile?.price_bar ? ` · cost BD ${money(bars.length * e.profile.price_bar, 2)}` : ''}</div>
        ${unfit.length ? `<p class="err">${unfit.length} piece(s) longer than the bar: ${unfit.map((p) => fq(p.length)).join(', ')}</p>` : ''}
        ${bars.map((b, i) => `<div class="bar-label">Bar ${i + 1} — ${b.pieces.map((p) => fq(p.length)).join(' + ')} <span class="muted">(left ${fq(r1(barLen - b.used))})</span></div><div class="bar">${b.pieces.map((p) => `<i style="width:${(p.length / barLen) * 100}%" title="${esc(p.tag)}: ${p.length}"></i>`).join('')}</div>`).join('')}
        </div>`;
    }
    html += '</div>';
    const gl = Object.values(glass);
    html += `<div class="card" style="margin-top:14px"><h3>Glass</h3>${gl.length ? `<table class="grid"><thead><tr><th>Type</th><th class="num">Width</th><th class="num">Height</th><th class="num">Qty</th><th class="num">Area m²</th><th>For</th></tr></thead><tbody>${gl.sort((a, b) => (a.g?.name || '').localeCompare(b.g?.name || '')).map((e) => `<tr><td>${esc(e.g?.name || '—')}</td><td class="num">${fq(e.w)}</td><td class="num">${fq(e.h)}</td><td class="num">${e.qty}</td><td class="num">${((e.w * e.h * e.qty) / 10000).toFixed(2)}</td><td class="muted">${esc([...e.tags].join(', '))}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">Total</td><td class="num">${gl.reduce((s, e) => s + e.qty, 0)}</td><td class="num">${gl.reduce((s, e) => s + (e.w * e.h * e.qty) / 10000, 0).toFixed(2)}</td><td></td></tr></tfoot></table>` : '<p class="muted">—</p>'}</div>`;
    const ac = Object.values(acc);
    html += `<div class="card" style="margin-top:14px"><h3>Accessories</h3>${ac.length ? `<table class="grid"><thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th></tr></thead><tbody>${ac.map((e) => `<tr><td>${esc(e.name)}</td><td class="num">${fq(Math.ceil(e.qty * 100) / 100)}</td><td>${esc(e.unit)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">—</p>'}</div>`;
    if (cost) html += `<p class="muted">Estimated material cost for these lines (proportional profile use, glass and accessories): BD ${money(cost, 2)}</p>`;
    $('#out', el).innerHTML = html;
  };
  drawLines(); compute();

  $('#lines', el).addEventListener('input', (e) => { const i = Number(e.target.closest('tr').dataset.i); const k = e.target.dataset.k; lines[i][k] = ['w', 'h', 'qty'].includes(k) ? num(e.target.value) : e.target.value; compute(); });
  $('#lines', el).addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') { const i = Number(e.target.closest('tr').dataset.i); lines[i][e.target.dataset.k] = e.target.value; if (e.target.dataset.k === 'model_id') { const m = S.models.find((x) => x.id === Number(e.target.value)); if (m) { lines[i].w = m.def_w; lines[i].h = m.def_h; drawLines(); } } compute(); } });
  $('#lines', el).addEventListener('click', (e) => { if (e.target.matches('[data-rm]')) { lines.splice(Number(e.target.closest('tr').dataset.i), 1); drawLines(); compute(); } });
  $('#add', el).onclick = () => { lines.push({ model_id: S.models[0]?.id || '', w: S.models[0]?.def_w || 100, h: S.models[0]?.def_h || 100, qty: 1, glass_id: S.glass_types[0]?.id || '', label: '' }); drawLines(); compute(); };
  $('#kerf', el).oninput = compute;
  $('#qsel', el).onchange = (e) => { if (e.target.value) location.hash = `#/cutting/${e.target.value}`; };
  $('#print', el).onclick = () => window.print();
}
