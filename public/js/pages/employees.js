import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, dmy, today, num, dataTable, editRow, confirmBox, toast, guard, badge, formHTML, readForm, modal } from '../ui.js';
import { printView, docHeader } from '../doc.js';

const daysTo = (d) => (d ? Math.round((new Date(d) - new Date(today())) / 864e5) : null);
const expBadge = (d) => { const n = daysTo(d); if (n == null) return ''; return n < 0 ? badge(`expired ${-n}d ago`, 'bad') : n <= 60 ? badge(`${n} days left`, 'warn') : badge(dmy(d), 'ok'); };
const mine = (e, p) => p.employee_id === e.id || (!p.employee_id && p.paid_to && p.paid_to.toUpperCase().includes(e.name.toUpperCase()));

export async function render(el, [id, tab]) {
  if (id && tab === 'print') return printFile(el, Number(id));
  if (id) return file(el, Number(id), tab || 'profile');
  const [rows, pays, docs] = await Promise.all([api.get('t/employees'), api.get('t/payments'), api.get('t/employee_docs')]);
  const year = String(new Date().getFullYear());
  const stat = rows.map((e) => { const m = pays.filter((p) => mine(e, p)); const ds = docs.filter((d) => d.employee_id === e.id && d.expiry).map((d) => daysTo(d.expiry)); return { ...e, paidYear: m.filter((p) => (p.date || '').startsWith(year)).reduce((s, p) => s + p.amount, 0), paidAll: m.reduce((s, p) => s + p.amount, 0), nextExpiry: ds.length ? Math.min(...ds) : null }; });
  el.innerHTML = `<div class="ph"><h1>Employees</h1><span class="sub">One file per employee — details, salary, advances, attendance and documents</span><span class="grow"></span><button class="btn primary" id="new">+ New employee file</button></div><div id="t"></div>`;
  const fields = [{ key: 'name', label: 'Full name', required: true, full: true }, { key: 'role', label: 'Trade / role' }, { key: 'salary', label: 'Monthly salary (BD)', type: 'number' }];
  $('#new', el).onclick = () => editRow({ table: 'employees', title: 'New employee', fields, defaults: { active: 1 }, before: (d) => ({ ...d, active: 1, join_date: today() }), onSaved: async (r) => { await refresh(); location.hash = `#/employees/${r.id}`; } });
  dataTable($('#t', el), {
    rows: stat, search: ['name', 'role', 'id_no', 'phone'],
    cols: [{ key: 'name', label: 'Name', render: (r) => `<b>${esc(r.name)}</b><div class="muted" style="font-size:11px">${esc(r.role || '')}</div>` }, { key: 'active', label: 'Status', render: (r) => (r.active ? badge('Active', 'ok') : badge('Left')) }, { key: 'phone', label: 'Phone' }, { key: 'salary', label: 'Monthly salary', num: true, render: (r) => money(r.salary, 3) }, { key: 'paidYear', label: `Paid ${year}`, num: true, render: (r) => money(r.paidYear, 3) }, { key: 'nextExpiry', label: 'Documents', render: (r) => (r.nextExpiry == null ? '<span class="muted">—</span>' : r.nextExpiry < 0 ? badge('expired', 'bad') : r.nextExpiry <= 60 ? badge(`renew in ${r.nextExpiry}d`, 'warn') : badge('valid', 'ok')) }],
    filters: [{ label: 'Active', fn: (r) => r.active }, { label: 'All' }], onRow: (r) => (location.hash = `#/employees/${r.id}`),
    foot: (l) => `<tr><td colspan="3">Monthly payroll (active)</td><td class="num">${money(l.filter((r) => r.active).reduce((s, r) => s + (r.salary || 0), 0), 3)}</td><td colspan="2"></td></tr>`,
  });
}

const TABS = [['profile', 'Profile'], ['salary', 'Salary & payments'], ['advances', 'Advances & deductions'], ['attendance', 'Attendance'], ['docs', 'Documents']];
const EV = ['Advance', 'Repayment', 'Deduction', 'Bonus', 'Overtime', 'Leave', 'Warning', 'Note'];

