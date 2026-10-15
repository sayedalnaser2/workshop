import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, qty as fq, num, dmy, today, confirmBox, toast, guard, badge, modal, formHTML, readForm, wireRef, requireRef, tip } from '../ui.js';
import { accountChoices, primaryBank } from '../banks.js';
import { openPoDialog } from '../po-dialog.js';
import { printView, docHeader } from '../doc.js';

/** What has been paid on a purchase order: the sum of its payments (older orders marked paid in full have no log). */
export const poPaid = (r) => { const log = r.pay_log || []; return log.length ? Math.round(log.reduce((t, x) => t + num(x.amount), 0) * 1000) / 1000 : r.paid ? num(r.total) : 0; };
export const poLeft = (r) => Math.max(0, Math.round((num(r.total) - poPaid(r)) * 1000) / 1000);
export const poPay = (r) => (poLeft(r) <= 0.0005 && (r.paid || poPaid(r) > 0) ? 'paid' : poPaid(r) > 0 ? 'part' : 'unpaid');
const payBadge = (r) => { const k = poPay(r); return k === 'paid' ? badge('Paid', 'ok') + (r.paid_date ? `<div class="muted" style="font-size:11px">${dmy(r.paid_date)}</div>` : '') : k === 'part' ? badge('Partially paid · تم دفعه جزئياً', 'warn') + `<div class="neg" style="font-size:11px">Remaining BD ${money(poLeft(r), 3)}</div>` : badge('Unpaid', 'warn'); };

const ST = { draft: ['Draft', ''], sent: ['Sent', 'blue'], received: ['Received', 'ok'] };

