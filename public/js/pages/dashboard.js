import { S } from '../app.js';
import { api, $, esc, money, dmy, badge } from '../ui.js';
import { quoteTotals } from '../calc.js';
import { fmtMin, startTicker, ago } from '../time.js';
import { lowStock } from '../stock.js';
import { KINDS as EV_KINDS } from './calendar.js';

/** Grouped bar chart. data: [{label, a, b}] — a = invoiced, b = received. */
export function barChart(data, la = 'Invoiced', lb = 'Received') {
  if (!data.length) return '<p class="muted">No data yet.</p>';
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b])); const bw = 14, gap = 16, W = data.length * (bw * 2 + gap) + 40, H = 170, base = H - 22;
  const bars = data.map((d, i) => { const x = 40 + i * (bw * 2 + gap); const ha = (d.a / max) * (base - 10), hb = (d.b / max) * (base - 10); return `<rect x="${x}" y="${base - ha}" width="${bw}" height="${ha}" fill="var(--brand-2)" rx="2"><title>${esc(d.label)} ${la}: ${money(d.a, 2)}</title></rect><rect x="${x + bw}" y="${base - hb}" width="${bw}" height="${hb}" fill="var(--ok)" rx="2"><title>${esc(d.label)} ${lb}: ${money(d.b, 2)}</title></rect><text x="${x + bw}" y="${H - 6}" font-size="9" text-anchor="middle" fill="var(--muted)">${esc(d.label)}</text>`; }).join('');
  const grid = [0, .5, 1].map((f) => `<line x1="38" x2="${W}" y1="${base - f * (base - 10)}" y2="${base - f * (base - 10)}" stroke="var(--line)"/><text x="34" y="${base - f * (base - 10) + 3}" font-size="9" text-anchor="end" fill="var(--muted)">${Math.round(max * f).toLocaleString()}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMid meet" role="img" aria-label="${la} versus ${lb}">${grid}${bars}</svg><div class="legend"><span><i style="background:var(--brand-2)"></i>${la}</span><span><i style="background:var(--ok)"></i>${lb}</span></div>`;
}