async function file(el, id, tab) {
  const e = await api.get(`t/employees/${id}`).catch(() => null);
  if (!e) { el.innerHTML = '<p class="err">Employee not found.</p>'; return; }
  el.innerHTML = `<div class="ph"><h1>${esc(e.name)}</h1>${e.active ? badge('Active', 'ok') : badge('Left')}<span class="sub">${esc(e.role || '')}</span><span class="grow"></span><a class="btn" href="#/employees/${id}/print">Print file</a><a class="btn" href="#/employees">← All employees</a></div>
  <div class="tbar"><div class="seg">${TABS.map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div></div><div id="pane"></div>`;
  $$('.seg button', el).forEach((b) => (b.onclick = () => (location.hash = `#/employees/${id}/${b.dataset.t}`)));
  const pane = $('#pane', el);
  if (tab === 'profile') return profile(pane, e);
  if (tab === 'salary') return salary(pane, e);
  if (tab === 'advances') return advances(pane, e);
  if (tab === 'attendance') return attendance(pane, e);
  return docsTab(pane, e);
}

const PF = [
  { key: 'name', label: 'Full name', required: true }, { key: 'role', label: 'Trade / role' }, { key: 'nationality', label: 'Nationality' }, { key: 'id_no', label: 'CPR / ID number' },
  { key: 'passport_no', label: 'Passport number' }, { key: 'phone', label: 'Phone' }, { key: 'join_date', label: 'Joined', type: 'date' }, { key: 'permit_expiry', label: 'Work permit expires', type: 'date' },
  { key: 'salary', label: 'Monthly salary (BD)', type: 'number' }, { key: 'iban', label: 'Bank / IBAN' }, { key: 'emergency', label: 'Emergency contact' }, { key: 'address', label: 'Address' },
  { key: 'active', label: 'Currently employed', type: 'check' }, { key: 'left_date', label: 'Left on', type: 'date' }, { key: 'note', label: 'Notes', type: 'textarea', full: true },
];
function profile(pane, e) {
  pane.innerHTML = `<div class="card" style="max-width:860px">${formHTML(PF, e)}<div style="margin-top:14px;display:flex;gap:8px"><button class="btn primary" id="save">Save</button><button class="btn danger" id="del">Delete file</button></div></div>`;
  $('#save', pane).onclick = guard(async () => { await api.put(`t/employees/${e.id}`, readForm(pane, PF)); await refresh(); toast('Saved'); location.hash = `#/employees/${e.id}`; });
  $('#del', pane).onclick = guard(async () => { if (await confirmBox(`Delete ${e.name}'s file, with all its attendance, events and documents?`)) { for (const t of ['employee_events', 'attendance', 'employee_docs']) for (const r of (await api.get(`t/${t}`)).filter((x) => x.employee_id === e.id)) await api.del(`t/${t}/${r.id}`); await api.del(`t/employees/${e.id}`); await refresh(); location.hash = '#/employees'; } });
}

