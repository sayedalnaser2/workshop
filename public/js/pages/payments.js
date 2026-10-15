import { S, refresh } from '../app.js';
import { accountChoices, accountLabel, primaryBank, CASH } from '../banks.js';
import { api, $, $$, esc, money, dmy, today, num, dataTable, editRow, confirmBox, toast, guard, datalist, badge, formHTML, readForm, REF_LABEL, tipText } from '../ui.js';
import { amountInWords } from '../calc.js';
import { printView, docHeader, L, wordsBlock, AR } from '../doc.js';

const CATS = ['Supplier payment', 'Salary', 'Rent', 'Workshop expense', 'Other'];

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
  const [suppliers, accts] = await Promise.all([api.get('t/suppliers'), api.get('t/accounts').catch(() => [])]);
  const kidsOf = new Set(accts.map((x) => x.parent_id).filter(Boolean)); const expense = accts.filter((x) => x.type === 'expense' && !kidsOf.has(x.id) && x.active !== 0).map((x) => x.name);
  const CATS2 = expense.length ? ['Supplier payment', ...expense] : CATS; // where the money goes in the books: a supplier, or one of the expense accounts
  const v = { date: today(), category: 'Supplier payment', done: 0, lines: [{ text: '', amount: '' }], ...pre };
  if (!v.lines?.length) v.lines = [{ text: '', amount: '' }];
  el.innerHTML = `<div class="ph"><h1>New payment voucher</h1><span class="grow"></span><a class="btn" href="#/payments">← Vouchers</a></div>
  <div class="card" style="max-width:820px"><div class="form"><label class="field"><span>Voucher # (blank = ${esc(S.next.payment)})</span><input id="no"></label><label class="field"><span>Date</span><input id="date" type="date" value="${esc(v.date)}"></label>
  <label class="field"><span>Paid to (supplier)</span><select id="paid_to"><option value="">— choose a supplier —</option>${v.employee_id ? `<option selected>${esc(v.paid_to)}</option>` : ''}${suppliers.map((x) => `<option ${v.paid_to === x.name ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>${suppliers.length ? '' : '<small class="neg">No suppliers yet — add one under Suppliers &amp; Catalogue first.</small>'}</label><label class="field"><span>Paid by</span><select id="method"><option value="">—</option>${['Cash', 'Benefit', 'Cheque', 'Bank transfer'].map((c) => `<option ${v.method === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label class="field" id="refWrap" hidden><span id="refLab"></span><input id="ref" name="ref" value="${esc(v.ref || '')}" autocomplete="off"></label><label class="field"><span>Paid from</span><select id="account">${accountChoices(S.bank_accounts).map(([k, l]) => `<option value="${esc(k)}" ${(v.account || primaryBank(S.bank_accounts)?.key) === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><label class="field"><span>Category</span><select id="category">${[...new Set([...CATS2, v.category].filter(Boolean))].map((c) => `<option ${v.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div>
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
  const syncRef = () => { const l = REF_LABEL[$('#method', el).value]; $('#refWrap', el).hidden = !l; $('#ref', el).required = !!l; if (l) $('#refLab', el).textContent = l + ' *'; };
  $('#method', el).onchange = () => { syncRef(); const m = $('#method', el).value; if (m) $('#account', el).value = m === 'Cash' ? CASH : primaryBank(S.bank_accounts)?.key || 'bank'; if (REF_LABEL[m]) $('#ref', el).focus(); };
  syncRef();
  draw();
  const save = (print) => guard(async () => {
    const lines = v.lines.filter((l) => l.text || num(l.amount));
    if (!$('#paid_to', el).value.trim()) return toast('Choose the supplier this money goes to', 'err');
    { const l = REF_LABEL[$('#method', el).value]; if (l && !$('#ref', el).value.trim()) { $('#ref', el).focus(); return toast(`${l} is required when paying by ${$('#method', el).value}.`, 'err'); } }
    if (!total()) return toast('Enter an amount', 'err');
    const d = { no: $('#no', el).value.trim(), date: $('#date', el).value, paid_to: $('#paid_to', el).value.trim(), category: $('#category', el).value, account: $('#account', el).value, method: $('#method', el).value, ref: REF_LABEL[$('#method', el).value] ? $('#ref', el).value.trim() : '', employee_id: v.employee_id || null, amount: total(), done: $('#done', el).checked ? 1 : 0, lines: lines.map((l) => ({ text: l.text, amount: num(l.amount) })) };
    const r = await api.post('t/payments', d); await refresh(); toast(`Saved ${r.no}`);
    location.hash = print ? `#/payments/${r.id}/print` : '#/payments';
  });
  $('#save', el).onclick = save(true); $('#saveOnly', el).onclick = save(false);
}

async function print(el, id) {
  const p = await api.get(`t/payments/${id}`);
  const lines = p.lines?.length ? p.lines : [{ text: p.category || 'Payment', amount: p.amount }];
  const u = p._upd || {}; const created = p.created_at ? new Date(String(p.created_at).replace(' ', 'T') + 'Z') : null;
  const two = (n) => String(n).padStart(2, '0'); const stamp = (d) => (d && !Number.isNaN(d.getTime()) ? `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}` : '');
  const changed = u.ts ? new Date(String(u.ts).replace(' ', 'T') + 'Z') : null;
  const row = (en, ar, v) => (v ? `<div><b>${en} <span class="ar">${ar}</span></b> ${esc(v)}</div>` : '');
  const html = `${docHeader('PAYMENT VOUCHER', AR.voucher)}
    <div class="meta"><div><b>${L('date', 'DATE')}:</b> ${dmy(p.date)}</div><div><b>${L('no', 'VOUCHER NO')}:</b> ${esc(p.no)}</div><div style="grid-column:1/-1"><b>${L('paidTo', 'PAID TO MR / MISS')}:</b> ${esc(p.paid_to)}</div></div>
    <div class="amt"><span>${L('amount', 'Amount')}</span><span>BD ${money(p.amount, 3)}</span></div>
    ${wordsBlock(p.amount)}
    <table><thead><tr><th>${L('description', 'PARTICULARS')}</th><th class="n">${L('debit', 'DEBIT (BD)')}</th></tr></thead><tbody>${lines.map((l) => `<tr><td>${esc(l.text)}</td><td class="n">${money(l.amount, 3)}</td></tr>`).join('')}<tr><td><b>${L('total', 'TOTAL')}</b></td><td class="n"><b>${money(p.amount, 3)}</b></td></tr></tbody></table>
    <div class="details"><h4>Payment details <span class="ar">تفاصيل الدفع</span></h4>
      ${row('Voucher no.', 'رقم السند', p.no)}${row('Date', 'التاريخ', dmy(p.date))}${row('Paid to', 'المدفوع له', p.paid_to)}${row('Category', 'البند', p.category)}
      ${row('Paid by', 'طريقة الدفع', p.method)}${p.ref ? row(REF_LABEL[p.method] || 'Reference', 'المرجع', p.ref) : ''}${row('Paid from', 'مدفوع من', p.account ? accountLabel(p.account, S.bank_accounts) : '')}${row('Amount', 'المبلغ', 'BD ' + money(p.amount, 3))}
      ${row('Status', 'الحالة', p.done ? 'Done / settled' : 'Pending')}${row('Note', 'ملاحظة', p.note)}
      ${row('Created', 'أُنشئ', stamp(created))}${row('Last changed', 'آخر تعديل', changed && u.action !== 'created' ? `${stamp(changed)}${u.by ? ' — ' + u.by : ''}` : '')}
    </div>
    <div class="sign" style="margin-top:50px"><div>${L('prepared', 'PREPARED BY')}</div><div>APPROVED BY <span class="ar">اعتمده</span></div><div>${L('received', 'RECEIVED BY')}</div></div>`;
  printView(el, { back: '#/payments', html, cls: 'voucher' });
}
