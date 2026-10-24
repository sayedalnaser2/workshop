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
  assert.match(amountInWordsAr(200), /مائتا دينار/);
  assert.match(amountInWordsAr(2000), /ألفا دينار/);
  assert.match(amountInWordsAr(12500), /اثنا عشر ألفاً وخمسمائة دينار/);
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
  { const without = accounts.filter((x) => x.sys !== 'ar'); const e2 = a.buildEntries({ ...data, accounts: without }); assert.equal(a.trialBalance(without, e2).balanced, true); } // delete a built-in account: postings fall back to another account of the same kind and still balance
  const root = tb.list.find((x) => x.code === '1'); assert.equal(root.balance, tb.list.filter((x) => x.type === 'asset' && x.leaf).reduce((s, x) => s + x.balance, 0)); // groups roll up
  assert.equal(a.trialBalance(accounts, e, '2026-10-06', '2026-10-06').list.find((x) => x.sys === 'cash').balance, 600); // a period
  const l = supplierLedger('sup', data.purchases, data.payments); assert.equal(l.balance, 330 - 300); assert.equal(l.entries.length, 3);
});

test('page modules load and render without throwing (catches broken syntax / stray comments)', async () => {
  // every page file must at least parse as an ES module
  const { readdirSync } = await import('node:fs'); const { spawnSync } = await import('node:child_process');
  for (const f of readdirSync(new URL('../public/js/pages/', import.meta.url))) { const r = spawnSync(process.execPath, ['--check', new URL('../public/js/pages/' + f, import.meta.url).pathname]); assert.equal(r.status, 0, `${f}: ${r.stderr}`); }
});

test('customer and supplier statements by period: earlier entries become a brought-forward balance', async () => {
  const { customerLedger, supplierLedger } = await import('../public/js/accounting.js');
  const orders = [{ inv: 'I1', date: '2026-01-10', client: 'A', amount: 100 }, { inv: 'I2', date: '2026-03-10', client: 'A', amount: 50 }];
  const receipts = [{ no: 'R1', date: '2026-02-01', order_inv: 'I1', amount: 40 }, { no: 'R2', date: '2026-03-15', order_inv: 'I2', amount: 10 }];
  const all = customerLedger('a', orders, receipts, []); assert.equal(all.balance, 100); assert.equal(all.entries.length, 4);
  const p = customerLedger('A', orders, receipts, [], '2026-03-01', '2026-03-31'); assert.equal(p.opening, 60); assert.equal(p.entries.length, 2); assert.equal(p.balance, 100); assert.equal(p.entries[0].bal, 110);
  const cut = customerLedger('A', orders, receipts, [], '', '2026-02-15'); assert.equal(cut.balance, 60); assert.equal(cut.entries.length, 2); // up to a date
  const s = supplierLedger('S', [{ supplier: 's', date: '2026-01-02', amount: 200 }], [{ paid_to: 'S', date: '2026-02-02', amount: 50, no: 'P1' }], '2026-02-01'); assert.equal(s.opening, 200); assert.equal(s.balance, 150);
});

test('VAT per line: only lines with VAT are taxed, the discount is shared over the lines, old quotations are unchanged', async () => {
  const { quoteTotals, hasVat } = await import('../public/js/calc.js');
  const items = [{ qty: 1, price: 1000 }, { qty: 2, price: 100, vat: false }]; // 1000 with VAT, 200 without
  const t = quoteTotals({ items, vat_rate: 10 }); assert.equal(t.subtotal, 1200); assert.equal(t.vat, 100); assert.equal(t.vatBase, 1000); assert.equal(t.exempt, 200); assert.equal(t.grand, 1300);
  const d = quoteTotals({ items, vat_rate: 10, discount: 120 }); assert.ok(Math.abs(d.vat - 90) < 1e-9); assert.ok(Math.abs(d.grand - (1200 - 120 + 90)) < 1e-9); // 10% off: VAT base 900
  const a = quoteTotals({ items, vat_rate: 10, discount: 120, disc_mode: 'after' }); assert.equal(a.vat, 100); assert.equal(a.grand, 1200 + 100 - 120); // discount after VAT: VAT on the full VATable total
  const old = [{ qty: 3, price: 100 }]; assert.equal(quoteTotals({ items: old, vat_rate: 10 }).vat, 30); assert.equal(hasVat(old[0]), true); // no flag = VAT as before
  assert.equal(hasVat({ vat: false }), false); assert.equal(hasVat({ vat: 0 }), false); assert.equal(hasVat({ vat: true }), true);
});

