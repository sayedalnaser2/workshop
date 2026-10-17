// Kitchen cabinet and countertop modelling: cabinets → panels, hardware, sheets, countertop slabs, cost and price.
// Pure functions (shared by the browser and the tests). All sizes are in centimetres.

export const CAB_TYPES = {
  base:    { label: 'Base cabinet',  w: 60, h: 72,  d: 56, doors: 1, drawers: 0, shelves: 1, counter: true },
  drawers: { label: 'Drawer base',   w: 60, h: 72,  d: 56, doors: 0, drawers: 3, shelves: 0, counter: true },
  sink:    { label: 'Sink base',     w: 90, h: 72,  d: 56, doors: 2, drawers: 0, shelves: 0, counter: true, sink: 1 },
  hob:     { label: 'Hob base',      w: 60, h: 72,  d: 56, doors: 0, drawers: 2, shelves: 0, counter: true, hob: 1 },
  corner:  { label: 'Corner base (L-shaped)', w: 90, h: 72, d: 56, doors: 2, drawers: 0, shelves: 1, counter: true, corner: 1 },
  wall:    { label: 'Wall cabinet',  w: 60, h: 70,  d: 32, doors: 1, drawers: 0, shelves: 1, wall: true },
  wall_corner: { label: 'Corner wall cabinet (L-shaped)', w: 60, h: 70, d: 32, doors: 2, drawers: 0, shelves: 1, wall: true, corner: 1 },
  hood:    { label: 'Cooker hood',   w: 60, h: 75,  d: 45, doors: 0, drawers: 0, shelves: 0, wall: true, hood: 1 },
  shelf:   { label: 'Floating shelf', w: 80, h: 4,   d: 25, doors: 0, drawers: 0, shelves: 0, wall: true, shelf: 1 },
  tall:    { label: 'Tall unit',     w: 60, h: 210, d: 58, doors: 2, drawers: 0, shelves: 4, tall: true },
  gap:     { label: 'Appliance gap', w: 60, h: 85,  d: 60, doors: 0, drawers: 0, shelves: 0, gap: true },
};
/** Appliances that stand in a gap (cab.appliance) or fill a slot of a tall unit. h = usual opening height cm. */
export const APPLIANCES = { fridge: ['Fridge', 180], freezer: ['Freezer', 85], dishwasher: ['Dishwasher', 82], washer: ['Washing machine', 85], oven: ['Built-in oven', 60], micro: ['Microwave', 38], coffee: ['Coffee machine', 45], cooker: ['Free-standing cooker', 85] };
/** What a slot of a tall unit can hold, from the floor up. */
export const SLOT_KINDS = { door: 'Door', glass: 'Glass door', drawer: 'Drawer', open: 'Open niche', ...Object.fromEntries(['fridge', 'freezer', 'oven', 'micro', 'coffee'].map((k) => [k, APPLIANCES[k][0]])) };
/** Opening directions for doors. auto = French doors in pairs, a single door hinged on the left. */
export const DIRS = { auto: 'Automatic', left: 'Hinged left', right: 'Hinged right', up: 'Lifts up', down: 'Folds down', slide: 'Sliding', shutter: 'Roller shutter (rolls up)' };
/** Accessories that can be added to a cabinet. visual = drawn in the 3D view. */
export const ACCESSORIES = { tap: ['Tap / mixer', true], bin: ['Pull-out waste bin', false], cutlery: ['Cutlery tray', false], pullout: ['Pull-out basket', false], lights: ['LED light strip', true], rail: ['Rail with hooks', true], spice: ['Spice rack', false], lazy: ['Lazy-susan carousel', false], soft: ['Soft-close set', false] };
/** Does a floor unit stand on a skirting (plinth) with legs? Base units do by default and tall units do not; cab.skirt overrides it either way. Wall units, appliance gaps, shelves and hoods never. */
export function hasSkirt(cab) {
  const t = CAB_TYPES[cab.type] || CAB_TYPES.base; if (t.wall || t.gap || t.shelf || t.hood) return false;
  if (cab.skirt === undefined || cab.skirt === null || cab.skirt === '') return !t.tall;
  return cab.skirt === true || cab.skirt === 1 || cab.skirt === '1' || cab.skirt === 'true';
}
/** How many floating shelves one shelf unit stacks above each other, and the clear space between them (cm). */
export const shelfCount = (cab) => Math.max(1, Math.min(12, Math.round(+cab.stack || 1)));
export const shelfGap = (cab) => (Number.isFinite(+cab.stack_gap) && cab.stack_gap !== '' && cab.stack_gap !== undefined ? Math.max(0, +cab.stack_gap) : 30);
/** Door layout slots apply to every unit except appliance gaps, shelves, hoods and L-corners. */
export const layoutSlots = (cab) => { const t = CAB_TYPES[cab.type] || CAB_TYPES.base; return t.gap || t.shelf || t.hood || t.corner ? null : slotsOf(cab); };
/** The doors, drawers and open space of a plain cabinet written as slots (bottom to top), so one can be added, moved or resized without redoing the rest. */
export function slotsFromCab(cab) {
  const H = +cab.h || 0; const doors = Math.max(0, Math.round(+cab.doors || 0)); const drawers = Math.max(0, Math.round(+cab.drawers || 0)); const zn = zonesOf(cab); const out = [];
  if (doors) out.push({ k: Math.round(+cab.glazed || 0) >= doors ? 'glass' : 'door', h: Math.round(zn.doors.h * 10) / 10, n: doors, dir: cab.dir || 'auto' });
  for (let i = 0; i < drawers; i++) out.push({ k: 'drawer', h: Math.round((zn.drawers.h / drawers) * 10) / 10, n: 1 });
  if (!out.length) out.push({ k: 'open', h: H, n: 1 });
  return out;
}
/** Heights of every slot with the empty ones sharing what is left. */
export function slotHeights(slots, H) { const fixed = slots.reduce((a, x) => a + (+x.h > 0 ? +x.h : 0), 0); const free = slots.filter((x) => !(+x.h > 0)).length; return slots.map((x) => (+x.h > 0 ? +x.h : Math.max(0, (H - fixed) / (free || 1)))); }
/** Add a slot at the bottom, middle or top; the others shrink in proportion so the unit keeps its height. pos: 'bottom' | 'middle' | 'top'. */
export function addSlot(cab, kind, pos = 'top') {
  const H = +cab.h || 0; const cur = (Array.isArray(cab.slots) && cab.slots.length ? cab.slots : slotsFromCab(cab)).map((x) => ({ ...x }));
  const hs = slotHeights(cur, H); cur.forEach((x, i) => { x.h = hs[i]; });
  const want = APPLIANCES[kind] ? APPLIANCES[kind][1] : kind === 'drawer' ? 18 : Math.round((H / (cur.length + 1)) * 10) / 10;
  const nh = Math.min(want, Math.max(5, H * 0.7)); const sum = cur.reduce((a, x) => a + x.h, 0); const k = sum > 0 ? Math.max(0, H - nh) / sum : 1;
  cur.forEach((x) => { x.h = Math.round(x.h * k * 10) / 10; });
  const slot = { k: kind, h: Math.round(nh * 10) / 10, n: 1, dir: 'auto' }; const at = pos === 'bottom' ? 0 : pos === 'top' ? cur.length : Math.floor(cur.length / 2) + (cur.length % 2 ? 1 : 0);
  cur.splice(at, 0, slot);
  const total = cur.reduce((a, x) => a + x.h, 0); if (cur.length && Math.abs(total - H) > 0.05) cur[cur.length - 1 === at ? Math.max(0, at - 1) : cur.length - 1].h = Math.round((cur[cur.length - 1 === at ? Math.max(0, at - 1) : cur.length - 1].h + (H - total)) * 10) / 10;
  return cur;
}
/** Slots of a tall unit, defaulting to two doors on top of each other if none are set. */
export const slotsOf = (cab) => (Array.isArray(cab.slots) && cab.slots.length ? cab.slots.map((x) => ({ k: x.k || 'door', h: +x.h || 0, n: Math.max(1, Math.round(+x.n || 1)), dir: x.dir || 'auto' })) : null);
export const DEFAULT_STYLE = {
  kind: 'wood', profile: '', infill: '', frame_w: 4.5, bar_len: 600, carcass: '', door: '', back: '', door_colour: '', handle: '', hinge: '', drawer: '', glass: '', profile_in: '', profile_out: '',
  t: 1.8, back_t: 0.6, plinth: 10, wall_height: 140, sheet_w: 244, sheet_h: 122, kerf: 0.3, gap: 0.4,
};
export const DEFAULT_COUNTER = { material: '', thickness: 2, front: 2, side: 0, splash_h: 0, slab_w: 300, slab_h: 140, waste: 15, extra_sinks: 0, extra_hobs: 0 };

