// 3D view of a kitchen: cabinets become boxes, a small painter's-algorithm renderer draws them on a canvas.
// scene() is pure (tested); draw3D() needs a canvas. All sizes in cm; x = right, y = up, z = towards the viewer (the back wall is z = 0).
import { CAB_TYPES, DEFAULT_STYLE } from './kitchen.js';
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

/** Boxes { x0,x1,y0,y1,z0,z1, color, kind } for the whole kitchen. */
export function scene(spec) {
  const style = { ...DEFAULT_STYLE, ...(spec.style || {}) }; const ct = Math.max(0, +spec.counter?.thickness || 2); const over = +spec.counter?.front || 0;
  const door = colourHex(style.door_colour) || '#d9c9a8'; const carcass = '#e8e4dc'; const top = stoneHex(spec.counter?.material) || '#6b6f78';
  const alu = style.kind === 'aluminium'; const frame = colourHex(style.profile_out) || '#9aa3ad';
  const pl = placeRuns(spec); const boxes = [];
  (spec.runs || []).forEach((run, ri) => {
    const { x: ox, z: oz, rot } = pl[ri];
    const put = (u0, u1, v0, v1, y0, y1, color, kind) => { const ref = { ri, ci: curCi }; // local (along, depth) → world, by rotation
      const m = { 0: (u, v) => [ox + u, oz + v], 90: (u, v) => [ox + v, oz + u], 180: (u, v) => [ox - u, oz - v], 270: (u, v) => [ox - v, oz - u] }[rot] || ((u, v) => [ox + u, oz + v]);
      const a = m(u0, v0); const b = m(u1, v1); boxes.push({ x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]), y0, y1, color, kind, ref });
    };
    let u = 0; let curCi = -1;
    for (const [ci, c] of (run.cabinets || []).entries()) {
      curCi = ci;
      const t = CAB_TYPES[c.type] || CAB_TYPES.base; const w = +c.w || 0; const h = +c.h || 0; const d = +c.d || 0;
      if (t.gap) { u += w; continue; }
      const y0 = t.wall ? style.wall_height : t.tall ? 0 : style.plinth;
      put(u, u + w, 0, d, y0, y0 + h, carcass, 'carcass');
      if (!t.wall && !t.tall) put(u + 1, u + w - 1, 4, d - 4, 0, style.plinth, '#6f7885', 'plinth');
      const doors = Math.round(+c.doors || 0); const drawers = Math.round(+c.drawers || 0); const glazed = Math.min(doors, Math.round(+c.glazed || 0));
      const fv = (a, b, y1, y2, col, kind) => put(a, b, d, d + 1.8, y1, y2, col, kind);
      for (let i = 0; i < drawers; i++) { const dh = h / drawers; fv(u + .2, u + w - .2, y0 + i * dh + .2, y0 + (i + 1) * dh - .2, alu ? frame : door, 'front'); put(u + w * .35, u + w * .65, d + 1.8, d + 3, y0 + (i + .55) * dh, y0 + (i + .62) * dh, '#b9bec6', 'handle'); }
      for (let i = 0; i < doors; i++) {
        const dw = w / doors; const a = u + i * dw;
        fv(a + .2, a + dw - .2, y0 + .2, y0 + h - .2, i < glazed ? '#bfe0f2' : alu ? frame : door, i < glazed ? 'glass' : 'front');
        if (alu && i >= glazed) { const fw = Math.min(style.frame_w || 4.5, dw / 3); put(a + .2 + fw, a + dw - .2 - fw, d + 1.8, d + 2.2, y0 + .2 + fw, y0 + h - .2 - fw, door, 'infill'); }
        const hx = doors === 1 ? a + dw - 4 : i % 2 === 0 ? a + dw - 4 : a + 3; const hy = y0 + h * (t.wall ? .2 : .75);
        put(hx, hx + 1.2, d + 1.8, d + 3.2, hy - 6, hy + 6, '#b9bec6', 'handle');
      }
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
  for (const b of boxes) { mn[0] = Math.min(mn[0], b.x0); mn[2] = Math.min(mn[2], b.z0); mx[0] = Math.max(mx[0], b.x1); mx[1] = Math.max(mx[1], b.y1); mx[2] = Math.max(mx[2], b.z1); }
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
    const C = []; for (let i = 0; i < 8; i++) C.push([i & 1 ? b.x1 : b.x0, i & 2 ? b.y1 : b.y0, i & 4 ? b.z1 : b.z0]);
    for (const [n, idx] of FACES) {
      const pts = idx.map((i) => cam(...C[i])); const nc = rot(n[0], n[1], n[2]); // back-face culling with the true normal
      if (nc[0] * pts[0][0] + nc[1] * pts[0][1] + nc[2] * pts[0][2] >= 0) continue;
      const light = n[1] > 0 ? 1.08 : n[1] < 0 ? .6 : n[2] !== 0 ? .95 : .78;
      faces.push({ pts, depth: pts.reduce((a, p) => a + p[2], 0) / 4, fill: shade(b.color, light), ref: b.ref, on: same(b.ref, sel) ? 2 : same(b.ref, hov) ? 1 : 0 });
    }
  }
  faces.sort((a, b) => b.depth - a.depth);
  for (const fc of faces) { if (fc.pts.some((p) => p[2] < 5)) continue; const p = fc.pts.map(proj); ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fc.fill; ctx.fill(); if (fc.on) { ctx.fillStyle = fc.on === 2 ? 'rgba(255,140,0,.38)' : 'rgba(40,120,255,.22)'; ctx.fill(); } ctx.strokeStyle = fc.on === 2 ? '#e07b00' : 'rgba(30,45,62,.55)'; ctx.lineWidth = fc.on === 2 ? 1.8 : .8; ctx.stroke(); if (fc.ref && fc.ref.ci >= 0) canvas._hit.push({ poly: p, ref: fc.ref }); }
}

/** Which cabinet is under a canvas point (the nearest face wins). Call after draw3D. */
export function pick3D(canvas, x, y) {
  const hits = canvas._hit || [];
  for (let i = hits.length - 1; i >= 0; i--) { // drawn last = nearest
    const { poly, ref } = hits[i]; let inside = false;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const [xi, yi] = poly[a]; const [xj, yj] = poly[b]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; }
    if (inside) return ref;
  }
  return null;
}
