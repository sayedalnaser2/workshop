import { db, insertRow, updateRow, listRows } from './db.js';

// Starter library. Profile prices are left at 0 and the deductions are generic examples:
// edit them in Models / Profiles to match the profile system you actually buy.
export function seedLibrary() {
  if (db.prepare('SELECT COUNT(*) n FROM models').get().n) return;

  const P = {};
  const addP = (key, name, series, extra = {}) => { P[key] = insertRow('profiles', { code: key, name, series, bar_length: 600, price_bar: 0, weight_m: 0, color: '', ...extra }).id; };
  addP('45-FR', 'Frame', '45 Series');
  addP('45-SH', 'Sash / leaf', '45 Series');
  addP('45-MU', 'Mullion / Z-bar', '45 Series');
  addP('45-BD', 'Glazing bead', '45 Series');
  addP('45-DR', 'Door stile & rail', '45 Series');
  addP('45-DT', 'Door threshold / bottom rail', '45 Series');
  addP('100-FR', 'Sliding outer frame', '100 Series');
  addP('100-SH', 'Sliding sash', '100 Series');
  addP('100-IL', 'Interlock', '100 Series');
  addP('100-RL', 'Rail / track', '100 Series');

  const A = {};
  const addA = (key, name, unit = 'ea', price = 0) => { A[key] = insertRow('accessories', { code: key, name, unit, price }).id; };
  addA('HNG', 'Hinge set');
  addA('HDL', 'Handle');
  addA('LCK', 'Lock');
  addA('RLR', 'Sliding roller (pair)');
  addA('SLK', 'Sliding lock');
  addA('RUB', 'Gasket / rubber', 'm');
  addA('PIL', 'Pile / brush', 'm');
  addA('SIL', 'Silicone', 'tube');

  insertRow('glass_types', { name: 'Clear 6mm', price_m2: 0, thickness: '6mm' });
  insertRow('glass_types', { name: 'Tinted 6mm', price_m2: 0, thickness: '6mm' });
  insertRow('glass_types', { name: 'Reflective 6mm', price_m2: 0, thickness: '6mm' });
  insertRow('glass_types', { name: 'Tempered 10mm', price_m2: 0, thickness: '10mm' });
  insertRow('glass_types', { name: 'Double glazed 6+12+6', price_m2: 0, thickness: '24mm' });

  const frame = (id) => [{ label: 'Frame – width', profile_id: id, len: 'W', qty: '2' }, { label: 'Frame – height', profile_id: id, len: 'H', qty: '2' }];
  const model = (name, series, kind, category, def_w, def_h, match, spec) =>
    insertRow('models', { name, series, kind, category, def_w, def_h, note: 'Starter formulas – adjust deductions to your profile system.', spec: { match, params: {}, vars: [], ...spec } });

  model('Fix window', '45 Series', 'fix', 'Window', 100, 100, 'Fix window 45', {
    profiles: [...frame(P['45-FR']), { label: 'Glazing bead – width', profile_id: P['45-BD'], len: 'W-8', qty: '2' }, { label: 'Glazing bead – height', profile_id: P['45-BD'], len: 'H-8', qty: '2' }],
    glass: [{ label: 'Fixed pane', w: 'W-7', h: 'H-7', qty: '1' }],
    accessories: [{ label: 'Gasket', accessory_id: A.RUB, qty: '(W+H)*2/100' }, { label: 'Silicone', accessory_id: A.SIL, qty: '0.25' }],
  });
  model('Single hinged window', '45 Series', 'hinged1', 'Window', 80, 120, 'Single Hinged window 45', {
    profiles: [...frame(P['45-FR']), { label: 'Sash – width', profile_id: P['45-SH'], len: 'W-5', qty: '2' }, { label: 'Sash – height', profile_id: P['45-SH'], len: 'H-5', qty: '2' }],
    glass: [{ label: 'Sash pane', w: 'W-14', h: 'H-14', qty: '1' }],
    accessories: [{ label: 'Hinges', accessory_id: A.HNG, qty: '1' }, { label: 'Handle', accessory_id: A.HDL, qty: '1' }, { label: 'Gasket', accessory_id: A.RUB, qty: '(W+H)*4/100' }],
  });
  model('Two leaf hinged window', '45 Series', 'hinged2', 'Window', 150, 120, 'Two Leaf Hinged Window 45', {
    profiles: [...frame(P['45-FR']), { label: 'Sash – width', profile_id: P['45-SH'], len: 'W/2-4', qty: '4' }, { label: 'Sash – height', profile_id: P['45-SH'], len: 'H-5', qty: '4' }],
    glass: [{ label: 'Sash pane', w: 'W/2-13', h: 'H-14', qty: '2' }],
    accessories: [{ label: 'Hinges', accessory_id: A.HNG, qty: '2' }, { label: 'Handle', accessory_id: A.HDL, qty: '2' }, { label: 'Gasket', accessory_id: A.RUB, qty: '(W+H)*6/100' }],
  });
  model('Bottom hinged window', '45 Series', 'bottom', 'Window', 60, 60, 'Bottom Hinged window 45', {
    profiles: [...frame(P['45-FR']), { label: 'Sash – width', profile_id: P['45-SH'], len: 'W-5', qty: '2' }, { label: 'Sash – height', profile_id: P['45-SH'], len: 'H-5', qty: '2' }],
    glass: [{ label: 'Sash pane', w: 'W-14', h: 'H-14', qty: '1' }],
    accessories: [{ label: 'Hinges', accessory_id: A.HNG, qty: '1' }, { label: 'Handle', accessory_id: A.HDL, qty: '1' }],
  });
  model('Two panel sliding window', '100 Series', 'sliding2', 'Window', 150, 120, 'two panel sliding window 100', {
    profiles: [{ label: 'Outer frame – width', profile_id: P['100-FR'], len: 'W', qty: '2' }, { label: 'Outer frame – height', profile_id: P['100-FR'], len: 'H', qty: '2' }, { label: 'Sash – width', profile_id: P['100-SH'], len: 'W/2+1', qty: '4' }, { label: 'Sash – height', profile_id: P['100-SH'], len: 'H-4.5', qty: '2' }, { label: 'Interlock', profile_id: P['100-IL'], len: 'H-4.5', qty: '2' }],
    glass: [{ label: 'Sliding pane', w: 'W/2-5', h: 'H-14', qty: '2' }],
    accessories: [{ label: 'Rollers', accessory_id: A.RLR, qty: '2' }, { label: 'Sliding lock', accessory_id: A.SLK, qty: '1' }, { label: 'Pile', accessory_id: A.PIL, qty: '(H*4+W*2)/100' }],
  });
  model('Three panel sliding window', '100 Series', 'sliding3', 'Window', 240, 120, 'Treple panel sliding window 100', {
    profiles: [{ label: 'Outer frame – width', profile_id: P['100-FR'], len: 'W', qty: '2' }, { label: 'Outer frame – height', profile_id: P['100-FR'], len: 'H', qty: '2' }, { label: 'Sash – width', profile_id: P['100-SH'], len: 'W/3+2', qty: '6' }, { label: 'Sash – height', profile_id: P['100-SH'], len: 'H-4.5', qty: '3' }, { label: 'Interlock', profile_id: P['100-IL'], len: 'H-4.5', qty: '3' }],
    glass: [{ label: 'Sliding pane', w: 'W/3-5', h: 'H-14', qty: '3' }],
    accessories: [{ label: 'Rollers', accessory_id: A.RLR, qty: '3' }, { label: 'Sliding lock', accessory_id: A.SLK, qty: '1' }, { label: 'Pile', accessory_id: A.PIL, qty: '(H*6+W*3)/100' }],
  });
  model('Single leaf swing door', '45 Series', 'door1', 'Door', 100, 220, 'Single Leaf swing door 45', {
    profiles: [{ label: 'Frame – height', profile_id: P['45-FR'], len: 'H', qty: '2' }, { label: 'Frame – top', profile_id: P['45-FR'], len: 'W-0', qty: '1' }, { label: 'Leaf stile', profile_id: P['45-DR'], len: 'H-3', qty: '2' }, { label: 'Leaf rail', profile_id: P['45-DR'], len: 'W-12', qty: '2' }, { label: 'Bottom rail', profile_id: P['45-DT'], len: 'W-12', qty: '1' }],
    glass: [{ label: 'Door pane', w: 'W-20', h: 'H-30', qty: '1' }],
    accessories: [{ label: 'Hinges', accessory_id: A.HNG, qty: '1' }, { label: 'Lock', accessory_id: A.LCK, qty: '1' }, { label: 'Handle', accessory_id: A.HDL, qty: '1' }],
  });
  model('Double swing door', '45 Series', 'door2', 'Door', 180, 220, 'double swing door 45', {
    profiles: [{ label: 'Frame – height', profile_id: P['45-FR'], len: 'H', qty: '2' }, { label: 'Frame – top', profile_id: P['45-FR'], len: 'W', qty: '1' }, { label: 'Leaf stile', profile_id: P['45-DR'], len: 'H-3', qty: '4' }, { label: 'Leaf rail', profile_id: P['45-DR'], len: 'W/2-12', qty: '4' }, { label: 'Bottom rail', profile_id: P['45-DT'], len: 'W/2-12', qty: '2' }],
    glass: [{ label: 'Door pane', w: 'W/2-20', h: 'H-30', qty: '2' }],
    accessories: [{ label: 'Hinges', accessory_id: A.HNG, qty: '2' }, { label: 'Lock', accessory_id: A.LCK, qty: '1' }, { label: 'Handle', accessory_id: A.HDL, qty: '2' }],
  });

  linkModelsToPriceItems();
}