async function salary(pane, e) {
  const [pays, evs] = await Promise.all([api.get('t/payments'), api.get('t/employee_events')]);
  const my = pays.filter((p) => mine(e, p)); const year = String(new Date().getFullYear());
  const owed = evs.filter((v) => v.employee_id === e.id).reduce((s, v) => s + (v.type === 'Advance' ? v.amount : v.type === 'Repayment' || v.type === 'Deduction' ? -v.amount : 0), 0);
  pane.innerHTML = `<div class="cards"><div class="card stat"><div class="k">Monthly salary</div><div class="v">${money(e.salary, 3)}</div></div><div class="card stat"><div class="k">Paid ${year}</div><div class="v">${money(my.filter((p) => (p.date || '').startsWith(year)).reduce((s, p) => s + p.amount, 0), 3)}</div></div><div class="card stat"><div class="k">Paid all time</div><div class="v">${money(my.reduce((s, p) => s + p.amount, 0), 3)}</div></div><div class="card stat"><div class="k">Advance still owed to us</div><div class="v ${owed > 0 ? 'neg' : ''}">${money(owed, 3)}</div></div></div>
  <div class="tbar"><button class="btn primary" id="pay">+ Pay salary (new voucher)</button></div><div id="t"></div>`;
  $('#pay', pane).onclick = () => { const month = new Date().toLocaleString('en', { month: 'long', year: 'numeric' }); location.hash = `#/payments/new/-/${encodeURIComponent(JSON.stringify({ paid_to: e.name, category: 'Salary', employee_id: e.id, lines: [{ text: `Salary ${month}`, amount: e.salary || '' }] }))}`; };
  dataTable($('#t', pane), { rows: my, search: ['no', 'category'], page: 24, empty: 'No payment vouchers for this employee yet.', cols: [{ key: 'no', label: 'Voucher', render: (r) => `<b>${esc(r.no)}</b>` }, { key: 'date', label: 'Date', render: (r) => dmy(r.date) }, { key: 'category', label: 'Category' }, { key: 'account', label: 'From' }, { key: 'amount', label: 'Amount', num: true, render: (r) => money(r.amount, 3) }], onRow: (r) => (location.hash = `#/payments/${r.id}/print`), foot: (l) => `<tr><td colspan="4">Total</td><td class="num">${money(l.reduce((s, r) => s + r.amount, 0), 3)}</td></tr>` });
}

async function advances(pane, e) {
  const draw = async () => {
    const evs = (await api.get('t/employee_events')).filter((v) => v.employee_id === e.id);
    pane.innerHTML = `<div class="tbar"><button class="btn primary" id="add">+ Add entry</button><span class="muted">Advances and repayments keep a running balance; the other types are a record.</span></div><div id="t"></div>`;
    const fields = [{ key: 'date', label: 'Date', type: 'date' }, { key: 'type', label: 'Type', type: 'select', options: EV }, { key: 'amount', label: 'Amount (BD)', type: 'number' }, { key: 'note', label: 'Note', full: true }];
    $('#add', pane).onclick = () => editRow({ table: 'employee_events', title: 'New entry', fields, defaults: { date: today(), type: 'Advance' }, before: (d) => ({ ...d, employee_id: e.id }), onSaved: draw });
    const t = $('#t', pane);
    dataTable(t, { rows: evs, search: ['type', 'note'], empty: 'Nothing recorded.', cols: [{ key: 'date', label: 'Date', render: (r) => dmy(r.date) }, { key: 'type', label: 'Type', render: (r) => badge(r.type, r.type === 'Advance' ? 'warn' : r.type === 'Warning' ? 'bad' : '') }, { key: 'amount', label: 'Amount', num: true, render: (r) => (r.amount ? money(r.amount, 3) : '') }, { key: 'note', label: 'Note' }], actions: () => '<button class="btn sm danger" data-act="del">Delete</button>', foot: (l) => `<tr><td colspan="2">Advance still owed</td><td class="num">${money(l.reduce((s, v) => s + (v.type === 'Advance' ? v.amount : v.type === 'Repayment' || v.type === 'Deduction' ? -v.amount : 0), 0), 3)}</td><td></td><td></td></tr>` });
    t.addEventListener('act', guard(async (ev) => { if (await confirmBox('Delete this entry?')) { await api.del(`t/employee_events/${ev.detail.row.id}`); draw(); } }));
  };
  draw();
}