export async function render(el, [id, what]) {
  if (id) return detail(el, Number(id));
  const rows = await api.get('t/purchase_orders');
  let group = sessionStorage.getItem('po-group') || 'date'; let flt = sessionStorage.getItem('po-flt') || 'All'; let q = '';
  el.innerHTML = `<div class="ph"><h1>Purchase Orders</h1><span class="sub">Orders to suppliers for aluminium, glass and accessories — receive them to add to stock, and mark them paid when you pay the supplier</span><span class="grow"></span><button class="btn primary" id="new">+ New purchase order</button></div>
    <div class="cards"><div class="card stat"><div class="k">To receive</div><div class="v">${rows.filter((r) => r.status !== 'received').length}</div></div><div class="card stat"><div class="k">Received, not paid</div><div class="v ${rows.some((r) => r.status === 'received' && poLeft(r) > 0) ? 'neg' : ''}">${money(rows.filter((r) => r.status === 'received').reduce((s2, r) => s2 + poLeft(r), 0), 2)}</div></div><div class="card stat"><div class="k">Unpaid in total</div><div class="v">${money(rows.reduce((s2, r) => s2 + poLeft(r), 0), 2)}</div></div></div>
    <div class="tbar"><span class="muted">Group by</span><div class="seg" id="grp">${[['date', 'Date'], ['supplier', 'Supplier'], ['order', 'Order']].map(([k, l]) => `<button data-g="${k}" class="${group === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="seg" id="flt">${['All', 'To receive', 'Received', 'Unpaid', 'Partially paid', 'Paid'].map((l) => `<button data-f="${l}" class="${flt === l ? 'on' : ''}">${l}</button>`).join('')}</div><input type="search" class="search" id="q" placeholder="Search…" aria-label="Search"><span class="count" id="cnt"></span></div><div class="twrap"><table class="grid"><thead><tr><th>PO #</th><th>Date</th><th>Supplier</th><th>Order</th><th class="num">Lines</th><th class="num">Total (BD)</th><th>Received</th><th>Paid</th></tr></thead><tbody id="body"></tbody></table></div>`;
  $('#new', el).onclick = () => openPoDialog({ onDone: () => render(el, []) });
  const keyOf = { date: (r) => r.date || '—', supplier: (r) => r.supplier || '—', order: (r) => r.order_inv || 'No order' };
  const draw = () => {
    const f = { All: () => true, 'To receive': (r) => r.status !== 'received', Received: (r) => r.status === 'received', Unpaid: (r) => poLeft(r) > 0, 'Partially paid': (r) => poPay(r) === 'part', Paid: (r) => poPay(r) === 'paid' }[flt];
    let list = rows.filter(f); if (q) { const t = q.toLowerCase(); list = list.filter((r) => ['po', 'supplier', 'order_inv', 'quote_no'].some((k) => String(r[k] || '').toLowerCase().includes(t))); }
    const map = new Map(); for (const r of list) { const k = keyOf[group](r); (map.get(k) || map.set(k, []).get(k)).push(r); }
    const keys = [...map.keys()].sort((x, y) => (group === 'date' ? y.localeCompare(x) : x.localeCompare(y)));
    $('#body', el).innerHTML = keys.map((k) => { const g = map.get(k); return `<tr><td colspan="8" style="background:var(--soft);font-weight:700">${esc(group === 'date' ? dmy(k) : k)} <span class="muted" style="font-weight:400">· ${g.length} order(s) · BD ${money(g.reduce((s2, r) => s2 + (r.total || 0), 0), 2)}</span></td></tr>${g.sort((x, y) => (y.date || '').localeCompare(x.date || '') || y.id - x.id).map((r) => `<tr class="click"${tip(r)} onclick="location.hash='#/pos/${r.id}'"><td><b>${esc(r.po)}</b></td><td>${dmy(r.date)}</td><td>${esc(r.supplier)}</td><td>${esc(r.order_inv || '')}</td><td class="num">${(r.lines || []).length}</td><td class="num">${money(r.total, 2)}</td><td>${badge(...(ST[r.status] || ST.draft))}</td><td>${payBadge(r)}</td></tr>`).join('')}`; }).join('') || '<tr><td colspan="8" class="empty">No purchase orders here. They are created when you turn a quotation into an invoice.</td></tr>';
    $('#cnt', el).textContent = `${list.length} order(s)`;
  };
  $$('#grp button', el).forEach((b) => (b.onclick = () => { group = b.dataset.g; sessionStorage.setItem('po-group', group); $$('#grp button', el).forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
  $$('#flt button', el).forEach((b) => (b.onclick = () => { flt = b.dataset.f; sessionStorage.setItem('po-flt', flt); $$('#flt button', el).forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
  $('#q', el).oninput = (e) => { q = e.target.value; draw(); };
  draw();
}

async function detail(el, id) {
  const po = await api.get(`t/purchase_orders/${id}`);
  const sup = (await api.get('t/suppliers')).find((s) => s.name === po.supplier);
  const lines = po.lines || [];
  const html = `${docHeader('PURCHASE ORDER')}
    <div class="meta"><div><b>PO:</b> ${esc(po.po)}</div><div><b>DATE:</b> ${dmy(po.date)}</div><div><b>Supplier:</b> ${esc(po.supplier)}</div><div><b>Order:</b> ${esc(po.order_inv || '')}${po.quote_no ? ` (${esc(po.quote_no)})` : ''}</div>${sup ? `<div><b>Phone:</b> ${esc(sup.phone || '')}</div><div><b>Email:</b> ${esc(sup.email || '')}</div>` : ''}</div>
    <table><thead><tr><th>#</th><th>Item</th><th>Code</th><th>Colour</th><th class="n">Qty</th><th>Unit</th><th class="n">Price</th><th class="n">Total</th></tr></thead><tbody>${lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td>${esc(l.code || '')}</td><td>${esc(l.colour || '')}</td><td class="n">${fq(l.qty)}</td><td>${esc(l.unit || '')}</td><td class="n">${money(l.price, 3)}</td><td class="n">${money(num(l.qty) * num(l.price), 2)}</td></tr>`).join('')}</tbody></table>
    <div class="tot"><div class="g"><span>Total BD</span><span>${money(po.total, 2)}</span></div>${poPaid(po) > 0 ? `<div><span>Paid</span><span>${money(poPaid(po), 3)}</span></div><div><span>${poLeft(po) > 0 ? 'Remaining' : 'Balance'}</span><span>${money(poLeft(po), 3)}</span></div>` : ''}</div>${(po.pay_log || []).length ? `<table style="margin-top:10px"><thead><tr><th>Payment</th><th>Date</th><th>Paid by</th><th class="n">Amount</th></tr></thead><tbody>${po.pay_log.map((x) => `<tr><td>${esc(x.no || '')}</td><td>${dmy(x.date)}</td><td>${esc(x.method || '')}${x.ref ? ' · ' + esc(x.ref) : ''}</td><td class="n">${money(x.amount, 3)}</td></tr>`).join('')}</tbody></table>` : ''}${po.note ? `<p><b>Note:</b> ${esc(po.note)}</p>` : ''}
    <div class="sign"><div>Prepared</div><div>Supplier</div></div>`;
  const extra = `${po.status === 'draft' ? '<button class="btn" id="sent">Mark as sent</button>' : ''}${po.status !== 'received' ? '<button class="btn primary" id="recv">Receive into stock</button>' : badge('Received', 'ok')}${poPay(po) === 'paid' ? badge('Paid ' + dmy(po.paid_date) + (po.paid_method ? ' · ' + po.paid_method : '') + (po.paid_no ? ' · ' + po.paid_no : ''), 'ok') : (poPay(po) === 'part' ? badge(`Partially paid · تم دفعه جزئياً — remaining BD ${money(poLeft(po), 3)}`, 'warn') + `<button class="btn primary" id="payRest">Pay the remaining BD ${money(poLeft(po), 3)}</button><button class="btn" id="pay">Pay part…</button>` : '<button class="btn primary" id="pay">Pay…</button>')}<button class="btn danger" id="del">Delete</button>`;
  printView(el, { back: '#/pos', html, extraButtons: extra });
  $('#pay', el)?.addEventListener('click', () => payPo(po, () => detail(el, id)));
  $('#payRest', el)?.addEventListener('click', () => payPo(po, () => detail(el, id), true));
  $('#sent', el)?.addEventListener('click', guard(async () => { await api.put(`t/purchase_orders/${id}`, { status: 'sent' }); detail(el, id); }));
  $('#del', el).onclick = guard(async () => { if (await confirmBox(`Delete ${po.po}?`)) { await api.del(`t/purchase_orders/${id}`); location.hash = '#/pos'; } });
  $('#recv', el)?.addEventListener('click', guard(async () => {
    if (!await confirmBox(`Receive ${po.po}: add ${lines.length} line(s) to stock and record a purchase of BD ${money(po.total, 2)}?`, 'Receive', 'primary')) return;
    await receivePo(po); toast('Received — stock and purchases updated'); detail(el, id);
  }));
}

/** Add the lines to new stock, record the purchase (so order profit is right) and close the PO. */
export async function receivePo(po) {
  const stock = await api.get('t/stock');
  for (const l of po.lines || []) {
    const q = num(l.qty); if (!(q > 0)) continue;
    const prof = l.profile_id ? S.profiles.find((p) => p.id === l.profile_id) : null;
    const base = { kind: 'new', item_type: l.kind === 'profile' ? 'profile' : l.kind === 'glass' ? 'glass' : l.kind === 'accessory' ? 'accessory' : 'other', profile_id: l.profile_id || null, glass_id: l.glass_id || null, name: l.profile_id || l.glass_id ? '' : l.name, code: l.code || '', colour: l.colour || '', length: prof?.bar_length || null, unit: l.kind === 'profile' ? 'bar' : l.unit || 'ea', unit_cost: num(l.price), date: today() };
    const ex = stock.find((s) => s.kind === 'new' && s.item_type === base.item_type && (s.profile_id || null) === base.profile_id && (s.glass_id || null) === base.glass_id && (s.name || '') === base.name && (s.colour || '') === base.colour && (s.length || null) === base.length);
    if (ex) { await api.put(`t/stock/${ex.id}`, { qty: (ex.qty || 0) + q, unit_cost: base.unit_cost }); ex.qty = (ex.qty || 0) + q; }
    else { const r = await api.post('t/stock', { ...base, qty: q, note: `Received on ${po.po}` }); stock.push(r); }
  }
  await api.post('t/purchases', { date: today(), pv: '-', invoice: po.po, supplier: po.supplier, amount: po.total, order_inv: po.order_inv || '', note: `Purchase order ${po.po}` });
  await api.put(`t/purchase_orders/${po.id}`, { status: 'received' });
}

/** Paying a purchase order makes a payment voucher to the supplier. Pay all of it or part now; the rest stays open until it is paid. */
export function payPo(po, done, rest = false) {
  const left = poLeft(po);
  const f = [{ key: 'date', label: 'Paid on', type: 'date' }, { key: 'amount', label: 'Amount (BD)', type: 'number', hint: `Remaining on this order: BD ${money(left, 3)}. Enter less to pay part of it.` }, { key: 'method', label: 'Paid by', type: 'select', options: ['Cash', 'Benefit', 'Cheque', 'Bank transfer'] }, { key: 'ref', label: 'Reference number' }, { key: 'account', label: 'Paid from', type: 'select', options: [['', 'Automatic (cash → cash box, others → main bank account)'], ...accountChoices(S.bank_accounts)] }];
  const w = document.createElement('div'); w.innerHTML = `<p style="margin-top:0">Pay <b>${esc(po.supplier)}</b> for ${esc(po.po)} (total BD ${money(po.total, 3)}${poPaid(po) > 0 ? `, already paid BD ${money(poPaid(po), 3)}` : ''}). This also creates a payment voucher.</p>` + formHTML(f, { date: today(), amount: left, method: 'Cash' }); wireRef(w);
  modal({ title: rest ? `Pay the remaining on ${po.po}` : `Pay ${po.po}`, body: w, buttons: [{ label: 'Cancel' }, { label: 'Pay and save', kind: 'primary', onClick: async () => {
    const d = readForm(w, f); if (!(d.amount > 0)) { toast('Enter the amount', 'err'); return false; }
    if (d.amount > left + 0.0005) { toast(`That is more than the remaining BD ${money(left, 3)}`, 'err'); return false; } requireRef(d, w);
    const sups = await api.get('t/suppliers'); if (!sups.some((x) => x.name.toLowerCase() === po.supplier.toLowerCase())) await api.post('t/suppliers', { name: po.supplier });
    const part = d.amount < left - 0.0005;
    const v = await api.post('t/payments', { date: d.date, paid_to: po.supplier, category: 'Supplier payment', amount: d.amount, method: d.method, ref: d.ref, account: d.account || (d.method === 'Cash' ? 'cash' : primaryBank(S.bank_accounts)?.key || 'bank'), lines: [{ text: `Purchase order ${po.po}${part ? ' (part payment)' : ''}`, amount: d.amount }], note: po.po, done: 1 });
    const log = [...(po.pay_log?.length ? po.pay_log : po.paid ? [{ date: po.paid_date, amount: po.total, method: po.paid_method, ref: po.paid_ref, no: po.paid_no }] : []), { date: d.date, amount: d.amount, method: d.method, ref: d.ref, no: v.no }];
    const full = num(po.total) - log.reduce((t, x) => t + num(x.amount), 0) <= 0.0005;
    await api.put(`t/purchase_orders/${po.id}`, { pay_log: log, paid: full ? 1 : 0, paid_date: d.date, paid_method: d.method, paid_ref: d.ref, paid_no: v.no });
    await refresh(); toast(full ? `Paid in full — voucher ${v.no}` : `Part paid — voucher ${v.no}, BD ${money(num(po.total) - log.reduce((t, x) => t + num(x.amount), 0), 3)} remaining`); done?.();
  } }] });
}
