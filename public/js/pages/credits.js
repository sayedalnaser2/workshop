import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, dmy, today, num, dataTable, confirmBox, toast, guard, badge, modal, formHTML, readForm, datalist } from '../ui.js';

/** Customer credit: earned on big invoices (Settings → Customer credit) or given by hand; spent on a later invoice. */
export const creditLeft = (c) => Math.max(0, Math.round(((Number(c.amount) || 0) - (Number(c.used) || 0)) * 1000) / 1000);
export const creditState = (c, on = today()) => (c.status === 'void' ? 'void' : c.expires && c.expires < on ? 'expired' : creditLeft(c) <= 0.0005 ? 'used' : 'active');
const STATE = { active: ['Active', 'ok'], used: ['Fully used', ''], expired: ['Expired', 'bad'], void: ['Cancelled', 'warn'] };
/** What a customer can still spend right now. */
export const creditBalance = (credits, client) => credits.filter((c) => String(c.client || '').trim().toLowerCase() === String(client || '').trim().toLowerCase() && creditState(c) === 'active').reduce((s, c) => s + creditLeft(c), 0);

export async function render(el) {
  const [rows, ledger] = await Promise.all([api.get('t/customer_credits'), api.get('ledger').catch(() => [])]);
  const t0 = today(); const soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const active = rows.filter((c) => creditState(c) === 'active');
  const outstanding = active.reduce((s, c) => s + creditLeft(c), 0); const expiring = active.filter((c) => c.expires && c.expires <= soon);
  const cfg = S.settings.loyalty || {};
  el.innerHTML = `<div class="ph"><h1>Customer Credit</h1><span class="sub">Credit customers earn on big invoices, to spend on their next purchase</span><span class="grow"></span><button class="btn primary" id="give">+ Give credit</button></div>
    <div class="cards"><div class="card stat"><div class="k">Credit outstanding</div><div class="v">${money(outstanding, 2)}</div></div><div class="card stat"><div class="k">Customers holding credit</div><div class="v">${new Set(active.map((c) => String(c.client).toLowerCase())).size}</div></div><div class="card stat"><div class="k">Expiring in 30 days</div><div class="v ${expiring.length ? 'neg' : ''}">${expiring.length}</div></div></div>
    <p class="muted" style="margin:0 0 10px">${cfg.enabled ? `Automatic credit is <b>on</b>: ${(cfg.tiers || []).map((x) => `invoice of BD ${money(x.min, 0)}+ earns ${x.type === 'percent' ? x.value + '%' : 'BD ' + money(x.value, 2)}`).join(' · ') || 'no tiers set'}${cfg.expiry_months > 0 ? `, valid ${cfg.expiry_months} month(s)` : ', never expires'}.` : 'Automatic credit is <b>off</b> — the admin can switch it on in Settings → Customer credit. You can still give credit by hand.'}</p><div id="t"></div>`;
  const names = [...new Set([...ledger.map((o) => o.client), ...rows.map((c) => c.client)].filter(Boolean))];
  const t = $('#t', el);
  dataTable(t, {
    rows, search: ['client', 'mobile', 'order_inv', 'note'], page: 60, empty: 'No customer credit yet.',
    cols: [{ key: 'client', label: 'Customer', render: (r) => `<b>${esc(r.client)}</b>${r.mobile ? `<div class="muted" style="font-size:11px">${esc(r.mobile)}</div>` : ''}` }, { key: 'order_inv', label: 'Earned on', render: (r) => (r.order_inv ? esc(r.order_inv) : `<span class="muted">${esc(r.note || 'given by hand')}</span>`) }, { key: 'date', label: 'Issued', render: (r) => dmy(r.date) },
      { key: 'amount', label: 'Credit', num: true, render: (r) => money(r.amount, 2) }, { key: 'used', label: 'Used', num: true, render: (r) => money(r.used || 0, 2) }, { key: 'left', label: 'Left', num: true, sort: (r) => creditLeft(r), render: (r) => `<b>${money(creditLeft(r), 2)}</b>` },
      { key: 'expires', label: 'Expires', render: (r) => (r.expires ? `<span class="${r.expires < t0 ? 'neg' : r.expires <= soon ? 'warn' : ''}">${dmy(r.expires)}</span>` : '<span class="muted">never</span>') }, { key: 'status', label: 'Status', render: (r) => badge(...STATE[creditState(r)]) }],
    filters: [{ label: 'Active', fn: (r) => creditState(r) === 'active' }, { label: 'All' }, { label: 'Used / expired', fn: (r) => ['used', 'expired', 'void'].includes(creditState(r)) }],
    actions: (r) => `${creditState(r) === 'active' ? '<button class="btn sm primary" data-act="use">Use…</button> ' : ''}${r.status !== 'void' ? '<button class="btn sm danger" data-act="void">Cancel</button>' : ''}`,
    onRow: (r) => showLog(r),
  });
  const showLog = (r) => { const w = document.createElement('div'); w.innerHTML = `<p style="margin-top:0"><b>${esc(r.client)}</b> — credit BD ${money(r.amount, 2)}, left BD ${money(creditLeft(r), 2)}${r.expires ? ` · expires ${dmy(r.expires)}` : ''}</p>${(r.log || []).length ? `<table class="grid"><thead><tr><th>Date</th><th>Used on</th><th>Receipt</th><th class="num">Amount</th></tr></thead><tbody>${r.log.map((x) => `<tr><td>${dmy(x.date)}</td><td>${esc(x.order_inv)}</td><td>${esc(x.receipt || '')}</td><td class="num">${money(x.amount, 2)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Not used yet.</p>'}${r.note ? `<p class="muted">${esc(r.note)}</p>` : ''}`; modal({ title: 'Credit history', body: w, buttons: [{ label: 'Close' }] }); };
  t.addEventListener('act', guard(async (e) => {
    const { act, row } = e.detail;
    if (act === 'void' && await confirmBox(`Cancel the remaining credit of ${row.client}? Credit already used stays used.`, 'Cancel credit')) { await api.put(`t/customer_credits/${row.id}`, { status: 'void' }); toast('Credit cancelled'); render(el); }
    if (act === 'use') useCredit(row, ledger, () => render(el));
  }));
  $('#give', el).onclick = () => {
    const f = [{ key: 'client', label: 'Customer', required: true, list: 'dl-cc' }, { key: 'mobile', label: 'Mobile' }, { key: 'amount', label: 'Credit (BD)', type: 'number', required: true }, { key: 'expires', label: 'Expires on (leave empty = never)', type: 'date' }, { key: 'note', label: 'Reason', full: true }];
    const w = document.createElement('div'); w.innerHTML = datalist('dl-cc', names) + formHTML(f, { expires: cfg.expiry_months > 0 ? new Date(Date.now() + cfg.expiry_months * 30.4 * 864e5).toISOString().slice(0, 10) : '' });
    modal({ title: 'Give customer credit', body: w, buttons: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => {
      const d = readForm(w, f); if (!d.client || !(d.amount > 0)) { toast('Enter the customer and the amount', 'err'); return false; }
      await api.post('t/customer_credits', { client: d.client.trim(), mobile: d.mobile || '', amount: d.amount, used: 0, date: today(), expires: d.expires || '', order_inv: '', note: d.note || 'Given by hand', status: 'active', log: [] }); toast('Credit given'); render(el);
    } }] });
  };
}

