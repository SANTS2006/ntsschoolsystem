# Role dashboards

`GET /api/v1/reports/dashboard/me/` returns the signed-in person's own dashboard. The server picks it from the role they are
working as (the `X-Active-Role` role switcher; a student account always gets the student dashboard) and builds only the
sections their permissions allow. One payload shape (`kpis`, `charts`, `tables`, `alerts`, `actions`, `unavailable`) is
rendered by shared components in `frontend/src/features/dashboard/`.

Code: `backend/apps/reports/dashboards.py` (all metric definitions live there), tests in `apps/reports/test_dashboards.py`.

| Role | Key figures | Charts / tables |
|---|---|---|
| Principal | students, staff, today's attendance, collection rate, outstanding fees, results awaiting approval, classes | enrollment by class, 14-day attendance, collections by month, outstanding by class |
| School administrator | students, staff, pending/accepted applications, sections | enrollment, applications by status, latest applications, class capacity |
| Accountant | billed, collected, outstanding, overdue, collected today, collection rate, refunds | collections by month, outstanding by class, payment methods, invoice status, recent payments, largest overdue |
| Exams director | exams running/upcoming, results per workflow stage | workflow stages, average by subject (published only), upcoming papers |
| Teacher | classes, offerings, students, lessons today, submissions to mark | assignment submissions, average per assignment, today's lessons, marking queue |
| Student | own attendance, published average, assignments due, upcoming papers | average by subject, today's timetable, assignments, exam papers |

## Definitions
- Attendance rate: PRESENT ÷ all daily (period-less) attendance records in the window.
- Collection rate: amount paid ÷ total billed over non-cancelled invoices. Outstanding: sum of invoice `balance` (already net of payments, discounts and refunds).
- Collections: payments that are not fully refunded. Exam averages use only PUBLISHED/LOCKED results.

## Filters and term comparison
`?term=<id>&school_class=<id>` narrow the figures that belong to a term or a class (invoices, results, attendance,
enrollment); ids from another school are ignored. Teacher and student dashboards are personal and take no filters.
Principal, school administrator, accountant and exams director also get a comparison of the chosen term (else the
current one) with the term just before it: attendance rate, collection rate, fees billed, average published score,
new admissions (per role). A change is shown in points for percentages; no percentage change is given when the
earlier value is zero or missing.

## Not available yet (shown on the page, not invented)
- Expenses, net cash movement, unreconciled/unallocated payments: no such records in the data model.
- Examination absenteeism, moderation queue, venues/invigilators, timetable-conflict counts, campus filter, free date-range filter, comparison across academic years (only term-on-term): not built.
