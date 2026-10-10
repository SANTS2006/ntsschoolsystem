# Product audit — what the NTS School System really does

Written before the public website (`website/`) so that every statement on the website is traceable to something that
exists. Evidence is the application code in this repository (backend `apps/*`, frontend `src/features/*`), its tests, and
the work done on it. Where something could not be confirmed, it is marked **unverified** and the website does not claim it.

*Last reviewed: 10 October 2026.*

## 1. Product summary

A multi-tenant (many schools, one platform) school management system. Django REST backend, React/TypeScript frontend,
PostgreSQL, served as one container (API + app). Each school has its own address (`/<school-slug>/…`), branded sign-in
page, users, roles and data. NTS Digital Solutions runs a platform console above the schools.

## 2. Feature inventory

Status: **Verified** = implemented and exercised in code/tests; **Partial** = exists with stated limits; **Absent** = not built.

| Area | Capability | Status | Evidence / notes |
|---|---|---|---|
| Students | Profiles, admission number, class/section, status, photo, guardians (one emergency contact), promotion, graduation status | Verified | `apps/students`, `features/students` |
| Admissions | Configurable online application form; review → shortlist → interview → accept/reject | Verified | `apps/admissions` |
| Student ID cards | Printable cards with verifiable link | Verified | `apps/idcards` |
| Transcripts / reports | Built from published results only | Verified | `apps/reports`, `apps/examinations` |
| Staff | Staff records, roles, attendance | Verified | `apps/users`, `apps/attendance` |
| Roles & permissions | Standard roles (editable, deactivatable, deletable) plus school-made roles; permission assignment UI; multiple roles with role switching (`X-Active-Role`) | Verified | `apps/authorization`, tests |
| Dashboards | Per-role dashboards; custom roles get one built from their permissions | Verified | `docs/DASHBOARDS.md` |
| Academics | Years, terms, departments, subjects, classes, sections, subject offerings (teacher + assistant) | Verified | `apps/academics` |
| Timetable | Class timetables with periods/rooms and clash prevention; teacher and student views | Verified | `apps/timetable` |
| Attendance | Student (daily/period) and staff attendance, stats, personal view | Verified | `apps/attendance` |
| Continuous assessment | Weighted CA, score entry, CA/exam split, ranked summary, open/close | Verified | `apps/examinations` |
| Assessments with uploads | Student file uploads, teacher deadline, reminders (in-app + e-mail), marking | Verified | `apps/assignments` |
| Assignments & quizzes | Set, submit, grade, feedback | Verified | `apps/assignments`, `apps/quizzes` |
| Examinations | Exams, papers, grading scales, result workflow draft → submitted → reviewed → approved → published → locked | Verified | `apps/examinations` |
| Exam timetable | Rooms, invigilators, seating, publish; visible to students/teachers once published | Verified | `apps/examinations` |
| Fees & invoices | Categories, structures, invoices with line items/discounts, balances, partial payments, receipts, refunds, stats | Verified | `apps/finance` |
| Payroll | Salary structures, assignments, payroll generation, payments | Verified | `apps/salary` |
| Inventory & procurement | Items, stock movements, suppliers, purchase requests/orders | Verified | `apps/inventory`, `apps/procurement` |
| Communication | Announcements and events with audience targeting (all / classes+sections / departments / specific people), audience-only visibility, registration and capacity | Verified | `apps/communications`, `apps/events`, `features/audience` |
| Notifications | In-app + e-mail (Brevo); live updates by polling (≈8 s bell, 20 s lists) | Verified | `apps/notifications` |
| Meetings & live lessons | Meetings with e-mail invitations; live video lessons (Daily.co) for class/section/chosen students | Verified | `apps/meetings`, `apps/live_sessions` |
| Complaints | Submit and respond | Verified | `apps/complaints` |
| Library | Catalogue, copies, loans, returns, fines; reservations by students/teachers with librarian approve/reject and notification | Verified | `apps/library` |
| Hostel | Hostels, rooms, beds, allocation with notification/e-mail, "My hostel" | Verified | `apps/hostel` |
| Transport | Vehicles, routes, stops, assignments, maintenance | Verified | `apps/transport` |
| Medical | Profiles and visit records | Verified | `apps/medical` |
| Discipline | Incidents and follow-up | Verified | `apps/discipline` |
| Records & documents | Owner-only edit/delete rules; file attachments | Verified | `apps/records`, `apps/documents` |
| Audit log | Important actions recorded | Verified | `apps/audit` |
| Security | Two-factor auth (mandatory for principal and platform admins), rate limiting, strict CSP, forced first-login password change | Verified | `apps/authentication`, `docs/SECURITY.md` |
| Tenant separation | Tenant-scoped data access in the application layer | Verified | `apps/tenants`, tenant-scoped managers/tests |
| Backups & recovery | Encrypted DB backups with verification, retention, guided restore, optional S3-compatible storage (Cloudflare R2) | Verified | `apps/backups`, `docs/BACKUP_AND_RECOVERY.md` |
| Platform console | Schools, platform admins, maintenance mode (+ notice e-mails), backups, website enquiries | Verified | `apps/platform_admin`, `features/platform` |
| PWA | Installable, app-shell caching service worker | Verified | `frontend/public/sw.js`, `manifest.webmanifest` |
| Branding | Per-school name, logo, colour, address | Verified | `apps/tenants` |
| Parent portal / parent login | — | **Absent** | Guardians are *records* and e-mail recipients; there is no guardian login |
| Online payment gateway / mobile-money integration | — | **Absent** | Payments are recorded by staff |
| SMS | — | **Absent** | In-app + e-mail only |
| Native mobile app (app stores) | — | **Absent** | Installable web app only |
| Offline data entry | — | **Absent** | Shell is cached; data needs a connection |
| Languages other than English | — | **Unverified / likely absent** | Not confirmed; not claimed |
| Data import tools / migration service | — | **Unverified** | Not confirmed; not claimed |
| Certifications (SOC 2, ISO 27001, …) | — | **Absent** | None held; none claimed |

