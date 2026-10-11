import { S } from '../app.js';
import { api, $, esc, money, dmy, badge } from '../ui.js';
import { quoteTotals } from '../calc.js';

/** Grouped bar chart. data: [{label, a, b}] — a = invoiced, b = received. */
export function barChart(data, la = 'Invoiced', lb = 'Received') {
  if (!data.length) return '<p class="muted">No data yet.</p>';
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b])); const bw = 14, gap = 16, W = data.length * (bw * 2 + gap) + 40, H = 170, base = H - 22;
  const bars = data.map((d, i) => { const x = 40 + i * (bw * 2 + gap); const ha = (d.a / max) * (base - 10), hb = (d.b / max) * (base - 10); return `<rect x="${x}" y="${base - ha}" width="${bw}" height="${ha}" fill="var(--brand-2)" rx="2"><title>${esc(d.label)} ${la}: ${money(d.a, 2)}</title></rect><rect x="${x + bw}" y="${base - hb}" width="${bw}" height="${hb}" fill="var(--ok)" rx="2"><title>${esc(d.label)} ${lb}: ${money(d.b, 2)}</title></rect><text x="${x + bw}" y="${H - 6}" font-size="9" text-anchor="middle" fill="var(--muted)">${esc(d.label)}</text>`; }).join('');
  const grid = [0, .5, 1].map((f) => `<line x1="38" x2="${W}" y1="${base - f * (base - 10)}" y2="${base - f * (base - 10)}" stroke="var(--line)"/><text x="34" y="${base - f * (base - 10) + 3}" font-size="9" text-anchor="end" fill="var(--muted)">${Math.round(max * f).toLocaleString()}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMid meet" role="img" aria-label="${la} versus ${lb}">${grid}${bars}</svg><div class="legend"><span><i style="background:var(--brand-2)"></i>${la}</span><span><i style="background:var(--ok)"></i>${lb}</span></div>`;
}

async function workerHome(el) {
  const stock = await api.get('t/stock');
  const low = stock.filter((s) => s.kind === 'new' && s.qty > 0 && s.qty <= 2).length;
  el.innerHTML = `<div class="ph"><h1>Hello ${esc(S.me.name)}</h1><span class="sub">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
  <div class="cards"><a class="card stat" href="#/cutting" style="color:inherit"><div class="k">Cutting list</div><div class="v">✂ Open</div></a><a class="card stat" href="#/stock" style="color:inherit"><div class="k">Leftovers in stock</div><div class="v">${Math.round(stock.filter((s) => s.kind === 'leftover').reduce((a, s) => a + Math.max(0, s.qty || 0), 0))}</div></a><a class="card stat" href="#/stock" style="color:inherit"><div class="k">New stock running low (2 or fewer)</div><div class="v ${low ? 'neg' : ''}">${low}</div></a><a class="card stat" href="#/models" style="color:inherit"><div class="k">Models</div><div class="v">${S.models.length}</div></a></div>`;
}

export async function render(el) {
  if (S.me?.role === 'worker') return workerHome(el);
  const [s, quotes] = await Promise.all([api.get('summary'), api.get('t/quotes')]);
  const c = S.settings.company || {};
  el.innerHTML = `<div class="ph"><h1>${esc(c.name || 'Workshop')}</h1><span class="sub">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span><span class="grow"></span><a class="btn primary" href="#/quotes/new">+ New quotation</a><a class="btn" href="#/receipts/new">+ Receipt</a><a class="btn" href="#/payments/new">+ Payment voucher</a></div>
  <div class="cards">
    <div class="card stat"><div class="k">Total invoiced</div><div class="v">${money(s.invoiced, 0)}</div></div>
    <div class="card stat"><div class="k">Collected</div><div class="v pos">${money(s.received, 0)}</div></div>
    <div class="card stat"><div class="k">Outstanding from customers</div><div class="v ${s.balance > 0 ? 'neg' : ''}">${money(s.balance, 0)}</div></div>
    <div class="card stat"><div class="k">Open orders</div><div class="v">${s.openOrders}</div></div>
    <div class="card stat"><div class="k">Open quotations</div><div class="v">${s.quotesOpen}</div></div>
  </div>
  <div class="cols2" style="align-items:start">
    <div class="card"><h3>Last 12 months — invoiced vs collected (BD)</h3>${barChart(s.monthly.map((m) => ({ label: m.m.slice(2), a: m.invoiced, b: m.received })))}</div>
    <div class="card"><h3>Who owes the most</h3><table class="grid"><tbody>${s.debtors.map((d) => `<tr class="click" onclick="location.hash='#/statements/${encodeURIComponent(d.client)}'"><td>${esc(d.client)}<div class="muted" style="font-size:11px">${d.orders} order(s)</div></td><td class="num neg">${money(d.balance, 2)}</td></tr>`).join('') || '<tr><td class="empty">Nobody owes anything 🎉</td></tr>'}</tbody></table></div>
  </div>
  <div class="card" style="margin-top:14px"><h3>Latest quotations</h3><table class="grid"><thead><tr><th>Quote</th><th>Date</th><th>Client</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>${quotes.slice(0, 8).map((q) => `<tr class="click" onclick="location.hash='#/quotes/${q.id}'"><td><b>${esc(q.number)}</b></td><td>${dmy(q.date)}</td><td>${esc(q.client)}</td><td class="num">${money(quoteTotals(q).grand, 2)}</td><td>${badge(q.status, q.status === 'accepted' ? 'ok' : q.status === 'sent' ? 'blue' : '')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No quotations yet</td></tr>'}</tbody></table></div>`;
}
