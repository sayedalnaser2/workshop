// Stock, leftovers and purchase-order logic shared by the quotation editor, cutting list and PO dialog.
import { computeModel, nestBars } from './calc.js';

const fin = Number.isFinite;
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/** Cost of one cm of new profile. */
export const cpc = (p) => (p && p.bar_length > 0 ? (p.price_bar || 0) / p.bar_length : 0);
/** Suggested value of a leftover piece: pro-rata new cost × leftover_pct. */
export const leftoverValue = (profile, length, pct = 100) => Math.round(cpc(profile) * length * (pct / 100) * 1000) / 1000;

/** Every profile piece and glass pane a quotation needs (items that have a model and a size). */
export function quotePieces(q, models, lib) {
  const out = [];
  (q.items || []).forEach((it, i) => {
    if (it.kind === 'note') return;
    const m = models.find((x) => x.id === Number(it.model_id));
    if (!m || !(Number(it.w) > 0 && Number(it.h) > 0)) return;
    const r = computeModel(m, it.w, it.h, lib);
    const n = Math.max(1, Math.round(Number(it.qty) || 1));
    const colour = it.colour || q.colour || '';
    for (const p of r.profiles) {
      if (!fin(p.length) || !fin(p.qty) || !p.profile_id) continue;
      for (let k = 0; k < Math.round(p.qty) * n; k++) out.push({ kind: 'profile', item: i, label: p.label, profile_id: Number(p.profile_id), length: Math.round(p.length * 10) / 10, colour, model: m.name });
    }
    for (const g of r.glass) {
      if (!fin(g.w) || !fin(g.h)) continue;
      for (let k = 0; k < Math.round(g.qty) * n; k++) out.push({ kind: 'glass', item: i, label: g.label, glass_id: it.glass_id ? Number(it.glass_id) : null, w: Math.round(g.w * 10) / 10, h: Math.round(g.h * 10) / 10, model: m.name });
    }
    for (const a of r.accessories) if (fin(a.qty)) out.push({ kind: 'accessory', item: i, label: a.label, accessory_id: a.accessory_id ? Number(a.accessory_id) : null, qty: a.qty * n, model: m.name });
  });
  return out;
}

/** Expand leftover rows (qty = number of identical pieces) into single usable units. */
export function leftoverUnits(stock, quoteNo = '') {
  const units = [];
  for (const s of stock) {
    if (s.kind !== 'leftover' || !(s.qty > 0)) continue;
    if (s.reserved_for && quoteNo && s.reserved_for !== quoteNo) continue;
    if (s.reserved_for && !quoteNo) continue;
    for (let k = 0; k < Math.round(s.qty); k++) units.push({ row: s, id: s.id, profile_id: s.profile_id, glass_id: s.glass_id, item_type: s.item_type, colour: s.colour || '', length: s.length, width: s.width, remaining: s.length, cost: s.unit_cost || 0, location: s.location || '', used: false });
  }
  return units;
}

/**
 * Greedy best-fit: put profile pieces (longest first) on the smallest leftover that still fits, and glass panes on
 * a leftover pane of the same glass type that covers them. Returns allocations with the price difference.
 */
export function allocateLeftovers(pieces, stock, { profiles, glassTypes, kerf = 0, quoteNo = '' }) {
  const units = leftoverUnits(stock, quoteNo);
  const allocs = []; const unplaced = [];
  const profs = pieces.filter((p) => p.kind === 'profile').sort((a, b) => b.length - a.length);
  for (const p of profs) {
    const cands = units.filter((u) => u.item_type !== 'glass' && u.profile_id === p.profile_id && (!p.colour || same(u.colour, p.colour)) && u.remaining >= p.length + (u.used ? kerf : 0) - 1e-9);
    if (!cands.length) { unplaced.push(p); continue; }
    const u = cands.sort((a, b) => a.remaining - b.remaining)[0];
    const prof = profiles.find((x) => x.id === p.profile_id);
    const newCost = cpc(prof) * p.length;
    const unitCpc = u.length > 0 ? u.cost / u.length : 0;
    const leftCost = unitCpc * p.length;
    u.remaining -= p.length + (u.used ? kerf : 0); u.used = true;
    allocs.push({ piece: p, unit: u, newCost, leftCost, saving: newCost - leftCost, remainder: u.remaining });
  }
  for (const p of pieces.filter((x) => x.kind === 'glass')) {
    const fits = (u) => u.item_type === 'glass' && u.glass_id === p.glass_id && !u.used && ((u.length >= p.w && u.width >= p.h) || (u.length >= p.h && u.width >= p.w));
    const u = units.filter(fits).sort((a, b) => a.length * a.width - b.length * b.width)[0];
    if (!u) { unplaced.push(p); continue; }
    const g = glassTypes.find((x) => x.id === p.glass_id);
    const newCost = (p.w * p.h / 10000) * (g?.price_m2 || 0);
    const leftCost = u.length * u.width > 0 ? (u.cost / (u.length * u.width)) * p.w * p.h : 0;
    u.used = true; u.remaining = 0;
    allocs.push({ piece: p, unit: u, newCost, leftCost, saving: newCost - leftCost, remainder: 0 });
  }
  return { allocs, unplaced, saving: allocs.reduce((s, a) => s + a.saving, 0), newCost: allocs.reduce((s, a) => s + a.newCost, 0), leftCost: allocs.reduce((s, a) => s + a.leftCost, 0) };
}

