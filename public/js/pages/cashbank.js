import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, dmy, today, num, dataTable, editRow, confirmBox, toast, guard, badge, modal, formHTML, readForm } from '../ui.js';

const CATS_IN = ['Owner deposit', 'Loan received', 'Refund', 'Cash deposit', 'Other income'];
const CATS_OUT = ['Bank charges', 'Owner withdrawal', 'Loan repayment', 'Cash withdrawal', 'Other expense'];
const acctOf = (r, isReceipt) => r.account || (isReceipt ? (r.method === 'Cash' ? 'cash' : r.method ? 'bank' : '') : '');

export async function render(el) {
  let tab = sessionStorage.getItem('cb-tab') || 'bank';
  const draw = async () => {
    const [receipts, payments, manual] = await Promise.all([api.get('t/receipts'), api.get('t/payments'), api.get('t/cash_entries')]);
    const opening = S.settings.opening || { cash: 0, bank: 0 };
    const all = [
      ...receipts.map((r) => ({ key: 'r' + r.id, date: r.date || '', acct: acctOf(r, true), in: r.amount, out: 0, type: 'Receipt', ref: r.no, party: r.client || r.order_inv, detail: r.order_inv, link: `#/receipts/${r.id}/print` })),
      ...payments.map((p) => ({ key: 'p' + p.id, date: p.date || '', acct: acctOf(p, false), in: 0, out: p.amount, type: 'Payment voucher', ref: p.no, party: p.paid_to, detail: p.category, link: `#/payments/${p.id}/print` })),
      ...manual.map((m) => ({ key: 'm' + m.id, date: m.date || '', acct: m.account, in: m.direction === 'in' ? m.amount : 0, out: m.direction === 'out' ? m.amount : 0, type: m.category === 'Transfer' ? 'Transfer' : 'Manual', ref: m.category, party: m.party, detail: m.note, manual: m })),
    ];
    const bal = (a) => (opening[a] || 0) + all.filter((x) => x.acct === a).reduce((s, x) => s + x.in - x.out, 0);
    const unassigned = all.filter((x) => !x.acct && x.type !== 'Transfer');
    if (tab === 'unassigned' && !unassigned.length) tab = 'bank';
    el.innerHTML = `<div class="ph"><h1>Cash &amp; Bank</h1><span class="sub">Money in and out, kept separately for the bank account and the cash box</span><span class="grow"></span><button class="btn" id="tf">⇄ Transfer</button><button class="btn" id="out">− Money out</button><button class="btn primary" id="in">+ Money in</button></div>
    <div class="cards"><div class="card stat"><div class="k">Bank balance</div><div class="v ${bal('bank') < 0 ? 'neg' : ''}">${money(bal('bank'), 2)}</div></div><div class="card stat"><div class="k">Cash in hand</div><div class="v ${bal('cash') < 0 ? 'neg' : ''}">${money(bal('cash'), 2)}</div></div><div class="card stat"><div class="k">Total</div><div class="v">${money(bal('bank') + bal('cash'), 2)}</div></div></div>
    ${unassigned.length ? `<div class="card" style="margin-bottom:14px;border-color:var(--warn)"><b>${unassigned.length} older entries have no account yet</b> (imported receipts and vouchers). <span class="muted">Choose where they belong so the balances are right.</span><div style="margin-top:8px;display:flex;gap:8px"><button class="btn sm" data-assign="bank">Mark all as Bank</button><button class="btn sm" data-assign="cash">Mark all as Cash</button><button class="btn sm" data-tab="unassigned">Show them</button></div></div>` : ''}
    <div class="tbar"><div class="seg"><button data-t="bank" class="${tab === 'bank' ? 'on' : ''}">Bank</button><button data-t="cash" class="${tab === 'cash' ? 'on' : ''}">Cash</button>${unassigned.length ? `<button data-t="unassigned" class="${tab === 'unassigned' ? 'on' : ''}">Unassigned</button>` : ''}</div>
    ${tab !== 'unassigned' ? `<span class="muted">Opening balance</span><input id="open" type="number" step="any" value="${opening[tab] || 0}" style="width:120px"><button class="btn sm" id="saveOpen">Set</button>` : ''}</div><div id="t"></div>`;
    $$('[data-t]', el).forEach((b) => (b.onclick = () => { tab = b.dataset.t; sessionStorage.setItem('cb-tab', tab); draw(); }));
    $$('[data-tab]', el).forEach((b) => (b.onclick = () => { tab = b.dataset.tab; draw(); }));
    $$('[data-assign]', el).forEach((b) => (b.onclick = guard(async () => { if (!await confirmBox(`Mark ${unassigned.length} entries as ${b.dataset.assign}?`, 'Yes, mark', 'primary')) return; await api.post('assign-accounts', { account: b.dataset.assign }); toast('Done'); draw(); })));
    $('#saveOpen', el)?.addEventListener('click', guard(async () => { await api.put('settings', { opening: { ...opening, [tab]: num($('#open', el).value) } }); await refresh(); toast('Opening balance saved'); draw(); }));
    $('#in', el).onclick = () => entry('in', draw); $('#out', el).onclick = () => entry('out', draw); $('#tf', el).onclick = () => transfer(draw);

    // statement for the chosen account: oldest first for the running balance, shown newest first
    const rows = all.filter((x) => (tab === 'unassigned' ? !x.acct : x.acct === tab)).sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
    let run = tab === 'unassigned' ? 0 : opening[tab] || 0; rows.forEach((r) => { run += r.in - r.out; r.bal = run; });
    const view = rows.reverse();
    const t = $('#t', el);
    dataTable(t, {
      rows: view, search: ['ref', 'party', 'detail', 'type'], page: 100, empty: 'No entries in this account yet.',
      cols: [{ key: 'date', label: 'Date', render: (r) => dmy(r.date) }, { key: 'type', label: 'Type', render: (r) => badge(r.type, r.type === 'Receipt' ? 'ok' : r.type === 'Payment voucher' ? 'warn' : 'blue') }, { key: 'ref', label: 'Ref' }, { key: 'party', label: 'Party' }, { key: 'detail', label: 'Detail' }, { key: 'in', label: 'In', num: true, render: (r) => (r.in ? `<span class="pos">${money(r.in, 3)}</span>` : '') }, { key: 'out', label: 'Out', num: true, render: (r) => (r.out ? `<span class="neg">${money(r.out, 3)}</span>` : '') }, ...(tab === 'unassigned' ? [] : [{ key: 'bal', label: 'Balance', num: true, render: (r) => `<b>${money(r.bal, 3)}</b>` }])],
      onRow: (r) => (r.link ? (location.hash = r.link) : entry(r.manual.direction, draw, r.manual)),
      actions: (r) => (r.manual ? '<button class="btn sm danger" data-act="del">Delete</button>' : `<button class="btn sm" data-act="move">${r.acct === 'cash' ? '→ Bank' : r.acct === 'bank' ? '→ Cash' : 'Set'}</button>`),
      foot: (l) => `<tr><td colspan="5">Total (${l.length})</td><td class="num">${money(l.reduce((s, r) => s + r.in, 0), 3)}</td><td class="num">${money(l.reduce((s, r) => s + r.out, 0), 3)}</td><td></td><td></td></tr>`,
    });
    t.addEventListener('act', guard(async (e) => {
      const { act, row } = e.detail;
      if (act === 'del' && await confirmBox('Delete this entry?')) { await api.del(`t/cash_entries/${row.manual.id}`); draw(); }
      if (act === 'move') { const id = Number(row.key.slice(1)); const to = row.acct === 'bank' ? 'cash' : 'bank'; await api.put(`t/${row.key[0] === 'r' ? 'receipts' : 'payments'}/${id}`, { account: to }); toast(`Moved to ${to}`); draw(); }
    }));
  };
  draw();
}

