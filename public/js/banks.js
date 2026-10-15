// The workshop's money accounts: one cash box and any number of bank accounts. Records keep the account as a short key:
// 'cash', or the key of a bank account ('bank' for the original one, then 'bank-2', 'bank-3' …).
export const CASH = 'cash';
const live = (banks) => (banks || []).filter((b) => b.active !== 0);
/** The bank account used when nothing says which one: the first one in use. */
export const primaryBank = (banks) => live(banks)[0] || (banks || [])[0] || null;
/** [[key, label], …] for a drop-down: the bank accounts, then the cash box. */
export function accountChoices(banks, { cash = true, inactive = false } = {}) {
  const list = (inactive ? banks || [] : live(banks)).map((b) => [b.key, b.name || b.key]);
  return cash ? [...list, [CASH, 'Cash box']] : list;
}
export const accountLabel = (key, banks) => (key === CASH ? 'Cash box' : (banks || []).find((b) => b.key === key)?.name || (key === 'bank' ? 'Bank account' : key || ''));
/** Which account a receipt / voucher belongs to: what was chosen, else cash for cash payments and the main bank for everything else. */
export function accountOf(rec, banks) {
  if (rec.account) return rec.account;
  if (rec.method === 'Cash') return CASH;
  return rec.method ? primaryBank(banks)?.key || 'bank' : '';
}
/** Is this key a bank account (rather than the cash box)? */
export const isBank = (key) => !!key && key !== CASH;
