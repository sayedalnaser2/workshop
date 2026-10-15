import { api, $, esc, money } from '../ui.js';
import { TYPES } from '../accounting.js';
import { ledger } from './coa.js';

/** Account Statement: pick any account from the chart, choose the dates, see (and print) every entry with its running balance. */
export async function render(el, [id]) {
  const data = await api.get('accounting'); const accounts = data.accounts; const bal = new Map(data.tb.list.map((a) => [a.id, a]));
  const kids = new Map(); for (const a of accounts) { const k = kids.get(a.parent_id || 0) || []; k.push(a); kids.set(a.parent_id || 0, k); }
  const flat = []; const walk = (a, d) => { flat.push({ a, d }); for (const c of kids.get(a.id) || []) walk(c, d + 1); }; for (const a of kids.get(0) || []) walk(a, 0);
  const cur = Number(id) || 0;
  el.innerHTML = `<div class="ph noprint"><h1>Account Statement</h1><span class="sub">Every entry on any account, with its code, dates and running balance</span><span class="grow"></span>
    <select id="acc" style="min-width:320px"><option value="">— choose an account —</option>${flat.map(({ a, d }) => `<option value="${a.id}" ${a.id === cur ? 'selected' : ''}>${'\u00a0\u00a0'.repeat(d)}${esc(a.code)} — ${esc(a.name)}</option>`).join('')}</select></div><div id="led"></div>`;
  $('#acc', el).onchange = (e) => { location.hash = e.target.value ? `#/accstatement/${e.target.value}` : '#/accstatement'; };
  const box = $('#led', el);
  if (!cur) {
    const rows = flat.filter(({ a }) => { const b = bal.get(a.id); return (b?.ownDebit || b?.ownCredit); });
    box.innerHTML = `<div class="card"><p class="muted" style="margin-top:0">Choose an account above, or click one that has entries:</p><table class="grid"><thead><tr><th>Code</th><th>Account</th><th>Type</th><th class="num">Balance</th></tr></thead><tbody>${rows.map(({ a }) => `<tr style="cursor:pointer" data-go="${a.id}"><td>${esc(a.code)}</td><td><a href="#/accstatement/${a.id}">${esc(a.name)}</a></td><td class="muted">${esc(TYPES[a.type] || a.type)}</td><td class="num"><b>${money(bal.get(a.id)?.balance || 0, 2)}</b></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No entries yet.</td></tr>'}</tbody></table></div>`;
    return;
  }
  await ledger(box, cur, { back: null });
}
