// VAT return figures and monthly profit & loss from the raw ledgers. Pure: used by the server and the demo.
import { quoteTotals } from './calc.js';

const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const inRange = (d, from, to) => !!d && (!from || d >= from) && (!to || d <= to);

/** VAT contained in a gross amount that was charged at `rate` %. */
export const vatIn = (gross, rate) => (rate > 0 ? r3((Number(gross) || 0) * rate / (100 + rate)) : 0);

/** VAT of one order: the saved figure, else the quotation it came from, else the standard rate. */
export function orderVat(o, quoteByNo, rate) {
  if (o.vat != null && o.vat !== '') return r3(o.vat);
  const q = o.quote_no && quoteByNo.get(o.quote_no);
  if (q) { const t = quoteTotals(q); return r3(Math.max(0, t.vat - t.waived)); }
  return vatIn(o.amount, rate);
}

/**
 * data: { orders, quotes, credits (approved only), purchases, payments, settings:{vat_rate, purchase_vat_default} }
 * Returns monthly rows, totals, and the documents behind them.
 */
export function vatReport({ orders, quotes, credits, purchases, payments, settings }, from = '', to = '') {
  const rate = Number(settings?.vat_rate ?? 10); const assume = !!settings?.purchase_vat_default;
  const qNo = new Map((quotes || []).map((q) => [q.number, q]));
  const months = new Map();
  const m = (d) => { const k = String(d).slice(0, 7); let e = months.get(k); if (!e) { e = { m: k, sales_net: 0, output_vat: 0, credit_net: 0, credit_vat: 0, purchases_net: 0, input_vat: 0, expenses: 0 }; months.set(k, e); } return e; };
  const sales = []; const buys = [];
  for (const o of orders || []) {
    if (!inRange(o.date, from, to)) continue;
    const vat = orderVat(o, qNo, rate); const net = r3((o.amount || 0) - vat); const e = m(o.date);
    e.sales_net += net; e.output_vat += vat; sales.push({ kind: 'Invoice', no: o.inv, date: o.date, client: o.client, client_vat: o.client_vat || qNo.get(o.quote_no)?.client_vat || '', net, vat, total: r3(o.amount) });
  }
  for (const c of credits || []) {
    if (!inRange(c.date, from, to)) continue;
    const e = m(c.date); e.credit_net += c.net || 0; e.credit_vat += c.vat || 0;
    sales.push({ kind: 'Credit note', no: c.no, date: c.date, client: c.client, client_vat: c.client_vat || '', net: -(c.net || 0), vat: -(c.vat || 0), total: -(c.total || 0), against: c.order_inv });
  }
  for (const p of purchases || []) {
    if (!inRange(p.date, from, to)) continue;
    const vat = p.vat != null && p.vat !== '' ? r3(p.vat) : assume ? vatIn(p.amount, rate) : 0; const e = m(p.date);
    e.purchases_net += r3((p.amount || 0) - vat); e.input_vat += vat; buys.push({ no: p.invoice || p.pv || '', date: p.date, supplier: p.supplier, net: r3((p.amount || 0) - vat), vat, total: r3(p.amount), estimated: p.vat == null || p.vat === '' });
  }
  for (const p of payments || []) { if (inRange(p.date, from, to)) m(p.date).expenses += p.amount || 0; }
  const rows = [...months.values()].sort((a, b) => a.m.localeCompare(b.m)).map((e) => {
    const revenue = r3(e.sales_net - e.credit_net);
    return { ...e, revenue, output_net_vat: r3(e.output_vat - e.credit_vat), vat_payable: r3(e.output_vat - e.credit_vat - e.input_vat), profit: r3(revenue - e.purchases_net - e.expenses) };
  });
  const sum = (k) => r3(rows.reduce((s, r) => s + r[k], 0));
  const totals = Object.fromEntries(['sales_net', 'output_vat', 'credit_net', 'credit_vat', 'purchases_net', 'input_vat', 'expenses', 'revenue', 'output_net_vat', 'vat_payable', 'profit'].map((k) => [k, sum(k)]));
  const estimated = buys.filter((b) => b.estimated).length;
  return { from, to, rows, totals, sales: sales.sort((a, b) => a.date.localeCompare(b.date)), purchases: buys.sort((a, b) => a.date.localeCompare(b.date)), noVatPurchases: !assume ? buys.filter((b) => b.estimated).length : 0, estimated: assume ? estimated : 0 };
}
