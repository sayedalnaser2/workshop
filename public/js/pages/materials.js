import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, dataTable, editRow, confirmBox, toast, guard, datalist, modal } from '../ui.js';

const TABS = {
  profiles: {
    label: 'Aluminium profiles', title: 'profile', blank: { bar_length: 600 },
    fields: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name', required: true }, { key: 'series', label: 'Series' }, { key: 'color', label: 'Colour / finish', list: 'dl-mcol' }, { key: 'use', label: 'Used for', type: 'select', options: [['', '—'], ['Kitchen door frame', 'Kitchen door frame'], ['Kitchen handle profile', 'Kitchen handle profile'], ['Window / door frame', 'Window / door frame'], ['Sash', 'Sash'], ['Glazing bead', 'Glazing bead'], ['Other', 'Other']] }, { key: 'face_w', label: 'Face width (mm)', type: 'number', hint: 'The visible width of the profile — a kitchen door frame cuts its glass / infill panel from it' }, { key: 'perimeter', label: 'Perimeter (mm)', type: 'number', hint: 'For powder-coating or anodising cost' }, { key: 'bar_length', label: 'Bar length (cm)', type: 'number' }, { key: 'price_bar', label: 'Price per bar (BD)', type: 'number' }, { key: 'weight_m', label: 'Weight kg/m', type: 'number' }, { key: 'min_qty', label: 'Alert when new stock falls below (bars)', type: 'number', hint: 'Leave empty for no alert' }],
    cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'series', label: 'Series' }, { key: 'use', label: 'Used for' }, { key: 'face_w', label: 'Face mm', num: true, render: (r) => (r.face_w ? r.face_w : '') }, { key: 'weight_m', label: 'kg/m', num: true, render: (r) => (r.weight_m ? r.weight_m : '') }, { key: 'color', label: 'Finish' }, { key: 'bar_length', label: 'Bar cm', num: true }, { key: 'price_bar', label: 'Price / bar', num: true, render: (r) => money(r.price_bar) }, { key: 'min_qty', label: 'Alert below', num: true, render: (r) => (r.min_qty ? r.min_qty : '') }],
    search: ['code', 'name', 'series'],
  },
  glass_types: {
    label: 'Glass types', title: 'glass type', blank: {},
    fields: [{ key: 'name', label: 'Name', required: true }, { key: 'thickness', label: 'Thickness' }, { key: 'price_m2', label: 'Price per m² (BD)', type: 'number' }, { key: 'min_qty', label: 'Alert when new stock falls below (sheets)', type: 'number', hint: 'Leave empty for no alert' }],
    cols: [{ key: 'name', label: 'Name' }, { key: 'thickness', label: 'Thickness' }, { key: 'price_m2', label: 'Price / m²', num: true, render: (r) => money(r.price_m2) }, { key: 'min_qty', label: 'Alert below', num: true, render: (r) => (r.min_qty ? r.min_qty : '') }], search: ['name'],
  },
  accessories: {
    label: 'Accessories & hardware', title: 'accessory', blank: { unit: 'ea' },
    fields: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name', required: true }, { key: 'unit', label: 'Unit (ea, m, set…)' }, { key: 'price', label: 'Unit price (BD)', type: 'number' }, { key: 'min_qty', label: 'Alert when new stock falls below', type: 'number', hint: 'Leave empty for no alert' }],
    cols: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'unit', label: 'Unit' }, { key: 'price', label: 'Price', num: true, render: (r) => money(r.price) }, { key: 'min_qty', label: 'Alert below', num: true, render: (r) => (r.min_qty ? r.min_qty : '') }], search: ['code', 'name'],
  },
};

