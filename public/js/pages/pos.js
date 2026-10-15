import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, qty as fq, num, dmy, today, confirmBox, toast, guard, badge, modal, formHTML, readForm, wireRef, requireRef } from '../ui.js';
import { accountChoices, primaryBank } from '../banks.js';
import { openPoDialog } from '../po-dialog.js';
import { printView, docHeader } from '../doc.js';

const ST = { draft: ['Draft', ''], sent: ['Sent', 'blue'], received: ['Received', 'ok'] };

export async function render(el, [id, what]) {
  if (id) return detail(el, Number(id));
  const rows = await api.get('t/purchase_orders');
  let group = sessionStorage.getItem('po-group') || 'date'; let flt = sessionStorage.getItem('po-flt') || 'All'; let q = '';
  el.innerHTML = `<div class="ph"><h1>Purchase Orders</h1><span class="sub">Orders to suppliers for aluminium, glass and accessories — receive them to add to stock, and mark them paid when you pay the supplier</span><span class="grow"></span><button class="btn primary" id="new">+ New purchase order</button></div>
    <div class="cards"><div class="card stat"><div class="k">To receive</div><div class="v">${rows.filter((r) => r.status !== 'received').length}</div></div><div class="card stat"><div class="k">Received, not paid</div><div class="v ${rows.some((r) => r.status === 'received' && !r.paid) ? 'neg' : ''}">${money(rows.filter((r) => r.status === 'received' && !r.paid).reduce((s2, r) => s2 + (r.total || 0), 0), 2)}</div></div><div class="card stat"><div class="k">Unpaid in total</div><div class="v">${money(rows.filter((r) => !r.paid).reduce((s2, r) => s2 + (r.total || 0), 0), 2)}</div></div></div>
    <div class="tbar"><span class="muted">Group by</span><div class="seg" id="grp">${[['date', 'Date'], ['supplier', 'Supplier'], ['order', 'Order']].map(([k, l]) => `<button data-g="${k}" class="${group === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="seg" id="flt">${['All', 'To receive', 'Received', 'Unpaid', 'Paid'].map((l) => `<button data-f="${l}" class="${flt === l ? 'on' : ''}">${l}</button>`).join('')}</div><input type="search" class="search" id="q" placeholder="Search…" aria-label="Search"><span class="count" id="cnt"></span></div><div class="twrap"><table class="grid"><thead><tr><th>PO #</th><th>Date</th><th>Supplier</th><th>Order</th><th class="num">Lines</th><th class="num">Total (BD)</th><th>Received</th><th>Paid</th></tr></thead><tbody id="body"></tbody></table></div>`;
  $('#new', el).onclick = () => openPoDialog({ onDone: () => render(el, []) });
  const keyOf = { date: (r) => r.date || '—', supplier: (r) => r.supplier || '—', order: (r) => r.order_inv || 'No order' };
  const draw = () => {
    const f = { All: () => true, 'To receive': (r) => r.status !== 'received', Received: (r) => r.status === 'received', Unpaid: (r) => !r.paid, Paid: (r) => r.paid }[flt];
    let list = rows.filter(f); if (q) { const t = q.toLowerCase(); list = list.filter((r) => ['po', 'supplier', 'order_inv', 'quote_no'].some((k) => String(r[k] || '').toLowerCase().includes(t))); }
    const map = new Map(); for (const r of list) { const k = keyOf[group](r); (map.get(k) || map.set(k, []).get(k)).push(r); }
    const keys = [...map.keys()].sort((x, y) => (group === 'date' ? y.localeCompare(x) : x.localeCompare(y)));
    $('#body', el).innerHTML = keys.map((k) => { const g = map.get(k); return `<tr><td colspan="8" style="background:var(--soft);font-weight:700">${esc(group === 'date' ? dmy(k) : k)} <span class="muted" style="font-weight:400">· ${g.length} order(s) · BD ${money(g.reduce((s2, r) => s2 + (r.total || 0), 0), 2)}</span></td></tr>${g.sort((x, y) => (y.date || '').localeCompare(x.date || '') || y.id - x.id).map((r) => `<tr class="click" onclick="location.hash='#/pos/${r.id}'"><td><b>${esc(r.po)}</b></td><td>${dmy(r.date)}</td><td>${esc(r.supplier)}</td><td>${esc(r.order_inv || '')}</td><td class="num">${(r.lines || []).length}</td><td class="num">${money(r.total, 2)}</td><td>${badge(...(ST[r.status] || ST.draft))}</td><td>${r.paid ? badge('Paid', 'ok') + (r.paid_date ? `<div class="muted" style="font-size:11px">${dmy(r.paid_date)}</div>` : '') : badge('Unpaid', 'warn')}</td></tr>`).join('')}`; }).join('') || '<tr><td colspan="8" class="empty">No purchase orders here. They are created when you turn a quotation into an invoice.</td></tr>';
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
    <div class="tot"><div class="g"><span>Total BD</span><span>${money(po.total, 2)}</span></div></div>${po.note ? `<p><b>Note:</b> ${esc(po.note)}</p>` : ''}
    <div class="sign"><div>Prepared</div><div>Supplier</div></div>`;
  const extra = `${po.status === 'draft' ? '<button class="btn" id="sent">Mark as sent</button>' : ''}${po.status !== 'received' ? '<button class="btn primary" id="recv">Receive into stock</button>' : badge('Received', 'ok')}${po.paid ? badge('Paid ' + dmy(po.paid_date) + (po.paid_method ? ' · ' + po.paid_method : '') + (po.paid_no ? ' · ' + po.paid_no : ''), 'ok') : '<button class="btn primary" id="pay">Mark as paid…</button>'}<button class="btn danger" id="del">Delete</button>`;
  printView(el, { back: '#/pos', html, extraButtons: extra });
  $('#pay', el)?.addEventListener('click', () => payPo(po, () => detail(el, id)));
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

/** Paying a purchase order makes a payment voucher to the supplier, then marks the order paid (separate from received). */
export function payPo(po, done) {
  const f = [{ key: 'date', label: 'Paid on', type: 'date' }, { key: 'amount', label: 'Amount (BD)', type: 'number' }, { key: 'method', label: 'Paid by', type: 'select', options: ['Cash', 'Benefit', 'Cheque', 'Bank transfer'] }, { key: 'ref', label: 'Reference number' }, { key: 'account', label: 'Paid from', type: 'select', options: [['', 'Automatic (cash → cash box, others → main bank account)'], ...accountChoices(S.bank_accounts)] }];
  const w = document.createElement('div'); w.innerHTML = `<p style="margin-top:0">Pay <b>${esc(po.supplier)}</b> for ${esc(po.po)}. This also creates a payment voucher.</p>` + formHTML(f, { date: today(), amount: po.total, method: 'Cash' }); wireRef(w);
  modal({ title: `Mark ${po.po} as paid`, body: w, buttons: [{ label: 'Cancel' }, { label: 'Pay and save', kind: 'primary', onClick: async () => {
    const d = readForm(w, f); if (!(d.amount > 0)) { toast('Enter the amount', 'err'); return false; } requireRef(d, w);
    const sups = await api.get('t/suppliers'); if (!sups.some((x) => x.name.toLowerCase() === po.supplier.toLowerCase())) await api.post('t/suppliers', { name: po.supplier });
    const v = await api.post('t/payments', { date: d.date, paid_to: po.supplier, category: 'Supplier payment', amount: d.amount, method: d.method, ref: d.ref, account: d.account || (d.method === 'Cash' ? 'cash' : primaryBank(S.bank_accounts)?.key || 'bank'), lines: [{ text: `Purchase order ${po.po}`, amount: d.amount }], note: po.po, done: 1 });
    await api.put(`t/purchase_orders/${po.id}`, { paid: 1, paid_date: d.date, paid_method: d.method, paid_ref: d.ref, paid_no: v.no });
    await refresh(); toast(`Paid — voucher ${v.no}`); done?.();
  } }] });
}
