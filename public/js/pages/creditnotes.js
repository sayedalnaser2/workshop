import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, qty as fq, num, today, dmy, toast, guard, confirmBox, dataTable, badge, datalist } from '../ui.js';
import { printView, docHeader, L, bi, wordsBlock, AR } from '../doc.js';

const ST = { approved: ['Approved', 'ok'], pending: ['Waiting for admin', 'warn'], rejected: ['Rejected', 'bad'] };
const stBadge = (s) => badge(...(ST[s] || ['—', '']));

export async function render(el, [a, b, c]) {
  if (a === 'new') return form(el, null, b ? decodeURIComponent(b) : '');
  if (a === 'edit') return form(el, Number(b), '');
  if (a && b === 'print') return print(el, Number(a));
  return list(el);
}

async function list(el) {
  const rows = await api.get('t/credit_notes');
  el.innerHTML = `<div class="ph"><h1>Credit Notes</h1><span class="sub">Returns, corrections and discounts given after the invoice was issued</span><span class="grow"></span><a class="btn primary" href="#/creditnotes/new">+ New credit note</a></div><div id="t"></div>`;
  const t = $('#t', el);
  dataTable(t, {
    rows, search: ['no', 'client', 'order_inv', 'reason'], page: 60, empty: 'No credit notes yet.',
    cols: [{ key: 'no', label: 'Credit note #', render: (r) => `<b>${esc(r.no)}</b>` }, { key: 'date', label: 'Date', render: (r) => dmy(r.date) }, { key: 'order_inv', label: 'Against invoice' }, { key: 'client', label: 'Client' }, { key: 'reason', label: 'Reason' },
      { key: 'total', label: 'Total (BD)', num: true, render: (r) => money(r.total, 3) }, { key: 'status', label: 'Status', render: (r) => stBadge(r.status) + (r.requested_by ? `<div class="muted" style="font-size:11px">by ${esc(r.requested_by)}</div>` : '') }],
    filters: [{ label: 'All' }, { label: 'Waiting', fn: (r) => r.status === 'pending' }, { label: 'Approved', fn: (r) => r.status === 'approved' }],
    onRow: (r) => (location.hash = `#/creditnotes/${r.id}/print`),
    actions: () => '<button class="btn sm" data-act="edit">Edit</button> <button class="btn sm danger" data-act="del">Delete</button>',
    foot: (l) => `<tr><td colspan="5">Total approved</td><td class="num">${money(l.filter((r) => r.status === 'approved').reduce((s, r) => s + r.total, 0), 3)}</td><td></td><td></td></tr>`,
  });
  t.addEventListener('act', guard(async (e) => {
    const { act, row } = e.detail;
    if (act === 'edit') location.hash = `#/creditnotes/edit/${row.id}`;
    if (act === 'del' && await confirmBox(`Delete credit note ${row.no}?`)) { await api.del(`t/credit_notes/${row.id}`); toast('Deleted'); list(el); }
  }));
}

