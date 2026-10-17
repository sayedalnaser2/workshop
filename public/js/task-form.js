import { S } from './app.js';
import { api, $, esc, today, toast, modal, formHTML, readForm, datalist, guard } from './ui.js';
import { parseDur, durText, fmtMin } from './time.js';

export const STAGES = () => S.settings.task_stages || ['Cutting', 'Assembly', 'Glazing', 'Delivery', 'Installation', 'Other'];

/** Average finished time per stage, from past tasks — a hint for the estimate field. */
export async function stageAverages() {
  const rows = await api.get('tasks-view'); const m = {};
  for (const t of rows.filter((x) => x.status === 'done' && x.actual_min > 0)) { const e = (m[t.stage || ''] ||= { n: 0, sum: 0 }); e.n++; e.sum += t.actual_min; }
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { n: v.n, avg: v.sum / v.n }]));
}

export async function openTaskForm({ task = null, order_inv = '', onSaved }) {
  const [staff, orders, avgs] = await Promise.all([api.get('staff'), api.get('ledger'), stageAverages()]);
  const fields = [
    { key: 'title', label: 'Task', required: true, full: true, placeholder: 'e.g. Cut and assemble the sliding windows' },
    { key: 'order_inv', label: 'Order / invoice', list: 'dl-ord' },
    { key: 'stage', label: 'Stage', type: 'select', options: STAGES() },
    { key: 'assignee_id', label: 'Assign to', type: 'select', options: [['', '— nobody yet (workers can take it) —'], ...staff.map((u) => [u.id, `${u.name} (${u.role})`])] },
    { key: 'est', label: 'Time estimate', placeholder: '2:30  or  2h 30m  or  90' },
    { key: 'due', label: 'Due date', type: 'date' },
    { key: 'priority', label: 'Priority', type: 'select', options: [['urgent', '🔥 Urgent'], ['high', 'High'], ['normal', 'Normal'], ['low', 'Low']] },
    { key: 'description', label: 'Details for the worker', type: 'textarea', full: true },
  ];
  const v = task ? { ...task, est: durText(task.estimate_min), assignee_id: task.assignee_id ?? '' } : { stage: STAGES()[0], priority: 'normal', order_inv, assignee_id: '' };
  const w = document.createElement('div');
  const team0 = new Set((task?.team || []).map(Number));
  w.innerHTML = datalist('dl-ord', orders.filter((o) => !o.done).map((o) => o.inv)) + formHTML(fields, v) + `<div class="field full" style="margin-top:12px"><span>Also working on it (team) — they see it on their own list and their time adds up on this task</span><div id="team" style="display:flex;gap:6px 14px;flex-wrap:wrap">${staff.map((u) => `<label style="display:flex;gap:5px;align-items:center"><input type="checkbox" value="${u.id}" ${team0.has(u.id) ? 'checked' : ''} style="width:auto">${esc(u.name)}</label>`).join('')}</div></div><p class="muted" id="hint" style="margin:8px 0 0"></p>`;
  const hint = () => { const a = avgs[$('[name=stage]', w).value]; $('#hint', w).textContent = a ? `Past ${$('[name=stage]', w).value} tasks took ${fmtMin(a.avg)} on average (${a.n} finished).` : ''; };
  $('[name=stage]', w).onchange = hint; hint();
  modal({
    title: task ? 'Edit task' : 'New task', body: w, wide: true, buttons: [{ label: 'Cancel' }, {
      label: task ? 'Save' : 'Create task', kind: 'primary', onClick: async () => {
        const d = readForm(w, fields); if (!d.title) { toast('Give the task a name', 'err'); return false; }
        const est = parseDur(d.est); if (d.est && est == null) { toast('Estimate: use 2:30, 2h 30m or minutes', 'err'); return false; }
        const body = { title: d.title, order_inv: d.order_inv, stage: d.stage, assignee_id: d.assignee_id ? Number(d.assignee_id) : null, team: [...w.querySelectorAll('#team input:checked')].map((x) => Number(x.value)).filter((id) => id !== Number(d.assignee_id)), estimate_min: est, due: d.due, priority: d.priority, description: d.description };
        const saved = task ? await api.put(`t/tasks/${task.id}`, body) : await api.post('t/tasks', body);
        toast(task ? 'Task saved' : 'Task created'); onSaved?.(saved);
      },
    }],
  });
}

/** One task per standard stage for an order (estimates from past averages, else the template). */
export async function addStandardTasks(order_inv, onDone) {
  const tpl = S.settings.task_templates || []; const avgs = await stageAverages();
  const existing = (await api.get('tasks-view')).filter((t) => t.order_inv === order_inv).map((t) => t.stage);
  const todo = tpl.filter((t) => !existing.includes(t.stage)); if (!todo.length) return toast('This order already has every standard task', 'err');
  for (const t of todo) await api.post('t/tasks', { order_inv, title: t.title, stage: t.stage, estimate_min: avgs[t.stage] ? Math.round(avgs[t.stage].avg / 5) * 5 : t.minutes, priority: 'normal' });
  toast(`Added ${todo.length} task(s)`); onDone?.();
}