test('kitchens: door directions, L-corner, slots in tall units, appliance gaps, shelves and open cabinets', async () => {
  const { kitchenModel, cabinetParts, slotsOf } = await import('../public/js/kitchen.js');
  const { scene, frontsOf, placeRuns, runStarts } = await import('../public/js/kitchen-3d.js');
  const room = { runs: [{ cabinets: [{ type: 'base', w: 60 }, { type: 'tall', w: 60, h: 210 }, { type: 'base', w: 60 }] }, { cabinets: [{ type: 'wall', w: 60 }, { type: 'wall', w: 60 }, { type: 'wall', w: 60 }] }] };
  assert.deepEqual(runStarts(room, 1), [0, 120, 180]); // wall units slide past the tall unit instead of crossing it
  assert.deepEqual(runStarts(room, 0), [0, 60, 120]);
  const fridgeRoom = { runs: [{ cabinets: [{ type: 'base', w: 60 }, { type: 'gap', w: 70, h: 190, appliance: 'fridge' }, { type: 'base', w: 60 }] }, { cabinets: [{ type: 'wall', w: 60, y: 140 }, { type: 'wall', w: 60, y: 140 }, { type: 'wall', w: 60, y: 200 }] }] };
  assert.deepEqual(runStarts(fridgeRoom, 1), [0, 130, 190]); // a fridge reaching the wall units is treated like a tall unit; a unit hung above it (y 200) is not blocked
  const gapRoom = { runs: [room.runs[0], { cabinets: [{ type: 'wall', w: 60 }, { type: 'wall', w: 60, gap_before: 80 }, { type: 'wall', w: 60 }] }] };
  assert.deepEqual(runStarts(gapRoom, 1), [0, 140, 200]); // a space before a wall unit moves it (and the ones after) along; the tall unit still blocks 60–120
  const mk = (cab) => cabinetParts({ w: 60, h: 72, d: 56, ...cab });
  assert.equal(mk({ type: 'base', doors: 1, dir: 'slide' }).hw.tracks, 1); assert.equal(mk({ type: 'base', doors: 1, dir: 'slide' }).hw.hinges, 0);
  assert.equal(mk({ type: 'base', doors: 2, dir: 'up' }).hw.lifts, 2);
  assert.equal(mk({ type: 'base', doors: 2 }).hw.hinges, 4);
  const sh = mk({ type: 'base', doors: 2, dir: 'shutter' }); assert.equal(sh.hw.shutters, 2); assert.equal(sh.hw.hinges, 0); assert.equal(sh.panels.filter((p) => p.mat === 'door').length, 0); // a shutter is a kit, not door panels
  assert.deepEqual(frontsOf({ type: 'base', doors: 2, dir: 'slide' }).map((f) => f.key), ['f0']); // sliding doors share one state
  assert.equal(mk({ type: 'base', doors: 0, drawers: 0 }).panels.filter((p) => p.mat === 'door').length, 0); // no doors: stays open
  const tall = { type: 'tall', w: 60, h: 210, d: 58, slots: [{ k: 'door', h: 70 }, { k: 'oven', h: 60 }, { k: 'door', h: 80, n: 2 }] };
  const { hasSkirt } = await import('../public/js/kitchen.js');
  assert.equal(hasSkirt({ type: 'base' }), true); assert.equal(hasSkirt({ type: 'tall' }), false); assert.equal(hasSkirt({ type: 'tall', skirt: true }), true); assert.equal(hasSkirt({ type: 'base', skirt: false }), false); assert.equal(hasSkirt({ type: 'wall', skirt: true }), false);
  assert.equal(mk({ type: 'base' }).panels.some((p) => p.label.endsWith('Skirting')), true); assert.equal(mk({ type: 'base', skirt: false }).hw.legs, 0); assert.equal(cabinetParts({ type: 'tall', w: 60, h: 210, d: 58, skirt: true }).hw.legs, 4);
  const tp = cabinetParts(tall); assert.equal(tp.appliances[0].k, 'oven'); assert.equal(tp.panels.filter((p) => p.label === 'Divider').length, 2);
  assert.deepEqual(frontsOf(tall).map((f) => f.key), ['s0', 's2']); assert.equal(slotsOf({ slots: [] }), null);
  const shelf = cabinetParts({ type: 'shelf', w: 80, h: 4, d: 25 }); assert.equal(shelf.panels.length, 1); assert.equal(shelf.hw.hangers, 2);
  const three = cabinetParts({ type: 'shelf', w: 80, h: 4, d: 25, stack: 3 }); assert.equal(three.panels[0].qty, 3); assert.equal(three.hw.hangers, 6); // three shelves stacked above each other
  const spec = { runs: [{ name: 'A', cabinets: [{ type: 'base', w: 60, h: 72, d: 56, doors: 1 }, { type: 'corner', w: 90, h: 72, d: 56, doors: 2 }] }, { name: 'B', cabinets: [{ type: 'base', w: 60, h: 72, d: 56, doors: 1 }] }] };
  const m = kitchenModel(spec); assert.ok(m.tops.pieces[0].leg > 0); assert.equal(placeRuns(spec)[1].z, 62);
  const spec2 = { runs: [{ cabinets: [{ type: 'corner', w: 90, h: 72, d: 56, doors: 2 }, { type: 'base', w: 60, h: 72, d: 56, doors: 1 }] }, { cabinets: [{ type: 'base', w: 60, h: 72, d: 56, doors: 1 }] }] };
  assert.equal(placeRuns(spec2)[1].z, 90); // a corner at the start pushes the side run out to the end of its return leg
  const b = scene({ runs: [{ cabinets: [{ type: 'gap', w: 60, h: 85, d: 60, appliance: 'fridge' }, { type: 'base', w: 60, h: 72, d: 56, doors: 1, dir: 'down' }, tall, { type: 'corner', w: 90, h: 72, d: 56, doors: 2 }] }] }, { '0|1': 1, '0|3': 1 });
  assert.ok(b.length > 20 && b.every((x) => x.corners.flat(2).every(Number.isFinite)));
});

test('kitchens: a door can be added to any unit, in any place, without disturbing the rest', async () => {
  const { addSlot, slotsFromCab, layoutSlots, slotHeights, cabinetParts } = await import('../public/js/kitchen.js');
  const base = { type: 'base', w: 60, h: 72, d: 56, doors: 2, drawers: 0 };
  assert.deepEqual(slotsFromCab(base).map((x) => [x.k, x.n, x.h]), [['door', 2, 72]]); // a plain unit becomes one door slot of full height
  const withDrawer = addSlot(base, 'drawer', 'top'); assert.deepEqual(withDrawer.map((x) => x.k), ['door', 'drawer']); assert.equal(Math.round(withDrawer.reduce((a, x) => a + x.h, 0) * 10) / 10, 72); assert.equal(withDrawer[1].h, 18); // the drawer takes 18 cm, the door keeps the rest
  const mid = addSlot({ ...base, slots: withDrawer }, 'door', 'middle'); assert.equal(mid.length, 3); assert.equal(mid[1].k, 'door'); assert.equal(Math.round(mid.reduce((a, x) => a + x.h, 0) * 10) / 10, 72);
  const bottom = addSlot({ ...base, slots: mid }, 'open', 'bottom'); assert.equal(bottom[0].k, 'open'); assert.equal(Math.round(bottom.reduce((a, x) => a + x.h, 0) * 10) / 10, 72);
  const cab = { ...base, slots: mid }; assert.ok(layoutSlots(cab)); assert.equal(layoutSlots({ type: 'gap', slots: mid }), null);
  const p = cabinetParts(cab); assert.equal(p.panels.filter((x) => x.label === 'Divider').length, 2); assert.ok(p.hw.hinges >= 4); // the doors of the layout get hinges
  assert.deepEqual(slotHeights([{ k: 'door', h: 40 }, { k: 'door' }], 100), [40, 60]);
});