async function form(el, id, orderInv) {
  const [ledger, quotes] = await Promise.all([api.get('ledger'), api.get('t/quotes')]);
  const cn = id ? await api.get(`t/credit_notes/${id}`) : { date: today(), order_inv: orderInv, client: '', client_vat: '', lines: [{ desc: '', qty: 1, price: 0 }], vat_rate: S.settings.vat_rate ?? 10, reason: '' };
  if (!cn.lines?.length) cn.lines = [{ desc: '', qty: 1, price: 0 }];
  const isAdmin = S.me.role === 'admin'; const needsOk = !isAdmin && (S.settings.approvals?.credit_notes ?? true);
  el.innerHTML = `<div class="ph"><h1>${id ? 'Credit note ' + esc(cn.no) : 'New credit note'}</h1>${id ? stBadge(cn.status) : ''}<span class="grow"></span><a class="btn" href="#/creditnotes">← Credit notes</a></div>${datalist('dl-inv', ledger.map((o) => o.inv))}
    ${cn.approval_note && cn.status !== 'approved' ? `<div class="card" style="margin-bottom:12px;border-color:var(--${cn.status === 'rejected' ? 'bad' : 'warn'})">${esc(cn.approval_note)}</div>` : ''}
    <div class="card" style="max-width:900px"><div class="form" style="grid-template-columns:repeat(3,1fr)">
      <label class="field"><span>Credit note #</span><input id="no" value="${esc(cn.no || '')}" placeholder="Auto: ${esc(S.next.credit || '')}"></label>
      <label class="field"><span>Date</span><input id="date" type="date" value="${esc(cn.date)}"></label>
      <label class="field"><span>Against invoice #</span><input id="order_inv" list="dl-inv" value="${esc(cn.order_inv || '')}" autocomplete="off" ${cn.id && cn.order_inv ? 'readonly style="background:var(--soft);cursor:not-allowed" title="Locked — an invoice number can never be changed"' : ''}></label>
      <label class="field"><span>Client</span><input id="client" value="${esc(cn.client || '')}"></label>
      <label class="field"><span>Client VAT number</span><input id="client_vat" value="${esc(cn.client_vat || '')}"></label>
      <label class="field"><span>VAT rate %</span><input id="vat_rate" type="number" step="any" value="${cn.vat_rate ?? 0}"></label>
      <label class="field full"><span>Reason (printed)</span><input id="reason" value="${esc(cn.reason || '')}" placeholder="e.g. Window returned, price correction, discount agreed"></label></div>
      <p class="muted" id="info" style="margin:8px 0 0"></p>
      <div class="items-wrap" style="margin-top:10px"><table class="items" style="min-width:560px"><thead><tr><th></th><th>Description</th><th>Qty</th><th>Unit price (before VAT)</th><th class="tot">Amount</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
      <div style="margin:8px 0;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="add">+ Add line</button><button class="btn" id="fromQ">Copy the invoice lines</button></div>
      <div class="totals" id="tot"></div>
      ${needsOk ? '<p class="muted" style="margin-top:10px">This credit note will wait for the admin to approve it. It does not reduce the customer’s balance until then.</p>' : ''}
      <div style="margin-top:14px;display:flex;gap:8px"><button class="btn primary" id="save">Save credit note</button></div></div>`;
  const rows = $('#rows', el);
  const draw = () => {
    rows.innerHTML = cn.lines.map((l, i) => `<tr data-i="${i}"><td class="n">${i + 1}</td><td style="min-width:260px"><input data-k="desc" value="${esc(l.desc || '')}"></td><td><input class="w-q" data-k="qty" type="number" step="any" value="${l.qty ?? 1}"></td><td><input class="w-m" data-k="price" type="number" step="any" value="${l.price ?? 0}"></td><td class="tot" data-t>${money((l.qty || 0) * (l.price || 0))}</td><td><button class="btn sm danger" data-rm>×</button></td></tr>`).join('');
    totals();
  };
  const totals = () => {
    const net = cn.lines.reduce((s, l) => s + (num(l.qty) * num(l.price)), 0); const vat = net * num(cn.vat_rate) / 100;
    $('#tot', el).innerHTML = `<div class="row"><span>Net</span><b>${money(net)}</b></div><div class="row"><span>VAT ${fq(cn.vat_rate)}%</span><b>${money(vat)}</b></div><div class="row grand"><span>Credit total (BD)</span><span>${money(net + vat)}</span></div>`;
  };
  const info = () => {
    const o = ledger.find((x) => x.inv === $('#order_inv', el).value.trim());
    if (o) { if (!$('#client', el).value) $('#client', el).value = o.client; if (!$('#client_vat', el).value && o.client_vat) $('#client_vat', el).value = o.client_vat; $('#info', el).innerHTML = `${esc(o.client)} — invoice ${money(o.amount, 2)}, paid ${money(o.paid, 2)}${o.credit ? `, credited ${money(o.credit, 2)}` : ''}, <b class="${o.balance > 0 ? 'neg' : 'pos'}">balance ${money(o.balance, 2)}</b>`; } else $('#info', el).textContent = '';
  };
  rows.addEventListener('input', (e) => { const tr = e.target.closest('tr[data-i]'); const l = cn.lines[Number(tr.dataset.i)]; const k = e.target.dataset.k; l[k] = k === 'desc' ? e.target.value : num(e.target.value); $('[data-t]', tr).textContent = money(num(l.qty) * num(l.price)); totals(); });
  rows.addEventListener('click', (e) => { if (e.target.matches('[data-rm]')) { cn.lines.splice(Number(e.target.closest('tr').dataset.i), 1); if (!cn.lines.length) cn.lines.push({ desc: '', qty: 1, price: 0 }); draw(); } });
  $('#add', el).onclick = () => { cn.lines.push({ desc: '', qty: 1, price: 0 }); draw(); };
  $('#vat_rate', el).oninput = (e) => { cn.vat_rate = num(e.target.value); totals(); };
  $('#order_inv', el).oninput = info;
  $('#fromQ', el).onclick = guard(async () => {
    const o = ledger.find((x) => x.inv === $('#order_inv', el).value.trim()); const q = o && quotes.find((x) => x.number === o.quote_no);
    if (!q) return toast('This invoice has no quotation to copy from — add the lines by hand', 'err');
    cn.lines = (q.items || []).filter((i) => i.kind !== 'note').map((i) => ({ desc: [i.desc, i.w && i.h ? `${fq(i.w)}×${fq(i.h)}` : ''].filter(Boolean).join(' '), qty: i.qty, price: i.price })); cn.vat_rate = q.vat_rate ?? cn.vat_rate; $('#vat_rate', el).value = cn.vat_rate; draw();
    toast('Lines copied — delete the lines that are not being credited and set the quantities');
  });
  $('#save', el).onclick = guard(async () => {
    const lines = cn.lines.filter((l) => l.desc || num(l.price));
    const body = { no: $('#no', el).value.trim(), date: $('#date', el).value, order_inv: $('#order_inv', el).value.trim(), client: $('#client', el).value.trim(), client_vat: $('#client_vat', el).value.trim(), vat_rate: num($('#vat_rate', el).value), reason: $('#reason', el).value.trim(), lines };
    if (!body.client) return toast('Enter the client', 'err'); if (!lines.length) return toast('Add at least one line', 'err');
    const saved = id ? await api.put(`t/credit_notes/${id}`, body) : await api.post('t/credit_notes', body);
    await refresh(); toast(saved.status === 'approved' ? `Saved ${saved.no}` : `Saved ${saved.no} — waiting for the admin to approve it`); location.hash = `#/creditnotes/${saved.id}/print`;
  });
  draw(); info();
}