/** Attach models to price-list items by name (spec.match), so picking a price item brings its model along. */
export function linkModelsToPriceItems() {
  const models = listRows('models');
  for (const pi of listRows('price_items')) {
    if (pi.model_id) continue;
    const m = models.find((x) => x.spec?.match && pi.name.toLowerCase().includes(x.spec.match.toLowerCase()));
    if (m) updateRow('price_items', pi.id, { model_id: m.id });
  }
}

/** Kitchen choices from the old workbook (panel types, handles, hinge and drawer brands, marble), prices left at 0 to fill in. */
export function seedKitchenOptions() {
  if (db.prepare('SELECT COUNT(*) n FROM kitchen_options').get().n) return;
  let n = 0; const add = (kind, name, unit = '', meta = null, note = '') => insertRow('kitchen_options', { kind, name, price: 0, unit, meta, note, sort: ++n });
  for (const x of ['Indofiber Sheet', 'Lamaicafiber Sheet', 'Cladding sheet', 'Aluminum Sheet', 'Wooden']) add('panel', x, 'sheet');
  add('handle', 'L&C Shape Profile', 'm'); add('handle', 'U Channel Profile', 'm'); add('handle', 'Type Shape', 'pcs'); add('handle', 'Normal', 'pcs');
  for (const x of ['Blum - German', 'Hafele - German', 'Hettich - German', 'Bergo - UK', 'FGV - Italy', 'Economic (F&F, Roma, Milano)']) add('hinge', x, 'pcs');
  for (const x of ['Deluxe - Blum', 'Deluxe - Hafele', 'Deluxe - Hettich', 'Class B - Bergo', 'Class B - FGV', 'Class C - Economic']) add('drawer', x, 'set');
  add('marble', 'Black Galaxy', 'm²', { thickness: 2 }); add('marble', 'Black Galaxy', 'm²', { thickness: 4 });
  add('glass', 'Clear', 'm²'); add('glass', 'Sandblasted', 'm²');
  add('profile_colour', 'RAL 9016 (white)'); add('profile_colour', 'RAL 8014 (brown)');
  const gen = [['edge_band_m', 'Edge banding, per metre'], ['leg', 'Plinth leg, each'], ['hanger', 'Wall hanger, each'], ['pin', 'Shelf pin, each'], ['polish_m', 'Countertop edge polishing, per metre'], ['cutout_sink', 'Sink cut-out, each'], ['cutout_hob', 'Hob cut-out, each'],
    ['labour_cabinet', 'Workshop labour, per cabinet'], ['install_m', 'Installation, per metre run'], ['markup_pct', 'Mark-up on cost, %'],
    ['rate_base_m', 'Selling rate: base cabinets, per metre'], ['rate_wall_m', 'Selling rate: wall cabinets, per metre'], ['rate_tall_m', 'Selling rate: tall units, per metre'], ['rate_counter_m', 'Selling rate: countertop, per metre'], ['rate_cutout', 'Selling rate: each sink/hob cut-out']];
  for (const [k, label] of gen) add('general', k, '', null, label);
}

