// Small UI toolkit: API client, formatting, modal, toast, form + table helpers.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
export const money = (n, d = 3) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const qty = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const today = () => new Date().toISOString().slice(0, 10);
export const dmy = (d) => (d ? d.split('-').reverse().join('/') : '');
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ------------------------------------------------------------------ API
async function call(method, url, body, raw) {
  const res = await fetch('/api/' + url, { method, headers: body && !raw ? { 'Content-Type': 'application/json' } : {}, body: raw ? body : body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && !url.startsWith('login') && !url.startsWith('me')) { window.dispatchEvent(new Event('auth-lost')); throw new Error('Signed out'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
export const api = {
  get: (u) => call('GET', u), post: (u, b) => call('POST', u, b), put: (u, b) => call('PUT', u, b), del: (u) => call('DELETE', u), upload: (u, file) => call('POST', u, file, true),
};

// ------------------------------------------------------------------ toast + modal
export function toast(msg, kind = 'ok') {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = msg; box.appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 6000 : 2800);
}
export const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, 'err'); } };

export function modal({ title, body, wide = false, buttons = [], onClose }) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><header><h3>${esc(title)}</h3><button class="icon x" aria-label="Close">×</button></header><div class="mbody"></div><footer></footer></div>`;
  const mb = $('.mbody', ov);
  if (typeof body === 'string') mb.innerHTML = body; else mb.appendChild(body);
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $('.x', ov).onclick = close;
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  const foot = $('footer', ov);
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.kind || ''); el.textContent = b.label;
    el.onclick = guard(async () => { const r = await b.onClick?.(close, ov); if (r !== false && b.close !== false) close(); });
    foot.appendChild(el);
  }
  if (!buttons.length) foot.remove();
  document.body.appendChild(ov);
  const first = $('input:not([type=hidden]),select,textarea', mb); first?.focus();
  return { close, el: ov };
}
export const confirmBox = (msg, label = 'Delete', kind = 'danger') => new Promise((resolve) => {
  modal({ title: 'Please confirm', body: `<p>${esc(msg)}</p>`, onClose: () => resolve(false), buttons: [{ label: 'Cancel', onClick: () => { resolve(false); } }, { label, kind, onClick: () => { resolve(true); } }] });
});

// ------------------------------------------------------------------ forms
/** fields: [{key,label,type:text|number|date|select|textarea|check,options,list,step,required,full,hint}] */
export function formHTML(fields, v = {}) {
  return `<div class="form">${fields.map((f) => {
    const val = v[f.key] ?? f.default ?? '';
    const id = 'f_' + f.key;
    let input;
    if (f.type === 'select') input = `<select id="${id}" name="${f.key}">${(f.options || []).map((o) => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
    else if (f.type === 'textarea') input = `<textarea id="${id}" name="${f.key}" rows="${f.rows || 3}">${esc(val)}</textarea>`;
    else if (f.type === 'check') input = `<input type="checkbox" id="${id}" name="${f.key}" ${val ? 'checked' : ''}>`;
    else input = `<input id="${id}" name="${f.key}" type="${f.type || 'text'}" value="${esc(val)}" ${f.step ? `step="${f.step}"` : f.type === 'number' ? 'step="any"' : ''} ${f.list ? `list="${f.list}"` : ''} ${f.required ? 'required' : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} autocomplete="off">`;
    return `<label class="field ${f.full ? 'full' : ''} ${f.type === 'check' ? 'check' : ''}"><span>${esc(f.label)}</span>${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
  }).join('')}</div>`;
}
export function readForm(root, fields) {
  const out = {};
  for (const f of fields) {
    const el = root.querySelector(`[name="${f.key}"]`); if (!el) continue;
    out[f.key] = f.type === 'check' ? (el.checked ? 1 : 0) : f.type === 'number' ? (el.value === '' ? null : num(el.value)) : el.value.trim();
  }
  return out;
}
export const datalist = (id, values) => `<datalist id="${id}">${[...new Set(values.filter(Boolean))].map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;

/** Open a create/edit form modal for a generic table row. */
export function editRow({ table, title, fields, row = null, extra = '', defaults = {}, onSaved, before, setup }) {
  const wrap = document.createElement('div');
  wrap.innerHTML = formHTML(fields, row || defaults) + extra;
  setup?.(wrap);
  modal({
    title, body: wrap, buttons: [
      { label: 'Cancel', close: true },
      {
        label: row ? 'Save changes' : 'Create', kind: 'primary', onClick: async () => {
          for (const f of fields) if (f.required && !wrap.querySelector(`[name="${f.key}"]`).value.trim()) { toast(`${f.label} is required`, 'err'); return false; }
          let data = readForm(wrap, fields);
          if (before) data = before(data, wrap) || data;
          const base = table === 'users' ? 'users' : `t/${table}`;
          const saved = row ? await api.put(`${base}/${row.id}`, data) : await api.post(base, data);
          toast(row ? 'Saved' : 'Created');
          await onSaved?.(saved);
        },
      },
    ],
  });
}

// ------------------------------------------------------------------ data table
/**
 * cols: [{key,label,render?(row)->html, num?:bool, sort?:fn(row)->value, class?}]
 * opts: {rows, search:[keys], page:100, onRow(row), actions(row)->html, foot(rowsFiltered)->html, filters:[{label,fn}]}
 */
export function dataTable(el, { cols, rows, search = [], page = 100, onRow, actions, foot, filters = [], empty = 'Nothing here yet.', toolbar = '', filterKey = '' }) {
  let q = ''; let sortKey = null; let dir = 1; let pg = 0; let fi = 0;
  // a dashboard card can ask for a filter once, e.g. sessionStorage 'flt:orders' = 'Unpaid'
  if (filterKey) { try { const want = sessionStorage.getItem(`flt:${filterKey}`); sessionStorage.removeItem(`flt:${filterKey}`); const i = filters.findIndex((f) => f.label === want); if (i > 0) fi = i; } catch {} }
  el.innerHTML = `<div class="tbar"><input type="search" class="search" placeholder="Search…" aria-label="Search">${filters.length ? `<div class="seg">${filters.map((f, i) => `<button data-f="${i}" class="${i === fi ? 'on' : ''}">${esc(f.label)}</button>`).join('')}</div>` : ''}<span class="count"></span><span class="grow"></span>${toolbar}</div><div class="twrap"><table class="grid"><thead></thead><tbody></tbody><tfoot></tfoot></table></div><div class="pager"></div>`;
  const body = $('tbody', el); const head = $('thead', el); const tf = $('tfoot', el); const pager = $('.pager', el);
  const view = () => {
    let list = rows;
    if (filters[fi]?.fn) list = list.filter(filters[fi].fn);
    if (q) { const s = q.toLowerCase(); list = list.filter((r) => search.some((k) => String(r[k] ?? '').toLowerCase().includes(s))); }
    if (sortKey) { const c = cols.find((x) => x.key === sortKey); const f = c.sort || ((r) => r[c.key]); list = [...list].sort((a, b) => { const x = f(a), y = f(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; }); }
    return list;
  };
  const draw = () => {
    const list = view(); const pages = Math.max(1, Math.ceil(list.length / page)); pg = Math.min(pg, pages - 1);
    head.innerHTML = `<tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''} ${sortKey === c.key ? (dir > 0 ? 'asc' : 'desc') : ''}" data-k="${c.key}">${esc(c.label)}</th>`).join('')}${actions ? '<th></th>' : ''}</tr>`;
    const slice = list.slice(pg * page, pg * page + page);
    body.innerHTML = slice.length ? slice.map((r, i) => `<tr data-i="${i}" class="${onRow ? 'click' : ''}">${cols.map((c) => `<td class="${c.num ? 'num' : ''} ${c.class || ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}${actions ? `<td class="act">${actions(r)}</td>` : ''}</tr>`).join('') : `<tr><td colspan="${cols.length + 1}" class="empty">${esc(empty)}</td></tr>`;
    tf.innerHTML = foot ? foot(list) : '';
    $('.count', el).textContent = `${list.length} ${list.length === 1 ? 'row' : 'rows'}`;
    pager.innerHTML = pages > 1 ? `<button class="btn sm" data-p="-1" ${pg === 0 ? 'disabled' : ''}>‹ Prev</button><span>Page ${pg + 1} of ${pages}</span><button class="btn sm" data-p="1" ${pg >= pages - 1 ? 'disabled' : ''}>Next ›</button>` : '';
    body.onclick = (e) => {
      if (e.target.closest('select,input')) return;
      const tr = e.target.closest('tr[data-i]'); if (!tr) return;
      const row = slice[Number(tr.dataset.i)];
      const btn = e.target.closest('[data-act]');
      if (btn) { e.stopPropagation(); el.dispatchEvent(new CustomEvent('act', { detail: { act: btn.dataset.act, row } })); } else onRow?.(row);
    };
  };
  $('.search', el).oninput = (e) => { q = e.target.value; pg = 0; draw(); };
  head.onclick = (e) => { const th = e.target.closest('th[data-k]'); if (!th) return; dir = sortKey === th.dataset.k ? -dir : 1; sortKey = th.dataset.k; draw(); };
  pager.onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) { pg += Number(b.dataset.p); draw(); } };
  $$('.seg button', el).forEach((b) => (b.onclick = () => { fi = Number(b.dataset.f); $$('.seg button', el).forEach((x) => x.classList.toggle('on', x === b)); pg = 0; draw(); }));
  draw();
  return { redraw: draw, setRows: (r) => { rows = r; draw(); } };
}

/** Benefit / cheque payments need their number: show the right label, mark it required, and check it on save. */
export const REF_LABEL = { Benefit: 'Benefit number', Cheque: 'Cheque number' };
export function wireRef(root, methodSel = '[name=method]', refSel = '[name=ref]') {
  const m = root.querySelector(methodSel); const r = root.querySelector(refSel); if (!m || !r) return;
  const lab = r.closest('label'); const sp = lab.querySelector('span');
  const sync = () => { const l = REF_LABEL[m.value]; lab.hidden = !l; r.required = !!l; if (l) { sp.textContent = l + ' *'; r.placeholder = l; } };
  m.addEventListener('change', () => { sync(); if (REF_LABEL[m.value]) r.focus(); }); sync();
}
export function requireRef(d, root) {
  const l = REF_LABEL[d.method];
  if (l && !String(d.ref || '').trim()) { root?.querySelector('[name=ref],#ref')?.focus(); throw new Error(`${l} is required when paying by ${d.method}.`); }
  if (!l) d.ref = '';
  return d;
}
export const badge = (text, kind = '') => `<span class="badge ${kind}">${esc(text)}</span>`;
export const iconBtn = (act, label, cls = '') => `<button class="btn sm ${cls}" data-act="${act}">${label}</button>`;
