// 3D view of a kitchen: cabinets become boxes, a small painter's-algorithm renderer draws them on a canvas.
// scene() is pure (tested); draw3D() needs a canvas. All sizes in cm; x = right, y = up, z = towards the viewer (the back wall is z = 0).
import { CAB_TYPES, DEFAULT_STYLE, APPLIANCES, DIRS, slotsOf, zonesOf } from './kitchen.js';
import { colourHex, stoneHex } from './drawings.js';

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

const shade = (hex, f) => { const n = parseInt(String(hex).replace('#', ''), 16); const c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f))); return `rgb(${c(16)},${c(8)},${c(0)})`; };

/** The doors and drawers of a cabinet that can be opened on their own: [{ key, label }]. */
export function frontsOf(c) {
  const t = CAB_TYPES[c.type] || CAB_TYPES.base; const out = []; const slots = t.tall ? slotsOf(c) : null;
  if (slots) { slots.forEach((sl, i) => { if (['door', 'glass', 'drawer'].includes(sl.k)) out.push({ key: 's' + i, label: `${sl.k === 'drawer' ? 'Drawer' : 'Door'} ${i + 1}` }); }); return out; }
  const nd = Math.round(+c.drawers || 0); const nf = t.corner ? 2 : Math.round(+c.doors || 0);
  for (let i = 0; i < nd; i++) out.push({ key: 'd' + i, label: 'Drawer ' + (i + 1) });
  for (let i = 0; i < nf; i++) out.push({ key: 'f' + i, label: 'Door ' + (i + 1) });
  return out;
}

