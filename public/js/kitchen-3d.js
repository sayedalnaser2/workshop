// 3D view of a kitchen: cabinets become boxes, a small painter's-algorithm renderer draws them on a canvas.
// scene() is pure (tested); draw3D() needs a canvas. All sizes in cm; x = right, y = up, z = towards the viewer (the back wall is z = 0).
import { CAB_TYPES, DEFAULT_STYLE, APPLIANCES, DIRS, layoutSlots, zonesOf, shelfCount, shelfGap, hasSkirt, openDoorsOf, hasHiddenHandle, hiddenSegments } from './kitchen.js';
import { colourHex, colourTex, stoneHex } from './drawings.js';

/** Where each run stands: { x, z, rot } with rot 0/90/180/270. Run 1 = back wall, 2 = left wall, 3 = right wall, islands in front. */
export function placeRuns(spec) {
  const runs = spec.runs || []; const len = (r) => (r.cabinets || []).reduce((a, c) => a + (+c.w || 0), 0);
  const room = Math.max(len(runs[0] || { cabinets: [] }), 200); let wallN = 0; let islandN = 0;
  // an L-shaped corner at the end of the back run pushes the side run out to the end of its return leg
  const cabs0 = (runs[0] || {}).cabinets || []; const cornerAt = (i) => { const c = cabs0[i]; return c && (CAB_TYPES[c.type] || {}).corner && !(CAB_TYPES[c.type] || {}).wall ? +c.w || 0 : 0; };
  const leftCorner = cabs0.length ? (cabs0[0].side === 'right' ? 0 : cornerAt(0)) : 0; const rightCorner = cabs0.length ? (cabs0.at(-1).side === 'left' ? 0 : cornerAt(cabs0.length - 1)) : 0;
  return runs.map((r, i) => {
    if (r.place && Number.isFinite(+r.place.x) && Number.isFinite(+r.place.z)) return { x: +r.place.x, z: +r.place.z, rot: +r.place.rot || 0 };
    if (i === 0) return { x: 0, z: 0, rot: 0 };
    if ((r.cabinets || []).length && r.cabinets.every((c) => CAB_TYPES[c.type]?.wall)) return { x: 0, z: 0, rot: 0 }; // wall units hang over the first run
    if (r.island) { islandN++; return { x: Math.max(0, (room - len(r)) / 2), z: 160 + (islandN - 1) * 120, rot: 0 }; }
    wallN++; return wallN === 1 ? { x: 0, z: leftCorner || 62, rot: 90 } : { x: room, z: rightCorner || 62, rot: 270 };
  });
}

/** Where each cabinet of a run starts (cm along the run). Wall units can have a space before them (gap_before); and those that hang over a base run make room for its tall units: they slide along to the right of them. */
export function runStarts(spec, ri) {
  const runs = spec.runs || []; const run = runs[ri]; const cabs = (run && run.cabinets) || []; const isWall = (c) => !!(CAB_TYPES[c.type] || {}).wall;
  const style = { ...DEFAULT_STYLE, ...(spec.style || {}) }; const ct = Math.max(0, +spec.counter?.thickness || 2);
  const mountOf = (c) => (c.y !== undefined && c.y !== '' && Number.isFinite(+c.y) ? +c.y : style.wall_height);
  let blockers = []; // [from, to, top]: what stands on the floor under the wall units and reaches up to them
  if (cabs.length && cabs.every(isWall)) {
    const pl = placeRuns(spec); const k = runs.findIndex((r, i) => i !== ri && (r.cabinets || []).length && !r.cabinets.every(isWall) && pl[i].x === pl[ri].x && pl[i].z === pl[ri].z && pl[i].rot === pl[ri].rot);
    if (k >= 0) {
      let a = 0;
      for (const c of runs[k].cabinets) {
        const t = CAB_TYPES[c.type] || {}; const w = +c.w || 0; const h = +c.h || 0;
        const floorStanding = t.tall || (t.gap && ['fridge', 'freezer'].includes(c.appliance)); // a tall unit or a fridge starts at the floor
        const base0 = t.gap ? (hasSkirt(c) ? style.plinth : 0) : hasSkirt(c) ? style.plinth : 0; const top = base0 + h + (t.counter ? ct : 0);
        blockers.push([a, a + w, top]); a += w;
      }
    }
  }
  const out = []; let u = 0;
  for (const c of cabs) {
    const w = +c.w || 0; if (isWall(c)) u += Math.max(0, +c.gap_before || 0); // a wall unit can be set away from its neighbour
    const hit = blockers.filter((x) => x[2] > mountOf(c) + 0.01); // only what reaches up to this unit's bottom edge
    for (let moved = hit.length > 0; moved;) { moved = false; for (const [a, b] of hit) if (u < b - 0.01 && u + w > a + 0.01) { u = b; moved = true; } }
    out.push(u); u += w;
  }
  return out;
}

const dark = (hex, f) => { const n = parseInt(String(hex).replace('#', ''), 16); if (Number.isNaN(n)) return hex; const c = (sh) => Math.max(0, Math.min(255, Math.round(((n >> sh) & 255) * f))); return '#' + [16, 8, 0].map((sh) => c(sh).toString(16).padStart(2, '0')).join(''); };
const shade = (hex, f) => { const n = parseInt(String(hex).replace('#', ''), 16); const c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f))); return `rgb(${c(16)},${c(8)},${c(0)})`; };

/** The doors and drawers of a cabinet that can be opened on their own: [{ key, label }]. */
export function frontsOf(c) {
  const t = CAB_TYPES[c.type] || CAB_TYPES.base; const out = []; const slots = layoutSlots(c);
  if (slots) { slots.forEach((sl, i) => { if (['door', 'glass', 'drawer'].includes(sl.k)) out.push({ key: 's' + i, label: `${sl.k === 'drawer' ? 'Drawer' : 'Door'} ${i + 1}` }); }); return out; }
  const nd = Math.round(+c.drawers || 0); const nf = t.corner ? 2 : Math.round(+c.doors || 0);
  for (let i = 0; i < nd; i++) out.push({ key: 'd' + i, label: 'Drawer ' + (i + 1) });
  if (c.dir === 'slide' && nf > 1) out.push({ key: 'f0', label: 'Sliding doors' }); else { const op = t.corner ? new Set() : openDoorsOf(c); for (let i = 0; i < nf; i++) if (!op.has(i)) out.push({ key: 'f' + i, label: 'Door ' + (i + 1) }); }
  return out;
}