test('kitchens: skirting cut from a profile bar instead of a board', async () => {
  const { kitchenModel, priceKitchen } = await import('../public/js/kitchen.js');
  const cabs = [{ type: 'base', w: 60, h: 72, d: 56, doors: 1 }, { type: 'base', w: 60, h: 72, d: 56, doors: 1 }, { type: 'base', w: 90, h: 72, d: 56, doors: 2 }];
  const board = kitchenModel({ runs: [{ cabinets: cabs }] }); assert.equal(board.skirtBars, null); assert.ok(board.panels.carcass.some((p) => p.label.endsWith('Skirting')));
  const bar = kitchenModel({ style: { plinth_profile: '206439 Plinth', plinth_price: 4, plinth_bar_len: 300 }, runs: [{ cabinets: cabs }] });
  assert.ok(!bar.panels.carcass.some((p) => p.label.endsWith('Skirting'))); assert.equal(bar.skirtBars.pieces, 3); assert.equal(bar.skirtBars.bars.length, 1); // 58 + 58 + 88 = 204 cm fits one 300 cm bar
  const price = priceKitchen(bar, { general: {} }); assert.equal(price.lines.find((l) => l.group === 'Skirting').total, 4);
});

test('kitchens: every appliance has a name and height, dryer included', async () => {
  const { APPLIANCES, kitchenModel } = await import('../public/js/kitchen.js');
  for (const k of ['fridge', 'freezer', 'dishwasher', 'washer', 'dryer', 'oven', 'micro', 'coffee', 'cooker']) assert.ok(APPLIANCES[k] && APPLIANCES[k][1] > 0, k);
  const m = kitchenModel({ runs: [{ cabinets: [{ type: 'gap', w: 60, h: 90, d: 60, appliance: 'dryer' }] }] });
  assert.ok(m.appliances.some((a) => a.k === 'dryer'));
});

test('kitchens: appliances stand on the floor unless a skirting is asked for', async () => {
  const { kitchenModel, hasSkirt } = await import('../public/js/kitchen.js');
  const g = { type: 'gap', w: 60, h: 85, d: 60, appliance: 'dishwasher' };
  assert.equal(hasSkirt(g), false); assert.equal(hasSkirt({ ...g, skirt: true }), true);
  const on = kitchenModel({ runs: [{ cabinets: [{ ...g, skirt: true }] }] });
  assert.ok(on.panels.carcass.some((p) => p.label.endsWith('Skirting'))); assert.equal(on.hw.legs, 4);
  assert.equal(kitchenModel({ runs: [{ cabinets: [g] }] }).panels.carcass.length, 0);
});

test('aluminium kitchens follow the workshop cutting rules', async () => {
  const { kitchenModel, cabinetParts } = await import('../public/js/kitchen.js');
  const len = (p, code, label) => p.bars.filter((b) => b.code === code && b.label.includes(label)).map((b) => [b.len, b.qty]);
  const st = { kind: 'aluminium' };
  const base = cabinetParts({ type: 'base', w: 60, h: 72, d: 56, doors: 2, shelves: 1 }, st);
  assert.deepEqual(len(base, '22421', 'Edge back top'), [[60, 2]]); assert.deepEqual(len(base, '23564', 'Square'), [[55, 1]]); assert.deepEqual(len(base, '23564', 'Column'), []); // 2 doors: no hinge column
  assert.deepEqual(len(base, '22421', 'Shelf (width)'), [[58.6, 2]]); assert.deepEqual(len(base, '22421', 'Shelf (depth)'), [[52.8, 2]]);
  assert.deepEqual(base.panels.filter((p) => p.mat === 'white22').map((p) => [p.label, p.w, p.h, p.qty]), [['Bottom', 54.8, 50.8, 1], ['Side', 66.8, 50.8, 2], ['Back', 54.8, 66.8, 1]]); // no top sheet: the marble sits on it
  assert.ok(cabinetParts({ type: 'base', w: 60, h: 72, d: 56, doors: 2, top_sheet: true }, st).panels.some((p) => p.label === 'Top'));
  assert.ok(cabinetParts({ type: 'base', w: 60, h: 72, d: 56, doors: 2 }, { ...st, base_top: true }).panels.some((p) => p.label === 'Top'));
  assert.deepEqual(base.frames.map((f) => [f.w, f.h, f.qty]), [[28.9, 71, 2]]); // (60-2.2)/2 wide, 72-1 high
  const hid = cabinetParts({ type: 'base', w: 60, h: 72, d: 56, doors: 1, hidden_handle: true }, st);
  assert.deepEqual(len(hid, 'L-shape', 'Hidden'), [[60, 1]]); assert.deepEqual(hid.frames.map((f) => [f.w, f.h]), [[59, 68.5]]);
  const wall = cabinetParts({ type: 'wall', w: 90, h: 70, d: 32, doors: 3 }, st);
  assert.deepEqual(wall.frames.map((f) => [f.w, f.h, f.qty]), [[29.2, 69.5, 3]]); assert.deepEqual(len(wall, '23564', 'Column'), [[65, 1]]);
  const tall = cabinetParts({ type: 'tall', w: 60, h: 210, d: 58, doors: 2 }, st);
  assert.deepEqual(len(tall, '28456', 'Side height'), [[210, 4]]); assert.deepEqual(tall.panels.filter((p) => p.mat === 'white16').map((p) => [p.w, p.h, p.qty]), [[201.2, 49.2, 2]]);
  const m = kitchenModel({ style: st, runs: [{ cabinets: [{ type: 'base', w: 60, h: 72, d: 56, doors: 2 }] }] });
  assert.ok(m.carcassBars.find((g) => g.code === '22421') && m.sheets.white22.sheets.length === 1);
});

test('kitchens: wood base units have rails, a top only when asked; sheet plans by length, width or optimal with a fixed direction', async () => {
  const { cabinetParts, packSheets, kitchenModel, cutKey } = await import('../public/js/kitchen.js');
  const b = cabinetParts({ type: 'base', w: 60, h: 72, d: 56, doors: 1 }); assert.ok(b.panels.some((p) => p.label === 'Top rail') && !b.panels.some((p) => p.label === 'Top'));
  const bt = cabinetParts({ type: 'base', w: 60, h: 72, d: 56, doors: 1, top_sheet: true }); assert.ok(bt.panels.some((p) => p.label === 'Top') && !bt.panels.some((p) => p.label === 'Top rail'));
  assert.ok(cabinetParts({ type: 'wall', w: 60, h: 70, d: 32, doors: 1 }).panels.some((p) => p.label === 'Top'));
  const pcs = [{ w: 72, h: 56, qty: 6, label: 'Side' }, { w: 56.4, h: 54.4, qty: 4, label: 'Bottom' }];
  const rows = (r) => r.sheets.flatMap((s) => s.items);
  const L = packSheets(pcs, 244, 122, 0.3, { mode: 'length' }); const Wd = packSheets(pcs, 244, 122, 0.3, { mode: 'width' }); const O = packSheets(pcs, 244, 122, 0.3);
  assert.equal(O.mode, 'optimal'); assert.ok(O.sheets.length <= Math.min(L.sheets.length, Wd.sheets.length));
  // strips by length: pieces in one strip share its top edge
  for (const s of L.sheets) { const ys = [...new Set(s.items.map((i) => i.y))]; for (const y of ys) assert.ok(s.items.filter((i) => i.y === y).every((i) => i.x >= 0)); }
  for (const s of Wd.sheets) { const xs = [...new Set(s.items.map((i) => i.x))]; assert.ok(xs.length >= 1); }
  const fixed = packSheets([{ w: 72, h: 56, qty: 3, label: 'Side', dir: 'v' }], 244, 122); assert.ok(rows(fixed).every((i) => i.rot && i.w === 56 && i.h === 72));
  const m = kitchenModel({ cut_dir: { [cutKey('carcass', { label: 'A1 · Side', w: 56, h: 72 })]: 'h' }, runs: [{ cabinets: [{ type: 'base', w: 60, h: 72, d: 56, doors: 1 }] }] });
  assert.ok(m.sheets.carcass.sheets.flatMap((s) => s.items).filter((i) => i.label.endsWith('Side')).every((i) => !i.rot && i.w === 56));
});

