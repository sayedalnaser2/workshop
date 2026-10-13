// 3D view of a kitchen: cabinets become boxes, a small painter's-algorithm renderer draws them on a canvas.
// scene() is pure (tested); draw3D() needs a canvas. All sizes in cm; x = right, y = up, z = towards the viewer (the back wall is z = 0).
import { CAB_TYPES, DEFAULT_STYLE, zonesOf } from './kitchen.js';
import { colourHex, stoneHex } from './drawings.js';

/** Where each run stands: { x, z, rot } with rot 0/90/180/270. Run 1 = back wall, 2 = left wall, 3 = right wall, islands in front. */
export function placeRuns(spec) {
  const runs = spec.runs || []; const len = (r) => (r.cabinets || []).reduce((a, c) => a + (+c.w || 0), 0);
  const room = Math.max(len(runs[0] || { cabinets: [] }), 200); let wallN = 0; let islandN = 0;
  return runs.map((r, i) => {
    if (r.place && Number.isFinite(+r.place.x) && Number.isFinite(+r.place.z)) return { x: +r.place.x, z: +r.place.z, rot: +r.place.rot || 0 };
    if (i === 0) return { x: 0, z: 0, rot: 0 };
    if ((r.cabinets || []).length && r.cabinets.every((c) => CAB_TYPES[c.type]?.wall)) return { x: 0, z: 0, rot: 0 }; // wall units hang over the first run
    if (r.island) { islandN++; return { x: Math.max(0, (room - len(r)) / 2), z: 160 + (islandN - 1) * 120, rot: 0 }; }
    wallN++; return wallN === 1 ? { x: 0, z: 62, rot: 90 } : { x: room, z: 62, rot: 270 };
  });
}

const shade = (hex, f) => { const n = parseInt(String(hex).replace('#', ''), 16); const c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f))); return `rgb(${c(16)},${c(8)},${c(0)})`; };

