import { S } from '../app.js';
import { api, $, $$, esc, dmy, today, guard, badge } from '../ui.js';
import { fmtMin, localTime, localDay, niceDay, variance } from '../time.js';
import { logLine } from './mytasks.js';

const C = { task: '#2f6fb0', idle: '#c9d1dc', ot: '#e08a2b' };
const hrs = (m) => Math.round((m / 60) * 10) / 10;
/** Stacked columns per day: time on tasks, rest of the shift, overtime. */
function dayChart(days, perDay) {
  if (!days.length) return '';
  const tot = days.map((d) => { const rows = perDay.filter((r) => r.day === d); const task = rows.reduce((a, r) => a + r.task_min, 0); const shift = rows.reduce((a, r) => a + r.shift_min, 0); const ot = rows.reduce((a, r) => a + (r.overtime_min || 0), 0); return { d, task, idle: Math.max(0, shift - task), ot }; });
  const max = Math.max(60, ...tot.map((t) => t.task + t.idle + t.ot)); const bw = Math.max(10, Math.min(34, 760 / days.length - 6)); const W = days.length * (bw + 6) + 46; const H = 190; const base = H - 26; const k = (base - 12) / max;
  const bars = tot.map((t, i) => { const x = 40 + i * (bw + 6); let y = base; const seg = (v, c, n) => { const h = v * k; y -= h; return h > 0 ? `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${c}" rx="2"><title>${niceDay(t.d)} — ${n}: ${fmtMin(v)}</title></rect>` : ''; }; return seg(t.task, C.task, 'on tasks') + seg(t.idle, C.idle, 'not on a task') + seg(t.ot, C.ot, 'overtime') + `<text x="${x + bw / 2}" y="${H - 8}" font-size="9" text-anchor="middle" fill="var(--muted)">${t.d.slice(8)}</text>`; }).join('');
  const grid = [0, .5, 1].map((f) => `<line x1="38" x2="${W}" y1="${base - f * (base - 12)}" y2="${base - f * (base - 12)}" stroke="var(--line)"/><text x="34" y="${base - f * (base - 12) + 3}" font-size="9" text-anchor="end" fill="var(--muted)">${hrs(max * f)}h</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMid meet" role="img" aria-label="Hours per day">${grid}${bars}</svg><div class="legend"><span><i style="background:${C.task}"></i>On tasks</span><span><i style="background:${C.idle}"></i>Rest of the shift</span><span><i style="background:${C.ot}"></i>Overtime</span></div>`;
}
/** Horizontal bars: one row per label, with up to three stacked parts. */
function rowsChart(rows) {
  if (!rows.length) return '<p class="muted">No data in this period.</p>';
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((a, p) => a + p.v, 0)));
  return rows.map((r) => `<div style="display:grid;grid-template-columns:130px 1fr 70px;gap:8px;align-items:center;margin:5px 0"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.label)}">${esc(r.label)}</span><div class="bar" style="margin:0;height:16px;background:var(--soft)">${r.parts.map((p) => `<i style="width:${(p.v / max) * 100}%;background:${p.c}" title="${esc(p.n)}: ${fmtMin(p.v)}"></i>`).join('')}</div><span class="muted" style="text-align:right;font-size:12px">${fmtMin(r.parts.reduce((a, p) => a + p.v, 0))}</span></div>`).join('');
}

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
    const shiftMin = sumOf('shift_min'); const taskMin = sumOf('task_min'); const otMin = sumOf('overtime_min'); const otPending = data.overtime.filter((o) => o.status === 'pending').length; const admin = S.me.role === 'admin';
    const byW = {}; for (const r of data.perDay) { const e = (byW[r.user_name] ||= { task: 0, idle: 0, ot: 0 }); e.task += r.task_min; e.idle += Math.max(0, r.shift_min - r.task_min); e.ot += r.overtime_min || 0; }
    const updates = data.logs.filter((l) => l.kind === 'update').length;
    const estDone = data.done.filter((t) => t.estimate_min > 0);
    const estSum = estDone.reduce((s, t) => s + t.estimate_min, 0); const actSum = estDone.reduce((s, t) => s + t.actual_min, 0);
    const vtable = (rows, label) => `<table class="grid"><thead><tr><th>${label}</th><th class="num">Tasks</th><th class="num">Estimated</th><th class="num">Actual</th><th>Vs estimate</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.key)}</td><td class="num">${r.n}</td><td class="num">${r.est ? fmtMin(r.est) : '—'}</td><td class="num">${fmtMin(r.actual)}</td><td>${variance(r.est, r.withEst)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No finished tasks in this period</td></tr>'}</tbody></table>`;
    root.innerHTML = `<div class="ph"><h1>Worker Activity</h1><span class="sub">Who worked on what, for how long, and how that compares with the estimate</span><span class="grow"></span><a class="btn" id="xl" href="/api/activity.xlsx?from=${from}&to=${to}${who ? '&user=' + who : ''}" download>Export to Excel</a></div>
      <div class="tbar"><div class="seg">${Object.keys(RANGES).map((k) => `<button data-r="${k}">${{ today: 'Today', yesterday: 'Yesterday', week: 'Last 7 days', month: 'This month' }[k]}</button>`).join('')}</div>
        <input type="date" id="from" value="${from}" style="width:150px"><span class="muted">to</span><input type="date" id="to" value="${to}" style="width:150px">
        <select id="who" style="width:200px"><option value="">All workers</option>${staff.map((u) => `<option value="${u.id}" ${who === String(u.id) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
      <div class="cards"><div class="card stat"><div class="k">Shift hours (days present)</div><div class="v">${fmtMin(shiftMin)}</div></div><div class="card stat"><div class="k">On tasks</div><div class="v">${fmtMin(taskMin)}</div><div class="muted" style="font-size:12px">${shiftMin ? Math.round((taskMin / shiftMin) * 100) + '% of shift time' : ''}</div></div><div class="card stat"><div class="k">Not on any task</div><div class="v ${shiftMin - taskMin > 60 ? 'neg' : ''}">${fmtMin(Math.max(0, shiftMin - taskMin))}</div></div><div class="card stat"><div class="k">Overtime</div><div class="v ${otMin ? '' : ''}">${fmtMin(otMin)}</div><div class="muted" style="font-size:12px">${otPending ? otPending + ' waiting for approval' : 'all approved'}</div></div><div class="card stat"><div class="k">Tasks finished</div><div class="v">${data.done.length}</div></div><div class="card stat"><div class="k">Progress updates</div><div class="v">${updates}</div></div><div class="card stat"><div class="k">Finished vs estimate</div><div class="v">${estSum ? variance(estSum, actSum) : '—'}</div><div class="muted" style="font-size:12px">${estSum ? `${fmtMin(actSum)} actual / ${fmtMin(estSum)} estimated` : 'no estimates on finished tasks'}</div></div></div>
      <div class="cols2" style="align-items:start;margin-bottom:14px"><div class="card"><h3>Time of work per day</h3>${dayChart(days, data.perDay)}</div><div style="display:flex;flex-direction:column;gap:14px"><div class="card"><h3>Hours by worker</h3>${rowsChart(Object.entries(byW).map(([n, e]) => ({ label: n, parts: [{ v: e.task, c: C.task, n: 'on tasks' }, { v: e.idle, c: C.idle, n: 'not on a task' }, { v: e.ot, c: C.ot, n: 'overtime' }] })))}</div><div class="card"><h3>Hours by stage <span class="muted" style="font-weight:400">(finished tasks)</span></h3>${rowsChart(data.byStage.filter((r) => r.actual > 0).sort((a, b) => b.actual - a.actual).map((r) => ({ label: r.key, parts: [{ v: r.actual, c: C.task, n: 'actual' }] })))}</div></div></div>
      <div class="card" style="margin-bottom:14px"><h3>Hours per day <span class="muted" style="font-weight:400">— time on tasks, out of the shift</span></h3><div class="twrap" style="border:0"><table class="grid"><thead><tr><th>Worker</th>${days.map((d) => `<th class="num">${niceDay(d)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>${Object.entries(grid).map(([n, r]) => `<tr><td><b>${esc(n)}</b></td>${days.map((d) => `<td class="num" title="${esc((r[d]?.tasks || []).map((t) => t.title + ': ' + fmtMin(t.min)).join('\n'))}">${r[d] ? `<b>${fmtMin(r[d].task_min)}</b><div class="muted" style="font-size:11px">of ${fmtMin(r[d].shift_min)}</div>` : '<span class="muted">·</span>'}</td>`).join('')}<td class="num"><b>${fmtMin(days.reduce((a, d) => a + (r[d]?.task_min || 0), 0))}</b><div class="muted" style="font-size:11px">of ${fmtMin(days.reduce((a, d) => a + (r[d]?.shift_min || 0), 0))}</div></td></tr>`).join('') || `<tr><td colspan="${days.length + 2}" class="empty">Nobody was at work in this period</td></tr>`}</tbody></table></div></div>
      <div class="cols2" style="align-items:start"><div class="card"><h3>Activity</h3><div style="max-height:560px;overflow:auto"><table class="grid"><tbody>${data.logs.map((l) => `<tr class="click" onclick="location.hash='#/tasks/${l.task_id}'"><td class="muted" style="white-space:nowrap">${niceDay(localDay(l.ts))}<br>${localTime(l.ts)}</td><td><b>${esc(l.user_name)}</b></td><td><a href="#/tasks/${l.task_id}">${esc(l.title)}</a><div style="font-size:12px">${logLine(l)}</div></td></tr>`).join('') || '<tr><td class="empty">No activity in this period</td></tr>'}</tbody></table></div></div>
      <div style="display:flex;flex-direction:column;gap:14px"><div class="card"><h3>Estimate vs actual by stage</h3>${vtable(data.byStage, 'Stage')}</div><div class="card"><h3>Estimate vs actual by worker</h3>${vtable(data.byWorker, 'Worker')}</div></div></div>
      <div class="card" style="margin-top:14px"><h3>Overtime</h3><table class="grid"><thead><tr><th>Worker</th><th>Day</th><th class="num">Time</th><th>Task</th><th>Note</th><th>Status</th><th></th></tr></thead><tbody>${data.overtime.map((o) => `<tr><td><b>${esc(o.user_name)}</b></td><td>${dmy(o.day)}</td><td class="num">${o.ended || o.kind === 'manual' ? fmtMin(o.minutes) : '<span class="pos">running</span>'}</td><td>${esc(o.title || '')}</td><td class="muted">${esc(o.note || '')}${o.kind === 'manual' ? ' <span class="badge">added by hand</span>' : ''}</td><td>${badge(o.status === 'approved' ? 'Approved' : o.status === 'rejected' ? 'Rejected' : 'Waiting', o.status === 'approved' ? 'ok' : o.status === 'rejected' ? 'bad' : 'warn')}</td><td class="act">${admin ? `${o.status !== 'approved' ? `<button class="btn sm primary" data-ot="approved" data-id="${o.id}">Approve</button> ` : ''}${o.status !== 'rejected' ? `<button class="btn sm" data-ot="rejected" data-id="${o.id}">Reject</button> ` : ''}<button class="btn sm danger" data-otdel="${o.id}">×</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No overtime in this period</td></tr>'}</tbody></table></div>
      <div class="card" style="margin-top:14px"><h3>Finished tasks</h3><table class="grid"><thead><tr><th>Task</th><th>Worker</th><th>Stage</th><th class="num">Estimate</th><th class="num">Actual</th><th>Vs estimate</th></tr></thead><tbody>${data.done.map((t) => `<tr class="click" onclick="location.hash='#/tasks/${t.id}'"><td><b>${esc(t.title)}</b><div class="muted" style="font-size:11px">${esc([t.order_inv, t.client].filter(Boolean).join(' · '))}</div></td><td>${esc(t.assignee_name || '')}</td><td>${esc(t.stage || '')}</td><td class="num">${t.estimate_min ? fmtMin(t.estimate_min) : '—'}</td><td class="num">${fmtMin(t.actual_min)}</td><td>${variance(t.estimate_min, t.actual_min)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">None</td></tr>'}</tbody></table></div>`;
    $$('[data-ot]', root).forEach((b) => (b.onclick = guard(async () => { await api.put(`t/overtime/${b.dataset.id}`, { status: b.dataset.ot }); draw(); })));
    $$('[data-otdel]', root).forEach((b) => (b.onclick = guard(async () => { await api.del(`t/overtime/${b.dataset.otdel}`); draw(); })));
    $$('[data-r]', root).forEach((b) => (b.onclick = () => { [from, to] = RANGES[b.dataset.r](); draw(); }));
    $('#from', root).onchange = (e) => { if (e.target.value) { from = e.target.value; if (from > to) to = from; draw(); } };
    $('#to', root).onchange = (e) => { if (e.target.value) { to = e.target.value; if (to < from) from = to; draw(); } };
    $('#who', root).onchange = (e) => { who = e.target.value; draw(); };
  };
  draw();
}