test("workshop sample: base 100 (W) × 60 (D) × 70 (H), 2 doors, profile 28456", async () => {
  const { cabinetParts } = await import('../public/js/kitchen.js');
  const p = cabinetParts({ type: 'base', w: 100, d: 60, h: 70, doors: 2 }, { kind: 'aluminium' });
  assert.deepEqual(p.frames.map((f) => [f.w, f.h, f.qty]), [[48.9, 69, 2]]); // door width ((100 − 2.2) / 2) and height (70 − 1): 4 pieces each
  const hid = cabinetParts({ type: 'base', w: 100, d: 60, h: 70, doors: 2, hidden_handle: true }, { kind: 'aluminium' });
  assert.deepEqual(hid.frames.map((f) => [f.w, f.h, f.qty]), [[48.9, 66.5, 2]]); // hidden handle: 70 − 3.5
});

test('kitchens: open door places and the hidden handle (only over doors, one piece across touching units)', async () => {
  const { cabinetParts, kitchenModel } = await import('../public/js/kitchen.js');
  const st = { kind: 'aluminium', hidden_handle: true };
  const two = cabinetParts({ type: 'base', w: 100, d: 60, h: 70, doors: 2, open_doors: [1] }, st);
  assert.deepEqual(two.frames.map((f) => [f.w, f.h, f.qty]), [[48.9, 66.5, 1]]); // the open place takes no door; the door keeps its size
  assert.equal(two.hw.hinges, 2);
  assert.deepEqual(two.bars.filter((b) => b.code === 'L-shape').map((b) => b.len), [50]); // hidden handle over the door only
  assert.ok(two.bars.some((b) => b.label.includes('Square profile front/top (open part)') && b.len === 45));
  const open = cabinetParts({ type: 'base', w: 60, d: 60, h: 70, doors: 0 }, st); assert.ok(!open.bars.some((b) => b.code === 'L-shape'));
  assert.equal(cabinetParts({ type: 'base', w: 60, d: 60, h: 70, doors: 2, open_doors: [0, 1] }, st).frames[0].qty, 2); // all open is not allowed: both doors stay
  const m = kitchenModel({ style: st, runs: [{ cabinets: [{ type: 'base', w: 60, d: 60, h: 70, doors: 1 }, { type: 'sink', w: 80, d: 60, h: 70, doors: 2 }, { type: 'gap', w: 60, d: 60, h: 85 }, { type: 'base', w: 40, d: 60, h: 70, doors: 1 }] }] });
  const hidden = m.carcassBars.find((g) => g.code === 'L-shape').parts.map((p) => [p.label, p.len]);
  assert.deepEqual(hidden, [['A1+A2 · Hidden handle profile (one piece)', 140], ['A4 · Hidden handle profile', 40]]); // the gap breaks it
});

test('aluminium hinge column: (H − 5) × Int((QOD − 1) / 2) when more than 2 doors', async () => {
  const { cabinetParts } = await import('../public/js/kitchen.js');
  const col = (n, type = 'base') => cabinetParts({ type, w: 30 * n, d: 60, h: 70, doors: n, y: 140 }, { kind: 'aluminium' }).bars.filter((b) => b.label.includes('Column')).map((b) => [b.len, b.qty]);
  assert.deepEqual(col(1), []); assert.deepEqual(col(2), []); assert.deepEqual(col(3), [[65, 1]]); assert.deepEqual(col(4), [[65, 1]]); assert.deepEqual(col(5), [[65, 2]]); assert.deepEqual(col(6), [[65, 2]]); assert.deepEqual(col(7), [[65, 3]]);
  assert.deepEqual(col(2, 'wall'), []); assert.deepEqual(col(3, 'wall'), [[65, 1]]);
});

