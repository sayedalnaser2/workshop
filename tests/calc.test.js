import test from 'node:test';
import assert from 'node:assert/strict';
import { priceFor, guessPriceType, amountInWords, quoteTotals, evalExpr, nestBars, computeModel } from '../public/js/calc.js';
import { cfgOf, windows, sessionSegments, shiftMinutes, onClock } from '../public/js/shift.js';
import { allocateLeftovers, nestWithLeftovers } from '../public/js/stock.js';
import { parseDur } from '../public/js/time.js';

test('windows are priced per m² and rounded to 5, doors use the fixed rate', () => {
  assert.equal(guessPriceType('Fabrication & installation of two panel sliding window 100 Series'), 'area');
  assert.equal(guessPriceType('Fabrication & installation of Single Leaf swing door 45 Series'), 'fixed');
  assert.equal(priceFor({ type: 'area', rate: 55 }, 100, 150), 85); // same as the Excel sheet
  assert.equal(priceFor({ type: 'fixed', rate: 130 }, 100, 220), 130);
});
test('quote totals: discount, VAT and the VAT adjustment', () => {
  const t = quoteTotals({ items: [{ qty: 2, price: 85 }, { qty: 1, price: 130 }], discount: 15, vat_rate: 10, vat_waived: 28.5 });
  assert.equal(t.subtotal, 300); assert.equal(t.amount, 285); assert.equal(t.vat, 28.5); assert.equal(t.grand, 285);
});
test('amount in words', () => {
  assert.equal(amountInWords(313.5), 'Bahraini Dinars Three Hundred and Thirteen and 500 Fils Only');
  assert.equal(amountInWords(0), '');
});
test('formulas: arithmetic, variables, functions, and no code execution', () => {
  assert.equal(evalExpr('(W+H)*2/100', { W: 100, H: 150 }), 5);
  assert.equal(evalExpr('max(W-4.4, 10)', { W: 100 }), 95.6);
  assert.throws(() => evalExpr('process.exit()', {}));
  assert.throws(() => evalExpr('W+Q', { W: 1 }));
});
test('bar nesting never exceeds the bar and reports pieces that cannot fit', () => {
  const { bars, unfit } = nestBars([{ length: 220 }, { length: 220 }, { length: 180 }, { length: 700 }], 600, 0.5);
  assert.equal(unfit.length, 1);
  for (const b of bars) assert.ok(b.used <= 600);
  assert.equal(bars.reduce((s, b) => s + b.pieces.length, 0), 3);
});
test('a model turns width × height into cut pieces and glass', () => {
  const model = { spec: { profiles: [{ label: 'Frame', profile_id: 1, len: 'W-4', qty: '2' }], glass: [{ label: 'Pane', w: 'W-10', h: 'H-10', qty: '1' }], accessories: [] } };
  const r = computeModel(model, 100, 120, { profiles: [{ id: 1, bar_length: 600, price_bar: 20 }], accessories: [] });
  assert.equal(r.profiles[0].length, 96); assert.equal(r.profiles[0].qty, 2); assert.equal(r.glass[0].w, 90);
});
test('leftovers are matched by profile and colour, best fit first, with the price difference', () => {
  const profiles = [{ id: 1, bar_length: 600, price_bar: 60, series: '', name: 'Frame' }];
  const stock = [
    { id: 1, kind: 'leftover', item_type: 'profile', profile_id: 1, colour: 'White', length: 150, qty: 1, unit_cost: 6 },
    { id: 2, kind: 'leftover', item_type: 'profile', profile_id: 1, colour: 'White', length: 300, qty: 1, unit_cost: 12 },
    { id: 3, kind: 'leftover', item_type: 'profile', profile_id: 1, colour: 'Brown', length: 200, qty: 1, unit_cost: 8 },
  ];
  const pieces = [{ kind: 'profile', item: 0, profile_id: 1, length: 120, colour: 'White', label: 'Frame', model: 'M' }];
  const r = allocateLeftovers(pieces, stock, { profiles, glassTypes: [], kerf: 0 });
  assert.equal(r.allocs.length, 1); assert.equal(r.allocs[0].unit.id, 1); // 150 cm is the smallest piece that fits
  assert.ok(Math.abs(r.allocs[0].newCost - 12) < 1e-9); assert.ok(Math.abs(r.allocs[0].leftCost - 4.8) < 1e-9);
  const brown = allocateLeftovers([{ ...pieces[0], colour: 'Black' }], stock, { profiles, glassTypes: [], kerf: 0 });
  assert.equal(brown.allocs.length, 0); // no black leftovers
  const n = nestWithLeftovers([{ length: 120 }, { length: 100 }], [{ id: 1, length: 150 }], 600, 0);
  assert.equal(n.leftoverUsed.length, 1); assert.equal(n.bars.length, 1);
});
test('shift clock: windows, breaks, days off and presence', () => {
  const cfg = cfgOf(); // 07:00–16:00, break 12:00–12:30, UTC+3, Friday off
  const w = windows('2026-10-11', cfg); // a Sunday
  assert.equal(w.length, 2); assert.equal((w[0][1] - w[0][0]) / 60000, 300); assert.equal((w[1][1] - w[1][0]) / 60000, 210);
  assert.equal(windows('2026-10-09', cfg).length, 0); // Friday
  assert.equal(shiftMinutes('2026-10-11', cfg, Date.parse('2026-10-11T08:00:00Z')), 240); // 11:00 local → 4 h so far
  assert.equal(onClock(Date.parse('2026-10-11T09:15:00Z'), cfg), false); // 12:15 local is the break
  const s = { started: '2026-10-10T20:00:00Z', ended: null, kind: 'shift', user_id: 1 };
  const segs = sessionSegments(s, cfg, (d) => d === '2026-10-11', Date.parse('2026-10-12T10:00:00Z'));
  assert.deepEqual(segs.map((x) => [x.day, x.min]), [['2026-10-11', 510]]); // only the day the worker was present
  const manual = sessionSegments({ started: '2026-10-10T20:00:00Z', ended: '2026-10-10T21:00:00Z', kind: 'manual' }, cfg, () => false, Date.now());
  assert.equal(manual[0].min, 60); // manual time counts exactly as entered
});
test('durations are read in the ways people type them', () => {
  assert.equal(parseDur('2:30'), 150); assert.equal(parseDur('1h 15m'), 75); assert.equal(parseDur('90'), 90); assert.equal(parseDur('1.5h'), 90); assert.equal(parseDur('abc'), null);
});