/** Spend some of a credit on one of the customer's open invoices. */
export function useCredit(credit, ledger, done, onlyInv = '') {
  const left = creditLeft(credit); const mine = ledger.filter((o) => (String(o.client || '').trim().toLowerCase() === String(credit.client || '').trim().toLowerCase() || (credit.mobile && o.mobile === credit.mobile)) && o.balance > 0.0005);
  if (!mine.length) return toast(`${credit.client} has no invoice with an amount still due.`, 'err');
  const w = document.createElement('div'); const first = mine.find((o) => o.inv === onlyInv) || mine[0];
  w.innerHTML = `<p style="margin-top:0"><b>${esc(credit.client)}</b> has BD ${money(left, 2)} of credit${credit.expires ? ` (valid until ${dmy(credit.expires)})` : ''}. It is recorded as a receipt paid with credit.</p>
    <label class="field"><span>Invoice</span><select id="cinv">${mine.map((o) => `<option value="${esc(o.inv)}" ${o.inv === first.inv ? 'selected' : ''}>${esc(o.inv)} — due BD ${money(o.balance, 2)}</option>`).join('')}</select></label>
    <label class="field"><span>Amount to use (BD)</span><input id="camt" type="number" step="any" min="0" value="${Math.min(left, first.balance)}"></label>`;
  $('#cinv', w).onchange = () => { const o = mine.find((x) => x.inv === $('#cinv', w).value); $('#camt', w).value = Math.min(left, o.balance); };
  modal({ title: 'Use customer credit', body: w, buttons: [{ label: 'Cancel' }, { label: 'Use credit', kind: 'primary', onClick: async () => {
    const amount = num($('#camt', w).value); if (!(amount > 0)) { toast('Enter the amount', 'err'); return false; }
    const r = await api.post('credits/redeem', { credit_id: credit.id, order_inv: $('#cinv', w).value, amount }); await refresh(); toast(`Used BD ${money(amount, 2)} — receipt ${r.receipt.no}`); done?.();
  } }] });
}
