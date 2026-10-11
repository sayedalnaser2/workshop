import { S } from '../app.js';
import { api, $, $$, esc, today, dmy, toast, guard, confirmBox, modal, formHTML, readForm, datalist, badge } from '../ui.js';
import { canWrite } from '../perm.js';

export const KINDS = { install: ['Installation', '#2f6fb0'], delivery: ['Delivery', '#b7791f'], survey: ['Site visit / measurement', '#1f8a4c'], maintenance: ['Maintenance / snag', '#8e44ad'], other: ['Other', '#6b7385'] };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const startOfWeek = (s) => addDays(s, -new Date(s + 'T00:00:00Z').getUTCDay());
const monthName = (s) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayLabel = (s) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const hm = (t) => (t || '').slice(0, 5);
const span = (e) => [e.date, e.end_date && e.end_date >= e.date ? e.end_date : e.date];
const onDay = (e, d) => { const [a, b] = span(e); return d >= a && d <= b; };
const timeRange = (e) => (e.start ? hm(e.start) + (e.end ? '–' + hm(e.end) : '') : 'all day');
/** "36645548" → wa.me link with the Bahrain code added when the number has 8 digits. */
export const waLink = (mobile, text) => { let n = String(mobile || '').replace(/\D/g, ''); if (n.length === 8) n = '973' + n; return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : ''; };

