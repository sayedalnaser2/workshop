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

test('aluminium kitchen: doors become profile frames with infill, bars are cut, 3D scene has boxes', async () => {
  const { kitchenModel, priceKitchen } = await import('../public/js/kitchen.js');
  const { scene, placeRuns } = await import('../public/js/kitchen-3d.js');
  const spec = { style: { kind: 'aluminium', carcass: 'Board', profile: 'P1' }, runs: [{ cabinets: [{ type: 'base', w: 60, h: 72, d: 56, doors: 1 }, { type: 'drawers', w: 60, h: 72, d: 56, drawers: 3 }] }, { island: true, cabinets: [{ type: 'base', w: 90, h: 72, d: 56, doors: 2 }] }] };
  const wood = kitchenModel({ ...spec, style: { ...spec.style, kind: 'wood' } }); const alu = kitchenModel(spec);
  assert.equal(wood.profile, null); assert.equal(wood.frames.length, 0);
  assert.equal(alu.frames.length, 5); assert.equal(alu.profile.pieces, 4 * (1 + 3 + 2));
  assert.ok(alu.panels.door.every((p) => /infill/.test(p.label)));
  const p = priceKitchen(alu, { profile: { P1: { price: 10 } }, general: { frame_corner: 2 } });
  assert.equal(p.lines.find((l) => /Door frame profile/.test(l.label)).total, 10 * alu.profile.bars.length);
  assert.equal(p.lines.find((l) => /corner/.test(l.label)).total, 2 * alu.profile.corners);
  assert.ok(scene(spec).some((b) => b.kind === 'infill')); assert.equal(placeRuns(spec)[1].z, 160); // the island stands in front of the wall run
});

test('kitchen: joining two cabinets makes one carcass; splitting reverses it; open doors change the 3D scene', async () => {
  const { mergeCabinets, splitCabinet, mergeSaving } = await import('../public/js/kitchen.js');
  const { scene } = await import('../public/js/kitchen-3d.js');
  const a = { type: 'base', w: 60, h: 72, d: 56, doors: 1, shelves: 1 }; const b = { type: 'sink', w: 90, h: 72, d: 56, doors: 2 };
  const m = mergeCabinets(a, b).cab; assert.equal(m.w, 150); assert.equal(m.doors, 3); assert.equal(m.type, 'sink');
  assert.ok(mergeSaving(a, b).panels > 0); assert.ok(mergeSaving(a, b).m2 > 0);
  assert.ok(mergeCabinets(a, { type: 'wall', w: 60, h: 70, d: 32 }).error);
  const dr = { type: 'drawers', w: 60, h: 72, d: 56, drawers: 3 }; const mix = mergeCabinets(dr, a).cab; // drawers joined with a door cabinet
  assert.equal(mix.w, 120); assert.equal(mix.drawers, 3); assert.equal(mix.doors, 1); assert.equal(mix.mixed.mode, 'side'); assert.equal(mix.mixed.left, true);
  const { zonesOf, cabinetParts } = await import('../public/js/kitchen.js'); const z = zonesOf(mix); assert.equal(z.drawers.w, 60); assert.equal(z.doors.x, 60); assert.equal(z.doors.w, 60);
  const parts = cabinetParts(mix); assert.equal(parts.panels.filter((p) => /Drawer front/.test(p.label)).length, 3); assert.ok(parts.hw.slides === 3 && parts.hw.hinges > 0);
  const stack = zonesOf({ ...mix, mixed: { mode: 'stack', dh: 20 } }); assert.equal(stack.drawers.y, 52); assert.equal(stack.doors.h, 52);
  assert.deepEqual(splitCabinet(mix).cabs.map((c) => [c.type, c.w]), [['drawers', 60], ['base', 60]]);
  const [h1, h2] = splitCabinet(b).cabs; assert.equal(h1.w + h2.w, 90); assert.equal(h1.doors + h2.doors, 2);
  const spec = { style: {}, counter: {}, runs: [{ cabinets: [a, { type: 'drawers', w: 60, h: 72, d: 56, drawers: 3 }] }] };
  const closed = scene(spec); const open = scene(spec, { '0|0': 1, '0|1': 1 });
  assert.ok(open.length > closed.length); assert.ok(open.some((x) => x.kind === 'tray'));
});

