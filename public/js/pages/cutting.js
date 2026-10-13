import { S } from '../app.js';
import { api, $, $$, esc, money, qty as fq, num, today, dmy, toast, guard, confirmBox } from '../ui.js';
import { modelCost } from '../calc.js';
import { leftoverUnits, nestWithLeftovers, leftoverValue, quotePieces, accessoriesFor } from '../stock.js';
import { packSheets } from '../kitchen.js';
import { docHeader, docFooter, L, AR } from '../doc.js';
import { dot } from './stock.js';

const r1 = (n) => Math.round(n * 10) / 10;
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
// pieces of the same type and size always get the same colour, on screen and on paper
const PALETTE = ['#4f81bd', '#c0504d', '#7fae3f', '#8064a2', '#3fa7c0', '#f0883e', '#2c9f8f', '#c9a227', '#b5651d', '#6a7fdb', '#d66ba0', '#8f9a3c', '#e1665a', '#5a8f7b'];
const colourFor = (list) => { const m = new Map(); [...new Set(list)].sort((a, b) => b - a).forEach((v, i) => m.set(v, PALETTE[i % PALETTE.length])); return (v) => m.get(v) || '#888'; };

/** First-fit of glass panes on leftover panes, then the rest on new sheets. Returns what is used, what is scrap and what can be kept. */
function nestGlass(pieces, units, sheet, kerf, minOff) {
  const todo = [...pieces].sort((a, b) => b.w * b.h - a.w * a.h); const fromLeft = []; const rest = [];
  const us = units.map((u) => ({ ...u }));
  for (const p of todo) {
    const u = us.filter((x) => !x.taken && ((x.length >= p.w && x.width >= p.h) || (x.length >= p.h && x.width >= p.w))).sort((a, b) => a.length * a.width - b.length * b.width)[0];
    if (u) { u.taken = true; fromLeft.push({ piece: p, unit: u }); } else rest.push(p);
  }
  const grouped = new Map(); for (const p of rest) { const k = `${p.w}|${p.h}`; const e = grouped.get(k) || { w: p.w, h: p.h, qty: 0, label: p.tag }; e.qty++; grouped.set(k, e); }
  const pk = packSheets([...grouped.values()], sheet.w, sheet.h, kerf);
  const total = sheet.w * sheet.h; const offcuts = []; let scrap = 0; let usedArea = 0;
  pk.sheets.forEach((sh, si) => { usedArea += sh.used * total; for (const f of sh.free) { if (Math.min(f.w, f.h) >= minOff) offcuts.push({ ...f, sheet: si }); else scrap += f.w * f.h; } });
  const kerfLoss = Math.max(0, pk.sheets.length * total - usedArea - scrap - offcuts.reduce((a, f) => a + f.w * f.h, 0));
  return { fromLeft, sheets: pk.sheets, unfit: pk.unfit, offcuts, scrapArea: (scrap + kerfLoss) / 10000, usedArea: usedArea / 10000, sheetArea: (pk.sheets.length * total) / 10000 };
}