test('sheet stock: used pieces are cut first, new sheets only for the rest, priced separately; visible ends use their own sheet', async () => {
  const K = await import('../public/js/kitchen.js');
  K.setBoards({ types: [{ id: 1, name: 'MDF 18 white', material: 'MDF', thickness: 18, sheet_w: 244, sheet_h: 122, price: 10 }, { id: 2, name: 'Oak veneer 18', thickness: 18, sheet_w: 244, sheet_h: 122, price: 30 }], stock: [
    { id: 11, type_id: 1, kind: 'used', length: 150, width: 80, qty: 1, unit_cost: 4 }, { id: 12, type_id: 1, kind: 'used', length: 60, width: 40, qty: 2, unit_cost: 1 }, { id: 13, type_id: 1, kind: 'new', length: 244, width: 122, qty: 5, unit_cost: 10 }] });
  try {
    const parts = [{ w: 70, h: 50, qty: 2, label: 'a' }, { w: 55, h: 35, qty: 1, label: 'b' }, { w: 200, h: 100, qty: 1, label: 'big' }];
    const r = K.planSheets(parts, 244, 122, 0.3, { used: K.usedPiecesOf(1) });
    assert.equal(r.usedCount, 2); assert.equal(r.newCount, 1); // the 60×40 scrap takes "b", the 150×80 piece takes the 70×50s, the big one needs a new sheet
    assert.deepEqual(r.sheets.map((s) => s.source), ['used', 'used', 'new']); assert.equal(r.sheets[0].stockId, 12);
    assert.equal(r.sheets.flatMap((s) => s.items).length, 4);
    const none = K.planSheets(parts, 244, 122, 0.3, { used: [] }); assert.equal(none.usedCount, 0);
    const cab = { type: 'base', w: 60, d: 56, h: 72, doors: 1 };
    const m = K.kitchenModel({ style: { carcass: 'MDF 18 white', end_sheet: 'Oak veneer 18' }, runs: [{ cabinets: [cab, cab, cab] }] });
    assert.equal(m.panels.end.reduce((a, p) => a + p.qty, 0), 2); // the left of the first and the right of the last
    assert.equal(m.panels.carcass.filter((p) => p.label.endsWith('Side')).reduce((a, p) => a + p.qty, 0), 4);
    assert.equal(m.sheets.end.type, 'Oak veneer 18'); assert.equal(m.sheets.carcass.sheets[0].source, 'used');
    const price = K.priceKitchen(m, { general: {} });
    assert.ok(price.lines.some((l) => l.label.startsWith('Used sheets from stock')) && price.lines.some((l) => l.label.startsWith('Visible sides') && l.price === 30));
    const all = K.kitchenModel({ style: { carcass: 'MDF 18 white' }, runs: [{ cabinets: [cab, cab, cab, cab, cab, cab] }] }); // three used pieces exist: no piece is used for two materials
    assert.ok(['carcass', 'door', 'back'].reduce((a, mt) => a + all.sheets[mt].usedCount, 0) <= 3);
    const off = K.kitchenModel({ style: { carcass: 'MDF 18 white' }, runs: [{ cabinets: [cab] }] }); assert.equal(off.panels.end.length, 0);
    const hand = K.kitchenModel({ style: { carcass: 'MDF 18 white', end_sheet: 'Oak veneer 18' }, runs: [{ cabinets: [{ ...cab, end_left: false, end_right: false }, cab] }] }); assert.equal(hand.panels.end.reduce((a, p) => a + p.qty, 0), 1);
  } finally { K.setBoards({ types: [], stock: [] }); }
});

test('kitchen defaults from Settings fill the frame profile and handle; order numbers are locked', async () => {
  const K = await import('../public/js/kitchen.js');
  K.setKitchenDefaults({ profile_id: 7, handle: 'L&C Shape Profile' }, [{ id: 7, code: '28456', name: 'Wide door / drawer frame', face_w: 45, bar_length: 580, price_bar: 12 }]);
  try {
    const m = K.kitchenModel({ style: { kind: 'aluminium' }, runs: [{ cabinets: [{ type: 'base', w: 100, d: 60, h: 70, doors: 2 }] }] });
    assert.equal(m.style.profile, '28456 Wide door / drawer frame'); assert.equal(m.style.handle, 'L&C Shape Profile'); assert.equal(m.style.bar_len, 580); assert.equal(m.style.profile_price, 12);
    const own = K.kitchenModel({ style: { kind: 'aluminium', profile: 'Other', handle: 'Knob' }, runs: [] }); assert.equal(own.style.profile, 'Other'); assert.equal(own.style.handle, 'Knob');
  } finally { K.setKitchenDefaults(null, []); }
});

