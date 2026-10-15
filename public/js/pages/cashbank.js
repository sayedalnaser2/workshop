import { S, refresh } from '../app.js';
import { accountChoices, accountLabel, accountOf, primaryBank, CASH } from '../banks.js';
import { api, $, $$, esc, money, dmy, today, num, dataTable, editRow, confirmBox, toast, guard, badge, modal, formHTML, readForm } from '../ui.js';

const CATS_IN = ['Owner deposit', 'Loan received', 'Refund', 'Cash deposit', 'Other income'];
const CATS_OUT = ['Bank charges', 'Owner withdrawal', 'Loan repayment', 'Cash withdrawal', 'Other expense'];

export async function render(el) {
  let tab = sessionStorage.getItem('cb-tab') || '';
  const draw = async () => {
    const [receipts, payments, manual, banks] = await Promise.all([api.get('t/receipts'), api.get('t/payments'), api.get('t/cash_entries'), api.get('t/bank_accounts')]); S.bank_accounts = banks;
    const opening0 = S.settings.opening || { cash: 0 }; const bankOf = (k) => banks.find((b) => b.key === k);
    const openOf = (k) => (k === CASH ? Number(opening0.cash) || 0 : Number(bankOf(k)?.opening) || 0); // each bank account keeps its own opening balance
    const acctOf = (r, isReceipt) => (isReceipt ? accountOf(r, banks) : r.account || '');
    const accts = [...banks.filter((b) => b.active !== 0 || true).map((b) => b.key), CASH];
    if (!tab || (!accts.includes(tab) && tab !== 'unassigned')) tab = primaryBank(banks)?.key || CASH;
    const all = [
      ...receipts.map((r) => ({ key: 'r' + r.id, date: r.date || '', acct: acctOf(r, true), in: r.amount, out: 0, type: 'Receipt', ref: r.no, party: r.client || r.order_inv, detail: [r.order_inv, r.method && (r.ref ? `${r.method} ${r.ref}` : r.method)].filter(Boolean).join(' · '), link: `#/receipts/${r.id}/print` })),
      ...payments.map((p) => ({ key: 'p' + p.id, date: p.date || '', acct: acctOf(p, false), in: 0, out: p.amount, type: 'Payment voucher', ref: p.no, party: p.paid_to, detail: [p.category, p.method && (p.ref ? `${p.method} ${p.ref}` : p.method)].filter(Boolean).join(' · '), link: `#/payments/${p.id}/print` })),
      ...manual.map((m) => ({ key: 'm' + m.id, date: m.date || '', acct: m.account, in: m.direction === 'in' ? m.amount : 0, out: m.direction === 'out' ? m.amount : 0, type: m.category === 'Transfer' ? 'Transfer' : 'Manual', ref: m.category, party: m.party, detail: m.note, manual: m })),
    ];
    const bal = (a) => openOf(a) + all.filter((x) => x.acct === a).reduce((s, x) => s + x.in - x.out, 0);
    const unassigned = all.filter((x) => !x.acct && x.type !== 'Transfer');
    if (tab === 'unassigned' && !unassigned.length) tab = primaryBank(banks)?.key || CASH;
    el.innerHTML = `<div class="ph"><h1>Cash &amp; Bank</h1><span class="sub">Money in and out, kept separately for each bank account and the cash box</span><span class="grow"></span><button class="btn" id="banks">🏦 Bank accounts</button><button class="btn" id="tf">⇄ Transfer</button><button class="btn" id="out" title="Money out is a payment voucher to a supplier">− Money out</button><button class="btn primary" id="in" title="Money in is a receipt for an invoice">+ Money in</button></div>
    <div class="cards">${banks.filter((x) => x.active !== 0 || bal(x.key)).map((x) => `<div class="card stat"><div class="k">${esc(x.name)}${x.active === 0 ? ' (off)' : ''}</div><div class="v ${bal(x.key) < 0 ? 'neg' : ''}">${money(bal(x.key), 2)}</div></div>`).join('')}<div class="card stat"><div class="k">Cash in hand</div><div class="v ${bal(CASH) < 0 ? 'neg' : ''}">${money(bal(CASH), 2)}</div></div><div class="card stat"><div class="k">Total</div><div class="v">${money(accts.reduce((t, k) => t + bal(k), 0), 2)}</div></div></div>
    ${unassigned.length ? `<div class="card" style="margin-bottom:14px;border-color:var(--warn)"><b>${unassigned.length} older entries have no account yet</b> (imported receipts and vouchers). <span class="muted">Choose where they belong so the balances are right.</span><div style="margin-top:8px;display:flex;gap:8px">${accts.map((k) => `<button class="btn sm" data-assign="${esc(k)}">Mark all as ${esc(accountLabel(k, banks))}</button>`).join('')}<button class="btn sm" data-tab="unassigned">Show them</button></div></div>` : ''}
    <div class="tbar"><div class="seg">${accts.map((k) => `<button data-t="${esc(k)}" class="${tab === k ? 'on' : ''}">${esc(accountLabel(k, banks))}</button>`).join('')}${unassigned.length ? `<button data-t="unassigned" class="${tab === 'unassigned' ? 'on' : ''}">Unassigned</button>` : ''}</div>
    ${tab !== 'unassigned' ? `<span class="muted">Opening balance</span><input id="open" type="number" step="any" value="${openOf(tab)}" style="width:120px"><button class="btn sm" id="saveOpen">Set</button>` : ''}</div><div id="t"></div>`;
    $$('[data-t]', el).forEach((b) => (b.onclick = () => { tab = b.dataset.t; sessionStorage.setItem('cb-tab', tab); draw(); }));
    $$('[data-tab]', el).forEach((b) => (b.onclick = () => { tab = b.dataset.tab; draw(); }));
    $$('[data-assign]', el).forEach((b) => (b.onclick = guard(async () => { if (!await confirmBox(`Mark ${unassigned.length} entries as ${accountLabel(b.dataset.assign, banks)}?`, 'Yes, mark', 'primary')) return; await api.post('assign-accounts', { account: b.dataset.assign }); toast('Done'); draw(); })));
    $('#saveOpen', el)?.addEventListener('click', guard(async () => { if (tab === CASH) await api.put('settings', { opening: { ...opening0, cash: num($('#open', el).value) } }); else await api.put(`t/bank_accounts/${bankOf(tab).id}`, { opening: num($('#open', el).value) }); await refresh(); toast('Opening balance saved'); draw(); }));
    $('#in', el).onclick = () => (location.hash = '#/receipts/new'); $('#out', el).onclick = () => (location.hash = '#/payments/new'); $('#tf', el).onclick = () => transfer(draw, banks); $('#banks', el).onclick = () => manageBanks(banks, draw);

    // statement for the chosen account: oldest first for the running balance, shown newest first
    const rows = all.filter((x) => (tab === 'unassigned' ? !x.acct : x.acct === tab)).sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
    let run = tab === 'unassigned' ? 0 : openOf(tab); rows.forEach((r) => { run += r.in - r.out; r.bal = run; });
    const view = rows.reverse();
    const t = $('#t', el);
    dataTable(t, {
      rows: view, search: ['ref', 'party', 'detail', 'type'], page: 100, empty: 'No entries in this account yet.',
      cols: [{ key: 'date', label: 'Date', render: (r) => dmy(r.date) }, { key: 'type', label: 'Type', render: (r) => badge(r.type, r.type === 'Receipt' ? 'ok' : r.type === 'Payment voucher' ? 'warn' : 'blue') }, { key: 'ref', label: 'Ref' }, { key: 'party', label: 'Party' }, { key: 'detail', label: 'Detail' }, { key: 'in', label: 'In', num: true, render: (r) => (r.in ? `<span class="pos">${money(r.in, 3)}</span>` : '') }, { key: 'out', label: 'Out', num: true, render: (r) => (r.out ? `<span class="neg">${money(r.out, 3)}</span>` : '') }, ...(tab === 'unassigned' ? [] : [{ key: 'bal', label: 'Balance', num: true, render: (r) => `<b>${money(r.bal, 3)}</b>` }])],
      onRow: (r) => (r.link ? (location.hash = r.link) : toast('Older manual entries are kept for history. Money in is recorded as a receipt for an invoice, money out as a voucher to a supplier.')),
      actions: (r) => (r.manual ? '<button class="btn sm danger" data-act="del">Delete</button>' : `<button class="btn sm" data-act="move">${r.acct ? 'Move' : 'Set'}</button>`),
      foot: (l) => `<tr><td colspan="5">Total (${l.length})</td><td class="num">${money(l.reduce((s, r) => s + r.in, 0), 3)}</td><td class="num">${money(l.reduce((s, r) => s + r.out, 0), 3)}</td><td></td><td></td></tr>`,
    });
    t.addEventListener('act', guard(async (e) => {
      const { act, row } = e.detail;
      if (act === 'del' && await confirmBox('Delete this entry?')) { await api.del(`t/cash_entries/${row.manual.id}`); draw(); }
      if (act === 'move') { const id = Number(row.key.slice(1)); const to = await pickAccount(banks, row.acct); if (!to) return; await api.put(`t/${row.key[0] === 'r' ? 'receipts' : 'payments'}/${id}`, { account: to }); toast(`Moved to ${accountLabel(to, banks)}`); draw(); }
    }));
  };
  draw();
}