const r1 = (n) => Math.round(n * 10) / 10;
const hingesFor = (h) => (h <= 90 ? 2 : h <= 160 ? 3 : h <= 220 ? 4 : 5);

/** Where the doors and the drawers sit on a cabinet (cm, x from its left edge, y up from its bottom). A cabinet with both has them stacked (drawers on top) or side by side (cab.mixed). */
export function zonesOf(cab) {
  const W = +cab.w || 0; const H = +cab.h || 0; const doors = Math.max(0, Math.round(+cab.doors || 0)); const drawers = Math.max(0, Math.round(+cab.drawers || 0));
  const z = { doors: doors ? { x: 0, y: 0, w: W, h: H } : null, drawers: drawers ? { x: 0, y: 0, w: W, h: H } : null };
  if (doors && drawers) {
    const m = cab.mixed || {};
    if (m.mode === 'side') { const dw = Math.min(W - 20, Math.max(20, +m.dw || W * 0.4)); z.drawers = { x: m.left ? 0 : W - dw, y: 0, w: dw, h: H }; z.doors = { x: m.left ? dw : 0, y: 0, w: W - dw, h: H }; }
    else { const dh = Math.min(H - 20, Math.max(10, +m.dh || Math.min(18 * drawers, H * 0.4))); z.drawers = { x: 0, y: H - dh, w: W, h: dh }; z.doors = { x: 0, y: 0, w: W, h: H - dh }; }
  }
  return z;
}

