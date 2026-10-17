import { S, refresh } from '../app.js';
import { api, $, $$, esc, money, dmy, dataTable, confirmBox, toast, guard, badge, modal, formHTML, readForm, mapLink, tip, parseGps } from '../ui.js';
import { levelOf } from '../perm.js';

const FIELDS = [{ key: 'name', label: 'Customer name', required: true, full: true }, { key: 'mobile', label: 'Mobile' }, { key: 'mobile2', label: 'Second mobile' }, { key: 'email', label: 'Email' }, { key: 'vat_no', label: 'VAT No.' }, { key: 'address', label: 'Address / site', full: true }, { key: 'gps', label: '📍 Location pin (GPS)', hint: 'Like 26.2235, 50.5876 — or a Google Maps link' }, { key: 'note', label: 'Notes', type: 'textarea', full: true }];
const FIELDS_EDIT = FIELDS.filter((f) => !['address', 'gps'].includes(f.key)); // after creation, addresses live under Locations
const LOC = [{ key: 'label', label: 'Name of the place', hint: 'Home, Villa 2, Office, Warehouse…' }, { key: 'address', label: 'Address', full: true }, { key: 'gps', label: '📍 Location pin (GPS)', hint: 'Like 26.2235, 50.5876 — or a Google Maps link', full: true }];
const locsOf = (c) => (Array.isArray(c.locations) && c.locations.length ? c.locations : c.address || c.gps ? [{ label: '', address: c.address || '', gps: c.gps || '' }] : []);
const canEdit = () => levelOf(S.me, 'customers') === 'edit';

export async function render(el, [id]) {
  if (id) return detail(el, Number(id));
  return list(el);
}

async function list(el) {
  const rows = (await api.get('customers-view')).map((c) => ({ ...c, nums: [c.code, ...c.inv_nos, ...c.quote_nos, c.mobile, c.mobile2, ...locsOf(c).map((l) => `${l.label} ${l.address}`)].filter(Boolean).join(' ') }));
  el.innerHTML = `<div class="ph"><h1>Customers</h1><span class="sub">Every customer has a number. Search by name, customer number, mobile, invoice or quotation number</span><span class="grow"></span>${canEdit() ? '<button class="btn primary" id="new">+ New customer</button>' : ''}</div>
    <div class="cards"><div class="card stat"><div class="k">Customers</div><div class="v">${rows.length}</div></div><div class="card stat"><div class="k">Owe us</div><div class="v ${rows.some((r) => r.balance > 0.0005) ? 'neg' : ''}">${money(rows.reduce((s, r) => s + Math.max(0, r.balance), 0), 2)}</div></div><div class="card stat"><div class="k">Credit they hold</div><div class="v">${money(rows.reduce((s, r) => s + r.credit, 0), 2)}</div></div></div><div id="t"></div>`;
  dataTable($('#t', el), {
    rows, search: ['code', 'name', 'nums', 'address'], page: 60, empty: 'No customers yet.',
    cols: [{ key: 'num', label: 'No.', sort: (r) => r.num, render: (r) => `<b>${esc(r.code)}</b>` }, { key: 'name', label: 'Customer', render: (r) => `<b>${esc(r.name)}</b><div class="muted" style="font-size:11px">${[r.mobile, r.address].filter(Boolean).map(esc).join(' · ')} ${mapLink(r.gps, r.address)}${locsOf(r).length > 1 ? ` · <b>${locsOf(r).length} locations</b>` : ''}</div>` },
      { key: 'quotes_n', label: 'Quotes', num: true }, { key: 'orders_n', label: 'Invoices', num: true }, { key: 'invoiced', label: 'Invoiced', num: true, render: (r) => money(r.invoiced, 2) },
      { key: 'balance', label: 'Balance', num: true, render: (r) => `<span class="${r.balance > 0.0005 ? 'neg' : ''}">${money(r.balance, 2)}</span>` }, { key: 'credit', label: 'Credit', num: true, render: (r) => (r.credit ? money(r.credit, 2) : '') }, { key: 'last', label: 'Last', render: (r) => dmy(r.last) }],
    filters: [{ label: 'All' }, { label: 'Owe money', fn: (r) => r.balance > 0.0005 }, { label: 'Hold credit', fn: (r) => r.credit > 0 }, { label: 'No invoice yet', fn: (r) => !r.orders_n }],
    onRow: (r) => (location.hash = `#/customers/${r.id}`),
  });
  $('#new', el)?.addEventListener('click', () => editForm(null, (c) => (location.hash = `#/customers/${c.id}`)));
}

function editForm(c, done) {
  const FS = c ? FIELDS_EDIT : FIELDS; const w = document.createElement('div'); w.innerHTML = formHTML(FS, c || {});
  modal({ title: c ? `Edit ${c.code}` : 'New customer', body: w, buttons: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => {
    const d = readForm(w, FS); if (!d.name?.trim()) { toast('Enter the name', 'err'); return false; }
    const r = c ? await api.put(`t/customers/${c.id}`, d) : await api.post('t/customers', d); await refresh(); toast(c ? 'Saved' : `Customer ${r.code} created`); done?.(r);
  } }] });
}

