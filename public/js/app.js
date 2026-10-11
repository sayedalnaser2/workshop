import { api, $, $$, toast, esc, modal, formHTML, readForm, guard } from './ui.js';
import { ROLES, canPage } from './perm.js';

// Shared state, loaded once and refreshed after edits to the library tables.
export const S = { me: null, settings: {}, price_items: [], profiles: [], accessories: [], glass_types: [], models: [], employees: [], next: {} };
export async function refresh() { Object.assign(S, await api.get('bootstrap')); }

const ROUTES = [
  { path: '', title: 'Dashboard', icon: '▦', mod: 'dashboard' },
  { group: 'Sales' },
  { path: 'quotes', title: 'Quotations', icon: '✎', mod: 'quotes' },
  { path: 'orders', title: 'Orders & Invoices', icon: '☰', mod: 'orders' },
  { path: 'receipts', title: 'Customer Receipts', icon: '⇩', mod: 'receipts' },
  { path: 'statements', title: 'Account Statements', icon: '≣', mod: 'statements' },
  { group: 'Work' },
  { path: 'mytasks', title: 'My Tasks', icon: '☑', mod: 'mytasks' },
  { path: 'tasks', title: 'Tasks', icon: '⚑', mod: 'tasks' },
  { path: 'activity', title: 'Worker Activity', icon: '◷', mod: 'activity' },
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
  { path: 'users', title: 'Users', icon: '⚿', mod: 'users' },
  { path: 'settings', title: 'Settings', icon: '⚙', mod: 'settings' },
];

const nav = $('#nav');
function buildNav() {
  const role = S.me?.role; const allowed = ROUTES.filter((r) => r.group || canPage(role, r.path));
  // drop group headings that have no pages left
  const items = allowed.filter((r, i) => !r.group || (allowed[i + 1] && !allowed[i + 1].group));
  nav.innerHTML = items.map((r) => (r.group ? `<div class="grp">${r.group}</div>` : `<a href="#/${r.path}" data-p="${r.path}"><span style="width:18px;text-align:center">${r.icon}</span>${esc(r.title)}</a>`)).join('');
  $('#meName').textContent = S.me?.name || ''; $('#meRole').textContent = ROLES[role] || ''; $('#meAvatar').textContent = (S.me?.name || '?').trim().charAt(0).toUpperCase();
}
$('#meBtn').onclick = () => {
  const w = document.createElement('div');
  const f = [{ key: 'current', label: 'Current password', type: 'password' }, { key: 'password', label: 'New password (6+ characters)', type: 'password' }];
  w.innerHTML = `<p><b>${esc(S.me.name)}</b> <span class="muted">@${esc(S.me.username)} · ${esc(ROLES[S.me.role])}</span></p><div class="form">${f.map((x) => `<label class="field"><span>${x.label}</span><input type="password" name="${x.key}" autocomplete="${x.key === 'current' ? 'current-password' : 'new-password'}"></label>`).join('')}</div>`;
  modal({ title: 'My account', body: w, buttons: [{ label: 'Sign out', kind: 'danger', onClick: () => { logout(); } }, { label: 'Close' }, { label: 'Change password', kind: 'primary', onClick: async () => { const d = readForm(w, f); if (!d.current || !d.password) { toast('Fill in both passwords', 'err'); return false; } await api.post('password', d); toast('Password changed'); } }] });
};

async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, ...rest] = hash.split('/');
  const r = ROUTES.find((x) => !x.group && x.path === path) || ROUTES[0];
  if (!canPage(S.me?.role, r.path)) { $('#view').innerHTML = '<div class="card"><h3>No access</h3><p class="muted">Your account (' + esc(ROLES[S.me?.role] || '') + ') does not include this page.</p><a class="btn" href="#/">Back to the dashboard</a></div>'; $$('#nav a').forEach((a) => a.classList.remove('on')); return; }
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
  S.me = me.user; buildNav();
  loginEl.hidden = true; appEl.hidden = false;
  await refresh();
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
