import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, dmy, today, num, dataTable, confirmBox, toast, guard } from '../ui.js';
import { printView, docHeader, L } from '../doc.js';
import { canWrite } from '../perm.js';

export async function render(el, [a, b]) {
  if (a === 'new') return form(el, null);
  if (a && b === 'print') return print(el, Number(a));
  if (a) return form(el, Number(a));
  const rows = (await api.get('t/journals')).map((j) => ({ ...j, total: (j.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0) }));
  el.innerHTML = `<div class="ph"><h1>Journal Vouchers</h1><span class="sub">Manual double-entry postings: opening balances, depreciation, corrections, anything the other documents don’t cover</span><span class="grow"></span>${canWrite(S.me, 'journals') ? '<a class="btn primary" href="#/journals/new">+ New journal voucher</a>' : ''}</div><div id="t"></div>`;
  dataTable($('#t', el), { rows, search: ['no', 'description'], page: 60, empty: 'No journal vouchers yet.', cols: [{ key: 'no', label: 'No', render: (r) => `<b>${esc(r.no)}</b>` }, { key: 'date', label: 'Date', render: (r) => dmy(r.date) }, { key: 'description', label: 'Description' }, { key: 'total', label: 'Amount', num: true, render: (r) => money(r.total, 3) }], onRow: (r) => (location.hash = `#/journals/${r.id}`) });
}

async function form(el, id) {
  const [accounts, existing] = await Promise.all([api.get('t/accounts'), id ? api.get(`t/journals/${id}`) : null]);
  const kids = new Set(accounts.map((x) => x.parent_id).filter(Boolean)); const leaves = accounts.filter((x) => !kids.has(x.id) && x.active !== 0).sort((p, q) => String(p.code).localeCompare(String(q.code), undefined, { numeric: true }));
  const write = canWrite(S.me, 'journals');
  const v = existing || { date: today(), description: '', lines: [{}, {}] }; if (!v.lines?.length) v.lines = [{}, {}];
  const opt = (sel) => `<option value="">— account —</option>${leaves.map((x) => `<option value="${x.id}" ${Number(sel) === x.id ? 'selected' : ''}>${esc(x.code)} — ${esc(x.name)}</option>`).join('')}`;
  el.innerHTML = `<div class="ph"><h1>${id ? 'Journal voucher ' + esc(existing.no) : 'New journal voucher'}</h1><span class="grow"></span>${id ? `<a class="btn" href="#/journals/${id}/print">Print</a>` : ''}<a class="btn" href="#/journals">← Vouchers</a></div>
    <div class="card" style="max-width:980px"><div class="form"><label class="field"><span>Date</span><input id="date" type="date" value="${esc(v.date)}"></label><label class="field full"><span>Description</span><input id="desc" value="${esc(v.description || '')}" placeholder="What is this entry for?"></label></div>
    <table class="mini" id="lines" style="margin-top:14px"><thead><tr><th style="width:32%">Account</th><th>Description</th><th style="width:130px">Debit</th><th style="width:130px">Credit</th><th></th></tr></thead><tbody></tbody></table>
    <button class="btn sm" id="add" style="margin-top:6px">+ Add line</button>
    <p id="sum" style="text-align:right;font-size:16px;margin:14px 0 0"></p>
    ${write ? `<div style="margin-top:14px;display:flex;gap:8px"><button class="btn primary" id="save">Save voucher</button>${id ? '<button class="btn danger" id="del">Delete</button>' : ''}</div>` : ''}</div>`;
  const tb = $('#lines tbody', el);
  const sums = () => { const d = v.lines.reduce((s, l) => s + num(l.debit), 0); const c = v.lines.reduce((s, l) => s + num(l.credit), 0); const diff = Math.round((d - c) * 1000) / 1000; $('#sum', el).innerHTML = `Debit <b>${money(d, 3)}</b> · Credit <b>${money(c, 3)}</b> · ${diff === 0 && d > 0 ? '<span style="color:var(--ok)">balanced ✓</span>' : `<span class="neg">difference ${money(diff, 3)}</span>`}`; return { d, c, ok: diff === 0 && d > 0 }; };
  const draw = () => { tb.innerHTML = v.lines.map((l, i) => `<tr data-i="${i}"><td><select data-k="account_id">${opt(l.account_id)}</select></td><td><input data-k="description" value="${esc(l.description || '')}"></td><td><input data-k="debit" type="number" step="any" value="${l.debit || ''}"></td><td><input data-k="credit" type="number" step="any" value="${l.credit || ''}"></td><td><button class="btn sm danger" data-rm>×</button></td></tr>`).join(''); sums(); };
  tb.addEventListener('input', (e) => { const i = Number(e.target.closest('tr').dataset.i); const k = e.target.dataset.k; v.lines[i][k] = k === 'description' ? e.target.value : e.target.value; if (k === 'debit' && num(e.target.value)) { v.lines[i].credit = ''; e.target.closest('tr').querySelector('[data-k=credit]').value = ''; } if (k === 'credit' && num(e.target.value)) { v.lines[i].debit = ''; e.target.closest('tr').querySelector('[data-k=debit]').value = ''; } sums(); });
  tb.addEventListener('change', (e) => { if (e.target.dataset.k === 'account_id') v.lines[Number(e.target.closest('tr').dataset.i)].account_id = e.target.value ? Number(e.target.value) : ''; });
  tb.addEventListener('click', (e) => { if (e.target.matches('[data-rm]')) { v.lines.splice(Number(e.target.closest('tr').dataset.i), 1); while (v.lines.length < 2) v.lines.push({}); draw(); } });
  $('#add', el).onclick = () => { // the new line starts with whatever is needed to balance
    const d = v.lines.reduce((s, l) => s + num(l.debit), 0); const c = v.lines.reduce((s, l) => s + num(l.credit), 0); const n = {}; if (d > c) n.credit = Math.round((d - c) * 1000) / 1000; else if (c > d) n.debit = Math.round((c - d) * 1000) / 1000; v.lines.push(n); draw(); };
  draw();
  if (!write) $$('input,select,button:not(.btn[href])', el).forEach((x) => { if (x.id !== 'x') x.disabled = true; });
  $('#save', el)?.addEventListener('click', guard(async () => {
    const lines = v.lines.filter((l) => num(l.debit) || num(l.credit)).map((l) => ({ account_id: Number(l.account_id) || null, description: l.description || '', debit: num(l.debit), credit: num(l.credit) }));
    const body = { date: $('#date', el).value, description: $('#desc', el).value.trim(), lines };
    const r = id ? await api.put(`t/journals/${id}`, body) : await api.post('t/journals', body); await refresh(); toast(`Saved ${r.no}`); location.hash = `#/journals/${r.id}/print`;
  }));
  $('#del', el)?.addEventListener('click', guard(async () => { if (await confirmBox(`Delete journal voucher ${existing.no}?`)) { await api.del(`t/journals/${id}`); toast('Deleted'); location.hash = '#/journals'; } }));
}