async function detail(el, id) {
  const [view, quotes, ledger, surveys, kitchens, credits] = await Promise.all([api.get('customers-view'), api.get('t/quotes').catch(() => []), api.get('ledger').catch(() => []), api.get('t/surveys').catch(() => []), api.get('t/kitchens').catch(() => []), api.get('t/customer_credits').catch(() => [])]);
  const c = view.find((x) => x.id === id); if (!c) { el.innerHTML = '<p class="err">Customer not found</p>'; return; }
  const norm = (x) => String(x || '').trim().toLowerCase().replace(/\s+/g, ' '); const mine = (r) => r.customer_id === c.id || (!r.customer_id && norm(r.client) === norm(c.name));
  const qs = quotes.filter(mine); const os = ledger.filter(mine); const ss = surveys.filter(mine); const ks = kitchens.filter(mine); const cr = credits.filter((x) => norm(x.client) === norm(c.name));
  const edit = canEdit(); const locs = locsOf(c);
  el.innerHTML = `<div class="ph"><a class="btn" href="#/customers">← Customers</a><h1>${esc(c.name)}</h1>${badge(c.code, 'blue')}<span class="grow"></span>${edit ? '<button class="btn" id="edit">Edit details</button><button class="btn" id="merge">Merge into…</button>' : ''}<a class="btn" href="#/statements/${encodeURIComponent(c.name)}">Statement</a>${edit ? '<button class="btn primary" id="nq">+ New quotation</button>' : ''}</div>
    <div class="cards"><div class="card stat"><div class="k">Invoiced</div><div class="v">${money(c.invoiced, 2)}</div></div><div class="card stat"><div class="k">Paid</div><div class="v">${money(c.paid, 2)}</div></div><div class="card stat"><div class="k">Balance</div><div class="v ${c.balance > 0.0005 ? 'neg' : ''}">${money(c.balance, 2)}</div></div><div class="card stat"><div class="k">Credit</div><div class="v">${money(c.credit, 2)}</div></div></div>
    <div class="card"><div class="form" style="grid-template-columns:repeat(4,1fr)"><div><span class="muted">Customer no.</span><br><b>${esc(c.code)}</b></div><div><span class="muted">Mobile</span><br>${esc(c.mobile || '—')}${c.mobile2 ? '<br>' + esc(c.mobile2) : ''}</div><div><span class="muted">Email</span><br>${esc(c.email || '—')}</div><div><span class="muted">VAT No.</span><br>${esc(c.vat_no || '—')}</div>${c.note ? `<div style="grid-column:1/-1"><span class="muted">Notes</span><br>${esc(c.note)}</div>` : ''}</div></div>
    <div class="card" style="margin-top:14px"><div style="display:flex;gap:8px;align-items:center"><h3 style="margin:0">Locations (${locs.length})</h3><span class="muted">sites this customer is quoted for</span><span class="grow"></span>${edit ? '<button class="btn sm primary" id="addloc">+ Add location</button>' : ''}</div>
      <table class="grid" style="margin-top:8px"><tbody>${locs.map((l, i) => `<tr data-loc="${i}"><td style="width:140px"><b>${esc(l.label || (i === 0 ? 'Main' : 'Site ' + (i + 1)))}</b>${i === 0 && locs.length > 1 ? ' <span class="badge ok">main</span>' : ''}</td><td>${esc(l.address || '—')}</td><td>${mapLink(l.gps, l.address)}</td><td class="act">${edit ? `<button class="btn sm" data-lq="${i}">+ Quotation here</button> <button class="btn sm" data-le="${i}">Edit</button>${i > 0 ? ` <button class="btn sm" data-lm="${i}" title="Make this the main address">Main</button>` : ''} <button class="btn sm danger" data-ld="${i}">×</button>` : ''}</td></tr>`).join('') || '<tr><td class="muted">No location yet — add one so quotations can use it.</td></tr>'}</tbody></table></div>
    <div class="cols2" style="margin-top:14px;align-items:start">
      <div class="card"><h3>Quotations (${qs.length})</h3><table class="grid"><tbody>${qs.map((q) => `<tr class="click"${tip(q)} onclick="location.hash='#/quotes/${q.id}'"><td><b>${esc(q.number)}</b></td><td>${dmy(q.date)}</td><td>${esc(q.status || '')}</td><td>${esc(q.site || '')}</td></tr>`).join('') || '<tr><td class="muted">None</td></tr>'}</tbody></table></div>
      <div class="card"><h3>Invoices (${os.length})</h3><table class="grid"><tbody>${os.map((o) => `<tr class="click"${tip(o)} onclick="location.hash='#/orders/${o.id}'"><td><b>${esc(o.inv)}</b></td><td>${dmy(o.date)}</td><td class="num">${money(o.amount, 2)}</td><td class="num ${o.balance > 0.0005 ? 'neg' : ''}">${money(o.balance, 2)}</td></tr>`).join('') || '<tr><td class="muted">None</td></tr>'}</tbody></table></div></div>
    <div class="cols2" style="margin-top:14px;align-items:start">
      <div class="card"><h3>Site surveys (${ss.length}) &amp; kitchens (${ks.length})</h3><table class="grid"><tbody>${ss.map((s) => `<tr class="click" onclick="location.hash='#/surveys/${s.id}'"><td>Survey</td><td>${dmy(s.date)}</td><td>${esc(s.site || '')}</td></tr>`).join('')}${ks.map((k) => `<tr class="click" onclick="location.hash='#/kitchens/${k.id}'"><td>Kitchen</td><td>${esc(k.name || '')}</td><td>${esc(k.status || '')}</td></tr>`).join('') || (ss.length ? '' : '<tr><td class="muted">None</td></tr>')}</tbody></table></div>
      <div class="card"><h3>Credit (${cr.length})</h3><table class="grid"><tbody>${cr.map((x) => `<tr><td>BD ${money(x.amount, 2)}</td><td>used ${money(x.used || 0, 2)}</td><td>${x.expires ? 'expires ' + dmy(x.expires) : 'no expiry'}</td></tr>`).join('') || '<tr><td class="muted">None</td></tr>'}</tbody></table></div></div>
    ${edit ? '<p style="margin-top:14px"><button class="btn danger" id="del">Delete customer</button> <span class="muted">(only possible while the customer has no records)</span></p>' : ''}`;
  $('#edit', el)?.addEventListener('click', () => editForm(c, () => detail(el, id)));
  const saveLocs = async (arr) => { await api.put(`t/customers/${c.id}`, { locations: arr }); await refresh(); detail(el, id); };
  const locForm = (l, done) => { const w = document.createElement('div'); w.innerHTML = formHTML(LOC, l || {}); modal({ title: l ? 'Edit location' : 'New location', body: w, buttons: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => { const d = readForm(w, LOC); if (!d.address?.trim() && !parseGps(d.gps)) { toast('Enter the address or the location pin', 'err'); return false; } await done({ label: d.label || '', address: d.address || '', gps: parseGps(d.gps) || d.gps || '' }); } }] }); };
  $('#addloc', el)?.addEventListener('click', () => locForm(null, (l) => saveLocs([...locs, l])));
  $$('[data-le]', el).forEach((b) => (b.onclick = () => { const i = Number(b.dataset.le); locForm(locs[i], (l) => saveLocs(locs.map((x, j) => (j === i ? l : x)))); }));
  $$('[data-lm]', el).forEach((b) => (b.onclick = () => { const i = Number(b.dataset.lm); saveLocs([locs[i], ...locs.filter((_, j) => j !== i)]); }));
  $$('[data-ld]', el).forEach((b) => (b.onclick = guard(async () => { const i = Number(b.dataset.ld); if (!await confirmBox('Remove this location? Quotations that used it keep their site.')) return; await saveLocs(locs.filter((_, j) => j !== i)); })));
  $$('[data-lq]', el).forEach((b) => (b.onclick = () => { const l = locs[Number(b.dataset.lq)]; sessionStorage.setItem('prefill-quote', JSON.stringify({ client: c.name, mobile: c.mobile || '', site: l.address || '', gps: l.gps || '', customer_id: c.id })); location.hash = '#/quotes/new'; }));
  $('#nq', el)?.addEventListener('click', () => { sessionStorage.setItem('prefill-quote', JSON.stringify({ client: c.name, mobile: c.mobile || '', site: c.address || '', gps: c.gps || '', customer_id: c.id })); location.hash = '#/quotes/new'; });
  $('#merge', el)?.addEventListener('click', () => {
    const others = view.filter((x) => x.id !== c.id); const w = document.createElement('div');
    w.innerHTML = `<p style="margin-top:0">Everything of <b>${esc(c.code)} ${esc(c.name)}</b> (quotations, invoices, surveys, kitchens, credit) moves to the customer you choose, and <b>${esc(c.code)}</b> is removed. Use this when the same person was entered twice.</p><label class="field"><span>Keep this customer</span><select id="mto">${others.map((x) => `<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}${x.mobile ? ' · ' + esc(x.mobile) : ''}</option>`).join('')}</select></label>`;
    modal({ title: 'Merge customers', body: w, buttons: [{ label: 'Cancel' }, { label: 'Merge', kind: 'primary', onClick: async () => { const to = Number($('#mto', w).value); await api.post('customers/merge', { from: c.id, to }); await refresh(); toast('Merged'); location.hash = `#/customers/${to}`; } }] });
  });
  $('#del', el)?.addEventListener('click', guard(async () => { if (!await confirmBox(`Delete ${c.code} ${c.name}?`)) return; await api.del(`t/customers/${c.id}`); await refresh(); toast('Deleted'); location.hash = '#/customers'; }));
}
