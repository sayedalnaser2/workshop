import { api, $, $$, esc, money, dmy, today } from '../ui.js';
import { TYPES } from '../accounting.js';

const TABS = [['tb', 'Trial Balance'], ['is', 'Income Statement'], ['bs', 'Balance Sheet']];
export async function render(el) {
  let tab = sessionStorage.getItem('tb-tab') || 'tb'; const year = new Date().getFullYear();
  let from = sessionStorage.getItem('tb-from') ?? `${year}-01-01`; let to = sessionStorage.getItem('tb-to') ?? '';
  const draw = async () => {
    const data = await api.get(`accounting?from=${from}&to=${to}`); const { tb, statements: st } = data; const by = new Map(tb.list.map((a) => [a.id, a]));
    const kids = new Map(); for (const a of tb.list) { const k = kids.get(a.parent_id || 0) || []; k.push(a); kids.set(a.parent_id || 0, k); }
    const period = `${from ? dmy(from) : 'start'} – ${to ? dmy(to) : dmy(today())}`;
    // the account tree flattened, showing only branches that have something in them
    const flat = (types) => { const out = []; const walk = (a, d) => { const r = by.get(a.id); if (!types.includes(a.type) || !(r.debit || r.credit)) return; out.push({ a: r, d }); for (const c of kids.get(a.id) || []) walk(c, d + 1); }; for (const a of kids.get(0) || []) walk(a, 0); return out; };
    const line = (x, col) => `<tr style="${x.a.leaf ? '' : 'font-weight:700'}"><td style="padding-left:${10 + x.d * 18}px">${esc(x.a.code)} — ${esc(x.a.name)}</td><td class="num">${money(col === 'bal' ? x.a.balance : 0, 3)}</td></tr>`;
    const tbRows = tb.list.filter((a) => a.leaf && (a.debit || a.credit));
    const html = {
      tb: `<table class="grid"><thead><tr><th>Code</th><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${tbRows.sort((p, q) => String(p.code).localeCompare(String(q.code), undefined, { numeric: true })).map((a) => `<tr><td>${esc(a.code)}</td><td><a href="#/coa/${a.id}">${esc(a.name)}</a></td><td class="num">${a.tbDebit ? money(a.tbDebit, 3) : ''}</td><td class="num">${a.tbCredit ? money(a.tbCredit, 3) : ''}</td></tr>`).join('') || '<tr><td colspan="4">No entries in this period.</td></tr>'}<tr><td colspan="2"><b>Total</b></td><td class="num"><b>${money(tb.totalDebit, 3)}</b></td><td class="num"><b>${money(tb.totalCredit, 3)}</b></td></tr></tbody></table>${tb.balanced ? '' : '<p class="neg">Debits and credits differ — check the journal vouchers.</p>'}`,
      is: `<table class="grid"><thead><tr><th>Account</th><th class="num">BD</th></tr></thead><tbody><tr><td colspan="2"><b>${TYPES.income}</b></td></tr>${flat(['income']).map((x) => line(x, 'bal')).join('')}<tr><td><b>Total income</b></td><td class="num"><b>${money(st.income, 3)}</b></td></tr><tr><td colspan="2"><b>${TYPES.expense}</b></td></tr>${flat(['expense']).map((x) => line(x, 'bal')).join('')}<tr><td><b>Total expenses</b></td><td class="num"><b>${money(st.expenses, 3)}</b></td></tr><tr><td><b>${st.profit >= 0 ? 'Net profit' : 'Net loss'}</b></td><td class="num"><b>${money(st.profit, 3)}</b></td></tr></tbody></table>`,
      bs: `<table class="grid"><thead><tr><th>Account</th><th class="num">BD</th></tr></thead><tbody><tr><td colspan="2"><b>${TYPES.asset}</b></td></tr>${flat(['asset']).map((x) => line(x, 'bal')).join('')}<tr><td><b>Total assets</b></td><td class="num"><b>${money(st.assets, 3)}</b></td></tr><tr><td colspan="2"><b>${TYPES.liability}</b></td></tr>${flat(['liability']).map((x) => line(x, 'bal')).join('')}<tr><td><b>Total liabilities</b></td><td class="num"><b>${money(st.liabilities, 3)}</b></td></tr><tr><td colspan="2"><b>${TYPES.equity}</b></td></tr>${flat(['equity']).map((x) => line(x, 'bal')).join('')}<tr><td>Profit for the period</td><td class="num">${money(st.profit, 3)}</td></tr><tr><td><b>Total equity</b></td><td class="num"><b>${money(st.equityWithProfit, 3)}</b></td></tr><tr><td><b>Liabilities + equity</b></td><td class="num"><b>${money(st.liabilities + st.equityWithProfit, 3)}</b></td></tr></tbody></table>${st.balanced ? '' : '<p class="neg">The balance sheet does not balance for this period — a balance sheet should be run from the start (leave “From” empty).</p>'}`,
    }[tab];
    el.innerHTML = `<div class="ph"><h1>Trial Balance &amp; Reports</h1><span class="sub">Built automatically from invoices, credit notes, receipts, payment vouchers, purchases, cash/bank entries and journal vouchers</span><span class="grow"></span><button class="btn noprint" id="pr">Print</button></div>
      <div class="tbar noprint"><div class="seg">${TABS.map(([k, l]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div><span class="grow"></span><label class="muted">From <input id="f" type="date" value="${esc(from)}"></label> <label class="muted">to <input id="t" type="date" value="${esc(to)}"></label></div>
      <div class="card doc-like">${html}</div>
      <p class="muted" style="margin-top:10px">${esc(period)}. Balance sheet and trial balance are most meaningful from the start of the books (leave “From” empty); the income statement works for any period.</p>`;
    $$('[data-t]', el).forEach((b) => (b.onclick = () => { tab = b.dataset.t; sessionStorage.setItem('tb-tab', tab); draw(); }));
    for (const [id, set] of [['f', (v) => { from = v; sessionStorage.setItem('tb-from', v); }], ['t', (v) => { to = v; sessionStorage.setItem('tb-to', v); }]]) $('#' + id, el).onchange = (e) => { set(e.target.value); draw(); };
    $('#pr', el).onclick = () => window.print();
  };
  await draw();
}
