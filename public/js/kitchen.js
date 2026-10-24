// Kitchen cabinet and countertop modelling: cabinets → panels, hardware, sheets, countertop slabs, cost and price.
// Pure functions (shared by the browser and the tests). All sizes are in centimetres.
import { glazingFix } from './calc.js';

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
export const APPLIANCES = { fridge: ['Fridge', 180], freezer: ['Freezer', 85], dishwasher: ['Dishwasher', 82], washer: ['Washing machine', 85], dryer: ['Tumble dryer', 85], oven: ['Built-in oven', 60], micro: ['Microwave', 38], coffee: ['Coffee machine', 45], cooker: ['Free-standing cooker', 85] };
/** What a slot of a tall unit can hold, from the floor up. */
export const SLOT_KINDS = { door: 'Door', glass: 'Glass door', drawer: 'Drawer', open: 'Open niche', ...Object.fromEntries(['fridge', 'freezer', 'oven', 'micro', 'coffee'].map((k) => [k, APPLIANCES[k][0]])) };
/** Opening directions for doors. auto = French doors in pairs, a single door hinged on the left. */
export const DIRS = { auto: 'Automatic', left: 'Hinged left', right: 'Hinged right', up: 'Lifts up', down: 'Folds down', slide: 'Sliding', shutter: 'Roller shutter (rolls up)' };
/** Accessories that can be added to a cabinet. visual = drawn in the 3D view. */
export const ACCESSORIES = { tap: ['Tap / mixer', true], bin: ['Pull-out waste bin', true], cutlery: ['Cutlery tray', true], pullout: ['Pull-out basket', true], lights: ['LED light strip', true], rail: ['Rail with hooks', true], spice: ['Spice rack', true], lazy: ['Lazy-susan carousel', true], soft: ['Soft-close set', true] };
/** Which door places of a cabinet are left open (no door), counted from the left: a Set of indices. Only for 2 doors or more, and never all of them. */
export function openDoorsOf(cab) {
  const n = Math.max(0, Math.round(+cab.doors || 0)); if (n < 2 || !Array.isArray(cab.open_doors)) return new Set();
  const set = new Set(cab.open_doors.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < n)); return set.size >= n ? new Set() : set;
}
/** Does a cabinet have the hidden (L-shape) handle? Only aluminium floor units that are not tall. */
export function hasHiddenHandle(cab, style = {}) {
  const t = CAB_TYPES[cab.type] || CAB_TYPES.base; if (style.kind !== 'aluminium' || t.wall || t.tall || t.gap || t.shelf || t.hood || t.corner) return false;
  const v = cab.hidden_handle ?? style.hidden_handle; return v === true || v === 1 || v === '1' || v === 'true';
}
/** The stretches (cm from the cabinet's left edge) that have a door under the hidden handle: open places get none. */
export function hiddenSegments(cab) {
  const W = +cab.w || 0; const n = Math.max(0, Math.round(+cab.doors || 0)); const drawers = Math.max(0, Math.round(+cab.drawers || 0));
  if (!n) return drawers ? [[0, W]] : []; // drawers only: the handle runs over them; an open cabinet gets none
  const open = openDoorsOf(cab); const out = [];
  for (let i = 0; i < n; i++) { if (open.has(i)) continue; const a = (W * i) / n; const b = (W * (i + 1)) / n; const last = out.at(-1); if (last && Math.abs(last[1] - a) < 1e-6) last[1] = b; else out.push([a, b]); }
  return out;
}
/** Does a cabinet get a top sheet? Wall and tall units always; floor units only when asked (cab.top_sheet, else the kitchen's style.base_top), since the marble usually covers them. */
export function hasTopSheet(cab, style = {}) {
  const t = CAB_TYPES[cab.type] || CAB_TYPES.base; if (t.wall || t.tall) return true; if (t.gap || t.shelf || t.hood) return false;
  const v = cab.top_sheet ?? style.base_top; return v === true || v === 1 || v === '1' || v === 'true';
}
/** Does a floor unit stand on a skirting (plinth) with legs? Base units do by default and tall units do not; cab.skirt overrides it either way. Wall units, appliance gaps, shelves and hoods never. */
export function hasSkirt(cab) {
  const t = CAB_TYPES[cab.type] || CAB_TYPES.base; if (t.wall || t.shelf || t.hood) return false;
  if (t.gap) return cab.skirt === true || cab.skirt === 1 || cab.skirt === '1' || cab.skirt === 'true'; // an appliance stands on the floor unless asked to sit on a skirting
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
/** The workshop's aluminium cabinet method: which profile makes which part (see the cutting rules sheet). */
export const ALU = { edge: '22421', deep: '22422', back: '22423', col: '23564', door: '28456', skirt: '20277', hidden: 'L-shape' };
export const ALU_MATS = { white22: 'White sheet 2.2 cm', white16: 'White sheet 1.6 cm', design: 'Design sheet' };
export const DEFAULT_STYLE = {
  kind: 'wood', profile: '', infill: '', frame_w: 4.5, bar_len: 600, carcass: '', door: '', back: '', door_colour: '', handle: '', hinge: '', drawer: '', glass: '', profile_in: '', profile_out: '',
  t: 1.8, back_t: 0.6, white_w: 280, white_h: 130, plinth: 10, wall_height: 140, sheet_w: 244, sheet_h: 122, kerf: 0.3, gap: 0.4,
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
function cabinetPartsBase(cab, style = DEFAULT_STYLE) {
  const s = { ...DEFAULT_STYLE, ...style }; const t = s.t; const b = s.back_t; const g = s.gap;
  const W = +cab.w || 0, H = +cab.h || 0, D = +cab.d || 0;
  const doors = Math.max(0, Math.round(+cab.doors || 0)); const drawers = Math.max(0, Math.round(+cab.drawers || 0));
  const shelves = Math.max(0, Math.round(+cab.shelves || 0)); const glazed = Math.min(doors, Math.max(0, Math.round(+cab.glazed || 0)));
  const type = CAB_TYPES[cab.type] || CAB_TYPES.base;
  const panels = []; const hw = { hinges: 0, handles: 0, slides: 0, legs: 0, hangers: 0, pins: 0, handleLen: 0, tracks: 0, lifts: 0, shutters: 0 }; const glass = []; const frames = []; const appliances = []; const acc = {}; const bars = [];
  const alu = s.kind === 'aluminium'; const fw = +s.frame_w || 4.5; const aluBox = alu && !type.corner;
  if (type.gap) {
    if (cab.appliance) appliances.push({ k: cab.appliance, w: W, h: H, d: D });
    if (W > 0 && hasSkirt(cab)) { const tag = cab.label ? `${cab.label} · ` : ''; const add2 = (label, w, h, qty, mat, edge) => panels.push({ label, w, h, qty, mat, edge }); if (s.plinth_profile) add2(`${tag}Skirting`, W - 2, s.plinth, 1, 'skirt', 0); else add2(`${tag}Skirting`, W - 2, s.plinth, 1, 'carcass', W - 2); hw.legs += 4; }
    return { panels, hw, glass, frames, appliances, acc, bars };
  }
  if (!(W > 0 && H > 0 && D > 0)) return { panels, hw, glass, frames, appliances, acc, bars };
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
  const skirt = hasSkirt(cab); if (skirt) { if (aluBox) { const sc = String(s.plinth_profile || '').split(' ')[0] || ALU.skirt; bars.push({ code: sc, label: `${tag}Skirting front`, len: r1(W), qty: 1 }, { code: sc, label: `${tag}Skirting side`, len: r1(D), qty: 2 }); } else if (s.plinth_profile) add(`${tag}Skirting`, W - 2, s.plinth, 1, 'skirt', 0); else add(`${tag}Skirting`, W - 2, s.plinth, 1, 'carcass', W - 2); hw.legs += 4; } // the skirting board in front of the legs
  if (type.shelf) { const n = shelfCount(cab); add(`${tag}Floating shelf board`, W, D, n, 'carcass', W + 2 * (D - 2)); hw.hangers += 2 * n; return { panels, hw, glass, frames, appliances, acc, bars }; }
  if (type.hood) { hw.hangers += 2; appliances.push({ k: 'hood', w: W, h: H, d: D }); return { panels, hw, glass, frames, appliances, acc, bars }; }
  const nShelf = layoutSlots(cab) ? 0 : shelves;
  const hidden = hasHiddenHandle(cab, s); const openSet = openDoorsOf(cab); const closedN = doors - openSet.size;
  const topSheet = hasTopSheet(cab, s); // a floor unit gets a top sheet only when asked (the marble usually sits on it)
  if (aluBox) { // the workshop's method: profile frame + fibre sheets, see ALU
    const bar = (code, label, len, qty) => { if (qty > 0 && len > 0) bars.push({ code, label: tag + label, len: r1(len), qty }); };
    const sheet = (label, w, h, qty, mat) => add(label, w, h, qty, mat, 0);
    if (type.tall) {
      bar(ALU.door, 'Side height', H, 4); bar(ALU.door, 'Side deep', D, 4); bar(ALU.edge, 'Front edge top & bottom', W - 4, 2); bar(ALU.back, 'Back top & bottom', W - 4, 2); bar(ALU.edge, 'Side deep', D, 4); bar(ALU.edge, 'Back side', H, 2);
      bar(ALU.edge, 'Shelf (depth)', W - 4, 2 * nShelf); bar(ALU.edge, 'Shelf (width)', D - 2.5, 2 * nShelf);
      sheet(`${tag}Top`, W - 9.3, D - 5.2, 1, 'white22'); sheet(`${tag}Bottom`, W - 9.3, D - 5.2, 1, 'white22'); sheet(`${tag}Back`, W - 5.2, H - 5.2, 1, 'white22');
      sheet(`${tag}Side (design)`, H - 0.4, D - 0.4, 2, 'design'); sheet(`${tag}Side lining`, H - 8.8, D - 8.8, 2, 'white16');
    } else {
      const colQty = doors > 2 ? Math.floor((doors - 1) / 2) : 0; // a hinge column between door pairs: (H − 5) × Int((QOD − 1) / 2), none for 1 or 2 doors
      if (type.wall) { bar(ALU.edge, 'Front top', W, 1); bar(ALU.edge, 'Front bottom', W, 1); bar(ALU.edge, 'Front side', H, 2); bar(ALU.deep, 'Deep side', D, 4); bar(ALU.deep, 'Height side', H, 2); bar(ALU.back, 'Back top & bottom', W, 2); }
      else { bar(ALU.edge, 'Edge back top & front bottom', W, 2); bar(ALU.edge, 'Edge front side', H, 2); bar(ALU.edge, 'Edge top side', D, 2); bar(ALU.deep, 'Bottom deep', D, 2); bar(ALU.deep, 'Back height', H, 2); bar(ALU.back, 'Back bottom', W, 1); if (hidden) { // the L-shape runs only over the doors; open places get the square profile; next units' pieces are joined in kitchenModel
        const segs = hiddenSegments(cab); for (const [a, b2] of segs) bars.push({ code: ALU.hidden, label: tag + 'Hidden handle profile', len: r1(b2 - a), qty: 1, seg: [a, b2] });
        const covered = segs.reduce((acc, [a, b2]) => acc + b2 - a, 0); if (W - covered > 5.5) bar(ALU.col, 'Square profile front/top (open part)', W - covered - 5, 1);
      } else bar(ALU.col, 'Square profile front/top', W - 5, 1); }
      bar(ALU.col, 'Column for hinged doors', H - 5, colQty);
      bar(ALU.edge, 'Shelf (width)', W - 1.4, 2 * nShelf); bar(ALU.edge, 'Shelf (depth)', D - 3.2, 2 * nShelf);
      if (type.wall || topSheet) sheet(`${tag}Top`, W - 5.2, D - 5.2, 1, 'white22'); sheet(`${tag}Bottom`, W - 5.2, D - 5.2, 1, 'white22'); sheet(`${tag}Side`, H - 5.2, D - 5.2, 2 - Math.min(2, +cab._ends || 0), 'white22'); sheet(`${tag}End side`, H - 5.2, D - 5.2, Math.min(2, +cab._ends || 0), 'end'); sheet(`${tag}Back`, W - 5.2, H - 5.2, 1, 'white22');
    }
  } else {
    const ends = Math.min(2, +cab._ends || 0); // sides the customer sees are cut from the end sheet
    add(`${tag}Side`, dd + b + 1 > D ? D : D, H, 2 - ends, 'carcass', H); // sides: front edge banded
    add(`${tag}End side`, D, H, ends, 'end', H);
    add(`${tag}Bottom`, W - 2 * t, dd, 1, 'carcass', W - 2 * t);
    if (type.wall) add(`${tag}Top`, W - 2 * t, dd, 1, 'carcass', W - 2 * t);
    else if (type.tall) { add(`${tag}Top`, W - 2 * t, dd, 1, 'carcass', W - 2 * t); }
    else if (topSheet) add(`${tag}Top`, W - 2 * t, dd, 1, 'carcass', W - 2 * t);
    else add(`${tag}Top rail`, W - 2 * t, 8, 2, 'carcass', 0);
    add(`${tag}Back`, W - 0.4, H - 0.4, 1, 'back', 0);
    add(`${tag}Shelf`, W - 2 * t - 0.2, dd - 2, nShelf, 'carcass', W - 2 * t - 0.2);
  }
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
    return { panels, hw, glass, frames, appliances, acc, bars };
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
      let dh = zn.doors.h - g; let dw = zn.doors.w / doors - g;
      if (aluBox && !type.tall && !(drawers > 0)) { // the workshop's door sizes
        dh = type.wall ? H + (hidden ? 1.5 : -0.5) : H - (hidden ? 3.5 : 1);
        dw = doors === 1 ? W - 1 : doors === 2 ? (W - 2.2) / 2 : (W - 2 - (doors - 1) * 0.2) / doors;
      }
      const gz = Math.min(glazed, closedN); // open places (no door) take no frame, hinges or handle
      if (dir !== 'shutter') front(`${tag}Door`, dw, dh, closedN, gz); doorHw(closedN, dw, dh, dir);
      if (hidden) hw.handles -= closedN, hw.handleLen -= closedN * (['up', 'down'].includes(dir) ? dw : dh); // the hidden handle replaces them
      for (let i = 0; i < (dir === 'shutter' ? 0 : gz); i++) glass.push({ w: r1(alu ? dw - 2 * fw + 1.2 : dw - 8), h: r1(alu ? dh - 2 * fw + 1.2 : dh - 8), qty: 1 });
    }
  }
  if (type.wall) hw.hangers += 2;
  hw.pins += nShelf * 4;
  return { panels, hw, glass, frames, appliances, acc, bars };
}

