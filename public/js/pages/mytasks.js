import { S } from '../app.js';
import { api, $, $$, esc, dmy, today, num, toast, guard, modal, badge, confirmBox, formHTML, readForm } from '../ui.js';
import { fmtMin, fmtSec, parseDur, ago, localTime, startTicker, variance } from '../time.js';

const KIND = { start: '▶ started', pause: '⏸ paused', update: '✎', blocked: '⛔ blocked', unblock: '✔ unblocked', done: '✔ finished', reopen: '↺ reopened', time: '⏱ added time', assigned: '👤', created: '＋', estimate: '⏲' };
export const logLine = (l) => `${KIND[l.kind] || ''} ${esc(l.text || '')}${l.progress != null && l.kind === 'update' ? ` <b>(${Math.round(l.progress)}%)</b>` : ''}${l.kind === 'done' && l.minutes != null ? ` <b>(took ${fmtMin(l.minutes)})</b>` : ''}${l.kind === 'time' && l.minutes ? ` <b>(+${fmtMin(l.minutes)})</b>` : ''}`;

let TZ = 180; // workshop time zone (minutes from UTC), set from the shift settings
const hm = (d) => new Date(d.getTime() + TZ * 60000).toISOString().slice(11, 16);
/** Shift state from today's working windows (ISO pairs): off, before, working, break or after. */
function shiftState(sh, now = Date.now()) {
  TZ = sh.cfg.tz;
  const w = sh.windows.map(([a, b]) => [Date.parse(a), Date.parse(b)]);
  if (!w.length) return { key: 'off', text: 'Day off', cls: '' };
  const cur = w.find(([a, b]) => now >= a && now < b); if (cur) return { key: 'working', text: `On shift until ${hm(new Date(cur[1]))}`, cls: 'ok' };
  const next = w.find(([a]) => now < a); if (next) return { key: w[0] === next ? 'before' : 'break', text: w[0] === next ? `Shift starts at ${hm(new Date(next[0]))}` : `Break — back at ${hm(new Date(next[0]))}`, cls: 'warn' };
  return { key: 'after', text: 'Shift finished for today', cls: '' };
}