async function print(el, id) {
  const [j, accounts] = await Promise.all([api.get(`t/journals/${id}`), api.get('t/accounts')]); const name = (aid) => { const a = accounts.find((x) => x.id === aid); return a ? `${a.code} — ${a.name}` : '?'; };
  const d = (j.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
  printView(el, { back: '#/journals', html: `${docHeader('JOURNAL VOUCHER', 'قيد يومية')}<div class="meta"><div><b>${L('no', 'VOUCHER NO')}:</b> ${esc(j.no)}</div><div><b>${L('date', 'DATE')}:</b> ${dmy(j.date)}</div><div style="grid-column:1/-1"><b>${L('description', 'DESCRIPTION')}:</b> ${esc(j.description || '')}</div></div>
    <table><thead><tr><th>Account</th><th>${L('description', 'Description')}</th><th class="n">${L('debit', 'Debit')}</th><th class="n">${L('credit', 'Credit')}</th></tr></thead><tbody>${(j.lines || []).map((l) => `<tr><td>${esc(name(l.account_id))}</td><td>${esc(l.description || '')}</td><td class="n">${l.debit ? money(l.debit, 3) : ''}</td><td class="n">${l.credit ? money(l.credit, 3) : ''}</td></tr>`).join('')}<tr><td colspan="2"><b>${L('total', 'TOTAL')}</b></td><td class="n"><b>${money(d, 3)}</b></td><td class="n"><b>${money(d, 3)}</b></td></tr></tbody></table>
    <div class="sign" style="margin-top:60px"><div>${L('prepared', 'PREPARED BY')}</div><div>APPROVED BY <span class="ar">اعتمده</span></div></div>` });
}
