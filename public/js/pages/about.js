import { S, refresh } from '../app.js';
import { api, $, esc, toast, guard } from '../ui.js';

export async function render(el) {
  const c = S.settings.company || {}; const a = S.settings.about || { text: '', services: [], mission: '' }; const admin = S.me.role === 'admin';
  const sh = S.settings.shift || {};
  el.innerHTML = `<div class="ph"><h1>About Us</h1><span class="grow"></span>${admin ? '<button class="btn" id="edit">Edit this page</button>' : ''}</div>
    <div class="card" style="max-width:900px"><div style="display:flex;gap:22px;align-items:center;flex-wrap:wrap"><img src="/logo?v=${S.settings.logo?.v || 0}" alt="" style="height:96px;max-width:300px;object-fit:contain;background:#fff;border-radius:8px;padding:6px;border:1px solid var(--line)"><div><h2 style="font-size:24px">${esc(c.name || '')}</h2><div dir="rtl" style="font-size:18px;margin-top:4px">${esc(c.name_ar || '')}</div></div></div>
      ${a.text ? `<p style="font-size:15px;line-height:1.6;white-space:pre-line;margin:18px 0 0">${esc(a.text)}</p>` : '<p class="muted" style="margin:18px 0 0">The admin can write a short description of the company here.</p>'}
      ${a.mission ? `<div style="margin-top:14px;padding:10px 14px;border-left:4px solid var(--brand-2);background:var(--soft);border-radius:4px"><b>Our promise</b><div style="white-space:pre-line">${esc(a.mission)}</div></div>` : ''}
      ${(a.services || []).length ? `<h3 style="margin:18px 0 6px">What we do</h3><ul style="margin:0;padding-left:20px;line-height:1.7">${a.services.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <h3 style="margin:18px 0 6px">Contact</h3><div class="form" style="grid-template-columns:repeat(2,1fr)">${[['Phone', c.phones], ['Email', c.email], ['Address', c.address], ['Commercial registration', c.cr], ['VAT number', c.vat_no], ['Working hours', sh.start ? `${sh.start} – ${sh.end}` : '']].filter((x) => x[1]).map(([k, v]) => `<div><span class="muted">${k}</span><br><b>${esc(v)}</b></div>`).join('')}</div></div>`;
  fetch('/healthz').then((r) => r.json()).then((h) => { const d = document.createElement('p'); d.className = 'muted'; d.style.cssText = 'font-size:12px;margin-top:18px'; d.textContent = `Version: ${h.commit || '—'} · built ${h.built ? String(h.built).replace('T', ' ').slice(0, 16) : '—'}`; $('.card', el)?.appendChild(d); }).catch(() => {});
  $('#edit', el)?.addEventListener('click', () => {
    el.innerHTML = `<div class="ph"><h1>Edit About Us</h1></div><div class="card" style="max-width:900px"><div class="form" style="grid-template-columns:1fr"><label class="field"><span>About the company</span><textarea id="a_text" rows="6">${esc(a.text)}</textarea></label><label class="field"><span>Our promise (optional)</span><textarea id="a_mis" rows="3">${esc(a.mission)}</textarea></label><label class="field"><span>What we do — one per line</span><textarea id="a_srv" rows="6">${esc((a.services || []).join('\n'))}</textarea></label></div><p class="muted">The name, logo, phone and address come from Settings.</p><div style="display:flex;gap:8px"><button class="btn primary" id="save">Save</button><button class="btn" id="cancel">Cancel</button></div></div>`;
    $('#cancel', el).onclick = () => render(el);
    $('#save', el).onclick = guard(async () => { await api.put('settings', { about: { text: $('#a_text', el).value.trim(), mission: $('#a_mis', el).value.trim(), services: $('#a_srv', el).value.split('\n').map((x) => x.trim()).filter(Boolean) } }); await refresh(); toast('Saved'); render(el); });
  });
}
