# Workshop Manager

Web app to run an aluminium & glass fabrication workshop. It replaces the *TALENTS* Excel workbook (quotations, orders, receipts, payment vouchers, purchases, statements) and adds window/door **models** with cutting lists.

## Run

Requires Node.js 22.13+.

```bash
npm install
npm start            # builds the optimised front end, then serves http://localhost:3000   (PORT=… to change)
npm run dev          # no build step: serves the readable sources (for changing the code)
npm test             # unit + API tests (no browser needed)
npm run bench        # times the API and counts bytes: node tools/bench.mjs http://localhost:3000 admin <password>
```

**Docker:** `docker build -t workshop . && docker run -p 3000:3000 -v workshop-data:/data workshop` (the database and daily backups live in the `/data` volume).

**Performance notes:** the browser code is bundled, minified and split per page with content-hashed file names (cached for a year); API and static responses are Brotli/gzip compressed; the database uses WAL, prepared-statement reuse and indexes on the date/status columns; login attempts are throttled; a consistent copy of the database is saved daily to `data/backups/` (last 14 kept).

On first visit you create the admin account (name, username, password); add everyone else under **Users**. Older databases that used one shared password keep it as the user `admin`.

**Per-person permissions:** Users → **Permissions** lets the admin set each page to *No access / View only / Can edit* for one person on top of their role (the role stays the default). Users, Settings and the audit trail always stay admin-only; discount and overtime approval stay with the admin.

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
| **Kitchens** *(new)* | Design kitchen cabinets and countertops: base, drawer, sink, hob, corner, wall and tall units on one or more walls, with front elevation and plan drawings. Gives carcass/door/back cut lists, sheet layouts, edge banding, hinges, drawer sets and handles, countertop pieces with sink/hob cut-outs and slab layout, a cost estimate and a price (by metre rates or cost + mark-up). Add it to a quotation, raise a purchase order for boards and stone, and workers get the drawing and cut list on their job sheet. Boards, handles, hinges, drawer classes and stone come from your old workbook; prices are entered under *Kitchens → Options & prices*. |
| **Models** *(new)* | Window/door templates with drawing + formulas (`W`, `H` in cm) for profile cut lengths, glass panes and accessories. |
| **Cutting List & Glass** *(new)* | From a quotation (or ad-hoc lines): cut lengths per profile with bar nesting and waste %, glass sizes/areas, accessory totals, material cost. |
| **Profiles, Glass & Accessories** *(new)* | Library with prices used by models and cost estimates. |
| **Stock & Leftovers** *(new)* | New stock (bars, glass, hardware) and leftovers/offcuts with colour, length and location. The Cutting List uses leftovers first, takes bars out of stock and saves new offcuts. |
| **Leftover suggestions on quotations** *(new)* | Per quotation colour; matches the pieces each model needs against leftovers of the same colour, shows new cost vs leftover cost (the price difference) and can reserve them. |
| **Suppliers, Catalogue, Purchase Orders** *(new)* | Converting a quotation to an invoice opens a purchase-order dialog: bars needed (after leftovers and stock), glass and accessories, pick the supplier per line. Receiving a PO adds stock and records the purchase against the order. |
| **Tasks & worker activity** *(new)* | Managers create tasks (per order, stage, worker, time estimate). Time is counted automatically during the shift set in Settings (working hours, breaks, days): a worker just says which task they are on, no timer. Workers see their own tasks, post progress updates, report blockers and mark done. Managers see a live "on the floor" view, per-task timeline, and Worker Activity: hours per worker per day, a feed of everything done, and estimate vs actual by stage and by worker. |
| **Cash & Bank** *(new)* | Separate bank and cash statements with running balances, opening balances, manual in/out entries, transfers. Receipts and vouchers choose the account. |
| **Employee files** *(new)* | Profile, salary payments, advances/deductions, monthly attendance, documents with expiry dates and file upload, printable file. |
| **Tax invoice & credit notes** *(new)* | Set the company **VAT number** in Settings. Every order prints a bilingual (English/Arabic) **tax invoice** with supplier and customer VAT numbers, net/VAT per line, totals, payments, bank details. **Credit notes** for returns/corrections reduce the customer's balance once approved and print as tax credit notes. |
| **Site surveys** *(new)* | Phone-friendly: measure each opening (type, W×H, colour, glass, notes), take photos with the camera, then **Create quotation** turns the sizes into quotation items priced from the price list. Workers can do surveys; prices stay hidden from them. |
| **Photos & files** *(new)* | Before/after photos and documents on orders, tasks and surveys. Photos are shrunk on the phone before upload. Stored in `DATA_DIR/files` (include that folder in your backups). |
| **Calendar** *(new)* | Month / week / upcoming views of installations, deliveries, site visits and maintenance, with the team on each; warns when a worker is double-booked; "Schedule installation" from an order; WhatsApp message to the customer. Workers see only their own jobs. |
| **Low-stock alerts** *(new)* | Set an alert level per profile / glass / accessory; the Stock page and dashboard show what is low, and one click makes a purchase order (up to twice the alert level). |
| **More models** *(new)* | Shower screens (fixed, hinged, sliding, corner), glass partitions (frameless, framed), glass and bar railings (priced per metre), curtain wall, mirrors, folding doors — starter formulas, adjust to your system. |
| **Kitchens: islands, presets, customer page** *(new)* | Mark a run as an **island** (seating overhang, no splash back); save any cabinet as a **preset** (20 starter ones included); a printable bilingual **customer page** with front and plan drawings, materials and price. |
| **Balexco 45 glazing chart** *(new)* | The catalogue's gaskets (E2101–E2115), glazing beads (E1403–E1414) and window/door glazing profiles are in the library. Pick a glazing system on a model; with a glass thickness chosen, the model page, quotation lines and the worker's job sheet show the bead and gasket pair that holds it, and the cutting list / purchase orders get the gasket metres. Frame and sash cut deductions still need the profile-size pages. |
| **VAT report & profit and loss** *(new)* | Reports → VAT report: VAT collected vs paid (purchases carry a VAT field), credit notes deducted, by month/quarter, CSV downloads for filing. Profit & loss by month. |
| **Arabic interface** *(new)* | Button at the bottom of the menu: right-to-left layout and Arabic screen text. Printouts are always bilingual. Text not yet in the dictionary (`public/js/i18n-ar.js`) stays English. |
| **Audit trail** *(new)* | Admin: who created, changed or deleted what and when, with old → new values (also approvals, users, settings, imports). |
| **Approvals** *(new)* | A quotation discount above the limit (Settings, default 10%) and credit notes made by Accounts wait for the admin; blocked from sending / invoicing until decided. |
| **Quotations, cut lists & drawings** *(new)* | Discount after VAT, auto "prepared by", accessories and rubber with cost/price, no deleting quotations, accepted → draft needs the admin's password. Cut list prints, colours equal pieces alike, has a glass list with leftovers/scrap and a back-to-quotation button. Drawings mark fixed panes **F**, show left/right hand and opens-in/out arrows, and the **Custom design** model lets you draw new designs with dividers. |
| **Purchasing & money** *(new)* | PO "paid" separate from "received", hide purchases, suppliers filtered to those offering the product, a store page per supplier; money in must reference an invoice, money out goes to a supplier (or a salary linked to an employee). |
| **Workers** *(new)* | Per-user shifts, overtime (start/stop/add, admin approves), attendance from tasks, helpers on tasks, worker-activity charts + Excel export, targets & prizes, dashboard notes. |
| **Kitchens** *(new)* | 3D view (drag/zoom), wood or **aluminium** kitchens (framed doors, infill, profile bar cutting and pricing). |
| **Accounts** *(new)* | One menu section with sales invoices, credit notes, receipt / payment / journal vouchers, customer and supplier statements, cash & bank, a **chart of accounts** (assets, liabilities, owner equity, income, expenses), **trial balance**, income statement and balance sheet. Invoices, receipts, vouchers, purchases and cash/bank entries post to the books automatically; journal vouchers (must balance) cover the rest. Menu sections collapse. |
| **Settings** *(new)* | Change the logo, delete workshop photos after 3/6 months, About Us page. |

The starter models/profiles use generic deductions and zero prices — edit them under **Models** and **Profiles, Glass & Accessories** to match your profile system.

## Online demo

`docs/index.html` is a self-contained demo (sample data, runs fully in the browser) for GitHub Pages: Settings → Pages → deploy from branch, folder `/docs`.
