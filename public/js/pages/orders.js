import { S, refresh } from '../app.js';
import { openPoDialog } from '../po-dialog.js';
import { openTaskForm, addStandardTasks } from '../task-form.js';
import { fmtMin, variance } from '../time.js';
import { levelOf } from '../perm.js';
import { creditLeft, creditState, creditBalance, useCredit } from './credits.js';
import { api, $, $$, esc, money, qty as fq, num, dmy, today, dataTable, editRow, confirmBox, toast, guard, badge, modal, mapLink, orderBar } from '../ui.js';
import { quoteTotals, hasVat } from '../calc.js';
import { orderVat } from '../vat.js';
import { printView, docHeader, L, AR, wordsBlock, termsBlock } from '../doc.js';
import { attachmentsPanel } from '../attachments.js';
import { openEventDialog } from './calendar.js';

export async function render(el, [id, sub]) {
  if (id && sub === 'invoice') return invoicePrint(el, Number(id));
  if (id) return detail(el, Number(id));
  const rows = await api.get('ledger');
  const sum = (k, l = rows) => l.reduce((s, r) => s + (r[k] || 0), 0);
  el.innerHTML = `<div class="ph"><h1>Orders &amp; Invoices</h1><span class="sub">Customer ledger — what was sold, collected and what is still due</span><span class="grow"></span><button class="btn primary" id="new" ${levelOf(S.me, 'orders') === 'edit' ? '' : 'hidden'}>+ New order</button></div>
    <div class="cards"><div class="card stat"><div class="k">Invoiced</div><div class="v">${money(sum('amount'), 2)}</div></div><div class="card stat"><div class="k">Collected</div><div class="v">${money(sum('paid'), 2)}</div></div><div class="card stat"><div class="k">Outstanding</div><div class="v ${sum('balance') > 0 ? 'neg' : ''}">${money(sum('balance'), 2)}</div></div><div class="card stat"><div class="k">Profit (invoiced − linked purchases)</div><div class="v">${money(sum('profit'), 2)}</div></div></div><div id="t"></div>`;
  const fields = [
    { key: 'inv', label: 'Invoice / order #', hint: 'Leave blank for the next number: ' + S.next.invoice }, { key: 'date', label: 'Date', type: 'date' },
    { key: 'client', label: 'Client', required: true }, { key: 'mobile', label: 'Mobile' }, { key: 'site', label: 'Site' }, { key: 'gps', label: '📍 Location pin (GPS)', hint: 'Like 26.2235, 50.5876 — or paste a Google Maps link' },
    { key: 'amount', label: 'Gross amount (BD)', type: 'number' }, { key: 'vat', label: 'VAT included in the amount (BD)', type: 'number', hint: 'Leave empty to work it out from the quotation / VAT rate' }, { key: 'client_vat', label: 'Customer VAT No.' }, { key: 'done', label: 'Work completed', type: 'check' }, { key: 'note', label: 'Note', full: true },
  ];
  const open = (row) => editRow({ table: 'orders', title: row ? `Edit ${row.inv}` : 'New order', fields, row, defaults: { date: today() }, onSaved: async () => { await refresh(); render(el, []); } });
  $('#new', el).onclick = () => open(null);
  const t = $('#t', el);
  dataTable(t, {
    rows, search: ['inv', 'client', 'site', 'mobile'], page: 60, filterKey: 'orders',
    cols: [
      { key: 'inv', label: 'Inv', render: (r) => `<b>${esc(r.inv)}</b>` }, { key: 'date', label: 'Date', render: (r) => dmy(r.date) },
      { key: 'client', label: 'Client' }, { key: 'site', label: 'Site', render: (r) => `${esc(r.site || '')} ${mapLink(r.gps, r.site)}` }, { key: 'mobile', label: 'Mobile' },
      { key: 'amount', label: 'G.Amount', num: true, render: (r) => money(r.amount, 2) }, { key: 'paid', label: 'Paid', num: true, render: (r) => money(r.paid, 2) },
      { key: 'balance', label: 'Balance', num: true, render: (r) => `<span class="${r.balance > 0.0005 ? 'neg' : ''}">${money(r.balance, 2)}</span>` },
      { key: 'profit', label: 'Profit', num: true, render: (r) => money(r.profit, 2) },
      { key: 'done', label: 'Status', render: (r) => (r.done ? badge('Done', 'ok') : badge('Open', 'warn')) },
      { key: 'progress', label: 'Work progress', sort: (r) => r.progress || 0, render: (r) => orderBar(r) },
    ],
    filters: [{ label: 'All' }, { label: 'Open', fn: (r) => !r.done }, { label: 'Unpaid', fn: (r) => r.balance > 0.0005 }],
    onRow: (r) => (location.hash = `#/orders/${r.id}`),
    actions: levelOf(S.me, 'orders') === 'edit' ? () => '<button class="btn sm" data-act="edit">Edit</button>' : undefined,
    foot: (l) => `<tr><td colspan="5">Total (${l.length})</td><td class="num">${money(sum('amount', l), 2)}</td><td class="num">${money(sum('paid', l), 2)}</td><td class="num">${money(sum('balance', l), 2)}</td><td class="num">${money(sum('profit', l), 2)}</td><td colspan="3"></td></tr>`,
  });
  t.addEventListener('act', (e) => open(e.detail.row));
}

