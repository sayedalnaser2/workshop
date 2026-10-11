import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, dmy, today, num, dataTable, editRow, confirmBox, toast, guard, datalist, badge, formHTML, readForm } from '../ui.js';
import { amountInWords } from '../calc.js';
import { printView, docHeader } from '../doc.js';

const CATS = ['', 'Salary', 'Rent', 'Workshop expense', 'Supplier payment', 'Other'];

export async function render(el, [a, b, c]) {
  if (a === 'new') return form(el, c ? JSON.parse(decodeURIComponent(c)) : {});
  if (a && b === 'print') return print(el, Number(a));
  return list(el);
}
async function list(el) {
  const rows = await api.get('t/payments');
  el.innerHTML = `<div class="ph"><h1>Payment Vouchers</h1><span class="sub">Salaries, rent, expenses and supplier payments</span><span class="grow"></span><a class="btn primary" href="#/payments/new">+ New voucher</a></div><div id="t"></div>`;
  const t = $('#t', el);
  dataTable(t, {
    rows, search: ['no', 'paid_to', 'category'], page: 60,
    cols: [{ key: 'no', label: 'Voucher', render: (r) => `<b>${esc(r.no)}</b>` }, { key: 'date', label: 'Date', render: (r) => dmy(r.date) }, { key: 'paid_to', label: 'Paid to' }, { key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount', num: true, render: (r) => money(r.amount, 3) }, { key: 'done', label: 'Status', render: (r) => (r.done ? badge('Done', 'ok') : badge('Pending', 'warn')) }],
    filters: [{ label: 'All' }, { label: 'Pending', fn: (r) => !r.done }],
    onRow: (r) => (location.hash = `#/payments/${r.id}/print`),
    actions: () => '<button class="btn sm" data-act="done">Toggle done</button> <button class="btn sm danger" data-act="del">Delete</button>',
    foot: (l) => `<tr><td colspan="4">Total (${l.length})</td><td class="num">${money(l.reduce((s, r) => s + r.amount, 0), 3)}</td><td></td><td></td></tr>`,
  });
  t.addEventListener('act', guard(async (e) => {
    const { act, row } = e.detail;
    if (act === 'del' && await confirmBox(`Delete voucher ${row.no}?`)) { await api.del(`t/payments/${row.id}`); await refresh(); list(el); }
    if (act === 'done') { await api.put(`t/payments/${row.id}`, { done: row.done ? 0 : 1 }); list(el); }
  }));
}

async function form(el, pre) {
  const payments = await api.get('t/payments');
  const payees = [...S.employees.map((e) => e.name), ...payments.map((p) => p.paid_to)];
  const v = { date: today(), category: '', done: 0, lines: [{ text: '', amount: '' }], ...pre };
  if (!v.lines?.length) v.lines = [{ text: '', amount: '' }];
  el.innerHTML = `<div class="ph"><h1>New payment voucher</h1><span class="grow"></span><a class="btn" href="#/payments">← Vouchers</a></div>${datalist('dl-payees', payees)}
  <div class="card" style="max-width:820px"><div class="form"><label class="field"><span>Voucher # (blank = ${esc(S.next.payment)})</span><input id="no"></label><label class="field"><span>Date</span><input id="date" type="date" value="${esc(v.date)}"></label>
  <label class="field"><span>Paid to (Mr / Miss)</span><input id="paid_to" list="dl-payees" value="${esc(v.paid_to || '')}" autocomplete="off"></label><label class="field"><span>Category</span><select id="category">${CATS.map((c) => `<option ${v.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label class="field"><span>Paid from</span><select id="account"><option value="bank">Bank account</option><option value="cash" ${v.account === 'cash' ? 'selected' : ''}>Cash box</option></select></label></div>
  <h4 style="margin:16px 0 6px">Particulars</h4><table class="mini" id="lines"><thead><tr><th>Particulars</th><th style="width:130px">Amount (BD)</th><th></th></tr></thead><tbody></tbody></table>
  <button class="btn sm" id="addLine" style="margin-top:6px">+ Add line</button><p style="text-align:right;font-size:18px"><b>Total: <span id="total"></span></b></p>
  <label class="field check"><input type="checkbox" id="done" ${v.done ? 'checked' : ''}><span>Mark as done / settled</span></label>
  <div style="margin-top:14px;display:flex;gap:8px"><button class="btn primary" id="save">Save &amp; print</button><button class="btn" id="saveOnly">Save</button></div></div>`;
  const tb = $('#lines tbody', el);
  const total = () => v.lines.reduce((s, l) => s + num(l.amount), 0);
  const draw = () => { tb.innerHTML = v.lines.map((l, i) => `<tr data-i="${i}"><td><input data-k="text" value="${esc(l.text)}"></td><td><input data-k="amount" type="number" step="any" value="${l.amount ?? ''}"></td><td><button class="btn sm danger" data-rm>×</button></td></tr>`).join(''); $('#total', el).textContent = money(total()); };
  tb.addEventListener('input', (e) => { const i = Number(e.target.closest('tr').dataset.i); v.lines[i][e.target.dataset.k] = e.target.value; $('#total', el).textContent = money(total()); });
  tb.addEventListener('click', (e) => { if (e.target.matches('[data-rm]')) { v.lines.splice(Number(e.target.closest('tr').dataset.i), 1); if (!v.lines.length) v.lines.push({ text: '', amount: '' }); draw(); } });
  $('#addLine', el).onclick = () => { v.lines.push({ text: '', amount: '' }); draw(); };
  draw();
  const save = (print) => guard(async () => {
    const lines = v.lines.filter((l) => l.text || num(l.amount));
    if (!$('#paid_to', el).value.trim()) return toast('Enter who was paid', 'err');
    if (!total()) return toast('Enter an amount', 'err');
    const d = { no: $('#no', el).value.trim(), date: $('#date', el).value, paid_to: $('#paid_to', el).value.trim(), category: $('#category', el).value, account: $('#account', el).value, employee_id: v.employee_id || null, amount: total(), done: $('#done', el).checked ? 1 : 0, lines: lines.map((l) => ({ text: l.text, amount: num(l.amount) })) };
    const r = await api.post('t/payments', d); await refresh(); toast(`Saved ${r.no}`);
    location.hash = print ? `#/payments/${r.id}/print` : '#/payments';
  });
  $('#save', el).onclick = save(true); $('#saveOnly', el).onclick = save(false);
}

async function print(el, id) {
  const p = await api.get(`t/payments/${id}`);
  const lines = p.lines?.length ? p.lines : [{ text: p.category || 'Payment', amount: p.amount }];
  const html = `${docHeader('PAYMENT VOUCHER')}
    <div class="meta"><div><b>DATE:</b> ${dmy(p.date)}</div><div><b>VOUCHER NO:</b> ${esc(p.no)}</div><div style="grid-column:1/-1"><b>PAID TO MR / MISS:</b> ${esc(p.paid_to)}</div><div style="grid-column:1/-1"><b>THE SUM OF B.D:</b> ${esc(amountInWords(p.amount))}</div></div>
    <table><thead><tr><th>PARTICULARS</th><th class="n">DEBIT (BD)</th></tr></thead><tbody>${lines.map((l) => `<tr><td>${esc(l.text)}</td><td class="n">${money(l.amount, 3)}</td></tr>`).join('')}<tr><td><b>TOTAL</b></td><td class="n"><b>${money(p.amount, 3)}</b></td></tr></tbody></table>
    <div class="sign" style="margin-top:60px"><div>PREPARED BY</div><div>APPROVED BY</div><div>RECEIVED BY</div></div>`;
  printView(el, { back: '#/payments', html });
}
