import { S } from '../app.js';
import { api, $, esc, toast, guard } from '../ui.js';

const NAMES = { quotes: 'Quotation', orders: 'Order', receipts: 'Receipt', payments: 'Payment voucher', purchases: 'Purchase', employees: 'Employee', profiles: 'Profile', accessories: 'Accessory', glass_types: 'Glass type', models: 'Model', suppliers: 'Supplier', items: 'Catalogue item', stock: 'Stock', purchase_orders: 'Purchase order', cash_entries: 'Cash / bank entry', employee_events: 'Employee record', attendance: 'Attendance', kitchens: 'Kitchen', kitchen_options: 'Kitchen option', tasks: 'Task', price_items: 'Price list', credit_notes: 'Credit note', events: 'Calendar event', surveys: 'Site survey', attachments: 'Photo / file', users: 'User', settings: 'Settings', import: 'Excel import', employee_docs: 'Employee document' };
const ACT = { created: ['＋', 'pos'], updated: ['✎', ''], deleted: ['🗑', 'neg'], approved: ['✔', 'pos'], rejected: ['✖', 'neg'], imported: ['⇩', ''] };

// the database stores UTC; show the workshop's local time
const local = (ts) => new Date(Date.parse(ts.replace(' ', 'T') + 'Z') + (S.settings.shift?.tz ?? 180) * 60000).toISOString().slice(0, 16).replace('T', ' ');

export async function render(el) {
  const q = { table: '', user: '', from: '', to: '', q: '', offset: 0 }; const users = await api.get('users');
  const draw = async () => {
    const p = new URLSearchParams({ ...q, limit: 100 }); const d = await api.get('audit?' + p);
    el.innerHTML = `<div class="ph"><h1>Audit Trail</h1><span class="sub">Who changed what, and when — kept automatically</span></div>
      <div class="tbar"><input class="search" id="aq" placeholder="Search a number, name or value…" value="${esc(q.q)}"><select id="at" style="width:190px"><option value="">Everything</option>${d.tables.map((t) => `<option value="${t}" ${q.table === t ? 'selected' : ''}>${esc(NAMES[t] || t)}</option>`).join('')}</select><select id="au" style="width:170px"><option value="">Everyone</option>${users.map((u) => `<option value="${u.id}" ${String(q.user) === String(u.id) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select><input type="date" id="af" value="${q.from}" style="width:150px" title="From"><input type="date" id="ato" value="${q.to}" style="width:150px" title="To"><span class="count">${d.total} entries</span></div>
      <div class="twrap"><table class="grid"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Item</th><th>Changes</th></tr></thead><tbody>${d.rows.map((r) => { const a = ACT[r.action] || ['•', '']; return `<tr><td style="white-space:nowrap" class="muted">${esc(local(r.ts))}</td><td>${esc(r.user_name || '—')}</td><td><span class="${a[1]}">${a[0]} ${esc(r.action)}</span> <span class="muted">${esc(NAMES[r.tbl] || r.tbl)}</span></td><td><b>${esc(r.label || '')}</b></td><td style="font-size:12px">${r.changes.map((c) => `<div><span class="muted">${esc(c.f)}:</span> ${c.from !== '' ? `<s class="muted">${esc(c.from)}</s> → ` : ''}<b>${esc(c.to)}</b></div>`).join('')}</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">No entries match.</td></tr>'}</tbody></table></div>
      <div class="pager">${q.offset > 0 ? '<button class="btn sm" id="prev">‹ Newer</button>' : ''}<span>${d.total ? `${q.offset + 1}–${Math.min(d.total, q.offset + 100)} of ${d.total}` : ''}</span>${q.offset + 100 < d.total ? '<button class="btn sm" id="next">Older ›</button>' : ''}</div>`;
    let t; $('#aq', el).oninput = (e) => { clearTimeout(t); t = setTimeout(() => { q.q = e.target.value; q.offset = 0; draw(); }, 350); };
    $('#at', el).onchange = (e) => { q.table = e.target.value; q.offset = 0; draw(); }; $('#au', el).onchange = (e) => { q.user = e.target.value; q.offset = 0; draw(); };
    $('#af', el).onchange = (e) => { q.from = e.target.value; q.offset = 0; draw(); }; $('#ato', el).onchange = (e) => { q.to = e.target.value; q.offset = 0; draw(); };
    $('#prev', el)?.addEventListener('click', () => { q.offset -= 100; draw(); }); $('#next', el)?.addEventListener('click', () => { q.offset += 100; draw(); });
    if (q.q) { const i = $('#aq', el); i.focus(); i.setSelectionRange(q.q.length, q.q.length); }
  };
  draw();
}
