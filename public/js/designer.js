// Custom window / door designs: a frame divided by vertical and horizontal dividers, every pane with its own opening type.
// A layout is a tree: a pane { t } or a divider { d: 'v'|'h', f, a, b } (f = share of the first part, 0–1).
// Everything here is pure; models.js draws the editor and drawings.js draws the result.

export const LEAF_TYPES = { F: 'Fixed pane (F)', HL: 'Opens – hinged on the left', HR: 'Opens – hinged on the right', BT: 'Bottom hinged (tilts in)', TT: 'Top hung (awning)', SL: 'Sliding – moves to the left', SR: 'Sliding – moves to the right' };
const OPENERS = new Set(['HL', 'HR', 'BT', 'TT', 'SL', 'SR']);
export const newLayout = () => ({ t: 'F' });
export const isDivider = (n) => !!(n && n.d);

/** The node at a path like 'a.b' ('' = the root). */
export function nodeAt(layout, path) { let n = layout; for (const k of path ? path.split('.') : []) n = n[k]; return n; }
/** A copy of the layout with the node at `path` replaced by whatever `fn` returns. */
export function change(layout, path, fn) {
  const go = (n, keys) => { if (!keys.length) return fn(n); return { ...n, [keys[0]]: go(n[keys[0]], keys.slice(1)) }; };
  return go(layout, path ? path.split('.') : []);
}
export const split = (layout, path, d, f = .5) => change(layout, path, (leaf) => ({ d, f: Math.min(.95, Math.max(.05, f)), a: { ...leaf }, b: { t: 'F' } }));
/** Remove a divider: the two panes become one (it keeps the first pane's type). */
export const merge = (layout, path) => change(layout, path, (n) => { let x = n; while (isDivider(x)) x = x.a; return { t: x.t || 'F' }; });
export const setType = (layout, path, t) => change(layout, path, (n) => ({ ...n, t }));
export const setFraction = (layout, path, f) => change(layout, path, (n) => ({ ...n, f: Math.min(.95, Math.max(.05, f)) }));

/** All panes, left to right / top to bottom, with their box as fractions of the frame (0–1). */
export function leaves(layout) {
  const out = [];
  const walk = (n, path, x0, x1, y0, y1) => {
    if (!isDivider(n)) { out.push({ path, t: n.t || 'F', x0, x1, y0, y1 }); return; }
    if (n.d === 'v') { const m = x0 + (x1 - x0) * n.f; walk(n.a, path ? path + '.a' : 'a', x0, m, y0, y1); walk(n.b, path ? path + '.b' : 'b', m, x1, y0, y1); }
    else { const m = y0 + (y1 - y0) * n.f; walk(n.a, path ? path + '.a' : 'a', x0, x1, y0, m); walk(n.b, path ? path + '.b' : 'b', x0, x1, m, y1); }
  };
  walk(layout, '', 0, 1, 0, 1); return out;
}
/** All dividers with the box they split. */
export function dividers(layout) {
  const out = [];
  const walk = (n, path, x0, x1, y0, y1) => {
    if (!isDivider(n)) return;
    out.push({ path, d: n.d, f: n.f, x0, x1, y0, y1 });
    if (n.d === 'v') { const m = x0 + (x1 - x0) * n.f; walk(n.a, path ? path + '.a' : 'a', x0, m, y0, y1); walk(n.b, path ? path + '.b' : 'b', m, x1, y0, y1); }
    else { const m = y0 + (y1 - y0) * n.f; walk(n.a, path ? path + '.a' : 'a', x0, x1, y0, m); walk(n.b, path ? path + '.b' : 'b', x0, x1, m, y1); }
  };
  walk(layout, '', 0, 1, 0, 1); return out;
}

const r4 = (v) => Math.round(v * 10000) / 10000;
/**
 * Cut formulas for a layout. ids = { frame, sash, mullion } profile ids; acc = { hinge, handle, roller, lock, silicone, pile, rubber } accessory ids.
 * Sizes use W and H (cm) and three adjustable values: FW frame / mullion width, SW sash width, GC glass clearance.
 */
export function layoutToSpec(layout, ids, acc = {}) {
  const profiles = []; const glass = []; const a = {}; const exprs = { pile: [], rubber: [] };
  const add = (k, n) => { a[k] = (a[k] || 0) + n; };
  profiles.push({ label: 'Frame – width', profile_id: ids.frame, len: 'W', qty: '2' }, { label: 'Frame – height', profile_id: ids.frame, len: 'H', qty: '2' });
  for (const d of dividers(layout)) {
    const dy = r4(d.y1 - d.y0); const dx = r4(d.x1 - d.x0);
    if (d.d === 'v') profiles.push({ label: 'Divider (vertical)', profile_id: ids.mullion, len: `H*${dy}-${d.y0 === 0 ? 'FW' : 'FW/2'}-${d.y1 === 1 ? 'FW' : 'FW/2'}`, qty: '1' });
    else profiles.push({ label: 'Divider (horizontal)', profile_id: ids.mullion, len: `W*${dx}-${d.x0 === 0 ? 'FW' : 'FW/2'}-${d.x1 === 1 ? 'FW' : 'FW/2'}`, qty: '1' });
  }
  leaves(layout).forEach((l, i) => {
    const dx = r4(l.x1 - l.x0); const dy = r4(l.y1 - l.y0);
    const L = l.x0 === 0 ? 'FW' : 'FW/2'; const R = l.x1 === 1 ? 'FW' : 'FW/2'; const T = l.y0 === 0 ? 'FW' : 'FW/2'; const B = l.y1 === 1 ? 'FW' : 'FW/2';
    const ow = `W*${dx}-${L}-${R}-2*GC`; const oh = `H*${dy}-${T}-${B}-2*GC`; // the opening this pane fills
    const open = OPENERS.has(l.t);
    profiles.push(...(open ? [{ label: `Sash ${i + 1} – width`, profile_id: ids.sash, len: ow, qty: '2' }, { label: `Sash ${i + 1} – height`, profile_id: ids.sash, len: oh, qty: '2' }] : []));
    glass.push({ label: `Pane ${i + 1} (${open ? 'opens' : 'F'})`, w: open ? `${ow}-2*SW` : ow, h: open ? `${oh}-2*SW` : oh, qty: '1' });
    if (['HL', 'HR', 'BT', 'TT'].includes(l.t)) { add('hinge', 2); add('handle', 1); }
    else if (l.t === 'SL' || l.t === 'SR') { add('roller', 2); add('lock', 1); exprs.pile.push(`(2*(${ow}+${oh}))/100`); }
    else add('silicone', 0.25);
    exprs.rubber.push(`(2*(${ow}+${oh}))/100`);
  });
  const rows = [['Hinges', 'hinge'], ['Handles', 'handle'], ['Rollers', 'roller'], ['Sliding lock', 'lock'], ['Silicone', 'silicone']];
  const accessories = rows.filter(([, k]) => a[k] && acc[k]).map(([label, k]) => ({ label, accessory_id: acc[k], qty: String(a[k]) }));
  if (exprs.pile.length && acc.pile) accessories.push({ label: 'Pile', accessory_id: acc.pile, qty: exprs.pile.join('+') });
  if (exprs.rubber.length && acc.rubber) accessories.push({ label: 'Gasket / rubber', accessory_id: acc.rubber, qty: exprs.rubber.join('+') });
  return { params: { FW: 4.5, SW: 5, GC: 1.5 }, vars: [], profiles, glass, accessories };
}