/** Boxes { corners[8], color, kind, ref } for the whole kitchen. open = { 'ri|ci': 0..1 } how far each cabinet's doors / drawers are open. */
export function scene(spec, open = {}) {
  const style = { ...DEFAULT_STYLE, ...(spec.style || {}) }; const ct = Math.max(0, +spec.counter?.thickness || 2); const over = +spec.counter?.front || 0;
  const door = colourHex(style.door_colour) || '#d9c9a8'; const doorTex = colourTex(style.door_colour); const carcass = '#e8e4dc'; const inner = '#f3efe6'; const top = stoneHex(spec.counter?.material) || '#6b6f78';
  const alu = style.kind === 'aluminium'; const frame = colourHex(style.profile_out) || '#9aa3ad'; const T = +style.t || 1.8;
  const STEEL = '#c9ced6'; const BLACK = '#23272e'; const GLASSY = '#46525e';
  const pl = placeRuns(spec); const boxes = [];
  (spec.runs || []).forEach((run, ri) => {
    const { x: ox, z: oz, rot } = pl[ri];
    const map = { 0: (u, v) => [ox + u, oz + v], 90: (u, v) => [ox + v, oz + u], 180: (u, v) => [ox - u, oz - v], 270: (u, v) => [ox - v, oz - u] }[rot] || ((u, v) => [ox + u, oz + v]);
    let curCi = -1; let curFront = null;
    // a box in run coordinates (u along the run, v out from the wall); sw turns it about a vertical hinge line { hu, hv, a (radians), side }
    // or about a horizontal one { ax: 'h', hy, hv, a, sgn: -1 hinged at the top, 1 at the bottom }
    const put = (u0, u1, v0, v1, y0, y1, color, kind, sw) => {
      const C = [];
      for (let i = 0; i < 8; i++) {
        let u = i & 1 ? u1 : u0; let y = i & 2 ? y1 : y0; let v = i & 4 ? v1 : v0;
        if (sw && sw.a && sw.ax === 'h') { const dy = y - sw.hy; const dv = v - sw.hv; const c = Math.cos(sw.a); const sn = Math.sin(sw.a); y = sw.hy + dy * c - sw.sgn * dv * sn; v = sw.hv + sw.sgn * dy * sn + dv * c; }
        else if (sw && sw.a) { const du = u - sw.hu; const dv = v - sw.hv; const c = Math.cos(sw.a); const sn = Math.sin(sw.a) * sw.side; u = sw.hu + du * c - dv * sn; v = sw.hv + du * sn + dv * c; }
        const [x, z] = map(u, v); C.push([x, y, z]);
      }
      boxes.push({ corners: C, color, kind, tex: doorTex && color === door && ['front', 'infill', 'door', 'tray'].includes(kind) ? doorTex : null, ref: { ri, ci: curCi, front: curFront } });
    };
    // one door (or a pair / set of doors) of a cabinet front: ua..ub wide, ya..yb tall, n doors side by side, opening direction dir
    const putDoors = (ua, ub, ya, yb, n, dir, glazedN, keyOf, foOf, d, t, skip = null, noHandle = false) => {
      const dw = (ub - ua) / n;
      for (let i = 0; i < n; i++) {
        if (skip && skip.has(i)) continue; // an open place: no door
        const sliding = dir === 'slide' && n > 1; // sliding doors share one state: the back door runs behind the front one
        curFront = keyOf(sliding ? 0 : i); const fo = foOf(sliding ? 0 : i);
        const a = ua + i * dw; const b = a + dw; const gl = i < glazedN;
        const left = dir === 'right' ? false : dir === 'left' ? true : n === 1 || i % 2 === 0; // handle side opposite the hinge
        let sw = null; let du = 0; let vz = 0;
        if (dir === 'shutter') { // a roller shutter (tambour): horizontal slats that roll up into the top of the cabinet
          const full = yb - ya - .4; const vis = Math.max(5, full * (1 - Math.min(1, fo) * .93)); const nS = Math.max(2, Math.round(vis / 3)); const sh = vis / nS;
          for (let q = 0; q < nS; q++) put(a + .2, b - .2, d, d + 1.2, yb - .2 - (q + 1) * sh + .15, yb - .2 - q * sh - .15, gl ? '#bfe0f2' : q % 2 ? dark(alu ? frame : door, .92) : alu ? frame : door, 'front');
          put(a + 4, b - 4, d + 1.2, d + 2.6, yb - .2 - vis, yb - .2 - vis + 2.2, STEEL, 'handle'); put(a + .2, b - .2, d, d + 2.4, yb - 3.2, yb - .2, STEEL, 'handle');
          continue;
        }
        if (dir === 'up') sw = fo > 0 ? { ax: 'h', hy: yb, hv: d, a: fo * 1.6, sgn: -1 } : null;
        else if (dir === 'down') sw = fo > 0 ? { ax: 'h', hy: ya, hv: d, a: fo * 1.6, sgn: 1 } : null;
        else if (dir === 'slide') { // two doors run on two tracks and swap sides; a single door slides along its own width
          vz = (i % 2) * 2.6 + 0.2;
          du = n === 1 ? fo * dw * 0.9 * (left ? 1 : -1) : i % 2 === 0 ? fo * dw : 0;
        }
        else if (fo > 0) sw = { hu: left ? a + .2 : b - .2, hv: d, a: fo * 1.75, side: left ? 1 : -1 };
        put(a + .2 + du, b - .2 + du, d + vz, d + vz + 1.8, ya + .2, yb - .2, gl ? '#bfe0f2' : alu ? frame : door, gl ? 'glass' : 'front', sw);
        if (alu && !gl) { const fw = Math.min(style.frame_w || 4.5, dw / 3); put(a + .2 + fw + du, b - .2 - fw + du, d + vz + 1.8, d + vz + 2.2, ya + .2 + fw, yb - .2 - fw, door, 'infill', sw); }
        const hy = yb - (yb - ya) * (t.wall ? .8 : .25); const hz = d + vz + 1.8;
        if (noHandle) continue; // the hidden handle (a groove under the top) replaces it
        if (dir === 'up') put((a + b) / 2 - 6, (a + b) / 2 + 6, hz, hz + 1.4, ya + 2.5, ya + 3.7, STEEL, 'handle', sw);
        else if (dir === 'down') put((a + b) / 2 - 6, (a + b) / 2 + 6, hz, hz + 1.4, yb - 3.7, yb - 2.5, STEEL, 'handle', sw);
        else if (dir === 'slide') { const hx = (n === 1 ? !left : i % 2 === 1) ? a + 3 : b - 4; put(hx + du, hx + 1.2 + du, hz, hz + 1.4, (ya + yb) / 2 - 6, (ya + yb) / 2 + 6, STEEL, 'handle'); }
        else { const hx = left ? b - 4 : a + 3; put(hx, hx + 1.2, hz, hz + 1.4, (t.tall && !t.wall ? ya + (yb - ya) * .5 : hy) - 6, (t.tall && !t.wall ? ya + (yb - ya) * .5 : hy) + 6, STEEL, 'handle', sw); }
      }
      curFront = null;
    };
    // an appliance seen from the front, between u0..u1 and y0..y1, its face at depth v
    const appliance = (k, u0, u1, y0, y1, v, deep) => {
      const w = u1 - u0; const h = y1 - y0; const bd = Math.max(10, deep);
      if (k === 'hood') return;
      if (k === 'fridge' || k === 'freezer') { put(u0, u1, v - bd, v, y0, y1, STEEL, 'appl'); const sp = k === 'fridge' && h > 130 ? y0 + h * .35 : null; if (sp) put(u0 + .3, u1 - .3, v, v + .6, sp - .3, sp + .3, '#8f969f', 'appl'); put(u1 - 6, u1 - 4.4, v, v + 2.6, y0 + h * .55, y0 + h * .88, '#8f969f', 'appl'); if (sp) put(u1 - 6, u1 - 4.4, v, v + 2.6, y0 + h * .08, sp - 6, '#8f969f', 'appl'); return; }
      if (k === 'dishwasher') { put(u0, u1, v - bd, v, y0, y1, STEEL, 'appl'); put(u0 + 1, u1 - 1, v, v + .6, y1 - 9, y1 - 1, BLACK, 'appl'); put(u0 + 5, u1 - 5, v, v + 2.4, y1 - 14, y1 - 12.6, '#8f969f', 'appl'); return; }
      if (k === 'washer' || k === 'dryer') { put(u0, u1, v - bd, v, y0, y1, '#e9ecef', 'appl'); const cx = (u0 + u1) / 2; const cy = y0 + h * .45; const r = Math.min(w, h) * .3; put(cx - r, cx + r, v, v + .8, cy - r, cy + r, GLASSY, 'appl'); put(u0 + 3, u1 - 3, v, v + .6, y1 - 7, y1 - 3, '#b7bec7', 'appl'); return; }
      if (k === 'cooker') { put(u0, u1, v - bd, v, y0, y1, STEEL, 'appl'); put(u0 + 3, u1 - 3, v, v + .6, y0 + h * .12, y0 + h * .6, BLACK, 'appl'); put(u0 + 5, u1 - 5, v, v + 2.4, y0 + h * .66, y0 + h * .66 + 1.3, '#8f969f', 'appl'); return; }
      // oven, microwave, coffee machine: a black glass front with a window and a handle
      put(u0, u1, v - bd, v, y0, y1, BLACK, 'appl'); put(u0 + 3, u1 - 3, v, v + .5, y0 + 3, y1 - (k === 'oven' ? 9 : 4), GLASSY, 'appl');
      put(u0 + 4, u1 - 4, v, v + 2.2, y1 - (k === 'oven' ? 7 : 3.4), y1 - (k === 'oven' ? 5.8 : 2.4), '#9aa1aa', 'appl');
    };
    let u = 0; const starts = runStarts(spec, ri);
    for (const [ci, c] of (run.cabinets || []).entries()) {
      curCi = ci; u = starts[ci] ?? u;
      const t = CAB_TYPES[c.type] || CAB_TYPES.base; const w = +c.w || 0; const h = +c.h || 0; const d = +c.d || 0;
      const skirt = hasSkirt(c); const y0 = t.wall ? (c.y !== undefined && c.y !== '' && Number.isFinite(+c.y) ? +c.y : style.wall_height) : skirt ? style.plinth : 0;
      if (t.gap) {
        curFront = null;
        if (c.appliance && APPLIANCES[c.appliance]) appliance(c.appliance, u + .5, u + w - .5, hasSkirt(c) ? style.plinth : 0, c.appliance === 'fridge' || c.appliance === 'freezer' ? Math.min(h, 200) : Math.min(h, APPLIANCES[c.appliance][1] + (hasSkirt(c) ? style.plinth : 0)), d - 2, d - 2);
        if (hasSkirt(c)) put(u + 1, u + w - 1, 4, d - 4, 0, style.plinth, '#6f7885', 'plinth');
        u += w; continue;
      }
      if (t.shelf) { for (let q = 0; q < shelfCount(c); q++) { const ys = y0 + q * (h + shelfGap(c)); put(u, u + w, 0, d, ys, ys + h, '#d9c9a8', 'carcass'); } u += w; continue; }
      if (t.hood) { put(u, u + w, 0, d, y0, y0 + 10, STEEL, 'carcass'); put(u + w * .3, u + w * .7, 0, Math.min(d * .5, 24), y0 + 10, y0 + h, STEEL, 'carcass'); u += w; continue; }
      const cabOp = +open[`${ri}|${ci}`] || 0;
      const fOpen = (k) => { const x = open[`${ri}|${ci}|${k}`]; return Math.max(0, Math.min(1, +(x === undefined ? cabOp : x) || 0)); }; // one drawer or door on its own, else the whole cabinet
      const fronts = frontsOf(c); const slots = layoutSlots(c);
      const op = Math.max(cabOp, ...fronts.map((f) => fOpen(f.key)), 0);
      const dir = c.dir && DIRS[c.dir] ? c.dir : 'auto';
      const doors = t.corner ? 2 : Math.round(+c.doors || 0); const drawers = Math.round(+c.drawers || 0); const glazed = spec.style?.door_kind === 'glass' ? doors : Math.min(doors, Math.round(+c.glazed || 0));
      const openSet = t.corner ? new Set() : openDoorsOf(c); const hid = !slots && hasHiddenHandle(c, style);
      const hollow = op > 0 || slots || (!doors && !drawers) || openSet.size > 0;
      curFront = null;
      if (t.corner) { // an L: the long leg on the wall, the return leg along the neighbouring wall
        const right = (c.side || (ci === 0 && (run.cabinets || []).length > 1 ? 'left' : 'right')) !== 'left'; const uf = right ? u + w - d : u + d; const lb = right ? [u + w - d, u + w] : [u, u + d];
        if (hollow) {
          put(u, u + w, 0, 1, y0, y0 + h, carcass, 'carcass'); put(right ? u : u + w - T, right ? u + T : u + w, 0, d, y0, y0 + h, carcass, 'carcass');
          put(right ? u + w - T : u, right ? u + w : u + T, 0, w, y0, y0 + h, carcass, 'carcass');
          for (const yy of [y0, y0 + h - T]) { put(u + T, u + w - T, 0, d, yy, yy + T, inner, 'carcass'); if (w > d) put(lb[0] + (right ? 0 : T), lb[1] - (right ? T : 0), d, w, yy, yy + T, inner, 'carcass'); }
          const sh = Math.round(+c.shelves || 0); for (let i = 1; i <= sh; i++) { const yy = y0 + (h * i) / (sh + 1); put(u + T, u + w - T, 1, d - 3, yy, yy + 1.2, inner, 'carcass'); if (w > d) put(lb[0] + (right ? 0 : T), lb[1] - (right ? T : 0), d - 3, w - 1, yy, yy + 1.2, inner, 'carcass'); }
        } else { put(u, u + w, 0, d, y0, y0 + h, carcass, 'carcass'); boxes.at(-1).solid = true; if (w > d) { put(lb[0], lb[1], d, w, y0, y0 + h, carcass, 'carcass'); boxes.at(-1).solid = true; } }
        if (skirt) { put(u + 1, u + w - 1, 4, d - 4, 0, style.plinth, '#6f7885', 'plinth'); if (w > d) put(lb[0] + 1, lb[1] - 1, d, w - 4, 0, style.plinth, '#6f7885', 'plinth'); }
        const gl0 = glazed > 0; const dwA = w - d; const fo0 = fOpen('f0'); const fo1 = fOpen('f1');
        // front door on the long leg
        curFront = 'f0'; const ua = right ? u : u + d; const ub = ua + dwA;
        put(ua + .2, ub - .2, d, d + 1.8, y0 + .2, y0 + h - .2, gl0 ? '#bfe0f2' : alu ? frame : door, gl0 ? 'glass' : 'front', fo0 > 0 ? { hu: right ? ua + .2 : ub - .2, hv: d, a: fo0 * 1.75, side: right ? 1 : -1 } : null);
        put(right ? ub - 5 : ua + 3.8, right ? ub - 3.8 : ua + 5, d + 1.8, d + 3.2, y0 + h * (t.wall ? .2 : .75) - 6, y0 + h * (t.wall ? .2 : .75) + 6, STEEL, 'handle', fo0 > 0 ? { hu: right ? ua + .2 : ub - .2, hv: d, a: fo0 * 1.75, side: right ? 1 : -1 } : null);
        // side door on the return leg, facing the room
        curFront = 'f1'; const sw1 = fo1 > 0 ? { hu: uf, hv: w - .2, a: fo1 * 1.75, side: right ? -1 : 1 } : null;
        if (right) put(uf - 1.8, uf, d + .2, w - .2, y0 + .2, y0 + h - .2, alu ? frame : door, 'front', sw1); else put(uf, uf + 1.8, d + .2, w - .2, y0 + .2, y0 + h - .2, alu ? frame : door, 'front', sw1);
        put(right ? uf - 3.2 : uf + 1.8, right ? uf - 1.8 : uf + 3.2, d + 4, d + 5.2, y0 + h * (t.wall ? .2 : .75) - 6, y0 + h * (t.wall ? .2 : .75) + 6, STEEL, 'handle', sw1);
        curFront = null;
        if (t.counter) { put(u, u + w, 0, d + over, y0 + h, y0 + h + ct, top, 'top'); if (w > d) put(lb[0], lb[1], d, w, y0 + h, y0 + h + ct, top, 'top'); }
        { // accessories of an L-corner: the carousel sits in the elbow, a bin in the long leg, a light on the toe-kick
          const ac = c.acc || []; const ex = right ? u + w - d / 2 : u + d / 2; const bot = y0 + T; const room = h - 2 * T;
          if (ac.includes('lights') && skirt) put(u + 3, u + w - 3, d - 4.2, d - 3.6, style.plinth * .3, style.plinth * .3 + 2.6, '#ffe066', 'acc');
          if (hollow && ac.includes('lazy') && room > 25) { const r = d * .36; for (const f of [.15, .6]) { const sy = bot + room * f; put(ex - r, ex + r, d / 2 - r, d / 2 + r, sy, sy + .8, '#e8e4dc', 'acc'); put(ex - r, ex + r, d / 2 - r, d / 2 - r + .8, sy + .8, sy + 3, '#e8e4dc', 'acc'); } put(ex - .8, ex + .8, d / 2 - .8, d / 2 + .8, bot, bot + room * .6 + .8, STEEL, 'acc'); }
          if (hollow && ac.includes('bin') && room > 25 && w > d + 20) { put(ua + 8, ub - 8, d * .3, d * .85, bot + .5, bot + Math.min(34, room * .55), '#4b5563', 'acc'); }
          if (ac.includes('tap') && t.counter) put(ex - 1.5, ex + 1.5, d / 2 - 1.5, d / 2 + 1.5, y0 + h + ct, y0 + h + ct + 22, '#d7dbe0', 'acc');
        }
        u += w; continue;
      }
      if (hollow) { // a hollow carcass, so the inside shows when doors or drawers are open, or when the cabinet has no doors
        put(u, u + w, 0, 1, y0, y0 + h, carcass, 'carcass'); put(u, u + T, 0, d, y0, y0 + h, carcass, 'carcass'); put(u + w - T, u + w, 0, d, y0, y0 + h, carcass, 'carcass');
        put(u + T, u + w - T, 0, d, y0, y0 + T, inner, 'carcass'); put(u + T, u + w - T, 0, d, y0 + h - T, y0 + h, inner, 'carcass');
        if (!slots) { const sh = Math.round(+c.shelves || 0); for (let i = 1; i <= sh; i++) put(u + T, u + w - T, 1, d - 3, y0 + (h * i) / (sh + 1), y0 + (h * i) / (sh + 1) + 1.2, inner, 'carcass'); }
      } else { put(u, u + w, 0, d, y0, y0 + h, carcass, 'carcass'); boxes.at(-1).solid = true; }
      if (skirt) put(u + 1, u + w - 1, 4, d - 4, 0, style.plinth, '#6f7885', 'plinth');
      const zn = zonesOf(c);
      if (slots) { // stacked slots from the floor up
        const fixed = slots.reduce((a, x) => a + x.h, 0); const free = slots.filter((x) => !(x.h > 0)).length; let ys = y0;
        slots.forEach((sl, i) => {
          const hh = sl.h > 0 ? sl.h : Math.max(0, (h - fixed) / (free || 1)); const ya = ys; const yb = Math.min(y0 + h, ys + hh); ys = yb;
          if (i < slots.length - 1) put(u + T, u + w - T, 1, d - 2, yb - .6, yb + .6, inner, 'carcass');
          if (sl.k === 'door' || sl.k === 'glass') putDoors(u, u + w, ya, yb, sl.n, sl.dir, sl.k === 'glass' ? sl.n : 0, () => 's' + i, () => fOpen('s' + i), d, t);
          else if (sl.k === 'drawer') { curFront = 's' + i; const o = fOpen('s' + i) * Math.min(d * 0.7, 40); if (o > 0.5) put(u + T + .3, u + w - T - .3, d + o - (d - 6), d + o, ya + 3, ya + (yb - ya) * 0.62, '#d9d0bd', 'tray'); put(u + .2, u + w - .2, d + o, d + o + 1.8, ya + .2, yb - .2, alu ? frame : door, 'front'); put(u + w * .35, u + w * .65, d + o + 1.8, d + o + 3, ya + (yb - ya) * .55, ya + (yb - ya) * .62, STEEL, 'handle'); curFront = null; }
          else if (sl.k !== 'open') appliance(sl.k, u + T, u + w - T, ya + .6, yb - .6, d - 1, d - 4);
        });
      } else {
        if (drawers) {
          const z = zn.drawers; const dh = (z.h - (hid && z.y + z.h >= h - .01 ? 3.5 : 0)) / drawers; const zu = u + z.x; // under a hidden handle the top front stops below the groove
          for (let i = 0; i < drawers; i++) {
            curFront = 'd' + i; const o = fOpen(curFront) * Math.min(d * 0.7, 40);
            const ya = y0 + z.y + i * dh; const yb = ya + dh;
            if (o > 0.5) { const L = d - 6; put(zu + T + .3, zu + z.w - T - .3, d + o - L, d + o, ya + 3, ya + dh * 0.62, '#d9d0bd', 'tray'); }
            put(zu + .2, zu + z.w - .2, d + o, d + o + 1.8, ya + .2, yb - .2, alu ? frame : door, 'front');
            if (!hid) put(zu + z.w * .35, zu + z.w * .65, d + o + 1.8, d + o + 3, ya + dh * .55, ya + dh * .62, STEEL, 'handle');
          }
          curFront = null;
        }
        if (doors) { const z = zn.doors; const top = y0 + z.y + z.h - (hid && !drawers ? 3.5 : 0); putDoors(u + z.x, u + z.x + z.w, y0 + z.y, top, doors, dir, glazed, (i) => 'f' + i, (i) => fOpen('f' + i), d, t, openSet, hid); }
        if (hid) for (const [a, b] of hiddenSegments(c)) { put(u + a, u + b, d - 3, d - .4, y0 + h - 3.3, y0 + h - .2, '#2f343b', 'handle'); put(u + a, u + b, d - .4, d + .3, y0 + h - 3.3, y0 + h - 2.6, STEEL, 'handle'); } // the hidden-handle groove: dark channel with a light lip, only over the doors
      }
      curFront = null;
      const ytop = y0 + h;
      if (t.counter && t.sink) { // a sink: the top has a real opening, and the stainless bowl sits in it
        const hu0 = u + w * .1; const hu1 = u + w * .9; const hv0 = d * .16; const hv1 = d * .8;
        put(u, u + w, 0, hv0, ytop, ytop + ct, top, 'top'); put(u, u + w, hv1, d + over, ytop, ytop + ct, top, 'top'); put(u, hu0, hv0, hv1, ytop, ytop + ct, top, 'top'); put(hu1, u + w, hv0, hv1, ytop, ytop + ct, top, 'top');
        const bw = (hu1 - hu0) * .52; const gap = (hu1 - hu0) - 2 * bw; const depthB = Math.max(1, ct);
        for (const [b0, b1] of [[hu0, hu0 + bw], [hu1 - bw, hu1]]) { // two bowls side by side, or one wide bowl on a narrow cabinet
          if (w < 70 && b0 !== hu0) continue;
          const x0 = b0; const x1 = w < 70 ? hu1 : b1;
          put(x0, x1, hv0, hv1, ytop - 0.01, ytop + .25, '#b9c0c9', 'acc'); put(x0 + 2.2, x1 - 2.2, hv0 + 2.2, hv1 - 2.2, ytop + .25, ytop + .6, '#8e98a4', 'acc');
          const cx = (x0 + x1) / 2; const cv = (hv0 + hv1) / 2; put(cx - 1.6, cx + 1.6, cv - 1.6, cv + 1.6, ytop + .6, ytop + .9, '#454c55', 'acc');
          if (w < 70) break;
        }
        void gap; void depthB;
      } else if (t.counter) put(u, u + w, 0, d + over, ytop, ytop + ct, top, 'top');
      if (alu && (c.door_side === 'left' || c.door_side === 'right') && !t.tall && !t.corner && !t.gap && !t.shelf && !t.hood) { // a door on the side of the cabinet: frame with its infill
        const x0 = c.door_side === 'left' ? u - 1.2 : u + w; put(x0, x0 + 1.2, 0, d, y0, y0 + h, frame, 'frame'); // full size: the door covers the whole side
        const xi = c.door_side === 'left' ? x0 - .3 : x0 + 1.2; put(xi, xi + .3, 4, d - 4, y0 + 4, y0 + h - 4, door, 'infill');
        put(c.door_side === 'left' ? x0 - .8 : x0 + 1.2, c.door_side === 'left' ? x0 : x0 + 2, d - 3, d - 2, y0 + h * .35, y0 + h * .65, STEEL, 'handle');
      }
      // accessories
      const accs = c.acc || [];
      if (t.sink || (accs.includes('tap') && t.counter)) { const tx = u + w * .5; put(tx - 1.5, tx + 1.5, 3, 6, ytop + ct, ytop + ct + 22, '#d7dbe0', 'acc'); put(tx - 1.2, tx + 1.2, 3, 20, ytop + ct + 20, ytop + ct + 23, '#d7dbe0', 'acc'); }
      if (t.hob) { put(u + w * .08, u + w * .92, d * .15, d * .85, ytop + ct, ytop + ct + .6, '#1d2026', 'acc'); for (const [dx, dy] of [[.3, .3], [.7, .3], [.3, .68], [.7, .68]]) { const r = Math.min(w, d) * .11; put(u + w * dx - r, u + w * dx + r, d * dy - r, d * dy + r, ytop + ct + .6, ytop + ct + 1.2, '#4a5058', 'acc'); } }
      // every accessory has a picture; inside ones show when the door or drawer is opened
      const AL = '#ffe066'; const BIN = '#4b5563'; const WIRE = '#c3c9d1'; const cw = w - 2 * T; const bot = y0 + T; const room = h - 2 * T;
      if (accs.includes('lights')) { // LED strip: under a wall unit, in the toe-kick of a floor unit, up the front edge of a tall one
        if (t.wall) put(u + 3, u + w - 3, d - 7, d - 2.5, y0 - .8, y0, AL, 'acc');
        else if (t.tall) put(u + 1.5, u + 3, d, d + .6, y0 + 8, y0 + h - 8, AL, 'acc');
        else if (hasSkirt(c)) put(u + 3, u + w - 3, d - 4.2, d - 3.6, style.plinth * .3, style.plinth * .3 + 2.6, AL, 'acc');
        else put(u + 3, u + w - 3, 1, 2.2, ytop - 1.2, ytop - .2, AL, 'acc');
      }
      if (accs.includes('rail') && t.counter) { put(u + 5, u + w - 5, 0.4, 2.4, ytop + ct + 38, ytop + ct + 39.6, STEEL, 'acc'); for (const f of [.25, .5, .75]) put(u + w * f - .6, u + w * f + .6, 0.4, 3, ytop + ct + 33, ytop + ct + 38, STEEL, 'acc'); }
      if (hollow && accs.includes('bin') && room > 25) { const bx = u + T + cw * .15; const bw2 = cw * .7; put(bx, bx + bw2, d * .3, d * .85, bot + .5, bot + Math.min(34, room * .55), BIN, 'acc'); put(bx - .3, bx + bw2 + .3, d * .3, d * .85, bot + Math.min(34, room * .55), bot + Math.min(34, room * .55) + 1, '#2f3640', 'acc'); } // pull-out waste bin: a bin standing on the floor of the cabinet
      if (hollow && accs.includes('cutlery') && room > 12) { const ty = y0 + h - T - 9; put(u + T + 1, u + w - T - 1, 4, d - 6, ty, ty + 1, '#b08d57', 'acc'); for (let q = 1; q < 4; q++) put(u + T + 1 + (cw - 2) * q / 4 - .3, u + T + 1 + (cw - 2) * q / 4 + .3, 4, d - 6, ty + 1, ty + 4.5, '#b08d57', 'acc'); put(u + T + 1, u + w - T - 1, d - 6.6, d - 6, ty + 1, ty + 4.5, '#b08d57', 'acc'); put(u + T + 1, u + w - T - 1, 4, 4.6, ty + 1, ty + 4.5, '#b08d57', 'acc'); } // cutlery tray with dividers, high up in the cabinet
      if (hollow && accs.includes('pullout') && room > 20) { const by = bot + 6; const bx0 = u + T + 2; const bx1 = u + w - T - 2; put(bx0, bx1, 6, d - 8, by, by + .6, WIRE, 'acc'); for (const [x, v] of [[bx0, 6], [bx1 - .6, 6], [bx0, d - 8.6], [bx1 - .6, d - 8.6]]) put(x, x + .6, v, v + .6, by, by + 16, WIRE, 'acc'); put(bx0, bx1, d - 8.6, d - 8, by + 15.4, by + 16, WIRE, 'acc'); put(bx0, bx1, 6, 6.6, by + 15.4, by + 16, WIRE, 'acc'); } // wire basket
      if (hollow && accs.includes('spice') && room > 30) { const sx = u + T + 1; const sw2 = Math.min(15, cw - 2); const top2 = bot + Math.min(room - 2, 60); put(sx, sx + .6, 6, d - 8, bot, top2, '#9a7b4f', 'acc'); put(sx + sw2 - .6, sx + sw2, 6, d - 8, bot, top2, '#9a7b4f', 'acc'); for (let q = 0; q <= 4; q++) { const sy = bot + ((top2 - bot) * q) / 4; put(sx, sx + sw2, 6, d - 8, sy, sy + .8, '#9a7b4f', 'acc'); if (q < 4) for (const f of [.3, .7]) put(sx + sw2 * f - 1.6, sx + sw2 * f + 1.6, d * .5 - 1.6, d * .5 + 1.6, sy + .8, sy + 6, '#b34a3a', 'acc'); } } // pull-out spice rack with jars
      if (hollow && accs.includes('lazy') && room > 25) { const cx2 = u + w / 2; const cv2 = d * .5; const r = Math.min(cw, d - 6) * .42; for (const f of [.15, .6]) { const sy = bot + room * f; put(cx2 - r, cx2 + r, cv2 - r, cv2 + r, sy, sy + .8, '#e8e4dc', 'acc'); put(cx2 - r, cx2 + r, cv2 - r, cv2 - r + .8, sy + .8, sy + 3, '#e8e4dc', 'acc'); } put(cx2 - .8, cx2 + .8, cv2 - .8, cv2 + .8, bot, bot + room * .6 + .8, STEEL, 'acc'); } // lazy-susan: two round shelves on a post
      if (hollow && accs.includes('soft') && !t.wall) { for (const sx of [u + T + .5, u + w - T - 1.5]) put(sx, sx + 1, d - 4, d - 1, y0 + h * .5, y0 + h * .5 + 3, '#9aa1aa', 'acc'); } // soft-close dampers on the door edge (small)
      u += w;
    }
  });
  return boxes;
}