const ST_CYCLE = ['', 'P', 'H', 'A', 'L'];
const ST_INFO = { P: ['Present', 8, 'ok'], H: ['Half day', 4, 'warn'], A: ['Absent', 0, 'bad'], L: ['Leave', 0, 'blue'] };
async function attendance(pane, e) {
  let month = sessionStorage.getItem('att-month') || today().slice(0, 7);
  const draw = async () => {
    const rows = (await api.get('t/attendance')).filter((a) => a.employee_id === e.id && (a.date || '').startsWith(month));
    const byDay = Object.fromEntries(rows.map((r) => [r.date, r]));
    const [y, m] = month.split('-').map(Number); const n = new Date(y, m, 0).getDate();
    const cnt = (s) => rows.filter((r) => r.status === s).length;
    pane.innerHTML = `<div class="tbar"><button class="btn sm" id="prev">‹</button><input type="month" id="mon" value="${month}" style="width:170px"><button class="btn sm" id="next">›</button><span class="muted">Click a day to cycle: present → half → absent → leave → blank. Friday is marked.</span></div>
    <div class="card"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:6px">${Array.from({ length: n }, (_, i) => { const d = `${month}-${String(i + 1).padStart(2, '0')}`; const r = byDay[d]; const wd = new Date(d + 'T00:00:00').getDay(); const info = r ? ST_INFO[r.status] : null; return `<button class="btn" data-d="${d}" style="display:flex;flex-direction:column;align-items:center;padding:6px 2px;${wd === 5 ? 'background:var(--soft)' : ''}"><small class="muted">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][wd]} ${i + 1}</small>${info ? badge(info[0], info[2]) : '<span class="muted">·</span>'}</button>`; }).join('')}</div></div>
    <div class="cards" style="margin-top:14px"><div class="card stat"><div class="k">Present</div><div class="v">${cnt('P')}</div></div><div class="card stat"><div class="k">Half days</div><div class="v">${cnt('H')}</div></div><div class="card stat"><div class="k">Absent</div><div class="v ${cnt('A') ? 'neg' : ''}">${cnt('A')}</div></div><div class="card stat"><div class="k">Leave</div><div class="v">${cnt('L')}</div></div><div class="card stat"><div class="k">Hours</div><div class="v">${rows.reduce((s, r) => s + (r.hours || 0), 0)}</div></div></div>`;
    const go = (delta) => { const d = new Date(y, m - 1 + delta, 1); month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; sessionStorage.setItem('att-month', month); draw(); };
    $('#prev', pane).onclick = () => go(-1); $('#next', pane).onclick = () => go(1); $('#mon', pane).onchange = (ev) => { if (ev.target.value) { month = ev.target.value; sessionStorage.setItem('att-month', month); draw(); } };
    $$('[data-d]', pane).forEach((b) => (b.onclick = guard(async () => { const r = byDay[b.dataset.d]; const next = ST_CYCLE[(ST_CYCLE.indexOf(r?.status || '') + 1) % ST_CYCLE.length]; if (!next) { if (r) await api.del(`t/attendance/${r.id}`); } else if (r) await api.put(`t/attendance/${r.id}`, { status: next, hours: ST_INFO[next][1] }); else await api.post('t/attendance', { employee_id: e.id, date: b.dataset.d, status: next, hours: ST_INFO[next][1] }); draw(); })));
  };
  draw();
}