/** Kitchen defaults from Settings: the door frame profile and the handle every kitchen uses unless it picks its own. */
let KDEF = { profile: null, handle: '', inner_t: 22, door_lining: false, inner_options: [22, 4, 5] };
export function setKitchenDefaults(d, profiles) {
  const p = d && d.profile_id ? (profiles || []).find((x) => x.id === Number(d.profile_id)) : null;
  const opts = ((d && d.inner_options) || []).map(Number).filter((n) => n > 0); KDEF = { profile: p || null, handle: (d && d.handle) || '', inner_t: Number(d && d.inner_t) > 0 ? Number(d.inner_t) : 22, door_lining: !!(d && d.door_lining), inner_options: opts.length ? opts : [22, 4, 5] };
}
export const innerOptions = () => KDEF.inner_options;
/** A kitchen's style with the Settings defaults filled in where the kitchen chose nothing. */
export function withDefaults(style) {
  const out = { ...style }; const p = KDEF.profile;
  if (!out.profile && p) { out.profile = [p.code, p.name].filter(Boolean).join(' '); out.frame_profile_id = p.id; if (p.face_w && (out.frame_w === undefined || out.frame_w === '')) out.frame_w = Math.round(+p.face_w) / 10 || undefined; if ((out.bar_len === undefined || out.bar_len === '') && p.bar_length) out.bar_len = p.bar_length; if (!(+out.profile_price > 0)) out.profile_price = Number(p.price_bar) || 0; }
  if (!out.handle && KDEF.handle) out.handle = KDEF.handle;
  if (!(+out.inner_t > 0)) out.inner_t = KDEF.inner_t;
  if (out.door_lining === undefined) out.door_lining = KDEF.door_lining;
  return out;
}
/** The sheet types and the stock the shop has (set from the data the app loads): used pieces are always cut first. */
let BOARDS = { types: [], stock: [] };
export function setBoards(b) { BOARDS = { types: (b && b.types) || [], stock: (b && b.stock) || [] }; }
export const boardTypeByName = (name) => { const n = String(name || '').toLowerCase().trim(); return n ? BOARDS.types.find((t) => String(t.name).toLowerCase().trim() === n) || null : null; };
/** The used pieces of a sheet type, one entry per piece, smallest first so the scraps go first: [{ stockId, w, h, cost }]. */
export function usedPiecesOf(typeId) {
  const out = []; for (const r of BOARDS.stock) if (r.type_id === typeId && r.kind === 'used' && (+r.length || 0) > 0 && (+r.width || 0) > 0) for (let i = 0; i < Math.floor(+r.qty || 0); i++) out.push({ uid: `${r.id}#${i}`, stockId: r.id, w: Math.max(+r.length, +r.width), h: Math.min(+r.length, +r.width), cost: +r.unit_cost || 0 });
  return out.sort((a, b) => a.w * a.h - b.w * b.h);
}

