import { api, $, $$, toast, esc, modal, formHTML, readForm, guard, HELMET } from './ui.js';
import { ROLES, canPage } from './perm.js';
import { setColourDefs } from './drawings.js';
import { setBoards, setKitchenDefaults } from './kitchen.js';
import { initI18n, isAr, setLang } from './i18n.js';

initI18n();
for (const id of ['langBtn', 'loginLang']) { const b = document.getElementById(id); if (b) { b.textContent = isAr() ? 'English' : 'العربية'; b.setAttribute('data-noi18n', ''); b.onclick = () => setLang(isAr() ? 'en' : 'ar'); } }

// Shared state, loaded once and refreshed after edits to the library tables.
export const S = { me: null, settings: {}, price_items: [], profiles: [], accessories: [], glass_types: [], models: [], employees: [], next: {} };
export async function refresh() { Object.assign(S, await api.get('bootstrap')); setColourDefs(S.settings?.colour_defs); setBoards({ types: S.board_types, stock: S.board_stock }); setKitchenDefaults(S.settings?.kitchen_defaults, S.profiles); }

const ROUTES = [
  { path: '', title: 'Dashboard', icon: '▦', mod: 'dashboard' },
  { group: 'Sales' },
  { path: 'customers', title: 'Customers', icon: '👤', mod: 'customers' },
  { path: 'surveys', title: 'Site Surveys', icon: '📐', mod: 'surveys' },
  { path: 'quotes', title: 'Quotations', icon: '✎', mod: 'quotes' },
  { path: 'orders', title: 'Sales Invoices', icon: '☰', mod: 'orders' },
  { path: 'credits', title: 'Customer Credit', icon: '🎁', mod: 'credits' },
  { group: 'Work' },
  { path: 'mytasks', title: 'My Tasks', icon: '☑', mod: 'mytasks' },
  { path: 'tasks', title: 'Tasks', icon: '⚑', mod: 'tasks' },
  { path: 'calendar', title: 'Calendar', icon: '📅', mod: 'calendar' },
  { path: 'pos', title: 'Purchase Orders', icon: '✉', mod: 'pos' },
  { path: 'targets', title: 'Targets & Prizes', icon: '🏆', mod: 'targets' },
  { path: 'activity', title: 'Worker Activity', icon: '◷', mod: 'activity' },
  { group: 'Production' },
  { path: 'models', title: 'Models', icon: '◫', mod: 'models' },
  { path: 'kitchens', title: 'Kitchens', icon: '▦', mod: 'kitchens' },
  { path: 'cutting', title: 'Cutting List & Glass', icon: '✂', mod: 'cutting' },
  { path: 'stock', title: 'Stock & Leftovers', icon: '▥', mod: 'stock' },
  { path: 'materials', title: 'Profiles, Glass & Accessories', icon: '▤', mod: 'materials' },
  { path: 'prices', title: 'Price List', icon: '$', mod: 'prices' },
  { group: 'Accounts' },
  { path: 'creditnotes', title: 'Credit Notes', icon: '↩', mod: 'creditnotes' },
  { path: 'receipts', title: 'Receipt Vouchers', icon: '⇩', mod: 'receipts' },
  { path: 'payments', title: 'Payment Vouchers', icon: '⇧', mod: 'payments' },
  { path: 'journals', title: 'Journal Vouchers', icon: '✐', mod: 'journals' },
  { path: 'suppliers', title: 'Suppliers & Catalogue', icon: '⌂', mod: 'suppliers' },
  { path: 'cashbank', title: 'Cash & Bank', icon: '⛁', mod: 'cashbank' },
  { sub: 'Statements' },
  { path: 'accstatement', title: 'Account Statement', icon: '≣', mod: 'accstatement' },
  { path: 'statements', title: 'Customer Statements', icon: '≣', mod: 'statements' },
  { path: 'supstatements', title: 'Supplier Statements', icon: '≣', mod: 'supstatements' },
  { endsub: true },
  { path: 'coa', title: 'Chart of Accounts', icon: '⌥', mod: 'coa' },
  { path: 'trialbalance', title: 'Trial Balance & Reports', icon: '⚖', mod: 'trialbalance' },
  { sub: 'VAT' },
  { path: 'reports', title: 'Reports & VAT Return', icon: '◔', mod: 'reports' },
  { path: 'vatitems', title: 'Items with VAT', icon: '％', mod: 'vatitems' },
  { path: 'novatitems', title: 'Items without VAT', icon: '∅', mod: 'novatitems' },
  { endsub: true },
  { group: 'Business' },
  { path: 'employees', title: 'Employees', icon: '☺', mod: 'employees' },
  { path: 'approvals', title: 'Approvals', icon: '✔', mod: 'approvals' },
  { path: 'audit', title: 'Audit Trail', icon: '☷', mod: 'audit' },
  { path: 'users', title: 'Users', icon: '⚿', mod: 'users' },
  { path: 'about', title: 'About Us', icon: 'ℹ', mod: 'about' },
  { path: 'colours', title: 'Colours', icon: '🎨', mod: 'colours' },
  { path: 'settings', title: 'Settings', icon: '⚙', mod: 'settings' },
];