// ---------------------------------------------------------------------------- more models (added to databases that already exist, by name)
const byCode = (rows, code) => rows.find((r) => r.code === code)?.id;
export function seedExtraModels() {
  const have = new Set(listRows('models').map((m) => m.name));
  const wanted = EXTRA_MODELS.filter((m) => !have.has(m.name));
  if (!wanted.length) return;
  let profiles = listRows('profiles'); let acc = listRows('accessories'); let glass = listRows('glass_types');
  for (const [code, name, series, bar] of EXTRA_PROFILES) if (!byCode(profiles, code)) insertRow('profiles', { code, name, series, bar_length: bar || 600, price_bar: 0, weight_m: 0, color: '' });
  for (const [code, name, unit] of EXTRA_ACCESSORIES) if (!byCode(acc, code)) insertRow('accessories', { code, name, unit, price: 0 });
  for (const [name, th] of EXTRA_GLASS) if (!glass.find((g) => g.name === name)) insertRow('glass_types', { name, price_m2: 0, thickness: th });
  profiles = listRows('profiles'); acc = listRows('accessories');
  const P = (c) => byCode(profiles, c); const A = (c) => byCode(acc, c);
  const prof = (label, code, len, qty = '1') => ({ label, profile_id: P(code), len, qty });
  const accs = (label, code, qty = '1') => ({ label, accessory_id: A(code), qty });
  for (const m of wanted) {
    insertRow('models', { name: m.name, series: m.series, kind: m.kind, category: m.category, def_w: m.w, def_h: m.h, note: 'Starter formulas – adjust to the profile and hardware you use.', spec: { match: m.match || '', params: m.params || {}, vars: m.vars || [], profiles: (m.profiles || []).map((x) => prof(...x)), glass: m.glass || [], accessories: (m.acc || []).map((x) => accs(...x)) } });
  }
  linkModelsToPriceItems();
  // price-list lines so the new models can be picked on a quotation (rate 0 until you set it)
  const items = listRows('price_items'); let sort = items.length + 1; const models = listRows('models');
  for (const m of wanted) {
    if (!m.price || items.find((i) => i.name === m.price[0])) continue;
    insertRow('price_items', { name: m.price[0], rate: 0, type: m.price[1], unit: m.price[1] === 'area' ? 'm²' : m.price[1] === 'length' ? 'm' : 'ea', note: 'Set your rate', model_id: models.find((x) => x.name === m.name)?.id || null, sort: sort++ });
  }
}
const EXTRA_PROFILES = [
  ['UCH', 'U channel (wall / floor)', 'Frameless', 600], ['TRK-T', 'Sliding top track', 'Shower', 600], ['TRK-B', 'Sliding bottom track', 'Shower', 600], ['SH-FR', 'Shower sash frame', 'Shower', 600],
  ['RL-HR', 'Handrail', 'Railing', 600], ['RL-PO', 'Railing post', 'Railing', 600], ['RL-BR', 'Bottom rail', 'Railing', 600], ['RL-BL', 'Baluster', 'Railing', 600],
  ['CW-MU', 'Curtain wall mullion', 'Curtain wall', 600], ['CW-TR', 'Curtain wall transom', 'Curtain wall', 600], ['CW-CP', 'Pressure cap', 'Curtain wall', 600],
  ['MR-FR', 'Mirror frame', 'Mirror', 600], ['PT-FR', 'Partition frame', 'Partition', 600], ['PT-MU', 'Partition mullion', 'Partition', 600],
  ['FD-TR', 'Folding door top track', 'Folding', 600], ['FD-BT', 'Folding door bottom track', 'Folding', 600], ['FD-ST', 'Folding panel stile', 'Folding', 600], ['FD-RL', 'Folding panel rail', 'Folding', 600],
];
const EXTRA_ACCESSORIES = [
  ['GHG', 'Glass door hinge', 'ea'], ['GCL', 'Glass clamp / patch fitting', 'ea'], ['SHD', 'Shower handle', 'ea'], ['MSL', 'Magnetic seal strip', 'm'], ['SRL', 'Shower sliding roller set', 'set'],
  ['SPG', 'Glass spigot / stand-off', 'ea'], ['BRK', 'Fixing bracket', 'ea'], ['FHG', 'Folding door hinge', 'ea'], ['FRL', 'Folding door roller carrier', 'ea'], ['FHL', 'Folding door handle', 'ea'],
  ['MCL', 'Mirror clip', 'ea'], ['MHG', 'Mirror hanging bracket', 'ea'], ['CWG', 'Curtain wall gasket', 'm'], ['BAS', 'Base plate / anchor', 'ea'],
];
const EXTRA_GLASS = [['Tempered 8mm', '8mm'], ['Tempered 12mm', '12mm'], ['Mirror 5mm', '5mm'], ['Laminated 10.76mm', '10.76mm']];
// profile rows are [label, code, length formula, qty formula]; accessory rows are [label, code, qty formula]
const EXTRA_MODELS = [
  { name: 'Shower screen – fixed panel', series: 'Frameless', kind: 'shower_fix', category: 'Shower & Glass', w: 90, h: 200, price: ['Shower screen fixed panel (frameless)', 'area'],
    profiles: [['Wall channel', 'UCH', 'H-2', '1'], ['Floor channel', 'UCH', 'W', '1']], glass: [{ label: 'Fixed panel', w: 'W-1', h: 'H-3', qty: '1' }], acc: [['Glass clamp', 'GCL', '2'], ['Silicone', 'SIL', '0.5']] },
  { name: 'Shower screen – hinged door', series: 'Frameless', kind: 'shower_door', category: 'Shower & Glass', w: 80, h: 195, price: ['Shower screen hinged door (frameless)', 'area'],
    profiles: [], glass: [{ label: 'Door', w: 'W-1', h: 'H-2', qty: '1' }], acc: [['Glass hinge', 'GHG', '2'], ['Handle', 'SHD', '1'], ['Magnetic seal', 'MSL', '(H*2)/100'], ['Silicone', 'SIL', '0.5']] },
  { name: 'Shower screen – sliding (2 panels)', series: 'Shower', kind: 'shower_slide', category: 'Shower & Glass', w: 140, h: 190, price: ['Shower screen sliding 2 panels', 'area'],
    profiles: [['Top track', 'TRK-T', 'W', '1'], ['Bottom track', 'TRK-B', 'W', '1'], ['Sash frame – height', 'SH-FR', 'H-6', '4'], ['Sash frame – width', 'SH-FR', 'W/2-1', '4']],
    glass: [{ label: 'Sliding panel', w: 'W/2-6', h: 'H-12', qty: '2' }], acc: [['Rollers', 'SRL', '2'], ['Handle', 'SHD', '2'], ['Seal', 'MSL', '(H*2)/100']] },
  { name: 'Shower corner (fixed + door)', series: 'Frameless', kind: 'shower_door', category: 'Shower & Glass', w: 80, h: 195, params: { D: 90 }, price: ['Shower corner fixed panel + door (frameless)', 'area'],
    profiles: [['Wall channel', 'UCH', 'H-2', '1']], glass: [{ label: 'Door', w: 'W-1', h: 'H-2', qty: '1' }, { label: 'Fixed side panel', w: 'D-1', h: 'H-3', qty: '1' }], acc: [['Glass hinge', 'GHG', '2'], ['Handle', 'SHD', '1'], ['Clamp', 'GCL', '2'], ['Magnetic seal', 'MSL', '(H*2)/100'], ['Silicone', 'SIL', '1']] },
  { name: 'Glass partition – frameless', series: 'Frameless', kind: 'partition', category: 'Partition', w: 200, h: 250, price: ['Glass partition frameless (tempered)', 'area'],
    profiles: [['Top channel', 'UCH', 'W', '1'], ['Floor channel', 'UCH', 'W', '1']], glass: [{ label: 'Panel', w: 'W-1', h: 'H-6', qty: '1' }], acc: [['Silicone', 'SIL', '1']] },
  { name: 'Glass partition – aluminium framed', series: 'Partition', kind: 'partition_frame', category: 'Partition', w: 240, h: 250, params: { N: 2 }, price: ['Glass partition aluminium framed', 'area'],
    profiles: [['Frame – top & bottom', 'PT-FR', 'W', '2'], ['Frame – sides', 'PT-FR', 'H-8', '2'], ['Mullion', 'PT-MU', 'H-8', 'N-1']], glass: [{ label: 'Pane', w: '(W-8)/N-3', h: 'H-14', qty: 'N' }], acc: [['Gasket', 'RUB', '((W+H)*2+(H*(N-1)))/100'], ['Silicone', 'SIL', '1']] },
  { name: 'Glass railing – channel base', series: 'Railing', kind: 'railing', category: 'Railing', w: 300, h: 100, vars: [{ name: 'N', expr: 'ceil(W/120)' }], price: ['Glass railing with handrail (per metre)', 'length'],
    profiles: [['Handrail', 'RL-HR', 'W', '1'], ['Base channel', 'UCH', 'W', '1']], glass: [{ label: 'Glass panel', w: 'W/N-1', h: 'H-12', qty: 'N' }], acc: [['Clamp', 'GCL', 'N*2'], ['Anchor', 'BAS', 'N*3'], ['Silicone', 'SIL', 'N*0.25']] },
  { name: 'Railing – posts & balusters', series: 'Railing', kind: 'railing_bar', category: 'Railing', w: 300, h: 100, vars: [{ name: 'N', expr: 'ceil(W/120)+1' }, { name: 'B', expr: 'ceil(W/11)' }], price: ['Aluminium railing posts & balusters (per metre)', 'length'],
    profiles: [['Post', 'RL-PO', 'H', 'N'], ['Handrail', 'RL-HR', 'W', '1'], ['Bottom rail', 'RL-BR', 'W', '1'], ['Baluster', 'RL-BL', 'H-12', 'B']], glass: [], acc: [['Base plate', 'BAS', 'N'], ['Bracket', 'BRK', 'N*2']] },
  { name: 'Curtain wall – stick system', series: 'Curtain wall', kind: 'curtain', category: 'Curtain wall', w: 400, h: 300, params: { MW: 100, MH: 125 }, vars: [{ name: 'NC', expr: 'ceil(W/MW)' }, { name: 'NR', expr: 'ceil(H/MH)' }], price: ['Curtain wall (per m²)', 'area'],
    profiles: [['Mullion', 'CW-MU', 'H', 'NC+1'], ['Transom', 'CW-TR', 'W/NC-6', 'NC*(NR+1)'], ['Pressure cap – vertical', 'CW-CP', 'H', 'NC+1'], ['Pressure cap – horizontal', 'CW-CP', 'W/NC-6', 'NC*(NR+1)']],
    glass: [{ label: 'Glass unit', w: 'W/NC-8', h: 'H/NR-8', qty: 'NC*NR' }], acc: [['Gasket', 'CWG', '((H*(NC+1))+(W*(NR+1)))*2/100'], ['Bracket', 'BRK', '(NC+1)*2'], ['Silicone', 'SIL', 'NC*NR*0.3']] },
  { name: 'Mirror – aluminium framed', series: 'Mirror', kind: 'mirror', category: 'Mirror', w: 60, h: 90, price: ['Mirror aluminium framed', 'area'],
    profiles: [['Frame – width', 'MR-FR', 'W', '2'], ['Frame – height', 'MR-FR', 'H', '2']], glass: [{ label: 'Mirror', w: 'W-2.4', h: 'H-2.4', qty: '1' }], acc: [['Hanging bracket', 'MHG', '2'], ['Silicone', 'SIL', '0.25']] },
  { name: 'Mirror – frameless polished', series: 'Mirror', kind: 'mirror', category: 'Mirror', w: 60, h: 120, price: ['Mirror frameless polished edge', 'area'],
    profiles: [], glass: [{ label: 'Mirror', w: 'W', h: 'H', qty: '1' }], acc: [['Mirror clip', 'MCL', '4'], ['Silicone', 'SIL', '0.25']] },
  { name: 'Folding door (bi-fold)', series: 'Folding', kind: 'folding', category: 'Door', w: 300, h: 220, params: { P: 4 }, price: ['Folding door aluminium (bi-fold)', 'area'],
    profiles: [['Top track', 'FD-TR', 'W', '1'], ['Bottom track', 'FD-BT', 'W', '1'], ['Panel stile', 'FD-ST', 'H-6', 'P*2'], ['Panel rail', 'FD-RL', 'W/P-5', 'P*2']], glass: [{ label: 'Panel glass', w: 'W/P-14', h: 'H-24', qty: 'P' }],
    acc: [['Folding hinge', 'FHG', '(P-1)*3'], ['Roller carrier', 'FRL', 'P'], ['Handle', 'FHL', '2'], ['Pile', 'PIL', '(H*(P+1)+W*2)/100']] },
];

