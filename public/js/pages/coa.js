import { api, $, $$, esc, money, dmy, editRow, confirmBox, toast, guard, badge } from '../ui.js';
import { TYPES } from '../accounting.js';
import { canWrite } from '../perm.js';
import { S } from '../app.js';

const OPEN_KEY = 'coa-open';
const loadOpen = () => { try { return new Set(JSON.parse(sessionStorage.getItem(OPEN_KEY) || 'null') || []); } catch { return new Set(); } };

export async function render(el, [id]) {
  if (id) return ledger(el, Number(id));
  const data = await api.get('accounting'); const accounts = data.accounts; const tb = new Map(data.tb.list.map((a) => [a.id, a]));
  const write = canWrite(S.me, 'accounts'); const open = loadOpen(); if (!open.size) for (const a of accounts) if (!a.parent_id) open.add(a.id); // first visit: the five main groups are open
  const kids = new Map(); for (const a of accounts) { const k = kids.get(a.parent_id || 0) || []; k.push(a); kids.set(a.parent_id || 0, k); }
  const label = (a) => `${a.code} — ${a.name}`;
  const fields = () => [
    { key: 'code', label: 'Code', required: true, hint: 'For example 1210 for a new bank account under 12 Current Assets' }, { key: 'name', label: 'Name', required: true },
    { key: 'type', label: 'Type', type: 'select', options: Object.entries(TYPES) },
    { key: 'parent_id', label: 'Under', type: 'select', options: [['', '— top level —'], ...accounts.map((a) => [a.id, label(a)])] },
    { key: 'note', label: 'Note', full: true }, { key: 'active', label: 'Account is in use', type: 'check' },
  ];
  const edit = (row, defaults) => editRow({ table: 'accounts', title: row ? `Edit ${row.name}` : 'New account', row: row && { ...row, parent_id: row.parent_id ?? '' }, fields: fields(), defaults: { active: 1, ...defaults }, before: (d) => ({ ...d, parent_id: d.parent_id ? Number(d.parent_id) : null }), onSaved: () => render(el, []) });
  const draw = () => {
    const rows = []; const walk = (a, depth) => { const hasKids = (kids.get(a.id) || []).length; rows.push({ a, depth, hasKids }); if (hasKids && open.has(a.id)) for (const c of kids.get(a.id)) walk(c, depth + 1); };
    for (const a of kids.get(0) || []) walk(a, 0);
    const t = (a) => tb.get(a.id);
    $('#tree', el).innerHTML = `<table class="grid"><thead><tr><th>Name</th><th>Code</th><th>Type</th><th class="num">Balance</th><th></th></tr></thead><tbody>${rows.map(({ a, depth, hasKids }) => `<tr data-id="${a.id}" style="${a.active === 0 ? 'opacity:.5' : ''}"><td style="padding-left:${10 + depth * 22}px"><span class="tw" data-tw="${a.id}" style="display:inline-block;width:18px;cursor:${hasKids ? 'pointer' : 'default'};font-weight:700;color:var(--brand-2)">${hasKids ? (open.has(a.id) ? '−' : '+') : ''}</span><a href="#/coa/${a.id}" style="font-weight:${hasKids ? 700 : 500};color:var(--brand-2)">${esc(a.name)}</a>${a.sys ? ' <span class="muted" title="Receives automatic postings — can be renamed but not deleted">🔒</span>' : ''}</td><td>${esc(a.code)}</td><td class="muted">${esc(TYPES[a.type] || a.type)}</td><td class="num"><b>${money(t(a)?.balance || 0, 2)}</b></td><td class="num" style="white-space:nowrap">${write ? `<button class="btn sm" data-add="${a.id}">+ Sub-account</button> <button class="btn sm" data-edit="${a.id}">Edit</button>${a.sys ? '' : ` <button class="btn sm danger" data-del="${a.id}">Delete</button>`}` : ''}</td></tr>`).join('')}</tbody></table>`;
  };
  el.innerHTML = `<div class="ph"><h1>Chart of Accounts</h1><span class="sub">Assets, liabilities, owner equity, income and expenses — invoices, receipts, vouchers and purchases post here automatically</span><span class="grow"></span><button class="btn" id="exp">Expand all</button><button class="btn" id="col">Collapse all</button>${write ? '<button class="btn primary" id="new">+ New account</button>' : ''}</div>
    ${data.tb.balanced ? '' : '<div class="card" style="border-color:var(--bad);margin-bottom:12px">The books are out of balance — check the journal vouchers.</div>'}
    <div class="card" id="tree"></div>
    <p class="muted" style="margin-top:10px">Balances show each account's position to date (debit-normal accounts: debit − credit; the others: credit − debit). Click an account to see every entry. 🔒 accounts receive automatic postings, so they can be renamed but not deleted.</p>`;
  draw();
  const save = () => { try { sessionStorage.setItem(OPEN_KEY, JSON.stringify([...open])); } catch {} };
  $('#tree', el).addEventListener('click', guard(async (e) => {
    const tw = e.target.closest('[data-tw]'); if (tw) { const id2 = Number(tw.dataset.tw); if (!(kids.get(id2) || []).length) return; open.has(id2) ? open.delete(id2) : open.add(id2); save(); draw(); return; }
    const ad = e.target.closest('[data-add]'); if (ad) { const par = accounts.find((a) => a.id === Number(ad.dataset.add)); open.add(par.id); save(); return edit(null, { parent_id: par.id, type: par.type, code: par.code }); }
    const ed = e.target.closest('[data-edit]'); if (ed) return edit(accounts.find((a) => a.id === Number(ed.dataset.edit)));
    const dl = e.target.closest('[data-del]'); if (dl) { const a = accounts.find((x) => x.id === Number(dl.dataset.del)); if (await confirmBox(`Delete the account “${a.name}”?`)) { await api.del(`t/accounts/${a.id}`); toast('Deleted'); render(el, []); } }
  }));
  $('#new', el)?.addEventListener('click', () => edit(null, { type: 'expense' }));
  $('#exp', el).onclick = () => { for (const a of accounts) if ((kids.get(a.id) || []).length) open.add(a.id); save(); draw(); };
  $('#col', el).onclick = () => { open.clear(); open.add(-1); save(); draw(); };
}

