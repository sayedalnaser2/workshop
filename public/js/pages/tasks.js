import { S } from '../app.js';
import { api, $, $$, esc, dmy, today, toast, guard, confirmBox, dataTable, badge, modal, formHTML, readForm } from '../ui.js';
import { fmtMin, parseDur, ago, localTime, localDay, variance, startTicker, fmtSec } from '../time.js';
import { openTaskForm, addStandardTasks } from '../task-form.js';
import { logLine } from './mytasks.js';

const ST = { todo: ['To do', ''], doing: ['In progress', 'warn'], blocked: ['Blocked', 'bad'], done: ['Done', 'ok'] };

export async function render(el, [id]) {
  if (id) return detail(el, Number(id));
  let assignee = '';
  const draw = async () => {
    const all = await api.get('tasks-view'); const staff = await api.get('staff');
    const rows = assignee ? all.filter((t) => String(t.assignee_id || 'none') === assignee) : all;
    el.innerHTML = `<div class="ph"><h1>Tasks</h1><span class="sub">What needs doing, who is on it, and how long it takes compared with the estimate</span><span class="grow"></span><button class="btn" id="std">Add standard tasks…</button><button class="btn primary" id="new">+ New task</button></div>
      <div class="cards"><div class="card stat"><div class="k">Being worked on now</div><div class="v ${rows.some((t) => t.ticking) ? 'pos' : ''}">${rows.filter((t) => t.ticking).length}</div></div><div class="card stat"><div class="k">Open</div><div class="v">${rows.filter((t) => t.status !== 'done').length}</div></div><div class="card stat"><div class="k">Blocked</div><div class="v ${rows.some((t) => t.status === 'blocked') ? 'neg' : ''}">${rows.filter((t) => t.status === 'blocked').length}</div></div><div class="card stat"><div class="k">Overdue</div><div class="v ${rows.some((t) => t.due && t.due < today() && t.status !== 'done') ? 'neg' : ''}">${rows.filter((t) => t.due && t.due < today() && t.status !== 'done').length}</div></div></div>
      <div id="t"></div>`;
    const sel = `<select id="who" style="width:200px"><option value="">Everyone</option><option value="none" ${assignee === 'none' ? 'selected' : ''}>Not assigned</option>${staff.map((u) => `<option value="${u.id}" ${assignee === String(u.id) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>`;
    const t = $('#t', el);
    dataTable(t, {
      rows, search: ['title', 'order_inv', 'client', 'assignee_name', 'stage'], page: 50, toolbar: sel, empty: 'No tasks yet — create one, or open an order and add the standard tasks.',
      cols: [
        { key: 'title', label: 'Task', render: (r) => `<b>${esc(r.title)}</b><div class="muted" style="font-size:11px">${[r.order_inv, r.client].filter(Boolean).map(esc).join(' · ')}</div>` },
        { key: 'stage', label: 'Stage' }, { key: 'assignee_name', label: 'Assigned to', render: (r) => `<select class="qa" data-id="${r.id}" style="min-width:150px" title="Change who is on this task"><option value="">— nobody —</option>${staff.map((u) => `<option value="${u.id}" ${r.assignee_id === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>${r.team_names?.length ? `<div class="muted" style="font-size:11px">+ ${esc(r.team_names.join(', '))}</div>` : ''}` },
        { key: 'status', label: 'Status', render: (r) => badge(...ST[r.status]) + (r.ticking ? ' <span class="pos" title="someone is on it right now">●</span>' : '') },
        { key: 'progress', label: 'Progress', render: (r) => `<div class="bar" style="height:10px;margin:0;width:90px"><i style="width:${Math.round(r.progress || 0)}%;background:var(--ok)"></i></div><small class="muted">${Math.round(r.progress || 0)}%</small>` },
        { key: 'estimate_min', label: 'Estimate', num: true, render: (r) => (r.estimate_min ? fmtMin(r.estimate_min) : '—') },
        { key: 'actual_min', label: 'Actual', num: true, render: (r) => fmtMin(r.actual_min) },
        { key: 'v', label: 'Vs estimate', render: (r) => (r.status === 'done' || r.actual_min > 0 ? variance(r.estimate_min, r.actual_min) : ''), sort: (r) => (r.estimate_min ? r.actual_min / r.estimate_min : 0) },
        { key: 'due', label: 'Due', render: (r) => (r.due ? `<span class="${r.due < today() && r.status !== 'done' ? 'neg' : ''}">${dmy(r.due)}</span>` : '') },
      ],
      filters: [{ label: 'Open', fn: (r) => r.status !== 'done' }, { label: 'Being worked on', fn: (r) => r.ticking }, { label: 'Blocked', fn: (r) => r.status === 'blocked' }, { label: 'Done', fn: (r) => r.status === 'done' }, { label: 'All' }],
      onRow: (r) => (location.hash = `#/tasks/${r.id}`),
    });
    t.addEventListener('change', guard(async (e) => { if (!e.target.matches('select.qa')) return; await api.put(`t/tasks/${e.target.dataset.id}`, { assignee_id: e.target.value ? Number(e.target.value) : null }); toast(e.target.value ? 'Assigned' : 'Unassigned'); draw(); }));
    $('#who', el).onchange = (e) => { assignee = e.target.value; draw(); };
    $('#new', el).onclick = () => openTaskForm({ onSaved: draw });
    $('#std', el).onclick = guard(async () => {
      const orders = (await api.get('ledger')).filter((o) => !o.done);
      const w = document.createElement('div'); w.innerHTML = `<label class="field"><span>Order / invoice</span><select id="so">${orders.map((o) => `<option value="${esc(o.inv)}">${esc(o.inv)} — ${esc(o.client)}</option>`).join('')}</select></label><p class="muted">Creates: ${(S.settings.task_templates || []).map((x) => esc(x.stage)).join(', ')} — with estimates from your past averages (or the template times from Settings).</p>`;
      modal({ title: 'Add standard tasks', body: w, buttons: [{ label: 'Cancel' }, { label: 'Add', kind: 'primary', onClick: async () => { await addStandardTasks($('#so', w).value, draw); } }] });
    });
  };
  draw();
}