// ---------------------------------------------------------------------------- kitchen cabinet presets
const PRESETS = [
  ['Base 40 – 1 door', { type: 'base', w: 40 }], ['Base 60 – 1 door', { type: 'base', w: 60 }], ['Base 80 – 2 doors', { type: 'base', w: 80, doors: 2 }], ['Base 100 – 2 doors', { type: 'base', w: 100, doors: 2 }],
  ['Drawer base 60 – 3 drawers', { type: 'drawers', w: 60 }], ['Drawer base 80 – 3 drawers', { type: 'drawers', w: 80 }], ['Sink base 90 – 2 doors', { type: 'sink', w: 90 }], ['Sink base 120 – 2 doors', { type: 'sink', w: 120 }],
  ['Hob base 60 – 2 drawers', { type: 'hob', w: 60 }], ['Hob base 80 – 2 drawers', { type: 'hob', w: 80 }], ['Corner base 90', { type: 'corner', w: 90 }], ['Oven housing 60', { type: 'base', w: 60, h: 72, doors: 0, drawers: 1, shelves: 0 }],
  ['Wall 40 – 1 door', { type: 'wall', w: 40 }], ['Wall 60 – 1 door', { type: 'wall', w: 60 }], ['Wall 80 – 2 doors', { type: 'wall', w: 80, doors: 2 }], ['Wall 80 – glazed doors', { type: 'wall', w: 80, doors: 2, glazed: 2 }],
  ['Tall pantry 60', { type: 'tall', w: 60 }], ['Tall fridge housing 60', { type: 'tall', w: 60, h: 210, doors: 1, shelves: 0 }], ['Tall oven/microwave tower 60', { type: 'tall', w: 60, doors: 2, drawers: 0, shelves: 2 }], ['Appliance gap 60', { type: 'gap', w: 60 }],
];
export function seedKitchenPresets() {
  if (db.prepare("SELECT COUNT(*) n FROM kitchen_options WHERE kind='preset'").get().n) return;
  const CT = { base: { w: 60, h: 72, d: 56, doors: 1, drawers: 0, shelves: 1 }, drawers: { w: 60, h: 72, d: 56, doors: 0, drawers: 3, shelves: 0 }, sink: { w: 90, h: 72, d: 56, doors: 2, drawers: 0, shelves: 0 }, hob: { w: 60, h: 72, d: 56, doors: 0, drawers: 2, shelves: 0 }, corner: { w: 90, h: 72, d: 56, doors: 1, drawers: 0, shelves: 1 }, wall: { w: 60, h: 70, d: 32, doors: 1, drawers: 0, shelves: 1 }, tall: { w: 60, h: 210, d: 58, doors: 2, drawers: 0, shelves: 4 }, gap: { w: 60, h: 85, d: 60, doors: 0, drawers: 0, shelves: 0 } };
  let n = 1000;
  for (const [name, c] of PRESETS) insertRow('kitchen_options', { kind: 'preset', name, price: 0, unit: '', meta: { label: '', glazed: 0, ...CT[c.type], ...c }, note: '', sort: n++ });
}

