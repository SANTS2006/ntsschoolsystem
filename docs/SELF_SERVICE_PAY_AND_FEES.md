# Self-service pay and fees, and related changes

## Staff: My salary (`/my-salary`)
- Shown in the sidebar when the signed-in staff member is on a pay plan or has salary payments (`has_salary` on `/auth/me/`).
- `GET /api/v1/salary/my-salary/`: the pay plan (lines, gross, deductions, net), upcoming one-off changes, every payment, and the change history.
- `GET /api/v1/salary/my-payments/<id>/`: one payslip with its line-by-line breakdown (a snapshot taken when the payment was generated; older payments show totals only).
- Staff are notified (in-app, plus e-mail where configured) when their plan changes, when a deduction or addition is recorded, and when a month's salary is generated.

## Accountant: deductions and additions (`/salary/adjustments`)
- A one-off deduction (or addition) for one staff member and one month, with a required reason.
- Applied to that month's pending payment immediately, or folded in when the month is generated. A paid payment is never rewritten.
- Permissions: `salary.view` to list, `salary.create` to add, `salary.delete` to cancel.

## Students: Fees (`/my-fees`)
- `GET /api/v1/finance/my-fees/`: required / paid / outstanding / overdue, grouped by academic year then term, each invoice with its line items and payments.
- `GET /api/v1/finance/my-fees/receipts/<payment id>/`: a receipt, only for the student's own invoices.
- The student (and guardians) are notified when charges change and when a payment is recorded.

## Accountant: fee reminders
- `POST /api/v1/finance/invoices/send-reminders/` (all unpaid, or `invoice_ids`, `only_overdue`) and `POST /api/v1/finance/invoices/<id>/remind/`.
- Permission `fees.update`. An invoice reminded in the last 24 hours is skipped unless `force` is sent.
- UI: "Remind unpaid" and a per-row bell on the invoices list; "Send reminder" on an invoice.

## Events: registration closing
- Registration closes automatically when the event ends, at the optional **Registration closes** time, or when the creator closes it by hand (and the creator can reopen it until the event ends).
- `POST /events/<id>/close-registration/`, `POST /events/<id>/reopen-registration/` (creator only). `registration_state` on the event says why it is closed.

## Communications: details page
- `/communications/<id>` shows a communication in full; only its creator sees Edit (and Publish for a draft).

## Students: login access
- Principal and school administrator (permission `students.revoke_access`) can revoke a student's login with a required reason, and restore it.
- A revoked student cannot sign in, cannot refresh a session, and is refused on every request (`ACCESS_REVOKED`). Their records, results and fees are untouched.

## Procurement and inventory
- A purchase order line is either an inventory item (its name is used, restocks on receipt) or a new item (name typed). Unit price is required.
- Creating an order from an approved request copies the request's items onto it (the request's estimated price becomes the unit price, or 0).
- Sending an order e-mails the supplier the full order; the response says whether it was delivered or the supplier has no address.
- Stock in and stock out require a reason.

## Exports and search
- Every export button now offers CSV or Excel (`?export=csv` / `?export=xlsx`); both use the page's current search and filters.
- 31 more list pages gained a search box (the backend `search_fields` for each are checked by `apps/common/test_list_search.py`).

## Deploy notes
- New migrations: `common 0001`, `salary 0002`, `finance 0002`, `events 0005`, `students 0004`. Take a backup before deploying.
- New dependency: `openpyxl` (Excel export).
- Run `python manage.py seed_permissions` so `students.revoke_access` exists; the principal and school administrator roles pick it up automatically.