/** Boxes { corners[8], color, kind, ref } for the whole kitchen. open = { 'ri|ci': 0..1 } how far each cabinet's doors / drawers are open. */
export function scene(spec, open = {}) {
  const style = { ...DEFAULT_STYLE, ...(spec.style || {}) }; const ct = Math.max(0, +spec.counter?.thickness || 2); const over = +spec.counter?.front || 0;
  const door = colourHex(style.door_colour) || '#d9c9a8'; const carcass = '#e8e4dc'; const inner = '#f3efe6'; const top = stoneHex(spec.counter?.material) || '#6b6f78';
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
      boxes.push({ corners: C, color, kind, ref: { ri, ci: curCi, front: curFront } });
    };
    // one door (or a pair / set of doors) of a cabinet front: ua..ub wide, ya..yb tall, n doors side by side, opening direction dir
    const putDoors = (ua, ub, ya, yb, n, dir, glazedN, keyOf, foOf, d, t) => {
      const dw = (ub - ua) / n;
      for (let i = 0; i < n; i++) {
        curFront = keyOf(i); const fo = foOf(i);
        const a = ua + i * dw; const b = a + dw; const gl = i < glazedN;
        const left = dir === 'right' ? false : dir === 'left' ? true : n === 1 || i % 2 === 0; // handle side opposite the hinge
        let sw = null; let du = 0; let vz = 0;
        if (dir === 'up') sw = fo > 0 ? { ax: 'h', hy: yb, hv: d, a: fo * 1.6, sgn: -1 } : null;
        else if (dir === 'down') sw = fo > 0 ? { ax: 'h', hy: ya, hv: d, a: fo * 1.6, sgn: 1 } : null;
        else if (dir === 'slide') { vz = (i % 2) * 2.4 + 0.2; du = fo * dw * (n === 1 ? 0.5 : i % 2 === 0 ? 1 : 0); }
        else if (fo > 0) sw = { hu: left ? a + .2 : b - .2, hv: d, a: fo * 1.75, side: left ? 1 : -1 };
        put(a + .2 + du, b - .2 + du, d + vz, d + vz + 1.8, ya + .2, yb - .2, gl ? '#bfe0f2' : alu ? frame : door, gl ? 'glass' : 'front', sw);
        if (alu && !gl) { const fw = Math.min(style.frame_w || 4.5, dw / 3); put(a + .2 + fw + du, b - .2 - fw + du, d + vz + 1.8, d + vz + 2.2, ya + .2 + fw, yb - .2 - fw, door, 'infill', sw); }
        const hy = yb - (yb - ya) * (t.wall ? .8 : .25); const hz = d + vz + 1.8;
        if (dir === 'up') put((a + b) / 2 - 6, (a + b) / 2 + 6, hz, hz + 1.4, ya + 2.5, ya + 3.7, STEEL, 'handle', sw);
        else if (dir === 'down') put((a + b) / 2 - 6, (a + b) / 2 + 6, hz, hz + 1.4, yb - 3.7, yb - 2.5, STEEL, 'handle', sw);
        else if (dir === 'slide') put(i % 2 === 0 || n === 1 ? b - 4 + du : a + 3 + du, (i % 2 === 0 || n === 1 ? b - 4 : a + 3) + 1.2 + du, hz, hz + 1.4, (ya + yb) / 2 - 6, (ya + yb) / 2 + 6, STEEL, 'handle', sw);
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
      if (k === 'washer') { put(u0, u1, v - bd, v, y0, y1, '#e9ecef', 'appl'); const cx = (u0 + u1) / 2; const cy = y0 + h * .45; const r = Math.min(w, h) * .3; put(cx - r, cx + r, v, v + .8, cy - r, cy + r, GLASSY, 'appl'); put(u0 + 3, u1 - 3, v, v + .6, y1 - 7, y1 - 3, '#b7bec7', 'appl'); return; }
      if (k === 'cooker') { put(u0, u1, v - bd, v, y0, y1, STEEL, 'appl'); put(u0 + 3, u1 - 3, v, v + .6, y0 + h * .12, y0 + h * .6, BLACK, 'appl'); put(u0 + 5, u1 - 5, v, v + 2.4, y0 + h * .66, y0 + h * .66 + 1.3, '#8f969f', 'appl'); return; }
      // oven, microwave, coffee machine: a black glass front with a window and a handle
      put(u0, u1, v - bd, v, y0, y1, BLACK, 'appl'); put(u0 + 3, u1 - 3, v, v + .5, y0 + 3, y1 - (k === 'oven' ? 9 : 4), GLASSY, 'appl');
      put(u0 + 4, u1 - 4, v, v + 2.2, y1 - (k === 'oven' ? 7 : 3.4), y1 - (k === 'oven' ? 5.8 : 2.4), '#9aa1aa', 'appl');
    };
    let u = 0;
    for (const [ci, c] of (run.cabinets || []).entries()) {
      curCi = ci;
      const t = CAB_TYPES[c.type] || CAB_TYPES.base; const w = +c.w || 0; const h = +c.h || 0; const d = +c.d || 0;
      const y0 = t.wall ? (c.y !== undefined && c.y !== '' && Number.isFinite(+c.y) ? +c.y : style.wall_height) : t.tall ? 0 : style.plinth;
      if (t.gap) {
        curFront = null;
        if (c.appliance && APPLIANCES[c.appliance]) appliance(c.appliance, u + .5, u + w - .5, c.appliance === 'fridge' || c.appliance === 'freezer' ? 0 : style.plinth, c.appliance === 'fridge' || c.appliance === 'freezer' ? Math.min(h, 200) : Math.min(h, APPLIANCES[c.appliance][1] + style.plinth), d - 2, d - 2);
        u += w; continue;
      }
      if (t.shelf) { put(u, u + w, 0, d, y0, y0 + h, '#d9c9a8', 'carcass'); u += w; continue; }
      if (t.hood) { put(u, u + w, 0, d, y0, y0 + 10, STEEL, 'carcass'); put(u + w * .3, u + w * .7, 0, Math.min(d * .5, 24), y0 + 10, y0 + h, STEEL, 'carcass'); u += w; continue; }
      const cabOp = +open[`${ri}|${ci}`] || 0;
      const fOpen = (k) => { const x = open[`${ri}|${ci}|${k}`]; return Math.max(0, Math.min(1, +(x === undefined ? cabOp : x) || 0)); }; // one drawer or door on its own, else the whole cabinet
      const fronts = frontsOf(c); const slots = t.tall ? slotsOf(c) : null;
      const op = Math.max(cabOp, ...fronts.map((f) => fOpen(f.key)), 0);
      const dir = c.dir && DIRS[c.dir] ? c.dir : 'auto';
      const doors = t.corner ? 2 : Math.round(+c.doors || 0); const drawers = Math.round(+c.drawers || 0); const glazed = Math.min(doors, Math.round(+c.glazed || 0));
      const hollow = op > 0 || slots || (!doors && !drawers);
      curFront = null;
      if (t.corner) { // an L: the long leg on the wall, the return leg along the neighbouring wall
        const right = (c.side || (ci === 0 && (run.cabinets || []).length > 1 ? 'left' : 'right')) !== 'left'; const uf = right ? u + w - d : u + d; const lb = right ? [u + w - d, u + w] : [u, u + d];
        if (hollow) {
          put(u, u + w, 0, 1, y0, y0 + h, carcass, 'carcass'); put(right ? u : u + w - T, right ? u + T : u + w, 0, d, y0, y0 + h, carcass, 'carcass');
          put(right ? u + w - T : u, right ? u + w : u + T, 0, w, y0, y0 + h, carcass, 'carcass');
          for (const yy of [y0, y0 + h - T]) { put(u + T, u + w - T, 0, d, yy, yy + T, inner, 'carcass'); if (w > d) put(lb[0] + (right ? 0 : T), lb[1] - (right ? T : 0), d, w, yy, yy + T, inner, 'carcass'); }
          const sh = Math.round(+c.shelves || 0); for (let i = 1; i <= sh; i++) { const yy = y0 + (h * i) / (sh + 1); put(u + T, u + w - T, 1, d - 3, yy, yy + 1.2, inner, 'carcass'); if (w > d) put(lb[0] + (right ? 0 : T), lb[1] - (right ? T : 0), d - 3, w - 1, yy, yy + 1.2, inner, 'carcass'); }
        } else { put(u, u + w, 0, d, y0, y0 + h, carcass, 'carcass'); if (w > d) put(lb[0], lb[1], d, w, y0, y0 + h, carcass, 'carcass'); }
        if (!t.wall) { put(u + 1, u + w - 1, 4, d - 4, 0, style.plinth, '#6f7885', 'plinth'); if (w > d) put(lb[0] + 1, lb[1] - 1, d, w - 4, 0, style.plinth, '#6f7885', 'plinth'); }
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
        u += w; continue;
      }
      if (hollow) { // a hollow carcass, so the inside shows when doors or drawers are open, or when the cabinet has no doors
        put(u, u + w, 0, 1, y0, y0 + h, carcass, 'carcass'); put(u, u + T, 0, d, y0, y0 + h, carcass, 'carcass'); put(u + w - T, u + w, 0, d, y0, y0 + h, carcass, 'carcass');
        put(u + T, u + w - T, 0, d, y0, y0 + T, inner, 'carcass'); put(u + T, u + w - T, 0, d, y0 + h - T, y0 + h, inner, 'carcass');
        if (!slots) { const sh = Math.round(+c.shelves || 0); for (let i = 1; i <= sh; i++) put(u + T, u + w - T, 1, d - 3, y0 + (h * i) / (sh + 1), y0 + (h * i) / (sh + 1) + 1.2, inner, 'carcass'); }
      } else put(u, u + w, 0, d, y0, y0 + h, carcass, 'carcass');
      if (!t.wall && !t.tall) put(u + 1, u + w - 1, 4, d - 4, 0, style.plinth, '#6f7885', 'plinth');
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
          const z = zn.drawers; const dh = z.h / drawers; const zu = u + z.x;
          for (let i = 0; i < drawers; i++) {
            curFront = 'd' + i; const o = fOpen(curFront) * Math.min(d * 0.7, 40);
            const ya = y0 + z.y + i * dh; const yb = ya + dh;
            if (o > 0.5) { const L = d - 6; put(zu + T + .3, zu + z.w - T - .3, d + o - L, d + o, ya + 3, ya + dh * 0.62, '#d9d0bd', 'tray'); }
            put(zu + .2, zu + z.w - .2, d + o, d + o + 1.8, ya + .2, yb - .2, alu ? frame : door, 'front');
            put(zu + z.w * .35, zu + z.w * .65, d + o + 1.8, d + o + 3, ya + dh * .55, ya + dh * .62, STEEL, 'handle');
          }
          curFront = null;
        }
        if (doors) { const z = zn.doors; putDoors(u + z.x, u + z.x + z.w, y0 + z.y, y0 + z.y + z.h, doors, dir, glazed, (i) => 'f' + i, (i) => fOpen('f' + i), d, t); }
      }
      curFront = null;
      const ytop = y0 + h;
      if (t.counter) put(u, u + w, 0, d + over, ytop, ytop + ct, top, 'top');
      // accessories
      const accs = c.acc || [];
      if (t.sink) { put(u + w * .12, u + w * .88, d * .2, d * .8, ytop + ct, ytop + ct + .5, '#b8c0ca', 'acc'); put(u + w * .16, u + w * .84, d * .26, d * .74, ytop + ct + .5, ytop + ct + .8, '#8b95a0', 'acc'); }
      if (t.sink || accs.includes('tap')) { const tx = u + w * .5; put(tx - 1.5, tx + 1.5, 3, 6, ytop + ct, ytop + ct + 22, '#d7dbe0', 'acc'); put(tx - 1.2, tx + 1.2, 3, 20, ytop + ct + 20, ytop + ct + 23, '#d7dbe0', 'acc'); }
      if (t.hob) { put(u + w * .08, u + w * .92, d * .15, d * .85, ytop + ct, ytop + ct + .6, '#1d2026', 'acc'); for (const [dx, dy] of [[.3, .3], [.7, .3], [.3, .68], [.7, .68]]) { const r = Math.min(w, d) * .11; put(u + w * dx - r, u + w * dx + r, d * dy - r, d * dy + r, ytop + ct + .6, ytop + ct + 1.2, '#4a5058', 'acc'); } }
      if (accs.includes('lights') && t.wall) put(u + 3, u + w - 3, d * .55, d * .7, y0 - .8, y0, '#fff2b0', 'acc');
      if (accs.includes('rail') && !t.wall) { put(u + 5, u + w - 5, 0.4, 2.4, ytop + ct + 38, ytop + ct + 39.6, STEEL, 'acc'); for (const f of [.25, .5, .75]) put(u + w * f - .6, u + w * f + .6, 0.4, 3, ytop + ct + 33, ytop + ct + 38, STEEL, 'acc'); }
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
  const yaw = view.yaw ?? -0.55; const pitch = view.pitch ?? 0.45; const dist = size * 1.5 / (view.zoom || 1); const f = Math.min(W, H) * 1.05;
  const cyw = Math.cos(yaw); const syw = Math.sin(yaw); const cp = Math.cos(pitch); const sp = Math.sin(pitch);
  const rot = (X, Y, Z) => { // orbit: turn by yaw around the vertical axis, then tilt by pitch; depth grows away from the viewer
    const x1 = X * cyw - Z * syw; const zz = X * syw + Z * cyw;
    return [x1, Y * cp - zz * sp, -(Y * sp + zz * cp)];
  };
  canvas._cam = { cx, cy, cz, yaw, pitch, dist, f, W, H };
  const cam = (x, y, z) => { const r = rot(x - cx, y - cy, z - cz); return [r[0], r[1], r[2] + dist]; };
  const proj = ([x, y, z]) => [W / 2 + (x * f) / z, H / 2 - (y * f) / z];
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
      faces.push({ pts, depth: pts.reduce((a, p) => a + p[2], 0) / 4, fill: shade(b.color, light), ref: b.ref, kind: b.kind, on: same(b.ref, sel) ? 2 : same(b.ref, hov) ? 1 : 0 });
    }
  }
  faces.sort((a, b) => b.depth - a.depth);
  for (const fc of faces) { if (fc.pts.some((p) => p[2] < 5)) continue; const p = fc.pts.map(proj); ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fc.fill; ctx.fill(); if (fc.on) { ctx.fillStyle = fc.on === 2 ? 'rgba(255,140,0,.38)' : 'rgba(40,120,255,.22)'; ctx.fill(); } ctx.strokeStyle = fc.on === 2 ? '#e07b00' : 'rgba(30,45,62,.55)'; ctx.lineWidth = fc.on === 2 ? 1.8 : .8; ctx.stroke(); if (fc.ref && fc.ref.ci >= 0) canvas._hit.push({ poly: p, ref: fc.ref, kind: fc.kind }); }
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
  const dx = (sx - c.W / 2) / c.f; const dy = -(sy - c.H / 2) / c.f; const cp = Math.cos(c.pitch); const sp = Math.sin(c.pitch); const cyw = Math.cos(c.yaw); const syw = Math.sin(c.yaw);
  // a point on the ray at depth z (camera space): (dx*z, dy*z, z); the camera sits at z = dist, so world offsets use z - dist
  const at = (z) => { const xc = dx * z; const yc = dy * z; const zc = z - c.dist; const Y = yc * cp - zc * sp; const zz = -yc * sp - zc * cp; const X = xc * cyw + zz * syw; const Z = -xc * syw + zz * cyw; return [c.cx + X, c.cy + Y, c.cz + Z]; };
  const p1 = at(1); const p2 = at(2); const dY = p2[1] - p1[1]; if (Math.abs(dY) < 1e-9) return null;
  const t = (planeY - p1[1]) / dY; const pt = [p1[0] + t * (p2[0] - p1[0]), planeY, p1[2] + t * (p2[2] - p1[2])];
  return { x: pt[0], z: pt[2] };
}
