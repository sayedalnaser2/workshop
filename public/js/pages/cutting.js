import { S } from '../app.js';
import { api, $, $$, esc, money, qty as fq, num, toast, guard, confirmBox } from '../ui.js';
import { computeModel, modelCost } from '../calc.js';
import { leftoverUnits, nestWithLeftovers, leftoverValue } from '../stock.js';
import { dot } from './stock.js';

const r1 = (n) => Math.round(n * 10) / 10;
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export async function render(el, [quoteId]) {
  const [quotes, stock0] = await Promise.all([api.get('t/quotes'), api.get('t/stock')]);
  let stock = stock0; let quoteNo = '';
  const newLine = () => ({ model_id: S.models[0]?.id || '', w: S.models[0]?.def_w || 100, h: S.models[0]?.def_h || 100, qty: 1, glass_id: S.glass_types[0]?.id || '', label: '', colour: '' });
  let lines = [newLine()]; let title = 'Cutting list'; let useLeft = true; let last = null;

  const loadQuote = (q) => {
    lines = []; quoteNo = q.number; let n = 0;
    for (const it of q.items || []) {
      if (it.kind === 'note') continue; n++;
      if (it.model_id && it.w && it.h) lines.push({ model_id: it.model_id, w: it.w, h: it.h, qty: it.qty || 1, glass_id: it.glass_id || S.glass_types[0]?.id || '', label: `#${n}`, colour: it.colour || q.colour || '' });
    }
    title = `Cutting list – ${q.number} – ${q.client}`;
    if (!lines.length) toast('None of the items in this quote has a model attached yet — pick a Model on each item first.', 'err');
  };
  if (quoteId) { const q = quotes.find((x) => x.id === Number(quoteId)); if (q) loadQuote(q); }
  const colours = S.settings.colours || [];

  el.innerHTML = `<div class="ph noprint"><h1>Cutting List &amp; Glass</h1><span class="sub">Cut lengths with bar optimisation — leftovers are used first, and offcuts can be saved back to stock</span></div>
  <div class="card noprint"><div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:12px"><label class="field" style="min-width:260px"><span>Load from quotation</span><select id="qsel"><option value="">— choose —</option>${quotes.map((q) => `<option value="${q.id}" ${String(q.id) === String(quoteId) ? 'selected' : ''}>${esc(q.number)} · ${esc(q.client)}</option>`).join('')}</select></label>
  <label class="field" style="width:130px"><span>Saw kerf (cm)</span><input id="kerf" type="number" step="any" value="${S.settings.bar_kerf ?? 0.5}"></label>
  <label class="field check" style="margin-bottom:8px"><input type="checkbox" id="useLeft" checked><span>Use leftovers first</span></label></div>
  <datalist id="dl-col">${colours.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
  <div class="items-wrap"><table class="items" style="min-width:760px"><thead><tr><th></th><th>Label</th><th>Model</th><th>Width cm</th><th>Height cm</th><th>Qty</th><th>Glass</th><th>Colour</th><th></th></tr></thead><tbody id="lines"></tbody></table></div>
  <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="add">+ Add line</button><span class="grow"></span><button class="btn" id="commit">Take from stock &amp; save offcuts</button><button class="btn primary" id="print">Print</button></div></div>
  <div id="out" style="margin-top:16px"></div>`;

  const drawLines = () => {
    $('#lines', el).innerHTML = lines.map((l, i) => `<tr data-i="${i}"><td class="n">${i + 1}</td><td><input data-k="label" value="${esc(l.label)}" style="width:80px"></td>
      <td><select data-k="model_id">${S.models.map((m) => `<option value="${m.id}" ${Number(l.model_id) === m.id ? 'selected' : ''}>${esc(m.name)} (${esc(m.series || '')})</option>`).join('')}</select></td>
      <td><input data-k="w" type="number" step="any" class="w-s" value="${l.w ?? ''}"></td><td><input data-k="h" type="number" step="any" class="w-s" value="${l.h ?? ''}"></td><td><input data-k="qty" type="number" step="1" class="w-q" value="${l.qty ?? 1}"></td>
      <td><select data-k="glass_id"><option value="">—</option>${S.glass_types.map((g) => `<option value="${g.id}" ${Number(l.glass_id) === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></td>
      <td><input data-k="colour" list="dl-col" value="${esc(l.colour || '')}" style="width:100px"></td><td><button class="btn sm danger" data-rm>×</button></td></tr>`).join('');
  };

  const compute = () => {
    const kerf = num($('#kerf', el).value);
    const lib = { profiles: S.profiles, accessories: S.accessories };
    const groups = {}; const glass = {}; const acc = {}; let cost = 0; const invalid = [];
    for (const l of lines) {
      const m = S.models.find((x) => x.id === Number(l.model_id)); if (!m || !(num(l.w) > 0 && num(l.h) > 0)) continue;
      const r = computeModel(m, l.w, l.h, lib); const n = Math.max(1, Math.round(num(l.qty)));
      const tag = `${l.label || m.name} ${fq(l.w)}×${fq(l.h)}`;
      const g = S.glass_types.find((x) => x.id === Number(l.glass_id));
      cost += modelCost(m, l.w, l.h, lib, g).total * n;
      for (const p of r.profiles) {
        if (!Number.isFinite(p.length) || !Number.isFinite(p.qty)) { invalid.push(`${m.name}: ${p.label}`); continue; }
        const key = `${p.profile_id || 0}|${(l.colour || '').toLowerCase()}`;
        const e = (groups[key] ||= { profile: p.profile, profile_id: Number(p.profile_id) || 0, colour: l.colour || '', pieces: [] });
        for (let i = 0; i < Math.round(p.qty) * n; i++) e.pieces.push({ length: r1(p.length), tag });
      }
      for (const p of r.glass) {
        if (!Number.isFinite(p.w) || !Number.isFinite(p.h)) continue;
        const key = `${g?.id || 0}|${r1(p.w)}|${r1(p.h)}`;
        const e = (glass[key] ||= { g, w: r1(p.w), h: r1(p.h), qty: 0, tags: new Set() }); e.qty += Math.round(p.qty) * n; e.tags.add(tag);
      }
      for (const a of r.accessories) { if (!Number.isFinite(a.qty)) continue; const key = a.accessory?.id || a.label; const e = (acc[key] ||= { name: a.accessory?.name || a.label, unit: a.accessory?.unit || '', qty: 0 }); e.qty += a.qty * n; }
    }
    // nest each profile+colour group: leftovers first, then new bars
    const res = [];
    for (const e of Object.values(groups)) {
      const barLen = e.profile?.bar_length || 600;
      const units = useLeft && e.profile_id ? leftoverUnits(stock, quoteNo).filter((u) => u.item_type !== 'glass' && u.profile_id === e.profile_id && (!e.colour || same(u.colour, e.colour))) : [];
      const nest = nestWithLeftovers(e.pieces, units, barLen, kerf);
      const inStock = stock.filter((s) => s.kind === 'new' && s.profile_id === e.profile_id && (!e.colour || same(s.colour, e.colour))).reduce((s, r) => s + (r.qty || 0), 0);
      res.push({ ...e, barLen, nest, inStock });
    }
    last = { res, quoteNo };
    let html = `<div class="card"><h3>${esc(title)}</h3>`;
    if (invalid.length) html += `<p class="err">Check formulas for: ${esc([...new Set(invalid)].join('; '))}</p>`;
    if (!res.length) html += '<p class="muted">Add at least one line with a model and size.</p>';
    const minOff = S.settings.min_offcut ?? 30;
    for (const e of res) {
      const { bars, leftoverUsed, unfit } = e.nest;
      const totalLen = e.pieces.reduce((s, p) => s + p.length, 0);
      const barsLen = bars.length * e.barLen; const waste = barsLen ? 1 - bars.reduce((s, b) => s + b.used, 0) / barsLen : 0;
      const offcuts = bars.filter((b) => e.barLen - b.used >= minOff).length + leftoverUsed.filter((u) => u.remaining >= minOff).length;
      html += `<div style="margin:16px 0"><h4 style="margin:0 0 4px">${esc(e.profile ? `${e.profile.series || ''} · ${e.profile.name}${e.profile.code ? ' (' + e.profile.code + ')' : ''}` : 'No profile selected')} ${e.colour ? '· ' + dot(e.colour) : ''}</h4>
        <div class="muted">${e.pieces.length} pieces · ${fq(r1(totalLen))} cm · <b>${bars.length} new bar(s)</b> of ${fq(e.barLen)} cm${leftoverUsed.length ? ` · <b style="color:var(--ok)">${leftoverUsed.length} leftover piece(s) used</b>` : ''} · waste ${(waste * 100).toFixed(1)}%${e.profile?.price_bar ? ` · cost BD ${money(bars.length * e.profile.price_bar, 2)}` : ''} · in new stock: <b class="${e.inStock < bars.length ? 'neg' : ''}">${fq(e.inStock)}</b> · ${offcuts} offcut(s) ≥ ${minOff} cm to save</div>
        ${unfit.length ? `<p class="err">${unfit.length} piece(s) longer than the bar: ${unfit.map((p) => fq(p.length)).join(', ')}</p>` : ''}
        ${leftoverUsed.map((u) => `<div class="bar-label">♻ Leftover ${fq(u.length)} cm (${esc(u.colour || 'no colour')}${u.location ? ', ' + esc(u.location) : ''}) — ${u.cuts.map((p) => fq(p.length)).join(' + ')} <span class="muted">(left ${fq(r1(u.remaining))})</span></div><div class="bar">${u.cuts.map((p) => `<i style="width:${(p.length / u.length) * 100}%;background:var(--ok)" title="${esc(p.tag)}: ${p.length}"></i>`).join('')}</div>`).join('')}
        ${bars.map((b, i) => `<div class="bar-label">Bar ${i + 1} — ${b.pieces.map((p) => fq(p.length)).join(' + ')} <span class="muted">(left ${fq(r1(e.barLen - b.used))})</span></div><div class="bar">${b.pieces.map((p) => `<i style="width:${(p.length / e.barLen) * 100}%" title="${esc(p.tag)}: ${p.length}"></i>`).join('')}</div>`).join('')}</div>`;
    }
    html += '</div>';
    const gl = Object.values(glass);
    html += `<div class="card" style="margin-top:14px"><h3>Glass</h3>${gl.length ? `<table class="grid"><thead><tr><th>Type</th><th class="num">Width</th><th class="num">Height</th><th class="num">Qty</th><th class="num">Area m²</th><th>For</th></tr></thead><tbody>${gl.sort((a, b) => (a.g?.name || '').localeCompare(b.g?.name || '')).map((e) => `<tr><td>${esc(e.g?.name || '—')}</td><td class="num">${fq(e.w)}</td><td class="num">${fq(e.h)}</td><td class="num">${e.qty}</td><td class="num">${((e.w * e.h * e.qty) / 10000).toFixed(2)}</td><td class="muted">${esc([...e.tags].join(', '))}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">Total</td><td class="num">${gl.reduce((s, e) => s + e.qty, 0)}</td><td class="num">${gl.reduce((s, e) => s + (e.w * e.h * e.qty) / 10000, 0).toFixed(2)}</td><td></td></tr></tfoot></table>` : '<p class="muted">—</p>'}</div>`;
    const ac = Object.values(acc);
    html += `<div class="card" style="margin-top:14px"><h3>Accessories</h3>${ac.length ? `<table class="grid"><thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th></tr></thead><tbody>${ac.map((e) => `<tr><td>${esc(e.name)}</td><td class="num">${fq(Math.ceil(e.qty * 100) / 100)}</td><td>${esc(e.unit)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">—</p>'}</div>`;
    if (cost) html += `<p class="muted">Estimated material cost for these lines: BD ${money(cost, 2)}</p>`;
    $('#out', el).innerHTML = html;
  };

  // write the result back to stock: consume leftovers and new bars, keep the offcuts as new leftovers
  const commit = guard(async () => {
    if (!last?.res.some((e) => e.pieces.length)) return toast('Nothing to take from stock yet', 'err');
    const minOff = S.settings.min_offcut ?? 30; const pct = S.settings.leftover_pct ?? 60;
    const nBars = last.res.reduce((s, e) => s + e.nest.bars.length, 0); const nLeft = last.res.reduce((s, e) => s + e.nest.leftoverUsed.length, 0);
    if (!await confirmBox(`Take ${nBars} new bar(s) and ${nLeft} leftover piece(s) out of stock, and save the offcuts of ${minOff} cm or more as new leftovers?`, 'Update stock', 'primary')) return;
    let fresh = await api.get('t/stock'); const short = [];
    const bump = async (row, d) => { const q = Math.max(0, (row.qty || 0) + d); row.qty = q; if (row.kind === 'leftover' && q <= 0) { await api.del(`t/stock/${row.id}`); fresh = fresh.filter((x) => x.id !== row.id); } else await api.put(`t/stock/${row.id}`, { qty: q }); };
    const addLeft = async (e, len) => {
      const L = Math.floor(len); if (L < minOff) return;
      const ex = fresh.find((s) => s.kind === 'leftover' && s.profile_id === e.profile_id && same(s.colour, e.colour) && s.length === L && !s.reserved_for);
      if (ex) return bump(ex, 1);
      const r = await api.post('t/stock', { kind: 'leftover', item_type: 'profile', profile_id: e.profile_id, colour: e.colour, length: L, qty: 1, unit: 'pcs', unit_cost: leftoverValue(e.profile, L, pct), order_inv: last.quoteNo || '', note: `Offcut from ${title}`, date: new Date().toISOString().slice(0, 10) });
      fresh.push(r);
    };
    for (const e of last.res) {
      for (const u of e.nest.leftoverUsed) { const row = fresh.find((x) => x.id === u.id); if (row) await bump(row, -1); await addLeft(e, u.remaining); }
      let need = e.nest.bars.length;
      for (const row of fresh.filter((s) => s.kind === 'new' && s.profile_id === e.profile_id && (!e.colour || same(s.colour, e.colour)) && s.qty > 0)) { const take = Math.min(need, row.qty); if (take > 0) { await bump(row, -take); need -= take; } if (!need) break; }
      if (need) short.push(`${e.profile?.name || 'profile'} ${e.colour || ''} (${need} bar(s))`);
      for (const b of e.nest.bars) await addLeft(e, e.barLen - b.used);
    }
    stock = await api.get('t/stock'); compute();
    toast(short.length ? `Stock updated — not enough new stock for: ${short.join(', ')}` : 'Stock updated and offcuts saved', short.length ? 'err' : 'ok');
  });

  drawLines(); compute();
  $('#lines', el).addEventListener('input', (e) => { const i = Number(e.target.closest('tr').dataset.i); const k = e.target.dataset.k; lines[i][k] = ['w', 'h', 'qty'].includes(k) ? num(e.target.value) : e.target.value; compute(); });
  $('#lines', el).addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') { const i = Number(e.target.closest('tr').dataset.i); lines[i][e.target.dataset.k] = e.target.value; if (e.target.dataset.k === 'model_id') { const m = S.models.find((x) => x.id === Number(e.target.value)); if (m) { lines[i].w = m.def_w; lines[i].h = m.def_h; drawLines(); } } compute(); } });
  $('#lines', el).addEventListener('click', (e) => { if (e.target.matches('[data-rm]')) { lines.splice(Number(e.target.closest('tr').dataset.i), 1); drawLines(); compute(); } });
  $('#add', el).onclick = () => { lines.push(newLine()); drawLines(); compute(); };
  $('#kerf', el).oninput = compute; $('#useLeft', el).onchange = (e) => { useLeft = e.target.checked; compute(); };
  $('#qsel', el).onchange = (e) => { if (e.target.value) location.hash = `#/cutting/${e.target.value}`; };
  $('#print', el).onclick = () => window.print(); $('#commit', el).onclick = commit;
}