test('3D kitchen: each drawer and door can open on its own', async () => {
  const { scene } = await import('../public/js/kitchen-3d.js');
  const spec = { style: {}, counter: {}, runs: [{ cabinets: [{ type: 'drawers', w: 60, h: 72, d: 56, drawers: 3 }, { type: 'base', w: 90, h: 72, d: 56, doors: 2 }] }] };
  const trays = (o) => scene(spec, o).filter((b) => b.kind === 'tray');
  assert.equal(trays({}).length, 0); assert.equal(trays({ '0|0|d1': 1 }).length, 1); assert.equal(trays({ '0|0': 1 }).length, 3);
  assert.equal(trays({ '0|0': 1, '0|0|d0': 0 }).length, 2); // the cabinet is open but one drawer is held shut
  assert.ok(scene(spec, { '0|1|f1': 1 }).some((b) => b.ref.front === 'f1' && b.corners.some((c, i, a) => c[2] !== a[0][2])));
});

test('document numbers: two-digit year + four digits, each kind counts on its own and restarts every year', async () => {
  const { nextNumber } = await import('../src/db.js'); const { getSetting, setSetting } = await import('../src/db.js');
  const yy = String(new Date().getFullYear()).slice(2);
  const c = getSetting('counters'); setSetting('counters', { ...c, quote: 7, year: { ...(c.year || {}), quote: yy } });
  assert.equal(nextNumber('quote'), `${yy}0007`); assert.equal(nextNumber('quote', null, true), `${yy}0007`); assert.equal(nextNumber('quote'), `${yy}0008`);
  const c2 = getSetting('counters'); setSetting('counters', { ...c2, quote: 150, year: { ...(c2.year || {}), quote: '25' } }); // last used in 2025
  assert.equal(nextNumber('quote', null, true), `${yy}0001`); assert.equal(nextNumber('quote'), `${yy}0002`);
  assert.match(nextNumber('invoice'), /^\d{6}$/); assert.match(nextNumber('receipt'), /^\d{6}$/);
});

test('accounting engine: every document posts in balance; supplier ledger = purchases − payments', async () => {
  const a = await import('../public/js/accounting.js'); const { supplierLedger } = a;
  const accounts = a.DEFAULT_CHART.map((r, i) => ({ id: i + 1, code: r[0], name: r[1], type: r[2], sys: r[4] || '', parent_id: 0 }));
  for (const x of accounts) { const c = a.DEFAULT_CHART.find((r) => r[1] === x.name); if (c[3]) x.parent_id = accounts.find((y) => y.code === c[3]).id; }
  const data = { accounts, orders: [{ inv: 'I1', date: '2026-10-05', amount: 1100, client: 'A', vat: 100 }], receipts: [{ no: 'R1', date: '2026-10-06', amount: 600, method: 'Cash' }], payments: [{ no: 'P1', date: '2026-10-07', amount: 200, paid_to: 'Sup', category: 'Rent', method: 'Bank transfer' }, { no: 'P2', date: '2026-10-08', amount: 100, paid_to: 'Sup', category: 'Supplier payment', method: 'Cash' }], purchases: [{ date: '2026-10-02', amount: 330, vat: 30, supplier: 'Sup', invoice: 'X1' }], cash: [{ date: '2026-10-01', account: 'bank', direction: 'in', amount: 5000, category: 'Owner deposit' }], credits: [{ no: 'C1', date: '2026-10-09', net: 100, vat: 10, total: 110, client: 'A', order_inv: 'I1' }], journals: [], settings: { vat_rate: 10, opening: { cash: 100 } } };
  const e = a.buildEntries(data); const tb = a.trialBalance(accounts, e); assert.equal(tb.balanced, true); assert.equal(tb.totalDebit, tb.totalCredit);
  const st = a.statements(tb); assert.equal(st.balanced, true); assert.equal(st.income, 900); // 1000 sales − 100 credit note
  const ar = accounts.find((x) => x.sys === 'ar'); assert.equal(tb.list.find((x) => x.id === ar.id).balance, 1100 - 600 - 110);
  const ap = accounts.find((x) => x.sys === 'ap'); assert.equal(tb.list.find((x) => x.id === ap.id).balance, 330 - 100); // only the supplier payment reduces payables
  const root = tb.list.find((x) => x.code === '1'); assert.equal(root.balance, tb.list.filter((x) => x.type === 'asset' && x.leaf).reduce((s, x) => s + x.balance, 0)); // groups roll up
  assert.equal(a.trialBalance(accounts, e, '2026-10-06', '2026-10-06').list.find((x) => x.sys === 'cash').balance, 600); // a period
  const l = supplierLedger('sup', data.purchases, data.payments); assert.equal(l.balance, 330 - 300); assert.equal(l.entries.length, 3);
});
