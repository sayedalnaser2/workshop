// The customer page (client.<domain>): sign in with the order number and the code, then see the progress, the photos and the kitchen model you were allowed to see.
import { scene, draw3D } from './kitchen-3d.js';
import { setColourDefs } from './drawings.js';

const T = {
  en: { title: 'Your order', sub: 'Enter your order number and the code we sent you.', order: 'Order number', code: 'Code', open: 'Open', wrong: 'The order number or the code is not right.', hello: 'Hello', progress: 'Progress of your order', done: 'Your order is complete', stages: 'Stages', todo: 'Not started', doing: 'In progress', fin: 'Done', photos: 'Photos', kitchen: 'Your kitchen model', openDoors: 'Open doors', closeDoors: 'Close doors', turn: 'Drag to turn · scroll or pinch to zoom', out: 'Sign out', noProgress: 'Work has not started yet.', call: 'Questions? Call us', lang: 'العربية', since: 'Order date' },
  ar: { title: 'طلبك', sub: 'أدخل رقم الطلب والرمز الذي أرسلناه لك.', order: 'رقم الطلب', code: 'الرمز', open: 'دخول', wrong: 'رقم الطلب أو الرمز غير صحيح.', hello: 'مرحباً', progress: 'مدى تقدّم طلبك', done: 'تم إنجاز طلبك', stages: 'المراحل', todo: 'لم تبدأ', doing: 'قيد التنفيذ', fin: 'تمّت', photos: 'الصور', kitchen: 'تصميم مطبخك', openDoors: 'فتح الأبواب', closeDoors: 'إغلاق الأبواب', turn: 'اسحب للتدوير · مرّر أو اقرص للتكبير', out: 'تسجيل الخروج', noProgress: 'لم يبدأ العمل بعد.', call: 'للاستفسار اتصل بنا', lang: 'English', since: 'تاريخ الطلب' },
};
let lang = (() => { try { return localStorage.getItem('cl') || ((navigator.language || '').startsWith('ar') ? 'ar' : 'en'); } catch { return 'en'; } })();
const t = (k) => T[lang][k] || k;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const app = document.getElementById('app');
const api = async (path, body) => { const r = await fetch('/api/portal/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.error || 'Error'), { status: r.status }); return d; };
const setLang = (l) => { lang = l; try { localStorage.setItem('cl', l); } catch {} document.documentElement.lang = l; document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'; document.title = t('title'); };

const head = (co) => `<div class="top"><img src="/logo" alt=""><div><b>${esc(lang === 'ar' && co?.name_ar ? co.name_ar : co?.name || '')}</b></div><span class="grow"></span><button id="lang">${t('lang')}</button></div>`;
function login(err = '', pre = {}) {
  setLang(lang);
  app.innerHTML = `${head(null)}<div class="card"><h1>${t('title')}</h1><div class="muted">${t('sub')}</div>
    <label for="o">${t('order')}</label><input id="o" autocomplete="off" autocapitalize="characters" value="${esc(pre.order || '')}"><label for="c">${t('code')}</label><input id="c" inputmode="numeric" autocomplete="off" placeholder="0000 0000">
    <div class="err" id="e">${esc(err)}</div><button class="primary" id="go">${t('open')}</button></div>`;
  document.getElementById('lang').onclick = () => { setLang(lang === 'ar' ? 'en' : 'ar'); login('', { order: document.getElementById('o').value }); };
  const go = async () => { const o = document.getElementById('o').value.trim(); const c = document.getElementById('c').value.trim(); if (!o || !c) return; try { await api('login', { order: o, code: c }); show(); } catch (e) { document.getElementById('e').textContent = e.status === 401 ? t('wrong') : e.message; } };
  document.getElementById('go').onclick = go; for (const id of ['o', 'c']) document.getElementById(id).onkeydown = (e) => { if (e.key === 'Enter') go(); };
}
async function show() {
  let d; try { d = await api('me'); } catch { return login(); }
  setColourDefs(d.colour_defs);
  setLang(lang);
  const pct = d.percent;
  app.innerHTML = `${head(d.company)}
    <div class="card"><div class="muted">${t('hello')}</div><h1>${esc(d.client)}</h1><div class="muted">${t('order')}: <b>${esc(d.inv)}</b>${d.date ? ` · ${t('since')}: ${esc(d.date)}` : ''}</div></div>
    ${d.message ? `<div class="msg">${esc(d.message)}</div>` : ''}
    <div class="card"><h2>${d.done ? t('done') : t('progress')}</h2>${pct == null && !d.done ? `<div class="muted">${t('noProgress')}</div>` : `<div class="pct">${d.done ? 100 : pct}%</div><div class="bar"><i style="width:${d.done ? 100 : pct}%"></i></div>`}
      ${d.stages.length ? `<h2 style="margin-top:18px">${t('stages')}</h2>${d.stages.map((s) => `<div class="stage"><span class="dot ${s.state}">${s.state === 'done' ? '✓' : s.state === 'doing' ? '…' : ''}</span><div style="flex:1"><b>${esc(s.name)}</b> <span class="muted" style="font-size:13px">· ${t(s.state === 'done' ? 'fin' : s.state)}</span><div class="mini"><i style="width:${s.progress}%"></i></div></div></div>`).join('')}` : ''}</div>
    ${d.kitchens.map((k) => `<div class="card"><h2>${t('kitchen')}${d.kitchens.length > 1 ? ' — ' + esc(k.name) : ''}</h2><div class="stage3d"><canvas data-k="${k.id}"></canvas></div><div class="tools"><button data-oc="1">${t('openDoors')}</button><button data-oc="0">${t('closeDoors')}</button><span class="muted" style="font-size:13px;align-self:center">${t('turn')}</span></div></div>`).join('')}
    ${d.photos.length ? `<div class="card"><h2>${t('photos')}</h2><div class="gal">${d.photos.map((p) => `<figure data-p="${p.id}"><img loading="lazy" src="/api/portal/photo/${p.id}" alt="${esc(p.name)}"><figcaption>${esc(p.note || p.date || '')}</figcaption></figure>`).join('')}</div></div>` : ''}
    <div class="muted" style="text-align:center;margin-top:18px">${d.company.phones ? `${t('call')}: <b dir="ltr">${esc(d.company.phones)}</b><br>` : ''}<button id="out" style="margin-top:12px">${t('out')}</button></div>`;
  document.getElementById('lang').onclick = () => { setLang(lang === 'ar' ? 'en' : 'ar'); show(); };
  document.getElementById('out').onclick = async () => { await api('logout', {}); login(); };
  app.querySelectorAll('[data-p]').forEach((f) => (f.onclick = () => { const lb = document.createElement('div'); lb.className = 'lb'; lb.innerHTML = `<img src="/api/portal/photo/${f.dataset.p}" alt=""><button>✕</button>`; lb.onclick = () => lb.remove(); document.body.appendChild(lb); }));
  app.querySelectorAll('canvas[data-k]').forEach((cv) => viewer(cv, Number(cv.dataset.k)));
}
async function viewer(cv, id) {
  let k; try { k = await api('kitchen/' + id); } catch { return cv.closest('.card').remove(); }
  const spec = k.spec; const v = { yaw: -0.55, pitch: 0.45, zoom: 1, selected: null, hover: null }; const open = {}; const stage = cv.parentElement;
  const draw = () => { const dpr = Math.min(2, window.devicePixelRatio || 1); const w = Math.max(320, Math.round(stage.clientWidth * dpr)); const h = Math.max(240, Math.round(stage.clientHeight * dpr)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } draw3D(cv, scene(spec, open), v); };
  const setAll = (val) => { spec.runs.forEach((r, ri) => (r.cabinets || []).forEach((c, ci) => { for (const key of Object.keys(open)) if (key.startsWith(`${ri}|${ci}|`)) delete open[key]; open[`${ri}|${ci}`] = val; })); draw(); };
  stage.parentElement.querySelectorAll('[data-oc]').forEach((b) => (b.onclick = () => setAll(Number(b.dataset.oc))));
  let drag = null; cv.onpointerdown = (e) => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; };
  cv.onpointermove = (e) => { if (!drag) return; v.yaw += (e.clientX - drag.x) * 0.006; v.pitch = Math.max(0.05, Math.min(1.3, v.pitch + (e.clientY - drag.y) * 0.006)); drag = { x: e.clientX, y: e.clientY }; draw(); };
  cv.onpointerup = cv.onpointercancel = () => { drag = null; cv.style.cursor = 'grab'; };
  cv.addEventListener('wheel', (e) => { e.preventDefault(); v.zoom = Math.max(0.5, Math.min(3, v.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); draw(); }, { passive: false });
  new ResizeObserver(draw).observe(stage); draw();
}
(async () => { setLang(lang); try { await api('me'); show(); } catch { login(); } })();
