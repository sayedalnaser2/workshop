import { S, refresh } from '../app.js';
import { api, $, esc, money, qty as fq, num, dmy, today, dataTable, confirmBox, toast, guard, badge } from '../ui.js';
import { openPoDialog } from '../po-dialog.js';
import { printView, docHeader } from '../doc.js';

const ST = { draft: ['Draft', ''], sent: ['Sent', 'blue'], received: ['Received', 'ok'] };

export async function render(el, [id, what]) {
  if (id) return detail(el, Number(id));
  const rows = await api.get('t/purchase_orders');
  el.innerHTML = `<div class="ph"><h1>Purchase Orders</h1><span class="sub">Orders to suppliers for aluminium, glass and accessories — receive them to add to stock and record the purchase</span><span class="grow"></span><button class="btn primary" id="new">+ New purchase order</button></div><div id="t"></div>`;
  $('#new', el).onclick = () => openPoDialog({ onDone: (m) => render(el, []) });
  const t = $('#t', el);
  dataTable(t, {
    rows, search: ['po', 'supplier', 'order_inv', 'quote_no'], page: 50, empty: 'No purchase orders yet. They are created when you turn a quotation into an invoice.',
    cols: [{ key: 'po', label: 'PO #', render: (r) => `<b>${esc(r.po)}</b>` }, { key: 'date', label: 'Date', render: (r) => dmy(r.date) }, { key: 'supplier', label: 'Supplier' }, { key: 'order_inv', label: 'Order' }, { key: 'lines', label: 'Lines', num: true, render: (r) => (r.lines || []).length }, { key: 'total', label: 'Total (BD)', num: true, render: (r) => money(r.total, 2) }, { key: 'status', label: 'Status', render: (r) => badge(...(ST[r.status] || ST.draft)) }],
    filters: [{ label: 'All' }, { label: 'To receive', fn: (r) => r.status !== 'received' }, { label: 'Received', fn: (r) => r.status === 'received' }],
    onRow: (r) => (location.hash = `#/pos/${r.id}`),
  });
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
  const extra = `${po.status === 'draft' ? '<button class="btn" id="sent">Mark as sent</button>' : ''}${po.status !== 'received' ? '<button class="btn primary" id="recv">Receive into stock</button>' : badge('Received', 'ok')}<button class="btn danger" id="del">Delete</button>`;
  printView(el, { back: '#/pos', html, extraButtons: extra });
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