## 3. Verified claims the website may make

- Student records, admissions, academics, attendance, exams/results workflow, fees/payments/receipts/refunds, payroll,
  library/hostel/transport/medical/discipline, announcements/events with audience targeting, in-app + e-mail notifications.
- Multi-school platform; each school separated, with its own address and branding.
- Roles and permissions; school-created roles; role dashboards; two-factor authentication; audit log; encrypted backups.
- Runs in a browser; installable as an app.

## 4. Claims the website must **not** make

- Any customer count, school names, testimonials, case studies, ratings, awards or "trusted by".
- Prices, discounts, free trials, SLAs, uptime percentages, response-time promises.
- Security certifications, "bank-grade", "military-grade", "unhackable", compliance with a named law (GDPR etc.).
- Online payments, SMS, a parent portal, a native app, offline mode, AI features, integrations not listed above.
- Performance figures ("saves X hours", "Y% fewer errors"), migration services, specific onboarding timelines.

## 5. Gaps and risks found

| Gap | Impact | Handling |
|---|---|---|
| No parent login | Common expectation of buyers | Stated plainly on FAQ, product and who-it's-for pages |
| No payment gateway / SMS | Common expectation | Stated plainly (FAQ, product page) |
| Legal documents are drafts | Cannot be relied on without a lawyer | Marked "Draft for legal review"; retention period left as a placeholder |
| Django admin not exposed in production | Enquiries could not be read | Added a platform-console page for website enquiries |
| No canonical custom domain yet | Canonical links/sitemap use the Render URL | `VITE_SITE_URL` build argument; one value to change |
| E-mail provider (Brevo) must be configured for team notification | Enquiries still stored if not | `email_status` recorded and shown in the console |
| No independent accessibility or security audit | Cannot claim conformance | Stated as "aim", with known limits, on the accessibility page |

## 6. Multi-tenant facts

- One database, every tenant-owned row carries a school; the application scopes reads/writes to the signed-in school.
- Each school: its own slug address (`/<slug>/login`), branding, users, roles, permissions, data.
- Platform administrators (NTS) sit above schools and see only what the platform console exposes.
- Reserved slugs prevent a school from taking a word that the app or website uses (`apps/tenants/reserved.py`, extended for the website's pages).
- Isolation is enforced in application code (and tested); it is **not** database-level row security or separate databases, and the website does not say otherwise.

## 7. Integrations (verified in code)

Brevo (transactional e-mail), Daily.co (live video), Neon (PostgreSQL), Render (hosting), Cloudflare R2 / S3-compatible storage (backups, optional). No payment, SMS or accounting integrations.

## 8. Roles (verified)

Principal, School Administrator, Teacher, Accountant, Exams Director, Student (all editable), school-created roles (e.g. Librarian, Hostel Warden, Medical, Driver), and Platform Administrator.

## 9. Pages the website needs

Home, product, features (index + six area pages), who it's for, how it works, benefits, security & privacy, pricing (request a quote), request a demo, contact, about, support, resources, FAQ, legal (privacy, terms, cookies, acceptable use, accessibility), 404. All built.

## 10. Website ↔ app boundary

The website is served by the same service as the app. Website pages live at the paths listed in `website_dist/routes.json`; every other path is the app. App entry points for visitors are `/find-school` and `/login`.

## 11. What was **not** verified

- Behaviour under heavy load, uptime, or real-world performance at scale.
- Whether any current school is willing to be named publicly (so none are).
- Languages, data-import tooling, formal data-retention periods.
- Legal wording (needs a lawyer).

## 12. Recommended follow-ups

1. Legal review of the five legal pages; fill the retention-period placeholder.
2. Choose and point a custom domain; set `VITE_SITE_URL`; submit the sitemap to search engines.
3. Configure `BREVO_API_KEY`/`ENQUIRY_NOTIFY_EMAIL` in Render so enquiries are e-mailed (they are stored regardless).
4. Gather real, permissioned customer evidence before adding any testimonial or customer section.
5. Decide pricing publicly only when it can be stood behind.
