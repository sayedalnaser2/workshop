import { S, refresh, logout } from '../app.js';
import { api, $, esc, toast, guard, num, modal } from '../ui.js';

export async function render(el) {
  const c = S.settings.company || {}; const k = S.settings.counters || {};
  el.innerHTML = `<div class="ph"><h1>Settings</h1><span class="grow"></span><button class="btn" id="logout">Sign out</button></div>
  <div class="cols2" style="align-items:start">
  <div>
   <div class="card"><h3>Company (printed on every document)</h3><div class="form">
     <label class="field"><span>Name</span><input id="c_name" value="${esc(c.name)}"></label><label class="field"><span>Arabic name</span><input id="c_name_ar" value="${esc(c.name_ar)}" dir="rtl"></label>
     <label class="field"><span>CR number</span><input id="c_cr" value="${esc(c.cr)}"></label><label class="field"><span>Email</span><input id="c_email" value="${esc(c.email)}"></label>
     <label class="field full"><span>Phones</span><input id="c_phones" value="${esc(c.phones)}"></label><label class="field full"><span>Address</span><input id="c_address" value="${esc(c.address)}"></label></div></div>
   <div class="card" style="margin-top:14px"><h3>Quotation defaults</h3><div class="form">
     <label class="field"><span>VAT rate %</span><input id="vat" type="number" step="any" value="${S.settings.vat_rate ?? 10}"></label><label class="field"><span>Saw kerf for cutting lists (cm)</span><input id="kerf" type="number" step="any" value="${S.settings.bar_kerf ?? 0.5}"></label>
     <label class="field full"><span>Default heading line</span><input id="intro" value="${esc(S.settings.intro_line)}"></label>
     <label class="field full"><span>Terms &amp; conditions (one per line)</span><textarea id="terms" rows="6">${esc((S.settings.terms || []).join('\n'))}</textarea></label>
     <label class="field full"><span>Receipt notes (one per line)</span><textarea id="rnotes" rows="3">${esc((S.settings.receipt_notes || []).join('\n'))}</textarea></label></div></div>
   <div class="card" style="margin-top:14px"><h3>Next document numbers</h3><div class="form" style="grid-template-columns:repeat(4,1fr)">${[['quote', 'Quotation'], ['invoice', 'Invoice'], ['receipt', 'Receipt'], ['payment', 'Payment']].map(([key, l]) => `<label class="field"><span>${l}</span><input data-c="${key}" type="number" min="1" value="${k[key] || 1}"></label>`).join('')}</div><p class="muted">Quotes look like <b>${esc(S.next.quote)}</b>, invoices <b>${esc(S.next.invoice)}</b>.</p></div>
   <div class="sticky-actions"><button class="btn primary" id="save">Save settings</button></div>
  </div>
  <div>
   <div class="card"><h3>Import from your Excel workbook</h3><p class="muted">Upload <code>TALENTS_….xlsm</code> to load the price list, quotations (the Q… sheets), orders, receipts, payments, purchases, employees and the next-number counters. <b>This replaces the current data of those lists.</b> Models and materials are kept.</p><input type="file" id="xl" accept=".xlsm,.xlsx"><div style="margin-top:10px"><button class="btn" id="imp">Import workbook</button></div><p id="impOut" class="muted"></p></div>
   <div class="card" style="margin-top:14px"><h3>Backup</h3><p class="muted">Download everything as one JSON file. Also copy the <code>data/workshop.db</code> file regularly.</p><a class="btn" href="/api/backup" download>Download backup</a></div>
   <div class="card" style="margin-top:14px"><h3>Change password</h3><div class="form"><label class="field"><span>Current</span><input type="password" id="pw0" autocomplete="current-password"></label><label class="field"><span>New (6+ chars)</span><input type="password" id="pw1" autocomplete="new-password"></label></div><div style="margin-top:10px"><button class="btn" id="pw">Change password</button></div></div>
  </div></div>`;
  $('#logout', el).onclick = logout;
  $('#save', el).onclick = guard(async () => {
    const lines = (v) => v.split('\n').map((x) => x.trim()).filter(Boolean);
    const counters = { ...S.settings.counters };
    for (const i of el.querySelectorAll('[data-c]')) counters[i.dataset.c] = Math.max(1, Math.floor(num(i.value)));
    await api.put('settings', { company: { ...c, name: $('#c_name', el).value, name_ar: $('#c_name_ar', el).value, cr: $('#c_cr', el).value, email: $('#c_email', el).value, phones: $('#c_phones', el).value, address: $('#c_address', el).value }, vat_rate: num($('#vat', el).value), bar_kerf: num($('#kerf', el).value), intro_line: $('#intro', el).value, terms: lines($('#terms', el).value), receipt_notes: lines($('#rnotes', el).value), counters });
    await refresh(); toast('Settings saved'); render(el);
  });
  $('#imp', el).onclick = guard(async () => {
    const f = $('#xl', el).files[0]; if (!f) return toast('Choose the Excel file first', 'err');
    if (!confirm('Replace price list, quotations, orders, receipts, payments, purchases and employees with the contents of this workbook?')) return;
    $('#impOut', el).textContent = 'Importing… this can take up to a minute.';
    const r = await api.upload('import', f); await refresh();
    $('#impOut', el).innerHTML = '<b class="pos">Done:</b> ' + Object.entries(r.imported).map(([k2, v]) => `${v} ${k2.replace('_', ' ')}`).join(', ');
  });
  $('#pw', el).onclick = guard(async () => { await api.post('password', { current: $('#pw0', el).value, password: $('#pw1', el).value }); toast('Password changed'); $('#pw0', el).value = $('#pw1', el).value = ''; });
}
