// Double-entry accounting built on the records the workshop already keeps. Pure functions, shared by the server and the tests.
// Nothing is typed twice: invoices, credit notes, receipts, payment vouchers, supplier purchases and cash/bank entries are turned
// into debit/credit postings on the chart of accounts, and manual journal vouchers add to them.
import { orderVat, vatIn } from './vat.js';

export const TYPES = { asset: 'Assets', liability: 'Liabilities', equity: 'Owner equity', income: 'Income (sales)', expense: 'Expenses' };
/** Debit-normal types: their balance is debit − credit. */
export const DEBIT_TYPES = new Set(['asset', 'expense']);

/** The starting chart (code, name, type, parent code, system key). Group rows (no sys key and with children) only add up their children. */
export const DEFAULT_CHART = [
  ['1', 'ASSETS', 'asset'], ['11', 'Fixed Assets', 'asset', '1'], ['12', 'Current Assets', 'asset', '1'],
  ['121', 'Cash in Hand', 'asset', '12', 'cash'], ['122', 'Bank', 'asset', '12', 'bank'], ['123', 'Accounts Receivable (Customers)', 'asset', '12', 'ar'], ['124', 'VAT Input (Recoverable)', 'asset', '12', 'vat_in'],
  ['125', 'Advances & Prepayments', 'asset', '12', 'advances'], ['126', 'Funds in Transit', 'asset', '12', 'transit'], ['13', 'Other Assets', 'asset', '1'],
  ['2', 'LIABILITIES', 'liability'], ['21', 'Accounts Payable (Suppliers)', 'liability', '2', 'ap'], ['22', 'VAT Output (Payable)', 'liability', '2', 'vat_out'], ['23', 'Salaries Payable', 'liability', '2', 'salary_payable'], ['24', 'Loans', 'liability', '2', 'loans'],
  ['3', 'OWNER EQUITY', 'equity'], ['31', 'Capital', 'equity', '3', 'capital'], ['32', 'Owner Drawings', 'equity', '3', 'drawings'], ['33', 'Opening Balance Equity', 'equity', '3', 'opening'],
  ['4', 'INCOME (SALES)', 'income'], ['41', 'Sales', 'income', '4', 'sales'], ['42', 'Other Income', 'income', '4', 'other_income'],
  ['5', 'EXPENSE', 'expense'], ['51', 'Purchases & Materials', 'expense', '5', 'purchases'], ['52', 'Salaries & Wages', 'expense', '5', 'salary'], ['53', 'Rent', 'expense', '5', 'rent'],
  ['54', 'Workshop Expenses', 'expense', '5', 'workshop'], ['55', 'Other Expenses', 'expense', '5', 'other_expense'], ['56', 'Bank Charges', 'expense', '5', 'bank_charges'],
];
/** Payment-voucher categories the older screens used, and where they now post. */
const CATEGORY_SYS = { 'Supplier payment': 'ap', Salary: 'salary', Rent: 'rent', 'Workshop expense': 'workshop', Other: 'other_expense' };
const CASH_IN = { 'Owner deposit': 'capital', 'Loan received': 'loans', Refund: 'other_income', 'Other income': 'other_income', 'Cash deposit': 'transit' };
const CASH_OUT = { 'Bank charges': 'bank_charges', 'Owner withdrawal': 'drawings', 'Loan repayment': 'loans', 'Cash withdrawal': 'transit', 'Other expense': 'other_expense', Transfer: 'transit' };
const r3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const inRange = (d, from, to) => !!d && (!from || d >= from) && (!to || d <= to);

/**
 * All postings. data = { accounts, orders, quotes, credits (approved), receipts, payments, purchases, cash, journals, settings }.
 * Returns [{ date, ref, source, desc, account (id), debit, credit }] — every document balances on its own.
 */
