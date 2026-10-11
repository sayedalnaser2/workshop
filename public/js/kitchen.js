// Kitchen cabinet and countertop modelling: cabinets → panels, hardware, sheets, countertop slabs, cost and price.
// Pure functions (shared by the browser and the tests). All sizes are in centimetres.

export const CAB_TYPES = {
  base:    { label: 'Base cabinet',  w: 60, h: 72,  d: 56, doors: 1, drawers: 0, shelves: 1, counter: true },
  drawers: { label: 'Drawer base',   w: 60, h: 72,  d: 56, doors: 0, drawers: 3, shelves: 0, counter: true },
  sink:    { label: 'Sink base',     w: 90, h: 72,  d: 56, doors: 2, drawers: 0, shelves: 0, counter: true, sink: 1 },
  hob:     { label: 'Hob base',      w: 60, h: 72,  d: 56, doors: 0, drawers: 2, shelves: 0, counter: true, hob: 1 },
  corner:  { label: 'Corner base',   w: 90, h: 72,  d: 56, doors: 1, drawers: 0, shelves: 1, counter: true, corner: 1 },
  wall:    { label: 'Wall cabinet',  w: 60, h: 70,  d: 32, doors: 1, drawers: 0, shelves: 1, wall: true },
  tall:    { label: 'Tall unit',     w: 60, h: 210, d: 58, doors: 2, drawers: 0, shelves: 4, tall: true },
  gap:     { label: 'Appliance gap', w: 60, h: 85,  d: 60, doors: 0, drawers: 0, shelves: 0, gap: true },
};
export const DEFAULT_STYLE = {
  carcass: '', door: '', back: '', handle: '', hinge: '', drawer: '', glass: '', profile_in: '', profile_out: '',
  t: 1.8, back_t: 0.6, plinth: 10, wall_height: 140, sheet_w: 244, sheet_h: 122, kerf: 0.3, gap: 0.4,
};
export const DEFAULT_COUNTER = { material: '', thickness: 2, front: 2, side: 0, splash_h: 0, slab_w: 300, slab_h: 140, waste: 15, extra_sinks: 0, extra_hobs: 0 };

const r1 = (n) => Math.round(n * 10) / 10;
const hingesFor = (h) => (h <= 90 ? 2 : h <= 160 ? 3 : h <= 220 ? 4 : 5);

/** Panels, hardware and glass for one cabinet. mat: carcass | back | door. edge = banded edge length per piece (cm). */
export function cabinetParts(cab, style = DEFAULT_STYLE) {
  const s = { ...DEFAULT_STYLE, ...style }; const t = s.t; const b = s.back_t; const g = s.gap;
  const W = +cab.w || 0, H = +cab.h || 0, D = +cab.d || 0;
  const doors = Math.max(0, Math.round(+cab.doors || 0)); const drawers = Math.max(0, Math.round(+cab.drawers || 0));
  const shelves = Math.max(0, Math.round(+cab.shelves || 0)); const glazed = Math.min(doors, Math.max(0, Math.round(+cab.glazed || 0)));
  const type = CAB_TYPES[cab.type] || CAB_TYPES.base;
  const panels = []; const hw = { hinges: 0, handles: 0, slides: 0, legs: 0, hangers: 0, pins: 0, handleLen: 0 }; const glass = [];
  if (type.gap || !(W > 0 && H > 0 && D > 0)) return { panels, hw, glass };
  const add = (label, w, h, qty, mat, edge = 0) => { if (qty > 0 && w > 0 && h > 0) panels.push({ label, w: r1(w), h: r1(h), qty, mat, edge: r1(edge) }); };
  const tag = cab.label ? `${cab.label} · ` : '';
  const dd = D - b - 1; // depth of horizontal panels (back sits behind them)
  add(`${tag}Side`, dd + b + 1 > D ? D : D, H, 2, 'carcass', H); // sides: front edge banded
  add(`${tag}Bottom`, W - 2 * t, dd, 1, 'carcass', W - 2 * t);
  if (type.wall) add(`${tag}Top`, W - 2 * t, dd, 1, 'carcass', W - 2 * t);
  else if (type.tall) { add(`${tag}Top`, W - 2 * t, dd, 1, 'carcass', W - 2 * t); }
  else add(`${tag}Top rail`, W - 2 * t, 8, 2, 'carcass', 0);
  add(`${tag}Back`, W - 0.4, H - 0.4, 1, 'back', 0);
  add(`${tag}Shelf`, W - 2 * t - 0.2, dd - 2, shelves, 'carcass', W - 2 * t - 0.2);
  // drawers share the height with doors only on mixed cabinets; here a cabinet is either doors or drawers (or a stack above doors)
  const avail = H - (type.wall || type.tall ? 0 : 0);
  if (drawers > 0) {
    const dh = r1(avail / drawers);
    for (let i = 0; i < drawers; i++) add(`${tag}Drawer front ${i + 1}`, W - g, dh - g, 1, 'door', 2 * (W - g + dh - g));
    hw.slides += drawers; hw.handles += drawers; hw.handleLen += drawers * (W - g);
  }
  if (doors > 0) {
    const dh = avail - g; const dw = W / doors - g;
    add(`${tag}Door`, dw, dh, doors, 'door', 2 * (dw + dh));
    hw.hinges += doors * hingesFor(dh); hw.handles += doors; hw.handleLen += doors * dh;
    for (let i = 0; i < glazed; i++) glass.push({ w: r1(dw - 8), h: r1(dh - 8), qty: 1 });
  }
  if (type.wall) hw.hangers += 2; else hw.legs += type.tall ? 0 : 4;
  hw.pins += shelves * 4;
  return { panels, hw, glass };
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
  return { sheets: sheets.map((s) => ({ items: s.items, used: s.items.reduce((a, i) => a + i.w * i.h, 0) / total })), unfit };
}