/** One sheet drawn with its panes (same size = same colour), offcuts to keep (green) and scrap (hatched). */
function glassSheetSVG(sh, sw, shh, colourOf, minOff, width = 460) {
  const k = width / sw; const H = shh * k;
  const items = sh.items.map((i) => `<rect x="${i.x * k}" y="${i.y * k}" width="${i.w * k}" height="${i.h * k}" fill="${colourOf(`${Math.max(i.w, i.h)}x${Math.min(i.w, i.h)}`)}" fill-opacity=".75" stroke="#26435f" stroke-width=".8"/>${i.w * k > 40 && i.h * k > 18 ? `<text x="${i.x * k + 3}" y="${i.y * k + 12}" font-size="9.5" fill="#111" font-weight="600">${i.w}×${i.h}</text>` : ''}`).join('');
  const free = sh.free.map((f) => { const keep = Math.min(f.w, f.h) >= minOff; return `<rect x="${f.x * k}" y="${f.y * k}" width="${f.w * k}" height="${f.h * k}" fill="${keep ? '#d9f0dd' : 'url(#hatch)'}" stroke="${keep ? '#2a8a4a' : '#c0504d'}" stroke-width=".8" ${keep ? 'stroke-dasharray="4 3"' : ''}/>${f.w * k > 60 && f.h * k > 16 ? `<text x="${f.x * k + 3}" y="${f.y * k + 12}" font-size="9" fill="${keep ? '#1f6b3a' : '#a33'}">${keep ? 'keep ' : 'scrap '}${r1(f.w)}×${r1(f.h)}</text>` : ''}`; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${H}" style="width:100%;max-width:${width}px;background:#fff;border:1px solid #ccd3dd;border-radius:4px;color:#111"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#e3a5a0" stroke-width="2"/></pattern></defs><rect width="${width}" height="${H}" fill="#f6f7f9"/>${free}${items}</svg>`;
}

export async function render(el, [quoteId]) {
  const [quotes, stock0] = await Promise.all([api.get('t/quotes'), api.get('t/stock')]);
  let stock = stock0; let quoteNo = ''; let quoteRow = null;
  const newLine = () => ({ model_id: S.models[0]?.id || '', w: S.models[0]?.def_w || 100, h: S.models[0]?.def_h || 100, qty: 1, glass_id: S.glass_types[0]?.id || '', label: '', colour: '', hand: '', swing: '' });
  let lines = [newLine()]; let title = 'Cutting list'; let useLeft = true; let last = null; let showCost = false;
  const sheet = { w: Number(S.settings.glass_sheet?.w) || 321, h: Number(S.settings.glass_sheet?.h) || 225 };

  const loadQuote = (q) => {
    lines = []; quoteNo = q.number; quoteRow = q; let n = 0;
    for (const it of q.items || []) {
      if (it.kind === 'note') continue; n++;
      if (it.model_id && it.w && it.h) lines.push({ model_id: it.model_id, w: it.w, h: it.h, qty: it.qty || 1, glass_id: it.glass_id || '', label: `#${n}`, colour: it.colour || q.colour || '', hand: it.hand || '', swing: it.swing || '' });
    }
    title = `Cutting list – ${q.number} – ${q.client}`;
    if (!lines.length) toast('None of the items in this quote has a model attached yet — pick a Model on each item first.', 'err');
  };
  if (quoteId) { const q = quotes.find((x) => x.id === Number(quoteId)); if (q) loadQuote(q); }
  const colours = S.settings.colours || [];

  el.innerHTML = `<div class="ph noprint"><h1>Cutting List &amp; Glass</h1><span class="sub">Cut lengths and glass sheets with optimisation — leftovers are used first, and offcuts can be saved back to stock</span><span class="grow"></span>${quoteRow ? `<a class="btn" href="#/quotes/${quoteRow.id}">← Back to quotation ${esc(quoteRow.number)}</a>` : ''}</div>
  <div class="card noprint"><div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:12px"><label class="field" style="min-width:260px"><span>Load from quotation</span><select id="qsel"><option value="">— choose —</option>${quotes.map((q) => `<option value="${q.id}" ${String(q.id) === String(quoteId) ? 'selected' : ''}>${esc(q.number)} · ${esc(q.client)}</option>`).join('')}</select></label>
  <label class="field" style="width:110px"><span>Saw kerf (cm)</span><input id="kerf" type="number" step="any" value="${S.settings.bar_kerf ?? 0.5}"></label>
  <label class="field" style="width:200px"><span>Glass sheet size (cm)</span><div style="display:flex;gap:6px"><input id="sw" type="number" step="any" value="${sheet.w}"><input id="sh" type="number" step="any" value="${sheet.h}"></div></label>
  <label class="field check" style="margin-bottom:8px"><input type="checkbox" id="useLeft" checked><span>Use leftovers first</span></label></div>
  <datalist id="dl-col">${colours.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
  <div class="items-wrap"><table class="items" style="min-width:760px"><thead><tr><th></th><th>Label</th><th>Model</th><th>Width cm</th><th>Height cm</th><th>Qty</th><th>Glass</th><th>Colour</th><th></th></tr></thead><tbody id="lines"></tbody></table></div>
  <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="add">+ Add line</button><span class="grow"></span><button class="btn" id="commit">Take from stock &amp; save offcuts</button><button class="btn primary" id="print">Print cutting list</button></div></div>
  <div id="out" style="margin-top:16px"></div>`;

  const drawLines = () => {
    $('#lines', el).innerHTML = lines.map((l, i) => `<tr data-i="${i}"><td class="n">${i + 1}</td><td><input data-k="label" value="${esc(l.label)}" style="width:80px"></td>
      <td><select data-k="model_id">${S.models.map((m) => `<option value="${m.id}" ${Number(l.model_id) === m.id ? 'selected' : ''}>${esc(m.name)} (${esc(m.series || '')})</option>`).join('')}</select></td>
      <td><input data-k="w" type="number" step="any" class="w-s" value="${l.w ?? ''}"></td><td><input data-k="h" type="number" step="any" class="w-s" value="${l.h ?? ''}"></td><td><input data-k="qty" type="number" step="1" class="w-q" value="${l.qty ?? 1}"></td>
      <td><select data-k="glass_id"><option value="">—</option>${S.glass_types.map((g) => `<option value="${g.id}" ${Number(l.glass_id) === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></td>
      <td><input data-k="colour" list="dl-col" value="${esc(l.colour || '')}" style="width:100px"></td><td><button class="btn sm danger" data-rm>×</button></td></tr>`).join('');
  };

  /** Everything the page and the printout show, worked out from the lines. */
  const calc = () => {
    const kerf = num($('#kerf', el).value); const minOff = S.settings.min_offcut ?? 30;
    const lib = { profiles: S.profiles, accessories: S.accessories, glassTypes: S.glass_types };
    const fake = { items: lines.map((l) => ({ model_id: Number(l.model_id), w: num(l.w), h: num(l.h), qty: l.qty, glass_id: l.glass_id ? Number(l.glass_id) : null, colour: l.colour })), colour: '' };
    const pieces = quotePieces(fake, S.models, lib);
    const tagOf = (i) => { const l = lines[i]; const m = S.models.find((x) => x.id === Number(l.model_id)); return `${l.label || m?.name || ''} ${fq(l.w)}×${fq(l.h)}`; };
    let cost = 0; for (const l of lines) { const m = S.models.find((x) => x.id === Number(l.model_id)); if (m && num(l.w) > 0 && num(l.h) > 0) cost += modelCost(m, l.w, l.h, lib, S.glass_types.find((g) => g.id === Number(l.glass_id))).total * Math.max(1, Math.round(num(l.qty))); }
    // aluminium: group by profile + colour, nest on leftovers then new bars
    const groups = {};
    for (const p of pieces.filter((x) => x.kind === 'profile')) { const key = `${p.profile_id}|${(p.colour || '').toLowerCase()}`; const e = (groups[key] ||= { profile: S.profiles.find((x) => x.id === p.profile_id), profile_id: p.profile_id, colour: p.colour || '', pieces: [] }); e.pieces.push({ length: r1(p.length), tag: tagOf(p.item) }); }
    const profiles = Object.values(groups).map((e) => {
      const barLen = e.profile?.bar_length || 600;
      const units = useLeft ? leftoverUnits(stock, quoteNo).filter((u) => u.item_type !== 'glass' && u.profile_id === e.profile_id && (!e.colour || same(u.colour, e.colour))) : [];
      const nest = nestWithLeftovers(e.pieces, units, barLen, kerf);
      const inStock = stock.filter((s) => s.kind === 'new' && s.profile_id === e.profile_id && (!e.colour || same(s.colour, e.colour))).reduce((s, r) => s + (r.qty || 0), 0);
      return { ...e, barLen, nest, inStock, colourOf: colourFor(e.pieces.map((p) => p.length)) };
    });
    // glass: per glass type
    const gby = {};
    for (const p of pieces.filter((x) => x.kind === 'glass')) { const k = p.glass_id || 0; (gby[k] ||= []).push({ w: r1(p.w), h: r1(p.h), tag: tagOf(p.item) }); }
    const allGlassSizes = Object.values(gby).flat().map((p) => `${Math.max(p.w, p.h)}x${Math.min(p.w, p.h)}`);
    const glassKey = (p) => `${Math.max(p.w, p.h)}x${Math.min(p.w, p.h)}`;
    const glassColour = (() => { const m = new Map(); [...new Set(allGlassSizes)].sort().forEach((v, i) => m.set(v, PALETTE[i % PALETTE.length])); return (v) => m.get(v) || '#888'; })();
    const glass = Object.entries(gby).map(([gid, list]) => {
      const g = S.glass_types.find((x) => x.id === Number(gid));
      const units = useLeft && g ? leftoverUnits(stock, quoteNo).filter((u) => u.item_type === 'glass' && u.glass_id === g.id) : [];
      const res = g ? nestGlass(list, units, sheet, 0.3, minOff) : null;
      const sizes = new Map(); for (const p of list) { const k = glassKey(p); const e = sizes.get(k) || { w: Math.max(p.w, p.h), h: Math.min(p.w, p.h), qty: 0, tags: new Set() }; e.qty++; e.tags.add(p.tag); sizes.set(k, e); }
      return { g, list, res, sizes: [...sizes.entries()].map(([k, v]) => ({ key: k, ...v, tags: [...v.tags] })).sort((a, b) => b.w * b.h - a.w * a.h), area: list.reduce((a, p) => a + (p.w * p.h) / 10000, 0) };
    });
    // accessories and rubber, per product too
    const accs = accessoriesFor(pieces, S.accessories);
    const perItem = lines.map((l, i) => { const a = accessoriesFor(pieces.filter((p) => p.item === i), S.accessories); const rub = a.filter((e) => e.rubber); return { i, tag: tagOf(i), model: S.models.find((x) => x.id === Number(l.model_id))?.name || '', qty: Math.max(1, Math.round(num(l.qty))), rubM: rub.reduce((s, e) => s + e.qty, 0), rubCost: rub.reduce((s, e) => s + e.cost, 0), n: a.length }; }).filter((r) => r.rubM > 0);
    const byModel = {}; for (const r of perItem) { const e = (byModel[r.model] ||= { model: r.model, rubM: 0, rubCost: 0, units: 0 }); e.rubM += r.rubM; e.rubCost += r.rubCost; e.units += r.qty; }
    last = { profiles, glass, accs, perItem, byModel: Object.values(byModel), quoteNo, cost, minOff, glassColour, glassKey };
    return last;
  };

  /** The three blocks, as HTML. `print` adds tick boxes and leaves the screen-only helpers out. */
  const sections = (c, print) => {
    const minOff = c.minOff; let html = '';
    // ---- aluminium
    html += `<div class="card"><h3>${print ? '' : esc(title)}${print ? 'Aluminium profiles' : ''}</h3>`;
    if (!c.profiles.length) html += '<p class="muted">Add at least one line with a model and size.</p>';
    for (const e of c.profiles) {
      const { bars, leftoverUsed, unfit } = e.nest; const totalLen = e.pieces.reduce((s, p) => s + p.length, 0);
      const barsLen = bars.length * e.barLen; const waste = barsLen ? 1 - bars.reduce((s, b) => s + b.used, 0) / barsLen : 0;
      const offcuts = bars.filter((b) => e.barLen - b.used >= minOff).length + leftoverUsed.filter((u) => u.remaining >= minOff).length;
      const counts = new Map(); for (const p of e.pieces) counts.set(p.length, (counts.get(p.length) || 0) + 1);
      const seg = (p, total) => `<i style="width:${(p.length / total) * 100}%;background:${e.colourOf(p.length)}" title="${esc(p.tag)}: ${p.length}">${p.length / total > .07 ? `<span>${fq(p.length)}</span>` : ''}</i>`;
      html += `<div style="margin:16px 0;break-inside:avoid"><h4 style="margin:0 0 4px">${esc(e.profile ? `${e.profile.series || ''} · ${e.profile.name}${e.profile.code ? ' (' + e.profile.code + ')' : ''}` : 'No profile selected')} ${e.colour ? '· ' + dot(e.colour) : ''}</h4>
        <div class="muted">${e.pieces.length} pieces · ${fq(r1(totalLen))} cm · <b>${bars.length} new bar(s)</b> of ${fq(e.barLen)} cm${leftoverUsed.length ? ` · <b style="color:var(--ok)">${leftoverUsed.length} leftover piece(s) used</b>` : ''} · waste ${(waste * 100).toFixed(1)}%${(!print || showCost) && e.profile?.price_bar ? ` · cost BD ${money(bars.length * e.profile.price_bar, 2)}` : ''}${print ? '' : ` · in new stock: <b class="${e.inStock < bars.length ? 'neg' : ''}">${fq(e.inStock)}</b> · ${offcuts} offcut(s) ≥ ${minOff} cm to save`}</div>
        <div class="legend" style="margin:6px 0">${[...counts.entries()].sort((a, b) => b[0] - a[0]).map(([len, n]) => `<span><i style="background:${e.colourOf(len)}"></i>${fq(len)} cm × ${n}</span>`).join('')}</div>
        ${unfit.length ? `<p class="err">${unfit.length} piece(s) longer than the bar: ${unfit.map((p) => fq(p.length)).join(', ')}</p>` : ''}
        ${leftoverUsed.map((u) => `<div class="bar-label">${print ? '☐ ' : ''}♻ Leftover ${fq(u.length)} cm (${esc(u.colour || 'no colour')}${u.location ? ', ' + esc(u.location) : ''}) — ${u.cuts.map((p) => fq(p.length)).join(' + ')} <span class="muted">(left ${fq(r1(u.remaining))})</span></div><div class="bar">${u.cuts.map((p) => seg(p, u.length)).join('')}</div>`).join('')}
        ${bars.map((b, i) => `<div class="bar-label">${print ? '☐ ' : ''}Bar ${i + 1} — ${b.pieces.map((p) => fq(p.length)).join(' + ')} <span class="muted">(left ${fq(r1(e.barLen - b.used))})</span></div><div class="bar">${b.pieces.map((p) => seg(p, e.barLen)).join('')}</div>`).join('')}</div>`;
    }
    html += '</div>';
    // ---- glass
    html += `<div class="card" style="margin-top:14px"><h3>${print ? 'Glass' : 'Glass cutting — sheets, leftovers and scrap'}</h3>`;
    if (!c.glass.length) html += '<p class="muted">No glass panes — pick a glass type on the lines.</p>';
    for (const e of c.glass) {
      const r = e.res; const sw = sheet.w, sh = sheet.h;
      html += `<div style="margin:14px 0;break-inside:avoid"><h4 style="margin:0 0 4px">${esc(e.g?.name || 'Glass type not chosen')}</h4>
        <div class="muted">${e.list.length} pane(s) · ${e.area.toFixed(2)} m²${r ? ` · <b>${r.sheets.length} new sheet(s)</b> of ${sw}×${sh} cm${r.fromLeft.length ? ` · <b style="color:var(--ok)">${r.fromLeft.length} pane(s) from leftover glass</b>` : ''} · scrap ${r.scrapArea.toFixed(2)} m²${r.sheetArea ? ` (${Math.round((r.scrapArea / r.sheetArea) * 100)}% of the sheets)` : ''}${r.offcuts.length ? ` · ${r.offcuts.length} offcut(s) ≥ ${minOff} cm to keep` : ''}${(!print || showCost) && e.g?.price_m2 ? ` · glass cost BD ${money(r.sheetArea * e.g.price_m2, 2)}` : ''}` : ''}</div>
        <table class="grid" style="margin-top:6px"><thead><tr><th></th><th class="num">Width</th><th class="num">Height</th><th class="num">Qty</th><th class="num">Area m²</th><th>For</th></tr></thead><tbody>${e.sizes.map((z) => `<tr><td>${print ? '☐ ' : ''}<span class="dot" style="background:${c.glassColour(z.key)}"></span></td><td class="num">${fq(z.w)}</td><td class="num">${fq(z.h)}</td><td class="num">${z.qty}</td><td class="num">${((z.w * z.h * z.qty) / 10000).toFixed(2)}</td><td class="muted">${esc(z.tags.join(', '))}</td></tr>`).join('')}</tbody></table>
        ${r?.fromLeft.length ? `<div style="margin-top:6px;font-size:13px"><b>From leftover glass:</b> ${r.fromLeft.map((x) => `${x.piece.w}×${x.piece.h} ← ${fq(x.unit.length)}×${fq(x.unit.width)}${x.unit.location ? ' (' + esc(x.unit.location) + ')' : ''}`).join(' · ')}</div>` : ''}
        ${r?.unfit.length ? `<p class="err">${r.unfit.length} pane(s) are bigger than the sheet: ${r.unfit.map((p) => `${p.w}×${p.h}`).join(', ')}</p>` : ''}
        ${r?.sheets.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(${print ? 330 : 360}px,1fr));gap:12px;margin-top:8px">${r.sheets.map((s2, i) => `<div><div class="muted" style="font-size:12px">Sheet ${i + 1} — ${Math.round(s2.used * 100)}% used</div>${glassSheetSVG(s2, sw, sh, c.glassColour, minOff, 400)}</div>`).join('')}</div><p class="muted" style="font-size:11px;margin:6px 0 0">Same size = same colour · green dashed = offcut worth keeping · hatched = scrap</p>` : ''}</div>`;
    }
    html += '</div>';
    // ---- accessories and rubber
    const ac = c.accs; const money$ = !print || showCost; const tot = ac.reduce((a, e) => a + e.cost, 0); const rubTot = ac.filter((e) => e.rubber).reduce((a, e) => a + e.cost, 0); const markup = Number(S.settings.accessory_markup ?? 25);
    html += `<div class="card" style="margin-top:14px"><h3>Accessories &amp; rubber</h3>${ac.length ? `<table class="grid"><thead><tr><th>${print ? '' : ''}Item</th><th class="num">Qty</th><th>Unit</th>${money$ ? '<th class="num">Unit cost</th><th class="num">Cost</th><th class="num">Price</th>' : ''}<th>Used in</th></tr></thead><tbody>${ac.map((e) => `<tr><td>${print ? '☐ ' : ''}${e.rubber ? '〰 ' : ''}${esc(e.name)} <span class="muted">${esc(e.code)}</span></td><td class="num">${fq(e.qty)}</td><td>${esc(e.unit)}</td>${money$ ? `<td class="num">${e.price ? money(e.price, 3) : '—'}</td><td class="num">${money(e.cost, 2)}</td><td class="num">${money(e.cost * (1 + markup / 100), 2)}</td>` : ''}<td class="muted" style="font-size:11px">${esc(e.models.join(', '))}</td></tr>`).join('')}</tbody>${money$ ? `<tfoot><tr><td colspan="4">Total <span class="muted">(rubber ${money(rubTot, 2)}) · price includes ${markup}% mark-up</span></td><td class="num">${money(tot, 2)}</td><td class="num">${money(tot * (1 + markup / 100), 2)}</td><td></td></tr></tfoot>` : ''}</table>` : '<p class="muted">—</p>'}</div>`;
    if (c.perItem.length) html += `<div class="card" style="margin-top:14px"><h3>Rubber (gaskets, pile, seals) per product</h3><table class="grid"><thead><tr><th>Product</th><th>Model</th><th class="num">Pieces</th><th class="num">Rubber per piece</th><th class="num">Rubber total</th>${money$ ? '<th class="num">Cost</th>' : ''}</tr></thead><tbody>${c.perItem.map((r) => `<tr><td>${esc(r.tag)}</td><td class="muted">${esc(r.model)}</td><td class="num">${r.qty}</td><td class="num">${fq(Math.round((r.rubM / r.qty) * 100) / 100)} m</td><td class="num">${fq(Math.round(r.rubM * 10) / 10)} m</td>${money$ ? `<td class="num">${money(r.rubCost, 2)}</td>` : ''}</tr>`).join('')}</tbody></table>
      <h4 style="margin:12px 0 4px">By model</h4><table class="grid"><tbody>${c.byModel.map((r) => `<tr><td>${esc(r.model)}</td><td class="num">${r.units} piece(s)</td><td class="num">${fq(Math.round(r.rubM * 10) / 10)} m</td>${money$ ? `<td class="num">${money(r.rubCost, 2)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
    if (c.cost && !print) html += `<p class="muted">Estimated material cost for these lines: BD ${money(c.cost, 2)}</p>`;
    return html;
  };

  const compute = () => { const c = calc(); $('#out', el).innerHTML = sections(c, false); };

  /** A clean A4 sheet for the workshop: coloured bars, tick boxes, glass sheets, accessories. Costs are off unless asked for. */
  const printSheet = () => {
    const ov = document.createElement('div'); ov.className = 'print-overlay'; document.body.appendChild(ov);
    const paint = () => {
      const c = last || calc();
      ov.innerHTML = `<div class="printbar"><button class="btn" id="pc">← Close</button><button class="btn primary" id="pp">Print / Save as PDF</button><label class="field check" style="margin:0"><input type="checkbox" id="pcost" ${showCost ? 'checked' : ''}><span>Show costs and prices</span></label></div>
        <div class="doc" data-noi18n>${docHeader('CUTTING LIST', 'قائمة القص')}<div class="meta"><div><b>${L('quote', 'Quotation')}:</b> ${esc(quoteNo || '—')}</div><div><b>${L('date', 'DATE')}:</b> ${dmy(today())}</div><div><b>${L('client', 'Client')}:</b> ${esc(quoteRow?.client || '')}</div><div><b>${L('site', 'Site')}:</b> ${esc(quoteRow?.site || '')}</div></div>
        <table style="margin:6px 0"><thead><tr><th>#</th><th>Model</th><th class="n">Size cm</th><th class="n">Qty</th><th>Colour</th><th>Glass</th><th>Opening</th></tr></thead><tbody>${lines.map((l, i) => `<tr><td>${esc(l.label || i + 1)}</td><td>${esc(S.models.find((m) => m.id === Number(l.model_id))?.name || '')}</td><td class="n">${fq(l.w)} × ${fq(l.h)}</td><td class="n">${fq(l.qty)}</td><td>${esc(l.colour || '')}</td><td>${esc(S.glass_types.find((g) => g.id === Number(l.glass_id))?.name || '')}</td><td>${[l.hand && (l.hand === 'R' ? 'Right hand' : 'Left hand'), l.swing && (l.swing === 'in' ? 'opens inside' : 'opens outside')].filter(Boolean).join(', ')}</td></tr>`).join('')}</tbody></table>
        <div class="cutprint">${sections(c, true)}</div>${docFooter()}</div>`;
      $('#pc', ov).onclick = () => ov.remove(); $('#pp', ov).onclick = () => window.print();
      $('#pcost', ov).onchange = (e) => { showCost = e.target.checked; paint(); };
    };
    calc(); paint();
  };

  // write the result back to stock: consume leftovers, new bars and glass sheets, keep the offcuts as new leftovers
  const commit = guard(async () => {
    const hasWork = last?.profiles.some((e) => e.pieces.length) || last?.glass.some((e) => e.res);
    if (!hasWork) return toast('Nothing to take from stock yet', 'err');
    const minOff = S.settings.min_offcut ?? 30; const pct = S.settings.leftover_pct ?? 60;
    const nBars = last.profiles.reduce((s, e) => s + e.nest.bars.length, 0); const nLeft = last.profiles.reduce((s, e) => s + e.nest.leftoverUsed.length, 0);
    const nSheets = last.glass.reduce((s, e) => s + (e.res?.sheets.length || 0), 0); const nGl = last.glass.reduce((s, e) => s + (e.res?.fromLeft.length || 0), 0);
    if (!await confirmBox(`Take ${nBars} new bar(s), ${nLeft} leftover piece(s), ${nSheets} glass sheet(s) and ${nGl} leftover glass pane(s) out of stock, and save the offcuts of ${minOff} cm or more as new leftovers?`, 'Update stock', 'primary')) return;
    let fresh = await api.get('t/stock'); const short = [];
    const bump = async (row, d) => { const q = Math.max(0, (row.qty || 0) + d); row.qty = q; if (row.kind === 'leftover' && q <= 0) { await api.del(`t/stock/${row.id}`); fresh = fresh.filter((x) => x.id !== row.id); } else await api.put(`t/stock/${row.id}`, { qty: q }); };
    const addLeft = async (e, len) => {
      const L2 = Math.floor(len); if (L2 < minOff) return;
      const ex = fresh.find((s) => s.kind === 'leftover' && s.profile_id === e.profile_id && same(s.colour, e.colour) && s.length === L2 && !s.reserved_for);
      if (ex) return bump(ex, 1);
      const r = await api.post('t/stock', { kind: 'leftover', item_type: 'profile', profile_id: e.profile_id, colour: e.colour, length: L2, qty: 1, unit: 'pcs', unit_cost: leftoverValue(e.profile, L2, pct), order_inv: last.quoteNo || '', note: `Offcut from ${title}`, date: today() });
      fresh.push(r);
    };
    for (const e of last.profiles) {
      for (const u of e.nest.leftoverUsed) { const row = fresh.find((x) => x.id === u.id); if (row) await bump(row, -1); await addLeft(e, u.remaining); }
      let need = e.nest.bars.length;
      for (const row of fresh.filter((s) => s.kind === 'new' && s.profile_id === e.profile_id && (!e.colour || same(s.colour, e.colour)) && s.qty > 0)) { const take = Math.min(need, row.qty); if (take > 0) { await bump(row, -take); need -= take; } if (!need) break; }
      if (need) short.push(`${e.profile?.name || 'profile'} ${e.colour || ''} (${need} bar(s))`);
      for (const b of e.nest.bars) await addLeft(e, e.barLen - b.used);
    }
    for (const e of last.glass) {
      if (!e.res || !e.g) continue;
      for (const x of e.res.fromLeft) { const row = fresh.find((s) => s.id === x.unit.id); if (row) await bump(row, -1); }
      let need = e.res.sheets.length;
      for (const row of fresh.filter((s) => s.kind === 'new' && s.glass_id === e.g.id && s.qty > 0)) { const take = Math.min(need, row.qty); if (take > 0) { await bump(row, -take); need -= take; } if (!need) break; }
      if (need) short.push(`${e.g.name} (${need} sheet(s))`);
      for (const f of e.res.offcuts) {
        const w = Math.floor(Math.max(f.w, f.h)), h = Math.floor(Math.min(f.w, f.h)); const ex = fresh.find((s) => s.kind === 'leftover' && s.glass_id === e.g.id && s.length === w && s.width === h && !s.reserved_for);
        if (ex) { await bump(ex, 1); continue; }
        fresh.push(await api.post('t/stock', { kind: 'leftover', item_type: 'glass', glass_id: e.g.id, length: w, width: h, qty: 1, unit: 'pcs', unit_cost: Math.round(((w * h) / 10000) * (e.g.price_m2 || 0) * (pct / 100) * 1000) / 1000, order_inv: last.quoteNo || '', note: `Offcut from ${title}`, date: today() }));
      }
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
  $('#sw', el).oninput = (e) => { sheet.w = num(e.target.value) || sheet.w; compute(); }; $('#sh', el).oninput = (e) => { sheet.h = num(e.target.value) || sheet.h; compute(); };
  $('#qsel', el).onchange = (e) => { if (e.target.value) location.hash = `#/cutting/${e.target.value}`; };
  $('#print', el).onclick = printSheet; $('#commit', el).onclick = commit;
  void AR;
}