async function docsTab(pane, e) {
  const draw = async () => {
    const ds = (await api.get('t/employee_docs')).filter((d) => d.employee_id === e.id);
    pane.innerHTML = `<div class="tbar"><button class="btn primary" id="add">+ Add document</button><span class="muted">CPR, passport, work permit, contract, medical… with expiry dates and an optional scanned file.</span></div><div id="t"></div>`;
    const fields = [{ key: 'type', label: 'Document', list: 'dl-dt' }, { key: 'number', label: 'Number' }, { key: 'expiry', label: 'Expires', type: 'date' }, { key: 'note', label: 'Note', full: true }];
    $('#add', pane).onclick = () => editRow({ table: 'employee_docs', title: 'Add document', fields, extra: '<datalist id="dl-dt"><option>CPR / ID card</option><option>Passport</option><option>Work permit</option><option>Residence permit</option><option>Contract</option><option>Medical certificate</option><option>Driving licence</option></datalist>', before: (d) => ({ ...d, employee_id: e.id }), onSaved: draw });
    const t = $('#t', pane);
    dataTable(t, { rows: ds, search: ['type', 'number', 'file_name'], empty: 'No documents yet.', cols: [{ key: 'type', label: 'Document', render: (r) => `<b>${esc(r.type)}</b>` }, { key: 'number', label: 'Number' }, { key: 'expiry', label: 'Expires', render: (r) => expBadge(r.expiry) }, { key: 'file_name', label: 'File', render: (r) => (r.file_path ? `<a href="/api/employee-docs/${r.id}/file">${esc(r.file_name)}</a>` : '<span class="muted">none</span>') }], actions: (r) => `<button class="btn sm" data-act="up">${r.file_path ? 'Replace file' : 'Upload file'}</button> <button class="btn sm danger" data-act="del">Delete</button>` });
    t.addEventListener('act', guard(async (ev) => {
      const { act, row } = ev.detail;
      if (act === 'del' && await confirmBox(`Delete ${row.type}?`)) { await api.del(`t/employee_docs/${row.id}`); draw(); }
      if (act === 'up') { const inp = document.createElement('input'); inp.type = 'file'; inp.onchange = guard(async () => { const f = inp.files[0]; if (!f) return; if (f.size > 15e6) return toast('File is larger than 15 MB', 'err'); await fetch(`/api/employee-docs/${row.id}/file?name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error); }); toast('Uploaded'); draw(); }); inp.click(); }
    }));
  };
  draw();
}

async function printFile(el, id) {
  const [e, pays, docs, evs] = await Promise.all([api.get(`t/employees/${id}`), api.get('t/payments'), api.get('t/employee_docs'), api.get('t/employee_events')]);
  const ds = docs.filter((d) => d.employee_id === id); const my = pays.filter((p) => mine(e, p)).slice(0, 12); const ev = evs.filter((v) => v.employee_id === id).slice(0, 15);
  const kv = (k, v) => `<div><b>${k}:</b> ${esc(v || '')}</div>`;
  const html = `${docHeader('EMPLOYEE FILE')}<div class="meta">${kv('Name', e.name)}${kv('Trade', e.role)}${kv('Nationality', e.nationality)}${kv('CPR / ID', e.id_no)}${kv('Passport', e.passport_no)}${kv('Phone', e.phone)}${kv('Joined', dmy(e.join_date))}${kv('Permit expires', dmy(e.permit_expiry))}${kv('Salary (BD)', money(e.salary, 3))}${kv('Bank / IBAN', e.iban)}${kv('Emergency', e.emergency)}${kv('Status', e.active ? 'Active' : 'Left ' + dmy(e.left_date))}</div>
  <h4>Documents</h4><table><thead><tr><th>Document</th><th>Number</th><th>Expires</th></tr></thead><tbody>${ds.map((d) => `<tr><td>${esc(d.type)}</td><td>${esc(d.number || '')}</td><td>${dmy(d.expiry)}</td></tr>`).join('') || '<tr><td colspan="3">—</td></tr>'}</tbody></table>
  <h4>Recent salary payments</h4><table><thead><tr><th>Voucher</th><th>Date</th><th class="n">Amount</th></tr></thead><tbody>${my.map((p) => `<tr><td>${esc(p.no)}</td><td>${dmy(p.date)}</td><td class="n">${money(p.amount, 3)}</td></tr>`).join('') || '<tr><td colspan="3">—</td></tr>'}</tbody></table>
  <h4>Advances &amp; notes</h4><table><thead><tr><th>Date</th><th>Type</th><th class="n">Amount</th><th>Note</th></tr></thead><tbody>${ev.map((v) => `<tr><td>${dmy(v.date)}</td><td>${esc(v.type)}</td><td class="n">${v.amount ? money(v.amount, 3) : ''}</td><td>${esc(v.note || '')}</td></tr>`).join('') || '<tr><td colspan="4">—</td></tr>'}</tbody></table>
  ${e.note ? `<p><b>Notes:</b> ${esc(e.note)}</p>` : ''}<div class="sign"><div>Employee</div><div>Manager</div></div>`;
  printView(el, { back: `#/employees/${id}`, html });
}
