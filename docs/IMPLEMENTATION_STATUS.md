# Implementation Status

_Last updated: 2026-09-09_

## Current phase

**Phase 41 (A–H) is complete** — see the summary below. **Phase 42 (I–S) is complete** — a second
large batch: two brand-new modules (Transcripts, Education/lesson-notes), in-platform video calling
for live lessons, a per-school-branded login, a reusable confirm-dialog replacing
`window.confirm()`, summary-stat cards + scroll-reveal across every module page, event photo/video
uploads, a complaint recipient picker, a notifications sweep, and a reliability hardening pass. See
`C:\Users\Newton\.claude\plans\tingly-zooming-sedgewick.md` for the original phase-by-phase plan.

**Phase 43 is complete** — a follow-up batch requested directly (not part of the original plan
file): a real per-role dashboard (permission-gated headline stats + a chart/stat card per module
the viewer can access), four sidebar permission-precision fixes, real icons on every summary-stat
card (replacing the generic `Hash`/"#" fallback), and direct file/video/photo attachment on the
lesson-creation form. See below for detail.

**Phase 44 (A–I) is complete** — a full RBAC redesign for 5 staff roles, a CA+exam weighted grading
engine, a new Salary/payroll module, printable receipts, per-student targeting for Lessons and Live
Sessions, and student self-service completion, requested directly (not part of the original plan
file; see `C:\Users\Newton\.claude\plans\tingly-zooming-sedgewick.md`, fully overwritten with this
batch's plan). All nine sub-phases (A–I) are complete and live-verified. See below for detail.

## Phase 42 — Phase I: Shared UI foundations (complete)

- **`ConfirmDialog`/`useConfirm()`** (`frontend/src/components/ui/ConfirmDialog.tsx`): the app's
  first modal/dialog primitive — no `Modal.tsx`/`Dialog.tsx` existed before this. A
  `ConfirmProvider` + promise-based `useConfirm()` hook, mirroring `ToastProvider`/`useToast`'s
  exact shape (context + provider + one in-flight item, `AnimatePresence` fade/scale). Mounted at
  the app root in `main.tsx` alongside `ToastProvider`. **Every `window.confirm()` call site in the
  app (63 across 58 files) was replaced** with `await confirm({ title, description?, tone })` —
  done via four parallel background agents batched by domain, each verifying `tsc --noEmit` on the
  full project before reporting back; a final full-project `tsc`/`oxlint`/grep pass confirmed zero
  remaining `window.confirm()` calls and zero new type errors.
- **Card/StatCard/ChartCard overflow fix**: added `truncate` to `CardTitle`
  (`components/ui/Card.tsx`) and to `StatCard`'s label/value/footnote text nodes — the text column
  already had `min-w-0` but was missing both `truncate` on the text itself **and** `flex-1` on its
  wrapping div (without `flex-1`, a flex item never grows to fill the row, so `truncate` had nothing
  to clip against — found and fixed while editing, not just a cosmetic pass).
- **`ScrollReveal`** (`frontend/src/components/ui/ScrollReveal.tsx`): a `framer-motion`
  `whileInView` wrapper (`viewport={{ once: true, margin: "-80px" }}`), intended for page-section
  granularity only (header/stat-row/content-card, never per-table-row) — built now, rollout across
  all module pages happens in the later Phase Q mechanical pass.

## Phase 42 — Phase J: Transcript module + Exams Director role (complete)

No new model — `Result` (`apps/examinations/models.py`) already had the full
`draft→submitted→reviewed→approved→published→locked` workflow from an earlier phase.

- **`exams-director` role** added to `DEFAULT_ROLE_PERMISSION_PREFIXES`/`DEFAULT_ROLE_NAMES`
  (`apps/authorization/catalog.py`), prefixes `["results.", "examinations."]` — a named persona a
  school can delegate results-publishing to, distinct from `principal`/`school-administrator`'s
  blanket `""`-prefix access. No data migration needed: `seed_default_roles_for_school()` already
  does `update_or_create` per role slug per school, so re-running the existing
  `manage.py resync_role_permissions` command created the role for every existing school.
- **`MyTranscriptView`** (`apps/examinations/views.py`): student self-service, no permission
  gate — same `request.user.student_profile` identity-keyed pattern as `MyAssignmentsView`. Returns
  only `PUBLISHED`/`LOCKED` results, grouped by term (correctly showing two same-named terms from
  different academic years as separate groups, verified live), with the school's own name/logo
  (via `get_current_school()` + the existing `SchoolSummarySerializer`) embedded so the page is
  visibly that school's transcript. Mounted as a static `path("transcript/me/", ...)` listed
  **before** `ResultViewSet`'s bare `""`-registered router in `apps/examinations/urls.py`, so it
  always matches first rather than risking the Phase-G-documented routing collision.
- `ResultViewSet.publish` now calls `notify()` (category `"result"`) for the affected student when
  their linked portal account exists — verified live via a real submit→review→approve→publish
  chain through the actual API, confirming both the transition succeeded and the `Notification` row
  was created.
- Frontend: `frontend/src/features/examinations/TranscriptPage.tsx`, reachable via a new
  ungated `/transcript` sidebar entry (same convention as Complaints/Assignments self-service).

## Phase 42 — Phase K: Education module (complete)

New Django app `apps/education/` — teacher-posted lesson notes (documents and, per the user's
explicit choice, direct video file uploads rather than external links).

- **Models**: `Lesson` (subject/school_class required, section nullable — the exact same
  targeting shape as `Assignment`, adopted rather than the narrower "subject+section only" shape
  floated in planning, since it's a proven, already-established pattern) and `LessonMaterial`
  (lesson FK, `material_type` document/video, `file`, `uploaded_by`).
- **New `validate_video_file` validator** (`apps/common/validators.py`) — extensions
  `.mp4/.mov/.webm/.avi`, `MAX_VIDEO_SIZE_BYTES = 200MB`, named generically (not "lesson video")
  since Phase M's Event media will reuse it. `LessonMaterialSerializer.validate()` picks
  `validate_video_file` or the existing `validate_upload_file` based on the sibling
  `material_type` field, since a single `FileField` can't switch its own validators conditionally.
- **Views**: `LessonViewSet`/`LessonMaterialViewSet` (staff, gated by new `education.*`
  permissions, `education.` added to the `teacher` role prefix), `MyLessonsView` (student
  self-service, ungated, same `request.user.student_profile` pattern as `MyAssignmentsView` —
  materials are nested inline in this response only, since the staff-side `LessonSerializer` just
  exposes a `material_count` for a lighter list payload). New material uploads call
  `notify_bulk()` for the section/class's students (in-app only, no email — frequent, not urgent).
- **Frontend**: `frontend/src/features/education/` — `LessonsListPage`/`LessonFormPage` (teacher
  CRUD), `LessonDetailPage` (upload documents/videos with an upload-progress bar via axios's
  `onUploadProgress`, given videos can be up to 200MB), `MyLessonsPage` (student self-service,
  inline `<video>` playback for video materials, download links for documents). New `/education/
  lessons` (gated) and `/my-lessons` (ungated) sidebar entries.
- **Verified live end-to-end**: created a lesson as a teacher through the actual form, uploaded a
  document material via a direct authenticated multipart request (the Browser pane tool has no
  native file-input capability, matching this session's established testing convention) and
  confirmed it rendered correctly on the Lesson Detail page, then logged in as a linked student
  and confirmed `/my-lessons` shows the lesson and material correctly. Test data cleaned up
  afterward. (A principal without a linked `Staff` profile correctly gets a clean "Only staff
  members can create lessons" error rather than a raw 500 — same guard `AssignmentViewSet` already
  uses, reused verbatim.)

## Phase 42 — Phase L: Video calls for live lessons (complete)

New Django app `apps/live_sessions/`, integrating **Daily.co** (the user's choice of a third-party
video SDK over building custom WebRTC/Channels signaling) for the actual call.

- **Model**: `LiveSession` — same `subject`/`school_class`/`section`(nullable)/`teacher` targeting
  shape as `Lesson`/`Assignment`, plus an optional `lesson` FK, `status`
  (scheduled/live/ended/cancelled), and `daily_room_name`/`daily_room_url` that stay blank until
  `start` actually creates the room.
- **`apps/live_sessions/daily_client.py::create_room()`** — a thin `requests`-based wrapper around
  Daily.co's REST API, mirroring `apps.common.email.send_email`'s contract exactly: returns `None`
  and logs a warning on any failure or when `DAILY_API_KEY` is unset, **never raises**. The `start`
  action returns a clean `503 FEATURE_NOT_CONFIGURED` in that case rather than a raw error — verified
  live (no Daily.co account is configured in this dev environment): scheduling a session, listing
  it, and attempting to start it all worked cleanly, with `start` correctly failing gracefully and
  the session correctly staying in `scheduled` status rather than getting corrupted partway through.
- **`DAILY_API_KEY`** added to `backend/config/settings/base.py` and `.env.example` right next to
  the existing `BREVO_API_KEY` block — **the user needs to obtain a Daily.co account/API key**
  before live video calls can be end-to-end tested; every other part of this phase works without one.
- **Frontend**: new dependency `@daily-co/daily-js` (their vanilla client, not the React wrapper,
  matching this app's hand-rolled component layer). `frontend/src/features/live-sessions/` —
  `DailyCallFrame.tsx` (mounts `DailyIframe.createFrame()`), `LiveSessionsListPage`/
  `LiveSessionFormPage` (teacher schedule/start/end/delete), `LiveSessionRoomPage` (renders the call
  frame with a school name/logo header above it — satisfies "customized with school info" without
  needing Daily's paid custom-branding tier), `MyLiveSessionsPage` (student self-service, polls
  every 15s, a Join button appears once a session goes live). New `/live-sessions` (gated) and
  `/my-live-sessions` (ungated) sidebar entries.
- **Permissions**: `live_sessions.view/create/update/delete` added to the catalog, `live_sessions.`
  added to the `teacher` role prefix.

## Phase 42 — Phase M: Event photo/video gallery (complete)

- **New model** `EventMedia` (`apps/events/models.py`) — event FK, `media_type` (photo/video),
  `file`, `caption`, `uploaded_by`. Reuses the same media_type-branched validator pattern as
  `LessonMaterial` (`validate_image_file`/`validate_video_file` picked in the serializer, not the
  model field — a model-level `validators=` would be copied onto DRF's auto-generated serializer
  field unconditionally, wrongly enforcing image rules on video uploads too).
- **`EventMediaViewSet`** added to the existing `apps/events/urls.py` router (no new permission
  codes — upload/delete gated by the existing `events.update`, view by `events.view`, so gallery
  visibility never diverges from whatever access the parent Event already has).
- **Frontend**: a "Photos & videos" section on `EventDetailPage.tsx` — a thumbnail grid (photos as
  `<img>`, videos as an inline `<video controls>`), an upload control gated by `canUpdate`, delete
  via the existing `ConfirmDialog`.
- **Verified live**: created an event and uploaded a photo via a direct authenticated multipart
  request (established convention), confirmed it rendered correctly in the gallery with its caption
  on the actual Event Detail page. Test event (and its cascade-deleted media) cleaned up, temp
  password reverted afterward.

## Phase 42 — Phase N: Complaints "address to" recipient picker (complete)

- **Model**: `Complaint.addressed_to` (nullable FK User, `SET_NULL`) — orthogonal to
  `is_anonymous` (a submitter can stay anonymous to the addressee too, same masking as everyone
  else). Migration applied.
- **New `AddressableStaffView`** (`apps/complaints/views.py`) — a minimal, ungated (beyond
  authentication) staff directory (`id`+`name` only) for the submission form's picker. Deliberately
  **not** the full `/staff/` endpoint, which requires `staff.view` a plain self-service submitter
  (a student, with no RBAC role at all) would never have — reusing it would have 403'd the picker
  for exactly the users this feature is for. Mounted as a static path listed before
  `ComplaintViewSet`'s router entries in `apps/complaints/urls.py`, same collision-avoidance
  ordering used since Phase G/J.
- **`ComplaintViewSet.get_queryset`** extended to `Q(submitted_by=user) | Q(addressed_to=user)` for
  non-`complaints.manage` users — backward compatible (an unaddressed complaint is unaffected,
  `complaints.manage` holders still see everything).
- **A real gap found and fixed during live verification**: the addressee could see a complaint
  addressed to them but couldn't reply — `ComplaintResponseViewSet`'s `get_queryset` and
  `perform_create` only recognized `submitted_by`/`complaints.manage`, not `addressed_to`. Fixed by
  adding an `is_addressee` check alongside the existing two. Caught live: a first pass "verifying"
  this as the addressee was accidentally testing as the submitter instead (a stale/expired session
  masked as a successful re-login), and a second, deliberate check of `/auth/me/` mid-test caught
  the mistake before it could be reported as a false pass — the actual addressee-can-reply path was
  then confirmed for real after the fix.
- **Frontend**: `ComplaintFormPage.tsx` gains an optional "Address to" `Select` (defaults to "Anyone
  who handles complaints" — the unassigned flow is unchanged when left blank); `ComplaintDetailPage`
  shows the new "Addressed to" field.
- **Also surfaced, unrelated to this phase's code**: `nina.nightingale@demoacademy.test` (an
  existing seeded test account) has `is_active=False` — a pre-existing data state from earlier in
  this session, not something this phase changed; restored to its original state after testing
  rather than left active.

## Phase 42 — Phase O: Per-school branded login (complete)

- **Two new public, unauthenticated endpoints** in `apps/tenants/views.py`:
  `SchoolBrandingLookupView` (`GET /api/v1/schools/branding/<slug>/`, 404s for an unknown slug or a
  non-`active` school rather than leaking which slugs exist/their state) and `SchoolSearchView`
  (`GET /api/v1/schools/search/?q=`, a plain top-N `icontains` search, not full DRF pagination —
  a lightweight typeahead, not a list page). Both serve a new `SchoolBrandingSerializer`/
  `SchoolSearchResultSerializer` exposing **only** `name`/`slug`/`logo`/`logo_url` — deliberately
  not `SchoolSelfSerializer`/`SchoolAdminSerializer`, to keep this narrow public surface from ever
  accidentally widening. Both throttled under a new `school_branding` scope (30/min). **The actual
  authentication contract is completely unchanged** — `LoginView` still takes only email+password;
  the slug is presentation-only, resolved client-side before the real login POST.
- **Frontend**: extracted the actual auth logic out of `LoginPage.tsx` into a shared
  `LoginForm.tsx`, rendered identically by both the generic page and the new `BrandedLoginPage.tsx`
  (route `/login/:slug`) — no duplicated auth logic between them. The generic `/login` gained a
  "Find your school" search (debounced, navigates to `/login/<slug>` on selection);
  `BrandedLoginPage` fetches the branding endpoint on mount and renders that school's logo/name
  above the form, with a "Not your school? Find it here" link back to the generic page, and a
  clean "We couldn't find that school" state for an unknown/inactive slug.
- **Verified live**: searched "Demo" on the generic login page (both matching schools listed),
  selected Demo Academy and confirmed navigation to `/login/demo-academy` with correct branding,
  logged in successfully through the branded form (redirected to `/dashboard` exactly like the
  generic page), and confirmed an unknown slug (`/login/nonexistent-school`) shows the clean error
  state with a real `404` from the branding endpoint (not a raw error). Temp password reverted
  afterward.

## Phase 42 — Phase P: Dashboard "modules available to you" panel (complete)

Frontend-only, no new backend surface.

- **`NAV_CONFIG`/`NavItem`/`NavChild` extracted from `AppShell.tsx` into a new
  `frontend/src/layouts/navConfig.ts`** — not just exported alongside the `AppShell` component,
  which would have tripped oxlint's `react(only-export-components)` rule (a plain data export
  mixed with a component export breaks Fast Refresh). Both `AppShell.tsx` (the sidebar) and the new
  Dashboard panel import the same `NAV_CONFIG`, so the two can never drift apart.
- `DashboardPage.tsx` gains a "Modules available to you" section: `NAV_CONFIG.filter((item) =>
  userHasPermission(currentUser, item.permission))`, rendered as a card grid (icon + label,
  linking to `item.to`) wrapped in the Phase I `ScrollReveal`.
- **Verified live with two different roles** to prove real filtering, not just "shows everything
  for a superuser": logged in as the principal (blanket `""`-prefix access) and saw every single
  module listed; logged in as the accountant (`fees.`/`payments.`/`reports.`/`students.view`/
  `procurement.`/`inventory.view`/`events.view`/`events.register` only) and saw a correctly
  narrowed list (Dashboard, Students, Finance, Events, Complaints, My Transcript, My Lessons, My
  Live Sessions, Inventory, Procurement, Reports, Notifications, Settings) — correctly excluding
  Staff, Academics, Timetable, Attendance, Examinations, Library, Transport, Hostel, Medical,
  Parents, Discipline, Communications, Assignments, Lessons, Live Sessions, Documents, and Audit
  log, exactly matching the accountant's actual permission set. (Also reconfirmed, unrelated to
  this phase: `DashboardOverviewView` requires `reports.view` for its own core stats, so a role
  without it — like `teacher` — can't reach the dashboard at all today; a pre-existing condition,
  not something Phase P changed.) Temp passwords reverted afterward.

## Phase 42 — Phase Q: 60-page summary-stat + scroll-reveal rollout (complete)

Mechanical rollout of the Phase I mechanism (`SummaryStatsMixin` backend, `useSummaryStats`/
`StatRow`/`ScrollReveal` frontend) across every module's list page, piloted first on
`EventsListPage`/`ComplaintsListPage` before the full sweep.

- **Backend**: a declarative `summary_stats` dict added to every domain `ViewSet` paired with a
  list page — Academics, Timetable, Examinations, Attendance, Finance, Library, Transport, Hostel,
  Medical, Discipline, Communications, Assignments, Education, Live Sessions, Documents, Inventory,
  Procurement, Students, Staff, Parents (`Guardian`), Schools (`SchoolViewSet`), Platform Admins,
  Audit Log, and Notifications. Each entry reuses `filter_queryset(get_queryset())`, so a filtered
  list's stat row reflects the active filters rather than the whole table.
- **Frontend**: every `*ListPage.tsx` (60 files) gained (1) a `filterParams` object shared between
  the list query and `useSummaryStats(resource, filterParams)`, (2) a `<StatRow>` block wrapped in
  `<ScrollReveal>` right after the page header/filter row, and (3) the `<TableContainer>` block
  wrapped in its own `<ScrollReveal>`.
- **Infrastructure hiccup mid-phase**: 8 parallel background rollout agents (batched by domain) all
  failed simultaneously with a `429` account-level session-limit rate-limit, independent of this
  primary session (which kept working normally). Recovered by triaging exactly what each agent had
  completed before failing via targeted `grep` sweeps (`summary_stats` in every `views.py`,
  `StatRow` in every `*ListPage.tsx`) rather than assuming total success or total failure, then
  finishing the remaining backend and frontend work directly rather than re-queuing agents.
- **Two files caught with stray half-finished imports** (`AnnouncementsListPage.tsx`,
  `ExamSchedulesListPage.tsx`) from an agent that died mid-edit — imports for `ScrollReveal`/
  `StatRow`/`useSummaryStats` were present but never wired into JSX, caught by `oxlint`'s
  `no-unused-vars` warnings during the final verification pass, not by the earlier file-presence
  greps (which only checked for the import, not real usage). Fixed by completing the wiring; a
  follow-up sweep confirmed every `*ListPage.tsx` both imports **and calls**
  `useSummaryStats(...)`/renders `<ScrollReveal>`, not just imports them.
- **New `students.by_status`/`staff.by_status`/`schools.by_status` etc. groupby stats** added
  alongside simple counts where a natural breakdown existed (e.g. `Student.Status`,
  `Staff.EmploymentStatus`, `School.Status`), matching the pattern already used for `Invoice`/
  `Payment`/`AssignmentSubmission` in earlier phases — available to the API even where the current
  page only surfaces `total`/`active` in its `StatRow`, so a future page redesign can use them
  without a backend change.

## Phase 42 — Phase R: Notifications audit & sweep (complete)

Audited every domain app that had never called `notify()`/`notify_bulk()` (library, transport,
hostel, medical, discipline, inventory, procurement, finance/fees, attendance, staff_attendance)
for genuinely notification-worthy lifecycle events, and wired one in per event found — reusing the
existing `apps.notifications.services.notify`/`notify_bulk` helpers, no new infrastructure.

- **New shared helper `apps/parents/services.py::notify_student_guardians(student, ...)`** — every
  guardian linked to a student (via `StudentGuardian`) with a portal account, in one place, instead
  of every domain re-deriving the same join (the same duplication `events`/`communications`
  already had for audience resolution, but a student's *guardians* specifically is now common
  enough — medical, discipline, hostel, finance, attendance all need it — to warrant one shared
  function rather than a fifth copy).
- **New `apps/authorization/services.py::users_with_permission(school, code)`** — one join query
  resolving every active user in a school who holds a given permission code via any active role,
  for notifications that need to reach "whoever manages X" rather than one record's own owner
  (inventory's low-stock alert). Distinct from `user_has_permission`, which is for authorization
  checks on a single already-known user, not bulk resolution.
- **Library**: fulfilling a reservation (`BookReservationViewSet.fulfill`) now notifies the
  borrower (student or staff) that their book is ready — email, since it's a same-day pickup
  window.
- **Transport**: creating a `StudentTransportAssignment` now notifies the assigned student
  (in-app only — routine, not urgent).
- **Hostel**: `services.allocate_bed()` now notifies the student's guardians of the room/bed
  assignment — email, since check-in details matter.
- **Medical**: `MedicalVisitViewSet.perform_create` now notifies the student's guardians for every
  visit; email is added only for `incident`/`emergency` visit types, not `routine`, so a routine
  clinic check-in doesn't blast an email.
- **Discipline**: `DisciplineIncidentViewSet.perform_create` (already existed for `reported_by`)
  now also notifies the student's guardians; email added only for `moderate`/`severe` severity, not
  `minor`.
- **Inventory**: `services.record_stock_out()` now checks `quantity_in_stock <= reorder_level`
  after the stock movement and, if so, `notify_bulk()`s every user holding `inventory.update` —
  in-app only, matching `notify_bulk`'s own documented no-email-by-default contract for a
  broadcast.
- **Procurement**: `PurchaseRequestViewSet.approve`/`reject` now notify `purchase_request.
  requested_by` of the decision — email both ways, since it's a decision the requester needs
  promptly either way.
- **Finance**: `services.create_invoice_with_line_items()` (called by both direct invoice creation
  and bulk `generate_invoices_from_structure()`, so both paths get coverage from one change) now
  notifies the student's guardians of a new invoice; `services.record_payment()` now notifies them
  of a payment receipt. Both email — financial events are always time-sensitive.
- **Attendance**: a new `_notify_if_absent()` helper in `apps/attendance/views.py`, called from
  both `StudentAttendanceViewSet.perform_create` and `bulk_mark`, notifies a student's guardians
  (email) only when the marked status is `absent` — present/late/excused/early-departure don't
  notify, since a push for every status on every student every day would be pure noise, not signal.
- **Staff attendance**: audited, no notification added — no natural external recipient exists for
  "a staff member's own check-in/out was recorded" (the record is visible to them and to
  admin-facing reports already; there's no guardian-equivalent to reach), an explicit finding, not
  an oversight.
- `Notification.category` is a free-text `CharField` with no `choices=` constraint (already true
  before this phase), so every new category string (`library`, `transport`, `hostel`, `medical`,
  `discipline`, `inventory`, `procurement`, `finance`, `attendance`) needed no migration; the
  frontend's `categoryLabel()` already humanizes any snake_case/lowercase value generically, so no
  frontend change was needed either.

## Phase 42 — Phase S: Concurrency & reliability hardening (complete)

Bounded to the concrete issues the plan flagged, not an open-ended audit.

- **`Event.register` race condition fixed**: the capacity check (`registered_count >= capacity`)
  and the registration create were a plain check-then-act with no locking — two concurrent
  registrations for the last remaining spot could both pass the check. Wrapped in
  `transaction.atomic()` with `Event.unscoped_objects.select_for_update().get(pk=...)`, the same
  template already used by `finance.record_payment`/`library.checkout_book`/`hostel.allocate_bed`.
- **`ResultViewSet._transition()` had the identical gap** (every `submit`/`review`/`approve`/
  `publish`/`lock` action shares this one method) — a doubled-up click on "publish" could pass the
  `status in from_statuses` check twice before either write committed, both transitioning the
  result and, for `publish` specifically, both firing the student notification. Fixed with the same
  `select_for_update()`-then-recheck pattern; the second concurrent request now correctly sees the
  already-updated status and is rejected as `INVALID_TRANSITION` instead of silently
  double-transitioning.
- **Password-reset flow spot-checked, found already safe, no change made**: Django's stock
  `PasswordResetTokenGenerator` (`apps/authentication/tokens.py::password_reset_token`) includes
  the user's current password hash in the token's hash input, so `confirm_password_reset()`'s
  `set_password()` call self-invalidates the token for any replay — a form of built-in single-use
  enforcement that needs no extra locking. The one residual race (two concurrent submissions of the
  *same still-valid* token, before either commits) is a benign double-processing (two identical
  audit-log entries, two "password changed" emails, last write wins on the final password) with no
  security or data-integrity consequence, not a bug worth a fix.
- **`db_index` reviewed for this batch's new high-traffic-filtered fields, found consistent with
  existing convention, no change made**: `LiveSession.status`, `Lesson.subject`/`section`,
  `EventMedia.media_type`. `Complaint.addressed_to` is a `ForeignKey`, already indexed
  automatically by Django/Postgres. The two plain `CharField`-with-`choices` fields
  (`LiveSession.status`, `EventMedia.media_type`) were checked against every other `status`-shaped
  `CharField` in the codebase (`grep` across all 27 `models.py` files): **zero of the 15 existing
  ones use `db_index=True`** — a school's own row count for any of these tables is naturally
  bounded by tenant scoping, and adding an index to only the two newest fields while leaving every
  pre-existing one un-indexed would be an inconsistent, out-of-scope change rather than a real fix.
- **Neon/pgbouncer pooling settings reviewed, found already correct, no change made**:
  `backend/config/settings/base.py` already sets `conn_max_age=600` and
  `DISABLE_SERVER_SIDE_CURSORS = True` — exactly Neon's own documented recommendation for a
  Django app running behind its connection pooler in transaction mode.

## Phase 44 (A–I): RBAC redesign, grading engine, Salary module, receipts, targeting, self-service (complete)

Requested directly by the user after Phase 43 closed — a full redesign of what each of five staff
roles (Principal, School Administrator, Accountant, Exams Director, Teacher) can see and do, a new
weighted CA+exam grading engine, and a brand-new Salary/payroll module. Full plan at
`C:\Users\Newton\.claude\plans\tingly-zooming-sedgewick.md`.

- **Phase A — `/settings`/`/notifications` render inside the normal sidebar shell.**
  `frontend/src/layouts/AccountLayout.tsx` now delegates to `PlatformShell` or `AppShell` based on
  `is_platform_admin`, instead of rendering its own bespoke topbar — both shells already render
  `<Outlet />`, so this needed no route or nav changes.
- **Phase B — Self-service identity signal.** `CurrentUserSerializer` gained `is_student`/
  `is_staff_member`; a new `selfServiceFor?: "student" | "student-or-staff"` field on
  `NavItem`/`NavChild` plus `isNavItemVisible()` (`useAuth.ts`) lets nav items like "My Transcript"
  gate on account identity instead of a permission code — student portal accounts hold zero RBAC
  permissions, so there was previously no way to hide these items from staff roles at all.
- **Phase C — RBAC permission catalog redesign.** New `salary.*` permission codes. Rewrote
  `DEFAULT_ROLE_PERMISSION_PREFIXES` (`apps/authorization/catalog.py`) to an include/exclude dict
  shape (`_normalize_spec` in `services.py` still accepts a plain list for unchanged roles) so
  Principal can be expressed as "grant everything, then take back a few things" (`[""]` minus
  attendance/inventory create-update-delete and the assignments/education/live_sessions modules
  entirely). **Fixed a real, pre-existing bug**: `seed_default_roles_for_school` was purely
  additive — it never revoked a `RolePermission` row, so narrowing a role in the catalog alone would
  have silently left every school's existing roles holding their old, too-broad permissions. Now
  does a full add+remove sync for `is_system=True` roles. `resync_role_permissions` re-run against
  the dev database and live-verified: School Administrator's sidebar shows Results/Enter
  marks/Report card but not Exams/Grading-scales (has `results.*` but not `examinations.*`, exactly
  per the new design), and no Timetable/Audit; Teacher's sidebar shows exactly Students (view-only,
  confirmed no Add/Edit/Delete controls)/Communications/Complaints/Assignments/Lessons/Live
  Sessions/Documents, nothing else.
- **Phase D — Grading engine.** `Subject.ca_weight_percent`/`exam_weight_percent` (must sum to 100).
  `Assignment.weight` (relative, teacher-set) and `Assignment.term` (nullable FK, with a
  `due_date`-range fallback for legacy rows). `Result` split into `exam_score` (raw input),
  `ca_score` (snapshot of the weighted-assignment average, computed once when `exam_score` is
  entered), and `score` (auto-combined final value — unchanged field name/role). New
  `apps/examinations/services.py` (`compute_ca_score`, `combine_score`, `enter_exam_score`): if no
  assignment is graded yet for that student/subject/term, `ca_score`/`score` stay `null` rather than
  treating missing CA as zero — an incomplete grade can never be silently published. All three
  frontend write paths (`bulk_enter`, a plain PATCH via `ResultEditPage.tsx`, and
  `ResultViewSet.correct`) funnel through the same `combine_score()` so they can't desync.
  `ResultsListPage.tsx`/`TranscriptPage.tsx`/`ReportCardPage.tsx`/`EnterMarksPage.tsx` all show the
  new Exam/CA/Final breakdown alongside Grade.
- **Phase E — New Salary module** (`apps/salary`, mirroring `apps/finance` file-for-file).
  `SalaryStructure`/`SalaryStructureItem` (basic/allowance/deduction line items) define a reusable
  payroll template; `StaffSalaryAssignment` links one to a staff member; `SalaryPayment` snapshots
  gross/deductions/net at generation time (editing a structure later never retroactively changes an
  already-generated payment, mirroring `Invoice`'s stored-totals approach). `generate_salary_
  payments_for_month()` is idempotent (re-running for the same month skips staff who already have a
  payment); `record_salary_payment()` mirrors `finance.services.record_payment`'s `select_for_update`
  pattern and notifies the staff member in-app + email. New frontend `features/salary/` (structures/
  items/assignments/payments pages, a "Generate this month's payments" flow, a pay-a-pending-payment
  page) and a `navConfig.ts` "Salary" entry gated `salary.view`. **Verified live, full end-to-end**:
  logged in as Accountant, created a "Teacher Grade A" structure with a 1000 basic-pay line item,
  assigned it to a staff member, generated September 2026 payments (created exactly 1, net 1000.00),
  and recorded the payment — status correctly flipped to Paid.
- **Phase F — Receipts.** Three pure-frontend printable pages, same pattern as the Transcript
  page (school name/logo from `useCurrentUser()`, a `window.print()` button, no new backend
  endpoint): `PaymentReceiptPage.tsx` (`/finance/payments/:id/receipt`), `SalaryPaymentReceiptPage.
  tsx` (`/salary/payments/:id/receipt`), `PurchaseOrderReceiptPage.tsx` (`/procurement/orders/:id/
  receipt` — reflects cumulative received-to-date totals, matching `PurchaseOrderItem.
  quantity_received`'s existing cumulative-counter data model). Reachable via a small printer-icon
  button added to `PaymentsListPage.tsx`/`SalaryPaymentsListPage.tsx` rows and a "Receipt" button
  on `PurchaseOrderDetailPage.tsx` (shown once an order is past `draft`).
- **Phase G — Lesson per-student targeting.** `Lesson.target_type` (`class_section` default |
  `specific_students`) + new `LessonEnrollment` model, mirroring `Event`/`EventRecipient` exactly.
  `MyLessonsView`'s filter is now a union: the original class/section match (unchanged for every
  pre-existing lesson) OR an explicit `LessonEnrollment` match. New `LessonEnrollmentViewSet`,
  every action gated `education.update` (not the usual list→view split) — enrolling a student is
  an update-the-lesson's-audience action. `LessonFormPage.tsx` gained an "Audience" select + a
  checkbox roster picker (staged locally, synced against existing enrollments via diff on save —
  same create-then-attach shape Phase 43's material-upload flow already established for a resource
  that needs the parent's id first). **A real RBAC gap was caught and fixed during this phase's
  live verification**: Teacher had no `academics.view` at all (Phase 44C's original spec never
  listed it), so the Lesson form's Subject/Class/Section dropdowns 403'd for a teacher — the exact
  role meant to create lessons. An Explore-agent audit confirmed the same gap for Accountant
  (`FeeStructureFormPage`/`InvoiceFormPage`/`GenerateInvoicesPage` all need Term/Academic-Year/
  Class pickers) and Exams Director (`ExamFormPage`/`ExamScheduleFormPage` need Term/Subject/Class
  pickers) — all three roles' catalog specs now include `academics.view`, re-synced live and
  re-verified.
- **Phase H — Live-session recipient picker + notifications + reminders.** Same `target_type`/
  `LiveSessionRecipient` mirror as Phase G, chosen independently per session (not inherited from a
  linked `Lesson`). Notifications use the singular `notify()` looped per recipient, not
  `notify_bulk()` (confirmed zero email params) — invited once at creation
  (`LiveSessionRecipientViewSet.perform_create` → `services.notify_new_recipient`) and again when
  the session goes live (`services.notify_session_started`, now resolving recipients from either
  the class/section broadcast or the explicit list via `_resolve_recipient_users`). No scheduled-
  task infrastructure exists in this codebase (no Celery, no cron beyond manual management
  commands), so automatic "15 minutes before" reminders are out of scope — instead a manual
  `remind` action + a "Send reminder now" button on the room page re-runs the same resolution +
  notify loop on demand. `MyLiveSessionsView` got the same union-filter fix as Phase G's
  `MyLessonsView`. **Verified live end-to-end**: scheduled a specific-students session, invited a
  student (recipient created, `notify_new_recipient` correctly skipped the actual notification
  since that seed student has no portal account — the same `user__isnull` guard every other
  self-service notifier uses), confirmed the union query resolves correctly via a direct queryset
  check, and clicked "Send reminder now" through the real HTTP endpoint (toast confirmed, request
  returned 200).
- **Phase I — Student self-service completion.** Three new views, the exact `MyLessonsView`/
  `MyLiveSessionsView` shape (plain `TenantScopedAPIView`, no permission gate, filters
  `getattr(request.user, "student_profile", None)`, graceful empty response if absent):
  `MyDisciplineView`, `MyMedicalView` (profile + visit history, `profile: null` when none recorded
  yet), `MyTransportView` (route/stop/vehicle, `assignment: null` when unassigned). Two pre-existing
  but previously-unreachable-from-the-UI backend views got their first frontend pages/routes/nav
  entries: `MyTimetablePage.tsx` (grouped by day) and `MyDocumentsPage.tsx` — both gated
  `selfServiceFor: "student-or-staff"` (their backend views already serve both identities), the
  other three gated `"student"`. **Verified live** logged in as a real student portal account
  (`p11-student@example.test`, reset via a temp one-off script — none existed for Demo Academy) at
  desktop width: all 8 self-service sidebar items render (My Discipline/Transcript/Lessons/Live
  Sessions/Medical/Transport/Timetable/Documents), and all 5 new pages load correctly — My
  Documents showed real data (a personal + a school-wide document), the other four correctly showed
  their empty states for a student with no records yet.
- Every phase verified via `manage.py check` + `tsc --noEmit` + `oxlint` (unchanged 8/9-warning
  baseline — Phase G/H each added one expected `react(incompatible-library)` warning for a new
  `useQuery`-based roster picker, same class already present on `StudentFormPage`/
  `ReservationFormPage`) in addition to the live-browser checks noted above.

## Phase 43: Role-aware dashboard, sidebar permission fixes, stat-card icons, lesson uploads (complete)

Requested directly by the user after Phase 42 closed, not part of the original plan file.

- **`DashboardOverviewView` no longer requires `reports.view`** (`apps/reports/views.py`) — it's now
  `IsAuthenticated`-only, so every logged-in school user can load the dashboard at all. This closes
  a real pre-existing gap flagged-but-not-fixed back in Phase P ("a role like `teacher` … cannot
  open the dashboard page in the first place"). `services.dashboard_overview(school, user)` now
  computes each of its six headline numbers independently, gated by that number's own domain `.view`
  permission (`students.view` for active-student count, `staff.view` for active-staff, etc.) —
  a user without a given permission simply doesn't get that key in the response, rather than either
  blocking the whole endpoint or leaking every number to everyone.
- **New "Your modules" dashboard section** (`frontend/src/features/dashboard/ModuleSummaryCard.tsx`,
  `moduleSummaryConfig.ts`) replaces the old plain icon+label link grid — each of 22 modules gets a
  real data card (headline number(s) plus a small pie-chart breakdown when the module's
  `summary_stats` declares a `groupby` entry), still linking through to the module, still filtered
  by the exact same `NAV_CONFIG` permission strings the sidebar uses. Built entirely on Phase Q's
  existing `/{resource}/summary/` endpoints — zero new backend surface for the module cards
  themselves, just the dashboard-overview permission fix above.
- **Four sidebar nav items were gated by the wrong permission** — `navConfig.ts`'s "Take
  attendance," "Enter marks," "Generate invoices," and "Checkout" are all dedicated action pages
  (not browsable lists with an optional create button), but were gated by `attendance.view`/
  `results.view`/`fees.view`/inherited `library.view` — the permission to *see* the domain, not the
  `attendance.create`/`results.create`/`fees.create`/`library.create` the page's actual backend
  action requires. Fixed to gate each by its real action permission. In this codebase's seeded
  roles the fix is invisible (a prefix-based role always grants a domain's view+create together),
  but it makes the sidebar correctly show a real "not able to perform" boundary for any
  custom/edited role — the exact case a school's admin can create via the RBAC UI.
  Verified live: a teacher's dashboard now loads showing only `students.view`/`attendance.view`-
  backed headline stats and 10 modules matching their actual permission set, with the sidebar's
  "Attendance" children (Take attendance/Records/Stats) shown since their seeded role grants the
  whole domain together, and "Staff attendance" correctly absent (`staff_attendance.view` not
  granted); a principal's dashboard shows all six headline stats and 20+ module cards with working
  pie charts, verified responsive at 375px (mobile) — every stat card and module card correctly
  reflows to a single column with no clipping or overflow.
- **Every `<StatRow>` item across all 62 `*ListPage.tsx` files now carries a real, semantically-
  matched `icon`** (`StatRowItem.icon` already existed as an optional prop from Phase Q — it just
  went unused everywhere, so `StatRow` fell back to a generic `Hash` glyph, i.e. a literal "#" on
  every stat card). Done via 6 parallel background agents batched by domain, each instructed to
  prefer reusing an icon the file already imports (its `EmptyState`'s icon, most often) before
  adding a new one — kept the `lucide-react` import diff minimal per file. Verified via a full
  `tsc`/`oxlint` pass (unchanged at the 8-warning baseline) plus a grep sweep confirming every
  `key:` in every `StatRow` block has a matching `icon:`.
- **The lesson-creation form can now attach materials before the lesson exists**
  (`frontend/src/features/education/LessonFormPage.tsx`) — `LessonMaterial` always requires an
  existing `lesson` id (confirmed via the model/serializer/view, no nested-write capability), so
  this can't be one atomic request. Instead: the create-mode form now has a "Materials (optional)"
  section (type/title/file picker, staged into local state, unlimited entries with a preview list
  and remove button); on submit, the lesson is created first, then every staged material is
  uploaded sequentially via the same `useCreateMaterial` mutation `LessonDetailPage.tsx` already
  used for post-creation uploads, with a "Uploading material X of N…" progress state on the Save
  button. A partial-failure mid-chain shows exactly how many materials failed (with a pointer to
  retry from the lesson page) rather than silently swallowing the error or blocking navigation.
  Edit mode is unchanged — it keeps using the Detail page's existing separate upload flow, since
  that already works and rebuilding it inline would just duplicate proven code. **Verified live,
  full end-to-end, not just code review**: logged in as a teacher, filled the form, attached a real
  file via a synthetic `DataTransfer`-injected `File` (the Browser pane's automation can't drive a
  native OS file-picker dialog, but can set `<input type="file">.files` directly, which triggers
  the exact same `change` event a real pick would), submitted, watched the "Uploading material 1 of
  1…" state, and confirmed the resulting Lesson Detail page shows the material in its list with the
  correct uploader/date. Test lesson (and its cascade-deleted material) cleaned up afterward.

## Completed phases summary (40, A–H)

- **Phase 40 — Reports**: read-only aggregate reporting (`apps/reports`). Four report pages, each
  with a permission-gated CSV export.
- **Phase A — Branding, full-width layout, sidebar nav, shared Avatar**: `School.logo`; a repeated
  `mx-auto max-w-{lg|2xl}` wrapper removed from 74 Form/Detail pages; `Settings`/`Notifications`
  added to both sidebars; new shared `Avatar` component with an `isOnline` prop.
- **Phase C — Photo uploads**: `Guardian.photo` (new field); `Staff.photo` (read-only property +
  write-only `photo_upload`). Photo pickers + `Avatar` wired into every relevant page.
- **Phase B — Real per-user presence**: `User.last_seen_at` + computed `is_online`. A 60s
  heartbeat.
- **Phase D — Default passwords + admin reset-to-default**: `generate_default_password(school)`.
  School-user provisioning activates immediately with this password. `users.reset_password`
  permission gates a reset action on Staff/Guardian.
- **Phase E — Dashboard charts**: `recharts`-backed charts on `DashboardPage`, reusing Reports.
- **Phase F — Platform admin "view this school's data" mode**: an `X-Acting-School` header
  (platform-admin-only), fixed tenant-scoping precedence in `TenantManager`, and a
  `get_current_school()` helper that replaced `request.user.school` across **18 files** spanning
  every domain app (found via a repo-wide grep after the obvious base-class fix alone wasn't
  enough). Frontend: `lib/actingSchool.ts` + `hooks/useActingSchool.ts`, a "View school data"
  button, and an exit banner in `AppShell`.

Full detail on each of these lives in this file's git history and in `docs/ARCHITECTURE.md`'s
per-phase paragraphs, which remain the authoritative long-form record.

## Phase G — Events module (complete)

New Django app `apps/events/`, mirroring `apps/communications`'s audience-targeting shape exactly
(same `TargetType` enum, same same-school validation, same "explicit recipient list only for
`specific_users`" pattern) plus a genuinely new concept — actual RSVP/attendance tracking, which
Communications has no equivalent of.

- **Models**: `Event` (title, description, category, start/end datetime, location, nullable
  `capacity`, `status` draft/published/cancelled, the audience-targeting fields, `created_by`, plus
  a `registered_count` property). `EventRecipient` (notification-only audience list, only populated
  for `target_type=specific_users` — mirrors `AnnouncementRecipient`). `EventRegistration` (the
  actual RSVP list — event/user pair, `status` registered/cancelled/attended, unique-together on
  event+user) — deliberately a **separate concept** from `EventRecipient`: one is "who gets
  notified an event exists," the other is "who has actually signed up to attend."
- **Views** (`EventViewSet`): standard CRUD plus `publish` (draft→published, notifies the resolved
  audience via `apps.events.services.publish_event`, mirroring `publish_announcement`), `cancel`
  (→cancelled), `attendees` (GET, gated at `events.view` — deliberately broad, most staff roles can
  see who's coming), `register`/`cancel-registration` (POST, gated at the new `events.register`
  permission — the viewer registers/unregisters *themselves*, not an arbitrary user; checked
  against `event.status == published`, capacity, and an existing-registration guard returning a
  clean `ALREADY_REGISTERED`/`EVENT_FULL`/`NOT_PUBLISHED` error rather than a raw 500 or a
  duplicate row via the unique constraint).
- **Permissions**: `events.view/create/update/delete/register` added to the catalog; `events.`
  granted broadly to `teacher`/`registrar` (view+register+manage) and narrowly to `accountant`
  (`events.view`/`events.register` only — an accountant can attend a staff meeting, not manage the
  events calendar). `principal`/`school-administrator` get everything via their existing `""`
  prefix, as always.
- **URL mounting**: `router.register("events", ...)` / `router.register("event-recipients", ...)`,
  mounted bare at `api/v1/` (matching `apps/assignments`'s pattern — explicit full resource names
  at registration time, not a nested `app-name/resource-name` path) rather than
  `apps/communications`'s nested-prefix style, specifically to avoid a routing collision a `""`-
  registered main resource plus a differently-prefixed sub-resource would have risked (a DRF
  router's default `{pk}` lookup regex isn't restricted to UUID shape, so a literal sub-resource
  path segment could otherwise ambiguously match the main resource's detail route first).
- **Frontend** (`frontend/src/features/events/`): `EventsListPage` (category/status filters, inline
  publish/cancel/delete actions), `EventFormPage` (mirrors `AnnouncementFormPage`'s audience-
  targeting UI exactly, plus category/datetime/location/capacity fields — datetime-local↔ISO
  conversion handled by a small `toLocalInputValue` helper), `EventDetailPage` (full details, a
  Register/Cancel-my-registration section for the viewer, a staff-only attendee table). A
  `CalendarDays` sidebar entry gated on `events.view`.

## Phase H — Complaints module (complete)

New Django app `apps/complaints/`, reusing `apps/assignments`'s `MyAssignmentsView` self-service
pattern rather than an RBAC role grant — this system's seeded role catalog has no student/parent
role, so submitter access is achieved through plain `IsAuthenticated` plus a `get_queryset()` split.

- **Models**: `Complaint` (`submitted_by` FK User — always the real submitter, never null;
  category academic/facility/behavioral/administrative/other; subject; description; priority
  low/normal/high; status submitted/under_review/resolved/rejected; nullable `assigned_to` FK User;
  `is_anonymous` bool; `resolution_notes`; `resolved_at`; timestamps) and `ComplaintResponse`
  (complaint FK, author FK User, message, `created_at`) — a flat two-way reply thread between the
  submitter and whichever staff member picks it up. Both models' `save()` validate the related
  records belong to the same school.
- **Anonymity is soft, not data-suppressing**: `is_anonymous` never nulls `submitted_by` — instead
  `ComplaintSerializer.get_submitted_by`/`get_submitted_by_name` (`SerializerMethodField`s) mask
  identity from every viewer except the submitter, including staff with `complaints.manage`. Keeps
  the data traceable for moderation while genuinely hiding it from every API response the frontend
  ever renders.
- **Views**: `ComplaintViewSet` — standard CRUD plus `assign`/`resolve`/`reject` actions (staff-only,
  `complaints.manage`), `get_queryset()` branching between "all complaints in the school"
  (`complaints.view`/`.manage` holders) and "my own submissions only" (everyone else, via
  `submitted_by=request.user`), `perform_create` audit-logs every new submission.
  `ComplaintResponseViewSet.perform_create` checks object-level access explicitly (submitter of the
  parent complaint, or a `complaints.manage` holder) since a flat response queryset can't easily
  express "any response on a complaint I'm allowed to see."
- **Permissions**: new `complaints.view`/`complaints.manage` codes; granted via the existing `""`
  prefix to `principal`/`school-administrator` as always, and via the `"complaints."` prefix
  addition to `registrar`'s existing prefix list — no student/parent role exists to grant
  self-service access to, since that access comes from authentication alone, not RBAC.
- **URL mounting**: bare `api/v1/` mount with both resources fully named at the router
  (`router.register("complaints", ...)`, `router.register("complaint-responses", ...)`) — the same
  shape Phase G established specifically to avoid a `""`-registered-resource routing collision,
  applied here from the start rather than rediscovered.
- **Frontend** (`frontend/src/features/complaints/`): `ComplaintsListPage` (category/status/priority
  filters, copy adapts to "Every complaint submitted in your school" for staff vs. "Complaints and
  suggestions you've submitted" for self-service users, a Submitted-by column shown only to staff),
  `ComplaintFormPage` (category/priority selects, subject/description, an "Submit anonymously"
  checkbox), `ComplaintDetailPage` (status/priority badges, a staff-only "Staff actions" card with
  assign-to-staff/resolution-notes/resolve/reject — hidden once the complaint is closed — and a
  response thread with a reply box open to both the submitter and staff). A `MessageSquareWarning`
  sidebar entry with no permission gate (visible to everyone, since every authenticated user can
  submit a complaint).

## Known gaps / not yet built

Same pre-existing gaps carried forward from earlier phases: no server-side date-range filter on the
Audit endpoint; Audit not reachable from `PlatformShell`; `SchoolViewSet.destroy` is
live/unguarded/unlogged; no "last remaining platform admin" lockout guard; no in-app `ConfirmDialog`
(native `window.confirm()` only); no dedicated frontend test suite yet.

## Technical decisions worth remembering

- **A large multi-feature request gets broken into the same one-phase-at-a-time cadence as every
  single-module build this session** — planned up front via plan mode as phases A–H.
- **`EventRecipient` (notification audience) and `EventRegistration` (actual RSVP) are
  deliberately two separate models, not one** — conflating them would mean either every notified
  person looks like they've RSVP'd, or capacity/attendance tracking would have to awkwardly filter
  a table that mixes both meanings. The same split exists implicitly in Communications (which only
  has the notification-audience half, since announcements have no RSVP concept), made explicit here
  because Events needs both halves at once.
- **A DRF router mounted bare at `api/v1/` with fully-named registrations (`"events"`,
  `"event-recipients"`) is safer than a `""`-registered main resource plus a named sub-resource
  under a shared app-prefix** — the latter risks the sub-resource's static path segment being
  swallowed by the main resource's `{pk}` detail route, since DRF's default lookup regex isn't
  UUID-restricted. `apps/assignments` already established the safe pattern; `apps/finance` and
  `apps/communications` show the other safe pattern (every resource explicitly named, mounted
  under a shared app prefix) — either is fine, but a bare `""` registration mixed with sibling
  named registrations under the same router is the one combination to avoid.
- **A submitter-sees-own / staff-sees-all split can be done with plain `IsAuthenticated` plus a
  `get_queryset()` branch instead of an RBAC role** — this system's seeded role catalog has no
  student/parent role at all, so Complaints' self-service access (like Assignments' before it) comes
  from checking `submitted_by=request.user` in the queryset, not from a permission grant.
- **Anonymity in an app that otherwise never hides ownership is done at serialization time, not by
  nulling the FK** — `Complaint.submitted_by` always holds the real user; `is_anonymous` only makes
  `ComplaintSerializer` mask it via `SerializerMethodField`s, including from staff. Nulling the FK
  would have made abuse of the anonymous option untraceable even for legitimate moderation.
- (Carried forward: dotted `source=` is fine for read-only serializer fields, risky for writable
  ones reaching through a relation; response envelope conventions; cross-feature type imports are
  fine; Decimal fields serialize as strings; a DRF `@action` with an underscore in its method name
  needs an explicit `url_path` to get a hyphenated URL; adding a new permission code requires
  `manage.py seed_permissions && manage.py resync_role_permissions`.)

## Testing status

Phase H: `npx tsc --noEmit` clean; `npx oxlint` clean (no new warnings, same 7 pre-existing).
Backend: `python manage.py check` clean; `makemigrations`/`migrate complaints` applied cleanly;
`seed_permissions`/`resync_role_permissions` re-run for the new `complaints.*` codes. Direct
authenticated-HTTP smoke test (submit → list → assign → respond → resolve → submitter follow-up)
passed end-to-end before any browser testing. Full live browser walkthrough covering both roles:
as a school user, submitted a real complaint through the UI form (category/priority/subject/
description, anonymity checkbox), confirmed the "Complaint submitted" toast and detail-page
navigation, posted a reply in the response thread; as the school's principal, opened the same
complaint from the staff list view (confirmed the submitter's name is visible and the list copy
reads "Every complaint submitted in your school"), assigned it to a staff member (toast + status
flipped to Under Review + Assigned To updated), resolved it with resolution notes (toast + status
flipped to Resolved + the Staff actions card correctly disappeared since the complaint is now
closed), and posted a staff reply that appeared correctly in the same two-way thread as the
submitter's earlier message. All requests during this walkthrough returned 200/201 with no errors.
Test complaint and both temp passwords cleaned up afterward.

Phase G: `npx tsc --noEmit` clean; `npx oxlint` clean (no new warnings, same 7 pre-existing).
Backend: `python manage.py check` clean; `manage.py makemigrations`/`migrate events` applied
cleanly; `seed_permissions`/`resync_role_permissions` re-run for the new `events.*` codes. Direct
authenticated-HTTP smoke test (create draft → publish → register → attendees → duplicate-register
correctly rejected with `ALREADY_REGISTERED`) passed end-to-end before any browser testing. Full
live browser walkthrough as a school user: created a real event through the UI form (audience
targeting, datetime pickers, capacity), confirmed the "Event created" toast and detail-page
navigation, clicked Publish (toast: "Published to 3 recipient(s).", status badge flipped to
Published, a Register section appeared), clicked Register (toast: "You're registered", attendance
count and the attendee table both updated live), confirmed the Events list page shows the event
with correct attendance/status columns and working action icons. A fresh, never-before-used browser
tab confirmed zero console errors (this session's long-lived tabs accumulate historical 401/502
noise from many earlier logins/navigations that a stale-tab console read can't distinguish from
something current). Test event and temp password cleaned up afterward.

A full backend test-suite run (`pytest -q`, no path filter) validating Phase F's wide-reaching
`request.user.school` sweep plus the new Events and Complaints apps together was started clean
(confirmed no leaked test-database connections beforehand). **Result: 244 passed, 0 failed** (a
~89-minute run against the Neon-hosted test database — this environment's remote test DB makes a
full unfiltered suite run far slower than a local Postgres would; only known-benign warnings, no
failures — one Django-deprecation warning already tracked, and the same test-teardown
"database is being accessed by other users" connection-timing quirk documented earlier in this
session, not a code regression).

Run backend tests with `cd backend && pytest`. Run frontend checks with `cd frontend && npx tsc
--noEmit && npx oxlint`. After adding any new permission code: `python manage.py seed_permissions
&& python manage.py resync_role_permissions`.

**Phase 42 I+J**: `npx tsc --noEmit` clean (verified after all 58 `window.confirm()` files plus the
new Transcript files); `npx oxlint` shows 8 warnings — the same 7 pre-existing plus exactly one new
one on `ConfirmDialog.tsx` (`only-export-components`, the identical category `Toast.tsx` already
has, expected for this provider+hook file shape, not a regression). `python manage.py check` clean;
`resync_role_permissions` re-run for the new `exams-director` role (3 schools). Live browser
verification: submitted a real `Result` through the actual submit→review→approve→publish API chain
as a principal, confirmed the `publish` step created a `Notification` for the student; logged in as
that student and confirmed `/transcript` renders the school's name/logo, correct term grouping
(including two different terms both named "Term 1" from different academic years, correctly kept
separate), and correct scores/grades. Separately verified the new `ConfirmDialog` renders and
cancels correctly on a live delete action (Academics → Subjects). Test data cleaned up, temp
passwords reverted afterward.

**Phase 42 K**: `npx tsc --noEmit` clean; `npx oxlint` unchanged at 8 warnings (same as I+J, no new
ones). `python manage.py check` clean; `makemigrations`/`migrate education` applied cleanly;
`seed_permissions`/`resync_role_permissions` re-run for the new `education.*` codes. Full live
walkthrough: created a lesson as a teacher through the actual form (subject/class/section pickers),
confirmed navigation to the detail page; uploaded a document material via a direct authenticated
multipart request (established convention — the Browser pane's file input has no native upload
capability) and confirmed it rendered correctly on the Lesson Detail page with uploader name/date;
linked a student to a portal account, logged in as them, and confirmed `/my-lessons` shows the
lesson and material correctly with a working download link. Also confirmed a principal without a
linked `Staff` profile gets a clean validation error instead of a 500 when attempting to create a
lesson. Test data cleaned up, temp passwords reverted afterward.

**Phase 42 L**: `npx tsc --noEmit` clean; `npx oxlint` unchanged at 8 warnings. `python manage.py
check` clean; `makemigrations`/`migrate live_sessions` applied cleanly; `seed_permissions`/
`resync_role_permissions` re-run for the new `live_sessions.*` codes. `npm install
@daily-co/daily-js` succeeded with 0 vulnerabilities. Full live walkthrough: scheduled a live
session as a teacher through the actual form, confirmed it listed correctly, clicked Start and
confirmed the backend correctly returned `503 FEATURE_NOT_CONFIGURED` (no `DAILY_API_KEY` set in
this dev environment) with the session correctly remaining in `scheduled` status rather than any
partial/corrupted state — the exact "gracefully degrade" behavior this phase was designed around.
Confirmed the new `/live-sessions` and `/my-live-sessions` sidebar links render correctly. Test
session cleaned up, temp password reverted afterward. **Full video-call join/room flow remains
untested pending a `DAILY_API_KEY`** — flagged to the user as a prerequisite for end-to-end
verification of the actual call UI, not a blocker for anything else in this batch.

**Phase 42 M**: `npx tsc --noEmit` clean; `npx oxlint` unchanged at 8 warnings. `python manage.py
check` clean; `makemigrations`/`migrate events` applied cleanly (no new permission codes, so no
`seed_permissions`/`resync_role_permissions` needed this time). Full live walkthrough: created an
event and uploaded a photo via a direct authenticated multipart request, confirmed it rendered in
the gallery with its caption on the actual Event Detail page. Test event cleaned up (cascade-deleted
its media), temp password reverted afterward.

**Phase 42 N**: `npx tsc --noEmit` clean; `npx oxlint` unchanged at 8 warnings. `python manage.py
check` clean; `makemigrations`/`migrate complaints` applied cleanly (no new permission codes). Full
live walkthrough with two real accounts: submitted a complaint as a teacher addressed to a specific
staff member (no `complaints.manage`), confirmed the notification fired and the addressee could see
it in their own list/detail page; found and fixed a real gap where the addressee couldn't reply
(only submitter/`complaints.manage` were recognized), then re-verified for real as the addressee
after logging in fresh and confirming via `/auth/me/` — the reply posted successfully and notified
the submitter. Test complaint cleaned up, both temp passwords reverted (including restoring an
unrelated pre-existing test account's `is_active=False` to its original state).

**Phase 42 O**: `npx tsc --noEmit` clean; `npx oxlint` unchanged at 8 warnings. `python manage.py
check` clean (no migration — no model changes, just two new views/serializers and a throttle rate).
Full live walkthrough: searched "Demo" on the generic `/login` page and got both matching schools
back; selected Demo Academy and confirmed the branded page at `/login/demo-academy` rendered
correctly; logged in successfully through it (redirected to `/dashboard`, same as the generic page,
confirming the auth contract is untouched); confirmed an unknown slug shows a clean error state
backed by a real `404` from the branding endpoint. Temp password reverted afterward.

**Phase 42 P**: `npx tsc --noEmit` clean; `npx oxlint` back to exactly the same 8 baseline warnings
(extracting `NAV_CONFIG` into its own module avoided a 9th `only-export-components` warning that
appeared during development when it was briefly exported alongside the `AppShell` component).
`python manage.py check` clean (frontend-only phase, no backend changes at all). Full live
walkthrough with two roles confirming genuine permission-based filtering (see above) rather than a
static list. Temp passwords reverted afterward.

**Phase 42 Q**: `npx tsc --noEmit` clean across the full frontend (checked repeatedly through the
rollout, after each domain batch). `npx oxlint` back to exactly the same 8 baseline warnings after
fixing the two stray half-wired files (see above) — confirmed via a full-project `no-unused-vars`
scan, not just a re-check of the two known files. `python manage.py check` clean; no new permission
codes, so no `seed_permissions`/`resync_role_permissions` needed. Verified via targeted `grep`
sweeps rather than a live browser walkthrough this phase (a mechanical, low-risk rollout across 60
already-working pages — each file's diff was small and structurally identical to the two live-
verified pilots from Phase I): every `*ListPage.tsx` confirmed to both import and actually call
`useSummaryStats(...)` and render `<ScrollReveal>`; every domain `views.py` confirmed to declare
`summary_stats` on each concrete `ModelViewSet`/`ReadOnlyViewSet` subclass (abstract per-app base
classes like `AcademicsModelViewSet` correctly excluded, verified by manual review of every
count-mismatch the sweep flagged).

**Phase 42 R+S**: backend-only, no frontend changes (so no `tsc`/`oxlint` run this phase).
`python manage.py check` clean after every edit. A direct Python import of every touched module
under real Django settings (`apps.library/transport/hostel/medical/discipline/inventory/
procurement/finance/attendance/parents/authorization/events/examinations`) confirmed no syntax or
circular-import errors — `apps.parents.services` (new) is imported by `hostel`, `medical`,
`discipline`, `finance`, and `attendance`, and none of those are imported back by `apps.parents`,
so no cycle. `manage.py migrate` needed nothing new (no model/field changes in either phase — Phase
R reuses `Notification.category`'s existing unconstrained `CharField`; Phase S only changes
transaction/locking behavior around already-existing fields). A scoped `pytest` run across every
app touched by Phase R plus `events`/`examinations` for Phase S (`pytest apps/library apps/
transport apps/hostel apps/medical apps/discipline apps/inventory apps/procurement apps/finance
apps/attendance apps/parents apps/authorization apps/notifications`) — **114 passed, 0 failed**, a
~51-minute run against this environment's Neon-hosted test database (see the note on this
environment's remote-DB latency under the Phase G/H entries above — a full local-Postgres run would
be materially faster). Only known-benign warnings, no failures: the same Django deprecation warning
and test-teardown "database is being accessed by other users" connection-timing quirk already
documented in the Phase G/H full-suite run, not a regression from this phase's changes.

**Phase 43**: `npx tsc --noEmit` clean; `npx oxlint` unchanged at the 8-warning baseline (confirmed
after the full 62-file icon sweep, the dashboard rebuild, the `navConfig.ts` permission fixes, and
the lesson-form changes — one missing `Spinner` import caught by `tsc`, fixed before the check
passed clean). `python manage.py check` clean. Live verification with two real accounts (temp
passwords reverted afterward): a teacher confirmed the dashboard now loads at all (previously
blocked entirely by the `reports.view` gate) with correctly-scoped headline stats and module cards,
and confirmed the `attendance.create`-gated "Take attendance"/"Records"/"Stats" children render
correctly (this role's seeded permissions grant the whole `attendance.` domain together) while
"Staff attendance" stays correctly hidden; a principal confirmed all six headline stats, 20+ module
summary cards with live pie charts, and the existing enrollment/attendance/finance report charts all
render, then confirmed the same page reflows cleanly to a single column at a 375px mobile viewport
with no clipping or overflow on any card. The lesson-form material upload was verified as a full
live round-trip (create lesson → auto-upload staged material → land on Detail page showing it),
using a synthetic `DataTransfer`-injected `File` to work around the Browser pane's inability to
drive a native OS file-picker dialog. Icon coverage verified via a grep sweep confirming every
`StatRow` item's `key:` has a matching `icon:` across all 62 files, not just spot-checked.

## Next milestone

No further phases are currently planned. See the plan file
(`C:\Users\Newton\.claude\plans\tingly-zooming-sedgewick.md`) for the original I–S scope, or the
Phase 43 section above, if a new batch of work is started from either later.