/** Panels, hardware and glass for one cabinet. mat: carcass | back | door. edge = banded edge length per piece (cm). */
export function cabinetParts(cab, style = DEFAULT_STYLE) {
  const s = { ...DEFAULT_STYLE, ...style }; const t = s.t; const b = s.back_t; const g = s.gap;
  const W = +cab.w || 0, H = +cab.h || 0, D = +cab.d || 0;
  const doors = Math.max(0, Math.round(+cab.doors || 0)); const drawers = Math.max(0, Math.round(+cab.drawers || 0));
  const shelves = Math.max(0, Math.round(+cab.shelves || 0)); const glazed = Math.min(doors, Math.max(0, Math.round(+cab.glazed || 0)));
  const type = CAB_TYPES[cab.type] || CAB_TYPES.base;
  const panels = []; const hw = { hinges: 0, handles: 0, slides: 0, legs: 0, hangers: 0, pins: 0, handleLen: 0, tracks: 0, lifts: 0, shutters: 0 }; const glass = []; const frames = []; const appliances = []; const acc = {};
  const alu = s.kind === 'aluminium'; const fw = +s.frame_w || 4.5;
  if (type.gap) { if (cab.appliance) appliances.push({ k: cab.appliance, w: W, h: H, d: D }); return { panels, hw, glass, frames, appliances, acc }; }
  if (!(W > 0 && H > 0 && D > 0)) return { panels, hw, glass, frames, appliances, acc };
  const add = (label, w, h, qty, mat, edge = 0) => { if (qty > 0 && w > 0 && h > 0) panels.push({ label, w: r1(w), h: r1(h), qty, mat, edge: r1(edge) }); };
  // an aluminium kitchen: every door / drawer front is a profile frame with an infill panel (or glass) set in it
  const front = (label, w, h, qty, glazedQty = 0) => {
    if (!alu) { add(label, w, h, qty, 'door', 2 * (w + h)); return; }
    frames.push({ label, w: r1(w), h: r1(h), qty });
    add(`${label} infill`, w - 2 * fw + 1.2, h - 2 * fw + 1.2, qty - glazedQty, 'door', 0);
  };
  const tag = cab.label ? `${cab.label} · ` : '';
  const dd = D - b - 1; // depth of horizontal panels (back sits behind them)
  for (const a of cab.acc || []) if (ACCESSORIES[a]) acc[a] = (acc[a] || 0) + 1;
  const skirt = hasSkirt(cab); if (skirt) { if (s.plinth_profile) add(`${tag}Skirting`, W - 2, s.plinth, 1, 'skirt', 0); else add(`${tag}Skirting`, W - 2, s.plinth, 1, 'carcass', W - 2); hw.legs += 4; } // the skirting board in front of the legs
  if (type.shelf) { const n = shelfCount(cab); add(`${tag}Floating shelf board`, W, D, n, 'carcass', W + 2 * (D - 2)); hw.hangers += 2 * n; return { panels, hw, glass, frames, appliances, acc }; }
  if (type.hood) { hw.hangers += 2; appliances.push({ k: 'hood', w: W, h: H, d: D }); return { panels, hw, glass, frames, appliances, acc }; }
  add(`${tag}Side`, dd + b + 1 > D ? D : D, H, 2, 'carcass', H); // sides: front edge banded
  add(`${tag}Bottom`, W - 2 * t, dd, 1, 'carcass', W - 2 * t);
  if (type.wall) add(`${tag}Top`, W - 2 * t, dd, 1, 'carcass', W - 2 * t);
  else if (type.tall) { add(`${tag}Top`, W - 2 * t, dd, 1, 'carcass', W - 2 * t); }
  else add(`${tag}Top rail`, W - 2 * t, 8, 2, 'carcass', 0);
  add(`${tag}Back`, W - 0.4, H - 0.4, 1, 'back', 0);
  const nShelf = layoutSlots(cab) ? 0 : shelves;
  add(`${tag}Shelf`, W - 2 * t - 0.2, dd - 2, nShelf, 'carcass', W - 2 * t - 0.2);
  // drawers share the height with doors only on mixed cabinets; here a cabinet is either doors or drawers (or a stack above doors)
  const zn = zonesOf(cab); const slots = layoutSlots(cab); const dir = cab.dir && DIRS[cab.dir] ? cab.dir : 'auto';
  // hardware for a run of n doors of height dh that open in direction dr
  const doorHw = (n, dw, dh, dr) => {
    if (dr === 'shutter') { hw.shutters += n; return; } // the shutter kit has its own handle strip
    if (dr === 'slide') { hw.tracks += 1; hw.handles += n; return; }
    if (dr === 'up') { hw.lifts += n; hw.handles += n; hw.handleLen += n * dw; return; }
    if (dr === 'down') { hw.hinges += n * 2; hw.handles += n; hw.handleLen += n * dw; return; }
    hw.hinges += n * hingesFor(dh); hw.handles += n; hw.handleLen += n * dh;
  };
  if (slots) { // a tall unit built from slots stacked from the floor up: doors, drawers, appliances, open niches
    const used = slots.reduce((a, x) => a + x.h, 0);
    for (let i = 0; i < slots.length - 1; i++) add(`${tag}Divider`, W - 2 * t, dd, 1, 'carcass', W - 2 * t);
    slots.forEach((sl, i) => {
      const hh = sl.h > 0 ? sl.h : Math.max(0, (H - used) / (slots.filter((x) => !(x.h > 0)).length || 1));
      if (sl.k === 'door' || sl.k === 'glass') {
        const n = sl.n; const dw = (W - g) / n - g / 2; const gl = sl.k === 'glass' ? n : 0;
        if (sl.dir !== 'shutter') front(`${tag}Door ${i + 1}`, dw, hh - g, n, gl); doorHw(n, dw, hh - g, sl.dir);
        for (let q = 0; q < (sl.dir === 'shutter' ? 0 : gl); q++) glass.push({ w: r1(alu ? dw - 2 * fw + 1.2 : dw - 8), h: r1(alu ? hh - g - 2 * fw + 1.2 : hh - g - 8), qty: 1 });
      } else if (sl.k === 'drawer') { front(`${tag}Drawer front ${i + 1}`, W - g, hh - g, 1); hw.slides += 1; hw.handles += 1; hw.handleLen += W - g; }
      else if (sl.k !== 'open') appliances.push({ k: sl.k, w: r1(W - 2 * t), h: r1(hh), d: r1(dd) });
    });
    hw.legs += 0; hw.pins += 0;
    return { panels, hw, glass, frames, appliances, acc };
  }
  if (type.corner) { // an L-shaped corner: two narrow doors, one on the front and one on the side that faces the room
    const dw = Math.max(0, W - D - g); const dl = Math.max(0, D - g); const dh = H - g;
    front(`${tag}Corner door (front)`, dw, dh, 1); front(`${tag}Corner door (side)`, Math.max(0, W - D - g), dh, 1);
    doorHw(2, dw, dh, ['slide', 'shutter'].includes(dir) ? 'auto' : dir);
    add(`${tag}Side (return)`, W - D, H, 1, 'carcass', H); add(`${tag}Inner back`, D, H, 1, 'back', 0); add(`${tag}Bottom (return leg)`, D - t, W - D, 1, 'carcass', 0);
    if (type.wall) add(`${tag}Top (return leg)`, D - t, W - D, 1, 'carcass', 0);
    hw.pins += 0; void dl;
  } else {
    if (drawers > 0) {
      const dh = r1(zn.drawers.h / drawers);
      for (let i = 0; i < drawers; i++) front(`${tag}Drawer front ${i + 1}`, zn.drawers.w - g, dh - g, 1);
      hw.slides += drawers; hw.handles += drawers; hw.handleLen += drawers * (zn.drawers.w - g);
    }
    if (doors > 0) {
      const dh = zn.doors.h - g; const dw = zn.doors.w / doors - g;
      if (dir !== 'shutter') front(`${tag}Door`, dw, dh, doors, glazed); doorHw(doors, dw, dh, dir);
      for (let i = 0; i < (dir === 'shutter' ? 0 : glazed); i++) glass.push({ w: r1(alu ? dw - 2 * fw + 1.2 : dw - 8), h: r1(alu ? dh - 2 * fw + 1.2 : dh - 8), qty: 1 });
    }
  }
  if (type.wall) hw.hangers += 2;
  hw.pins += nShelf * 4;
  return { panels, hw, glass, frames, appliances, acc };
}