const today10 = () => new Date().toISOString().slice(0, 10);
async function workerHome(el) {
  const [stock, mine, events] = await Promise.all([api.get('t/stock'), api.get('my-tasks'), api.get('t/events').catch(() => [])]);
  const soon = events.filter((e) => e.status !== 'cancelled' && (e.end_date || e.date) >= today10()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const openT = mine.filter((t) => t.status !== 'done'); const run = openT.find((t) => t.running_since && t.running_by === S.me.name); const live = run && run.ticking;
  const low = lowStock(stock, { profiles: S.profiles, glassTypes: S.glass_types, accessories: S.accessories }).length;
  el.innerHTML = `<div class="ph"><h1>Hello ${esc(S.me.name)}</h1><span class="sub">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
  ${run ? `<a class="card" href="#/mytasks" style="display:block;color:inherit;border-color:var(--ok);margin-bottom:14px"><div class="k muted">You are on this task</div><b style="font-size:16px">${esc(run.title)}</b> <span class="muted">${esc(run.order_inv || '')}</span><div style="font-size:22px;font-weight:700;font-variant-numeric:tabular-nums" ${live ? `data-live data-base="${run.actual_min}"` : ''}>${live ? '' : fmtMin(run.actual_min)}</div></a>` : ''}
  <div class="cards"><a class="card stat" href="#/mytasks" style="color:inherit"><div class="k">My open tasks</div><div class="v">${openT.length}</div></a><a class="card stat" href="#/cutting" style="color:inherit"><div class="k">Cutting list</div><div class="v">✂ Open</div></a><a class="card stat" href="#/stock" style="color:inherit"><div class="k">Leftovers in stock</div><div class="v">${Math.round(stock.filter((s) => s.kind === 'leftover').reduce((a, s) => a + Math.max(0, s.qty || 0), 0))}</div></a><a class="card stat" href="#/stock" style="color:inherit"><div class="k">Stock running low</div><div class="v ${low ? 'neg' : ''}">${low}</div></a><a class="card stat" href="#/surveys" style="color:inherit"><div class="k">Site surveys</div><div class="v">📐</div></a><a class="card stat" href="#/models" style="color:inherit"><div class="k">Models</div><div class="v">${S.models.length}</div></a></div>
  ${soon.length ? `<div class="card"><h3>Coming up for you</h3><table class="grid"><tbody>${soon.map((e) => `<tr class="click" onclick="location.hash='#/calendar'"><td><b>${dmy(e.date)}</b> ${esc((e.start || '').slice(0, 5))}</td><td>${esc(e.title)} <span class="muted">${esc([e.client, e.site].filter(Boolean).join(' — '))}</span></td></tr>`).join('')}</tbody></table></div>` : ''}`;
  startTicker(el);
}

export async function render(el) {
  if (S.me?.role === 'worker') return workerHome(el);
  const [s, quotes, tasks, stock, events, staff] = await Promise.all([api.get('summary'), api.get('t/quotes'), api.get('tasks-view'), api.get('t/stock'), api.get('t/events'), api.get('staff')]);
  const names = Object.fromEntries(staff.map((u) => [u.id, u.name]));
  const low = lowStock(stock, { profiles: S.profiles, glassTypes: S.glass_types, accessories: S.accessories });
  const from = today10(); const to = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const soon = events.filter((e) => e.status !== 'cancelled' && e.date <= to && (e.end_date || e.date) >= from).sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || ''));
  const visible = tasks.filter((t) => !t.hidden); const running = visible.filter((t) => t.running_since); const openTasks = visible.filter((t) => t.status !== 'done');
  const c = S.settings.company || {};
  el.innerHTML = `<div class="ph"><h1>${esc(c.name || 'Workshop')}</h1><span class="sub">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span><span class="grow"></span><a class="btn primary" href="#/quotes/new">+ New quotation</a><a class="btn" href="#/receipts/new">+ Receipt</a><a class="btn" href="#/payments/new">+ Payment voucher</a></div>
  <div class="cards">
    <a class="card stat link" href="#/orders"><div class="k">Total invoiced</div><div class="v">${money(s.invoiced, 0)}</div></a>
    <a class="card stat link" href="#/receipts"><div class="k">Collected</div><div class="v pos">${money(s.received, 0)}</div></a>
    <a class="card stat link" href="#/orders" data-flt="orders:Unpaid"><div class="k">Outstanding from customers</div><div class="v ${s.balance > 0 ? 'neg' : ''}">${money(s.balance, 0)}</div></a>
    <a class="card stat link" href="#/orders" data-flt="orders:Open"><div class="k">Open orders</div><div class="v">${s.openOrders}</div></a>
    <a class="card stat link" href="#/quotes" data-flt="quotes:Open"><div class="k">Open quotations</div><div class="v">${s.quotesOpen}</div></a>
    ${s.pendingApprovals ? `<a class="card stat link" href="#/approvals" style="border-color:var(--warn)"><div class="k">Waiting for approval</div><div class="v neg">${s.pendingApprovals}</div></a>` : ''}
    ${low.length ? `<a class="card stat link" href="#/stock" style="border-color:var(--bad)"><div class="k">Stock running low</div><div class="v neg">${low.length}</div></a>` : ''}
  </div>
  <div class="cols2" style="align-items:start">
    <div class="card"><h3>Last 12 months — invoiced vs collected (BD)</h3>${barChart(s.monthly.map((m) => ({ label: m.m.slice(2), a: m.invoiced, b: m.received })))}</div>
    <div class="card"><h3>Who owes the most</h3><table class="grid"><tbody>${s.debtors.map((d) => `<tr class="click" onclick="location.hash='#/statements/${encodeURIComponent(d.client)}'"><td>${esc(d.client)}<div class="muted" style="font-size:11px">${d.orders} order(s)</div></td><td class="num neg">${money(d.balance, 2)}</td></tr>`).join('') || '<tr><td class="empty">Nobody owes anything 🎉</td></tr>'}</tbody></table></div>
  </div>
  <div class="card" style="margin-top:14px"><div style="display:flex;gap:8px;align-items:center"><h3 style="margin:0">On the floor right now</h3><span class="muted">${openTasks.length} open task(s) · ${visible.filter((t) => t.status === 'blocked').length} blocked · ○ = on it, outside working hours</span><span class="grow"></span><a class="btn sm" href="#/activity">Worker activity</a><a class="btn sm" href="#/tasks">All tasks</a></div><table class="grid" style="margin-top:8px"><tbody>${running.map((t) => `<tr class="click" onclick="location.hash='#/tasks/${t.id}'"><td>${t.ticking ? '<span class="pos">●</span>' : '<span class="muted">○</span>'} <b>${esc(t.running_by)}</b></td><td>${esc(t.title)} <span class="muted">${esc([t.order_inv, t.client].filter(Boolean).join(' · '))}</span></td><td class="num" ${t.ticking ? `data-live data-base="${t.actual_min}"` : ''}>${t.ticking ? '' : fmtMin(t.actual_min)}</td><td class="num muted">est ${t.estimate_min ? fmtMin(t.estimate_min) : '—'}</td></tr>`).join('') || '<tr><td class="empty">Nobody is on a task right now.</td></tr>'}</tbody></table></div>
  <div class="card" style="margin-top:14px"><div style="display:flex;gap:8px;align-items:center"><h3 style="margin:0">Next 7 days</h3><span class="grow"></span><a class="btn sm" href="#/calendar">Calendar</a></div><table class="grid" style="margin-top:8px"><tbody>${soon.map((e) => `<tr class="click" onclick="location.hash='#/calendar'"><td style="white-space:nowrap"><b>${dmy(e.date)}</b> <span class="muted">${esc((e.start || '').slice(0, 5))}</span></td><td><span class="dot" style="background:${(EV_KINDS[e.kind] || EV_KINDS.other)[1]}"></span> <b>${esc(e.title)}</b> <span class="muted">${esc([e.client, e.site].filter(Boolean).join(' — '))}</span></td><td class="muted">${esc((e.team || []).map((id) => names[id]).filter(Boolean).join(', '))}</td></tr>`).join('') || '<tr><td class="empty">Nothing scheduled this week.</td></tr>'}</tbody></table></div>
  <div class="card" style="margin-top:14px"><h3>Latest quotations</h3><table class="grid"><thead><tr><th>Quote</th><th>Date</th><th>Client</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>${quotes.slice(0, 8).map((q) => `<tr class="click" onclick="location.hash='#/quotes/${q.id}'"><td><b>${esc(q.number)}</b></td><td>${dmy(q.date)}</td><td>${esc(q.client)}</td><td class="num">${money(quoteTotals(q).grand, 2)}</td><td>${badge(q.status, q.status === 'accepted' ? 'ok' : q.status === 'sent' ? 'blue' : '')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No quotations yet</td></tr>'}</tbody></table></div>`;
  // a card may ask the next page to open with a filter already chosen
  el.querySelectorAll('[data-flt]').forEach((a) => a.addEventListener('click', () => { const [k, v] = a.dataset.flt.split(':'); try { sessionStorage.setItem(`flt:${k}`, v); } catch {} }));
  startTicker(el);
}
