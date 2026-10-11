# Workshop Manager

Web app to run an aluminium & glass fabrication workshop. It replaces the *TALENTS* Excel workbook (quotations, orders, receipts, payment vouchers, purchases, statements) and adds window/door **models** with cutting lists.

## Run

Requires Node.js 22.13+.

```bash
npm install
npm start            # http://localhost:3000   (PORT=… to change)
```

On first visit you choose a password. Data lives in `data/workshop.db` (SQLite) — back this file up. `DATA_DIR=/path` moves it.

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

The starter models/profiles use generic deductions and zero prices — edit them under **Models** and **Profiles, Glass & Accessories** to match your profile system.
