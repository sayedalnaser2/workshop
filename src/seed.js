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