async function detail(el, id) {
  const [ledger, receipts, purchases, allTasks, credits] = await Promise.all([api.get('ledger'), api.get('t/receipts'), api.get('t/purchases').catch(() => []), api.get('tasks-view').catch(() => []), api.get('t/credit_notes').catch(() => [])]);
  const o = ledger.find((x) => x.id === id); if (!o) { el.innerHTML = '<p class="err">Order not found</p>'; return; }
  const ro = levelOf(S.me, 'orders') !== 'edit'; const custRow = o.customer_id ? (await api.get('t/customers').catch(() => [])).find((x) => x.id === o.customer_id) : null;
  const creditRows = await api.get('t/customer_credits').catch(() => []);
  const myCredits = creditRows.filter((c) => creditState(c) === 'active' && String(c.client || '').trim().toLowerCase() === String(o.client || '').trim().toLowerCase()).sort((a, b) => (a.expires || '9999').localeCompare(b.expires || '9999'));
  const earned = creditRows.find((c) => c.order_inv === o.inv && c.status !== 'void'); const heldBal = creditBalance(creditRows, o.client);
  const tasks = allTasks.filter((t) => t.order_inv === o.inv && !t.hidden);
  const cns = credits.filter((c) => c.order_inv === o.inv); const rec = receipts.filter((r) => r.order_inv === o.inv); const pur = purchases.filter((p) => p.order_inv === o.inv);
  el.innerHTML = `<div class="ph"><h1>${esc(o.inv)} — ${esc(o.client)}</h1>${custRow ? `<a class="badge blue" href="#/customers/${custRow.id}" title="Open the customer">${esc(custRow.code)}</a>` : ''}${o.done ? badge('Done', 'ok') : badge('Open', 'warn')}<span class="grow"></span><a class="btn" href="#/orders">← Orders</a></div>
  <div class="card" style="margin-bottom:12px"><div class="k muted" style="font-size:12px;text-transform:uppercase;margin-bottom:6px">Work progress — whole order</div>${orderBar(o, true)}</div>
  ${heldBal > 0 || earned ? `<div class="card" style="margin-bottom:12px;border-color:var(--ok,#12b76a)"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">🎁 <span>${heldBal > 0 ? `<b>${esc(o.client)}</b> has <b>BD ${money(heldBal, 2)}</b> of credit to spend${myCredits[0]?.expires ? ` (the first part expires ${dmy(myCredits[0].expires)})` : ''}. ` : ''}${earned ? `This invoice earned <b>BD ${money(earned.amount, 2)}</b> credit${earned.expires ? ` valid until ${dmy(earned.expires)}` : ''}.` : ''}</span><span class="grow"></span>${heldBal > 0 && o.balance > 0.0005 ? '<button class="btn primary" id="usecr">Use credit on this invoice</button>' : ''}</div></div>` : ''}
  <div class="cards"><div class="card stat"><div class="k">Gross amount</div><div class="v">${money(o.amount, 2)}</div></div><div class="card stat"><div class="k">Paid</div><div class="v">${money(o.paid, 2)}</div></div>${o.credit ? `<div class="card stat"><div class="k">Credit notes</div><div class="v">− ${money(o.credit, 2)}</div></div>` : ''}<div class="card stat"><div class="k">Balance</div><div class="v ${o.balance > 0 ? 'neg' : 'pos'}">${money(o.balance, 2)}</div></div><div class="card stat"><div class="k">Purchases / Profit</div><div class="v">${money(o.cost, 2)} <small class="muted">/ ${money(o.profit, 2)}</small></div></div></div>
  <div class="card"><div class="form" style="grid-template-columns:repeat(4,1fr)"><div><span class="muted">Date</span><br>${dmy(o.date)}</div><div><span class="muted">Site</span><br>${esc(o.site)} ${mapLink(o.gps, o.site)}</div><div><span class="muted">Mobile</span><br>${esc(o.mobile)}</div><div><span class="muted">Quotation</span><br>${esc(o.quote_no || '—')}</div></div></div>
  <div class="cols2" style="margin-top:14px;align-items:start">
   <div class="card"><h3>Receipts (${rec.length})</h3><table class="grid"><thead><tr><th>Rec #</th><th>Date</th><th class="num">Amount</th><th></th></tr></thead><tbody>${rec.map((r) => `<tr><td>${esc(r.no)}</td><td>${dmy(r.date)}</td><td class="num">${money(r.amount, 2)}</td><td class="act"><a class="btn sm" href="#/receipts/${r.id}/print">Print</a></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No receipts yet</td></tr>'}</tbody></table></div>
   <div class="card"><h3>Purchases charged to this order (${pur.length})</h3><table class="grid"><thead><tr><th>Date</th><th>Supplier</th><th class="num">Amount</th></tr></thead><tbody>${pur.map((p) => `<tr><td>${dmy(p.date)}</td><td>${esc(p.supplier)}</td><td class="num">${money(p.amount, 2)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">None</td></tr>'}</tbody></table></div></div>
  ${cns.length ? `<div class="card" style="margin-top:14px"><h3>Credit notes (${cns.length})</h3><table class="grid"><tbody>${cns.map((c) => `<tr class="click" onclick="location.hash='#/creditnotes/${c.id}/print'"><td><b>${esc(c.no)}</b></td><td>${dmy(c.date)}</td><td>${esc(c.reason || '')}</td><td class="num">${money(c.total, 2)}</td><td>${c.status === 'approved' ? badge('Approved', 'ok') : c.status === 'pending' ? badge('Waiting for admin', 'warn') : badge('Rejected', 'bad')}</td></tr>`).join('')}</tbody></table></div>` : ''}
  <div class="card" style="margin-top:14px" id="photos"></div>
  <div class="card" style="margin-top:14px" id="portal"></div>
  <div class="card" style="margin-top:14px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h3 style="margin:0">Tasks (${tasks.length})</h3><span class="grow"></span><button class="btn sm" id="stdt">Add standard tasks</button><button class="btn sm primary" id="newt">+ Task</button></div><table class="grid" style="margin-top:8px"><thead><tr><th>Task</th><th>Worker</th><th>Status</th><th class="num">Progress</th><th class="num">Estimate</th><th class="num">Actual</th><th>Vs est.</th></tr></thead><tbody>${tasks.map((t) => `<tr class="click" onclick="location.hash='#/tasks/${t.id}'"><td><b>${esc(t.title)}</b> <span class="muted">${esc(t.stage || '')}</span></td><td>${esc([t.assignee_name, ...(t.team_names || [])].filter(Boolean).join(', ') || '—')}</td><td>${badge({ todo: 'To do', doing: 'In progress', blocked: 'Blocked', done: 'Done' }[t.status], t.status === 'done' ? 'ok' : t.status === 'blocked' ? 'bad' : t.status === 'doing' ? 'warn' : '')}${t.ticking ? ' <span class="pos">●</span>' : ''}</td><td class="num">${Math.round(t.progress || 0)}%</td><td class="num">${t.estimate_min ? fmtMin(t.estimate_min) : '—'}</td><td class="num">${fmtMin(t.actual_min)}</td><td>${t.actual_min ? variance(t.estimate_min, t.actual_min) : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No tasks yet</td></tr>'}</tbody></table></div>
  <div class="sticky-actions"><a class="btn primary" ${ro ? 'hidden' : ''} href="#/receipts/new/${o.id}">+ Receive payment</a><a class="btn" href="#/orders/${o.id}/invoice">Tax invoice</a><button class="btn" id="sched" ${ro ? 'hidden' : ''}>Schedule installation</button><a class="btn" ${ro ? 'hidden' : ''} href="#/creditnotes/new/${encodeURIComponent(o.inv)}">Credit note</a><a class="btn" href="#/statements/${encodeURIComponent(o.client)}">Customer statement</a><button class="btn" id="po" ${ro ? 'hidden' : ''}>Purchase order</button><button class="btn" id="done" ${ro ? 'hidden' : ''}>${o.done ? 'Re-open order' : 'Mark as done'}</button><button class="btn danger" id="del" ${ro ? 'hidden' : ''}>Delete order</button></div>`;
  if (!ro) portalCard($('#portal', el), o); else $('#portal', el).hidden = true;
  attachmentsPanel($('#photos', el), { type: 'order', key: o.inv, title: 'Photos & files', kinds: [['before', 'Before'], ['after', 'After'], ['file', 'Document']], tag: '' });
  $('#usecr', el)?.addEventListener('click', () => useCredit(myCredits[0], ledger, () => detail(el, id), o.inv));
  $('#sched', el).onclick = () => openEventDialog({ order: o, onSaved: () => toast('Added to the calendar') });
  $('#newt', el).onclick = () => openTaskForm({ order_inv: o.inv, onSaved: () => detail(el, id) });
  $('#stdt', el).onclick = guard(() => addStandardTasks(o.inv, () => detail(el, id)));
  $('#po', el).onclick = guard(async () => { const q = o.quote_no ? (await api.get('t/quotes')).find((x) => x.number === o.quote_no) : null; openPoDialog({ quote: q || null, orderInv: o.inv, onDone: () => (location.hash = '#/pos') }); });
  $('#done', el).onclick = guard(async () => { await api.put(`t/orders/${id}`, { done: o.done ? 0 : 1 }); toast('Updated'); detail(el, id); });
  $('#del', el).onclick = guard(async () => { if (await confirmBox(`Delete order ${o.inv}? Receipts keep their reference.`)) { await api.del(`t/orders/${id}`); location.hash = '#/orders'; } });
}

// ------------------------------------------------------------------ tax invoice
async function invoicePrint(el, id) {
  const [ledger, quotes, receipts, credits] = await Promise.all([api.get('ledger'), api.get('t/quotes'), api.get('t/receipts'), api.get('t/credit_notes')]);
  const o = ledger.find((x) => x.id === id); if (!o) { el.innerHTML = '<p class="err">Order not found</p>'; return; }
  const c = S.settings.company || {}; const rate = Number(S.settings.vat_rate ?? 10);
  const q = quotes.find((x) => x.number === o.quote_no);
  const vat = orderVat(o, new Map(quotes.map((x) => [x.number, x])), rate); const net = Math.round((o.amount - vat) * 1000) / 1000;
  const T = q ? quoteTotals(q) : null; const lineRate = q ? Number(q.vat_rate) || 0 : (net > 0 ? Math.round(vat / net * 1000) / 10 : 0);
  let n = 0;
  const lines = q ? (q.items || []).map((it) => {
    if (it.kind === 'note') return `<tr><td></td><td colspan="5"><b>${esc(it.desc)}</b></td></tr>`;
    n++; const a = num(it.qty) * num(it.price);
    return `<tr><td>${n}</td><td>${esc(it.desc)}${it.w && it.h ? ` <span class="muted">${fq(it.w)} × ${fq(it.h)} cm</span>` : ''}${it.note ? `<div class="note">${esc(it.note).replace(/\n/g, '<br>')}</div>` : ''}</td><td class="n">${fq(it.qty)}</td><td class="n">${money(it.price, 3)}</td><td class="n">${money(a, 3)}</td><td class="n">${hasVat(it) ? fq(lineRate) : 0}%</td></tr>`;
  }).join('') : `<tr><td>1</td><td>As per agreement / quotation ${esc(o.quote_no || '')}${o.site ? ` — ${esc(o.site)}` : ''}</td><td class="n">1</td><td class="n">${money(net, 3)}</td><td class="n">${money(net, 3)}</td><td class="n">${fq(lineRate)}%</td></tr>`;
  const myCredits = credits.filter((x) => x.order_inv === o.inv && x.status === 'approved');
  const rec = receipts.filter((r) => r.order_inv === o.inv).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const clientVat = o.client_vat || q?.client_vat || '';
  const html = `${docHeader('TAX INVOICE', AR.taxInvoice)}
    <div class="meta"><div><b>${L('invoice', 'Invoice No.')}:</b> ${esc(o.inv)}</div><div><b>${L('date', 'DATE')}:</b> ${dmy(o.date)}</div><div><b>${L('customer', 'Customer')}:</b> ${esc(o.client)}</div><div><b>${L('customerVat', 'Customer VAT No.')}:</b> ${esc(clientVat || '—')}</div><div><b>${L('site', 'Site')}:</b> ${esc(o.site || '')}</div><div><b>${L('mobile', 'Mobile')}:</b> ${esc(o.mobile || '')}</div>${o.quote_no ? `<div><b>${L('quote', 'Quotation')}:</b> ${esc(o.quote_no)}</div>` : ''}<div><b>${L('vatNo', 'Supplier VAT No.')}:</b> ${esc(c.vat_no || '— (set it in Settings)')}</div></div>
    <table class="items-print"><thead><tr><th>#</th><th>${L('description', 'Description')}</th><th class="n">${L('qty', 'Qty')}</th><th class="n">${L('unit', 'Unit price')}</th><th class="n">${L('net', 'Net')}</th><th class="n">${L('vat', 'VAT')}</th></tr></thead><tbody>${lines}</tbody></table>
    <div class="tot">${T ? `<div><span>${L('subtotal', 'Total (excl. VAT)')}</span><span>${money(T.subtotal, 3)}</span></div>${T.after ? '' : (T.discount ? `<div><span>${L('disc', 'Discount')}</span><span>- ${money(T.discount, 3)}</span></div>` : '')}` : ''}<div><span>${L('net', 'Taxable amount')}</span><span>${money(T ? T.amount : net, 3)}</span></div><div><span>${L('vat', 'VAT')} ${fq(lineRate)}%</span><span>${money(T ? T.vat : vat, 3)}</span></div>${T && T.waived ? `<div><span>${L('vatAdj', 'VAT adjustment')}</span><span>- ${money(T.waived, 3)}</span></div>` : ''}${T && T.after && T.discount ? `<div><span>${L('total', 'Total with VAT')}</span><span>${money(T.total, 3)}</span></div><div><span>${L('disc', 'Discount (after VAT)')}</span><span>- ${money(T.discount, 3)}</span></div>` : ''}<div class="g"><span>${L('grand', 'Invoice total BD')}</span><span>${money(o.amount, 3)}</span></div></div>
    ${wordsBlock(o.amount)}
    ${rec.length || myCredits.length ? `<table style="margin-top:10px"><thead><tr><th>${L('date', 'Date')}</th><th>${L('description', 'Payments & credits')}</th><th class="n">${L('amount', 'Amount')}</th></tr></thead><tbody>${rec.map((r) => `<tr><td>${dmy(r.date)}</td><td>${L('receipt', 'Receipt')} ${esc(r.no)} — ${esc(r.method || '')}${r.ref ? ' #' + esc(r.ref) : ''}</td><td class="n">${money(r.amount, 3)}</td></tr>`).join('')}${myCredits.map((r) => `<tr><td>${dmy(r.date)}</td><td>${L('creditNote', 'Credit note')} ${esc(r.no)}</td><td class="n">- ${money(r.total, 3)}</td></tr>`).join('')}<tr><td colspan="2"><b>${L('due', 'Balance due')}</b></td><td class="n"><b>${money(o.balance, 3)}</b></td></tr></tbody></table>` : `<p><b>${L('due', 'Balance due')}:</b> ${money(o.balance, 3)}</p>`}
    ${(() => { const lines = [c.bank, ...(S.bank_accounts || []).filter((x) => x.print && x.active !== 0).map((x) => [x.name, x.bank, x.number].filter(Boolean).join(' — '))].filter(Boolean); return lines.length ? `<p style="margin-top:10px"><b>${L('bank', 'Bank details')}:</b><br>${lines.map(esc).join('<br>')}</p>` : ''; })()}
    <div class="sign"><div>${L('prepared', 'Prepared')}</div><div>${L('custSign', 'Customer')}</div></div>
    ${termsBlock(S.settings.invoice_notes?.length ? S.settings.invoice_notes : [], [])}`;
  printView(el, { back: `#/orders/${id}`, html });
}

/** The customer's page for this order: a code to send, and what the customer may see (progress is always shown; photos and kitchens only when you tick them). */
async function portalCard(box, o) {
  let d; try { d = await api.get(`order-portal/${o.id}`); } catch { box.hidden = true; return; }
  const host = location.host.replace(/^(www\.|client\.)/, ''); const link = `https://client.${host}`;
  const draw = () => {
    const sel = new Set(d.portal.photos); const ks = new Set(d.portal.kitchens);
    const msg = `${link}\nOrder: ${o.inv}\nCode: ${d.code}`;
    box.innerHTML = `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h3 style="margin:0">Customer page</h3>${d.enabled ? badge('On', 'ok') : badge('Off', '')}<span class="muted">The customer enters the order number and a code at ${esc(link.replace('https://', ''))} and sees the progress of this order${d.enabled ? '' : ' — switch it on to make a code'}.</span></div>
      ${d.enabled ? `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px"><div><div class="muted" style="font-size:12px">Order number</div><b style="font-size:18px">${esc(o.inv)}</b></div><div><div class="muted" style="font-size:12px">Code</div><b style="font-size:18px;letter-spacing:.08em">${esc(d.code)}</b></div><span class="grow"></span><button class="btn" id="pcopy">Copy message for the customer</button><button class="btn" id="pnew">New code</button><button class="btn danger" id="poff">Switch off</button></div>
      <div style="margin-top:14px"><b>Message shown on top (optional)</b><input id="pmsg" maxlength="500" value="${esc(d.portal.message || '')}" placeholder="e.g. Installation is planned for next week" style="width:100%;margin-top:4px"></div>
      <div style="margin-top:14px"><b>Photos the customer can see</b> <span class="muted">— tick the ones to show (none are shown unless you tick them)</span>${d.photos.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-top:6px">${d.photos.map((a) => `<label style="display:block;cursor:pointer;position:relative"><input type="checkbox" data-ph="${a.id}" ${sel.has(a.id) ? 'checked' : ''} style="position:absolute;top:6px;left:6px;width:18px;height:18px;z-index:1"><img src="/api/files/${a.id}" alt="" style="width:100%;height:84px;object-fit:cover;border-radius:6px;display:block;border:2px solid ${sel.has(a.id) ? 'var(--ok)' : 'transparent'}"><span class="muted" style="font-size:11px">${esc(a.tag || a.file_name)}</span></label>`).join('')}</div>` : '<p class="muted" style="margin:6px 0 0">No photos yet — add some under Photos & files above, or on this order\'s tasks.</p>'}</div>
      <div style="margin-top:14px"><b>Kitchen models the customer can see in 3D</b> ${d.kitchens.length ? `<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px">${d.kitchens.map((x) => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-kt="${x.id}" ${ks.has(x.id) ? 'checked' : ''}> ${esc(x.name)}</label>`).join('')}</div>` : '<span class="muted">— none linked to this order (link a kitchen to this order number first)</span>'}</div>
      <div style="margin-top:14px"><button class="btn primary" id="psave">Save what the customer sees</button></div>` : `<div style="margin-top:12px"><button class="btn primary" id="pon">Switch on and make a code</button></div>`}`;
    const post = async (b) => { d = { ...d, ...(await api.post(`order-portal/${o.id}`, b)) }; draw(); };
    $('#pon', box)?.addEventListener('click', guard(async () => { await post({ action: 'generate' }); toast('Customer page is on'); }));
    $('#pnew', box)?.addEventListener('click', guard(async () => { if (await confirmBox('Make a new code? The old code stops working.')) { await post({ action: 'generate' }); toast('New code'); } }));
    $('#poff', box)?.addEventListener('click', guard(async () => { if (await confirmBox('Switch the customer page off? The customer can no longer open it.')) { await post({ action: 'off' }); toast('Switched off'); } }));
    $('#pcopy', box)?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(msg); toast('Copied — paste it into WhatsApp'); } catch { prompt('Copy this message:', msg); } });
    $('#psave', box)?.addEventListener('click', guard(async () => { await post({ photos: $$('[data-ph]', box).filter((x) => x.checked).map((x) => Number(x.dataset.ph)), kitchens: $$('[data-kt]', box).filter((x) => x.checked).map((x) => Number(x.dataset.kt)), message: $('#pmsg', box).value }); toast('Saved'); }));
  };
  draw();
}
