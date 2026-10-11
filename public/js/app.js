import { api, $, $$, toast, esc } from './ui.js';

// Shared state, loaded once and refreshed after edits to the library tables.
export const S = { settings: {}, price_items: [], profiles: [], accessories: [], glass_types: [], models: [], employees: [], next: {} };
export async function refresh() { Object.assign(S, await api.get('bootstrap')); }

const ROUTES = [
  { path: '', title: 'Dashboard', icon: '▦', mod: 'dashboard' },
  { group: 'Sales' },
  { path: 'quotes', title: 'Quotations', icon: '✎', mod: 'quotes' },
  { path: 'orders', title: 'Orders & Invoices', icon: '☰', mod: 'orders' },
  { path: 'receipts', title: 'Customer Receipts', icon: '⇩', mod: 'receipts' },
  { path: 'statements', title: 'Account Statements', icon: '≣', mod: 'statements' },
  { group: 'Production' },
  { path: 'models', title: 'Models', icon: '◫', mod: 'models' },
  { path: 'cutting', title: 'Cutting List & Glass', icon: '✂', mod: 'cutting' },
  { path: 'stock', title: 'Stock & Leftovers', icon: '▥', mod: 'stock' },
  { path: 'materials', title: 'Profiles, Glass & Accessories', icon: '▤', mod: 'materials' },
  { path: 'prices', title: 'Price List', icon: '$', mod: 'prices' },
  { group: 'Buying' },
  { path: 'pos', title: 'Purchase Orders', icon: '✉', mod: 'pos' },
  { path: 'suppliers', title: 'Suppliers & Catalogue', icon: '⌂', mod: 'suppliers' },
  { path: 'purchases', title: 'Purchases', icon: '⛟', mod: 'purchases' },
  { group: 'Money' },
  { path: 'cashbank', title: 'Cash & Bank', icon: '⛁', mod: 'cashbank' },
  { path: 'payments', title: 'Payment Vouchers', icon: '⇧', mod: 'payments' },
  { path: 'employees', title: 'Employees', icon: '☺', mod: 'employees' },
  { group: 'Business' },
  { path: 'reports', title: 'Reports', icon: '◔', mod: 'reports' },
  { path: 'settings', title: 'Settings', icon: '⚙', mod: 'settings' },
];

const nav = $('#nav');
nav.innerHTML = ROUTES.map((r) => (r.group ? `<div class="grp">${r.group}</div>` : `<a href="#/${r.path}" data-p="${r.path}"><span style="width:18px;text-align:center">${r.icon}</span>${esc(r.title)}</a>`)).join('');

async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, ...rest] = hash.split('/');
  const r = ROUTES.find((x) => !x.group && x.path === path) || ROUTES[0];
  $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.p === r.path));
  $('#pageTitle').textContent = r.title; document.title = r.title + ' · Workshop';
  $('#side').classList.remove('open');
  const view = $('#view'); view.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const mod = await import(`./pages/${r.mod}.js`);
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
  const me = await api.get('me');
  if (!me.loggedIn) return showLogin(me.needsSetup);
  loginEl.hidden = true; appEl.hidden = false;
  await refresh();
  route();
}
function showLogin(needsSetup) {
  appEl.hidden = true; loginEl.hidden = false;
  $('#loginTitle').textContent = needsSetup ? 'Create your password' : 'Sign in';
  $('#loginHint').textContent = needsSetup ? 'First time here — choose a password (6+ characters) to protect your workshop data.' : '';
  $('#loginPw').autocomplete = needsSetup ? 'new-password' : 'current-password';
  $('#loginPw').focus();
}
$('#loginForm').onsubmit = async (e) => {
  e.preventDefault(); $('#loginErr').textContent = '';
  try { await api.post('login', { password: $('#loginPw').value }); $('#loginPw').value = ''; boot(); } catch (err) { $('#loginErr').textContent = err.message; }
};
window.addEventListener('auth-lost', () => boot());
export const logout = async () => { await api.post('logout', {}); location.hash = ''; boot(); };
export const rerender = route;
boot().catch((e) => toast(e.message, 'err'));