/** Guillotine-style shelf packing of rectangles onto sheets. Pieces may rotate. Returns the sheets with positions. */
export function packSheets(pieces, sheetW, sheetH, kerf = 0.3) {
  const list = []; for (const p of pieces) for (let i = 0; i < p.qty; i++) list.push({ w: p.w, h: p.h, label: p.label });
  list.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));
  const sheets = []; const unfit = [];
  const tryPlace = (sh, w, h) => { // existing shelf first, then a new shelf
    for (const sf of sh.shelves) if (h <= sf.h + 1e-9 && sf.x + w <= sheetW + 1e-9) { const x = sf.x; sf.x += w + kerf; return { x, y: sf.y }; }
    const y = sh.shelves.length ? sh.shelves.at(-1).y + sh.shelves.at(-1).h + kerf : 0;
    if (y + h <= sheetH + 1e-9 && w <= sheetW + 1e-9) { sh.shelves.push({ y, h, x: w + kerf }); return { x: 0, y }; }
    return null;
  };
  for (const p of list) {
    if ((p.w > sheetW || p.h > sheetH) && (p.h > sheetW || p.w > sheetH)) { unfit.push(p); continue; }
    let done = false;
    for (const sh of sheets) {
      for (const [w, h, rot] of [[p.w, p.h, false], [p.h, p.w, true]]) { // prefer the orientation whose height fits an existing shelf
        const pos = (w <= sheetW && h <= sheetH) ? tryPlace(sh, w, h) : null;
        if (pos) { sh.items.push({ ...pos, w, h, rot, label: p.label }); done = true; break; }
      }
      if (done) break;
    }
    if (!done) {
      const sh = { shelves: [], items: [] }; sheets.push(sh);
      const [w, h, rot] = p.w <= sheetW && p.h <= sheetH ? [p.w, p.h, false] : [p.h, p.w, true];
      const pos = tryPlace(sh, w, h); sh.items.push({ ...pos, w, h, rot, label: p.label });
    }
  }
  const total = sheetW * sheetH;
  // what is left over on each sheet: the strip at the end of every shelf and the band under the last shelf
  const freeOf = (sh) => { const out = []; for (const sf of sh.shelves) { const rw = sheetW - sf.x; if (rw > 0.5 && sf.h > 0.5) out.push({ x: sf.x, y: sf.y, w: Math.round(rw * 10) / 10, h: Math.round(sf.h * 10) / 10 }); } const last = sh.shelves.at(-1); if (last) { const y = last.y + last.h + kerf; if (sheetH - y > 0.5) out.push({ x: 0, y, w: sheetW, h: Math.round((sheetH - y) * 10) / 10 }); } return out; };
  return { sheets: sheets.map((s) => ({ items: s.items, used: s.items.reduce((a, i) => a + i.w * i.h, 0) / total, free: freeOf(s) })), unfit };
}

