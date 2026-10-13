import { S } from '../app.js';
import { api, $, $$, esc, dmy, dataTable, editRow, confirmBox, toast, guard, badge, modal } from '../ui.js';
import { cfgOf, parseBreaks } from '../shift.js';
import { ROLES, ROLE_INFO } from '../perm.js';

export async function render(el) {
  const rows = await api.get('users');
  el.innerHTML = `<div class="ph"><h1>Users</h1><span class="sub">Who can sign in, and what they can see</span><span class="grow"></span><button class="btn primary" id="new">+ New user</button></div>
  <div class="cards">${Object.entries(ROLES).map(([k, l]) => `<div class="card"><h3>${l}</h3><p class="muted" style="margin:0">${esc(ROLE_INFO[k])}</p></div>`).join('')}</div><div id="t"></div>`;
  const fields = (row) => [
    { key: 'name', label: 'Full name', required: true }, { key: 'username', label: 'Username', required: true, hint: 'Letters, numbers, dots or dashes' },
    { key: 'role', label: 'Role', type: 'select', options: Object.entries(ROLES) },
    ...(row ? [{ key: 'active', label: 'Account is active', type: 'check' }] : []),
    { key: 'password', label: row ? 'New password (leave empty to keep)' : 'Password (6+ characters)', type: 'password', required: !row, full: true },
  ];
  const open = (row) => editRow({ table: 'users', title: row ? `Edit ${row.name}` : 'New user', row, fields: fields(row), defaults: { role: 'worker', active: 1 }, onSaved: async () => render(el) });
  $('#new', el).onclick = () => open(null);
  const t = $('#t', el);
  dataTable(t, {
    rows, search: ['name', 'username'], empty: 'No users.',
    cols: [{ key: 'name', label: 'Name', render: (r) => `<b>${esc(r.name)}</b>${r.id === S.me.id ? ' <span class="muted">(you)</span>' : ''}` }, { key: 'username', label: 'Username' }, { key: 'role', label: 'Role', render: (r) => badge(ROLES[r.role], r.role === 'admin' ? 'bad' : r.role === 'account' ? 'blue' : '') }, { key: 'active', label: 'Status', render: (r) => (r.active ? badge('Active', 'ok') : badge('Switched off', 'warn')) }, { key: 'shift', label: 'Working hours', render: (r) => (r.shift ? `<b>${esc(r.shift.start || cfgOf(S.settings.shift).start)}–${esc(r.shift.end || cfgOf(S.settings.shift).end)}</b>` : '<span class="muted">workshop hours</span>') }, { key: 'created_at', label: 'Created', render: (r) => dmy((r.created_at || '').slice(0, 10)) }],
    onRow: open, actions: (r) => `<button class="btn sm" data-act="hours" title="This person's own shift">Hours</button> ${r.id === S.me.id ? '' : '<button class="btn sm danger" data-act="del">Delete</button>'}`,
  });
  t.addEventListener('act', guard(async (e) => { if (e.detail.act === 'hours') return shiftModal(e.detail.row, () => render(el)); if (e.detail.act === 'del' && await confirmBox(`Delete ${e.detail.row.name}? They will no longer be able to sign in.`)) { await api.del(`users/${e.detail.row.id}`); toast('Deleted'); render(el); } }));
}

/** One person's own working hours (start, end, breaks, days) — or back to the workshop's. */
function shiftModal(u, done) {
  const base = cfgOf(S.settings.shift); const own = u.shift || {}; const c = { ...base, ...own };
  const w = document.createElement('div');
  w.innerHTML = `<p style="margin-top:0">Working hours for <b>${esc(u.name)}</b>. Their task time, attendance and overtime are measured against these hours. The workshop's default is ${esc(base.start)}–${esc(base.end)}.</p>
    <label class="field check"><input type="checkbox" id="sdef" ${u.shift ? '' : 'checked'}><span>Use the workshop's hours</span></label>
    <div id="sfields" class="form" style="margin-top:10px"><label class="field"><span>Starts</span><input id="s_start" type="time" value="${esc(c.start)}"></label><label class="field"><span>Ends</span><input id="s_end" type="time" value="${esc(c.end)}"></label>
      <label class="field full"><span>Breaks (not counted) — e.g. 12:00-12:30, 15:00-15:15</span><input id="s_br" value="${esc((c.breaks || []).map((b) => b.from + '-' + b.to).join(', '))}"></label>
      <div class="field full"><span>Working days</span><div style="display:flex;gap:12px;flex-wrap:wrap">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => `<label style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-day="${i}" ${c.days.includes(i) ? 'checked' : ''} style="width:auto">${d}</label>`).join('')}</div></div></div>`;
  const sync = () => { $('#sfields', w).style.opacity = $('#sdef', w).checked ? '.4' : '1'; $$('#sfields input', w).forEach((i) => (i.disabled = $('#sdef', w).checked)); };
  $('#sdef', w).onchange = sync; sync();
  modal({ title: 'Working hours', body: w, buttons: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => {
    const shift = $('#sdef', w).checked ? null : { start: $('#s_start', w).value || base.start, end: $('#s_end', w).value || base.end, breaks: parseBreaks($('#s_br', w).value), days: $$('[data-day]', w).filter((x) => x.checked).map((x) => Number(x.dataset.day)) };
    await api.put(`users/${u.id}`, { shift }); toast('Working hours saved'); done();
  } }] });
}