// ---------------------------------------------------------------------------- Balexco 45 series catalogue (gaskets, beads, glazing profiles)
const BX_PROFILES = [
  ['E1403', 'Glazing bead 26 mm', 'Balexco 45'], ['E1410', 'Glazing bead 26 mm (pair)', 'Balexco 45'], ['E1404', 'Glazing bead 21 mm', 'Balexco 45'], ['E1411', 'Glazing bead 21 mm (pair)', 'Balexco 45'],
  ['E1405', 'Glazing bead 16 mm', 'Balexco 45'], ['E1412', 'Glazing bead 16 mm (pair)', 'Balexco 45'], ['E1406', 'Glazing bead 11 mm', 'Balexco 45'], ['E1413', 'Glazing bead 11 mm (pair)', 'Balexco 45'],
  ['E1407', 'Glazing bead 6 mm', 'Balexco 45'], ['E1414', 'Glazing bead 6 mm (pair)', 'Balexco 45'],
  ['E1220', 'Window profile, glass space 41.3', 'Balexco 45'], ['E1230', 'Window profile, glass space 41.3 (curved)', 'Balexco 45'], ['E1237', 'Door profile, glass space 36.3', 'Balexco 45'], ['E1224', 'Door profile, glass space 36.3', 'Balexco 45'],
  ['E1337', 'Thermal-break door profile, glass space 41.3', 'Balexco 45i'], ['E1320', 'Thermal-break window profile, glass space 46.3', 'Balexco 45i'], ['E1331', 'Thermal-break window profile, glass space 46.3 (curved)', 'Balexco 45i'],
];
const BX_GASKETS = [['E2101', '2 mm', 'inner F'], ['E2102', '4 mm', 'inner D'], ['E2103', '6 mm', 'inner E'], ['E2104', '2 mm', 'outer C'], ['E2110', '', ''], ['E2111', '', ''], ['E2112', '3 mm', 'outer B'], ['E2113', '4 mm', 'outer A'], ['E2114', '', ''], ['E2115', '', '']];
export function seedBalexco() {
  const have = new Set(listRows('profiles').map((p) => p.code)); const haveA = new Set(listRows('accessories').map((a) => a.code));
  for (const [code, name, series] of BX_PROFILES) if (!have.has(code)) insertRow('profiles', { code, name, series, bar_length: 600, price_bar: 0, weight_m: 0, color: '' });
  for (const [code, mm, role] of BX_GASKETS) if (!haveA.has(code)) insertRow('accessories', { code, name: `Gasket ${code} EPDM${mm ? ' ' + mm : ''}${role ? ' (' + role + ')' : ''}`, unit: 'm', price: 0 });
  // the starter 45-series windows and doors use this system: turn the glazing picker on for them (once)
  for (const m of listRows('models')) {
    if (m.spec?.glazing || m.series !== '45 Series') continue;
    const type = m.category === 'Door' ? 'door' : m.category === 'Window' ? 'window' : '';
    if (type) updateRow('models', m.id, { spec: { ...m.spec, glazing: { type } } });
  }
}

/** Aluminium-door kitchens: a frame-corner price and a few door-frame profile choices (prices left at 0). Safe to run on every start. */
export function seedAluKitchen() {
  const has = (kind, name) => db.prepare('SELECT 1 FROM kitchen_options WHERE kind=? AND name=?').get(kind, name);
  const next = () => (db.prepare('SELECT IFNULL(MAX(sort),0)+1 n FROM kitchen_options').get().n);
  if (!has('general', 'frame_corner')) insertRow('kitchen_options', { kind: 'general', name: 'frame_corner', price: 0, unit: '', meta: null, note: 'Aluminium door frame: assembly, per corner', sort: next() });
  if (!db.prepare("SELECT 1 FROM kitchen_options WHERE kind='profile'").get()) for (const x of ['Slim door frame 20 mm', 'Glass door frame 25 mm', 'Handle-less frame (G-profile)']) insertRow('kitchen_options', { kind: 'profile', name: x, price: 0, unit: 'bar', meta: null, note: '', sort: next() });
}