/** Cut aluminium door-frame profile out of stock bars (first-fit decreasing, 45° corners need no allowance beyond the saw kerf). */
/** Straight cuts from bars: pieces [{ len, qty, label }] → bars with the pieces on each, offcuts and total metres. */
export function packLengths(list, barLen = 600, kerf = 0.5) {
  const pieces = []; for (const f of list) for (let i = 0; i < (f.qty || 1); i++) pieces.push({ len: f.len, label: f.label });
  pieces.sort((a, b) => b.len - a.len); const bars = []; const unfit = [];
  for (const p of pieces) { if (p.len > barLen) { unfit.push(p); continue; } const bar = bars.find((b) => b.used + p.len + kerf <= barLen + 1e-9); if (bar) { bar.items.push(p); bar.used += p.len + kerf; } else bars.push({ items: [p], used: p.len + kerf }); }
  return { bars: bars.map((b) => ({ ...b, free: Math.round((barLen - b.used) * 10) / 10 })), unfit, metres: pieces.reduce((a, p) => a + p.len, 0) / 100, pieces: pieces.length };
}
export function packBars(frames, barLen = 600, fw = 4.5, kerf = 0.5) {
  const pieces = []; for (const f of frames) for (let i = 0; i < f.qty; i++) { pieces.push({ len: f.h, label: f.label }, { len: f.h, label: f.label }, { len: f.w, label: f.label }, { len: f.w, label: f.label }); }
  pieces.sort((a, b) => b.len - a.len); const bars = []; const unfit = [];
  for (const p of pieces) {
    if (p.len > barLen) { unfit.push(p); continue; }
    const bar = bars.find((b) => b.used + p.len + kerf <= barLen + 1e-9);
    if (bar) { bar.items.push(p); bar.used += p.len + kerf; } else bars.push({ items: [p], used: p.len + kerf });
  }
  const metres = pieces.reduce((a, p) => a + p.len, 0) / 100;
  return { bars: bars.map((b) => ({ ...b, free: Math.round((barLen - b.used) * 10) / 10 })), unfit, metres, pieces: pieces.length, corners: pieces.length / 2 };
}

