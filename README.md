# Workshop Manager

Web app to run an aluminium & glass fabrication workshop. It replaces the *TALENTS* Excel workbook (quotations, orders, receipts, payment vouchers, purchases, statements) and adds window/door **models** with cutting lists.

## Run

Requires Node.js 22.13+.

```bash
npm install
npm start            # http://localhost:3000   (PORT=… to change)
```

On first visit you create the admin account (name, username, password); add everyone else under **Users**. Older databases that used one shared password keep it as the user `admin`.

| Role | Can |
|---|---|
| Admin | everything, incl. Users, Settings, Excel import, backup |
| Accounts | sales, buying, cash & bank, employees, reports, prices, stock — not Users/Settings/import/backup |
| Worker | Stock & leftovers, cutting list, models (view). Prices, costs and money are removed by the server |

On first visit you create the admin account. Data lives in `data/workshop.db` (SQLite) — back this file up. `DATA_DIR=/path` moves it.

### Import your existing Excel data

Either **Settings → Import from your Excel workbook** in the browser, or:

```bash
npm run import -- TALENTS_2026.xlsm
```

This loads the price list, all `Q…` quotation sheets, orders, receipts, payments, purchases, employees and the next-number counters (Q / I / R / P). Re-running replaces those lists.

## What is in it

| Module | Replaces / adds |
|---|---|
| **Quotations** | `Quotation` / `Q26 70` sheets. Auto number `Q YY MM NNN`, price from the price list (windows per m² rounded to 5, doors fixed), discount, VAT with waive/adjust, amount in words, A4 print with your terms. One click → order/invoice. |
| **Orders & Invoices** | `Orders List`: gross, paid (from receipts), balance, profit (gross − purchases charged to the order), done/open. |
| **Customer Receipts** | `Rec.List` + `Rec#` print form. |
| **Account Statements** | `Account Statment` — per customer, printable. |
| **Purchases / Payment Vouchers / Employees** | `Pur.List`, `Pay.List` + `P.VOUCHER`, salary table. |
| **Reports** | yearly summary (`Sheet1`) and the ledger on `Setup`. |
| **Models** *(new)* | Window/door templates with drawing + formulas (`W`, `H` in cm) for profile cut lengths, glass panes and accessories. |
| **Cutting List & Glass** *(new)* | From a quotation (or ad-hoc lines): cut lengths per profile with bar nesting and waste %, glass sizes/areas, accessory totals, material cost. |
| **Profiles, Glass & Accessories** *(new)* | Library with prices used by models and cost estimates. |
| **Stock & Leftovers** *(new)* | New stock (bars, glass, hardware) and leftovers/offcuts with colour, length and location. The Cutting List uses leftovers first, takes bars out of stock and saves new offcuts. |
| **Leftover suggestions on quotations** *(new)* | Per quotation colour; matches the pieces each model needs against leftovers of the same colour, shows new cost vs leftover cost (the price difference) and can reserve them. |
| **Suppliers, Catalogue, Purchase Orders** *(new)* | Converting a quotation to an invoice opens a purchase-order dialog: bars needed (after leftovers and stock), glass and accessories, pick the supplier per line. Receiving a PO adds stock and records the purchase against the order. |
| **Tasks & worker activity** *(new)* | Managers create tasks (per order, stage, worker, time estimate). Workers see their own tasks, start/pause a timer, post progress updates, report blockers and mark done. Managers see a live "on the floor" view, per-task timeline, and Worker Activity: hours per worker per day, a feed of everything done, and estimate vs actual by stage and by worker. |
| **Cash & Bank** *(new)* | Separate bank and cash statements with running balances, opening balances, manual in/out entries, transfers. Receipts and vouchers choose the account. |
| **Employee files** *(new)* | Profile, salary payments, advances/deductions, monthly attendance, documents with expiry dates and file upload, printable file. |

The starter models/profiles use generic deductions and zero prices — edit them under **Models** and **Profiles, Glass & Accessories** to match your profile system.

## Online demo

`docs/index.html` is a self-contained demo (sample data, runs fully in the browser) for GitHub Pages: Settings → Pages → deploy from branch, folder `/docs`.