/** Nest pieces on leftover units first (best fit), then on new bars. */
export function nestWithLeftovers(pieces, units, barLength, kerf = 0) {
  const sorted = [...pieces].sort((a, b) => b.length - a.length);
  const us = units.map((u) => ({ ...u, remaining: u.length, cuts: [] }));
  const bars = []; const unfit = [];
  for (const p of sorted) {
    if (!(p.length > 0)) continue;
    const fitU = us.filter((u) => u.remaining >= p.length + (u.cuts.length ? kerf : 0) - 1e-9).sort((a, b) => a.remaining - b.remaining)[0];
    if (fitU) { fitU.remaining -= p.length + (fitU.cuts.length ? kerf : 0); fitU.cuts.push(p); continue; }
    if (p.length > barLength) { unfit.push(p); continue; }
    let bar = bars.find((b) => b.used + p.length + (b.pieces.length ? kerf : 0) <= barLength + 1e-9);
    if (!bar) { bar = { pieces: [], used: 0 }; bars.push(bar); }
    bar.used += p.length + (bar.pieces.length ? kerf : 0); bar.pieces.push(p);
  }
  return { leftoverUsed: us.filter((u) => u.cuts.length), bars, unfit };
}

/** Lines for a purchase order: bars per profile+colour (after leftovers), glass area, accessories — minus what is already in new stock. */
export function poSuggestions(q, { models, profiles, accessories, glassTypes, items, stock, kerf = 0 }) {
  const lib = { profiles, accessories };
  const pieces = quotePieces(q, models, lib);
  const { unplaced } = allocateLeftovers(pieces, stock, { profiles, glassTypes, kerf, quoteNo: q.number });
  const lines = [];
  const prof = {};
  for (const p of unplaced.filter((x) => x.kind === 'profile')) (prof[`${p.profile_id}|${p.colour}`] ||= { profile_id: p.profile_id, colour: p.colour, pieces: [] }).pieces.push(p);
  for (const g of Object.values(prof)) {
    const pr = profiles.find((x) => x.id === g.profile_id); const bl = pr?.bar_length || 600;
    const need = nestBars(g.pieces, bl, kerf).bars.length;
    const have = stock.filter((s) => s.kind === 'new' && s.profile_id === g.profile_id && (!g.colour || same(s.colour, g.colour))).reduce((s, r) => s + (r.qty || 0), 0);
    const cats = items.filter((i) => i.profile_id === g.profile_id).sort((a, b) => (a.price || 1e9) - (b.price || 1e9));
    lines.push({ kind: 'profile', profile_id: g.profile_id, name: pr ? `${pr.series || ''} ${pr.name}`.trim() : 'Profile', code: pr?.code || '', colour: g.colour, need, inStock: have, qty: Math.max(0, need - have), unit: `bar ${bl} cm`, price: cats[0]?.price || pr?.price_bar || 0, supplier: cats[0]?.supplier || '' });
  }
  const gl = {};
  for (const p of unplaced.filter((x) => x.kind === 'glass')) { const k = p.glass_id || 0; gl[k] = (gl[k] || 0) + (p.w * p.h) / 10000; }
  for (const [gid, m2] of Object.entries(gl)) {
    const gt = glassTypes.find((x) => x.id === Number(gid)); const cat = items.find((i) => i.glass_id === Number(gid));
    lines.push({ kind: 'glass', glass_id: Number(gid) || null, name: `Glass ${gt?.name || '(type not chosen)'}`, code: '', colour: '', need: Math.round(m2 * 100) / 100, inStock: 0, qty: Math.round(m2 * 100) / 100, unit: 'm²', price: cat?.price || gt?.price_m2 || 0, supplier: cat?.supplier || '' });
  }
  const ac = {};
  for (const p of pieces.filter((x) => x.kind === 'accessory' && x.accessory_id)) ac[p.accessory_id] = (ac[p.accessory_id] || 0) + p.qty;
  for (const [aid, qty] of Object.entries(ac)) {
    const a = accessories.find((x) => x.id === Number(aid)); const cat = items.find((i) => i.accessory_id === Number(aid));
    lines.push({ kind: 'accessory', accessory_id: Number(aid), name: a?.name || 'Accessory', code: a?.code || '', colour: '', need: Math.ceil(qty), inStock: 0, qty: Math.ceil(qty), unit: a?.unit || 'ea', price: cat?.price || a?.price || 0, supplier: cat?.supplier || '' });
  }
  return lines;
}

/**
 * Library items (profiles, glass, accessories) whose new stock is at or below their alert level.
 * Returns [{type,id,name,code,onHand,min,unit,suggest}] — suggest orders enough to reach twice the minimum.
 */
export function lowStock(stock, { profiles = [], glassTypes = [], accessories = [] }) {
  const out = []; const nw = stock.filter((s) => s.kind === 'new');
  const sum = (f) => nw.filter(f).reduce((a, s) => a + (Number(s.qty) || 0), 0);
  const add = (type, r, onHand, unit) => { const min = Number(r.min_qty) || 0; if (min > 0 && onHand <= min + 1e-9) out.push({ type, id: r.id, name: type === 'profile' ? `${r.series || ''} ${r.name}`.trim() : r.name, code: r.code || '', onHand, min, unit, suggest: Math.max(1, Math.ceil(min * 2 - onHand)) }); };
  for (const p of profiles) add('profile', p, sum((s) => s.profile_id === p.id), 'bar');
  for (const g of glassTypes) add('glass', g, sum((s) => s.glass_id === g.id), 'sheet');
  for (const a of accessories) add('accessory', a, sum((s) => s.item_type === 'accessory' && same(s.name, a.name)), a.unit || 'ea');
  return out.sort((a, b) => a.onHand / a.min - b.onHand / b.min);
}
