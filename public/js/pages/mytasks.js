import { S } from '../app.js';
import { api, $, $$, esc, dmy, today, num, toast, guard, modal, badge, confirmBox, formHTML, readForm } from '../ui.js';
import { fmtMin, fmtSec, parseDur, ago, localTime, startTicker, variance } from '../time.js';
import { drawModel } from '../drawings.js';
import { quotePieces } from '../stock.js';
import { kitchenModel } from '../kitchen.js';
import { elevationSVG } from '../kitchen-draw.js';
import { computeModel } from '../calc.js';
import { dot } from './stock.js';

const KIND = { hidden: '🙈', start: '▶ started', pause: '⏸ paused', update: '✎', blocked: '⛔ blocked', unblock: '✔ unblocked', done: '✔ finished', reopen: '↺ reopened', time: '⏱ added time', assigned: '👤', created: '＋', estimate: '⏲' };
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

/** One click handler for the action buttons (Work on this / Update / Blocked / Done …), shared by the list and the job sheet. */
function bindActions(root, redraw, getTask) {
  root.addEventListener('click', guard(async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const id = Number(b.closest('[data-id]').dataset.id); const a = b.dataset.a;
    const send = async (body) => { await api.post(`tasks/${id}/action`, body); await redraw(); };
    if (['claim', 'start', 'pause', 'unblock'].includes(a)) { await send({ action: a }); toast({ claim: 'Task taken', start: 'You are on this task now — your time is counted automatically', pause: 'Stopped', unblock: 'Unblocked' }[a]); return; }
    const t = await getTask(id);
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
}

export async function render(el, [jobId]) {
  if (jobId) return jobSheet(el, Number(jobId));
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
    return `<div class="card" data-id="${t.id}" title="Open the job details" style="cursor:pointer;display:flex;flex-direction:column;gap:10px;${here ? 'border-color:var(--ok);box-shadow:0 0 0 2px color-mix(in srgb, var(--ok) 30%, transparent)' : ''}">
      <div style="display:flex;gap:8px;align-items:flex-start"><div style="flex:1"><a href="#/mytasks/${t.id}" style="font-size:15px;font-weight:700;color:inherit">${esc(t.title)}</a><div class="muted" style="font-size:12px">${[t.order_inv, t.client, t.site].filter(Boolean).map(esc).join(' · ') || 'No order'}</div></div>${t.priority === 'high' ? badge('High', 'bad') : ''}${badge(t.stage || 'Task', 'blue')}</div>
      ${t.description ? `<div style="font-size:13px">${esc(t.description)}</div>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap">${here ? badge('● You are on this', 'ok') : ''}${t.status === 'blocked' ? badge('Blocked', 'bad') : t.status === 'done' ? badge('Done', 'ok') : t.status === 'doing' ? badge('In progress', 'warn') : badge('To do')}${due}${!t.assignee_id ? badge('Not assigned', 'warn') : ''}</div>
      <div><div class="bar" style="height:12px;margin:0"><i style="width:${pct}%;background:var(--ok)"></i></div><div style="display:flex;justify-content:space-between;font-size:12px;margin-top:3px"><span>${pct}% done</span><span class="muted">Estimate ${t.estimate_min ? fmtMin(t.estimate_min) : '—'}</span></div></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="muted">Time on this task</span><b style="font-size:18px;font-variant-numeric:tabular-nums" ${live ? `data-live data-base="${t.actual_min}"` : ''}>${live ? '' : fmtMin(t.actual_min)}</b></div>
      ${t.status === 'done' ? `<div>${variance(t.estimate_min, t.actual_min)}</div>` : ''}
      ${t.running_since && !here ? `<div class="muted" style="font-size:12px">${esc(t.running_by)} is on this task</div>` : ''}
      ${t.status === 'done' ? '' : `<div style="display:flex;gap:6px;flex-wrap:wrap">
        <a class="btn" href="#/mytasks/${t.id}">📋 Job details</a>${here ? '' : '<button class="btn primary" data-a="start">▶ Work on this</button>'}
        <button class="btn" data-a="update">✎ Update</button>${t.status === 'blocked' ? '<button class="btn" data-a="unblock">Unblock</button>' : '<button class="btn" data-a="blocked">⛔ Blocked</button>'}
        <button class="btn" data-a="done" style="margin-left:auto">✔ Done</button></div>`}
      ${t.recent?.length ? `<div style="border-top:1px solid var(--line);padding-top:8px;font-size:12px">${t.recent.map((l) => `<div><span class="muted">${ago(l.ts)} · ${esc(l.user_name)}</span> ${logLine(l)}</div>`).join('')}</div>` : ''}
    </div>`;
  };
  bindActions(root, draw, async (id) => (await api.get('my-tasks')).find((x) => x.id === id));
  // clicking a card (anywhere except its buttons) opens the job sheet
  root.addEventListener('click', (e) => { const c = e.target.closest('.card[data-id]'); if (c && !e.target.closest('button,a,input,select,textarea')) location.hash = `#/mytasks/${c.dataset.id}`; });
  draw();
  const poll = setInterval(() => { if (!el.isConnected) return clearInterval(poll); if (!document.querySelector('.overlay')) draw(); }, 60000);
}

const r1 = (n) => Math.round(n * 10) / 10;
const countBy = (arr, f) => { const m = new Map(); for (const x of arr) m.set(f(x), (m.get(f(x)) || 0) + 1); return [...m.entries()]; };

/** Everything the worker needs to do the job: where, what to make (drawings, sizes, colour, glass), cut sizes, materials, notes. */
async function jobSheet(el, id) {
  const [{ task: t, logs }, sh, quotes, kitchens0] = await Promise.all([api.get(`tasks/${id}`), api.get('shift'), api.get('t/quotes'), api.get('t/kitchens')]);
  const q = t.quote_no ? quotes.find((x) => x.number === t.quote_no) : null;
  const here = sh.current && sh.current.task_id === t.id; const live = here && t.ticking; const pct = Math.round(t.progress || 0);
  const lib = { profiles: S.profiles, accessories: S.accessories };
  const glassName = (gid) => S.glass_types.find((g) => g.id === Number(gid))?.name || '';
  let n = 0;
  const items = (q?.items || []).map((it, i) => {
    if (it.kind === 'note') return `<div style="font-weight:700;margin:14px 0 6px">${esc(it.desc)}</div>`;
    n++;
    const m = S.models.find((x) => x.id === Number(it.model_id)); const colour = it.colour || q.colour || '';
    const calc = m && it.w > 0 && it.h > 0 ? computeModel(m, it.w, it.h, lib) : null;
    const cut = calc ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-weight:600">Cut sizes for one piece</summary>
      <table class="grid" style="margin-top:6px"><thead><tr><th>Piece</th><th class="num">Length</th><th class="num">Qty</th></tr></thead><tbody>${calc.profiles.filter((p) => Number.isFinite(p.length)).map((p) => `<tr><td>${esc(p.label)}<div class="muted" style="font-size:11px">${esc(p.profile?.name || '')}</div></td><td class="num"><b>${r1(p.length)} cm</b></td><td class="num">${p.qty}</td></tr>`).join('')}</tbody></table>
      ${calc.glass.length ? `<table class="grid" style="margin-top:6px"><thead><tr><th>Glass</th><th class="num">Size</th><th class="num">Qty</th></tr></thead><tbody>${calc.glass.filter((g) => Number.isFinite(g.w)).map((g) => `<tr><td>${esc(g.label)}</td><td class="num"><b>${r1(g.w)} × ${r1(g.h)} cm</b></td><td class="num">${g.qty}</td></tr>`).join('')}</tbody></table>` : ''}
      ${calc.accessories.length ? `<div class="muted" style="font-size:12px;margin-top:6px">Hardware: ${calc.accessories.filter((a) => Number.isFinite(a.qty)).map((a) => `${esc(a.accessory?.name || a.label)} × ${fmtQty(a.qty)}`).join(', ')}</div>` : ''}</details>` : '';
    return `<div class="card" style="display:grid;grid-template-columns:150px 1fr;gap:14px;margin-bottom:10px">
      <div style="text-align:center">${m ? drawModel(m.kind, it.w, it.h) : '<div class="muted" style="padding:30px 0">No drawing</div>'}</div>
      <div><div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap"><b style="font-size:16px">#${n} ${esc(it.desc)}</b><span class="badge blue">× ${fmtQty(it.qty)}</span></div>
        <div style="font-size:18px;margin:4px 0"><b>${it.w ? fmtQty(it.w) : '?'} × ${it.h ? fmtQty(it.h) : '?'} cm</b> <span class="muted" style="font-size:12px">width × height</span></div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px">${colour ? `<span>Colour: ${dot(colour)}</span>` : ''}${it.glass_id ? `<span>Glass: <b>${esc(glassName(it.glass_id))}</b></span>` : ''}${m ? `<span class="muted">Model: ${esc(m.name)}</span>` : ''}</div>
        ${it.note ? `<div style="margin-top:6px;padding:6px 8px;background:var(--soft);border-radius:6px;font-size:13px;white-space:pre-line">${esc(it.note)}</div>` : ''}${cut}</div></div>`;
  }).join('');

  // a kitchen designed for this order
  const kits = kitchens0.filter((x) => (t.order_inv && x.order_inv === t.order_inv) || (q && x.quote_no === q.number));
  const kitchenHtml = kits.map((kk) => { const m = kitchenModel(kk.spec || {}); return `<div class="card" style="margin-top:14px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h3 style="margin:0">🍳 Kitchen: ${esc(kk.name)}</h3><span class="muted">base ${fmtQty(m.meters.base)} m · wall ${fmtQty(m.meters.wall)} m · tall ${fmtQty(m.meters.tall)} m · ${m.sheets.carcass.sheets.length + m.sheets.door.sheets.length + m.sheets.back.sheets.length} sheets</span><span class="grow"></span><a class="btn sm" href="#/kitchens/${kk.id}">Open the cut list &amp; production sheet</a></div><div style="margin-top:8px;overflow-x:auto;color:inherit">${elevationSVG(kk.spec || {}, { maxW: 700 })}</div>${kk.notes ? `<p style="margin:6px 0 0"><b>Notes:</b> ${esc(kk.notes)}</p>` : ''}</div>`; }).join('');
  // totals for the whole job
  let mats = '';
  if (q) {
    const pieces = quotePieces(q, S.models, lib);
    const prof = {}; for (const p of pieces.filter((x) => x.kind === 'profile')) (prof[`${p.profile_id}|${p.colour}`] ||= { id: p.profile_id, colour: p.colour, list: [] }).list.push(p.length);
    const gl = pieces.filter((x) => x.kind === 'glass'); const ac = {}; for (const a of pieces.filter((x) => x.kind === 'accessory' && x.accessory_id)) ac[a.accessory_id] = (ac[a.accessory_id] || 0) + a.qty;
    mats = `<div class="card" style="margin-top:14px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h3 style="margin:0">Materials for the whole job</h3><span class="grow"></span><a class="btn sm" href="#/cutting/${q.id}">Open the cutting list (uses leftovers)</a></div>
      ${Object.values(prof).map((g) => { const pr = S.profiles.find((x) => x.id === g.id); return `<div style="margin-top:10px"><b>${esc(pr ? `${pr.series || ''} ${pr.name}` : 'Profile')}</b> ${g.colour ? '· ' + dot(g.colour) : ''} <span class="muted">${g.list.length} pieces · ${r1(g.list.reduce((a, b) => a + b, 0))} cm in total</span><div style="font-size:13px;margin-top:2px">${countBy(g.list.sort((a, b) => b - a), (x) => x).map(([len, c]) => `<span class="badge" style="margin:2px 4px 2px 0">${len} cm × ${c}</span>`).join('')}</div></div>`; }).join('')}
      ${gl.length ? `<div style="margin-top:12px"><b>Glass</b><div style="font-size:13px;margin-top:2px">${countBy(gl, (g) => `${glassName(g.glass_id) || 'Glass'} — ${g.w} × ${g.h} cm`).map(([k, c]) => `<span class="badge" style="margin:2px 4px 2px 0">${esc(k)} × ${c}</span>`).join('')}</div></div>` : ''}
      ${Object.keys(ac).length ? `<div style="margin-top:12px"><b>Hardware</b><div style="font-size:13px;margin-top:2px">${Object.entries(ac).map(([aid, qn]) => `<span class="badge" style="margin:2px 4px 2px 0">${esc(S.accessories.find((x) => x.id === Number(aid))?.name || 'Item')} × ${Math.ceil(qn)}</span>`).join('')}</div></div>` : ''}</div>`;
  }

  el.innerHTML = `<div id="job"><div class="ph"><a class="btn" href="#/mytasks">← My tasks</a><h1>${esc(t.title)}</h1>${badge(t.stage || 'Task', 'blue')}${t.priority === 'high' ? badge('High priority', 'bad') : ''}${t.status === 'blocked' ? badge('Blocked', 'bad') : t.status === 'done' ? badge('Done', 'ok') : ''}</div>
    <div class="card" data-id="${t.id}" style="margin-bottom:14px">
      <div class="cols2" style="gap:18px;align-items:start"><div>
        <div style="font-size:12px" class="muted">Customer / site</div><div style="font-size:16px"><b>${esc(t.client || '—')}</b>${t.site ? ` — ${esc(t.site)}` : ''}</div>
        <div class="muted" style="font-size:13px;margin-top:2px">${[t.order_inv && 'Order ' + t.order_inv, (t.team_names?.length || t.assignee_name) && 'Team: ' + [t.assignee_name, ...(t.team_names || [])].filter(Boolean).join(', '), q && 'Quotation ' + q.number, t.due && 'Due ' + dmy(t.due)].filter(Boolean).map(esc).join(' · ')}</div>
        ${t.description ? `<div style="margin-top:10px;padding:8px 10px;border-left:4px solid var(--brand-2);background:var(--soft);border-radius:4px"><b>Instructions</b><div style="white-space:pre-line">${esc(t.description)}</div></div>` : ''}
        ${q?.title ? `<div class="muted" style="margin-top:8px;font-size:13px">${esc(q.title)}</div>` : ''}
        ${!q ? '<p class="muted" style="margin-top:10px">This task is not linked to a quotation, so there is no item list. Follow the instructions above.</p>' : ''}</div>
      <div><div class="bar" style="height:12px;margin:0"><i style="width:${pct}%;background:var(--ok)"></i></div><div style="display:flex;justify-content:space-between;font-size:12px;margin:3px 0 10px"><span>${pct}% done</span><span class="muted">Estimate ${t.estimate_min ? fmtMin(t.estimate_min) : '—'}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="muted">Time on this task</span><b style="font-size:20px;font-variant-numeric:tabular-nums" ${live ? `data-live data-base="${t.actual_min}"` : ''}>${live ? '' : fmtMin(t.actual_min)}</b></div>
        ${t.status === 'done' ? '' : `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px">${here ? badge('● You are on this task', 'ok') : '<button class="btn primary" data-a="start">▶ Work on this</button>'}<button class="btn" data-a="update">✎ Update</button>${t.status === 'blocked' ? '<button class="btn" data-a="unblock">Unblock</button>' : '<button class="btn" data-a="blocked">⛔ Blocked</button>'}<button class="btn" data-a="done" style="margin-left:auto">✔ Done</button></div>`}</div></div></div>
    ${kitchenHtml}
    ${q ? `<h3 style="margin:18px 0 8px">What to make <span class="muted" style="font-weight:400">(${n} item${n === 1 ? '' : 's'})</span></h3>${items || '<div class="card muted">The quotation has no items.</div>'}${mats}` : ''}
    <div class="card" style="margin-top:14px"><h3>Updates</h3><table class="grid"><tbody>${logs.map((l) => `<tr><td class="muted" style="white-space:nowrap">${ago(l.ts)}</td><td><b>${esc(l.user_name)}</b></td><td>${logLine(l)}</td></tr>`).join('') || '<tr><td class="empty">No updates yet</td></tr>'}</tbody></table></div></div>`;
  startTicker(el);
  bindActions($('#job', el), () => jobSheet(el, id), async () => t);
}
const fmtQty = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