export function buildEntries(data) {
  const { accounts = [], orders = [], quotes = [], credits = [], receipts = [], payments = [], purchases = [], cash = [], journals = [], settings = {} } = data;
  const bySys = new Map(accounts.filter((a) => a.sys).map((a) => [a.sys, a.id])); const byName = new Map(accounts.map((a) => [String(a.name).trim().toLowerCase(), a.id]));
  const rate = Number(settings.vat_rate ?? 10); const assume = !!settings.purchase_vat_default; const qNo = new Map(quotes.map((q) => [q.number, q]));
  const out = []; const A = (sys) => bySys.get(sys);
  const post = (date, ref, source, desc, lines) => { for (const [acc, debit, credit] of lines) if (acc && (debit || credit)) out.push({ date: date || '', ref, source, desc, account: acc, debit: r3(debit || 0), credit: r3(credit || 0) }); };
  const cashOf = (r) => A((r.account || (r.method === 'Cash' ? 'cash' : r.method ? 'bank' : '')) === 'cash' ? 'cash' : 'bank');
  const open = settings.opening || {};
  if (Number(open.cash)) post('0000-00-00', 'Opening', 'Opening', 'Opening balance — cash in hand', [[A('cash'), open.cash > 0 ? open.cash : 0, open.cash < 0 ? -open.cash : 0], [A('opening'), open.cash < 0 ? -open.cash : 0, open.cash > 0 ? open.cash : 0]]);
  if (Number(open.bank)) post('0000-00-00', 'Opening', 'Opening', 'Opening balance — bank', [[A('bank'), open.bank > 0 ? open.bank : 0, open.bank < 0 ? -open.bank : 0], [A('opening'), open.bank < 0 ? -open.bank : 0, open.bank > 0 ? open.bank : 0]]);
  for (const o of orders) { const vat = orderVat(o, qNo, rate); const amt = Number(o.amount) || 0; post(o.date, o.inv, 'Sales invoice', `Invoice ${o.inv} — ${o.client || ''}`.trim(), [[A('ar'), amt, 0], [A('sales'), 0, amt - vat], [A('vat_out'), 0, vat]]); }
  for (const c of credits) post(c.date, c.no, 'Credit note', `Credit note ${c.no} — ${c.client || ''} (${c.order_inv || ''})`.trim(), [[A('sales'), c.net || 0, 0], [A('vat_out'), c.vat || 0, 0], [A('ar'), 0, c.total || 0]]);
  for (const r of receipts) post(r.date, r.no, 'Receipt voucher', `Receipt ${r.no} — ${r.client || r.order_inv || ''}`.trim(), [[cashOf(r), r.amount, 0], [A('ar'), 0, r.amount]]);
  for (const p of purchases) { if (p.hidden) continue; const amt = Number(p.amount) || 0; const vat = p.vat != null && p.vat !== '' ? r3(p.vat) : assume ? vatIn(amt, rate) : 0; post(p.date, p.invoice || p.pv || '', 'Supplier purchase', `Purchase ${p.invoice || p.pv || ''} — ${p.supplier || ''}`.trim(), [[A('purchases'), amt - vat, 0], [A('vat_in'), vat, 0], [A('ap'), 0, amt]]); }
  for (const v of payments) {
    const target = v.employee_id ? A('salary') : byName.get(String(v.category || '').trim().toLowerCase()) || A(CATEGORY_SYS[v.category] || 'other_expense');
    post(v.date, v.no, 'Payment voucher', `Payment ${v.no} — ${v.paid_to || ''}${v.category ? ' (' + v.category + ')' : ''}`.trim(), [[target, v.amount, 0], [cashOf(v), 0, v.amount]]);
  }
  for (const c of cash) {
    const acct = A(c.account === 'cash' ? 'cash' : 'bank'); const amt = Number(c.amount) || 0;
    if (c.direction === 'in') post(c.date, c.category || 'Cash entry', 'Cash/bank entry', `${c.category || 'Money in'}${c.party ? ' — ' + c.party : ''}`, [[acct, amt, 0], [A(CASH_IN[c.category] || 'other_income'), 0, amt]]);
    else post(c.date, c.category || 'Cash entry', 'Cash/bank entry', `${c.category || 'Money out'}${c.party ? ' — ' + c.party : ''}`, [[A(CASH_OUT[c.category] || 'other_expense'), amt, 0], [acct, 0, amt]]);
  }
  for (const j of journals) for (const l of j.lines || []) if (l.account_id && (Number(l.debit) || Number(l.credit))) out.push({ date: j.date || '', ref: j.no, source: 'Journal voucher', desc: l.description || j.description || '', account: Number(l.account_id), debit: r3(l.debit || 0), credit: r3(l.credit || 0) });
  return out;
}