function entry(dir, done, row = null, banks = S.bank_accounts || []) {
  const fields = [{ key: 'date', label: 'Date', type: 'date' }, { key: 'account', label: 'Account', type: 'select', options: accountChoices(banks) }, { key: 'amount', label: 'Amount (BD)', type: 'number', required: true }, { key: 'category', label: 'Category', type: 'select', options: dir === 'in' ? CATS_IN : CATS_OUT }, { key: 'party', label: dir === 'in' ? 'From' : 'To' }, { key: 'note', label: 'Note', full: true }];
  editRow({ table: 'cash_entries', title: row ? 'Edit entry' : dir === 'in' ? 'Money in' : 'Money out', fields, row, defaults: { date: today(), account: S.settings.last_account || primaryBank(banks)?.key || CASH }, before: (d) => ({ ...d, direction: dir }), onSaved: async () => done() });
}
/** Move money between any two of the cash box and the bank accounts. */
function transfer(done, banks) {
  const w = document.createElement('div'); const opts = accountChoices(banks); const main = primaryBank(banks)?.key || opts[0][0];
  const fields = [{ key: 'date', label: 'Date', type: 'date' }, { key: 'from', label: 'From', type: 'select', options: opts }, { key: 'to', label: 'To', type: 'select', options: opts }, { key: 'amount', label: 'Amount (BD)', type: 'number' }, { key: 'note', label: 'Note', full: true, hint: 'e.g. cash deposited at the bank' }];
  w.innerHTML = formHTML(fields, { date: today(), from: CASH, to: main });
  modal({ title: 'Transfer between accounts', body: w, buttons: [{ label: 'Cancel' }, { label: 'Transfer', kind: 'primary', onClick: async () => {
    const d = readForm(w, fields); if (!(d.amount > 0)) { toast('Enter the amount', 'err'); return false; } if (d.from === d.to) { toast('Choose two different accounts', 'err'); return false; }
    await api.post('t/cash_entries', { date: d.date, account: d.from, direction: 'out', amount: d.amount, category: 'Transfer', party: `to ${accountLabel(d.to, banks)}`, note: d.note });
    await api.post('t/cash_entries', { date: d.date, account: d.to, direction: 'in', amount: d.amount, category: 'Transfer', party: `from ${accountLabel(d.from, banks)}`, note: d.note });
    toast('Transferred'); done();
  } }] });
}
/** Ask which account an entry belongs to. */
function pickAccount(banks, current) {
  return new Promise((resolve) => {
    const w = document.createElement('div'); const f = [{ key: 'account', label: 'Move to', type: 'select', options: accountChoices(banks, { inactive: true }) }]; w.innerHTML = formHTML(f, { account: current || primaryBank(banks)?.key || CASH });
    modal({ title: 'Which account?', body: w, buttons: [{ label: 'Cancel', onClick: () => resolve(null) }, { label: 'Move', kind: 'primary', onClick: () => { resolve(readForm(w, f).account); } }] });
  });
}
/** The workshop's bank accounts: add, rename, opening balance, show on invoices, switch off. */
function manageBanks(banks, done) {
  const fields = [{ key: 'name', label: 'Name', required: true, hint: 'How it appears in the lists, e.g. “BBK current”' }, { key: 'bank', label: 'Bank' }, { key: 'number', label: 'Account no. / IBAN', full: true }, { key: 'opening', label: 'Opening balance (BD)', type: 'number' }, { key: 'print', label: 'Print on invoices', type: 'check' }, { key: 'active', label: 'In use', type: 'check' }];
  const w = document.createElement('div');
  const draw = (list) => {
    w.innerHTML = `<table class="grid"><thead><tr><th>Name</th><th>Bank</th><th>Account no.</th><th class="num">Opening</th><th></th></tr></thead><tbody>${list.map((b) => `<tr style="${b.active === 0 ? 'opacity:.5' : ''}"><td><b>${esc(b.name)}</b>${b.print ? ' <span class="muted" title="Printed on invoices">🖨</span>' : ''}</td><td>${esc(b.bank || '')}</td><td>${esc(b.number || '')}</td><td class="num">${money(b.opening || 0, 2)}</td><td style="white-space:nowrap"><button class="btn sm" data-edit="${b.id}">Edit</button>${b.key === 'bank' ? '' : ` <button class="btn sm danger" data-del="${b.id}">Delete</button>`}</td></tr>`).join('')}</tbody></table><div style="margin-top:10px"><button class="btn primary" id="addBank">+ New bank account</button></div>`;
  };
  draw(banks);
  const reload = async () => { const fresh = await api.get('t/bank_accounts'); S.bank_accounts = fresh; banks = fresh; draw(fresh); done(); };
  const form = (row) => editRow({ table: 'bank_accounts', title: row ? `Edit ${row.name}` : 'New bank account', row, fields, defaults: { active: 1, print: 0, opening: 0 }, onSaved: reload });
  w.addEventListener('click', guard(async (e) => {
    if (e.target.id === 'addBank') return form(null);
    const ed = e.target.closest('[data-edit]'); if (ed) return form(banks.find((b) => b.id === Number(ed.dataset.edit)));
    const dl = e.target.closest('[data-del]'); if (dl) { const b = banks.find((x) => x.id === Number(dl.dataset.del)); if (await confirmBox(`Delete the bank account “${b.name}”? It must have no entries.`)) { await api.del(`t/bank_accounts/${b.id}`); toast('Deleted'); reload(); } }
  }));
  modal({ title: 'Bank accounts', body: w, buttons: [{ label: 'Close' }] });
}