export async function render(el) {
  let tab = 'open';
  el.innerHTML = '<div id="mt"></div>'; const root = $('#mt', el);
  const draw = async () => {
    const [all, sh] = await Promise.all([api.get('my-tasks'), api.get('shift')]);
    const open = all.filter((t) => t.status !== 'done'); const done = all.filter((t) => t.status === 'done');
    const list = tab === 'open' ? open : done;
    const st = shiftState(sh); const cur = sh.current; const ticking = cur && st.key === 'working';
    const per = (m) => fmtMin(m);
    root.innerHTML = `<div class="ph"><h1>My Tasks</h1><span class="sub">Your time is counted automatically during your shift — just say which task you are on</span></div>
      <div class="card" style="margin-bottom:14px;${st.key === 'working' && !cur ? 'border-color:var(--warn)' : ''}">
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><div>${badge(st.text, st.cls)}<div class="muted" style="font-size:12px;margin-top:4px">Shift ${sh.cfg.start}–${sh.cfg.end}${(sh.cfg.breaks || []).length ? ', break ' + sh.cfg.breaks.map((b) => b.from + '–' + b.to).join(', ') : ''}</div></div>
          <div><div class="muted" style="font-size:12px">On tasks today</div><b style="font-size:20px;font-variant-numeric:tabular-nums" ${ticking ? `data-live data-base="${sh.task_min}"` : ''}>${ticking ? '' : per(sh.task_min)}</b> <span class="muted">of ${per(sh.shift_min)} so far</span></div>
          <div style="flex:1;min-width:200px">${cur ? `<div class="muted" style="font-size:12px">You are on</div><b>${esc(cur.title)}</b> ${ticking ? '<span class="pos">● counting</span>' : '<span class="muted">(paused outside working hours)</span>'}` : st.key === 'working' ? '<b style="color:var(--warn)">You are not on a task — choose one below so your time is recorded.</b>' : '<span class="muted">Not on a task</span>'}</div>
          ${cur ? `<button class="btn" id="off" data-cur="${cur.task_id}">Not on a task</button>` : ''}</div></div>
      <div class="tbar"><div class="seg"><button data-t="open" class="${tab === 'open' ? 'on' : ''}">Open (${open.length})</button><button data-t="done" class="${tab === 'done' ? 'on' : ''}">Finished recently (${done.length})</button></div></div>
      <div class="mgrid" style="grid-template-columns:repeat(auto-fill,minmax(340px,1fr))">${list.map((t) => card(t, cur)).join('') || `<div class="card muted">${tab === 'open' ? 'No open tasks right now.' : 'Nothing finished in the last 3 days.'}</div>`}</div>`;
    $$('.seg button', root).forEach((b) => (b.onclick = () => { tab = b.dataset.t; draw(); }));
    $('#off', root)?.addEventListener('click', guard(async (e) => { await api.post(`tasks/${e.target.dataset.cur}/action`, { action: 'pause', text: 'Not on a task' }); toast('You are not on a task now'); draw(); }));
    startTicker(root);
  };
  const card = (t, cur) => {
    const here = cur && cur.task_id === t.id;
    const due = t.due ? `<span class="badge ${t.due < today() && t.status !== 'done' ? 'bad' : ''}">due ${dmy(t.due)}</span>` : '';
    const pct = Math.round(t.progress || 0);
    const live = here && t.ticking;
    return `<div class="card" data-id="${t.id}" style="display:flex;flex-direction:column;gap:10px;${here ? 'border-color:var(--ok);box-shadow:0 0 0 2px color-mix(in srgb, var(--ok) 30%, transparent)' : ''}">
      <div style="display:flex;gap:8px;align-items:flex-start"><div style="flex:1"><b style="font-size:15px">${esc(t.title)}</b><div class="muted" style="font-size:12px">${[t.order_inv, t.client, t.site].filter(Boolean).map(esc).join(' · ') || 'No order'}</div></div>${t.priority === 'high' ? badge('High', 'bad') : ''}${badge(t.stage || 'Task', 'blue')}</div>
      ${t.description ? `<div style="font-size:13px">${esc(t.description)}</div>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap">${here ? badge('● You are on this', 'ok') : ''}${t.status === 'blocked' ? badge('Blocked', 'bad') : t.status === 'done' ? badge('Done', 'ok') : t.status === 'doing' ? badge('In progress', 'warn') : badge('To do')}${due}${!t.assignee_id ? badge('Not assigned', 'warn') : ''}</div>
      <div><div class="bar" style="height:12px;margin:0"><i style="width:${pct}%;background:var(--ok)"></i></div><div style="display:flex;justify-content:space-between;font-size:12px;margin-top:3px"><span>${pct}% done</span><span class="muted">Estimate ${t.estimate_min ? fmtMin(t.estimate_min) : '—'}</span></div></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="muted">Time on this task</span><b style="font-size:18px;font-variant-numeric:tabular-nums" ${live ? `data-live data-base="${t.actual_min}"` : ''}>${live ? '' : fmtMin(t.actual_min)}</b></div>
      ${t.status === 'done' ? `<div>${variance(t.estimate_min, t.actual_min)}</div>` : ''}
      ${t.running_since && !here ? `<div class="muted" style="font-size:12px">${esc(t.running_by)} is on this task</div>` : ''}
      ${t.status === 'done' ? '' : `<div style="display:flex;gap:6px;flex-wrap:wrap">
        ${here ? '' : '<button class="btn primary" data-a="start">▶ Work on this</button>'}
        <button class="btn" data-a="update">✎ Update</button>${t.status === 'blocked' ? '<button class="btn" data-a="unblock">Unblock</button>' : '<button class="btn" data-a="blocked">⛔ Blocked</button>'}
        <button class="btn" data-a="done" style="margin-left:auto">✔ Done</button></div>`}
      ${t.recent?.length ? `<div style="border-top:1px solid var(--line);padding-top:8px;font-size:12px">${t.recent.map((l) => `<div><span class="muted">${ago(l.ts)} · ${esc(l.user_name)}</span> ${logLine(l)}</div>`).join('')}</div>` : ''}
    </div>`;
  };
  root.addEventListener('click', guard(async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const id = Number(b.closest('[data-id]').dataset.id); const a = b.dataset.a;
    const send = async (body) => { await api.post(`tasks/${id}/action`, body); await draw(); };
    if (['claim', 'start', 'pause', 'unblock'].includes(a)) { await send({ action: a }); toast({ claim: 'Task taken', start: 'You are on this task now — your time is counted automatically', pause: 'Stopped', unblock: 'Unblocked' }[a]); return; }
    const t = (await api.get('my-tasks')).find((x) => x.id === id);
    const cfg = {
      update: { title: 'Progress update', fields: [{ key: 'progress', label: 'How much is done? (%)', type: 'number', default: Math.round(t.progress || 0) }, { key: 'text', label: 'What did you do?', type: 'textarea', full: true }], ok: 'Post update' },
      blocked: { title: 'What is blocking you?', fields: [{ key: 'text', label: 'Reason (waiting for glass, missing hardware…)', type: 'textarea', full: true, required: true }], ok: 'Mark as blocked' },
      done: { title: `Finish “${t.title}”`, fields: [{ key: 'text', label: 'Notes for the office (optional)', type: 'textarea', full: true }], ok: 'Mark as done' },
      time: { title: 'Add time you forgot to record', fields: [{ key: 'min', label: 'How long? (2:30, 1h 15m or minutes)' }, { key: 'text', label: 'What was it for?', full: true }], ok: 'Add time' },
    }[a];
    const w = document.createElement('div'); w.innerHTML = formHTML(cfg.fields, {});
    modal({ title: cfg.title, body: w, buttons: [{ label: 'Cancel' }, { label: cfg.ok, kind: 'primary', onClick: async () => {
      const d = readForm(w, cfg.fields); const body = { action: a === 'time' ? 'add_time' : a, text: d.text || '' };
      if (a === 'update') body.progress = d.progress;
      if (a === 'blocked' && !d.text) { toast('Say what is blocking you', 'err'); return false; }
      if (a === 'time') { const m = parseDur(d.min); if (!m) { toast('Enter the time as 2:30, 1h 15m or minutes', 'err'); return false; } body.minutes = m; }
      await send(body); toast(a === 'done' ? 'Well done — task finished. Pick your next task.' : 'Saved');
    } }] });
  }));
  draw();
  const poll = setInterval(() => { if (!el.isConnected) return clearInterval(poll); if (!document.querySelector('.overlay')) draw(); }, 60000);
}
