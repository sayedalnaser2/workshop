import test, { after } from 'node:test';
import { rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { approvalFor, discountPct, priceFor, amountInWordsAr } from '../public/js/calc.js';
import { vatReport, vatIn } from '../public/js/vat.js';
import { lowStock } from '../public/js/stock.js';
import { kitchenModel } from '../public/js/kitchen.js';
import { computeModel } from '../public/js/calc.js';
import { tr } from '../public/js/i18n.js';

const q = (discount, price = 1000) => ({ items: [{ qty: 1, price }], discount, vat_rate: 10 });

test('discount approval: over the limit needs the admin, and an approved discount stays approved when lowered', () => {
  assert.equal(discountPct(q(100)), 10);
  assert.deepEqual(approvalFor(q(100), null, 10, false), { approval: '', approved_disc: 0 }); // exactly at the limit is fine
  assert.equal(approvalFor(q(150), null, 10, false).approval, 'pending');
  assert.deepEqual(approvalFor(q(150), null, 10, true), { approval: 'approved', approved_disc: 150 });
  const cur = { approval: 'approved', approved_disc: 150 };
  assert.equal(approvalFor(q(120), cur, 10, false).approval, 'approved'); // lowered: still approved
  assert.equal(approvalFor(q(200), cur, 10, false).approval, 'pending'); // raised: asks again
  assert.equal(approvalFor(q(500), null, 0, false).approval, ''); // limit 0 = never
});

test('VAT report: collected vs paid, credit notes reduce it, missing purchase VAT is flagged', () => {
  const orders = [{ inv: 'I1', date: '2026-10-05', amount: 110, client: 'A', quote_no: 'Q1' }, { inv: 'I2', date: '2026-10-20', amount: 220, vat: 20, client: 'B' }, { inv: 'I3', date: '2026-11-02', amount: 55, client: 'C' }];
  const quotes = [{ number: 'Q1', items: [{ qty: 1, price: 100 }], vat_rate: 10, discount: 0, vat_waived: 0 }];
  const credits = [{ no: 'CN1', date: '2026-10-25', net: 50, vat: 5, total: 55, client: 'B', order_inv: 'I2' }];
  const purchases = [{ date: '2026-10-10', supplier: 'S', amount: 66, vat: 6 }, { date: '2026-10-12', supplier: 'T', amount: 33 }];
  const r = vatReport({ orders, quotes, credits, purchases, payments: [{ date: '2026-10-15', amount: 40 }], settings: { vat_rate: 10, purchase_vat_default: false } }, '2026-10-01', '2026-10-31');
  assert.equal(r.totals.output_vat, 30); // 10 (from the quotation) + 20 (saved on the order)
  assert.equal(r.totals.credit_vat, 5);
  assert.equal(r.totals.input_vat, 6);
  assert.equal(r.totals.vat_payable, 19);
  assert.equal(r.noVatPurchases, 1);
  assert.equal(r.rows.length, 1);
  assert.equal(r.totals.revenue, 100 + 200 - 50); // net sales less the credit note
  assert.equal(r.totals.profit, 250 - (60 + 33) - 40);
  const all = vatReport({ orders, quotes, credits: [], purchases, payments: [], settings: { vat_rate: 10, purchase_vat_default: true } }, '', '');
  assert.equal(all.rows.length, 2); assert.equal(all.totals.output_vat, 10 + 20 + 5); // I3 has no quotation: 10% of 55 is included
  assert.equal(vatIn(110, 10), 10);
});

test('Arabic amount in words', () => {
  assert.equal(amountInWordsAr(0), '');
  assert.equal(amountInWordsAr(1), 'فقط دينار بحريني واحد لا غير');
  assert.match(amountInWordsAr(345.5), /ثلاثمائة وخمسة وأربعون ديناراً بحرينياً وخمسمائة فلس/);
  assert.match(amountInWordsAr(3), /ثلاثة دنانير/);
  assert.match(amountInWordsAr(1500000), /مليون وخمسمائة ألف/);
});

test('pricing per metre of width (railings)', () => {
  assert.equal(priceFor({ type: 'length', rate: 80 }, 250, 100), 200);
  assert.equal(priceFor({ type: 'area', rate: 100 }, 100, 100), 100);
});

const tmpData = (await import('node:os')).tmpdir() + '/ws-feat-' + process.pid;
after(() => rmSync(tmpData, { recursive: true, force: true }));
test('every new model produces finite sizes', async () => {
  process.env.DATA_DIR = tmpData;
  const { seedLibrary, seedExtraModels } = await import('../src/seed.js');
  const { listRows } = await import('../src/db.js');
  seedLibrary(); seedExtraModels();
  const lib = { profiles: listRows('profiles'), accessories: listRows('accessories') };
  const models = listRows('models');
  for (const name of ['Shower screen – hinged door', 'Glass railing – channel base', 'Curtain wall – stick system', 'Folding door (bi-fold)', 'Mirror – aluminium framed', 'Glass partition – aluminium framed']) {
    const m = models.find((x) => x.name === name); assert.ok(m, name);
    const r = computeModel(m, m.def_w, m.def_h, lib);
    for (const p of r.profiles) { assert.ok(p.profile, `${name}: ${p.label} has a profile`); assert.ok(Number.isFinite(p.length) && Number.isFinite(p.qty), `${name}: ${p.label}`); }
    for (const g of r.glass) assert.ok(Number.isFinite(g.w) && Number.isFinite(g.h) && g.qty > 0, `${name}: ${g.label}`);
    for (const a of r.accessories) assert.ok(a.accessory && Number.isFinite(a.qty), `${name}: ${a.label}`);
  }
  const cw = computeModel(models.find((x) => x.name.startsWith('Curtain wall')), 400, 300, lib); // 4 × 3 modules
  assert.equal(cw.glass[0].qty, 12); assert.equal(cw.profiles[0].qty, 5);
  assert.equal(computeModel(models.find((x) => x.name === 'Glass railing – channel base'), 300, 100, lib).glass[0].qty, 3);
  const n = models.length; seedExtraModels(); assert.equal(listRows('models').length, n); // idempotent
});

test('low stock: items at or below their alert level, with a suggested order', () => {
  const profiles = [{ id: 1, name: 'Frame', series: '45', min_qty: 5 }, { id: 2, name: 'Sash', series: '45', min_qty: 0 }];
  const stock = [{ kind: 'new', profile_id: 1, qty: 2 }, { kind: 'new', profile_id: 1, qty: 1 }, { kind: 'leftover', profile_id: 1, qty: 9 }];
  const low = lowStock(stock, { profiles, glassTypes: [{ id: 7, name: 'Clear', min_qty: 3 }], accessories: [{ id: 3, name: 'Hinge', min_qty: 10, unit: 'ea' }] });
  assert.equal(low.length, 3);
  const f = low.find((l) => l.type === 'profile'); assert.equal(f.onHand, 3); assert.equal(f.suggest, 7); // up to twice the minimum
  assert.equal(low.find((l) => l.type === 'accessory').onHand, 0);
});

test('kitchen island: free-standing top with a seating overhang and no splash back', () => {
  const m = kitchenModel({ counter: { splash_h: 5, front: 2 }, runs: [{ name: 'Wall', cabinets: [{ type: 'base', w: 100, h: 72, d: 56 }] }, { name: 'Island', island: true, overhang: 30, cabinets: [{ type: 'base', w: 120, h: 72, d: 60 }] }] });
  const [wall, island] = m.tops.pieces;
  assert.equal(wall.splash, 100); assert.equal(island.splash, 0);
  assert.equal(island.depth, 60 + 2 + 30);
  assert.ok(Math.abs(m.tops.polish_m - ((100 + 2 * 58 + 100) + (2 * 120 + 2 * 92)) / 100) < 1e-9);
});

test('Arabic screen text: known strings are translated, unknown ones left alone', () => {
  assert.equal(tr('Quotations'), 'عروض الأسعار');
  assert.equal(tr('  Save  '), 'حفظ');
  assert.equal(tr('12 rows'), '12 صف');
  assert.equal(tr('Hello Amina'), 'مرحباً Amina');
  assert.equal(tr('Some brand new sentence'), null);
});

test('Balexco glazing chart: bead and gasket pair for a glass thickness, per profile type', async () => {
  const { glazingFits, thicknessRange, glazingNote, mmOf } = await import('../public/js/glazing.js');
  const w6 = glazingFits(6, 'window'); assert.equal(w6.length, 1); assert.deepEqual([w6[0].bead, w6[0].combo, w6[0].outerCode, w6[0].innerCode], [26, 'B+E', 'E2112', 'E2103']);
  const d12 = glazingFits(12, 'door'); assert.equal(d12[0].bead, 16); assert.equal(d12[0].combo, 'C+E'); // 36.3 column: bead 16 starts at 10
  assert.equal(glazingFits(10, 'tb_window').length, 0); // thermal-break windows start at 15 mm
  assert.equal(glazingFits(29, 'tb_window')[0].combo, 'C+F'); // the one C+F row on the chart
  assert.deepEqual(thicknessRange('door'), [5, 24]);
  assert.equal(mmOf('10.76mm'), 10.76); assert.equal(mmOf(''), 0);
  assert.match(glazingNote({ spec: { glazing: { type: 'window' } } }, { thickness: '6mm' }).text, /E1403 \/ E1410/);
  assert.equal(glazingNote({ spec: { glazing: { type: 'tb_window' } } }, { thickness: '6mm' }).best, undefined);
  assert.equal(glazingNote({ spec: {} }, { thickness: '6mm' }), null);
});

test('cutting list: gaskets for the glass thickness are added to the quotation pieces', async () => {
  process.env.DATA_DIR = tmpData;
  const { seedLibrary, seedBalexco } = await import('../src/seed.js');
  const { listRows } = await import('../src/db.js');
  const { quotePieces } = await import('../public/js/stock.js');
  seedLibrary(); seedBalexco(); seedBalexco();
  const lib = { profiles: listRows('profiles'), accessories: listRows('accessories') }; const models = listRows('models');
  assert.equal(lib.accessories.filter((a) => a.code === 'E2112').length, 1); // idempotent
  const fix = models.find((m) => m.name === 'Fix window'); assert.equal(fix.spec.glazing.type, 'window');
  const q = { items: [{ model_id: fix.id, w: 100, h: 100, qty: 2, glass_id: 1 }] };
  const none = quotePieces(q, models, lib, [{ id: 1, thickness: '' }]).filter((p) => /^Gasket [A-F]/.test(p.label)); assert.equal(none.length, 0);
  const g = quotePieces(q, models, lib, [{ id: 1, thickness: '6mm' }]).filter((p) => /^Gasket [A-F]/.test(p.label));
  assert.deepEqual(g.map((p) => p.label), ['Gasket B (E2112)', 'Gasket E (E2103)']);
  assert.equal(g[0].qty, 7.44); // pane 93×93 cm → 3.72 m round it, two windows
});

test('custom designs: dividers make panes, formulas cover the frame and every pane', async () => {
  const d = await import('../public/js/designer.js');
  let L = d.split(d.newLayout(), '', 'v', 0.6); L = d.split(L, 'a', 'h', 0.35); L = d.setType(L, 'b', 'SR');
  assert.equal(d.leaves(L).length, 3); assert.equal(d.dividers(L).length, 2);
  const sp = d.layoutToSpec(L, { frame: 1, sash: 2, mullion: 3 }, {});
  const r = computeModel({ spec: sp }, 200, 150, { profiles: [{ id: 1 }, { id: 2 }, { id: 3 }], accessories: [] });
  assert.equal(r.glass.length, 3); assert.ok(r.glass.every((g) => g.w > 0 && g.h > 0));
  assert.equal(d.leaves(d.merge(L, 'a')).length, 2);
});