const nav = $('#nav');
// the menu works like an accordion: every section starts closed, opening one closes the others
let openGroup = null; let openSub = null;
const showGroups = () => { for (const w of $$('.sub-wrap', nav)) { const on = w.dataset.s === openSub && w.closest('.grp-wrap')?.dataset.g === openGroup; w.classList.toggle('shut', !on); $('.grp', w)?.setAttribute('aria-expanded', String(on)); }
  for (const w of $$('.grp-wrap', nav)) { const on = w.dataset.g === openGroup; w.classList.toggle('shut', !on); $('.grp', w)?.setAttribute('aria-expanded', String(on)); } };
function buildNav() {
  const role = S.me?.role; const allowed = ROUTES.filter((r) => r.group || r.sub || r.endsub || canPage(S.me, r.path));
  // gather each section with its pages; sections with no pages left disappear
  const sections = []; let cur = null;
  let curSub = null;
  for (const r of allowed) { if (r.group) { cur = { name: r.group, pages: [] }; sections.push(cur); curSub = null; } else if (r.sub) { curSub = { sub: r.sub, pages: [] }; cur?.pages.push(curSub); } else if (r.endsub) curSub = null; else if (curSub) curSub.pages.push(r); else if (cur) cur.pages.push(r); else sections.push({ name: '', pages: [r] }); }
  const link = (r) => `<a href="#/${r.path}" data-p="${r.path}"><span style="width:18px;text-align:center">${r.icon}</span>${esc(r.title)}</a>`;
  nav.innerHTML = sections.filter((g) => g.pages.length).map((g) => (g.name ? `<div class="grp-wrap" data-g="${esc(g.name)}"><div class="grp" role="button" tabindex="0" aria-expanded="false"><span class="chev">▾</span>${esc(g.name)}</div><div class="grp-body">${g.pages.map((x) => (x.sub ? (x.pages.length ? `<div class="sub-wrap shut" data-s="${esc(x.sub)}"><div class="grp sub" role="button" tabindex="0" aria-expanded="false"><span class="chev">▾</span>${esc(x.sub)}</div><div class="sub-body">${x.pages.map(link).join('')}</div></div>` : '') : link(x))).join('')}</div></div>` : g.pages.map(link).join(''))).join('');
  showGroups();
  $('#meName').textContent = S.me?.name || ''; if (S.me?.creator) $('#meRole').innerHTML = `${HELMET} Creator`; else $('#meRole').textContent = ROLES[role] || ''; $('#meAvatar').textContent = (S.me?.name || '?').trim().charAt(0).toUpperCase();
}
nav.addEventListener('click', (e) => { const h = e.target.closest('.grp'); if (!h) return;
  if (h.classList.contains('sub')) { const s = h.parentElement.dataset.s; openSub = openSub === s ? null : s; } // a sub-section opens and closes on its own, inside its section
  else { const g = h.parentElement.dataset.g; openGroup = openGroup === g ? null : g; openSub = null; }
  showGroups(); });
nav.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('grp')) { e.preventDefault(); e.target.click(); } });
$('#meBtn').onclick = () => {
  const w = document.createElement('div');
  const f = [{ key: 'current', label: 'Current password', type: 'password' }, { key: 'password', label: 'New password (6+ characters)', type: 'password' }];
  w.innerHTML = `<p><b>${esc(S.me.name)}</b> <span class="muted">@${esc(S.me.username)} · ${esc(ROLES[S.me.role])}</span></p><div class="form">${f.map((x) => `<label class="field"><span>${x.label}</span><input type="password" name="${x.key}" autocomplete="${x.key === 'current' ? 'current-password' : 'new-password'}"></label>`).join('')}</div>`;
  modal({ title: 'My account', body: w, buttons: [{ label: 'Sign out', kind: 'danger', onClick: () => { logout(); } }, { label: 'Close' }, { label: 'Change password', kind: 'primary', onClick: async () => { const d = readForm(w, f); if (!d.current || !d.password) { toast('Fill in both passwords', 'err'); return false; } await api.post('password', d); toast('Password changed'); } }] });
};