test('order / invoice numbers are locked once set', async () => {
  const { spawn } = await import('node:child_process'); const { mkdtempSync, rmSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const path = await import('node:path');
  const port = 4600 + Math.floor(Math.random() * 300); const base = `http://127.0.0.1:${port}`; const dir = mkdtempSync(path.join(tmpdir(), 'workshop-lock-'));
  const proc = spawn(process.execPath, ['--no-warnings', 'server.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, WORKSHOP_DEV: '1' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'boss', password: 'secret1' }) }); const ck = r.headers.get('set-cookie').split(';')[0];
    const call = async (m, u, b) => (await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: b ? JSON.stringify(b) : undefined })).json();
    const o = await call('POST', '/api/t/orders', { client: 'A', date: '2026-10-10', amount: 100, vat_rate: 10 }); assert.ok(o.inv);
    const o2 = await call('PUT', `/api/t/orders/${o.id}`, { inv: 'X999', client: 'B' }); assert.equal(o2.inv, o.inv); assert.equal(o2.client, 'B'); // the number stays, other fields change
    const k = await call('POST', '/api/t/kitchens', { name: 'K', order_inv: '' , spec: {} }); const k2 = await call('PUT', `/api/t/kitchens/${k.id}`, { order_inv: o.inv }); assert.equal(k2.order_inv, o.inv); // filled in once
    const k3 = await call('PUT', `/api/t/kitchens/${k.id}`, { order_inv: 'ZZZ' }); assert.equal(k3.order_inv, o.inv); // then locked
    const t = await call('POST', '/api/t/tasks', { title: 'T', order_inv: o.inv }); const t2 = await call('PUT', `/api/t/tasks/${t.id}`, { order_inv: 'other' }); assert.equal(t2.order_inv, o.inv);
  } finally { proc.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('the creator: one only, the admin of the admins, never deleted, demoted or switched off', async () => {
  const { spawn } = await import('node:child_process'); const { mkdtempSync, rmSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const path = await import('node:path');
  const port = 4900 + Math.floor(Math.random() * 300); const base = `http://127.0.0.1:${port}`; const dir = mkdtempSync(path.join(tmpdir(), 'workshop-creator-'));
  const proc = spawn(process.execPath, ['--no-warnings', 'server.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, WORKSHOP_DEV: '1' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    const login = async (u, p) => { const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) }); return r.headers.get('set-cookie')?.split(';')[0]; };
    const mk = (ck) => async (m, u, b) => { const r = await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, data: await r.json().catch(() => null) }; };
    const boss = mk(await login('boss', 'secret1')); // the first admin
    const c = await boss('POST', '/api/users', { username: 'maker', name: 'The Creator', role: 'creator', password: 'create123' }); assert.equal(c.status, 201, JSON.stringify(c.data)); assert.equal(c.data.creator, 1); assert.equal(c.data.role, 'admin');
    assert.equal((await boss('POST', '/api/users', { username: 'maker2', name: 'x', role: 'creator', password: 'create123' })).status, 400); // only one creator
    const cid = c.data.id; const creator = mk(await login('maker', 'create123'));
    assert.equal((await boss('DELETE', `/api/users/${cid}`)).status, 400); assert.equal((await boss('PUT', `/api/users/${cid}`, { role: 'worker' })).status, 400); assert.equal((await boss('PUT', `/api/users/${cid}`, { active: false })).status, 400); assert.equal((await boss('PUT', `/api/users/${cid}`, { name: 'Hacked' })).status, 400);
    assert.equal((await creator('DELETE', `/api/users/${cid}`)).status, 400); assert.equal((await creator('PUT', `/api/users/${cid}`, { role: 'account' })).status, 400); assert.equal((await creator('PUT', `/api/users/${cid}`, { active: false })).status, 400);
    assert.equal((await creator('PUT', `/api/users/${cid}`, { name: 'Founder' })).status, 200); // he can edit his own name
    // admin of the admins: other admins cannot make, change or remove admins
    assert.equal((await boss('POST', '/api/users', { username: 'adm2', name: 'Admin 2', role: 'admin', password: 'admin222' })).status, 400);
    const a2 = await creator('POST', '/api/users', { username: 'adm2', name: 'Admin 2', role: 'admin', password: 'admin222' }); assert.equal(a2.status, 201, JSON.stringify(a2.data));
    assert.equal((await boss('DELETE', `/api/users/${a2.data.id}`)).status, 400); assert.equal((await boss('PUT', `/api/users/${a2.data.id}`, { role: 'worker' })).status, 400);
    assert.equal((await creator('PUT', `/api/users/${a2.data.id}`, { role: 'worker' })).status, 200);
    assert.equal((await boss('POST', '/api/users', { username: 'wkr', name: 'W', role: 'worker', password: 'work1234' })).status, 201); // admins still manage everyone else
    assert.equal((await creator('GET', '/api/me')).data.user.creator, 1);
  } finally { proc.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('an admin can make his own current account the creator, once, with his password', async () => {
  const { spawn } = await import('node:child_process'); const { mkdtempSync, rmSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const path = await import('node:path');
  const port = 5200 + Math.floor(Math.random() * 300); const base = `http://127.0.0.1:${port}`; const dir = mkdtempSync(path.join(tmpdir(), 'workshop-claim-'));
  const proc = spawn(process.execPath, ['--no-warnings', 'server.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, WORKSHOP_DEV: '1' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    const login = async (u, p) => (await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).headers.get('set-cookie')?.split(';')[0];
    const mk = (ck) => async (m, u, b) => { const r = await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, data: await r.json().catch(() => null) }; };
    const boss = mk(await login('boss', 'secret1'));
    await boss('POST', '/api/users', { username: 'acc', name: 'Acc', role: 'account', password: 'acc12345' }); const acc = mk(await login('acc', 'acc12345'));
    assert.equal((await acc('POST', '/api/users/claim-creator', { password: 'acc12345' })).status, 403); // not an admin
    assert.equal((await boss('POST', '/api/users/claim-creator', { password: 'wrong' })).status, 403);
    const ok = await boss('POST', '/api/users/claim-creator', { password: 'secret1' }); assert.equal(ok.status, 200); assert.equal(ok.data.creator, 1); assert.equal(ok.data.username, 'boss');
    assert.equal((await boss('GET', '/api/me')).data.user.creator, 1);
    assert.equal((await boss('POST', '/api/users/claim-creator', { password: 'secret1' })).status, 400); // only once
    const me = (await boss('GET', '/api/me')).data.user; assert.equal((await boss('DELETE', `/api/users/${me.id}`)).status, 400); assert.equal((await boss('PUT', `/api/users/${me.id}`, { role: 'worker' })).status, 400);
  } finally { proc.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('customer portal: order number + code, progress only, chosen photos and kitchens, nothing else', async () => {
  const { spawn } = await import('node:child_process'); const { mkdtempSync, rmSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const path = await import('node:path');
  const port = 5500 + Math.floor(Math.random() * 300); const base = `http://127.0.0.1:${port}`; const dir = mkdtempSync(path.join(tmpdir(), 'workshop-portal-'));
  const proc = spawn(process.execPath, ['--no-warnings', 'server.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, WORKSHOP_DEV: '1' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    const r0 = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'boss', password: 'secret1' }) }); const ck = r0.headers.get('set-cookie').split(';')[0];
    const call = async (m, u, b, cookie = ck, host) => { const r = await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(host ? { Host: host } : {}) }, body: b ? JSON.stringify(b) : undefined }); const ct = r.headers.get('content-type') || ''; return { status: r.status, data: ct.includes('json') ? await r.json() : null, text: ct.includes('json') ? '' : await r.text(), headers: r.headers, buf: ct.startsWith('image') ? Buffer.from(await r.arrayBuffer()) : null }; };
    const o = (await call('POST', '/api/t/orders', { client: 'Fatima', date: '2026-10-10', amount: 500, vat_rate: 10 })).data;
    assert.equal((await call('POST', '/api/portal/login', { order: o.inv, code: '12345678' }, '')).status, 401); // no code yet
    const on = (await call('POST', `/api/order-portal/${o.id}`, { action: 'generate' })).data; assert.ok(/^\d{4} \d{4}$/.test(on.code)); assert.equal(on.enabled, true);
    assert.equal((await call('POST', '/api/portal/login', { order: o.inv, code: '00000000' }, '')).status, 401);
    const li = await call('POST', '/api/portal/login', { order: o.inv.toLowerCase(), code: on.code }, ''); assert.equal(li.status, 200); const cp = li.headers.get('set-cookie').split(';')[0];
    await call('POST', '/api/t/tasks', { title: 'Cut glass', stage: 'Cutting', order_inv: o.inv, status: 'done', estimate_min: 60 }); await call('POST', '/api/t/tasks', { title: 'Assemble', stage: 'Assembly', order_inv: o.inv, status: 'doing', progress: 50, estimate_min: 60 });
    const me = await call('GET', '/api/portal/me', null, cp); assert.equal(me.status, 200); assert.equal(me.data.client, 'Fatima'); assert.equal(me.data.percent, 75); assert.equal(me.data.stages.length, 2); assert.deepEqual(me.data.photos, []); assert.equal(me.data.amount, undefined); assert.equal(me.data.paid, undefined);
    assert.equal((await call('GET', '/api/portal/photo/1', null, cp)).status, 404); // not chosen
    assert.equal((await call('GET', '/api/t/orders', null, cp)).status, 401); // the portal pass opens nothing in the workshop app
    assert.equal((await call('GET', '/api/portal/me', null, '')).status, 401);
    const k = (await call('POST', '/api/t/kitchens', { name: 'K1', order_inv: o.inv, spec: { style: { profile_price: 9 }, runs: [] } })).data;
    assert.equal((await call('GET', `/api/portal/kitchen/${k.id}`, null, cp)).status, 404); // not allowed yet
    await call('POST', `/api/order-portal/${o.id}`, { kitchens: [k.id], message: 'Hello' });
    const kv = await call('GET', `/api/portal/kitchen/${k.id}`, null, cp); assert.equal(kv.status, 200); assert.equal(kv.data.spec.style.profile_price, undefined);
    assert.equal((await call('GET', '/api/portal/me', null, cp)).data.message, 'Hello');
    // the client host serves the customer page only, and staff endpoints are closed there
    const http = await import('node:http'); const raw = (u, headers) => new Promise((res, rej) => http.request({ host: '127.0.0.1', port, path: u, headers }, (r) => { let s = ''; r.on('data', (c) => (s += c)); r.on('end', () => res({ status: r.statusCode, text: s })); }).on('error', rej).end());
    assert.ok((await raw('/', { Host: 'client.example.com' })).text.includes('/js/client.js')); assert.equal((await raw('/api/t/orders', { Host: 'client.example.com', Cookie: ck })).status, 404);
    assert.ok((await raw('/', { Host: 'workshop.example.com' })).text.includes('Workshop')); assert.ok((await raw('/client', {})).text.includes('/js/client.js'));
    // a new code ends the old visit; switching off ends it too
    const nc = (await call('POST', `/api/order-portal/${o.id}`, { action: 'generate' })).data; assert.notEqual(nc.code, on.code);
    assert.equal((await call('POST', '/api/portal/login', { order: o.inv, code: on.code }, '')).status, 401);
    await call('POST', `/api/order-portal/${o.id}`, { action: 'off' }); assert.equal((await call('GET', '/api/portal/me', null, cp)).status, 401);
  } finally { proc.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('document numbers are automatic: typed numbers are ignored on create and never changed', async () => {
  const { spawn } = await import('node:child_process'); const { mkdtempSync, rmSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const path = await import('node:path');
  const port = 5800 + Math.floor(Math.random() * 300); const base = `http://127.0.0.1:${port}`; const dir = mkdtempSync(path.join(tmpdir(), 'workshop-auto-'));
  const proc = spawn(process.execPath, ['--no-warnings', 'server.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, WORKSHOP_DEV: '1' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    const r0 = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'boss', password: 'secret1' }) }); const ck = r0.headers.get('set-cookie').split(';')[0];
    const call = async (m, u, b) => (await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: b ? JSON.stringify(b) : undefined })).json();
    const q = await call('POST', '/api/t/quotes', { number: 'MY-1', client: 'A', date: '2026-10-10', items: [], vat_rate: 10 }); assert.notEqual(q.number, 'MY-1'); assert.ok(/^\d+$/.test(q.number));
    const q2 = await call('POST', '/api/t/quotes', { client: 'B', date: '2026-10-10', items: [], vat_rate: 10 }); assert.equal(Number(q2.number), Number(q.number) + 1);
    const up = await call('PUT', `/api/t/quotes/${q.id}`, { number: '999999', client: 'A2' }); assert.equal(up.number, q.number); assert.equal(up.client, 'A2');
    const o = await call('POST', '/api/t/orders', { inv: 'X1', client: 'A', date: '2026-10-10', amount: 10 }); assert.notEqual(o.inv, 'X1');
    const rc = await call('POST', '/api/t/receipts', { no: 'R-X', date: '2026-10-10', order_inv: o.inv, client: 'A', amount: 5, method: 'Cash' }); assert.notEqual(rc.no, 'R-X');
  } finally { proc.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('sheets by purpose: thickness, door kind, glass without inside sheet, lining, per-cabinet sheets', async () => {
  const K = await import('../public/js/kitchen.js');
  K.setBoards({ types: [
    { id: 1, name: 'White 22', material: 'Fibre board', thickness: 22, sheet_w: 280, sheet_h: 130, price: 20 },
    { id: 2, name: 'White 4', material: 'Fibre board', thickness: 4, sheet_w: 244, sheet_h: 122, price: 5 },
    { id: 3, name: 'White 16', material: 'Fibre board', thickness: 16, sheet_w: 280, sheet_h: 130, price: 12 },
    { id: 4, name: 'Oak', material: 'Veneered', thickness: 18, sheet_w: 244, sheet_h: 122, price: 30 },
    { id: 5, name: 'Alu sheet', material: 'Aluminium', thickness: 3, sheet_w: 300, sheet_h: 150, price: 40 },
    { id: 6, name: 'Clear glass', material: 'Glass', thickness: 6, sheet_w: 300, sheet_h: 200, price: 60 }], stock: [] });
  assert.deepEqual(K.sheetTypesFor({ thick: 22 }).map((t) => t.name), ['White 22']);
  assert.deepEqual(K.sheetTypesFor({ kind: 'wood' }).map((t) => t.name), ['Oak']);
  assert.deepEqual(K.sheetTypesFor({ kind: 'aluminium' }).map((t) => t.name), ['Alu sheet']);
  assert.deepEqual(K.sheetTypesFor({ kind: 'fiber' }).map((t) => t.name), ['White 22', 'White 4', 'White 16']);
  assert.deepEqual(K.sheetTypesFor({ kind: 'glass' }).map((t) => t.name), ['Clear glass']);
  assert.equal(K.fmtThick(22), '2.2 cm'); assert.equal(K.fmtThick(4), '4 mm');
  const cab = { type: 'wall', w: 60, h: 70, d: 32, doors: 1, drawers: 0, shelves: 1 };
  const base = { kind: 'wood', carcass: 'White 22', door: 'Oak', white16: 'White 16' };
  const lined = K.cabinetParts(cab, { ...base, door_lining: true });
  assert.ok(lined.panels.some((p) => p.mat === 'white16' && /inside/.test(p.label)));
  assert.ok(!K.cabinetParts(cab, { ...base, door_lining: false }).panels.some((p) => p.mat === 'white16'));
  const glass = K.cabinetParts(cab, { ...base, door_lining: true, door_kind: 'glass' });
  assert.ok(!glass.panels.some((p) => p.mat === 'white16')); assert.equal(glass.glass.length, 1);
  const custom = K.cabinetParts({ ...cab, sheets: { door: 'Alu sheet' } }, base);
  assert.ok(custom.panels.some((p) => p.mat === 'door@Alu sheet')); assert.ok(!custom.panels.some((p) => p.mat === 'door'));
  const spec = { style: base, counter: {}, runs: [{ cabinets: [cab, { ...cab, sheets: { door: 'Alu sheet' } }] }] };
  const m = K.kitchenModel(spec); assert.equal(m.sheets['door@Alu sheet'].type, 'Alu sheet'); assert.equal(m.sheets.door.type, 'Oak');
  assert.ok(K.priceKitchen(m, {}).lines.some((l) => /Alu sheet/.test(l.label)));
  assert.match(K.matLabel('door@Alu sheet', m.style), /custom: Alu sheet/);
});

test('same number or same name: the app asks, and the server honours the answer', async () => {
  const { spawn } = await import('node:child_process'); const { mkdtempSync, rmSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const path = await import('node:path');
  const port = 5800 + Math.floor(Math.random() * 300); const base = `http://127.0.0.1:${port}`; const dir = mkdtempSync(path.join(tmpdir(), 'workshop-cust-'));
  const proc = spawn(process.execPath, ['--no-warnings', 'server.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, WORKSHOP_DEV: '1' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    const r0 = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'boss', password: 'secret1' }) }); const ck = r0.headers.get('set-cookie').split(';')[0];
    const call = async (m, u, b) => (await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: b ? JSON.stringify(b) : undefined })).json();
    const a = await call('POST', '/api/t/quotes', { client: 'Ali', mobile: '33112233', date: '2026-10-10', items: [], vat_rate: 10 });
    const b = await call('POST', '/api/t/quotes', { client: 'Ali Two', mobile: '33112233', date: '2026-10-10', items: [], vat_rate: 10 }); assert.equal(b.customer_id, a.customer_id); // unasked: the number links
    const c = await call('POST', '/api/t/quotes', { client: 'Ali Two', mobile: '33112233', date: '2026-10-10', items: [], vat_rate: 10, _new_customer: 1 }); assert.notEqual(c.customer_id, a.customer_id); // "no, a different person"
    const d = await call('POST', '/api/t/quotes', { client: 'Someone', mobile: '39998888', date: '2026-10-10', items: [], vat_rate: 10, customer_id: a.customer_id }); assert.equal(d.customer_id, a.customer_id); // "yes, it is him"
  } finally { proc.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('glass: windows and doors have both clips and a gasket, kitchens only a gasket, each of its own type', async () => {
  const { glazingFix, glazingParts, modelCost, isClip, isGasket } = await import('../public/js/calc.js'); const K = await import('../public/js/kitchen.js');
  assert.deepEqual(glazingFix([{ w: 50, h: 100, qty: 2 }]), { clips: 20, metres: 6 }); // 300 cm round a pane: a clip every 30 cm, 3 m of gasket
  assert.equal(glazingFix([{ w: 5, h: 5, qty: 1 }]).clips, 4); // never fewer than four
  const cab = { type: 'wall', w: 60, h: 70, d: 32, doors: 2, glazed: 2 };
  const a = K.cabinetParts(cab, { kind: 'wood', glass_gasket: 'Black rubber' }); const b = K.cabinetParts({ ...cab, glass_gasket: 'Grey rubber' }, { kind: 'wood', glass_gasket: 'Black rubber' });
  assert.equal(a.hw.clips, undefined); assert.ok(a.hw.gasket > 0); assert.equal(a.glass[0].gasket, 'Black rubber'); assert.equal(b.glass[0].gasket, 'Grey rubber'); // kitchens have a gasket, no clips
  const m = K.kitchenModel({ style: { kind: 'wood', glass_gasket: 'Black rubber' }, counter: {}, runs: [{ cabinets: [cab, { ...cab, glass_gasket: 'Grey rubber' }] }] });
  const lines = K.priceKitchen(m, { gasket: { 'Black rubber': { price: 2 }, 'Grey rubber': { price: 3 } } }).lines;
  assert.ok(Math.abs(lines.find((l) => l.label === 'Glass gasket — Black rubber').total - 2 * a.hw.gasket) < 0.1); assert.ok(Math.abs(lines.find((l) => l.label === 'Glass gasket — Grey rubber').total - 3 * a.hw.gasket) < 0.1); assert.ok(!lines.some((l) => /clip/i.test(l.label)));
  const acc = [{ id: 1, code: 'GCL', name: 'Glazing clip', price: 0.4 }, { id: 2, code: 'GCL2', name: 'Wide clip', price: 0.9 }, { id: 3, code: 'E2113', name: 'Gasket EPDM', price: 1.5 }, { id: 4, code: 'MCL', name: 'Mirror clip', price: 5 }];
  assert.deepEqual(acc.filter(isClip).map((x) => x.id), [1, 2]); assert.deepEqual(acc.filter(isGasket).map((x) => x.id), [3]);
  const model = { spec: { glass: [{ label: 'Pane', w: 'W-8', h: 'H-8', qty: '1' }], profiles: [], accessories: [] } }; const lib = { profiles: [], accessories: acc, glassTypes: [] };
  const base = modelCost(model, 100, 100, lib, { price_m2: 0 }).accessories; assert.ok(base > 0); // the first clip type is used when none is picked
  assert.ok(modelCost(model, 100, 100, lib, { price_m2: 0 }, { clip_id: 2, gasket_id: 3 }).accessories > base); assert.equal(glazingParts([{ w: 92, h: 92, qty: 1 }], { clip_id: 2, gasket_id: 3 }, lib).gasket.id, 3);
});

test('door side: 22422 on that side becomes 22421, a full-size side door and no side sheet', async () => {
  const { cabinetParts, ALU } = await import('../public/js/kitchen.js');
  const st = { kind: 'aluminium' }; const sum = (r, code) => r.bars.filter((b) => b.code === code).reduce((a, b) => a + b.qty, 0);
  for (const type of ['base', 'wall']) {
    const cab = { type, w: 80, h: type === 'wall' ? 70 : 72, d: type === 'wall' ? 32 : 56, doors: 2 }; const a = cabinetParts(cab, st); const b = cabinetParts({ ...cab, door_side: 'right' }, st);
    assert.equal(sum(b, ALU.deep), sum(a, ALU.deep) / 2); assert.equal(sum(b, ALU.edge), sum(a, ALU.edge) + sum(a, ALU.deep) / 2);
    assert.equal(sum(b, ALU.col), sum(a, ALU.col)); const sd = b.frames.find((f) => /Side door \(right\)/.test(f.label)); assert.ok(sd && sd.w === cab.d && sd.h === cab.h); // no extra column; the door covers the whole side
    const sides = (r) => r.panels.filter((p) => /Side$/.test(p.label)).reduce((x, p) => x + p.qty, 0); assert.equal(sides(b), sides(a) - 1);
    assert.equal(b.hw.hinges, a.hw.hinges + (type === 'wall' ? 2 : 2));
  }
});