/** Per-account totals between two dates (inclusive; empty = no limit), with the tree rolled up. */
export function trialBalance(accounts, entries, from = '', to = '') {
  const own = new Map(accounts.map((a) => [a.id, { debit: 0, credit: 0 }]));
  for (const e of entries) { if (e.date !== '0000-00-00' && !inRange(e.date, from, to)) continue; if (e.date === '0000-00-00' && from) continue; const o = own.get(e.account); if (o) { o.debit += e.debit; o.credit += e.credit; } }
  const kids = new Map(); for (const a of accounts) { const k = kids.get(a.parent_id || 0) || []; k.push(a); kids.set(a.parent_id || 0, k); }
  const rows = new Map();
  const roll = (a) => { const o = own.get(a.id); let debit = o.debit; let credit = o.credit; for (const c of kids.get(a.id) || []) { const r = roll(c); debit += r.debit; credit += r.credit; } const row = { id: a.id, debit: r3(debit), credit: r3(credit), own: { debit: r3(o.debit), credit: r3(o.credit) }, balance: r3(DEBIT_TYPES.has(a.type) ? debit - credit : credit - debit), leaf: !(kids.get(a.id) || []).length }; rows.set(a.id, row); return row; };
  for (const a of kids.get(0) || []) roll(a);
  // a balance shown in the debit or credit column according to its sign (the way a trial balance is written)
  const cols = (a) => { const r = rows.get(a.id); const net = r3(r.debit - r.credit); return { ...r, tbDebit: net > 0 ? net : 0, tbCredit: net < 0 ? -net : 0 }; };
  const list = accounts.map((a) => ({ ...a, ...cols(a) }));
  const leaves = list.filter((a) => a.leaf && !a.group);
  const totalDebit = r3(leaves.reduce((s, a) => s + a.tbDebit, 0)); const totalCredit = r3(leaves.reduce((s, a) => s + a.tbCredit, 0));
  return { list, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.0005 };
}

/** Income statement and balance sheet from a trial balance. */
export function statements(tb) {
  const sum = (type) => r3(tb.list.filter((a) => a.type === type && a.leaf).reduce((s, a) => s + a.balance, 0));
  const income = sum('income'); const expenses = sum('expense'); const profit = r3(income - expenses);
  const assets = sum('asset'); const liabilities = sum('liability'); const equity = sum('equity');
  return { income, expenses, profit, assets, liabilities, equity, equityWithProfit: r3(equity + profit), balanced: Math.abs(assets - (liabilities + equity + profit)) < 0.0005 };
}

/** One account's ledger (running balance) from the entries. */
export function accountLedger(account, entries, from = '', to = '') {
  const debitNormal = DEBIT_TYPES.has(account.type); const rows = []; let bal = 0;
  for (const e of entries.filter((x) => x.account === account.id).sort((a, b) => (a.date || '').localeCompare(b.date || ''))) {
    if (e.date !== '0000-00-00' && !inRange(e.date, from, to)) continue;
    bal += debitNormal ? e.debit - e.credit : e.credit - e.debit; rows.push({ ...e, balance: r3(bal) });
  }
  return rows;
}

const norm = (s) => String(s || '').trim().toUpperCase();
/** What we owe a supplier: purchases (supplier invoices) raise it, payment vouchers to them lower it. Pure so it can be tested. */
export function supplierLedger(supplier, purchases, payments) {
  const key = norm(supplier); const entries = [];
  for (const p of purchases) if (norm(p.supplier) === key && !p.hidden) entries.push({ date: p.date, desc: `Purchase ${p.invoice || p.pv || ''}${p.order_inv ? ' – ' + p.order_inv : ''}${p.note ? ' – ' + p.note : ''}`.trim(), debit: 0, credit: Number(p.amount) || 0, k: 0 });
  for (const v of payments) if (norm(v.paid_to) === key) entries.push({ date: v.date, desc: `Payment voucher ${v.no}${v.method ? ' (' + v.method + (v.ref ? ' ' + v.ref : '') + ')' : ''}`, debit: Number(v.amount) || 0, credit: 0, k: 1 });
  entries.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.k - b.k);
  let bal = 0; for (const e of entries) { bal += e.credit - e.debit; e.bal = Math.round(bal * 1000) / 1000; }
  const debit = entries.reduce((s, e) => s + e.debit, 0); const credit = entries.reduce((s, e) => s + e.credit, 0);
  return { entries, debit, credit, balance: Math.round((credit - debit) * 1000) / 1000 };
}

