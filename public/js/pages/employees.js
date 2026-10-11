import { S, refresh } from '../app.js';
import { api, $, esc, money, dataTable, editRow, confirmBox, toast, guard, badge, today } from '../ui.js';

export async function render(el) {
  const [rows, pays] = await Promise.all([api.get('t/employees'), api.get('t/payments')]);
  const year = String(new Date().getFullYear());
  const stat = rows.map((e) => {
    const mine = pays.filter((p) => p.paid_to && p.paid_to.toUpperCase().includes(e.name.toUpperCase()));
    return { ...e, paidYear: mine.filter((p) => (p.date || '').startsWith(year)).reduce((s, p) => s + p.amount, 0), paidAll: mine.reduce((s, p) => s + p.amount, 0) };
  });
  el.innerHTML = `<div class="ph"><h1>Employees &amp; Salary</h1><span class="sub">Staff list with monthly salary — one click creates the salary payment voucher</span><span class="grow"></span><button class="btn primary" id="new">+ New employee</button></div><div id="t"></div>`;
  const fields = [{ key: 'name', label: 'Name', required: true, full: true }, { key: 'salary', label: 'Monthly salary (BD)', type: 'number' }, { key: 'active', label: 'Currently employed', type: 'check' }, { key: 'note', label: 'Note', full: true }];
  const open = (row) => editRow({ table: 'employees', title: row ? 'Edit employee' : 'New employee', fields, row, defaults: { active: 1 }, onSaved: async () => { await refresh(); render(el); } });
  $('#new', el).onclick = () => open(null);
  const t = $('#t', el);
  dataTable(t, {
    rows: stat, search: ['name'],
    cols: [{ key: 'name', label: 'Name' }, { key: 'active', label: 'Status', render: (r) => (r.active ? badge('Active', 'ok') : badge('Left')) }, { key: 'salary', label: 'Monthly salary', num: true, render: (r) => money(r.salary, 3) }, { key: 'paidYear', label: `Paid ${year}`, num: true, render: (r) => money(r.paidYear, 3) }, { key: 'paidAll', label: 'Paid (all time)', num: true, render: (r) => money(r.paidAll, 3) }],
    onRow: open, actions: (r) => `<button class="btn sm" data-act="pay">Pay salary</button> <button class="btn sm danger" data-act="del">Delete</button>`,
    foot: (l) => `<tr><td colspan="2">Monthly payroll</td><td class="num">${money(l.filter((r) => r.active).reduce((s, r) => s + (r.salary || 0), 0), 3)}</td><td colspan="3"></td></tr>`,
  });
  t.addEventListener('act', guard(async (e) => {
    const { act, row } = e.detail;
    if (act === 'del' && await confirmBox(`Delete ${row.name}?`)) { await api.del(`t/employees/${row.id}`); await refresh(); render(el); }
    if (act === 'pay') {
      const month = new Date().toLocaleString('en', { month: 'long', year: 'numeric' });
      const pre = { paid_to: row.name, category: 'Salary', lines: [{ text: `Salary ${month}`, amount: row.salary || '' }] };
      location.hash = `#/payments/new/-/${encodeURIComponent(JSON.stringify(pre))}`;
    }
  }));
}