async function detail(el, id) {
  const { task: t, logs, sessions } = await api.get(`tasks/${id}`);
  const staff = await api.get('staff');
  const running = !!t.ticking;
  el.innerHTML = `<div class="ph"><h1>${esc(t.title)}</h1>${badge(...ST[t.status])}${running ? badge(`● ${t.running_by} is on it now`, 'ok') : t.running_since ? badge(`${t.running_by} is on it (outside working hours)`, '') : ''}<span class="sub">${[t.order_inv, t.client, t.site].filter(Boolean).map(esc).join(' · ')}</span><span class="grow"></span><a class="btn" href="#/tasks">← All tasks</a></div>
  <div class="cards"><div class="card stat"><div class="k">Assigned to</div><select id="lead" style="margin-top:4px"><option value="">— nobody —</option>${staff.map((u) => `<option value="${u.id}" ${t.assignee_id === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>${t.team_names?.length ? `<div class="muted" style="font-size:12px;margin-top:4px">Team: ${esc(t.team_names.join(', '))}</div>` : ''}</div><div class="card stat"><div class="k">Progress</div><div class="v">${Math.round(t.progress || 0)}%</div></div><div class="card stat"><div class="k">Estimate</div><div class="v">${t.estimate_min ? fmtMin(t.estimate_min) : '—'}</div></div><div class="card stat"><div class="k">Actual time</div><div class="v" ${running ? `data-live data-base="${t.actual_min}"` : ''}>${running ? '' : fmtMin(t.actual_min)}</div><div>${variance(t.estimate_min, t.actual_min)}</div></div></div>
  ${t.description ? `<div class="card" style="margin-bottom:14px"><b>Details</b><p style="margin:6px 0 0">${esc(t.description)}</p></div>` : ''}
  <div class="cols2" style="align-items:start"><div class="card"><h3>Timeline</h3><table class="grid"><tbody>${logs.map((l) => `<tr><td style="white-space:nowrap" class="muted">${new Date(l.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${localTime(l.ts)}</td><td><b>${esc(l.user_name)}</b></td><td>${logLine(l)}</td></tr>`).join('') || '<tr><td class="empty">Nothing yet</td></tr>'}</tbody></table></div>
  <div class="card"><h3>Time on this task <span class="muted" style="font-weight:400">(counted automatically during shifts)</span></h3><table class="grid"><thead><tr><th>Worker</th><th>Went on the task</th><th>Left it</th><th class="num">Time counted</th></tr></thead><tbody>${sessions.map((s) => `<tr><td>${esc(s.user_name)}${s.kind === 'manual' ? ' <span class="muted">(added manually)</span>' : ''}</td><td>${dmy(localDay(s.started))} ${localTime(s.started)}</td><td>${s.ended ? localTime(s.ended) : '<span class="pos">still on it</span>'}</td><td class="num">${fmtMin(s.minutes)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No time recorded yet</td></tr>'}</tbody><tfoot><tr><td colspan="3">Total</td><td class="num">${fmtMin(t.actual_min)}</td></tr></tfoot></table></div></div>
  <div class="sticky-actions"><button class="btn primary" id="edit">Edit task</button><button class="btn" id="note">Add a note</button><button class="btn" id="time">+ Add time</button>${t.status === 'done' ? '<button class="btn" id="reopen">Re-open</button>' : '<button class="btn" id="done">Mark done</button>'}<button class="btn danger" id="del">Delete</button></div>`;
  startTicker(el);
  $('#lead', el).onchange = guard(async (e) => { await api.put(`t/tasks/${id}`, { assignee_id: e.target.value ? Number(e.target.value) : null }); toast('Assignment saved'); detail(el, id); });
  const act = (body) => api.post(`tasks/${id}/action`, body).then(() => detail(el, id));
  $('#edit', el).onclick = () => openTaskForm({ task: t, onSaved: () => detail(el, id) });
  const ask = (title, fields, ok, build) => { const w = document.createElement('div'); w.innerHTML = formHTML(fields, {}); modal({ title, body: w, buttons: [{ label: 'Cancel' }, { label: ok, kind: 'primary', onClick: async () => { const b = build(readForm(w, fields)); if (!b) return false; await act(b); } }] }); };
  $('#note', el).onclick = () => ask('Add a note', [{ key: 'text', label: 'Note (the worker sees it on their task)', type: 'textarea', full: true }], 'Add', (d) => (d.text ? { action: 'update', text: d.text } : (toast('Write the note', 'err'), null)));
  $('#time', el).onclick = () => ask('Add time manually', [{ key: 'min', label: 'Duration (2:30, 1h 15m or minutes)' }, { key: 'text', label: 'Reason' }], 'Add time', (d) => { const m = parseDur(d.min); return m ? { action: 'add_time', minutes: m, text: d.text } : (toast('Enter the duration', 'err'), null); });
  $('#done', el)?.addEventListener('click', guard(() => act({ action: 'done' })));
  $('#reopen', el)?.addEventListener('click', guard(() => act({ action: 'reopen' })));
  $('#del', el).onclick = guard(async () => { if (await confirmBox(`Delete “${t.title}” with its history?`)) { await api.del(`t/tasks/${id}`); location.hash = '#/tasks'; } });
}