/** The ways a sheet can be cut: strips along the sheet's length, strips across its width, or the best of several plans. */
export const CUT_MODES = { optimal: 'Optimal (fewest sheets)', length: 'By length (strips along the sheet)', width: 'By width (strips across the sheet)' };

/**
 * Pack rectangles onto sheets with guillotine cuts (every cut runs edge to edge, as on a panel saw).
 * pieces: [{ w, h, qty, label, dir }] — dir 'h' keeps w along the sheet's length (sheetW), 'v' turns it across, anything else lets the planner choose.
 * opts.mode: 'length' | 'width' | 'optimal' (default). Items come back as placed: rot = true when the piece was turned.
 */
export function packSheets(pieces, sheetW, sheetH, kerf = 0.3, opts = {}) {
  const mode = CUT_MODES[opts.mode] ? opts.mode : 'optimal';
  const list = []; for (const p of pieces) for (let i = 0; i < p.qty; i++) list.push({ w: p.w, h: p.h, label: p.label, id: p.id, dir: p.dir === 'h' || p.dir === 'v' ? p.dir : '' });
  const ways = (p, W, H) => { const o = []; if (p.dir !== 'v' && p.w <= W + 1e-9 && p.h <= H + 1e-9) o.push([p.w, p.h, false]); if (p.dir !== 'h' && p.h <= W + 1e-9 && p.w <= H + 1e-9 && !(p.w === p.h && o.length)) o.push([p.h, p.w, true]); return o; };
  const total = sheetW * sheetH; const r1x = (n) => Math.round(n * 10) / 10;
  // strips: rows the full length of the sheet, each as tall as its first piece; a piece goes into the row it fills best
  const strips = (items, W, H) => {
    const sheets = []; const unfit = [];
    for (const p of items) {
      const o = ways(p, W, H); if (!o.length) { unfit.push(p); continue; }
      let best = null;
      for (const sh of sheets) for (const sf of sh.shelves) for (const [w, h, rot] of o) if (h <= sf.h + 1e-9 && sf.x + w <= W + 1e-9) { const waste = sf.h - h; if (!best || waste < best.waste) best = { sh, sf, w, h, rot, waste }; }
      if (best) { best.sh.items.push({ x: best.sf.x, y: best.sf.y, w: best.w, h: best.h, rot: best.rot, label: p.label, id: p.id }); best.sf.x += best.w + kerf; continue; }
      const [w, h, rot] = [...o].sort((m, n) => m[1] - n[1])[0]; // a new row: lay the piece flat so the row stays low
      let sh = sheets.find((x) => x.top + h <= H + 1e-9);
      if (!sh) { sh = { shelves: [], items: [], top: 0 }; sheets.push(sh); }
      sh.shelves.push({ y: sh.top, h, x: w + kerf }); sh.items.push({ x: 0, y: sh.top, w, h, rot, label: p.label, id: p.id }); sh.top += h + kerf;
    }
    const freeOf = (sh) => { const out = []; for (const sf of sh.shelves) { const rw = W - sf.x; if (rw > 0.5 && sf.h > 0.5) out.push({ x: sf.x, y: sf.y, w: r1x(rw), h: r1x(sf.h) }); } if (H - sh.top > 0.5) out.push({ x: 0, y: sh.top, w: W, h: r1x(H - sh.top) }); return out; };
    return { sheets: sheets.map((sh) => ({ items: sh.items, free: freeOf(sh) })), unfit };
  };
  // guillotine with free rectangles: each piece goes where it leaves the smallest sliver, the rest is split edge to edge
  const guillotine = (items, W, H, splitRule) => {
    const sheets = []; const unfit = [];
    const place = (sh, p) => {
      let best = null;
      for (const [fi, f] of sh.free.entries()) for (const [w, h, rot] of ways(p, W, H)) if (w <= f.w + 1e-9 && h <= f.h + 1e-9) { const score = Math.min(f.w - w, f.h - h); if (!best || score < best.score) best = { fi, f, w, h, rot, score }; }
      if (!best) return false;
      const { f, w, h } = best; sh.free.splice(best.fi, 1); sh.items.push({ x: f.x, y: f.y, w, h, rot: best.rot, label: p.label, id: p.id });
      const rw = f.w - w - kerf; const bh = f.h - h - kerf;
      const across = splitRule === 'short' ? f.w - w < f.h - h : rw * f.h < f.w * bh; // which leftover gets the full side
      const right = { x: f.x + w + kerf, y: f.y, w: rw, h: across ? h : f.h }; const below = { x: f.x, y: f.y + h + kerf, w: across ? f.w : w, h: bh };
      for (const r of [right, below]) if (r.w > 0.5 && r.h > 0.5) sh.free.push(r);
      return true;
    };
    for (const p of items) {
      if (!ways(p, W, H).length) { unfit.push(p); continue; }
      if (sheets.some((sh) => place(sh, p))) continue;
      const sh = { free: [{ x: 0, y: 0, w: W, h: H }], items: [] }; sheets.push(sh); place(sh, p);
    }
    return { sheets: sheets.map((sh) => ({ items: sh.items, free: sh.free.map((f) => ({ x: f.x, y: f.y, w: r1x(f.w), h: r1x(f.h) })) })), unfit };
  };
  // the same plan on the sheet turned a quarter: strips across the width
  const turned = (fn) => (items) => {
    const t = fn(items.map((p) => ({ ...p, w: p.w, h: p.h, dir: p.dir === 'h' ? 'v' : p.dir === 'v' ? 'h' : '' })), sheetH, sheetW);
    const flip = (i) => ({ ...i, x: i.y, y: i.x, w: i.h, h: i.w, rot: !i.rot });
    return { sheets: t.sheets.map((sh) => ({ items: sh.items.map(flip), free: sh.free.map((f) => ({ x: f.y, y: f.x, w: f.h, h: f.w })) })), unfit: t.unfit };
  };
  const sorts = [(a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h, (a, b) => b.w * b.h - a.w * a.h, (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) || Math.max(b.w, b.h) - Math.max(a.w, a.h)];
  const byLength = (items) => strips(items, sheetW, sheetH); const byWidth = turned((items) => strips(items, sheetH, sheetW));
  const plans = [];
  for (const so of sorts) {
    const items = [...list].sort(so);
    if (mode === 'length' || mode === 'optimal') plans.push(byLength(items));
    if (mode === 'width' || mode === 'optimal') plans.push(byWidth(items));
    if (mode === 'optimal') for (const rule of ['short', 'area']) { plans.push(guillotine(items, sheetW, sheetH, rule)); plans.push(turned((it) => guillotine(it, sheetH, sheetW, rule))(items)); }
  }
  const usedOf = (sh) => sh.items.reduce((a, i) => a + i.w * i.h, 0) / total;
  // fewest sheets; then the plan whose last sheet is emptiest (the biggest single offcut)
  const best = plans.sort((p, q) => p.unfit.length - q.unfit.length || p.sheets.length - q.sheets.length || (p.sheets.length ? usedOf(p.sheets.at(-1)) - usedOf(q.sheets.at(-1)) : 0))[0];
  return { mode, sheets: best.sheets.map((sh) => ({ items: sh.items, used: usedOf(sh), free: sh.free })), unfit: best.unfit };
}

/**
 * Plan the sheets of one material: the shop's used pieces first (smallest that still holds something), then new sheets.
 * pieces: [{ w, h, qty, label, dir }]. Returns { sheets: [{ items, used, free, w, h, source: 'used' | 'new', stockId, cost }], unfit, newCount, usedCount }.
 */
export function planSheets(pieces, sheetW, sheetH, kerf, opts = {}) {
  let todo = []; let n = 0; for (const p of pieces) for (let i = 0; i < p.qty; i++) todo.push({ w: p.w, h: p.h, qty: 1, label: p.label, dir: p.dir, id: ++n });
  const out = []; const usedUp = new Set();
  for (const u of opts.used || []) {
    if (!todo.length) break;
    const fit = todo.filter((p) => (p.dir !== 'v' && p.w <= u.w + 1e-9 && p.h <= u.h + 1e-9) || (p.dir !== 'h' && p.h <= u.w + 1e-9 && p.w <= u.h + 1e-9));
    if (!fit.length) continue;
    const r = packSheets(fit, u.w, u.h, kerf, opts); const sh = r.sheets[0]; if (!sh) continue;
    const placed = new Set(sh.items.map((i) => i.id)); todo = todo.filter((p) => !placed.has(p.id));
    out.push({ ...sh, w: u.w, h: u.h, source: 'used', stockId: u.stockId, uid: u.uid, cost: u.cost }); usedUp.add(u);
  }
  const nw = packSheets(todo, sheetW, sheetH, kerf, opts);
  for (const sh of nw.sheets) out.push({ ...sh, w: sheetW, h: sheetH, source: 'new' });
  return { sheets: out, unfit: nw.unfit, newCount: nw.sheets.length, usedCount: out.length - nw.sheets.length };
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

/** What the doors are made of decides which sheet types the outside of a door can be cut from. */
export const DOOR_KINDS = { wood: 'Wood', aluminium: 'Aluminium', fiber: 'Fibre', glass: 'Glass' };
const KIND_MATERIALS = { wood: ['Solid wood', 'Veneered', 'MDF', 'Melamine', 'Chipboard', 'Plywood', 'HPL', 'Acrylic'], aluminium: ['Aluminium'], fiber: ['Fibre board'], glass: ['Glass'] };
/** 22 → "2.2 cm", 4 → "4 mm": the thickness options are stored in millimetres. */
export const fmtThick = (mm) => { const n = Number(mm); return !(n > 0) ? '' : n >= 10 ? `${Math.round(n) / 10} cm` : `${n} mm`; };
export const DEFAULT_INNER = [22, 4, 5];
/** Sheet types for a purpose: by thickness (mm) and/or material. Types with no thickness set are always offered. */
export function sheetTypesFor({ thick, kind, materials } = {}) {
  const mats = materials || (kind ? KIND_MATERIALS[kind] : null);
  return BOARDS.types.filter((t) => (!(thick > 0) || !(+t.thickness > 0) || Math.abs(+t.thickness - thick) < 0.05) && (!mats || mats.includes(t.material)));
}
/** The mat key of a part cut from a sheet picked for one cabinet only: "role@sheet name". */
export const matRole = (mat) => String(mat).split('@')[0];
export const matCustom = (mat) => (String(mat).includes('@') ? String(mat).slice(String(mat).indexOf('@') + 1) : '');
const ROLE_LABEL = { carcass: 'Carcass boards', door: 'Doors & drawer fronts', back: 'Back panels', end: 'Visible sides (ends)', design: 'Design sheet', white16: 'Door inside 1.6 cm', white22: 'Interior sheet' };
/** Heading for a sheet group, e.g. "Interior sheet 2.2 cm — Melamine white". */
export function matLabel(mat, style = {}) {
  const role = matRole(mat); const custom = matCustom(mat); let l = ROLE_LABEL[role] || role;
  if (role === 'white22') l = `Interior sheet (sides, shelves, back) ${fmtThick(style.inner_t || 22)}`;
  if (role === 'white16') l = 'Door inside sheet 1.6 cm';
  if (role === 'door' && style.kind === 'aluminium') l = 'Infill panels in the aluminium frames';
  if (role === 'door' && style.door_kind && style.door_kind !== 'wood') l = `Door outside sheet — ${DOOR_KINDS[style.door_kind]}`;
  return custom ? `${l} · custom: ${custom}` : l;
}
const ROLES = ['carcass', 'back', 'door', 'white22', 'white16', 'design', 'end'];
/** Panels, hardware and glass for one cabinet, with the doors' kind (glass: no inside sheet), the lining behind each door and sheets picked for this cabinet only (cab.sheets). */
export function cabinetParts(cab, style = DEFAULT_STYLE) {
  const s = { ...DEFAULT_STYLE, ...style };
  const glassDoors = s.door_kind === 'glass'; const c0 = glassDoors && !(+cab.glazed >= Math.round(+cab.doors || 0)) ? { ...cab, glazed: Math.max(0, Math.round(+cab.doors || 0)) } : cab;
  const r = cabinetPartsBase(c0, style);
  if (s.door_lining && !glassDoors) { const extra = []; for (const p of r.panels) if (p.mat === 'door') extra.push({ ...p, label: `${p.label} (inside)`, mat: 'white16', edge: 0 }); r.panels.push(...extra); }
  const gasN = cab.glass_gasket || s.glass_gasket || ''; for (const g of r.glass) g.gasket = gasN; r.hw.gasket = glazingFix(r.glass).metres; // a glazed kitchen door has a gasket of its own type (no clips)
  const ov = cab.sheets || {};
  if (Object.values(ov).some(Boolean)) for (const p of r.panels) { const name = ov[matRole(p.mat)]; if (name) p.mat = `${matRole(p.mat)}@${name}`; }
  return r;
}
/** The key a part keeps its chosen cutting direction under: material, part name (without the cabinet) and size. */
export const cutKey = (mat, p) => `${mat}|${String(p.label).replace(/^.* · /, '')}|${p.w}|${p.h}`;
/** Everything about a kitchen: panels by material, sheets, hardware, countertop slabs. */
export function kitchenModel(spec) {
  const style = { ...DEFAULT_STYLE, ...withDefaults(spec.style || {}) }; const counter = { ...DEFAULT_COUNTER, ...(spec.counter || {}) };
  const runs = spec.runs || [];
  const panels = { carcass: [], back: [], door: [], skirt: [], white22: [], white16: [], design: [], end: [] }; const aluBars = []; const hw = { hinges: 0, handles: 0, slides: 0, legs: 0, hangers: 0, pins: 0, handleLen: 0, tracks: 0, lifts: 0, shutters: 0, gasket: 0 }; const glass = []; const frames = []; const appliances = []; const accessories = {};
  const meters = { base: 0, wall: 0, tall: 0, units: 0, base_n: 0, wall_n: 0, tall_n: 0 };
  let edge = 0;
  const joins = []; let runX = 0; let curRun = -1; // hidden-handle stretches, joined where cabinets touch
  for (const [ri, run] of runs.entries()) for (const [ci, cab] of (run.cabinets || []).entries()) {
    if (ri !== curRun) { curRun = ri; runX = 0; }
    const type = CAB_TYPES[cab.type] || CAB_TYPES.base; const cabs = run.cabinets || []; const ends = style.end_sheet && !type.gap && !type.corner ? (cab.end_left ?? ci === 0 ? 1 : 0) + (cab.end_right ?? ci === cabs.length - 1 ? 1 : 0) : 0; // sides the customer sees: the ends of a run, unless set by hand
    const p = cabinetParts({ ...cab, label: cab.label || `${String.fromCharCode(65 + (ri % 26))}${ci + 1}`, _ends: ends }, style); // an unnamed cabinet is called by its run and place: A1, A2…
    for (const x of p.panels) { (panels[x.mat] ||= []).push(x); edge += x.edge * x.qty; } // (skirting cut from a profile is listed apart)
    for (const k of Object.keys(hw)) hw[k] += p.hw[k]; glass.push(...p.glass); frames.push(...p.frames); for (const b of p.bars) { if (b.seg) { const name = cab.label || `${String.fromCharCode(65 + (ri % 26))}${ci + 1}`; const last = joins.at(-1); const a = runX + b.seg[0]; const z = runX + b.seg[1]; if (last && last.ri === ri && Math.abs(last.z - a) < 0.05) { last.z = z; if (!last.cabs.includes(name)) last.cabs.push(name); } else joins.push({ ri, a, z, cabs: [name], code: b.code }); } else aluBars.push(b); } appliances.push(...p.appliances); for (const [k, n] of Object.entries(p.acc)) accessories[k] = (accessories[k] || 0) + n;
    runX += +cab.w || 0;
    const w = (+cab.w || 0) / 100; if (type.gap) continue;
    meters.units++; if (type.wall) { meters.wall += w; meters.wall_n++; } else if (type.tall) { meters.tall += w; meters.tall_n++; } else { meters.base += w; meters.base_n++; }
  }
  const sheets = {}; const claimed = new Set(); // a used piece can only be cut for one material
  const typeOf = (mat) => boardTypeByName(matCustom(mat) || { carcass: style.carcass, door: style.door || style.carcass, back: style.back || style.carcass, white22: style.white22, white16: style.white16, design: style.design, end: style.end_sheet || style.carcass }[matRole(mat)]);
  for (const mat of Object.keys(panels).filter((m) => m !== 'skirt').sort((a, b) => (ROLES.indexOf(matRole(a)) - ROLES.indexOf(matRole(b))) || a.localeCompare(b))) {
    const white = matRole(mat) === 'white22' || matRole(mat) === 'white16'; const ty = typeOf(mat);
    const sw = ty && +ty.sheet_w > 0 ? Math.max(+ty.sheet_w, +ty.sheet_h) : white ? (+style.white_w || 280) : style.sheet_w; const sh = ty && +ty.sheet_h > 0 ? Math.min(+ty.sheet_w, +ty.sheet_h) : white ? (+style.white_h || 130) : style.sheet_h;
    const dirs = spec.cut_dir || {}; const pk = planSheets(panels[mat].map((x) => ({ ...x, dir: dirs[cutKey(mat, x)] || '' })), sw, sh, style.kerf, { mode: style.cut_mode, used: ty ? usedPiecesOf(ty.id).filter((u) => !claimed.has(u.uid)) : [] }); for (const sh2 of pk.sheets) if (sh2.source === 'used') claimed.add(sh2.uid);
    sheets[mat] = { ...pk, sw, sh, type: ty ? ty.name : '', area: panels[mat].reduce((a, p) => a + p.w * p.h * p.qty, 0) / 10000 };
  }
  for (const j of joins) aluBars.push({ code: j.code, label: `${j.cabs.join('+')} · Hidden handle profile${j.cabs.length > 1 ? ' (one piece)' : ''}`, len: r1(j.z - j.a), qty: 1 });
  const byCode = new Map(); for (const x of aluBars) { const e = byCode.get(x.code) || []; e.push(x); byCode.set(x.code, e); }
  const barLen = +style.bar_len || 600;
  const carcassBars = [...byCode.entries()].sort((p, q) => String(p[0]).localeCompare(String(q[0]), undefined, { numeric: true })).map(([code, list]) => ({ code, ...packLengths(list.map((x) => ({ len: x.len, qty: x.qty, label: x.label })), barLen), parts: list }));
  const skirtBars = panels.skirt.length ? packLengths(panels.skirt.map((x) => ({ len: x.w, qty: x.qty, label: x.label })), +style.plinth_bar_len || 600) : null;
  const profile = style.kind === 'aluminium' ? packBars(frames, +style.bar_len || 600, +style.frame_w || 4.5) : null;
  return { style, counter, panels, hw, glass, frames, appliances, accessories, profile, skirtBars, carcassBars, sheets, meters, edge_m: edge / 100, tops: counterTops(runs, counter, style) };
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
  const unitPrice = (name) => { const t = boardTypeByName(name); return t ? Number(t.price) || 0 : o('panel', name)?.price; };
  const sizeOf = (m) => `sheet ${sheets[m].sw}×${sheets[m].sh}`;
  const roleName = { carcass: style.carcass, door: style.door || style.carcass, back: style.back || style.carcass, white22: style.white22, white16: style.white16, design: style.design, end: style.end_sheet || style.carcass };
  const MATS = Object.keys(sheets).map((m) => [m, matLabel(m, style), matCustom(m) || roleName[matRole(m)]]);
  for (const [m, label, name] of MATS) {
    if (!sheets[m] || !sheets[m].newCount) continue;
    const back = matRole(m) === 'back' ? o('panel', name) : null; const price = back ? (back.meta?.back_price ?? back.price) : unitPrice(name);
    add('Boards', `${label}${name ? ' — ' + name : m === 'carcass' ? ' — not chosen' : ''}`, sheets[m].newCount, sizeOf(m), boardTypeByName(name) ? Number(boardTypeByName(name).price) || 0 : price, { kind: 'panel', name });
  }
  { const used = MATS.flatMap(([m]) => (sheets[m] ? sheets[m].sheets.filter((x) => x.source === 'used') : [])); if (used.length) add('Boards', 'Used sheets from stock (cut first)', used.length, 'pieces', used.reduce((a, x) => a + (x.cost || 0), 0) / used.length); }
  if (model.profile) { const pr = o('profile', style.profile) || ((opts.alu || {})[String(style.profile || '').split(' ')[0] || ALU.door]); add('Door frames', `Door frame profile — ${style.profile || ALU.door} (height and width)`, model.profile.bars.length, `bar ${style.bar_len || 600} cm`, Number(style.profile_price) > 0 ? Number(style.profile_price) : pr?.price, { kind: 'profile', name: style.profile }); add('Door frames', 'Frame corner joints / assembly', model.profile.corners, 'corners', gen('frame_corner')); }
  add('Boards', 'Edge banding', model.edge_m, 'm', gen('edge_band_m'));
  if (model.skirtBars) add('Skirting', `Skirting profile — ${style.plinth_profile}`, model.skirtBars.bars.length, `bar ${style.plinth_bar_len || 600} cm`, Number(style.plinth_price) || 0, { kind: 'plinth', name: style.plinth_profile });
  for (const g of model.carcassBars || []) { const cat = (opts.alu || {})[g.code] || {}; add('Aluminium profiles', `Profile ${g.code}${cat.name ? ' — ' + cat.name : ''} (cabinet frames)`, g.bars.length, `bar ${style.bar_len || 600} cm`, cat.price, { kind: 'alu', name: g.code }); }
  const hinge = o('hinge', style.hinge); add('Hardware', `Hinges — ${style.hinge || 'not chosen'}`, hw.hinges, 'pcs', hinge?.price);
  const drw = o('drawer', style.drawer); add('Hardware', `Drawer sets — ${style.drawer || 'not chosen'}`, hw.slides, 'sets', drw?.price);
  const handle = o('handle', style.handle);
  if (handle && /m$/i.test(handle.unit || '')) add('Hardware', `Handles — ${style.handle}`, hw.handleLen / 100, 'm', handle.price); else add('Hardware', `Handles — ${style.handle || 'not chosen'}`, hw.handles, 'pcs', handle?.price);
  add('Hardware', 'Roller shutter sets (slats, track, handle strip)', hw.shutters, 'sets', gen('shutter')); add('Hardware', 'Sliding door tracks', hw.tracks, 'sets', gen('slide_track')); add('Hardware', 'Lift-up mechanisms', hw.lifts, 'pcs', gen('lift_up'));
  for (const [k, n] of Object.entries(model.accessories || {})) add('Accessories', ACCESSORIES[k]?.[0] || k, n, 'pcs', gen('acc_' + k));
  for (const a of model.appliances || []) if (a.k !== 'hood') { /* appliances are bought by the customer: space only */ } else add('Accessories', 'Cooker hood fitting', 1, 'pcs', gen('acc_hood'));
  add('Hardware', 'Legs', hw.legs, 'pcs', gen('leg')); add('Hardware', 'Wall hangers', hw.hangers, 'pcs', gen('hanger')); add('Hardware', 'Shelf pins', hw.pins, 'pcs', gen('pin'));
  { const by = (key) => { const m = new Map(); for (const g of model.glass) { const n = g[key] || ''; m.set(n, (m.get(n) || 0) + glazingFix([g]).metres); } return m; };
    for (const [n, q] of by('gasket')) add('Glass', `Glass gasket${n ? ' — ' + n : ''}`, q, 'm', n && o('gasket', n) ? o('gasket', n).price : gen('glass_gasket_m')); }
  const glassArea = model.glass.reduce((a, g) => a + (g.w * g.h * g.qty) / 10000, 0); const gType = boardTypeByName(style.glass); add('Glass', `Glazed doors — ${style.glass || 'glass'}`, glassArea, 'm²', gType ? (Number(gType.price) || 0) / (Math.max(1, (+gType.sheet_w || 0) * (+gType.sheet_h || 0)) / 10000) : o('glass', style.glass)?.price);
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