/** Everything about a kitchen: panels by material, sheets, hardware, countertop slabs. */
export function kitchenModel(spec) {
  const style = { ...DEFAULT_STYLE, ...(spec.style || {}) }; const counter = { ...DEFAULT_COUNTER, ...(spec.counter || {}) };
  const runs = spec.runs || [];
  const panels = { carcass: [], back: [], door: [] }; const hw = { hinges: 0, handles: 0, slides: 0, legs: 0, hangers: 0, pins: 0, handleLen: 0 }; const glass = [];
  const meters = { base: 0, wall: 0, tall: 0, units: 0, base_n: 0, wall_n: 0, tall_n: 0 };
  let edge = 0;
  for (const run of runs) for (const cab of run.cabinets || []) {
    const type = CAB_TYPES[cab.type] || CAB_TYPES.base; const p = cabinetParts(cab, style);
    for (const x of p.panels) { panels[x.mat].push(x); edge += x.edge * x.qty; }
    for (const k of Object.keys(hw)) hw[k] += p.hw[k]; glass.push(...p.glass);
    const w = (+cab.w || 0) / 100; if (type.gap) continue;
    meters.units++; if (type.wall) { meters.wall += w; meters.wall_n++; } else if (type.tall) { meters.tall += w; meters.tall_n++; } else { meters.base += w; meters.base_n++; }
  }
  const sheets = {};
  for (const mat of ['carcass', 'back', 'door']) {
    const pk = packSheets(panels[mat], style.sheet_w, style.sheet_h, style.kerf);
    sheets[mat] = { ...pk, area: panels[mat].reduce((a, p) => a + p.w * p.h * p.qty, 0) / 10000 };
  }
  return { style, counter, panels, hw, glass, sheets, meters, edge_m: edge / 100, tops: counterTops(runs, counter, style) };
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
      if (type.sink) sinks += type.sink; if (type.hob) hobs += type.hob; if (type.corner) corners++;
    }
    close();
  });
  // an island stands free: no splash back, and a seating overhang on the far side
  const out = pieces.map((p) => ({ ...p, len: r1(p.len + 2 * (+c.side || 0)), depth: r1(p.depth + (+c.front || 0) + p.over), splash: c.splash_h > 0 && !p.island ? r1(p.len) : 0 }));
  const area = out.reduce((a, p) => a + (p.len * p.depth + p.splash * c.splash_h) / 10000, 0);
  const slabsPieces = []; for (const p of out) { slabsPieces.push({ w: p.len, h: p.depth, qty: 1, label: `${p.runName || 'Run'} top` }); if (p.splash) slabsPieces.push({ w: p.splash, h: c.splash_h, qty: 1, label: 'Splash' }); }
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
  add('Boards', 'Edge banding', model.edge_m, 'm', gen('edge_band_m'));
  const hinge = o('hinge', style.hinge); add('Hardware', `Hinges — ${style.hinge || 'not chosen'}`, hw.hinges, 'pcs', hinge?.price);
  const drw = o('drawer', style.drawer); add('Hardware', `Drawer sets — ${style.drawer || 'not chosen'}`, hw.slides, 'sets', drw?.price);
  const handle = o('handle', style.handle);
  if (handle && /m$/i.test(handle.unit || '')) add('Hardware', `Handles — ${style.handle}`, hw.handleLen / 100, 'm', handle.price); else add('Hardware', `Handles — ${style.handle || 'not chosen'}`, hw.handles, 'pcs', handle?.price);
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
