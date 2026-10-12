// Balexco 45 series glazing chart (catalogue pp. 46–48): which glazing bead and gasket pair fits which glass thickness.
// Pure data + lookups, shared by the browser, the server seed and the tests.

/** Glass space (mm) by profile type: 45 window, 45 door, 45i thermal-break window, thermal-break door. */
export const SPACES = { window: 41.3, door: 36.3, tb_window: 46.3, tb_door: 41.3 };
export const TYPE_LABEL = { window: 'Window (45) – space 41.3', door: 'Door (45) – space 36.3', tb_window: 'Thermal-break window (45i) – space 46.3', tb_door: 'Thermal-break door – space 41.3' };
/** Gaskets used in the chart: letter → catalogue code, thickness, side. */
export const GASKETS = { A: { code: 'E2113', mm: 4, side: 'outer' }, B: { code: 'E2112', mm: 3, side: 'outer' }, C: { code: 'E2104', mm: 2, side: 'outer' }, D: { code: 'E2102', mm: 4, side: 'inner' }, E: { code: 'E2103', mm: 6, side: 'inner' }, F: { code: 'E2101', mm: 2, side: 'inner' } };
const FULL = ['A+E', 'B+E', 'C+E', 'B+D', 'C+D'];
/** One row per bead: bead width, the two bead profile codes, the gasket pairs (top to bottom) and the first glass thickness in each space column. */
export const BEADS = [
  { width: 26, codes: ['E1403', 'E1410'], combos: ['B+E', 'C+E', 'B+D', 'C+D'], first: { 41.3: 6 } },
  { width: 21, codes: ['E1404', 'E1411'], combos: FULL, first: { 46.3: 15, 41.3: 10, 36.3: 5 } },
  { width: 16, codes: ['E1405', 'E1412'], combos: FULL, first: { 46.3: 20, 41.3: 15, 36.3: 10 } },
  { width: 11, codes: ['E1406', 'E1413'], combos: ['A+E', 'B+E', 'C+E', 'B+D', 'C+F'], first: { 46.3: 25, 41.3: 20, 36.3: 15 } },
  { width: 6, codes: ['E1407', 'E1414'], combos: FULL, first: { 46.3: 30, 41.3: 25, 36.3: 20 } },
];
/** Glass thicknesses (mm) the chart can hold for a profile type, e.g. 5–34. */
export function thicknessRange(type) {
  const sp = SPACES[type]; const all = [];
  for (const b of BEADS) { const f = b.first[sp]; if (f != null) for (let i = 0; i < b.combos.length; i++) all.push(f + i); }
  return all.length ? [Math.min(...all), Math.max(...all)] : null;
}
/** Every bead + gasket combination that holds this glass thickness in this profile type (table order). */
export function glazingFits(mm, type) {
  const sp = SPACES[type]; const t = Math.round(Number(mm)); const out = [];
  if (!sp || !(t > 0)) return out;
  for (const b of BEADS) {
    const f = b.first[sp]; if (f == null) continue;
    const i = t - f; if (i < 0 || i >= b.combos.length) continue;
    const combo = b.combos[i]; const [o, n] = combo.split('+');
    out.push({ bead: b.width, codes: b.codes, combo, outer: o, inner: n, outerCode: GASKETS[o].code, innerCode: GASKETS[n].code });
  }
  return out;
}
/** "6mm", "6+12+6" (double glazing, total 24 mm is on the glass type), 10.76 → number of mm. */
export const mmOf = (thickness) => { const m = String(thickness || '').match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 0; };
/** First recommended fit for a model + glass type, with a one-line description for sheets. */
export function glazingNote(model, glassType) {
  const type = model?.spec?.glazing?.type; if (!type || !glassType) return null;
  const mm = mmOf(glassType.thickness); const fits = glazingFits(mm, type);
  if (!mm) return null;
  if (!fits.length) { const r = thicknessRange(type); return { fits, text: `${mm} mm glass does not fit this profile type${r ? ` (it holds ${r[0]}–${r[1]} mm)` : ''}.` }; }
  const f = fits[0];
  return { fits, best: f, text: `${mm} mm glass: bead ${f.codes.join(' / ')} (${f.bead} mm), gaskets ${f.combo.replace('+', ' outer + ')} inner → ${f.outerCode} + ${f.innerCode}${fits.length > 1 ? ` · ${fits.length - 1} other combination(s) possible` : ''}` };
}