/** Everything about a kitchen: panels by material, sheets, hardware, countertop slabs. */
export function kitchenModel(spec) {
  const style = { ...DEFAULT_STYLE, ...(spec.style || {}) }; const counter = { ...DEFAULT_COUNTER, ...(spec.counter || {}) };
  const runs = spec.runs || [];
  const panels = { carcass: [], back: [], door: [], skirt: [] }; const hw = { hinges: 0, handles: 0, slides: 0, legs: 0, hangers: 0, pins: 0, handleLen: 0, tracks: 0, lifts: 0, shutters: 0 }; const glass = []; const frames = []; const appliances = []; const accessories = {};
  const meters = { base: 0, wall: 0, tall: 0, units: 0, base_n: 0, wall_n: 0, tall_n: 0 };
  let edge = 0;
  for (const run of runs) for (const cab of run.cabinets || []) {
    const type = CAB_TYPES[cab.type] || CAB_TYPES.base; const p = cabinetParts(cab, style);
    for (const x of p.panels) { panels[x.mat].push(x); edge += x.edge * x.qty; } // (skirting cut from a profile is listed apart)
    for (const k of Object.keys(hw)) hw[k] += p.hw[k]; glass.push(...p.glass); frames.push(...p.frames); appliances.push(...p.appliances); for (const [k, n] of Object.entries(p.acc)) accessories[k] = (accessories[k] || 0) + n;
    const w = (+cab.w || 0) / 100; if (type.gap) continue;
    meters.units++; if (type.wall) { meters.wall += w; meters.wall_n++; } else if (type.tall) { meters.tall += w; meters.tall_n++; } else { meters.base += w; meters.base_n++; }
  }
  const sheets = {};
  for (const mat of ['carcass', 'back', 'door']) {
    const pk = packSheets(panels[mat], style.sheet_w, style.sheet_h, style.kerf);
    sheets[mat] = { ...pk, area: panels[mat].reduce((a, p) => a + p.w * p.h * p.qty, 0) / 10000 };
  }
  const skirtBars = panels.skirt.length ? packLengths(panels.skirt.map((x) => ({ len: x.w, qty: x.qty, label: x.label })), +style.plinth_bar_len || 600) : null;
  const profile = style.kind === 'aluminium' ? packBars(frames, +style.bar_len || 600, +style.frame_w || 4.5) : null;
  return { style, counter, panels, hw, glass, frames, appliances, accessories, profile, skirtBars, sheets, meters, edge_m: edge / 100, tops: counterTops(runs, counter, style) };
}

/** Countertop pieces: one per unbroken stretch of base cabinets in each run. */
export function counterTops(runs, c, style = DEFAULT_STYLE) {
  const pieces = []; let sinks = +c.extra_sinks || 0; let hobs = +c.extra_hobs || 0; let corners = 0;
  runs.forEach((run, ri) => {
    let cur = null;
    const close = () => { if (cur && cur.len > 0) { pieces.push(cur); } cur = null; };
    for (const cab of run.cabinets || []) {
      const type = CAB_TYPES[cab.type] || CAB_TYPES.base;
      if (!type.counter) { close(); continue; }
      if (!cur) cur = { run: ri, runName: run.name, len: 0, depth: 0, from: 0, island: !!run.island, over: run.island ? +run.overhang || 0 : 0 };
      cur.len += +cab.w || 0; cur.depth = Math.max(cur.depth, +cab.d || 0);
      if (type.corner) cur.leg = (cur.leg || 0) + Math.max(0, (+cab.w || 0) - (+cab.d || 0)); // the return leg of an L-shaped corner
      if (type.sink) sinks += type.sink; if (type.hob) hobs += type.hob; if (type.corner) corners++;
    }
    close();
  });
  // an island stands free: no splash back, and a seating overhang on the far side
  const out = pieces.map((p) => ({ ...p, len: r1(p.len + 2 * (+c.side || 0)), depth: r1(p.depth + (+c.front || 0) + p.over), splash: c.splash_h > 0 && !p.island ? r1(p.len) : 0 }));
  const legArea = (p) => (p.leg ? p.leg * (p.depth - p.over) : 0);
  const area = out.reduce((a, p) => a + (p.len * p.depth + p.splash * c.splash_h + legArea(p)) / 10000, 0);
  const slabsPieces = []; for (const p of out) { slabsPieces.push({ w: p.len, h: p.depth, qty: 1, label: `${p.runName || 'Run'} top` }); if (p.leg) slabsPieces.push({ w: r1(p.depth), h: r1(p.leg), qty: 1, label: `${p.runName || 'Run'} corner leg` }); if (p.splash) slabsPieces.push({ w: p.splash, h: c.splash_h, qty: 1, label: 'Splash' }); }
  const slabs = packSheets(slabsPieces, c.slab_w, c.slab_h, 0.5);
  const run_m = out.reduce((a, p) => a + p.len, 0) / 100;
  const polish_m = out.reduce((a, p) => a + (p.island ? 2 * p.len + 2 * p.depth : p.len + 2 * p.depth + (p.splash ? p.splash : 0)) / 100, 0);
  return { pieces: out, area_m2: area, run_m, polish_m, sinks, hobs, corners, slabs, slab_area: area * (1 + (+c.waste || 0) / 100) };
}

/**
 * Cost and selling price. opts = kitchen options keyed by kind→name→{price,...} plus `general` numbers.
 * Returns the cost lines (for display and for a purchase order) and both selling methods.
 */
