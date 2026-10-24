// SVG drawings for kitchens: front elevation, plan view with countertop, and sheet cut layouts.
import { CAB_TYPES, DEFAULT_STYLE, APPLIANCES, DIRS, layoutSlots, zonesOf, shelfCount, shelfGap, hasSkirt, openDoorsOf, hasHiddenHandle } from './kitchen.js';
import { colourHex, glassHex, stoneHex, lighten } from './drawings.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const INK = '#26435f'; const FILL_ = '#e9eef4'; const FILL2_ = '#cfd8e2'; const GLASS_ = '#cfe6f7'; const TOP_ = '#6b6f78'; const FILL = FILL_; const FILL2 = FILL2_; const GLASS = GLASS_; const TOP = TOP_;

/** Front elevations: every run on its own strip. Base units stand on the plinth, wall units hang at wall_height, tall units reach the floor. */
export function elevationSVG(spec, { maxW = 760 } = {}) {
  const style = { ...DEFAULT_STYLE, ...(spec.style || {}) }; const ct = Math.max(0, +spec.counter?.thickness || 2);
  const runs = (spec.runs || []).filter((r) => (r.cabinets || []).length);
  if (!runs.length) return '<p class="muted">Add cabinets to see the drawing.</p>';
  const dh = colourHex(style.door_colour); const FILL2 = dh || FILL2_; const FILL = dh ? lighten(dh, .35) : FILL_; const GLASS = style.glass ? glassHex(style.glass) : GLASS_; const TOP = stoneHex(spec.counter?.material);
  const widest = Math.max(...runs.map((r) => r.cabinets.reduce((a, c) => a + (+c.w || 0), 0)), 100);
  const k = Math.min(2.4, (maxW - 60) / widest); const padL = 34;
  const floorOf = (t, c = {}) => (t.wall ? (c.y !== undefined && c.y !== '' && Number.isFinite(+c.y) ? +c.y : style.wall_height) : hasSkirt(c) ? style.plinth : 0); // cm from the floor to the carcass bottom
  let y0 = 0; let out = '';
  for (const run of runs) {
    // each run only gets the height it needs: a row of wall units is drawn without the empty wall below it
    const ext = run.cabinets.map((c) => { const t = CAB_TYPES[c.type] || CAB_TYPES.base; const f = floorOf(t, c); return [t.counter || t.gap ? (t.gap ? 0 : 0) : f, f + (+c.h || 0) + (t.counter ? ct : 0) + (t.shelf ? (shelfCount(c) - 1) * ((+c.h || 0) + shelfGap(c)) : 0)]; });
    const bottom = Math.min(...ext.map((e) => e[0])); const top = Math.max(...ext.map((e) => e[1]));
    const rowH = (top - bottom) * k + 64; const base = y0 + 20 + (top - bottom) * k; // y of the lowest drawn level
    out += `<text x="${padL}" y="${y0 + 12}" font-size="12" font-weight="700" fill="currentColor">${esc(run.name || 'Run')}${run.island ? ' <tspan font-weight="400" opacity=".7">(island — free-standing)</tspan>' : ''}${bottom > 0 ? ` <tspan font-weight="400" opacity=".7">(hung ${bottom} cm above the floor)</tspan>` : ''}</text>`;
    out += `<line x1="${padL - 8}" y1="${base}" x2="${padL + widest * k + 8}" y2="${base}" stroke="${INK}" stroke-width="1.2" ${bottom > 0 ? 'stroke-opacity=".25"' : ''} stroke-dasharray="5 4"/>`;
    let x = padL;
    for (const c of run.cabinets) {
      const t = CAB_TYPES[c.type] || CAB_TYPES.base; const w = (+c.w || 0) * k; const h = (+c.h || 0) * k;
      const yTop = base - (floorOf(t, c) - bottom) * k - h;
      if (t.gap && c.appliance && APPLIANCES[c.appliance]) { out += `<rect x="${x}" y="${yTop}" width="${w}" height="${h}" fill="#dfe3e8" stroke="${INK}" stroke-width="1.2"/><text x="${x + w / 2}" y="${yTop + h / 2}" font-size="10" text-anchor="middle" fill="${INK}">${esc(APPLIANCES[c.appliance][0])}</text><text x="${x + w / 2}" y="${base + 14}" font-size="10" text-anchor="middle" fill="currentColor">${+c.w || 0}</text>`; if (hasSkirt(c)) out += `<rect x="${x}" y="${yTop + h}" width="${w}" height="${style.plinth * k}" fill="#8b95a3"/>`; x += w; continue; }
      if (t.gap) { out += `<rect x="${x}" y="${yTop}" width="${w}" height="${h}" fill="none" stroke="${INK}" stroke-dasharray="4 3" stroke-width="1"/><text x="${x + w / 2}" y="${yTop + h / 2}" font-size="10" text-anchor="middle" fill="currentColor">appliance</text>`; x += w; continue; }
      out += `<rect x="${x}" y="${yTop}" width="${w}" height="${h}" fill="${FILL}" stroke="${INK}" stroke-width="1.2"/>`;
      const doors = t.corner ? 1 : Math.max(0, Math.round(+c.doors || 0)); const drawers = Math.max(0, Math.round(+c.drawers || 0)); const glazed = spec.style?.door_kind === 'glass' ? doors : Math.min(doors, Math.round(+c.glazed || 0));
      const zn = zonesOf(c); const f = h / (+c.h || 1); const dir = c.dir && DIRS[c.dir] ? c.dir : 'auto'; const slots = layoutSlots(c);
      // the dashed opening symbol: its point is on the handle side; sliding doors get an arrow
      const sym = (gx, zy, dw, zh, dr, left) => {
        const dash = `fill="none" stroke="${INK}" stroke-width=".6" stroke-dasharray="3 3"`;
        if (dr === 'up') return `<path d="M${gx + 2} ${zy + 2} L${gx + dw / 2} ${zy + zh - 2} L${gx + dw - 2} ${zy + 2}" ${dash}/>`;
        if (dr === 'down') return `<path d="M${gx + 2} ${zy + zh - 2} L${gx + dw / 2} ${zy + 2} L${gx + dw - 2} ${zy + zh - 2}" ${dash}/>`;
        if (dr === 'slide') { const my = zy + zh / 2; return `<path d="M${gx + 6} ${my} L${gx + dw - 6} ${my} M${gx + dw - 11} ${my - 4} L${gx + dw - 6} ${my} L${gx + dw - 11} ${my + 4}" fill="none" stroke="${INK}" stroke-width="1"/>`; }
        return left ? `<path d="M${gx + 2} ${zy + 2} L${gx + dw - 2} ${zy + zh / 2} L${gx + 2} ${zy + zh - 2}" ${dash}/>` : `<path d="M${gx + dw - 2} ${zy + 2} L${gx + 2} ${zy + zh / 2} L${gx + dw - 2} ${zy + zh - 2}" ${dash}/>`;
      };
      const handle = (gx, zy, dw, zh, dr, left, wall) => { if (hid) return ''; // the hidden handle has no knob
        if (dr === 'up') return `<line x1="${gx + dw / 2 - 8}" y1="${zy + zh - 6}" x2="${gx + dw / 2 + 8}" y2="${zy + zh - 6}" stroke="${INK}" stroke-width="2"/>`;
        if (dr === 'down') return `<line x1="${gx + dw / 2 - 8}" y1="${zy + 6}" x2="${gx + dw / 2 + 8}" y2="${zy + 6}" stroke="${INK}" stroke-width="2"/>`;
        const hx = left ? gx + dw - 6 : gx + 6; return `<line x1="${hx}" y1="${zy + zh * (wall ? 0.75 : 0.25)}" x2="${hx}" y2="${zy + zh * (wall ? 0.9 : 0.4)}" stroke="${INK}" stroke-width="2"/>`;
      };
      const openSet = t.corner ? new Set() : openDoorsOf(c); const hid = hasHiddenHandle(c, style);
      const doorSet = (gx0, zy, zw, zh, n, dr, gl, wall, skip = null) => { for (let i = 0; i < n; i++) { const dw = zw / n; const gx = gx0 + i * dw;
        if (skip && skip.has(i)) { out += `<rect x="${gx + 2}" y="${zy + 2}" width="${dw - 4}" height="${zh - 4}" fill="#f6f2e8" stroke="${INK}" stroke-width=".6" stroke-dasharray="2 2"/>`; continue; } // an open place
        if (dr === 'shutter') { const lines = Math.max(3, Math.round((zh - 4) / 7)); out += `<rect x="${gx + 2}" y="${zy + 2}" width="${dw - 4}" height="${zh - 4}" fill="${FILL2}" stroke="${INK}" stroke-width=".8"/>` + Array.from({ length: lines }, (_, q) => `<line x1="${gx + 3}" y1="${zy + 2 + ((q + 1) * (zh - 4)) / (lines + 1)}" x2="${gx + dw - 3}" y2="${zy + 2 + ((q + 1) * (zh - 4)) / (lines + 1)}" stroke="${INK}" stroke-width=".4" opacity=".55"/>`).join('') + `<rect x="${gx + dw * .3}" y="${zy + zh - 9}" width="${dw * .4}" height="3" fill="${INK}"/><path d="M${gx + dw / 2 - 5} ${zy + zh / 2 + 3} L${gx + dw / 2} ${zy + zh / 2 - 4} L${gx + dw / 2 + 5} ${zy + zh / 2 + 3}" fill="none" stroke="${INK}" stroke-width="1.2"/>`; continue; }
        const left = dr === 'right' ? false : dr === 'left' ? true : n === 1 || i % 2 === 0;
        out += `<rect x="${gx + 2}" y="${zy + 2}" width="${dw - 4}" height="${zh - 4}" fill="${i < gl ? GLASS : FILL2}" stroke="${INK}" stroke-width=".8"/>${handle(gx, zy, dw, zh, dr, left, wall)}`;
        if (n === 1 || dr === 'up' || dr === 'down' || dr === 'slide') out += sym(gx, zy, dw, zh, dr, left); } };
      if (slots) {
        const fixed = slots.reduce((a2, q) => a2 + q.h, 0); const free = slots.filter((q) => !(q.h > 0)).length; let yy = yTop + h;
        slots.forEach((sl, i) => { const hh = (sl.h > 0 ? sl.h : Math.max(0, ((+c.h || 0) - fixed) / (free || 1))) * f; yy -= hh;
          if (sl.k === 'door' || sl.k === 'glass') doorSet(x, yy, w, hh, sl.n, sl.dir, sl.k === 'glass' ? sl.n : 0, false);
          else if (sl.k === 'drawer') out += `<rect x="${x + 2}" y="${yy + 2}" width="${w - 4}" height="${hh - 4}" fill="${FILL2}" stroke="${INK}" stroke-width=".8"/><line x1="${x + w * .35}" y1="${yy + hh * .35}" x2="${x + w * .65}" y2="${yy + hh * .35}" stroke="${INK}" stroke-width="2"/>`;
          else if (sl.k === 'open') out += `<rect x="${x + 2}" y="${yy + 2}" width="${w - 4}" height="${hh - 4}" fill="#f6f2e8" stroke="${INK}" stroke-width=".6" stroke-dasharray="2 2"/>`;
          else out += `<rect x="${x + 2}" y="${yy + 2}" width="${w - 4}" height="${hh - 4}" fill="#2b2f36" stroke="${INK}" stroke-width=".8"/><rect x="${x + 6}" y="${yy + 6}" width="${w - 12}" height="${Math.max(2, hh - 16)}" fill="#46525e"/><text x="${x + w / 2}" y="${yy + hh / 2 + 3}" font-size="9" text-anchor="middle" fill="#fff">${esc((APPLIANCES[sl.k] || [sl.k])[0])}</text>`; });
      } else if (t.corner) {
        const dwA = Math.max(0, (+c.w || 0) - (+c.d || 0)) * f; const right = (c.side || 'right') !== 'left';
        out += `<rect x="${right ? x + w - (+c.d || 0) * f : x}" y="${yTop}" width="${(+c.d || 0) * f}" height="${h}" fill="${FILL2_}" fill-opacity=".5" stroke="${INK}" stroke-dasharray="3 2" stroke-width=".6"/>`;
        doorSet(right ? x : x + w - dwA, yTop, dwA, h, 1, ['slide', 'shutter'].includes(dir) ? 'auto' : dir, glazed, t.wall);
      } else if (t.shelf) { out += ''; } else if (t.hood) {
        out += `<rect x="${x + w * .3}" y="${yTop - 40}" width="${w * .4}" height="${40 + h * .87}" fill="#c9ced6" stroke="${INK}" stroke-width=".8"/><rect x="${x}" y="${yTop + h * .87}" width="${w}" height="${h * .13}" fill="#aab2bc" stroke="${INK}" stroke-width=".8"/>`;
      } else if (t.gap) { /* drawn above */ } else {
        if (!doors && !drawers) out += [1, 2, 3].slice(0, Math.max(0, Math.round(+c.shelves || 0))).map((i, _, all) => `<line x1="${x + 2}" y1="${yTop + (h * i) / (all.length + 1)}" x2="${x + w - 2}" y2="${yTop + (h * i) / (all.length + 1)}" stroke="${INK}" stroke-width="1.4"/>`).join('') + `<text x="${x + w / 2}" y="${yTop + h / 2}" font-size="9" text-anchor="middle" fill="currentColor" opacity=".55">open</text>`;
        if (drawers) { const z = zn.drawers; const zx = x + z.x * f; const zy = yTop + (+c.h - z.y - z.h) * f; const zw = z.w * f; const dh = (z.h * f) / drawers; for (let i = 0; i < drawers; i++) out += `<rect x="${zx + 2}" y="${zy + i * dh + 2}" width="${zw - 4}" height="${dh - 4}" fill="${FILL2}" stroke="${INK}" stroke-width=".8"/><line x1="${zx + zw * .35}" y1="${zy + i * dh + dh * .4}" x2="${zx + zw * .65}" y2="${zy + i * dh + dh * .4}" stroke="${INK}" stroke-width="2"/>`; }
        if (doors) { const z = zn.doors; doorSet(x + z.x * f, yTop + (+c.h - z.y - z.h) * f, z.w * f, z.h * f, doors, dir, glazed, t.wall, openSet); }
        if (hid) out += `<rect x="${x}" y="${yTop}" width="${w}" height="${Math.max(2, 3.5 * f)}" fill="#2f343b"/>`; // hidden-handle groove
      }
      if (t.shelf) for (let q = 0; q < shelfCount(c); q++) out += `<rect x="${x}" y="${yTop - q * ((+c.h || 0) + shelfGap(c)) * k}" width="${w}" height="${Math.max(3, h)}" fill="#d9c9a8" stroke="${INK}" stroke-width="1"/>`;
      if (t.sink) { const cx = x + w / 2; const ty = yTop - ct * k; out += `<path d="M${x + w * .12} ${ty} L${x + w * .12} ${ty + 4} L${x + w * .88} ${ty + 4} L${x + w * .88} ${ty}" fill="#b9c0c9" stroke="${INK}" stroke-width="1"/><path d="M${cx} ${ty} L${cx} ${ty - 16} Q${cx} ${ty - 22} ${cx - 8} ${ty - 22}" fill="none" stroke="${INK}" stroke-width="2"/>`; }
      if (t.counter) out += `<rect x="${x - 1}" y="${yTop - ct * k}" width="${w + 2}" height="${ct * k}" fill="${TOP}"/>`;
      if (hasSkirt(c)) out += `<rect x="${x}" y="${yTop + h}" width="${w}" height="${style.plinth * k}" fill="#8b95a3"/>`;
      out += `<text x="${x + w / 2}" y="${base + 14 + (bottom === 0 ? 0 : 0)}" font-size="10" text-anchor="middle" fill="currentColor">${+c.w || 0}</text>`;
      if (c.label) out += `<text x="${x + w / 2}" y="${yTop + 12}" font-size="9" text-anchor="middle" fill="currentColor" opacity=".7">${esc(c.label)}</text>`;
      x += w;
    }
    const tot = run.cabinets.reduce((a, c) => a + (+c.w || 0), 0);
    out += `<line x1="${padL}" y1="${base + 32}" x2="${x}" y2="${base + 32}" stroke="currentColor" stroke-width=".8"/><text x="${(padL + x) / 2}" y="${base + 29}" font-size="10" text-anchor="middle" fill="currentColor" font-weight="700" stroke="${'#fff0'}">${tot} cm</text>`;
    y0 += rowH + 10;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${padL + widest * k + 24} ${y0}" style="width:100%;max-width:${Math.round(padL + widest * k + 24)}px;color:inherit" role="img" aria-label="Kitchen elevation">${out}</svg>`;
}

/** Plan view: cabinets as seen from above, the countertop outline, and the sink and hob cut-outs. */
export function planSVG(spec, model, { maxW = 760 } = {}) {
  const runs = (spec.runs || []).filter((r) => (r.cabinets || []).length); if (!runs.length) return '';
  const c = model.counter; const widest = Math.max(...runs.map((r) => r.cabinets.reduce((a, x) => a + (+x.w || 0), 0)), 100);
  const k = Math.min(2.2, (maxW - 50) / widest); const padL = 24; let y0 = 0; let out = ''; const TOP = stoneHex(c.material); const dh = colourHex((model.style || {}).door_colour); const FILL = dh ? lighten(dh, .45) : FILL_;
  runs.forEach((run, ri) => {
    const over = run.island ? (+run.overhang || 0) : 0;
    const depth = Math.max(...run.cabinets.map((x) => ((CAB_TYPES[x.type] || {}).corner && !(CAB_TYPES[x.type] || {}).wall ? +x.w || 0 : +x.d || 0)), 60) + (+c.front || 0); const rowH = (depth + over) * k + 40; const yb = y0 + 22 + over * k;
    out += `<text x="${padL}" y="${y0 + 12}" font-size="12" font-weight="700" fill="currentColor">${esc(run.name || 'Run')}${run.island ? ' (island)' : ''}</text>`;
    let x = padL;
    for (const cab of run.cabinets) {
      const t = CAB_TYPES[cab.type] || CAB_TYPES.base; const w = (+cab.w || 0) * k; const d = (+cab.d || 0) * k;
      if (t.gap) { out += `<rect x="${x}" y="${yb}" width="${w}" height="${d}" fill="none" stroke="${INK}" stroke-dasharray="4 3"/>`; x += w; continue; }
      if (t.corner) { const cw = (+cab.w || 0) * k; const right = (cab.side || (run.cabinets[0] === cab && run.cabinets.length > 1 ? 'left' : 'right')) !== 'left'; if (cw > d) out += `<rect x="${right ? x + w - d : x}" y="${yb + d}" width="${d}" height="${cw - d}" fill="${t.wall ? 'none' : FILL}" stroke="${INK}" stroke-width="1" ${t.wall ? 'stroke-dasharray="5 3"' : ''}/>`; }
      out += `<rect x="${x}" y="${yb}" width="${w}" height="${d}" fill="${t.wall ? 'none' : FILL}" stroke="${INK}" stroke-width="1" ${t.wall ? 'stroke-dasharray="5 3"' : ''}/>`;
      x += w;
    }
    // countertop pieces of this run drawn over the cabinets
    const tops = model.tops.pieces.filter((p) => p.run === ri); let cx = padL;
    let acc = 0; const starts = []; for (const cab of run.cabinets) { starts.push(acc); acc += +cab.w || 0; }
    let ci = 0; const runCabs = run.cabinets;
    for (const p of tops) { // find first counter cabinet that begins this piece
      while (ci < runCabs.length && !(CAB_TYPES[runCabs[ci].type] || {}).counter) ci++;
      const startX = padL + starts[ci] * k;  out += `<rect x="${startX - (+c.side || 0) * k}" y="${yb - (p.over || 0) * k}" width="${p.len * k}" height="${p.depth * k}" fill="${TOP}" fill-opacity=".32" stroke="${TOP}" stroke-width="1.6"/>`;
      let cum = 0; while (ci < runCabs.length && (CAB_TYPES[runCabs[ci].type] || {}).counter && cum < p.len - 2 * (+c.side || 0) - 0.01) { const cab = runCabs[ci]; const t = CAB_TYPES[cab.type]; const w = (+cab.w || 0) * k; const bx = padL + starts[ci] * k;
        if (t.sink) out += `<rect x="${bx + w * .12}" y="${yb + (+cab.d || 0) * k * .2}" width="${w * .76}" height="${(+cab.d || 0) * k * .55}" rx="5" fill="#fff" stroke="${INK}" stroke-width="1.2"/><text x="${bx + w / 2}" y="${yb + (+cab.d || 0) * k * .5}" font-size="9" text-anchor="middle" fill="${INK}">sink</text>`;
        if (t.hob) { const r = Math.min(w, (+cab.d || 0) * k) * .12; for (const [dx, dy] of [[.3, .3], [.7, .3], [.3, .65], [.7, .65]]) out += `<circle cx="${bx + w * dx}" cy="${yb + (+cab.d || 0) * k * dy}" r="${r}" fill="#fff" stroke="${INK}"/>`; }
        cum += +cab.w || 0; ci++; }
    }
    out += `<text x="${x + 6}" y="${yb + 12}" font-size="10" fill="currentColor">${run.cabinets.reduce((a, q) => a + (+q.w || 0), 0)} cm</text>`;
    y0 += rowH;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${padL + widest * k + 70} ${y0}" style="width:100%;max-width:${Math.round(padL + widest * k + 70)}px;color:inherit" role="img" aria-label="Kitchen plan">${out}</svg>`;
}

/** One sheet (or slab) with its cut pieces. */
export function sheetSVG(sheet, sw, sh, { width = 520, showLabels = true } = {}) {
  const k = width / sw; const H = sh * k;
  const items = sheet.items.map((i) => `<rect x="${i.x * k}" y="${i.y * k}" width="${i.w * k}" height="${i.h * k}" fill="${i.rot ? '#dfeee6' : '#dbe6f4'}" stroke="${INK}" stroke-width=".8"/>${showLabels && i.w * k > 38 && i.h * k > 16 ? `<text x="${i.x * k + 3}" y="${i.y * k + 11}" font-size="8.5" fill="${INK}">${esc(String(i.label).slice(0, 18))}</text><text x="${i.x * k + 3}" y="${i.y * k + 21}" font-size="8" fill="${INK}" opacity=".75">${i.w}×${i.h}</text>` : ''}`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${H}" style="width:100%;max-width:${width}px;background:#fff;border:1px solid #ccd3dd;border-radius:4px;color:#111"><rect width="${width}" height="${H}" fill="#f6f7f9"/>${items}</svg>`;
}