async function print(el, id) {
  const [c, ledger] = await Promise.all([api.get(`t/credit_notes/${id}`), api.get('ledger')]);
  const o = ledger.find((x) => x.inv === c.order_inv);
  const rows = (c.lines || []).map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.desc)}</td><td class="n">${fq(l.qty)}</td><td class="n">${money(l.price, 3)}</td><td class="n">${money((l.qty || 0) * (l.price || 0), 3)}</td></tr>`).join('');
  const html = `${docHeader('TAX CREDIT NOTE', AR.creditNote)}
    ${c.status !== 'approved' ? `<div class="stamp">${c.status === 'rejected' ? 'REJECTED' : 'NOT VALID — WAITING FOR APPROVAL'}</div>` : ''}
    <div class="meta"><div><b>${L('no', 'Credit note')}:</b> ${esc(c.no)}</div><div><b>${L('date', 'DATE')}:</b> ${dmy(c.date)}</div><div><b>${L('against', 'Against invoice')}:</b> ${esc(c.order_inv || '')}${o ? ` (${dmy(o.date)})` : ''}</div><div><b>${L('vatNo', 'Customer VAT No.')}:</b> ${esc(c.client_vat || '—')}</div><div style="grid-column:1/-1"><b>${L('customer', 'Customer')}:</b> ${esc(c.client)}</div>${c.reason ? `<div style="grid-column:1/-1"><b>${L('reason', 'Reason')}:</b> ${esc(c.reason)}</div>` : ''}</div>
    <table class="items-print"><thead><tr><th>#</th><th>${L('description', 'Description')}</th><th class="n">${L('qty', 'Qty')}</th><th class="n">${L('unit', 'Unit')}</th><th class="n">${L('net', 'Net')}</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tot"><div><span>${L('net', 'Net amount')}</span><span>${money(c.net, 3)}</span></div><div><span>${L('vat', 'VAT')} ${fq(c.vat_rate)}%</span><span>${money(c.vat, 3)}</span></div><div class="g"><span>${L('total', 'Credit total BD')}</span><span>${money(c.total, 3)}</span></div></div>
    ${wordsBlock(c.total)}
    <div class="sign"><div>${L('prepared', 'Prepared')} ${esc(c.requested_by || '')}</div><div>${L('received', 'Received by')}</div></div>`;
  printView(el, { back: '#/creditnotes', html });
}