export async function render(el) {
  const manage = canWrite(S.me.role, 'events'); let view = sessionStorage.getItem('cal-view') || 'month'; let cur = today();
  const draw = async () => {
    const [events, staff, due] = await Promise.all([api.get('t/events'), api.get('staff'), (S.me.role === 'worker' ? api.get('my-tasks') : api.get('tasks-view')).catch(() => [])]);
    const tasks = due.filter((t) => t.due && t.status !== 'done' && !t.hidden);
    const name = (id) => staff.find((u) => u.id === Number(id))?.name || '';
    const chip = (e) => { const k = KINDS[e.kind] || KINDS.other; return `<a class="ev ${e.status === 'done' ? 'done' : e.status === 'cancelled' ? 'cancelled' : ''}" data-ev="${e.id}" style="--c:${k[1]}" title="${esc(k[0])} — ${esc([e.client, e.site].filter(Boolean).join(', '))}"><b>${esc(e.start ? hm(e.start) : '')}</b> ${esc(e.title)}${e.client ? `<small> · ${esc(e.client)}</small>` : ''}</a>`; };
    const taskChip = (t) => `<a class="ev tk" href="#/${S.me.role === 'worker' ? 'mytasks/' + t.id : 'tasks/' + t.id}" title="Task due">⚑ ${esc(t.title)}</a>`;
    let body = '';
    if (view === 'month') {
      const first = cur.slice(0, 8) + '01'; const gridStart = startOfWeek(first); const m = cur.slice(0, 7);
      const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)); const off = (S.settings.shift?.days || [0, 1, 2, 3, 4, 6]);
      body = `<div class="cal month"><div class="cal-h">${DAYS.map((d) => `<div>${d}</div>`).join('')}</div><div class="cal-g">${cells.map((d) => `<div class="cal-d ${d.slice(0, 7) !== m ? 'out' : ''} ${d === today() ? 'today' : ''} ${!off.includes(new Date(d + 'T00:00:00Z').getUTCDay()) ? 'weekend' : ''}" data-day="${d}"><span class="dn">${+d.slice(8)}</span>${events.filter((e) => onDay(e, d)).map(chip).join('')}${tasks.filter((t) => t.due === d).slice(0, 3).map(taskChip).join('')}</div>`).join('')}</div></div>`;
    } else if (view === 'week') {
      const ws = startOfWeek(cur);
      body = `<div class="cal week">${Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => `<div class="cal-d ${d === today() ? 'today' : ''}" data-day="${d}"><div class="wk-h">${dayLabel(d)}</div>${events.filter((e) => onDay(e, d)).sort((a, b) => (a.start || '').localeCompare(b.start || '')).map((e) => `<div class="wk-ev">${chip(e)}<div class="muted" style="font-size:11px">${esc(timeRange(e))}${e.site ? ' · ' + esc(e.site) : ''}${(e.team || []).length ? '<br>' + esc(e.team.map(name).filter(Boolean).join(', ')) : ''}</div></div>`).join('') || '<div class="muted" style="font-size:12px;padding:6px 2px">—</div>'}${tasks.filter((t) => t.due === d).map(taskChip).join('')}</div>`).join('')}</div>`;
    } else {
      const from = today(); const list = events.filter((e) => span(e)[1] >= from && e.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''));
      body = `<div class="card"><table class="grid"><thead><tr><th>Date</th><th>Time</th><th>What</th><th>Customer / site</th><th>Team</th><th>Status</th></tr></thead><tbody>${list.map((e) => `<tr class="click" data-ev="${e.id}"><td><b>${dayLabel(e.date)}</b>${e.end_date && e.end_date > e.date ? ` → ${dayLabel(e.end_date)}` : ''}</td><td>${esc(timeRange(e))}</td><td><span class="dot" style="background:${(KINDS[e.kind] || KINDS.other)[1]}"></span> <b>${esc(e.title)}</b><div class="muted" style="font-size:11px">${esc((KINDS[e.kind] || KINDS.other)[0])}${e.order_inv ? ' · ' + esc(e.order_inv) : ''}</div></td><td>${esc([e.client, e.site].filter(Boolean).join(' — '))}</td><td>${esc((e.team || []).map(name).filter(Boolean).join(', ') || '—')}</td><td>${badge(e.status || 'planned', e.status === 'done' ? 'ok' : '')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nothing scheduled.</td></tr>'}</tbody></table></div>`;
    }
    const step = view === 'month' ? 'month' : 'week';
    el.innerHTML = `<div class="ph"><h1>Calendar</h1><span class="sub">${S.me.role === 'worker' ? 'The jobs you are on' : 'Installations, deliveries and site visits — who is where'}</span><span class="grow"></span>${manage ? '<button class="btn primary" id="newEv">+ Add to calendar</button>' : ''}</div>
      <div class="tbar"><div class="seg"><button data-v="month" class="${view === 'month' ? 'on' : ''}">Month</button><button data-v="week" class="${view === 'week' ? 'on' : ''}">Week</button><button data-v="list" class="${view === 'list' ? 'on' : ''}">Upcoming</button></div>${view !== 'list' ? `<button class="btn" id="prev">‹</button><button class="btn" id="todayB">Today</button><button class="btn" id="next">›</button><b style="font-size:16px">${view === 'month' ? monthName(cur) : `${dayLabel(startOfWeek(cur))} – ${dayLabel(addDays(startOfWeek(cur), 6))}`}</b>` : ''}<span class="grow"></span><span class="legend">${Object.values(KINDS).map(([l, c]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join('')}</span></div>${body}`;
    $$('[data-v]', el).forEach((b) => (b.onclick = () => { view = b.dataset.v; sessionStorage.setItem('cal-view', view); draw(); }));
    const move = (n) => { const d = new Date(cur + 'T00:00:00Z'); if (step === 'month') { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); } else d.setUTCDate(d.getUTCDate() + 7 * n); cur = iso(d); draw(); };
    $('#prev', el)?.addEventListener('click', () => move(-1)); $('#next', el)?.addEventListener('click', () => move(1)); $('#todayB', el)?.addEventListener('click', () => { cur = today(); draw(); });
    $('#newEv', el)?.addEventListener('click', () => openEventDialog({ date: view === 'list' ? today() : cur, staff, events, onSaved: draw }));
    el.onclick = (e) => {
      const c = e.target.closest('[data-ev]'); if (c) { e.preventDefault(); return openEventDialog({ event: events.find((x) => x.id === Number(c.dataset.ev)), staff, events, onSaved: draw }); }
      const d = e.target.closest('[data-day]'); if (d && manage && !e.target.closest('a')) openEventDialog({ date: d.dataset.day, staff, events, onSaved: draw });
    };
  };
  draw();
}