export async function render(el) {
  let tab = sessionStorage.getItem('mat-tab') || 'profiles';
  const draw = async () => {
    const cfg = TABS[tab];
    const rows = await api.get(`t/${tab}`);
    el.innerHTML = `<div class="ph"><h1>Profiles, Glass &amp; Accessories</h1><span class="sub">Material library used by Models, cutting lists and cost estimates</span></div>
      <div class="tbar"><div class="seg">${Object.entries(TABS).map(([k, c]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${c.label}</button>`).join('')}</div><span class="grow"></span>${tab === 'profiles' ? '<button class="btn" id="imp" title="Paste many profiles at once from your catalogue">⇪ Import a list</button>' : ''}<button class="btn primary" id="new">+ New ${cfg.title}</button></div><div id="t"></div>`;
    $$('.seg button', el).forEach((b) => (b.onclick = () => { tab = b.dataset.t; sessionStorage.setItem('mat-tab', tab); draw(); }));
    $('#imp', el)?.addEventListener('click', () => {
      const w = document.createElement('div');
      w.innerHTML = `<p style="margin-top:0">Paste your profile list — one profile per line:<br><code>code ; name ; series ; bar length cm ; weight kg/m ; price per bar ; face width mm ; used for</code><br><span class="muted">Only code and name are needed. A line whose code you already have <b>updates</b> that profile; new codes are added. You can copy rows straight from Excel.</span></p><textarea id="implist" rows="12" style="width:100%;font-family:monospace;font-size:12px" placeholder="E1403;Glazing bead 26 mm;Balexco 45;600;0.15;0;26;Glazing bead"></textarea><p class="muted" id="impsum"></p>`;
      $('#implist', w).oninput = () => { const r = parseProfileList($('#implist', w).value); $('#impsum', w).textContent = r.rows.length ? `${r.rows.length} profile(s) found${r.bad.length ? `, ${r.bad.length} line(s) without a name will be skipped` : ''}.` : ''; };
      modal({ title: 'Import profiles', body: w, wide: true, buttons: [{ label: 'Cancel' }, { label: 'Import', kind: 'primary', onClick: async () => {
        const { rows: list } = parseProfileList($('#implist', w).value); if (!list.length) { toast('Paste at least one line', 'err'); return false; }
        const have = new Map((await api.get('t/profiles')).map((p) => [String(p.code || '').toLowerCase(), p])); let added = 0; let updated = 0;
        for (const r of list) { const ex = r.code && have.get(r.code.toLowerCase()); const body = { ...r }; for (const k of ['face_w']) if (body[k] == null) delete body[k]; if (!r.use) delete body.use; if (ex) { await api.put(`t/profiles/${ex.id}`, body); updated++; } else { await api.post('t/profiles', body); added++; } }
        await refresh(); toast(`${added} added, ${updated} updated`); draw();
      } }] });
    });
    const open = (row) => editRow({ table: tab, title: row ? `Edit ${cfg.title}` : `New ${cfg.title}`, fields: cfg.fields, row, defaults: cfg.blank, extra: datalist('dl-mcol', S.settings.colours || []), onSaved: async () => { await refresh(); draw(); } });
    $('#new', el).onclick = () => open(null);
    const t = $('#t', el);
    dataTable(t, { cols: cfg.cols, rows, search: cfg.search, page: 200, onRow: open, actions: () => '<button class="btn sm danger" data-act="del">Delete</button>' });
    t.addEventListener('act', guard(async (e) => { if (e.detail.act === 'del' && await confirmBox(`Delete "${e.detail.row.name}"?`)) { await api.del(`t/${tab}/${e.detail.row.id}`); await refresh(); toast('Deleted'); draw(); } }));
  };
  draw();
}

/** Read a pasted catalogue: one profile per line — code, name, series, bar length cm, weight kg/m, price per bar, face width mm, used for. Tabs, semicolons or commas between the columns; a first line with titles is skipped. */
export function parseProfileList(text) {
  const out = []; const bad = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    const cells = line.split(/\t|;|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (/^(code|item|no\.?|profile)$/i.test(cells[0]) && /name|description/i.test(cells[1] || '')) continue; // the title line
    const [code, name, series, bar, weight, price, face, use] = cells; if (!code && !name) continue;
    const n = (v) => { const x = parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(x) ? x : null; };
    if (!name) { bad.push(line); continue; }
    out.push({ code: code || '', name, series: series || '', bar_length: n(bar) || 600, weight_m: n(weight) || 0, price_bar: n(price) || 0, face_w: n(face), use: use || '' });
  }
  return { rows: out, bad };
}