export function priceKitchen(model, opts) {
  const o = (kind, name) => (opts[kind] || {})[name] || null; const gen = (k) => Number(((opts.general || {})[k]) || 0);
  const { style, counter, hw, sheets, meters } = model; const lines = [];
  const add = (group, label, qty, unit, price, extra = {}) => { if (qty > 0) lines.push({ group, label, qty: Math.round(qty * 100) / 100, unit, price: Number(price) || 0, total: (Number(price) || 0) * qty, ...extra }); };
  const sheetCount = (m) => sheets[m].sheets.length;
  const carc = o('panel', style.carcass); const door = o('panel', style.door || style.carcass); const back = o('panel', style.back || style.carcass);
  add('Boards', `Carcass boards — ${style.carcass || 'not chosen'}`, sheetCount('carcass'), `sheet ${style.sheet_w}×${style.sheet_h}`, carc?.price, { kind: 'panel', name: style.carcass });
  add('Boards', `Door & drawer fronts — ${style.door || style.carcass || 'not chosen'}`, sheetCount('door'), `sheet ${style.sheet_w}×${style.sheet_h}`, door?.price, { kind: 'panel', name: style.door || style.carcass });
  add('Boards', `Back panels — ${style.back || style.carcass || 'not chosen'}`, sheetCount('back'), `sheet ${style.sheet_w}×${style.sheet_h}`, back ? (back.meta?.back_price ?? back.price) : 0, { kind: 'panel', name: style.back || style.carcass });
  if (model.profile) { const pr = o('profile', style.profile); add('Door frames', `Door frame profile — ${style.profile || 'not chosen'}`, model.profile.bars.length, `bar ${style.bar_len || 600} cm`, Number(style.profile_price) > 0 ? Number(style.profile_price) : pr?.price, { kind: 'profile', name: style.profile }); add('Door frames', 'Frame corner joints / assembly', model.profile.corners, 'corners', gen('frame_corner')); }
  add('Boards', 'Edge banding', model.edge_m, 'm', gen('edge_band_m'));
  if (model.skirtBars) add('Skirting', `Skirting profile — ${style.plinth_profile}`, model.skirtBars.bars.length, `bar ${style.plinth_bar_len || 600} cm`, Number(style.plinth_price) || 0, { kind: 'plinth', name: style.plinth_profile });
  const hinge = o('hinge', style.hinge); add('Hardware', `Hinges — ${style.hinge || 'not chosen'}`, hw.hinges, 'pcs', hinge?.price);
  const drw = o('drawer', style.drawer); add('Hardware', `Drawer sets — ${style.drawer || 'not chosen'}`, hw.slides, 'sets', drw?.price);
  const handle = o('handle', style.handle);
  if (handle && /m$/i.test(handle.unit || '')) add('Hardware', `Handles — ${style.handle}`, hw.handleLen / 100, 'm', handle.price); else add('Hardware', `Handles — ${style.handle || 'not chosen'}`, hw.handles, 'pcs', handle?.price);
  add('Hardware', 'Roller shutter sets (slats, track, handle strip)', hw.shutters, 'sets', gen('shutter')); add('Hardware', 'Sliding door tracks', hw.tracks, 'sets', gen('slide_track')); add('Hardware', 'Lift-up mechanisms', hw.lifts, 'pcs', gen('lift_up'));
  for (const [k, n] of Object.entries(model.accessories || {})) add('Accessories', ACCESSORIES[k]?.[0] || k, n, 'pcs', gen('acc_' + k));
  for (const a of model.appliances || []) if (a.k !== 'hood') { /* appliances are bought by the customer: space only */ } else add('Accessories', 'Cooker hood fitting', 1, 'pcs', gen('acc_hood'));
  add('Hardware', 'Legs', hw.legs, 'pcs', gen('leg')); add('Hardware', 'Wall hangers', hw.hangers, 'pcs', gen('hanger')); add('Hardware', 'Shelf pins', hw.pins, 'pcs', gen('pin'));
  const glassArea = model.glass.reduce((a, g) => a + (g.w * g.h * g.qty) / 10000, 0); add('Glass', `Glazed doors — ${style.glass || 'glass'}`, glassArea, 'm²', o('glass', style.glass)?.price);
  const top = counter.material ? o('marble', `${counter.material}|${counter.thickness}`) || o('marble', counter.material) : null; const ct = model.tops;
  add('Countertop', `${counter.material || 'Countertop'} ${counter.thickness} cm`, ct.slab_area, 'm² (incl. waste)', top?.price, { kind: 'marble', name: counter.material });
  add('Countertop', 'Edge polishing', ct.polish_m, 'm', gen('polish_m')); add('Countertop', 'Sink cut-outs', ct.sinks, 'pcs', gen('cutout_sink')); add('Countertop', 'Hob cut-outs', ct.hobs, 'pcs', gen('cutout_hob'));
  add('Labour', 'Workshop labour', meters.units, 'cabinets', gen('labour_cabinet')); add('Labour', 'Installation', meters.base + meters.wall + meters.tall, 'm run', gen('install_m'));
  const cost = lines.reduce((a, l) => a + l.total, 0);
  const rates = { base: gen('rate_base_m') * meters.base, wall: gen('rate_wall_m') * meters.wall, tall: gen('rate_tall_m') * meters.tall, counter: gen('rate_counter_m') * ct.run_m, sinks: gen('rate_cutout') * (ct.sinks + ct.hobs) };
  const byRates = Object.values(rates).reduce((a, b) => a + b, 0);
  const markup = gen('markup_pct'); const byCost = cost * (1 + markup / 100);
  return { lines, cost, rates, byRates, byCost, suggested: byRates > 0 ? byRates : byCost, markup };
}