function entry(dir, done, row = null) {
  const fields = [{ key: 'date', label: 'Date', type: 'date' }, { key: 'account', label: 'Account', type: 'select', options: [['bank', 'Bank'], ['cash', 'Cash']] }, { key: 'amount', label: 'Amount (BD)', type: 'number', required: true }, { key: 'category', label: 'Category', type: 'select', options: dir === 'in' ? CATS_IN : CATS_OUT }, { key: 'party', label: dir === 'in' ? 'From' : 'To' }, { key: 'note', label: 'Note', full: true }];
  editRow({ table: 'cash_entries', title: row ? 'Edit entry' : dir === 'in' ? 'Money in' : 'Money out', fields, row, defaults: { date: today(), account: S.settings.last_account || 'bank' }, before: (d) => ({ ...d, direction: dir }), onSaved: async () => done() });
}
function transfer(done) {
  const w = document.createElement('div');
  const fields = [{ key: 'date', label: 'Date', type: 'date' }, { key: 'from', label: 'From', type: 'select', options: [['cash', 'Cash'], ['bank', 'Bank']] }, { key: 'amount', label: 'Amount (BD)', type: 'number' }, { key: 'note', label: 'Note', full: true, hint: 'e.g. cash deposited at the bank' }];
  w.innerHTML = formHTML(fields, { date: today(), from: 'cash' });
  modal({ title: 'Transfer between cash and bank', body: w, buttons: [{ label: 'Cancel' }, { label: 'Transfer', kind: 'primary', onClick: async () => { const d = readForm(w, fields); if (!(d.amount > 0)) { toast('Enter the amount', 'err'); return false; } const to = d.from === 'cash' ? 'bank' : 'cash'; await api.post('t/cash_entries', { date: d.date, account: d.from, direction: 'out', amount: d.amount, category: 'Transfer', party: `to ${to}`, note: d.note }); await api.post('t/cash_entries', { date: d.date, account: to, direction: 'in', amount: d.amount, category: 'Transfer', party: `from ${d.from}`, note: d.note }); toast('Transferred'); done(); } }] });
}
