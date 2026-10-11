// Usage: npm run import -- path/to/TALENTS.xlsm   (replaces price list, quotes, orders, receipts, payments, purchases, employees)
import { importWorkbook } from '../src/importer.js';
const file = process.argv[2];
if (!file) { console.error('Usage: npm run import -- <workbook.xlsm>'); process.exit(1); }
const t = Date.now();
const out = await importWorkbook(file);
console.log('Imported:', out, `(${((Date.now() - t) / 1000).toFixed(1)}s)`);