async function ledger(el, id) {
  const from = sessionStorage.getItem('acc-from') || ''; const to = sessionStorage.getItem('acc-to') || '';
  const data = await api.get(`accounting?account=${id}&from=${from}&to=${to}`); const a = data.accounts.find((x) => x.id === id);
  if (!a) { el.innerHTML = '<p class="err">Account not found.</p>'; return; }
  const rows = data.ledger || []; const tot = rows.reduce((s, r) => ({ d: s.d + r.debit, c: s.c + r.credit }), { d: 0, c: 0 });
  el.innerHTML = `<div class="ph"><a class="btn" href="#/coa">← Chart of Accounts</a><h1>${esc(a.code)} — ${esc(a.name)}</h1>${badge(TYPES[a.type])}<span class="grow"></span>
    <label class="muted">From <input id="f" type="date" value="${esc(from)}"></label> <label class="muted">to <input id="t" type="date" value="${esc(to)}"></label></div>
    <div class="card"><table class="grid"><thead><tr><th>Date</th><th>Document</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.date === '0000-00-00' ? '' : dmy(r.date)}</td><td>${esc(r.source)} <span class="muted">${esc(r.ref || '')}</span></td><td>${esc(r.desc)}</td><td class="num">${r.debit ? money(r.debit, 3) : ''}</td><td class="num">${r.credit ? money(r.credit, 3) : ''}</td><td class="num">${money(r.balance, 3)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No entries.</td></tr>'}<tr><td colspan="3"><b>Total</b></td><td class="num"><b>${money(tot.d, 3)}</b></td><td class="num"><b>${money(tot.c, 3)}</b></td><td class="num"><b>${money(rows.at(-1)?.balance || 0, 3)}</b></td></tr></tbody></table></div>`;
  for (const [k, id2] of [['acc-from', 'f'], ['acc-to', 't']]) $('#' + id2, el).onchange = (e) => { try { sessionStorage.setItem(k, e.target.value); } catch {} ledger(el, id); };
}
