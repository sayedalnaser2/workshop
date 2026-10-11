import { S } from '../app.js';
import { api, $, $$, esc, dmy, today, guard, badge } from '../ui.js';
import { fmtMin, localTime, localDay, niceDay, variance } from '../time.js';
import { logLine } from './mytasks.js';

const iso = (d) => d.toLocaleDateString('en-CA');
const RANGES = {
  today: () => [iso(new Date()), iso(new Date())],
  yesterday: () => { const d = new Date(Date.now() - 864e5); return [iso(d), iso(d)]; },
  week: () => [iso(new Date(Date.now() - 6 * 864e5)), iso(new Date())],
  month: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)]; },
};

export async function render(el) {
  let [from, to] = RANGES.week(); let who = '';
  const staff = (await api.get('staff')).filter((u) => u.role === 'worker' || true);
  el.innerHTML = '<div id="ac"></div>'; const root = $('#ac', el);
  const draw = async () => {
    const data = await api.get(`activity?from=${encodeURIComponent(new Date(from + 'T00:00:00').toISOString())}&to=${encodeURIComponent(new Date(to + 'T23:59:59.999').toISOString())}${who ? '&user=' + who : ''}`);
    const days = []; for (let d = new Date(from + 'T12:00:00'); iso(d) <= to && days.length < 31; d = new Date(d.getTime() + 864e5)) days.push(iso(d));
    const grid = {};
    for (const r of data.perDay) (grid[r.user_name] ||= {})[r.day] = r;
    const sumOf = (k) => data.perDay.reduce((a, r) => a + r[k], 0);
    const shiftMin = sumOf('shift_min'); const taskMin = sumOf('task_min');
    const updates = data.logs.filter((l) => l.kind === 'update').length;
    const estDone = data.done.filter((t) => t.estimate_min > 0);
    const estSum = estDone.reduce((s, t) => s + t.estimate_min, 0); const actSum = estDone.reduce((s, t) => s + t.actual_min, 0);
    const vtable = (rows, label) => `<table class="grid"><thead><tr><th>${label}</th><th class="num">Tasks</th><th class="num">Estimated</th><th class="num">Actual</th><th>Vs estimate</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.key)}</td><td class="num">${r.n}</td><td class="num">${r.est ? fmtMin(r.est) : '—'}</td><td class="num">${fmtMin(r.actual)}</td><td>${variance(r.est, r.withEst)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No finished tasks in this period</td></tr>'}</tbody></table>`;
    root.innerHTML = `<div class="ph"><h1>Worker Activity</h1><span class="sub">Who worked on what, for how long, and how that compares with the estimate</span></div>
      <div class="tbar"><div class="seg">${Object.keys(RANGES).map((k) => `<button data-r="${k}">${{ today: 'Today', yesterday: 'Yesterday', week: 'Last 7 days', month: 'This month' }[k]}</button>`).join('')}</div>
        <input type="date" id="from" value="${from}" style="width:150px"><span class="muted">to</span><input type="date" id="to" value="${to}" style="width:150px">
        <select id="who" style="width:200px"><option value="">All workers</option>${staff.map((u) => `<option value="${u.id}" ${who === String(u.id) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
      <div class="cards"><div class="card stat"><div class="k">Shift hours (days present)</div><div class="v">${fmtMin(shiftMin)}</div></div><div class="card stat"><div class="k">On tasks</div><div class="v">${fmtMin(taskMin)}</div><div class="muted" style="font-size:12px">${shiftMin ? Math.round((taskMin / shiftMin) * 100) + '% of shift time' : ''}</div></div><div class="card stat"><div class="k">Not on any task</div><div class="v ${shiftMin - taskMin > 60 ? 'neg' : ''}">${fmtMin(Math.max(0, shiftMin - taskMin))}</div></div><div class="card stat"><div class="k">Tasks finished</div><div class="v">${data.done.length}</div></div><div class="card stat"><div class="k">Progress updates</div><div class="v">${updates}</div></div><div class="card stat"><div class="k">Finished vs estimate</div><div class="v">${estSum ? variance(estSum, actSum) : '—'}</div><div class="muted" style="font-size:12px">${estSum ? `${fmtMin(actSum)} actual / ${fmtMin(estSum)} estimated` : 'no estimates on finished tasks'}</div></div></div>
      <div class="card" style="margin-bottom:14px"><h3>Hours per day <span class="muted" style="font-weight:400">— time on tasks, out of the shift</span></h3><div class="twrap" style="border:0"><table class="grid"><thead><tr><th>Worker</th>${days.map((d) => `<th class="num">${niceDay(d)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>${Object.entries(grid).map(([n, r]) => `<tr><td><b>${esc(n)}</b></td>${days.map((d) => `<td class="num" title="${esc((r[d]?.tasks || []).map((t) => t.title + ': ' + fmtMin(t.min)).join('\n'))}">${r[d] ? `<b>${fmtMin(r[d].task_min)}</b><div class="muted" style="font-size:11px">of ${fmtMin(r[d].shift_min)}</div>` : '<span class="muted">·</span>'}</td>`).join('')}<td class="num"><b>${fmtMin(days.reduce((a, d) => a + (r[d]?.task_min || 0), 0))}</b><div class="muted" style="font-size:11px">of ${fmtMin(days.reduce((a, d) => a + (r[d]?.shift_min || 0), 0))}</div></td></tr>`).join('') || `<tr><td colspan="${days.length + 2}" class="empty">Nobody was at work in this period</td></tr>`}</tbody></table></div></div>
      <div class="cols2" style="align-items:start"><div class="card"><h3>Activity</h3><div style="max-height:560px;overflow:auto"><table class="grid"><tbody>${data.logs.map((l) => `<tr class="click" onclick="location.hash='#/tasks/${l.task_id}'"><td class="muted" style="white-space:nowrap">${niceDay(localDay(l.ts))}<br>${localTime(l.ts)}</td><td><b>${esc(l.user_name)}</b></td><td><a href="#/tasks/${l.task_id}">${esc(l.title)}</a><div style="font-size:12px">${logLine(l)}</div></td></tr>`).join('') || '<tr><td class="empty">No activity in this period</td></tr>'}</tbody></table></div></div>
      <div style="display:flex;flex-direction:column;gap:14px"><div class="card"><h3>Estimate vs actual by stage</h3>${vtable(data.byStage, 'Stage')}</div><div class="card"><h3>Estimate vs actual by worker</h3>${vtable(data.byWorker, 'Worker')}</div></div></div>
      <div class="card" style="margin-top:14px"><h3>Finished tasks</h3><table class="grid"><thead><tr><th>Task</th><th>Worker</th><th>Stage</th><th class="num">Estimate</th><th class="num">Actual</th><th>Vs estimate</th></tr></thead><tbody>${data.done.map((t) => `<tr class="click" onclick="location.hash='#/tasks/${t.id}'"><td><b>${esc(t.title)}</b><div class="muted" style="font-size:11px">${esc([t.order_inv, t.client].filter(Boolean).join(' · '))}</div></td><td>${esc(t.assignee_name || '')}</td><td>${esc(t.stage || '')}</td><td class="num">${t.estimate_min ? fmtMin(t.estimate_min) : '—'}</td><td class="num">${fmtMin(t.actual_min)}</td><td>${variance(t.estimate_min, t.actual_min)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">None</td></tr>'}</tbody></table></div>`;
    $$('[data-r]', root).forEach((b) => (b.onclick = () => { [from, to] = RANGES[b.dataset.r](); draw(); }));
    $('#from', root).onchange = (e) => { if (e.target.value) { from = e.target.value; if (from > to) to = from; draw(); } };
    $('#to', root).onchange = (e) => { if (e.target.value) { to = e.target.value; if (to < from) from = to; draw(); } };
    $('#who', root).onchange = (e) => { who = e.target.value; draw(); };
  };
  draw();
}