const FACES = [ // [normal, corner indexes] — corners are numbered by bits: x=1, y=2, z=4
  [[0, 0, 1], [4, 5, 7, 6]], [[0, 0, -1], [0, 2, 3, 1]], [[1, 0, 0], [1, 3, 7, 5]], [[-1, 0, 0], [0, 4, 6, 2]], [[0, 1, 0], [2, 6, 7, 3]], [[0, -1, 0], [0, 1, 5, 4]],
];
/** Draw the boxes on a canvas. view = { yaw, pitch, zoom }. Returns nothing. */
export function draw3D(canvas, boxes, view = {}) {
  const sel = view.selected; const hov = view.hover; const same = (a, b) => a && b && a.ri === b.ri && a.ci === b.ci; canvas._hit = [];
  const ctx = canvas.getContext('2d'); const W = canvas.width; const H = canvas.height; ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#eef2f6'; ctx.fillRect(0, 0, W, H);
  if (!boxes.length) return;
  const mn = [Infinity, 0, Infinity]; const mx = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) for (const q of b.corners) { mn[0] = Math.min(mn[0], q[0]); mn[2] = Math.min(mn[2], q[2]); mx[0] = Math.max(mx[0], q[0]); mx[1] = Math.max(mx[1], q[1]); mx[2] = Math.max(mx[2], q[2]); }
  if (view.bounds) { mn[0] = view.bounds.mn[0]; mn[2] = view.bounds.mn[2]; mx[0] = view.bounds.mx[0]; mx[1] = view.bounds.mx[1]; mx[2] = view.bounds.mx[2]; } // a fixed frame while a cabinet is being dragged
  canvas._bounds = { mn: [...mn], mx: [...mx] };
  const cx = (mn[0] + mx[0]) / 2; const cy = mx[1] / 2; const cz = (mn[2] + mx[2]) / 2; const size = Math.max(mx[0] - mn[0], mx[1], mx[2] - mn[2], 100);
  const yaw = view.yaw ?? -0.55; const pitch = view.pitch ?? 0.45; const dist = size * 1.5; const f = Math.min(W, H) * 1.05 * (view.zoom || 1); const panX = view.panX || 0; const panY = view.panY || 0;
  const cyw = Math.cos(yaw); const syw = Math.sin(yaw); const cp = Math.cos(pitch); const sp = Math.sin(pitch);
  const rot = (X, Y, Z) => { // orbit: turn by yaw around the vertical axis, then tilt by pitch; depth grows away from the viewer
    const x1 = X * cyw - Z * syw; const zz = X * syw + Z * cyw;
    return [x1, Y * cp - zz * sp, -(Y * sp + zz * cp)];
  };
  canvas._cam = { cx, cy, cz, yaw, pitch, dist, f, W, H, panX, panY };
  const cam = (x, y, z) => { const r = rot(x - cx, y - cy, z - cz); return [r[0], r[1], r[2] + dist]; };
  const proj = ([x, y, z]) => [W / 2 + panX + (x * f) / z, H / 2 + panY - (y * f) / z];
  // the floor and the back wall give the kitchen some context
  const quad = (pts, fill, stroke) => { const p = pts.map((q) => proj(cam(...q))); ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } };
  const pad = 40; const fx0 = mn[0] - pad; const fx1 = mx[0] + pad; const fz1 = mx[2] + pad;
  quad([[fx0, 0, -2], [fx1, 0, -2], [fx1, 0, fz1], [fx0, 0, fz1]], '#d8dee6', '#c2cad4');
  quad([[fx0, 0, -2], [fx1, 0, -2], [fx1, 260, -2], [fx0, 260, -2]], '#f7f7f4', '#dfe2e6');
  const faces = [];
  for (const b of boxes) {
    const C = b.corners; const mid = [0, 1, 2].map((k) => C.reduce((t, q) => t + q[k], 0) / 8);
    for (const [, idx] of FACES) {
      const q = idx.map((i) => C[i]); const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]]; const e2 = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const L = Math.hypot(...n) || 1; n = n.map((x) => x / L);
      const fc = [0, 1, 2].map((k) => (q[0][k] + q[1][k] + q[2][k] + q[3][k]) / 4);
      if (n[0] * (fc[0] - mid[0]) + n[1] * (fc[1] - mid[1]) + n[2] * (fc[2] - mid[2]) < 0) n = n.map((x) => -x); // outward
      const pts = q.map((c) => cam(...c)); const nc = rot(n[0], n[1], n[2]); // back-face culling with the true normal
      if (nc[0] * pts[0][0] + nc[1] * pts[0][1] + nc[2] * pts[0][2] >= 0) continue;
      const light = n[1] > 0.5 ? 1.08 : n[1] < -0.5 ? .6 : 0.78 + 0.17 * Math.abs(n[2]);
      faces.push({ pts, depth: pts.reduce((a, p) => a + p[2], 0) / 4 + (b.solid || b.kind === "plinth" ? 35 : 0), // a solid cabinet body (and its plinth, which sits under it) is drawn as if a little farther away, so its doors and drawers always land on top of its big front face
         fill: shade(b.color, light), light, tex: b.tex, wq: q, ref: b.ref, kind: b.kind, on: same(b.ref, sel) ? 2 : same(b.ref, hov) ? 1 : 0 });
    }
  }
  faces.sort((a, b) => b.depth - a.depth);
  for (const fc of faces) { if (fc.pts.some((p) => p[2] < 5)) continue; const p = fc.pts.map(proj); ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fc.fill; ctx.fill();
    if (fc.tex && p.length === 4 && Math.min(Math.hypot(...[0, 1, 2].map((i) => fc.wq[1][i] - fc.wq[0][i])), Math.hypot(...[0, 1, 2].map((i) => fc.wq[3][i] - fc.wq[0][i]))) > 4) { // a picture on the face: the image is laid on the face's own corners, grain running up the face, then shaded like the plain colour
      const q = fc.wq; const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]]; const e3 = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
      const swap = Math.abs(e1[1]) > Math.abs(e3[1]); // grain runs up the face
      const c = fc.pts; const P = (s, t) => { const o = [0, 1, 2].map((i) => c[0][i] + (c[swap ? 3 : 1][i] - c[0][i]) * s + (c[swap ? 1 : 3][i] - c[0][i]) * t); return proj(o); }; // s across, t up, in camera space so the perspective is right
      const iw = fc.tex.naturalWidth; const ih = fc.tex.naturalHeight; const xs = Math.max(...p.map((q) => q[0])) - Math.min(...p.map((q) => q[0])); const N = xs > 70 ? 6 : xs > 25 ? 3 : 1;
      ctx.save(); ctx.clip();
      const tri = (A, B, C, a, b, cc) => { // paint the picture's triangle a,b,cc onto the screen triangle A,B,C
        const det = (b[0] - a[0]) * (cc[1] - a[1]) - (cc[0] - a[0]) * (b[1] - a[1]); if (!det) return;
        const m11 = ((B[0] - A[0]) * (cc[1] - a[1]) - (C[0] - A[0]) * (b[1] - a[1])) / det; const m21 = ((C[0] - A[0]) * (b[0] - a[0]) - (B[0] - A[0]) * (cc[0] - a[0])) / det;
        const m12 = ((B[1] - A[1]) * (cc[1] - a[1]) - (C[1] - A[1]) * (b[1] - a[1])) / det; const m22 = ((C[1] - A[1]) * (b[0] - a[0]) - (B[1] - A[1]) * (cc[0] - a[0])) / det;
        const gx = (A[0] + B[0] + C[0]) / 3; const gy = (A[1] + B[1] + C[1]) / 3; const grow = (V) => [V[0] + Math.sign(V[0] - gx) * .6, V[1] + Math.sign(V[1] - gy) * .6];
        const [A2, B2, C2] = [grow(A), grow(B), grow(C)];
        ctx.save(); ctx.beginPath(); ctx.moveTo(A2[0], A2[1]); ctx.lineTo(B2[0], B2[1]); ctx.lineTo(C2[0], C2[1]); ctx.closePath(); ctx.clip();
        ctx.transform(m11, m12, m21, m22, A[0] - m11 * a[0] - m21 * a[1], A[1] - m12 * a[0] - m22 * a[1]); ctx.drawImage(fc.tex, 0, 0); ctx.restore();
      };
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const s0 = i / N; const s1 = (i + 1) / N; const t0 = j / N; const t1 = (j + 1) / N;
        const Q = [P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)]; const T = [[s0 * iw, t0 * ih], [s1 * iw, t0 * ih], [s1 * iw, t1 * ih], [s0 * iw, t1 * ih]];
        tri(Q[0], Q[1], Q[2], T[0], T[1], T[2]); tri(Q[0], Q[2], Q[3], T[0], T[2], T[3]);
      }
      ctx.restore(); ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); // (the picture drawing used the path for its triangles: draw the face outline again)
      ctx.fillStyle = fc.light < 1 ? `rgba(0,0,0,${Math.min(.6, 1 - fc.light).toFixed(2)})` : `rgba(255,255,255,${Math.min(.3, fc.light - 1).toFixed(2)})`; ctx.fill();
    }
    if (fc.on) { ctx.fillStyle = fc.on === 2 ? 'rgba(255,140,0,.38)' : 'rgba(40,120,255,.22)'; ctx.fill(); } ctx.strokeStyle = fc.on === 2 ? '#e07b00' : 'rgba(30,45,62,.55)'; ctx.lineWidth = fc.on === 2 ? 1.8 : .8; ctx.stroke(); if (fc.ref && fc.ref.ci >= 0) canvas._hit.push({ poly: p, ref: fc.ref, kind: fc.kind }); }
}