const classOf = (c) => { const t = CAB_TYPES[c.type] || CAB_TYPES.base; return t.gap ? 'gap' : t.wall ? 'wall' : t.tall ? 'tall' : 'base'; };
/** Two neighbouring cabinets built as one wider cabinet: one carcass instead of two (fewer panels, quicker to make, cheaper). Returns { cab } or { error }. */
export function mergeCabinets(a, b) {
  if (!a || !b) return { error: 'There is no cabinet next to this one.' };
  const odd = (x) => { const t = CAB_TYPES[x.type] || {}; return t.shelf || t.hood || t.corner || slotsOf(x); };
  if (odd(a) || odd(b)) return { error: 'Corner units, shelves, hoods and tall units with slots cannot be joined.' };
  if (classOf(a) !== classOf(b) || classOf(a) === 'gap') return { error: 'Only two cabinets of the same kind (both base, both wall or both tall) can be joined.' };
  const da = Math.round(+a.doors || 0); const db = Math.round(+b.doors || 0); const ra = Math.round(+a.drawers || 0); const rb = Math.round(+b.drawers || 0);
  const special = [a, b].find((x) => (CAB_TYPES[x.type] || {}).sink || (CAB_TYPES[x.type] || {}).hob || (CAB_TYPES[x.type] || {}).corner);
  const cab = { ...a, type: (special || a).type, label: a.label || b.label || '', w: (+a.w || 0) + (+b.w || 0), h: Math.max(+a.h || 0, +b.h || 0), d: Math.max(+a.d || 0, +b.d || 0), doors: da + db, drawers: da + db > 0 && ra + rb > 0 ? ra + rb : Math.max(ra, rb), shelves: Math.max(+a.shelves || 0, +b.shelves || 0), glazed: (+a.glazed || 0) + (+b.glazed || 0) };
  if (da + db > 0 && ra + rb > 0) { // doors next to drawers: keep them side by side, the drawer part as wide as the drawer cabinet was
    const drawerFirst = ra > 0 && da === 0;
    cab.mixed = { mode: 'side', dw: drawerFirst ? +a.w || 0 : +b.w || 0, left: drawerFirst };
    cab.doors = da + db; cab.drawers = ra + rb;
  } else delete cab.mixed;
  return { cab };
}
/** The reverse: one cabinet cut into two equal halves. */
export function splitCabinet(c) {
  if (!c || classOf(c) === 'gap') return { error: 'This cannot be split.' };
  if ((+c.w || 0) < 60) return { error: 'It is too narrow to split (each half would be under 30 cm).' };
  if (c.mixed?.mode === 'side' && (+c.doors || 0) > 0 && (+c.drawers || 0) > 0) { // undo a doors-beside-drawers join
    const z = zonesOf(c); const dr = { ...c, label: c.label, type: c.type, w: z.drawers.w, doors: 0, glazed: 0 }; const dd = { ...c, label: '', type: (CAB_TYPES[c.type] || {}).sink || (CAB_TYPES[c.type] || {}).hob || (CAB_TYPES[c.type] || {}).corner ? c.type : 'base', w: z.doors.w, drawers: 0 }; delete dr.mixed; delete dd.mixed;
    return { cabs: c.mixed.left ? [{ ...dr, type: 'drawers' }, dd] : [dd, { ...dr, type: 'drawers', label: '' }] };
  }
  const half = (n, first) => (first ? Math.ceil(n / 2) : Math.floor(n / 2)); const type = (CAB_TYPES[c.type] || {}).sink || (CAB_TYPES[c.type] || {}).hob || (CAB_TYPES[c.type] || {}).corner ? 'base' : c.type;
  const mk = (first) => ({ ...c, drawers: c.drawers, type: first ? c.type : type, label: first ? c.label : '', w: (+c.w || 0) / 2, doors: half(Math.round(+c.doors || 0), first), glazed: half(Math.round(+c.glazed || 0), first) });
  return { cabs: [mk(true), mk(false)] };
}
/** What joining saves: panels and board area of the carcass compared with two separate cabinets. */
export function mergeSaving(a, b, style = DEFAULT_STYLE) {
  const r = mergeCabinets(a, b); if (r.error) return null;
  const sum = (cabs) => { let n = 0; let m2 = 0; for (const c of cabs) for (const p of cabinetParts(c, style).panels) if (p.mat !== 'door') { n += p.qty; m2 += (p.w * p.h * p.qty) / 10000; } return { n, m2 }; };
  const x = sum([a, b]); const y = sum([r.cab]); const hw = (c) => { const h = cabinetParts(c, style).hw; return h.legs + h.hangers; };
  return { panels: x.n - y.n, m2: Math.round((x.m2 - y.m2) * 100) / 100, legs: hw(a) + hw(b) - hw(r.cab) };
}
