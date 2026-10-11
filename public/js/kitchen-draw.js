// SVG drawings for kitchens: front elevation, plan view with countertop, and sheet cut layouts.
import { CAB_TYPES, DEFAULT_STYLE } from './kitchen.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const INK = '#26435f'; const FILL = '#e9eef4'; const FILL2 = '#cfd8e2'; const GLASS = '#cfe6f7'; const TOP = '#6b6f78';

/** Front elevations: every run on its own strip. Base units stand on the plinth, wall units hang at wall_height, tall units reach the floor. */
export function elevationSVG(spec, { maxW = 760 } = {}) {
  const style = { ...DEFAULT_STYLE, ...(spec.style || {}) }; const ct = Math.max(0, +spec.counter?.thickness || 2);
  const runs = (spec.runs || []).filter((r) => (r.cabinets || []).length);
  if (!runs.length) return '<p class="muted">Add cabinets to see the drawing.</p>';
  const widest = Math.max(...runs.map((r) => r.cabinets.reduce((a, c) => a + (+c.w || 0), 0)), 100);
  const k = Math.min(2.4, (maxW - 60) / widest); const padL = 34;
  const floorOf = (t) => (t.wall ? style.wall_height : t.tall || t.gap ? 0 : style.plinth); // cm from the floor to the carcass bottom
  let y0 = 0; let out = '';
  for (const run of runs) {
    // each run only gets the height it needs: a row of wall units is drawn without the empty wall below it
    const ext = run.cabinets.map((c) => { const t = CAB_TYPES[c.type] || CAB_TYPES.base; const f = floorOf(t); return [t.counter || t.gap ? (t.gap ? 0 : 0) : f, f + (+c.h || 0) + (t.counter ? ct : 0)]; });
    const bottom = Math.min(...ext.map((e) => e[0])); const top = Math.max(...ext.map((e) => e[1]));
    const rowH = (top - bottom) * k + 64; const base = y0 + 20 + (top - bottom) * k; // y of the lowest drawn level
    out += `<text x="${padL}" y="${y0 + 12}" font-size="12" font-weight="700" fill="currentColor">${esc(run.name || 'Run')}${run.island ? ' <tspan font-weight="400" opacity=".7">(island — free-standing)</tspan>' : ''}${bottom > 0 ? ` <tspan font-weight="400" opacity=".7">(hung ${bottom} cm above the floor)</tspan>` : ''}</text>`;
    out += `<line x1="${padL - 8}" y1="${base}" x2="${padL + widest * k + 8}" y2="${base}" stroke="${INK}" stroke-width="1.2" ${bottom > 0 ? 'stroke-opacity=".25"' : ''} stroke-dasharray="5 4"/>`;
    let x = padL;
    for (const c of run.cabinets) {
      const t = CAB_TYPES[c.type] || CAB_TYPES.base; const w = (+c.w || 0) * k; const h = (+c.h || 0) * k;
      const yTop = base - (floorOf(t) - bottom) * k - h;
      if (t.gap) { out += `<rect x="${x}" y="${yTop}" width="${w}" height="${h}" fill="none" stroke="${INK}" stroke-dasharray="4 3" stroke-width="1"/><text x="${x + w / 2}" y="${yTop + h / 2}" font-size="10" text-anchor="middle" fill="currentColor">appliance</text>`; x += w; continue; }
      out += `<rect x="${x}" y="${yTop}" width="${w}" height="${h}" fill="${FILL}" stroke="${INK}" stroke-width="1.2"/>`;
      const doors = Math.max(0, Math.round(+c.doors || 0)); const drawers = Math.max(0, Math.round(+c.drawers || 0)); const glazed = Math.min(doors, Math.round(+c.glazed || 0));
      for (let i = 0; i < drawers; i++) { const dh = h / drawers; out += `<rect x="${x + 2}" y="${yTop + i * dh + 2}" width="${w - 4}" height="${dh - 4}" fill="${FILL2}" stroke="${INK}" stroke-width=".8"/><line x1="${x + w * .35}" y1="${yTop + i * dh + dh * .3}" x2="${x + w * .65}" y2="${yTop + i * dh + dh * .3}" stroke="${INK}" stroke-width="2"/>`; }
      for (let i = 0; i < doors; i++) {
        const dw = w / doors; const gx = x + i * dw;
        out += `<rect x="${gx + 2}" y="${yTop + 2}" width="${dw - 4}" height="${h - 4}" fill="${i < glazed ? GLASS : FILL2}" stroke="${INK}" stroke-width=".8"/>`;
        const hx = doors === 1 ? gx + dw - 7 : i % 2 === 0 ? gx + dw - 6 : gx + 6; out += `<line x1="${hx}" y1="${yTop + h * (t.wall ? 0.75 : 0.25)}" x2="${hx}" y2="${yTop + h * (t.wall ? 0.9 : 0.4)}" stroke="${INK}" stroke-width="2"/>`;
        out += doors === 1 ? `<path d="M${gx + 2} ${yTop + 2} L${gx + dw - 2} ${yTop + h / 2} L${gx + 2} ${yTop + h - 2}" fill="none" stroke="${INK}" stroke-width=".6" stroke-dasharray="3 3"/>` : '';
      }
      if (t.sink) out += `<ellipse cx="${x + w / 2}" cy="${yTop - ct * k - 3}" rx="${w * .28}" ry="2.5" fill="none" stroke="${INK}" stroke-width="1"/>`;
      if (t.counter) out += `<rect x="${x - 1}" y="${yTop - ct * k}" width="${w + 2}" height="${ct * k}" fill="${TOP}"/>`;
      if (!t.wall && !t.tall) out += `<rect x="${x}" y="${yTop + h}" width="${w}" height="${style.plinth * k}" fill="#8b95a3"/>`;
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
  const k = Math.min(2.2, (maxW - 50) / widest); const padL = 24; let y0 = 0; let out = '';
  runs.forEach((run, ri) => {
    const over = run.island ? (+run.overhang || 0) : 0;
    const depth = Math.max(...run.cabinets.map((x) => +x.d || 0), 60) + (+c.front || 0); const rowH = (depth + over) * k + 40; const yb = y0 + 22 + over * k;
    out += `<text x="${padL}" y="${y0 + 12}" font-size="12" font-weight="700" fill="currentColor">${esc(run.name || 'Run')}${run.island ? ' (island)' : ''}</text>`;
    let x = padL;
    for (const cab of run.cabinets) {
      const t = CAB_TYPES[cab.type] || CAB_TYPES.base; const w = (+cab.w || 0) * k; const d = (+cab.d || 0) * k;
      if (t.gap) { out += `<rect x="${x}" y="${yb}" width="${w}" height="${d}" fill="none" stroke="${INK}" stroke-dasharray="4 3"/>`; x += w; continue; }
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
