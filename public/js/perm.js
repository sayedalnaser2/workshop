// Roles and what each may see/do. Shared by the server (enforcement) and the browser (menus, buttons).
export const ROLES = { admin: 'Admin', account: 'Accounts', worker: 'Worker' };
export const ROLE_INFO = {
  admin: 'Everything, including users, settings, Excel import and backup.',
  account: 'Tasks and worker activity, quotations, orders, receipts, payments, purchases, cash & bank, employees, reports, prices and stock. No users, settings or import.',
  worker: 'Own tasks (start/stop timer, progress updates), stock & leftovers, cutting lists and models. Prices, costs and money are hidden.',
};
const ALL = ['admin', 'account', 'worker'];
const AA = ['admin', 'account'];
export const PAGE_ROLES = {
  dashboard: ALL, quotes: AA, orders: AA, receipts: AA, statements: AA, models: ALL, cutting: ALL, stock: ALL, materials: AA, prices: AA,
  mytasks: ALL, tasks: AA, activity: AA, kitchens: ALL, pos: AA, suppliers: AA, purchases: AA, cashbank: AA, payments: AA, employees: AA, reports: AA, settings: ['admin'], users: ['admin'],
};
export const canPage = (role, page) => (PAGE_ROLES[page === '' ? 'dashboard' : page] || []).includes(role);

const WORKER_READ = new Set(['kitchens', 'models', 'profiles', 'accessories', 'glass_types', 'quotes']);
/** 'rw' | 'r' | '' for a data table. */
export function tableAccess(role, table) {
  if (role === 'admin' || role === 'account') return 'rw';
  if (table === 'tasks' || table === 'task_logs' || table === 'task_sessions') return '';
  if (role === 'worker') return table === 'stock' ? 'rw' : WORKER_READ.has(table) ? 'r' : '';
  return '';
}
export const canWrite = (role, table) => tableAccess(role, table) === 'rw';
