import { S } from '../app.js';
import { api, $, esc, dmy, dataTable, editRow, confirmBox, toast, guard, badge } from '../ui.js';
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
    cols: [{ key: 'name', label: 'Name', render: (r) => `<b>${esc(r.name)}</b>${r.id === S.me.id ? ' <span class="muted">(you)</span>' : ''}` }, { key: 'username', label: 'Username' }, { key: 'role', label: 'Role', render: (r) => badge(ROLES[r.role], r.role === 'admin' ? 'bad' : r.role === 'account' ? 'blue' : '') }, { key: 'active', label: 'Status', render: (r) => (r.active ? badge('Active', 'ok') : badge('Switched off', 'warn')) }, { key: 'created_at', label: 'Created', render: (r) => dmy((r.created_at || '').slice(0, 10)) }],
    onRow: open, actions: (r) => (r.id === S.me.id ? '' : '<button class="btn sm danger" data-act="del">Delete</button>'),
  });
  t.addEventListener('act', guard(async (e) => { if (e.detail.act === 'del' && await confirmBox(`Delete ${e.detail.row.name}? They will no longer be able to sign in.`)) { await api.del(`users/${e.detail.row.id}`); toast('Deleted'); render(el); } }));
}
