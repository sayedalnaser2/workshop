// A 3D model of the profiles of one aluminium cabinet, assembled: every bar of the cutting list drawn where it goes.
// Each box carries the part, its profile, length and quantity (for the hover label). Sizes in centimetres; z = 0 is the front.
import { cabinetParts, CAB_TYPES, ALU } from './kitchen.js';

export const PROFILE_COLOURS = { [ALU.edge]: '#9fb4c8', [ALU.deep]: '#5b8fc7', [ALU.back]: '#e0a35c', [ALU.col]: '#6fbf8a', [ALU.door]: '#b79ae0', [ALU.skirt]: '#d9c45a', [ALU.hidden]: '#e07a7a' };
const T = 2.5; // the cross-section of a cabinet frame profile (drawn square)

/** Boxes (corner lists in the same order as the kitchen 3D view) + the parts table for the legend. */
export function profileScene(cab, style = {}, nameOf = () => '') {
  const s = { kind: 'aluminium', ...style }; const r = cabinetParts({ ...cab, label: '' }, s); const type = CAB_TYPES[cab.type] || CAB_TYPES.base;
  const W = +cab.w || 0; const H = +cab.h || 0; const D = +cab.d || 0; const plinth = r.bars.some((b) => b.code === ALU.skirt) ? +s.plinth || 10 : 0;
  const ds = cab.door_side === 'left' || cab.door_side === 'right' ? cab.door_side : '';
  const boxes = []; const parts = new Map(); // key code|part|len -> { code, part, len, qty }
  const colourOf = (code) => PROFILE_COLOURS[code] || '#aab4be';
  const note = (code, part, len, qty) => { const k = `${code}|${part}|${len}`; const e = parts.get(k); if (e) e.qty += qty; else parts.set(k, { code, part, len, qty, name: nameOf(code) }); };
  /** a box, x across, y up, z from the front (0) to the back; y is lifted by the plinth */
  const box = (x0, x1, y0, y1, z0, z1, info) => {
    const C = []; for (let i = 0; i < 8; i++) C.push([i & 1 ? x1 : x0, (i & 2 ? y1 : y0) + plinth, D - (i & 4 ? z1 : z0)]); // the scene looks at the front from +z
    boxes.push({ corners: C, color: colourOf(info.code), kind: 'profile', ref: { ri: boxes.length, ci: 0, tip: info } });
  };
  const used = new Set();
  const pick = (cands) => cands.find((c) => !used.has(c.key)) || cands[0];
  const xs = (len, top, back) => ({ key: `x${top ? 'T' : 'B'}${back ? 'B' : 'F'}`, box: (info, xa) => { const a = xa ?? (W - len) / 2; box(a, a + len, top ? H - T : 0, top ? H : T, back ? D - T : 0, back ? D : T, info); } });
  const ys = (len, left, back) => ({ key: `y${left ? 'L' : 'R'}${back ? 'B' : 'F'}`, side: left ? 'left' : 'right', box: (info) => { const a = Math.max(0, (H - len) / 2); box(left ? 0 : W - T, left ? T : W, a, a + len, back ? D - T : 0, back ? D : T, info); } });
  const zs = (len, left, top) => ({ key: `z${left ? 'L' : 'R'}${top ? 'T' : 'B'}`, side: left ? 'left' : 'right', box: (info) => { const a = Math.max(0, (D - len) / 2); box(left ? 0 : W - T, left ? T : W, top ? H - T : 0, top ? H : T, a, a + len, info); } });
  const sideFirst = (arr, doorSide) => [...arr].sort((a, b) => (ds && a.side && b.side ? ((a.side === ds) === doorSide ? 0 : 1) - ((b.side === ds) === doorSide ? 0 : 1) : 0)); // door-side bars go to the door side, the others to the other side
  let shelfW = 0; let shelfD = 0; const nShelf = r.bars.filter((b) => /Shelf \(width\)$/.test(b.label)).reduce((a, b) => a + b.qty, 0) / 2 || 0; let colN = 0; const colTotal = r.bars.filter((b) => /column/i.test(b.label)).reduce((a, b) => a + b.qty, 0);
  for (const b of r.bars) {
    const part = b.label.replace(/^.* · /, ''); const info = (q = b.qty) => ({ code: b.code, name: nameOf(b.code), part, len: b.len, qty: q });
    const doorSide = /door side/.test(part);
    for (let n = 0; n < b.qty; n++) {
      const inf = info(); note(b.code, part, b.len, 1);
      if (/Shelf \(width\)$/.test(part)) { const sh = Math.floor(shelfW / 2); const y = ((sh + 1) * H) / (nShelf + 1); const front = shelfW % 2 === 0; shelfW++; const a = (W - b.len) / 2; box(a, a + b.len, y, y + T, front ? 3 : D - 3 - T, front ? 3 + T : D - 3, inf); continue; }
      if (/Shelf \(depth\)$/.test(part)) { const sh = Math.floor(shelfD / 2); const y = ((sh + 1) * H) / (nShelf + 1); const left = shelfD % 2 === 0; shelfD++; const a = (D - b.len) / 2; box(left ? 1 : W - 1 - T, left ? 1 + T : W - 1, y, y + T, a, a + b.len, inf); continue; }
      if (/Skirting front/.test(part)) { const a = (W - b.len) / 2; const C = []; for (let i = 0; i < 8; i++) C.push([i & 1 ? a + b.len : a, i & 2 ? plinth : 0, D - (i & 4 ? 4 : 2.5)]); boxes.push({ corners: C, color: colourOf(b.code), kind: 'profile', ref: { ri: boxes.length, ci: 0, tip: inf } }); continue; }
      if (/Skirting side/.test(part)) { const left = n % 2 === 0; const a = (D - b.len) / 2; const C = []; for (let i = 0; i < 8; i++) C.push([i & 1 ? (left ? 4 : W - 2.5) : (left ? 2.5 : W - 4), i & 2 ? plinth : 0, D - ((i & 4 ? a + b.len : a))]); boxes.push({ corners: C, color: colourOf(b.code), kind: 'profile', ref: { ri: boxes.length, ci: 0, tip: inf } }); continue; }
      if (/column/i.test(part)) { const x = (W * (colN + 1)) / (colTotal + 1) - T / 2; colN++; const a = Math.max(0, (H - b.len) / 2); box(x, x + T, a, a + b.len, 0, T, inf); continue; }
      if (/hidden handle/i.test(part) || /square profile/i.test(part)) { const a = b.seg ? b.seg[0] : (W - b.len) / 2; xs(b.len, true, false).box(inf, a); continue; }
      const vertical = /(height|front side|back side|side height)/i.test(part) && !/deep/i.test(part);
      const deep = /(deep|top side|depth)/i.test(part);
      if (vertical) { const back = /(back height|height side|back side)/i.test(part); const c = sideFirst([ys(b.len, true, back), ys(b.len, false, back), ys(b.len, true, !back), ys(b.len, false, !back)], doorSide); const c0 = pick(c); used.add(c0.key); c0.box(inf); continue; }
      if (deep) { const top = /(top side|deep side|side deep)/i.test(part) && !/bottom/i.test(part); const c = sideFirst([zs(b.len, true, top), zs(b.len, false, top), zs(b.len, true, !top), zs(b.len, false, !top)], doorSide); const c0 = pick(c); used.add(c0.key); c0.box(inf); continue; }
      // along the width: front top / front bottom / back top / back bottom
      const back = /back/i.test(part); const cands = [];
      if (/back top & front bottom/i.test(part)) cands.push(xs(b.len, true, true), xs(b.len, false, false));
      else if (/top & bottom/i.test(part)) cands.push(xs(b.len, true, back), xs(b.len, false, back));
      else cands.push(xs(b.len, /top/i.test(part) && !/bottom/i.test(part), back));
      const c0 = pick(cands); used.add(c0.key); c0.box(inf);
    }
  }
  // door and drawer frames, in front of the cabinet (a side door on its side): top and bottom bars the door's width, side bars its height
  const fw = +s.frame_w || 4.5; const th = 2; let cx = 0; let cyTop = H;
  for (const f of r.frames) {
    const label = f.label.replace(/^.* · /, ''); const side = /Side door/.test(label); const drawer = /Drawer/i.test(label);
    for (let n = 0; n < f.qty; n++) {
      const w = f.w; const h = f.h; const wi = (p, l, q) => ({ code: ALU.door, name: nameOf(ALU.door), part: `${label} — ${p}`, len: l, qty: q });
      note(ALU.door, `${label} — width`, w, 2); note(ALU.door, `${label} — height`, h, 2);
      const wInfo = wi('width', w, 2 * f.qty); const hInfo = wi('height', h, 2 * f.qty);
      if (side) { const left = f.label.includes('(left)'); const x0 = left ? -th - 0.2 : W + 0.2; const z0 = 0; const y0 = (H - h) / 2;
        const bx = (a0, a1, b0, b1, inf) => { const C = []; for (let i = 0; i < 8; i++) C.push([i & 1 ? x0 + th : x0, (i & 2 ? b1 : b0) + plinth, D - (i & 4 ? a1 : a0)]); boxes.push({ corners: C, color: colourOf(ALU.door), kind: 'profile', ref: { ri: boxes.length, ci: 0, tip: inf } }); };
        bx(z0, z0 + w, y0, y0 + fw, wInfo); bx(z0, z0 + w, y0 + h - fw, y0 + h, wInfo); bx(z0, z0 + fw, y0 + fw, y0 + h - fw, hInfo); bx(z0 + w - fw, z0 + w, y0 + fw, y0 + h - fw, hInfo); continue; }
      const x0 = drawer ? (W - w) / 2 : cx; const y1 = drawer ? cyTop - 0.2 : (H + h) / 2; const y0 = y1 - h;
      const fb = (a0, a1, b0, b1, inf) => box(a0, a1, b0, b1, -th - 0.2, -0.2, inf);
      fb(x0, x0 + w, y0, y0 + fw, wInfo); fb(x0, x0 + w, y1 - fw, y1, wInfo); fb(x0, x0 + fw, y0 + fw, y1 - fw, hInfo); fb(x0 + w - fw, x0 + w, y0 + fw, y1 - fw, hInfo);
      if (drawer) cyTop = y0 - 0.2; else cx += w + 0.2;
    }
  }
  const list = [...parts.values()].sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }) || b.len - a.len);
  return { boxes, parts: list, size: { W, H, D }, type: type.label };
}