/** Create / edit / view a calendar event. Warns when a team member is already booked. */
export async function openEventDialog({ event = null, date = today(), order = null, staff = null, events = null, onSaved }) {
  const manage = canWrite(S.me.role, 'events');
  staff ||= await api.get('staff'); events ||= await api.get('t/events').catch(() => []);
  const ledger = manage ? await api.get('ledger').catch(() => []) : [];
  const e = event || { date, end_date: '', start: '08:00', end: '', kind: order ? 'install' : 'install', title: '', order_inv: order?.inv || '', client: order?.client || '', site: order?.site || '', mobile: order?.mobile || '', team: [], status: 'planned', note: '' };
  if (order && !event) e.title = `Install — ${order.client}`;
  const team = new Set((e.team || []).map(Number));
  const fields = [
    { key: 'title', label: 'What', required: true, full: true }, { key: 'kind', label: 'Type', type: 'select', options: Object.entries(KINDS).map(([k, v]) => [k, v[0]]) }, { key: 'status', label: 'Status', type: 'select', options: [['planned', 'Planned'], ['done', 'Done'], ['cancelled', 'Cancelled']] },
    { key: 'date', label: 'Date', type: 'date' }, { key: 'end_date', label: 'Until (multi-day jobs)', type: 'date' }, { key: 'start', label: 'Starts', type: 'time' }, { key: 'end', label: 'Ends', type: 'time' },
    { key: 'order_inv', label: 'Order / invoice', list: 'dl-evo' }, { key: 'client', label: 'Customer' }, { key: 'site', label: 'Site / address' }, { key: 'mobile', label: 'Customer mobile' }, { key: 'note', label: 'Notes for the team', type: 'textarea', full: true },
  ];
  const w = document.createElement('div');
  w.innerHTML = datalist('dl-evo', ledger.map((o) => o.inv)) + formHTML(fields, e) + `<div class="field" style="margin-top:12px"><span>Team</span><div class="teamsel">${staff.map((u) => `<label><input type="checkbox" data-u="${u.id}" ${team.has(u.id) ? 'checked' : ''}> ${esc(u.name)}</label>`).join('')}</div></div><p class="err" id="conf"></p>`;
  const f = (k) => $(`[name=${k}]`, w);
  if (!manage) $$('input,select,textarea', w).forEach((x) => (x.disabled = true));
  f('order_inv').addEventListener('change', () => { const o = ledger.find((x) => x.inv === f('order_inv').value.trim()); if (o) { if (!f('client').value) f('client').value = o.client; if (!f('site').value) f('site').value = o.site || ''; if (!f('mobile').value) f('mobile').value = o.mobile || ''; } });
  const read = () => { const d = readForm(w, fields); d.team = $$('[data-u]', w).filter((x) => x.checked).map((x) => Number(x.dataset.u)); if (d.end_date && d.end_date < d.date) d.end_date = ''; return d; };
  const clash = (d) => {
    const out = [];
    for (const o of events) {
      if (event && o.id === event.id || o.status === 'cancelled' || d.status === 'cancelled') continue;
      if (!(d.date <= span(o)[1] && (d.end_date || d.date) >= span(o)[0])) continue;
      const shared = (o.team || []).map(Number).filter((id) => d.team.includes(id)); if (!shared.length) continue;
      if (d.start && o.start && d.end && o.end && !(d.start < o.end && o.start < d.end)) continue;
      out.push(`${shared.map((id) => staff.find((u) => u.id === id)?.name).filter(Boolean).join(', ')} already on “${o.title}” (${dmy(o.date)}, ${timeRange(o)})`);
    }
    return out;
  };
  const wa = e.mobile ? waLink(e.mobile, `Dear ${e.client || 'customer'}, our team will ${e.kind === 'delivery' ? 'deliver to' : e.kind === 'survey' ? 'visit' : 'be at'} ${e.site || 'your site'} on ${dayLabel(e.date)}${e.start ? ' at ' + hm(e.start) : ''}. ${S.settings.company?.name || ''} ${S.settings.company?.phones?.split('|')[0] || ''}`) : '';
  modal({ title: event ? (manage ? 'Edit calendar entry' : e.title) : 'Add to calendar', body: w, wide: true, buttons: [
    ...(event && manage ? [{ label: 'Delete', kind: 'danger', onClick: async () => { if (!await confirmBox('Delete this calendar entry?')) return false; await api.del(`t/events/${event.id}`); toast('Deleted'); onSaved?.(); } }] : []),
    ...(wa ? [{ label: 'WhatsApp the customer', close: false, onClick: () => { window.open(wa, '_blank', 'noopener'); } }] : []),
    { label: manage ? 'Cancel' : 'Close' },
    ...(manage ? [{ label: 'Save', kind: 'primary', onClick: async () => {
      const d = read(); if (!d.title) { toast('Say what it is', 'err'); return false; } if (!d.date) { toast('Pick the date', 'err'); return false; }
      if (d.start && d.end && d.end <= d.start) { toast('The end time must be after the start', 'err'); return false; }
      const c = clash(d); if (c.length && !await confirmBox(c.join('\n') + '\n\nSave anyway?', 'Save anyway', 'primary')) return false;
      event ? await api.put(`t/events/${event.id}`, d) : await api.post('t/events', d); toast('Saved'); onSaved?.();
    } }] : []),
  ] });
}
