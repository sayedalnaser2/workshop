// Roles and what each may see/do. Shared by the server (enforcement) and the browser (menus, buttons).
export const ROLES = { admin: 'Admin', account: 'Accounts', sales: 'Sales', worker: 'Worker' };
export const ROLE_INFO = {
  admin: 'Everything, including users, settings, Excel import and backup.',
  account: 'Tasks and worker activity, quotations, orders, receipts, payments, purchases, cash & bank, employees, reports, prices and stock. No users, settings or import.',
  sales: 'Quotations, site surveys, kitchens and the calendar (can change them); sees the orders, customer statements, price list, tasks and order progress but cannot change them. No purchasing, accounts, payments, employees, settings or users.',
  worker: 'Own tasks (progress updates, photos), site surveys, stock & leftovers, cutting lists, models and their own calendar. Prices, costs and money are hidden.',
};
const ALL = ['admin', 'account', 'sales', 'worker'];
const AA = ['admin', 'account'];
const AS = ['admin', 'account', 'sales'];
export const PAGE_ROLES = {
  dashboard: ALL, quotes: AS, orders: AS, receipts: AA, statements: AS, models: ALL, cutting: ALL, stock: ALL, materials: AA, prices: AS,
  mytasks: ['admin', 'account', 'worker'], tasks: AS, activity: AA, kitchens: ALL, pos: AA, suppliers: AA, purchases: AA, cashbank: AA, payments: AA, employees: AA, reports: AA, settings: ['admin'], colours: ['admin'], users: ['admin'],
  calendar: ALL, surveys: ALL, credits: AS, customers: AS, supstatements: AA, accstatement: AA, vatitems: AA, novatitems: AA, journals: AA, coa: AA, trialbalance: AA, creditnotes: AA, approvals: AA, audit: ['admin'], targets: ALL, about: ALL,
};
/** Pages whose access can never be handed out: only an admin gets them. */
export const LOCKED_PAGES = ['users', 'settings', 'audit', 'colours'];
export const PAGE_LABELS = {
  dashboard: 'Dashboard', quotes: 'Quotations', orders: 'Orders & Invoices', creditnotes: 'Credit Notes', receipts: 'Customer Receipts', statements: 'Account Statements',
  surveys: 'Site Surveys', credits: 'Customer Credit', colours: 'Colours', customers: 'Customers', mytasks: 'My Tasks', tasks: 'Tasks', calendar: 'Calendar', targets: 'Targets & Prizes', activity: 'Worker Activity',
  models: 'Models', kitchens: 'Kitchens', cutting: 'Cutting List & Glass', stock: 'Stock & Leftovers', materials: 'Profiles, Glass & Accessories', prices: 'Price List',
  pos: 'Purchase Orders', supstatements: 'Supplier Statements', accstatement: 'Account Statement', vatitems: 'Items with VAT', novatitems: 'Items without VAT', journals: 'Journal Vouchers', coa: 'Chart of Accounts', trialbalance: 'Trial Balance & Reports', suppliers: 'Suppliers & Catalogue', cashbank: 'Cash & Bank', payments: 'Payment Vouchers', employees: 'Employees', reports: 'Reports', approvals: 'Approvals', about: 'About Us',
};
const WORKER_EDIT = new Set(['mytasks', 'cutting', 'stock', 'surveys']);
const SALES_EDIT = new Set(['quotes', 'surveys', 'kitchens', 'calendar', 'dashboard', 'about', 'credits', 'customers']);
/** What a role gets on a page when nothing was changed for the person: 'edit' | 'view' | ''. */
export function roleLevel(role, page) {
  const key = page === '' ? 'dashboard' : page;
  if (role === 'admin') return 'edit';
  if (!(PAGE_ROLES[key] || []).includes(role)) return '';
  if (role === 'sales') return SALES_EDIT.has(key) ? 'edit' : 'view';
  return role === 'worker' && !WORKER_EDIT.has(key) ? 'view' : 'edit';
}
/** A person's own setting for a page ('none' | 'view' | 'edit'), or undefined to follow the role. Admins and locked pages ignore it. */
export function overrideOf(user, page) {
  if (!user || user.role === 'admin' || LOCKED_PAGES.includes(page)) return undefined;
  const v = user.perms?.pages?.[page]; return v === 'none' || v === 'view' || v === 'edit' ? v : undefined;
}
/** The access a person really has on a page: their own setting first, else the role's. */
export function levelOf(user, page) {
  if (!user) return '';
  const key = page === '' ? 'dashboard' : page; const o = overrideOf(user, key);
  return o === undefined ? roleLevel(user.role, key) : o === 'none' ? '' : o;
}
export const canPage = (user, page) => levelOf(user, page) !== '';

