import { S, refresh } from '../app.js';
import { api, $, $$, esc, toast, guard, confirmBox } from '../ui.js';
import { colourHex, setColourDefs } from '../drawings.js';

// A menu of ready colours to pick from (name and code can both be changed after).
const PRESETS = [
  ['Signal White RAL 9003', '#f4f4f0'], ['Pure White RAL 9010', '#f1f0ea'], ['White RAL 9016', '#f1f0ea'], ['Cream RAL 9001', '#e9e0d2'], ['Ivory RAL 1015', '#e6d2b5'], ['Beige RAL 1019', '#a48f7a'],
  ['Silver Anodised', '#c4cad1'], ['Natural Anodised', '#d8dadd'], ['Light Grey RAL 7035', '#c5c7c4'], ['Grey Aluminium RAL 9007', '#8f8f8c'], ['Window Grey RAL 7040', '#9da3a6'], ['Dark Grey RAL 7016', '#293133'],
  ['Anthracite RAL 7021', '#2f3234'], ['Jet Black RAL 9005', '#0e0e10'], ['Black Matt', '#1c1d20'], ['Bronze', '#8c6a3d'], ['Dark Bronze', '#4e3b2a'], ['Champagne', '#d9c7a1'],
  ['Gold', '#c9a227'], ['Brown RAL 8017', '#45322e'], ['Chocolate Brown RAL 8014', '#4a3b2a'], ['Light Oak', '#c8a373'], ['Oak', '#a5733b'], ['Dark Oak', '#6b4a2f'],
  ['Walnut', '#4d3524'], ['Teak', '#9a6b3b'], ['Mahogany', '#5a2e22'], ['Red RAL 3000', '#a72920'], ['Blue RAL 5010', '#0e4c8a'], ['Green RAL 6005', '#114232'],
];
const HEX = /^#[0-9a-f]{6}$/i;
const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (r, g, b) => '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(Number(x) || 0))).toString(16).padStart(2, '0')).join('');
/** #rgb / rrggbb / "12, 34, 56" / "rgb(12 34 56)" → #rrggbb, or '' */
export function parseColourCode(text) {
  const t = String(text || '').trim().toLowerCase(); if (!t) return '';
  let m = t.match(/^#?([0-9a-f]{6})$/); if (m) return '#' + m[1]; m = t.match(/^#?([0-9a-f]{3})$/); if (m) return '#' + [...m[1]].map((c) => c + c).join('');
  m = t.match(/^(?:rgb\()?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)?$/); if (m && m.slice(1).every((x) => Number(x) <= 255)) return toHex(...m.slice(1)); return '';
}

export async function render(el) {
  // the list as it is now: names from the settings, each with its colour code (the built-in look when none was set yet)
  const defs = (S.settings.colour_defs && S.settings.colour_defs.length ? S.settings.colour_defs : (S.settings.colours || []).map((n) => ({ name: n, hex: colourHex(n) || '#cccccc' }))).map((d) => ({ name: d.name, hex: HEX.test(d.hex) ? d.hex.toLowerCase() : '#cccccc' }));
  const add = { name: '', hex: '#8c6a3d' };
  const draw = () => {
    el.innerHTML = `<div class="ph"><h1>Colours</h1><span class="sub">The finishes you offer. Each has your own name and a colour code, used in quotations, drawings and kitchens</span><span class="grow"></span><button class="btn primary" id="save">Save colours</button></div>
      <div class="card"><h3 style="margin-top:0">Add a colour</h3>
        <div class="col-add"><div class="col-prev" id="prev" style="background:${esc(add.hex)}"></div>
          <div class="form" style="grid-template-columns:1.4fr 1fr 1fr 1.6fr 1fr;flex:1;align-items:end">
            <label class="field"><span>Name (your own)</span><input id="nname" value="${esc(add.name)}" placeholder="e.g. Sand Beige"></label>
            <label class="field"><span>Pick</span><input id="npick" type="color" value="${esc(add.hex)}" style="height:38px;padding:2px"></label>
            <label class="field"><span>Code</span><input id="nhex" value="${esc(add.hex)}" placeholder="#8c6a3d or 140,106,61"></label>
            <label class="field"><span>R · G · B</span><span style="display:flex;gap:4px"><input id="nr" type="number" min="0" max="255" value="${toRgb(add.hex)[0]}"><input id="ng" type="number" min="0" max="255" value="${toRgb(add.hex)[1]}"><input id="nb" type="number" min="0" max="255" value="${toRgb(add.hex)[2]}"></span></label>
            <div class="field"><button class="btn primary" id="addbtn" style="width:100%">+ Add</button></div></div></div>
        <div style="margin-top:12px"><span class="muted" style="font-size:12px">…or pick one from the menu, then change the name or code if you like</span><div class="col-presets">${PRESETS.map(([n, h], i) => `<button class="col-sw" data-p="${i}" title="${esc(n)} ${h}"><i style="background:${h}"></i><span>${esc(n)}</span></button>`).join('')}</div></div></div>
      <div class="card" style="margin-top:14px"><h3 style="margin-top:0">Your colours (${defs.length})</h3><p class="muted" style="margin-top:0">Change a name or a colour here and press <b>Save colours</b>. Quotations already made keep the name they were made with.</p>
        <table class="grid"><thead><tr><th style="width:64px">Colour</th><th>Name</th><th>Code</th><th>R · G · B</th><th></th></tr></thead><tbody>${defs.map((d, i) => `<tr data-i="${i}"><td><input data-pick type="color" value="${d.hex}" style="width:48px;height:34px;padding:1px"></td><td><input data-name value="${esc(d.name)}" style="min-width:200px"></td><td><input data-hex value="${d.hex}" style="width:110px"></td><td class="muted">${toRgb(d.hex).join(' · ')}</td><td class="act"><button class="btn sm" data-up ${i === 0 ? 'disabled' : ''}>▲</button> <button class="btn sm" data-dn ${i === defs.length - 1 ? 'disabled' : ''}>▼</button> <button class="btn sm danger" data-del>Remove</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No colours yet.</td></tr>'}</tbody></table></div>`;
    // the "add" form: picker, code and R G B stay in step
    const sync = (hex) => { add.hex = hex; $('#prev', el).style.background = hex; $('#npick', el).value = hex; $('#nhex', el).value = hex; const [r, g, b] = toRgb(hex); $('#nr', el).value = r; $('#ng', el).value = g; $('#nb', el).value = b; };
    $('#nname', el).oninput = (e) => { add.name = e.target.value; };
    $('#npick', el).oninput = (e) => sync(e.target.value);
    $('#nhex', el).onchange = (e) => { const h = parseColourCode(e.target.value); if (h) sync(h); else { toast('Use a code like #8c6a3d or 140, 106, 61', 'err'); e.target.value = add.hex; } };
    for (const id of ['nr', 'ng', 'nb']) $('#' + id, el).oninput = () => sync(toHex($('#nr', el).value, $('#ng', el).value, $('#nb', el).value));
    $$('[data-p]', el).forEach((b) => (b.onclick = () => { const [n, h] = PRESETS[Number(b.dataset.p)]; add.name = n; sync(h); $('#nname', el).value = n; $('#nname', el).focus(); }));
    $('#addbtn', el).onclick = () => { const n = add.name.trim(); if (!n) { toast('Give the colour a name', 'err'); $('#nname', el).focus(); return; } if (defs.some((d) => d.name.toLowerCase() === n.toLowerCase())) { toast('You already have a colour with that name', 'err'); return; } defs.push({ name: n, hex: add.hex }); add.name = ''; draw(); toast(`Added ${n} — press Save colours to keep it`); };
    // the table
    const row = (e) => defs[Number(e.target.closest('tr').dataset.i)];
    el.querySelector('tbody').addEventListener('input', (e) => { if (e.target.matches('[data-name]')) row(e).name = e.target.value; });
    el.querySelector('tbody').addEventListener('change', (e) => {
      if (e.target.matches('[data-pick]')) { row(e).hex = e.target.value; draw(); }
      if (e.target.matches('[data-hex]')) { const h = parseColourCode(e.target.value); if (h) { row(e).hex = h; draw(); } else { toast('Use a code like #8c6a3d or 140, 106, 61', 'err'); e.target.value = row(e).hex; } }
    });
    el.querySelector('tbody').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const i = Number(b.closest('tr').dataset.i);
      if (b.matches('[data-del]')) { defs.splice(i, 1); draw(); } if (b.matches('[data-up]') && i > 0) { [defs[i - 1], defs[i]] = [defs[i], defs[i - 1]]; draw(); } if (b.matches('[data-dn]') && i < defs.length - 1) { [defs[i + 1], defs[i]] = [defs[i], defs[i + 1]]; draw(); } });
    $('#save', el).onclick = guard(async () => {
      const clean = defs.map((d) => ({ name: d.name.trim(), hex: d.hex })).filter((d) => d.name); const names = new Set();
      for (const d of clean) { const k = d.name.toLowerCase(); if (names.has(k)) return toast(`Two colours are called “${d.name}” — give each its own name`, 'err'); names.add(k); }
      await api.put('settings', { colour_defs: clean, colours: clean.map((d) => d.name) }); await refresh(); setColourDefs(S.settings.colour_defs); toast('Colours saved'); render(el);
    });
  };
  draw();
}