// Page modules are listed statically so the production build can bundle and split them.
const PAGES = {
  about: () => import('./pages/about.js'),
  activity: () => import('./pages/activity.js'),
  approvals: () => import('./pages/approvals.js'),
  audit: () => import('./pages/audit.js'),
  calendar: () => import('./pages/calendar.js'),
  creditnotes: () => import('./pages/creditnotes.js'),
  credits: () => import('./pages/credits.js'),
  customers: () => import('./pages/customers.js'),
  colours: () => import('./pages/colours.js'),
  surveys: () => import('./pages/surveys.js'),
  targets: () => import('./pages/targets.js'),
  cashbank: () => import('./pages/cashbank.js'),
  cutting: () => import('./pages/cutting.js'),
  dashboard: () => import('./pages/dashboard.js'),
  employees: () => import('./pages/employees.js'),
  kitchens: () => import('./pages/kitchens.js'),
  materials: () => import('./pages/materials.js'),
  models: () => import('./pages/models.js'),
  mytasks: () => import('./pages/mytasks.js'),
  orders: () => import('./pages/orders.js'),
  payments: () => import('./pages/payments.js'),
  pos: () => import('./pages/pos.js'),
  prices: () => import('./pages/prices.js'),
  journals: () => import('./pages/journals.js'),
  vatitems: () => import('./pages/vatitems.js'),
  novatitems: () => import('./pages/novatitems.js'),
  accstatement: () => import('./pages/accstatement.js'),
  coa: () => import('./pages/coa.js'),
  trialbalance: () => import('./pages/trialbalance.js'),
  supstatements: () => import('./pages/supstatements.js'),
  quotes: () => import('./pages/quotes.js'),
  receipts: () => import('./pages/receipts.js'),
  reports: () => import('./pages/reports.js'),
  settings: () => import('./pages/settings.js'),
  statements: () => import('./pages/statements.js'),
  stock: () => import('./pages/stock.js'),
  suppliers: () => import('./pages/suppliers.js'),
  tasks: () => import('./pages/tasks.js'),
  users: () => import('./pages/users.js'),
};

async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, ...rest] = hash.split('/');
  const r = ROUTES.find((x) => !x.group && x.path === path) || ROUTES[0];
  if (!canPage(S.me, r.path)) { $('#view').innerHTML = '<div class="card"><h3>No access</h3><p class="muted">Your account (' + esc(ROLES[S.me?.role] || '') + ') does not include this page.</p><a class="btn" href="#/">Back to the dashboard</a></div>'; $$('#nav a').forEach((a) => a.classList.remove('on')); return; }
  $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.p === r.path));
  { const on = $('#nav a.on'); const w = on?.closest('.grp-wrap'); const sw = on?.closest('.sub-wrap'); if (w && (w.dataset.g !== openGroup || (sw?.dataset.s || null) !== openSub)) { openGroup = w.dataset.g; openSub = sw?.dataset.s || null; showGroups(); } } // going to a page opens its section (and closes the rest)
  $('#pageTitle').textContent = r.title; document.title = r.title + ' · Workshop';
  $('#side').classList.remove('open');
  const view = $('#view'); view.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const mod = await PAGES[r.mod]();
    view.innerHTML = '';
    await mod.render(view, rest);
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="err">${esc(e.message)}</p></div>`;
  }
}
window.addEventListener('hashchange', route);
$('#menuBtn').onclick = () => $('#side').classList.toggle('open');

// ------------------------------------------------------------------ auth
const loginEl = $('#login'); const appEl = $('#app');
async function boot() {
  // ask for the signed-in user and the shared data at the same time (and warm the first page's code) instead of one after the other
  const early = fetch('/api/bootstrap', { headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null)).catch(() => null); // plain fetch: a signed-out 401 here must not trigger the auth-lost handler
  const me = await api.get('me');
  if (!me.loggedIn) return showLogin(me.needsSetup);
  S.me = me.user; buildNav();
  loginEl.hidden = true; appEl.hidden = false;
  const first = ROUTES.find((x) => !x.group && x.path === location.hash.replace(/^#\/?/, '').split('/')[0]) || ROUTES[0]; PAGES[first.mod]?.().catch(() => {});
  const data = await early; if (data) { Object.assign(S, data); setColourDefs(S.settings?.colour_defs); setBoards({ types: S.board_types, stock: S.board_stock }); setKitchenDefaults(S.settings?.kitchen_defaults, S.profiles); } else await refresh();
  route();
}
function showLogin(needsSetup) {
  appEl.hidden = true; loginEl.hidden = false;
  $('#loginTitle').textContent = needsSetup ? 'Create the admin account' : 'Sign in';
  $('#loginHint').textContent = needsSetup ? 'First time here — you become the admin. Add the accounts and worker logins later under Users.' : '';
  $('#loginName').hidden = !needsSetup; $('#loginName').required = needsSetup;
  $('#loginPw').autocomplete = needsSetup ? 'new-password' : 'current-password';
  $('#loginUser').focus();
}
$('#loginForm').onsubmit = async (e) => {
  e.preventDefault(); $('#loginErr').textContent = '';
  try { await api.post('login', { username: $('#loginUser').value.trim(), password: $('#loginPw').value, name: $('#loginName').value.trim() }); $('#loginPw').value = ''; boot(); } catch (err) { $('#loginErr').textContent = err.message; }
};
window.addEventListener('auth-lost', () => boot());
export const logout = async () => { await api.post('logout', {}); location.hash = ''; boot(); };
export const rerender = route;
boot().catch((e) => toast(e.message, 'err'));