/** Which page owns each data table (for who may change it). */
export const TABLE_PAGE = {
  accounts: 'coa', journals: 'journals', bank_accounts: 'cashbank',
  quotes: 'quotes', orders: 'orders', credit_notes: 'creditnotes', receipts: 'receipts', payments: 'payments', purchases: 'purchases', purchase_orders: 'pos', suppliers: 'suppliers', items: 'suppliers',
  cash_entries: 'cashbank', employees: 'employees', employee_events: 'employees', attendance: 'employees', employee_docs: 'employees', price_items: 'prices',
  profiles: 'materials', accessories: 'materials', glass_types: 'materials', models: 'models', kitchens: 'kitchens', kitchen_options: 'kitchens', stock: 'stock', board_types: 'stock', board_stock: 'stock',
  tasks: 'tasks', task_logs: 'tasks', task_sessions: 'tasks', attachments: 'tasks', overtime: 'activity', events: 'calendar', surveys: 'surveys', customer_credits: 'credits', customers: 'customers', notes: 'dashboard', targets: 'targets', target_awards: 'targets',
};
/** Tables a page needs to read to work at all — handed out (read-only) when the page was granted to someone on top of their role. */
export const SUPPORT = {
  quotes: ['kitchens', 'stock', 'price_items', 'models', 'profiles', 'accessories', 'glass_types', 'orders', 'suppliers'], orders: ['credit_notes', 'purchases', 'quotes', 'receipts', 'price_items', 'models', 'profiles', 'accessories', 'glass_types'],
  creditnotes: ['quotes', 'orders'], receipts: ['orders', 'bank_accounts'], statements: ['credit_notes', 'receipts', 'orders', 'accounts'], payments: ['suppliers', 'employees', 'accounts', 'bank_accounts'], pos: ['payments', 'purchases', 'stock', 'suppliers', 'items', 'bank_accounts', 'profiles', 'accessories', 'glass_types'],
  stock: ['items', 'profiles'], suppliers: ['items'], cashbank: ['payments', 'receipts', 'bank_accounts'], cutting: ['quotes', 'stock', 'profiles', 'accessories', 'glass_types', 'models'], kitchens: ['items', 'quotes'],
  surveys: ['quotes'], customers: ['orders', 'quotes', 'receipts', 'surveys', 'kitchens', 'customer_credits'], credits: ['orders', 'receipts'], supstatements: ['purchases', 'payments', 'suppliers', 'accounts'], accstatement: ['accounts', 'journals'], vatitems: ['price_items'], novatitems: ['price_items'], journals: ['accounts'], coa: ['accounts', 'journals'], trialbalance: ['accounts', 'journals', 'orders', 'receipts', 'payments', 'purchases', 'credit_notes', 'cash_entries'], purchases: ['suppliers'], employees: ['payments'], tasks: ['orders', 'quotes'], activity: ['task_logs', 'task_sessions'], dashboard: ['events', 'quotes', 'stock'], calendar: ['events'], reports: ['orders', 'quotes', 'purchases', 'payments', 'receipts', 'credit_notes'],
};
/** Pages that show prices, costs or money: giving one of these to a worker lifts the "money hidden" rule for them. */
export const MONEY_PAGES = ['supstatements', 'accstatement', 'vatitems', 'novatitems', 'journals', 'coa', 'trialbalance', 'quotes', 'orders', 'creditnotes', 'receipts', 'statements', 'prices', 'materials', 'pos', 'suppliers', 'purchases', 'cashbank', 'payments', 'reports'];
export const seesMoney = (user) => !!user && (user.role !== 'worker' || MONEY_PAGES.some((p) => overrideOf(user, p) === 'view' || overrideOf(user, p) === 'edit'));
/** Anyone with at least view access to one of these pages. */
export const hasAny = (user, pages) => !!user && (user.role === 'admin' || pages.some((p) => canPage(user, p)));
export const hasEditAny = (user, pages) => !!user && (user.role === 'admin' || pages.some((p) => levelOf(user, p) === 'edit'));

const WORKER_READ = new Set(['kitchens', 'models', 'profiles', 'accessories', 'glass_types', 'quotes', 'events', 'notes']);
const WORKER_RW = new Set(['stock', 'surveys']);
const SALES_RW = new Set(['quotes', 'surveys', 'kitchens', 'events', 'notes', 'customer_credits', 'customers']);
const SALES_R = new Set(['orders', 'receipts', 'credit_notes', 'price_items', 'models', 'profiles', 'accessories', 'glass_types', 'stock', 'kitchen_options', 'targets', 'target_awards', 'tasks', 'task_logs', 'task_sessions']);
function roleAccess(role, table) {
  if (table === 'targets' || table === 'target_awards') return role === 'admin' ? 'rw' : role === 'account' ? 'r' : ''; // only the admin sets targets and prizes
  if (role === 'admin' || role === 'account') return 'rw';
  if (role === 'sales') return SALES_RW.has(table) ? 'rw' : SALES_R.has(table) ? 'r' : '';
  if (table === 'tasks' || table === 'task_logs' || table === 'task_sessions' || table === 'attachments' || table === 'overtime') return role === 'worker' ? '' : 'rw';
  if (role === 'worker') return WORKER_RW.has(table) ? 'rw' : WORKER_READ.has(table) ? 'r' : '';
  return '';
}
/** 'rw' | 'r' | '' for a data table: the person's own page settings first, else their role. Takes the user object (role + perms). */
export function tableAccess(user, table) {
  if (!user) return '';
  const role = user.role; if (role === 'admin') return 'rw';
  const page = TABLE_PAGE[table]; const o = page ? overrideOf(user, page) : undefined;
  let acc = o === undefined ? roleAccess(role, table) : o === 'edit' ? 'rw' : o === 'view' ? 'r' : '';
  if (!acc && !(o === 'none')) for (const [p, tabs] of Object.entries(SUPPORT)) if (tabs.includes(table) && ['view', 'edit'].includes(overrideOf(user, p))) { acc = 'r'; break; } // a page granted on top of the role can read what it needs
  return acc;
}
export const canWrite = (user, table) => tableAccess(user, table) === 'rw';
