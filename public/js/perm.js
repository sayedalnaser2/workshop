// Roles and what each may see/do. Shared by the server (enforcement) and the browser (menus, buttons).
export const ROLES = { admin: 'Admin', account: 'Accounts', worker: 'Worker' };
export const ROLE_INFO = {
  admin: 'Everything, including users, settings, Excel import and backup.',
  account: 'Tasks and worker activity, quotations, orders, receipts, payments, purchases, cash & bank, employees, reports, prices and stock. No users, settings or import.',
  worker: 'Own tasks (progress updates, photos), site surveys, stock & leftovers, cutting lists, models and their own calendar. Prices, costs and money are hidden.',
};
const ALL = ['admin', 'account', 'worker'];
const AA = ['admin', 'account'];
export const PAGE_ROLES = {
  dashboard: ALL, quotes: AA, orders: AA, receipts: AA, statements: AA, models: ALL, cutting: ALL, stock: ALL, materials: AA, prices: AA,
  mytasks: ALL, tasks: AA, activity: AA, kitchens: ALL, pos: AA, suppliers: AA, purchases: AA, cashbank: AA, payments: AA, employees: AA, reports: AA, settings: ['admin'], users: ['admin'],
  calendar: ALL, surveys: ALL, creditnotes: AA, approvals: AA, audit: ['admin'], targets: ALL, about: ALL,
};
export const canPage = (role, page) => (PAGE_ROLES[page === '' ? 'dashboard' : page] || []).includes(role);

const WORKER_READ = new Set(['kitchens', 'models', 'profiles', 'accessories', 'glass_types', 'quotes', 'events', 'notes']);
const WORKER_RW = new Set(['stock', 'surveys']);
/** 'rw' | 'r' | '' for a data table. */
export function tableAccess(role, table) {
  if (table === 'targets' || table === 'target_awards') return role === 'admin' ? 'rw' : role === 'account' ? 'r' : ''; // only the admin sets targets and prizes
  if (role === 'admin' || role === 'account') return 'rw';
  if (table === 'tasks' || table === 'task_logs' || table === 'task_sessions' || table === 'attachments' || table === 'overtime') return role === 'worker' ? '' : 'rw';
  if (role === 'worker') return WORKER_RW.has(table) ? 'rw' : WORKER_READ.has(table) ? 'r' : '';
  return '';
}
export const canWrite = (role, table) => tableAccess(role, table) === 'rw';
