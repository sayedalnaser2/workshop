import { S } from '../app.js';
import { api, $, $$, esc, num, today, dmy, toast, guard, confirmBox, modal, formHTML, readForm, dataTable, badge } from '../ui.js';
import { priceFor } from '../calc.js';
import { drawModel } from '../drawings.js';
import { attachmentsPanel } from '../attachments.js';
import { printView, docHeader } from '../doc.js';
import { canPage } from '../perm.js';

const uid = () => Math.random().toString(36).slice(2, 9);
const blank = () => ({ uid: uid(), label: '', model_id: null, w: null, h: null, qty: 1, colour: '', glass_id: null, note: '' });

export async function render(el, [id, sub]) {
  if (id && sub === 'print') return sheet(el, Number(id));
  if (id) return editor(el, Number(id));
  return list(el);
}

async function list(el) {
  const rows = (await api.get('t/surveys')).map((s) => ({ ...s, count: (s.items || []).length }));
  el.innerHTML = `<div class="ph"><h1>Site Surveys</h1><span class="sub">Measure on site with your phone, take photos, then turn the sizes into a quotation</span><span class="grow"></span><button class="btn primary" id="new">+ New survey</button></div><div id="t"></div>`;
  $('#new', el).onclick = () => {
    const f = [{ key: 'client', label: 'Customer', required: true }, { key: 'mobile', label: 'Mobile' }, { key: 'site', label: 'Site / address', full: true }];
    const w = document.createElement('div'); w.innerHTML = formHTML(f, {});
    modal({ title: 'New site survey', body: w, buttons: [{ label: 'Cancel' }, { label: 'Start measuring', kind: 'primary', onClick: async () => {
      const d = readForm(w, f); if (!d.client) { toast('Enter the customer', 'err'); return false; }
      const s = await api.post('t/surveys', { ...d, date: today(), items: [blank()], status: 'open' }); location.hash = `#/surveys/${s.id}`;
    } }] });
  };
  const t = $('#t', el);
  dataTable(t, {
    rows, search: ['client', 'site', 'mobile', 'surveyor', 'quote_no'], page: 40, empty: 'No surveys yet — start one when you visit a site.',
    cols: [{ key: 'date', label: 'Date', render: (r) => dmy(r.date) }, { key: 'client', label: 'Customer', render: (r) => `<b>${esc(r.client)}</b><div class="muted" style="font-size:11px">${esc(r.site || '')}</div>` }, { key: 'count', label: 'Openings', num: true }, { key: 'surveyor', label: 'Measured by' },
      { key: 'status', label: 'Status', render: (r) => (r.quote_no ? badge('Quoted ' + r.quote_no, 'ok') : badge('Open', 'warn')) }],
    onRow: (r) => (location.hash = `#/surveys/${r.id}`),
    actions: () => '<button class="btn sm danger" data-act="del">Delete</button>',
  });
  t.addEventListener('act', guard(async (e) => { if (e.detail.act === 'del' && await confirmBox(`Delete the survey for ${e.detail.row.client}?`)) { await api.del(`t/surveys/${e.detail.row.id}`); list(el); } }));
}

