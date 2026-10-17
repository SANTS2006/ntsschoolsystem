# Academic years, rollover and historical records

Audit, design, rules and operating instructions for the academic-year system. Written from reading the code and from
the tests that were run; things that were **not** verified are listed in section 11.

---

## 1. Architecture findings (the audit)

**Stack:** Django 5.2 + DRF (`backend/apps/*`), PostgreSQL (Neon), React/TypeScript + TanStack Query (`frontend/src/features/*`),
one Docker service on Render. Multi-tenant: every school-owned row has a `school`; `TenantScopedModel.objects` is scoped by
the request's school, `unscoped_objects` is not. Responses use the `{success, message, code, errors}` envelope. Permissions are
codes (`academics.update` …) checked by `require_permission`; roles are per school and editable.

**What already existed (extended, not rebuilt):**

| Piece | Where | State before this work |
|---|---|---|
| `AcademicYear` (`is_current`, `is_archived`) | `academics/models.py` | `is_current` was a free boolean, writable by any create/update. **Nothing prevented several current years** (no constraint, no activation logic). |
| `Term` (`is_current`) | same | Same weakness: several current terms possible, current term could sit in a non-current year. |
| Archive = "closed" | `services.assert_year_not_archived` | A real choke point, but it guarded only sections, terms, offerings, attendance, timetable, fee plans and invoices. **Marks, CA scores and exams were not guarded.** |
| Promotion engine | `services.bulk_promote / manual_promote`, `PromotionRecord` (append-only) | Per-class, pass-mark driven. Moved `Student.current_*` with a bare `UPDATE`; a "promoted" student whose class had no `next_class` ended with **no class at all**; graduates kept status `active`. |
| Student class | `Student.current_academic_year/current_class/current_section` | A pointer to *now* only. **No per-year history** except what `PromotionRecord` implied. |
| Year-scoped data | `Section`, `SubjectOffering`, `FeeStructure`, `Invoice` (direct FK), attendance/timetable (via `section.academic_year`), exams/assignments (via `term`) | Already year-aware; Invoice/FeeStructure FKs are `CASCADE` (deleting a year deletes invoices; the UI's delete is gated by existing permission). |
| Year in the UI | list/form pages only | No global indicator; no historical viewing selector; "current" was a checkbox. |
| Hard-coded years | whole repo | **None found** (`grep` for `20xx/20xx`: only a docstring example). |

**Defects found and fixed along the way** (first pass, then the full check-up that followed)
1. No single-active-year guarantee (now a database constraint + guarded activation).
2. Same for terms (constraint + serializer rule). A real bug in my first version of this rule was caught by a test: inserting the new current term before clearing the old one violated the new constraint.
3. `?academic_year=<garbage>` would have raised a 500 (invalid UUID) in my first resolver; fixed and covered by a test.
4. `Student.save()` computed "is this a new student" after saving; fixed (caught by a test).
5. Closed-year writes to marks / CA / exams were possible; now rejected (section 4).
6. The legacy promotion tools could leave a student with no class and did not record history; they now also write enrolments.
7. *(check-up)* **Deleting a school failed for any school with real data** (my earlier "delete a suspended school" feature): classes, years, fee categories and staff protect the school/user rows, so only an almost-empty school could be deleted. The platform delete now clears protected blockers school by school (inside one transaction, aborting on anything from another school) and keeps the audit trail. Covered by a test with years, enrolments, a rollover run and staff.
8. *(check-up)* **Any year could be deleted from the list**, including the active year or a year with invoices (invoices are `ON DELETE CASCADE` from the year, so their payments would have gone too). Now refused (409) unless the year is unused.
9. *(check-up)* **Rollover race:** two simultaneous runs could both pass the "already completed?" check and a late failure could overwrite a completed run's status. The whole run (lock, check, work, completion) is now one locked transaction; failures are recorded afterwards and never downgrade a completed run.
10. *(check-up)* Stale tests that no longer matched deliberate product rules (principal is view-only for inventory; student accounts carry the student role; teachers see only assignments they set; system roles are deletable; teachers may view documents; school apply link is `/<slug>/apply`) were corrected so the suite reflects the product again.

## 2. Data model

New in `apps/academics/models.py`, migrations `0017_academic_year_lifecycle`, `0018_one_current_term_per_school`:

| Entity | Purpose | Key rules (database-level unless noted) |
|---|---|---|
| `AcademicYear` (+`activated_at`, `activated_by`) | the year | unique name per school; end > start; **partial unique index: one `is_current` per school**; derived `status`: `upcoming` / `active` / `closed` (app-level property, cannot disagree with the flags) |
| `Term` | unchanged fields | **partial unique index: one `is_current` per school** |
| `StudentEnrollment` | which class/section a student was in each year | **unique (student, academic_year)**; `outcome` (promoted/repeated/graduated/withdrawn/transferred); `source`; `save()` rejects a section from another year/class and anything from another school |
| `RolloverRun` | one rollover per year pair | **unique (source_year, target_year)**; status running/completed/failed; `summary`, `error`; source ≠ target |

Permanent vs year-dependent: student/guardian/staff profiles, subjects and `SchoolClass` (a level like "Grade 1") are permanent.
Enrolments, sections, offerings, terms, fee plans, invoices, attendance, timetables, exams and marks are year-dependent. **No student
or staff account is ever duplicated for a new year.** `Student.current_*` remains as the pointer to the active enrolment (backward
compatible; dashboards and every existing page keep working) and is kept in step by `Student.save()` and by every promotion path.

**Not done at database level:** composite foreign keys that would make "attendance section's year = enrolment's year" impossible
to violate (Django cannot express them portably). These relationships are enforced in `save()`/serializers and by tests, and in
filters; see section 11.

## 3. Active year vs viewing year vs requested year

* **Active year** — the school's single `is_current` year. Resolved in one place: `year_services.get_active_year / require_active_year`
  (`NoActiveAcademicYear` if none — there is **no fallback** to "latest year" and nothing is created silently). API: `GET /academics/year-context/`
  (any signed-in school user: active year, current term, the school's years with status).
* **Viewing year** — a request parameter (`?academic_year=<id>`) validated by `resolve_year(school, id)` (must be this school's; otherwise 400).
  It filters what is shown. It is never stored on the school, never changes the active year, and never widens access: the page's own
  permission and teacher scoping still apply. Frontend: `YearSelect` (students list) — a local, per-page choice.
* **Requested year in an API operation** — rollover `source`/`target`, `activate/` — validated the same way, plus permission `academics.update`.

## 4. Read / write policy

| Operation | Rule | Enforced by |
|---|---|---|
| Read current-year data | default; uses the active year / current pointers | existing queries; `year-context` for the UI |
| Read history | any of the school's own years via `?academic_year=`, subject to the endpoint's normal permission | `resolve_year`; students list + `students/<id>/enrollments/` |
| Create day-to-day records (attendance) | **active year only** | `assert_year_is_active` (attendance create + bulk-mark) |
| Prepare configuration (sections, offerings, terms, fee plans, timetables) | active **or upcoming** year; never closed | `assert_year_not_archived` |
| Modify/delete in a **closed** year | rejected for ordinary users: sections, terms, offerings, attendance, timetable, fee plans, invoices, CA scores, exam scores, assessments, exams, **assignments (and their grading and submission), quizzes and live lessons** | `assert_year_not_archived` at service + serializer choke points |
| Correct a closed year | **the principal, school administrator and exams director** (permission `academics.correct_closed_year`, held by those three roles by default and assignable to any role on the role screen) can make the correction directly, within what their ordinary permissions allow; every successful change is written to the audit log as `academics.closed_year_correction` with the year(s), method and path. Un-archiving a whole year (`unarchive`) remains for large clean-ups | request-scoped `YearCorrection` (set after authentication in `TenantContextMixin`, evaluated lazily); audited in `finalize_response` |
| Delete a year | refused for the active year and for any year that has enrolments, rollover history, promotion records, invoices, fee plans or offerings (deleting such a year would cascade away invoices and payments); only an unused year can go | `year_services.deletion_blocker` → HTTP 409 |
| Payments / refunds on old invoices | **allowed** (arrears must stay collectable); only creating/editing invoices and fee plans in a closed year is blocked | unchanged finance rules |
| Rollover, activation | `academics.update` only | `year_views`, tests for teacher/student/accountant/outsider |

## 5. Rollover design

1. **Create** the upcoming year (+ its terms). Creating never activates it (`is_current` is read-only on create/update).
2. **Preview** (`POST /academics/year-rollover/preview/`) — writes nothing. Returns, per student, the outcome *the school's own rules* suggest
   and why: pass mark (`School.promotion_threshold_percent`), `is_graduation_level`, `is_public_exam_transition`, `next_class`. When the rules
   cannot decide (incomplete results, public-exam class, no next class) the student is **"needs a decision"** — nothing is assumed. Also: configuration
   to copy, outstanding balances (read-only), warnings (no terms, students with no class recorded).
3. **Configure + progress** (`POST /academics/year-rollover/execute/`, `{source, target, decisions, options}`), atomic:
   copy **terms** (only if the new year has none: same names/order, dates moved to the new year and kept inside it), sections (same class/name/capacity/class teacher), subject offerings (grading configuration + teachers, matched to the new year's terms **by term order**; no scores, assessments or enrolments),
   fee plans (new plans named with the new year, **no invoices or payments**); then apply each student's outcome:
   * *promote / repeat* → new-year enrolment (+ matching new-year section by name), `PromotionRecord`, `Student.current_*` moved; the old enrolment keeps its row and gets `outcome`;
   * *graduate* → status `graduated`, current pointers cleared, `PromotionRecord` (PROMOTED from a graduation-level class, which is how graduation is already derived);
   * *withdraw / transfer* → status updated, pointers cleared, old enrolment annotated;
   * a manual class override is honoured and recorded as `manual`.
   Students still "needing a decision" **block the run** until decided. A student who already has a target-year enrolment is skipped (never duplicated).
4. **Idempotent and recoverable:** one `RolloverRun` per pair. A completed run returns its stored report on retry. Any failure rolls back everything the run did, marks the run `failed` with a safe message
   (no internals leaked), and the same run can be executed again. Both years are row-locked for the run.
5. **Activate** (`POST /academics/academic-years/<id>/activate/`): locks the school's years; requires the target not closed, ≥ 1 term, and a **completed rollover** from the current year;
   closes the old year (`is_archived`), moves the current-term flag, records who/when, audits `academics.year_activated`. The database independently refuses two active years.

**Finance:** previous-year invoices, payments, receipts, refunds are never moved, copied or edited. Outstanding balances stay on their original invoices
(the system's existing accounting rule: arrears are collected against the invoice that created them), and the preview shows the total so nothing is lost sight of.
Finance dashboards already aggregate across years, so carried balances are counted once. **Not built:** a ledger "carry-forward" entry — the codebase has no ledger, and adding one would risk double counting.
**Timetables are not copied** (they depend on the new year's sections/offerings/rooms); the preview says so.

## 6. Authorization

Backend-enforced on every request (UI hiding is only convenience): `academics.update` for preview/execute/runs/activate; `year-context` for any school member (names/dates/status only);
the students historical filter keeps the students list's own permission and teacher scoping; another school's year ids are rejected (400/404). Tested for teacher, student, accountant, an
administrator of another school, and anonymous/platform-admin users.

## 7. Frontend

* `YearBadge` in the shared header (server value; "No active year" warning state). `useYearContext` is the one source.
* Academic years list: derived status badge (Active / Upcoming / Closed), **Activate** and **Year rollover** actions; the "current" checkbox is gone from the form.
* `YearRolloverPage` (`/academics/years/rollover`): choose years → preview (counts, per-student suggestion + override + class override, warnings, balances) → options → run (confirmation, double-click safe) → activate (confirmation).
* `YearSelect` on the students list (viewing year only).
* After rollover/activation every query except auth is invalidated (`refreshAfterYearChange`); the 20-second refetch the app already has covers other open tabs. Queries are keyed per user session; sign-out clears auth.

## 7b. Closed-year corrections and student history (added after the first release)

* **Corrections.** Mistakes noticed in the next year no longer require reopening the whole year. Anyone holding `academics.correct_closed_year`
  (principal, school administrator, exams director by default) simply edits the record; refusal for everyone else now says who can fix it.
  The year-context endpoint returns `can_correct_closed_years` so the interface can hint at it. The academic years page explains the rule.
  Corrections are visible under *Audit log* (action `academics.closed_year_correction`).
  A correction is limited by the person's normal permissions: the exams director can correct exams and marks but has no right to edit sections, and the principal
  and school administrator hold no assignments permissions (teachers own those), so closed-year assignments, quizzes and lessons stay read-only for teachers and students
  and are corrected, if ever needed, by un-archiving the year.
* **Student history.** *My academic history* (`/my-academic-history`, `GET /academics/my-year-history/`) shows a student their class, section and outcome in every year
  they were enrolled and links to each year's published term results. It only ever serves the signed-in student's own record.
* **Year ended hint.** When the active year's end date has passed, the header badge shows "ended" and the academic years page tells administrators to run the rollover.

## 8. Module coverage matrix

Legend — **Updated**: changed here · **Compatible**: read and judged correct, no change · **Gap**: not done.
"Tested" lists automated tests actually run (section 9).

| Module | How the year is resolved / filtered | Status | Tested |
|---|---|---|---|
| Academic years & terms | `AcademicYear.is_current` (+ DB constraint), derived `status`; term flag likewise | **Updated** | lifecycle suite |
| Students / enrolments | permanent profile; `StudentEnrollment` per year; `current_*` pointer kept in sync; `?academic_year=` | **Updated** | lifecycle suite, students suite |
| Admissions → student | creating a student with a class/year records its enrolment (`source=admission`) | **Updated** (via `Student.save`) | lifecycle suite |
| Classes / sections | class permanent; section per year; copied by rollover | **Updated** | lifecycle suite |
| Subject offerings / teacher assignments | per year+term; copied (config only) | **Updated** | lifecycle suite |
| CA, assessments, exam scores, results | via offering/term → year; writes blocked in closed years | **Updated** | lifecycle suite (service level) |
| Exams | via term → year; creating/moving in a closed year blocked | **Updated** | **Gap:** no API-level exam test |
| Attendance | via section → year; creating/bulk-marking only in the active year; closed blocked | **Updated** | lifecycle + attendance suites |
| Timetable | via section → year; closed blocked; not copied by rollover | **Compatible** | existing suite |
| Fees: plans | per year; copied (new plans) | **Updated** | lifecycle suite |
| Fees: invoices/payments/receipts | per year; never moved/copied; payments allowed on old invoices | **Compatible** (verified untouched by rollover) | lifecycle suite |
| Finance dashboards/reports | cross-year totals by design; reports accept `academic_year_id` | **Compatible** | existing suites |
| Dashboards (headcounts, sections, term picker) | active-year sections; `current_*`; current term (now guaranteed unique) | **Compatible** | dashboard suite |
| Assignments / quizzes / live lessons | via term/section (assignments), subject offering (quizzes), section (live lessons) | **Updated** — closed-year writes blocked (create/edit/delete/grade/submit for assignments; create/delete for quizzes; schedule/edit/delete for live lessons) | assignments: lifecycle suite · quizzes and live lessons: guard added, **no API-level test** |
| Communications / events / audiences | audience picker uses active-year sections (`audience_views`) | **Compatible** | existing suites |
| Library, hostel, transport, medical, discipline, documents, records, inventory, procurement, payroll | not year-dependent | **Compatible** (no change needed) | existing suites |
| Parents / students portals | students see their own records through existing "my-…" endpoints and now a year-by-year history page; no separate parent login exists in the product | **Updated:** *My academic history* page for students (own record only) | lifecycle suite + frontend test |
| Notifications, push, scheduled/background tasks | not year-dependent. No scheduled job reads the active year | **Compatible** | |
| Audit log | `year_activated`, `year_rollover_completed`, `year_unarchived` recorded | **Updated** | lifecycle suite |
| Exports / CSV | follow the list endpoints (so `?academic_year=` applies to the students export) | **Compatible** | |

## 9. Tests

`backend/apps/academics/test_year_lifecycle.py` — 55 tests, `test_year_migration.py` — 1 test (the migrations run against data made under the old schema), and `frontend/src/features/academics/yearUi.test.tsx` — 8 tests: single-active-year (DB), read-only `is_current`, context endpoint (own years only, no active year, platform admin),
preview (writes nothing, pass-mark proposals, bad pairs, missing terms), rollover (progression, sections, history, copy rules, **old money/marks untouched**, idempotency, blocking on undecided,
atomic failure, skip already-enrolled, withdraw/transfer, class override, foreign class), activation (needs rollover/terms, swap + archive + audit, repeat, first-year, locked), closed-year writes, access (teacher/student/accountant/other school),
historical views, enrolment sync, legacy promotion tools, the migration backfill (and its idempotency), attendance only in the active year, one current term, year-deletion protection and a full end-to-end workflow (2026/2027 → 2027/2028, seen by principal, teacher, accountant, student and an outsider).
See section 10 for the results that were actually obtained and where.

## 10. Results of the runs (17 October 2026)

| Check | Result |
|---|---|
| Backend, whole suite, per app, SQLite (`BREVO_API_KEY`/`DAILY_API_KEY` blanked so tests never touch the network) | **846 passed, 4 failed.** The 4 are `apps/backups` restore tests that run Postgres-only SQL; they fail identically on the commit before this work |
| Year suite `apps/academics/test_year_lifecycle.py` | **71 passed** — single active year, context, preview, rollover, term copy, activation, closed years, **authorised corrections (principal, school administrator, exams director) + audit**, access, history, enrolment sync, legacy promotion tools, backfill, year-deletion protection, **full end-to-end workflow**, student history |
| Migration test `test_year_migration.py` | passed — runs migrations 0017/0018 against data created under the old schema (duplicate "current" year/term, students, promotions, invoices) |
| Frontend: `tsc -b`, `oxlint`, vitest | clean, **45 tests passed** (year badge, selector, rollover page decisions/confirmation/activation, student history page, "year ended" hint) |
| Year suite on **Postgres (Neon)** | earlier runs passed 34+ of the 51 then-existing tests with no assertion failures; the rest never completed because the connection to Neon kept dropping. **The latest additions (corrections, term copy, deletion, end-to-end, migration, history) were not run on Postgres.** Run: `python -m pytest --reuse-db apps/academics/test_year_lifecycle.py apps/academics/test_year_migration.py -q` |

Test hygiene found along the way: the backend tests read the real `.env`, so on a machine with a Brevo key every test that sends e-mail made a **real network call** (slow, and it could e-mail real addresses). Run the suite with `BREVO_API_KEY=` and `DAILY_API_KEY=` blank (the commands above do); a permanent fix in `conftest.py` is a good follow-up.

### 10b. Driven in a real browser (local, throw-away SQLite data — never the real database)

Using the real React app (Vite) against the real Django API with a seeded demo school (3 classes, 5 students, an invoice with a balance, a fee plan, an offering):
* signed in as a **school administrator**: header badge showed `2026/2027 · Term 1` from the server; academic years list showed Active / Upcoming with the correction notice;
* **Year rollover** page: chose 2027/2028 → Preview showed 5 students "needs a decision", configuration counts and the outstanding balance (200.00, 1 student); the Run button stayed disabled until every student had an outcome; chose outcomes → confirmation dialog → run reported *3 promoted, 1 repeated, 1 graduated*;
* **Activate** → confirmation → redirected to the years list: 2027/2028 **Active**, 2026/2027 **Closed**, header badge switched to `2027/2028`;
* as the same administrator, **edited a closed-year section** (capacity 40 → 45) and saved: it succeeded, and the audit log recorded `academics.closed_year_correction` with the year, method and path (also `year_rollover_completed` and `year_activated`);
* signed in as the **student**: the new *Academic history* page listed *2027/2028 — Grade 2 · Section A (current)* and *2026/2027 — Grade 1 · Section A — Promoted*.
Found while doing this (setup, not product bugs): the local dev proxy origin needed trusting for CSRF, and my seed script linked the student account with a tenant-scoped query that silently updated nothing.
Not driven: the principal's sign-in (2FA is mandatory for that role), a phone-sized layout, other browsers.

## 11. Known limitations and things not verified

* **Production data was never touched.** No migration was run against production. The data migrations (`dedupe` + backfill) were exercised on test databases only.
* Backfill is built only from recorded evidence (current class/year and promotion records). Students with a class but no year, or neither, get **no** enrolment and are counted in the migration output
  ("N non-applicant student(s) have no enrolment") for manual review. Historical *section* is only filled when it can be proven consistent.
* Cross-table consistency (attendance/timetable/exam rows vs enrolment year) is enforced in application code and filters, not by composite foreign keys.
* Quizzes and live lessons now have the closed-year guard but no API-level tests; exams are guarded and tested through the exams director's correction test only.
* There is no parent login in the product, so guardians cannot browse a child's history.
* Timetables, assignments, library/hostel allocations and similar are not copied by the rollover.
* Teachers' historical access is limited by the existing teacher scoping (classes they teach *now*).
* The rollover runs in one database transaction; for a very large school (many thousands of students) on a small Render instance this should be tried on a staging copy first. A chunked, resumable mode was not built.
* The rollover page now has automated tests (mocked API) **and was driven in a real browser** against a real local backend (see section 10b). It has not been driven against Postgres/Neon or the production deployment.

## 12. Deployment and migration instructions

1. **Back up first** (this adds two data migrations). Render/Neon: take a Neon branch or snapshot, **and** use the platform console's *Backup & Recovery* to create and verify an encrypted backup. Do not proceed without a verified one.
2. Deploy (`git push` → Render builds). `deploy/start.sh` runs `migrate`. Watch the log for the lines beginning `[academic years]`, `[terms]`, `[enrolments]`: they report what was cleared/created and how many students need review.
3. After it is live: sign in as a principal → *Academics → Academic years*. Confirm exactly one year is **Active** (the one the school is actually in) and its current term is right. If the school had none flagged current, activate it (the first activation needs no rollover).
4. Check *Students → View year* for the current and previous years; review any student reported without an enrolment.
5. **Recovery:** the migrations are additive. Rolling the schema back (`migrate academics 0016`) drops the two new tables and the constraints/fields but keeps all existing data; the data steps are not reversed (they only cleared duplicate "current" flags — note the counts printed at deploy time). To undo a mistaken rollover, restore from the backup taken in step 1.

## 13. Rollover operating instructions (administrator)

1. *Academic years → New academic year*: name and dates. Add its **terms** (*Terms*), same order as the current year (offerings and fee plans are matched by term order).
2. Finish the current year's results so the pass-mark rules can suggest outcomes (otherwise each student shows "needs a decision").
3. *Academic years → Year rollover*: choose the closing and opening years → **Preview**.
4. Read the warnings and counts. For every student marked **Needs a decision**, choose Promote / Repeat / Graduate / Withdraw / Transfer (and a different class if needed). Change any suggestion you disagree with.
5. Tick which settings to carry over, then **Run the rollover** and confirm. If it fails, nothing was changed — read the message, fix it and run again.
6. Students shown as "without a section" need a section in the new year (create it, then assign).
7. **Make the new year active** (confirm). The old year becomes read-only but stays viewable; the header badge switches.
8. Build the new year's timetable; arrears from the old year remain on their invoices.