/** Which cabinet is under a canvas point (the nearest face wins). Call after draw3D. */
export function pick3D(canvas, x, y) {
  const hits = canvas._hit || [];
  for (let i = hits.length - 1; i >= 0; i--) { // drawn last = nearest
    const { poly, ref, kind } = hits[i]; let inside = false;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const [xi, yi] = poly[a]; const [xj, yj] = poly[b]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; }
    if (inside) return { ...ref, kind };
  }
  return null;
}

/** The point on the horizontal plane y = planeY under a canvas point (world x, z), or null when the ray misses it. Call after draw3D. */
export function unproject(canvas, sx, sy, planeY = 0) {
  const c = canvas._cam; if (!c) return null;
  const dx = (sx - c.W / 2 - (c.panX || 0)) / c.f; const dy = -(sy - c.H / 2 - (c.panY || 0)) / c.f; const cp = Math.cos(c.pitch); const sp = Math.sin(c.pitch); const cyw = Math.cos(c.yaw); const syw = Math.sin(c.yaw);
  // a point on the ray at depth z (camera space): (dx*z, dy*z, z); the camera sits at z = dist, so world offsets use z - dist
  const at = (z) => { const xc = dx * z; const yc = dy * z; const zc = z - c.dist; const Y = yc * cp - zc * sp; const zz = -yc * sp - zc * cp; const X = xc * cyw + zz * syw; const Z = -xc * syw + zz * cyw; return [c.cx + X, c.cy + Y, c.cz + Z]; };
  const p1 = at(1); const p2 = at(2); const dY = p2[1] - p1[1]; if (Math.abs(dY) < 1e-9) return null;
  const t = (planeY - p1[1]) / dY; const pt = [p1[0] + t * (p2[0] - p1[0]), planeY, p1[2] + t * (p2[2] - p1[2])];
  return { x: pt[0], z: pt[2] };
}