async function editor(el, id) {
  const s = await api.get(`t/surveys/${id}`).catch(() => null);
  if (!s) { el.innerHTML = '<p class="err">Survey not found.</p>'; return; }
  s.items = (s.items?.length ? s.items : [blank()]).map((i) => ({ ...i, uid: i.uid || uid() }));
  const canQuote = canPage(S.me, 'quotes');
  const models = S.models; const colours = S.settings.colours || [];
  el.innerHTML = `<div class="ph"><a class="btn" href="#/surveys">← Surveys</a><h1>${esc(s.client)}</h1>${s.quote_no ? badge('Quoted ' + s.quote_no, 'ok') : ''}<span class="grow"></span><span class="muted" id="saved"></span></div>
    <details class="card" ${s.site ? '' : 'open'}><summary style="cursor:pointer;font-weight:600">Customer & site — ${esc([s.site, s.mobile].filter(Boolean).join(' · ') || 'add details')}</summary><div class="form" style="margin-top:10px;grid-template-columns:repeat(3,1fr)"><label class="field"><span>Customer</span><input data-h="client" value="${esc(s.client)}"></label><label class="field"><span>Mobile</span><input data-h="mobile" type="tel" value="${esc(s.mobile || '')}"></label><label class="field"><span>Date</span><input data-h="date" type="date" value="${esc(s.date)}"></label><label class="field full"><span>Site / address</span><input data-h="site" value="${esc(s.site || '')}"></label><label class="field full"><span>General notes</span><textarea data-h="notes" rows="2">${esc(s.notes || '')}</textarea></label></div></details>
    <div id="items" style="margin-top:12px"></div>
    <div class="sticky-actions"><button class="btn primary" id="add">+ Add opening</button>${canQuote ? '<button class="btn" id="mkq">Create quotation from these sizes</button>' : ''}<a class="btn" href="#/surveys/${id}/print">Measurement sheet</a></div>`;
  let timer = 0; const flag = (t) => ($('#saved', el).textContent = t);
  const save = async () => { clearTimeout(timer); try { await api.put(`t/surveys/${id}`, { client: s.client, mobile: s.mobile, site: s.site, date: s.date, notes: s.notes, items: s.items }); flag('Saved ✓'); } catch (e) { flag('Not saved: ' + e.message); } };
  const later = () => { flag('Saving…'); clearTimeout(timer); timer = setTimeout(save, 700); };
  $$('[data-h]', el).forEach((i) => i.addEventListener('input', () => { s[i.dataset.h] = i.value; if (i.dataset.h === 'client') $('h1', el).textContent = i.value; later(); }));
  const box = $('#items', el);
  const sel = (key, opts, val, blankLabel) => `<select data-k="${key}"><option value="">${blankLabel}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  // where the window / door is: a drop-down of places from Settings, with "Other…" for anything else
  const locs = S.settings.locations || [];
  const locField = (it) => { const inList = locs.includes(it.label); const sel = inList ? it.label : it.label || it.other ? '__other' : ''; return `<select data-k="label_sel" style="flex:1;min-width:150px"><option value="">Where is it? — choose —</option>${locs.map((l) => `<option ${sel === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}<option value="__other" ${sel === '__other' ? 'selected' : ''}>Other…</option></select>${sel === '__other' ? `<input data-k="label" placeholder="Type the place" value="${esc(it.label || '')}" style="flex:1;min-width:140px">` : ''}`; };
  const draw = () => {
    box.innerHTML = s.items.map((it, i) => {
      const m = models.find((x) => x.id === Number(it.model_id));
      return `<div class="card svy" data-i="${i}" style="margin-bottom:12px"><div style="display:flex;gap:8px;align-items:center"><b style="font-size:16px">#${i + 1}</b>${locField(it)}<button class="btn sm danger" data-rm title="Remove">×</button></div>
        <div class="svy-g"><div class="svy-draw">${m ? drawModel(m.kind, it.w || m.def_w, it.h || m.def_h, { colour: it.colour, glass: S.glass_types.find((g) => g.id === Number(it.glass_id))?.name, layout: m.spec?.layout }) : '<span class="muted">Pick a type</span>'}</div>
        <div class="svy-f"><label class="field"><span>Type</span>${sel('model_id', models.map((x) => [x.id, `${x.name}`]), it.model_id, '— choose —')}</label>
          <div class="svy-wh"><label class="field"><span>Width cm</span><input data-k="w" type="number" inputmode="decimal" step="any" value="${it.w ?? ''}"></label><label class="field"><span>Height cm</span><input data-k="h" type="number" inputmode="decimal" step="any" value="${it.h ?? ''}"></label><label class="field"><span>Qty</span><input data-k="qty" type="number" inputmode="numeric" step="any" value="${it.qty ?? 1}"></label></div>
          <div class="svy-wh"><label class="field"><span>Colour</span>${sel('colour', colours.map((c) => [c, c]), it.colour, '— as quote —')}</label><label class="field"><span>Glass</span>${sel('glass_id', S.glass_types.map((g) => [g.id, g.name]), it.glass_id, '—')}</label></div>
          <label class="field"><span>Notes (opening direction, obstacles, level…)</span><textarea data-k="note" rows="2">${esc(it.note || '')}</textarea></label></div></div>
        <div class="att-slot" data-slot="${it.uid}"></div></div>`;
    }).join('');
    $$('.att-slot', box).forEach((slot) => attachmentsPanel(slot, { type: 'survey', key: String(id), tag: slot.dataset.slot, title: 'Photos', kinds: [['photo', 'Take photo'], ['file', 'Add file']] }));
  };
  const redrawOne = (c, it) => { const m = models.find((x) => x.id === Number(it.model_id)); if (m) $('.svy-draw', c).innerHTML = drawModel(m.kind, it.w || m.def_w, it.h || m.def_h, { colour: it.colour, glass: S.glass_types.find((g) => g.id === Number(it.glass_id))?.name, layout: m.spec?.layout }); };
  box.addEventListener('input', (e) => { const c = e.target.closest('[data-i]'); const k = e.target.dataset.k; if (!c || !k) return; const it = s.items[Number(c.dataset.i)]; it[k] = ['w', 'h', 'qty'].includes(k) ? (e.target.value === '' ? null : num(e.target.value)) : e.target.value; if (['w', 'h'].includes(k)) redrawOne(c, it); later(); });
  box.addEventListener('change', (e) => { const c = e.target.closest('[data-i]'); const k = e.target.dataset.k; if (c && k === 'label_sel') { const it = s.items[Number(c.dataset.i)]; it.label = e.target.value === '__other' ? '' : e.target.value; it.other = e.target.value === '__other'; draw(); later(); return; } if (!c || !['model_id', 'glass_id', 'colour'].includes(k)) return; const it = s.items[Number(c.dataset.i)]; it[k] = k === 'colour' ? e.target.value : e.target.value ? Number(e.target.value) : null; if (k !== 'model_id') redrawOne(c, it); if (k === 'model_id') { const m = models.find((x) => x.id === it.model_id); if (m) { if (!it.w) it.w = m.def_w; if (!it.h) it.h = m.def_h; if (!it.label && !it.note) it.label = ''; } draw(); } later(); });
  box.addEventListener('click', guard(async (e) => { if (e.target.matches('[data-rm]')) { const c = e.target.closest('[data-i]'); if (!await confirmBox('Remove this opening?')) return; s.items.splice(Number(c.dataset.i), 1); if (!s.items.length) s.items.push(blank()); await save(); draw(); } }));
  $('#add', el).onclick = () => { s.items.push(blank()); later(); draw(); box.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  $('#mkq', el)?.addEventListener('click', guard(async () => {
    await save(); const items = s.items.filter((i) => i.model_id || i.w || i.label);
    if (!items.length) return toast('Add at least one opening with a type and size', 'err');
    if (s.quote_no && !await confirmBox(`This survey already became ${s.quote_no}. Create another quotation?`, 'Create another', 'primary')) return;
    const qItems = items.map((i) => {
      const m = models.find((x) => x.id === Number(i.model_id)); const pi = S.price_items.find((p) => p.model_id === Number(i.model_id));
      return { w: i.w, h: i.h, desc: pi?.name || m?.name || i.label || 'Item', note: [i.label, i.note].filter(Boolean).join(' — '), qty: i.qty || 1, price: pi ? priceFor(pi, num(i.w), num(i.h)) : 0, manual: !pi, model_id: i.model_id || null, glass_id: i.glass_id || null, colour: i.colour || '' };
    });
    const q = await api.post('t/quotes', { client: s.client, mobile: s.mobile, site: s.site, date: today(), title: S.settings.intro_line || '', items: qItems, vat_rate: S.settings.vat_rate ?? 10, discount: 0, vat_waived: 0, status: 'draft', notes: `From site survey of ${dmy(s.date)}${s.notes ? ' — ' + s.notes : ''}` });
    await api.put(`t/surveys/${id}`, { quote_no: q.number, status: 'quoted' }); toast(`Created ${q.number} — check the prices`); location.hash = `#/quotes/${q.id}`;
  }));
  draw();
}

async function sheet(el, id) {
  const s = await api.get(`t/surveys/${id}`);
  const rows = (s.items || []).map((i, k) => { const m = S.models.find((x) => x.id === Number(i.model_id)); return `<tr><td>${k + 1}</td><td>${esc(i.label || '')}</td><td>${esc(m?.name || '')}</td><td class="n">${i.w ?? ''} × ${i.h ?? ''}</td><td class="n">${i.qty ?? 1}</td><td>${esc(i.colour || '')} ${esc(S.glass_types.find((g) => g.id === Number(i.glass_id))?.name || '')}</td><td>${esc(i.note || '')}</td></tr>`; }).join('');
  printView(el, { back: `#/surveys/${id}`, html: `${docHeader('SITE MEASUREMENT SHEET', 'ورقة قياسات الموقع')}<div class="meta"><div><b>Customer:</b> ${esc(s.client)}</div><div><b>DATE:</b> ${dmy(s.date)}</div><div><b>Site:</b> ${esc(s.site || '')}</div><div><b>Mobile:</b> ${esc(s.mobile || '')}</div><div><b>Measured by:</b> ${esc(s.surveyor || '')}</div></div><table class="items-print"><thead><tr><th>#</th><th>Where</th><th>Type</th><th class="n">W × H cm</th><th class="n">Qty</th><th>Colour / glass</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>${s.notes ? `<p><b>Notes:</b> ${esc(s.notes)}</p>` : ''}` });
}