/** Boxes { corners[8], color, kind, ref } for the whole kitchen. open = { 'ri|ci': 0..1 } how far each cabinet's doors / drawers are open. */
export function scene(spec, open = {}) {
  const style = { ...DEFAULT_STYLE, ...(spec.style || {}) }; const ct = Math.max(0, +spec.counter?.thickness || 2); const over = +spec.counter?.front || 0;
  const door = colourHex(style.door_colour) || '#d9c9a8'; const carcass = '#e8e4dc'; const inner = '#f3efe6'; const top = stoneHex(spec.counter?.material) || '#6b6f78';
  const alu = style.kind === 'aluminium'; const frame = colourHex(style.profile_out) || '#9aa3ad'; const T = +style.t || 1.8;
  const pl = placeRuns(spec); const boxes = [];
  (spec.runs || []).forEach((run, ri) => {
    const { x: ox, z: oz, rot } = pl[ri];
    const map = { 0: (u, v) => [ox + u, oz + v], 90: (u, v) => [ox + v, oz + u], 180: (u, v) => [ox - u, oz - v], 270: (u, v) => [ox - v, oz - u] }[rot] || ((u, v) => [ox + u, oz + v]);
    let curCi = -1; let curFront = null;
    // a box in run coordinates (u along the run, v out from the wall); sw turns it about a vertical hinge line { hu, hv, a (radians), side: 1 hinge at the left end, -1 right end }
    const put = (u0, u1, v0, v1, y0, y1, color, kind, sw) => {
      const C = [];
      for (let i = 0; i < 8; i++) {
        let u = i & 1 ? u1 : u0; const y = i & 2 ? y1 : y0; let v = i & 4 ? v1 : v0;
        if (sw && sw.a) { const du = u - sw.hu; const dv = v - sw.hv; const c = Math.cos(sw.a); const sn = Math.sin(sw.a) * sw.side; u = sw.hu + du * c - dv * sn; v = sw.hv + du * sn + dv * c; }
        const [x, z] = map(u, v); C.push([x, y, z]);
      }
      boxes.push({ corners: C, color, kind, ref: { ri, ci: curCi, front: curFront } });
    };
    let u = 0;
    for (const [ci, c] of (run.cabinets || []).entries()) {
      curCi = ci;
      const t = CAB_TYPES[c.type] || CAB_TYPES.base; const w = +c.w || 0; const h = +c.h || 0; const d = +c.d || 0;
      if (t.gap) { u += w; continue; }
      curFront = null; const cabOp = +open[`${ri}|${ci}`] || 0;
      const fOpen = (k) => { const x = open[`${ri}|${ci}|${k}`]; return Math.max(0, Math.min(1, +(x === undefined ? cabOp : x) || 0)); }; // one drawer or door on its own, else the whole cabinet
      const nDr = Math.round(+c.drawers || 0); const nDo = Math.round(+c.doors || 0);
      const op = Math.max(cabOp, ...Array.from({ length: nDr }, (_, i) => fOpen('d' + i)), ...Array.from({ length: nDo }, (_, i) => fOpen('f' + i)), 0);
      const y0 = t.wall ? style.wall_height : t.tall ? 0 : style.plinth;
      if (op > 0) { // a hollow carcass, so the inside shows when doors or drawers are open
        put(u, u + w, 0, 1, y0, y0 + h, carcass, 'carcass'); put(u, u + T, 0, d, y0, y0 + h, carcass, 'carcass'); put(u + w - T, u + w, 0, d, y0, y0 + h, carcass, 'carcass');
        put(u + T, u + w - T, 0, d, y0, y0 + T, inner, 'carcass'); put(u + T, u + w - T, 0, d, y0 + h - T, y0 + h, inner, 'carcass');
        const sh = Math.round(+c.shelves || 0); for (let i = 1; i <= sh; i++) put(u + T, u + w - T, 1, d - 3, y0 + (h * i) / (sh + 1), y0 + (h * i) / (sh + 1) + 1.2, inner, 'carcass');
      } else put(u, u + w, 0, d, y0, y0 + h, carcass, 'carcass');
      if (!t.wall && !t.tall) put(u + 1, u + w - 1, 4, d - 4, 0, style.plinth, '#6f7885', 'plinth');
      const doors = Math.round(+c.doors || 0); const drawers = Math.round(+c.drawers || 0); const glazed = Math.min(doors, Math.round(+c.glazed || 0));
      const zn = zonesOf(c);
      if (drawers) {
        const z = zn.drawers; const dh = z.h / drawers; const zu = u + z.x;
        for (let i = 0; i < drawers; i++) {
          curFront = 'd' + i; const o = fOpen(curFront) * Math.min(d * 0.7, 40);
          const ya = y0 + z.y + i * dh; const yb = ya + dh;
          if (o > 0.5) { const L = d - 6; put(zu + T + .3, zu + z.w - T - .3, d + o - L, d + o, ya + 3, ya + dh * 0.62, '#d9d0bd', 'tray'); }
          put(zu + .2, zu + z.w - .2, d + o, d + o + 1.8, ya + .2, yb - .2, alu ? frame : door, 'front');
          put(zu + z.w * .35, zu + z.w * .65, d + o + 1.8, d + o + 3, ya + dh * .55, ya + dh * .62, '#b9bec6', 'handle');
        }
      }
      if (doors) {
        const z = zn.doors; const zy = y0 + z.y;
        for (let i = 0; i < doors; i++) {
          curFront = 'f' + i; const fo = fOpen(curFront);
          const dw = z.w / doors; const a = u + z.x + i * dw; const left = doors === 1 || i % 2 === 0; // handle side opposite the hinge: first door hinges on the left
          const sw = fo > 0 ? { hu: left ? a + .2 : a + dw - .2, hv: d, a: fo * 1.75, side: left ? 1 : -1 } : null;
          put(a + .2, a + dw - .2, d, d + 1.8, zy + .2, zy + z.h - .2, i < glazed ? '#bfe0f2' : alu ? frame : door, i < glazed ? 'glass' : 'front', sw);
          if (alu && i >= glazed) { const fw = Math.min(style.frame_w || 4.5, dw / 3); put(a + .2 + fw, a + dw - .2 - fw, d + 1.8, d + 2.2, zy + .2 + fw, zy + z.h - .2 - fw, door, 'infill', sw); }
          const hx = left ? a + dw - 4 : a + 3; const hy = zy + z.h * (t.wall ? .2 : .75);
          put(hx, hx + 1.2, d + 1.8, d + 3.2, hy - 6, hy + 6, '#b9bec6', 'handle', sw);
        }
      }
      curFront = null;
      if (t.counter) put(u, u + w, 0, d + over, y0 + h, y0 + h + ct, top, 'top');
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
  const cx = (mn[0] + mx[0]) / 2; const cy = mx[1] / 2; const cz = (mn[2] + mx[2]) / 2; const size = Math.max(mx[0] - mn[0], mx[1], mx[2] - mn[2], 100);
  const yaw = view.yaw ?? -0.55; const pitch = view.pitch ?? 0.45; const dist = size * 2.2 / (view.zoom || 1); const f = Math.min(W, H) * 1.05;
  const cyw = Math.cos(yaw); const syw = Math.sin(yaw); const cp = Math.cos(pitch); const sp = Math.sin(pitch);
  const rot = (X, Y, Z) => { // orbit: turn by yaw around the vertical axis, then tilt by pitch; depth grows away from the viewer
    const x1 = X * cyw - Z * syw; const zz = X * syw + Z * cyw;
    return [x1, Y * cp - zz * sp, -(Y * sp + zz * cp)];
  };
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
