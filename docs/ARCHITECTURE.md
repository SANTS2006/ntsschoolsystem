# Architecture

## Stack

- **Backend**: Django 5.2 + Django REST Framework, Python 3.13
- **Database**: PostgreSQL via Neon (dev and prod — SQLite is never used)
- **Frontend**: React 19 + TypeScript + Vite, Tailwind CSS v4
- **Data/state**: TanStack Query, React Hook Form + Zod
- **File storage**: Cloudinary
- **Email**: Brevo
- **No Docker**, anywhere.

## Multi-tenancy

The platform hosts many independent schools ("tenants") from one codebase and one database.
Isolation is enforced at multiple layers, never just the frontend:

1. **Tenant identity comes only from the authenticated user.** `request.user.school_id` is the
   single source of truth. A school id in a URL, query string, or request body is never trusted
   to select tenant data.
2. **Request-scoped context** (`apps/tenants/context.py`) holds the current school id and a
   platform-admin flag in a `contextvars.ContextVar`, set for the lifetime of one request only.
   - For DRF views: `apps/tenants/mixins.py::TenantContextMixin` sets it inside
     `perform_authentication()` — deliberately *not* `initial()`. DRF's `initial()` runs
     `perform_authentication()` → `check_permissions()` → `check_throttles()` as one call, so
     context set after `super().initial()` returns would not exist yet while permission classes
     run (permission classes routinely need it — e.g. "does this user have role X" queries a
     tenant-scoped model). Hooking `perform_authentication()` instead means the context is live
     the moment `request.user` resolves, before `check_permissions()` executes. (This was wrong
     in the very first version of this file — set in `initial()` post-super-call — and got fixed
     once RBAC permission classes made the bug observable.) Every tenant-facing view must inherit
     from `apps.common.views.TenantScoped*` base classes, which include this mixin.
   - For session-authenticated flows (e.g. Django admin): `apps/tenants/middleware.py::TenantMiddleware`
     does the equivalent at the Django middleware layer.
3. **Manager-level enforcement**: `apps/tenants/models.py::TenantScopedModel` is the abstract
   base every school-owned model extends. Its default `objects` manager
   (`apps/tenants/managers.py::TenantManager`) filters every query by the current request's
   school automatically, and returns an **empty queryset** (not an error, not all rows) if no
   tenant context is present. `unscoped_objects` is a separate, clearly-named manager for
   platform-admin services and management commands — its use should be rare and obvious in a
   code review.

   **Gotcha #1 — broader than it first looked**: `.none()`-on-no-context protects *read* paths in
   the sense of never leaking cross-tenant data, but it makes the scoped `objects` manager useless
   for **any** read inside a function that might run outside request context — not just
   `get_or_create()`/`update_or_create()` (which additionally then try to `create()` a duplicate,
   raising `IntegrityError`, since the "find" half of get-or-create silently finds nothing). A
   plain `.get()` raises `DoesNotExist`; `.filter().exists()` silently returns `False`; a
   reverse-accessor `.aggregate()`/`.all()` (e.g. `invoice.line_items.aggregate(...)`,
   `payment.refunds.aggregate(...)`) silently aggregates over nothing. First hit in
   `apps.authorization.services.assign_role()` (Phase 4, run twice via a management command); hit
   again more broadly in `apps.finance.services.record_payment()`/`record_refund()` and
   `Invoice.recalculate_amounts()` (Phase 9), all of which read through the scoped manager and are
   called both from views (context present) and directly (tests/services, no context). **The
   rule, stated fully**: any function that is or might ever be called from outside a request
   (services, model methods invoked by services, management commands) must use `unscoped_objects`
   at *every* read call site touching a `TenantScopedModel` — not just its writes — validating the
   school explicitly wherever that safety isn't already structurally guaranteed by the caller
   having resolved the object correctly (e.g. re-fetching a row by a UUID primary key the caller
   already identified is safe; a fresh lookup by some other field is not, without an explicit
   school filter).

   **Gotcha #2 — the most severe bug found in this codebase so far**: `queryset =
   Model.objects.all()` as a **class-level ViewSet attribute** is the standard DRF tutorial
   pattern, and it is broken for any `TenantScopedModel`. A class body statement executes once at
   *import time* — before any request, before any tenant context. `TenantManager.get_queryset()`
   sees no context at that moment and returns `.none()`; that permanently-empty queryset gets
   baked into the class attribute, and every later `.all()` on it (all `get_queryset()`'s default
   implementation does) just clones something that's already, unconditionally, empty — for
   *every* request thereafter, regardless of who's asking. `create()` is unaffected (it never
   touches `get_queryset()`), so this bug is invisible to "can I create a thing?" testing and even
   makes naive cross-tenant tests pass for the wrong reason (a cross-school 404 is
   indistinguishable from a same-school 404 when *everything* 404s). Every Phase 6 ViewSet had
   this bug; it was caught by *positive* tenant-isolation assertions ("can I see my own data?")
   and a live curl smoke test that happened to `GET` after `POST`. **The rule: `get_queryset()` is
   always a method on a `TenantScopedModel` ViewSet, never a `queryset =` class attribute.**
   `UserViewSet`/`RoleViewSet`/`AuditLogViewSet` already followed this (correctly, if
   unexplained); `apps.academics.views.AcademicsModelViewSet` now states the rule explicitly and
   provides a shared `get_queryset()` built from a `model` + `select_related_fields` class
   attribute (plain data, not a queryset, so no eager-evaluation problem). This does **not**
   apply to `School`/`Permission` (plain `models.Manager`, not tenant-scoped) — `SchoolViewSet`'s
   class-level `queryset` is genuinely fine.
4. **Defense in depth**: DRF view `get_queryset()` methods should still be written as
   `Model.objects.all()` (not raw model managers), so the tenant filter is applied whether or not
   a future change removes the mixin.
5. **`User` is deliberately not a `TenantScopedModel`** (platform admins need `school=None`, which
   `TenantScopedModel.school`'s non-nullable FK can't express), so its scoping is manual —
   `apps/users/views.py::UserViewSet.get_queryset()` filters by `request.user.school` itself. This
   is the one place in the codebase where tenant isolation isn't structurally guaranteed by a
   manager, so it's covered by dedicated tests
   (`apps/users/tests.py::TestUserTenantIsolation`) rather than relying on the general pattern.
   Any future model with the same shape (nullable/optional tenant) should follow the same
   discipline: manual `get_queryset()` filter + explicit cross-tenant tests, not an assumption
   that `TenantScopedModel` covers it. Retrieve/disable-by-id return **404, not 403** for a
   cross-school id — this avoids confirming to a caller that the id exists at all in another
   school (IDOR/enumeration hardening), and falls out naturally from `get_object()` being filtered
   through the scoped `get_queryset()`.

Tenant isolation tests (Phase 71 of the spec) will assert cross-tenant reads/writes/deletes all
fail, including attempts where the attacker supplies a different school id in the URL/body/headers.

## Authentication

- **JWT via httpOnly cookies**, not `localStorage`/`sessionStorage` and not the `Authorization`
  header. This keeps tokens unreachable from JS (mitigates XSS token theft).
- Access token: 15 min lifetime. Refresh token: 7 days, rotated and blacklisted on use
  (`rest_framework_simplejwt.token_blacklist`).
- Because the browser auto-attaches cookies, **CSRF protection is mandatory** for unsafe methods.
  DRF normally disables Django's CSRF middleware at the view level and only restores it inside
  `SessionAuthentication` — since we use a custom cookie authenticator
  (`apps/authentication/authentication.py::CookieJWTAuthentication`), it replicates that same
  enforcement itself (`enforce_csrf`, mirroring DRF's own `CSRFCheck` pattern). The SPA reads the
  non-httpOnly `csrftoken` cookie and echoes it in the `X-CSRFToken` header on every unsafe
  request (see `frontend/src/lib/api-client.ts`).
- Passwords hashed with Argon2 (`PASSWORD_HASHERS`, Argon2 first).
- Endpoints (all under `/api/v1/auth/`, `apps/authentication/views.py`): `login`, `logout`,
  `refresh`, `me`, `change-password`, `password-reset` (+ `confirm`), `email-verification`
  (+ `confirm`), `accept-invitation`.
- **Token generators** (`apps/authentication/tokens.py`) are Django's `PasswordResetTokenGenerator`
  pattern (signed, timestamp-expiring), each subclassed with a *different* hash input so a link
  only validates for the flow it was issued for and self-invalidates once used:
  - Password reset: stock generator (hash includes `user.password`, so it dies the moment the
    password changes — i.e. after one use).
  - Email verification: hash also includes whether `email_verified_at` is set, so it dies once
    verified.
  - Invitation: hash also includes `is_active`, so it dies once the invitee activates their
    account. Distinct generator instance from password-reset means an invitation link can never
    double as a password-reset link even though both eventually call `user.set_password()`.
- **No user enumeration**: `password-reset` returns the identical response
  ("If an account exists...") whether or not the email matches an account — verified by test
  (`TestPasswordReset::test_response_identical_whether_or_not_account_exists`) and confirmed live
  (only a real match triggers an actual send attempt, checked via server logs).
- Password reset/change both blacklist every outstanding refresh token for that user
  (`rest_framework_simplejwt.token_blacklist`), forcing re-login on all devices.
- **Invitation flow**: `apps/users/services.py::invite_user()` creates an inactive account with
  an unusable password (`set_unusable_password()`) and emails an invitation link — the invitee
  chooses their own password via `accept_invitation`. We never generate or transmit a password on
  a user's behalf.

## RBAC

`apps/authorization` — new app, separate from `apps.users` (user *identity* vs. user
*authorization* are different concerns).

- **`Permission`**: global, fixed catalog (`code` like `"students.view"`, not tenant-scoped).
  Seeded from `apps/authorization/catalog.py::PERMISSION_CATALOG` via
  `python manage.py seed_permissions` (idempotent — re-run whenever the catalog grows, e.g. when
  a new domain app adds `library.view` etc.).
- **`Role`**: tenant-scoped (`TenantScopedModel`) — each school owns its own copy of every role,
  so one school renaming/reconfiguring/disabling a role never touches another school's. Unique
  on `(school, slug)`. `is_system` roles are seeded automatically for a new school via
  `services.seed_default_roles_for_school()`, which grants each default role every permission
  whose code matches a prefix in `catalog.DEFAULT_ROLE_PERMISSION_PREFIXES` (e.g. `teacher` gets
  `students.view`, `attendance.*`, `results.view`, `results.create`).
  `DEFAULT_ROLE_PERMISSION_PREFIXES` entries are `{"include": [...], "exclude": [...]}` dicts (a
  plain `list[str]` still works, normalized via `_normalize_spec`) — the `exclude` list is what
  lets a role like Principal be expressed as "grant everything (`[""]`), then take back a few
  things" instead of enumerating every included prefix by hand. `seed_default_roles_for_school`
  does a full **add-and-remove** sync for `is_system=True` roles on every call (`desired_ids -
  existing_ids` added, `existing_ids - desired_ids` removed) — narrowing a role in the catalog and
  re-running `resync_role_permissions` actually revokes the now-excluded codes from every school's
  existing copy of that role, not just future schools. Custom (non-system) roles are never touched.
- **`RolePermission`** / **`UserRole`**: through models, both `TenantScopedModel` themselves (not
  just implied by their FKs) with a `save()` override that raises `ValueError` if their own
  `school` doesn't match the related `role.school`/`user.school` — defense in depth beyond the DB
  FK relationships alone.
- Platform-level (`User.user_type = platform_admin`, no school) vs. school-level
  (`user_type = school_user`, always has a school) is enforced by a DB `CheckConstraint` on
  `users`, not just application logic.
- **Permission checks** (`services.get_user_permission_codes()` / `user_has_permission()`):
  platform admins and Django superusers get a `"*"` sentinel (all permissions) without a DB
  query. Everyone else: `Permission.objects.filter(role_permissions__role__user_roles__user=user,
  role_permissions__role__is_active=True)`. This deliberately starts from `Permission.objects` (a
  plain, non-tenant-scoped manager) and reaches `Role`/`UserRole` only via reverse-relation
  traversal — Django compiles that as a SQL join and never invokes `Role`'s or `UserRole`'s own
  `TenantManager`, so the result is correct regardless of whether tenant context happens to be
  set yet. This is what makes it safe to call from `check_permissions()`-time DRF permission
  classes (`apps/authorization/permissions.py::require_permission(code)`,
  `IsPlatformAdmin`, `IsSchoolMember`) as well as from services with no request at all.
- Frontend permission checks (once built) only ever control UI visibility — every check above is
  re-enforced server-side on every request; the frontend is never trusted.

## Platform administration & school lifecycle

- **`apps.tenants.services.create_school()`** is the only way a school comes into existence: it
  creates the `School` row (`status=pending`), seeds its default roles
  (`seed_default_roles_for_school`), and invites the first school administrator
  (`invite_user()` + `assign_role()`) — all in one `transaction.atomic()` block. There's no path
  to a school existing without its default roles or without an invited admin.
- **Lifecycle**: `pending` → `active` (via `SchoolViewSet.activate`, platform-admin-only) →
  `suspended` (via `.suspend`, with a reason) → back to `active` via `.activate` again. There's no
  separate "reactivate" action — `activate` works from either `pending` or `suspended`.
- **Login is gated on school status**: `apps/authentication/views.py::LoginView` checks
  `user.school.is_active` (i.e. `status == ACTIVE`) *after* verifying credentials but *before*
  issuing tokens, returning `403 SCHOOL_NOT_ACTIVE`. This means an invited school administrator
  literally cannot log in until a platform admin activates their school — the invitation email
  goes out immediately, but the account is inert until then. Platform admins (no `school_id`)
  never hit this check.
- **Two distinct "self-service" surfaces, deliberately kept apart**: `SchoolViewSet`
  (`/api/v1/schools/`, `IsPlatformAdmin`) is full CRUD + lifecycle actions for any school.
  `SchoolSelfView` (`/api/v1/schools/me/`, any school member for GET, `settings.update` permission
  for PATCH) only ever touches `request.user.school` — there is no way to pass a different
  school's id to this view, since it never reads one from the request at all. Its serializer
  (`SchoolSelfSerializer`) also hard-excludes `slug`/`status`/`school_type`/`ownership_type` from
  being writable, so even a compromised/malicious payload can't self-escalate a school's status.
- **`apps.platform_admin`** (app name, not URL path — `platform` collides with a Python stdlib
  module) manages platform-administrator *accounts* specifically — separate from `SchoolViewSet`,
  which manages schools. Both are `IsPlatformAdmin`-gated. Invites a platform admin the same way
  a school user is invited (`invite_user()`, just with `user_type=platform_admin, school=None`).

## Core domain models

- **`apps.academics`**: `AcademicYear` → `Term` (FK), `Department` → `Subject` (FK, nullable),
  `SchoolClass` → `Section` (FK, per academic year). `Section.class_teacher` is a nullable FK to
  `staff.Staff` — a genuine cross-app dependency (`academics` needs `staff`, and conceptually
  `staff` doesn't need `academics`), resolved by Django's migration autodetector automatically
  since the FK is declared as a string (`"staff.Staff"`) rather than a direct Python import,
  producing two migration files for `academics` (`0001` creates everything except the FK, `0002`
  adds it once `staff` exists) rather than one.
- **`apps.staff`**: `Staff` is one-to-one with `User` — a staff profile is *additional* data about
  an already-invited-and-authenticated user, not a separate account. `StaffViewSet.create()`
  therefore takes a `user_id` (validated same-school, validated no existing profile), never
  creates the `User` itself.
- **`apps.students`**: `Student.user` is nullable — most students never get portal access.
  `DELETE` archives (`status=archived`) instead of removing the row, via `perform_destroy()`
  override — matches the spec's explicit "do not casually delete students."
- **`apps.parents`**: `Guardian.user` is nullable for the same reason. The `Student↔Guardian`
  many-to-many goes through `StudentGuardian` (relationship type, primary/emergency flags), but
  the *management* endpoints for that relationship live on `StudentViewSet.guardians` (a detail
  action handling GET/POST/DELETE), not on `GuardianViewSet` — a guardian record is meaningful
  independently of any particular link, so the relationship is scoped to where it's most often
  edited from (a student's record) rather than duplicated on both sides.
- **Dual-layer FK validation**: every cross-model FK on these new models (e.g.
  `Term.academic_year`, `Section.school_class`, `Staff.user`, `Student.current_class`,
  `StudentGuardian.student`/`.guardian`) is checked twice — once in the model's `save()` (raises
  `ValueError`, a safety net for shell/management-command/future-service code that bypasses
  serializers) and once in the serializer's `validate_<field>()` (raises DRF's
  `ValidationError` → clean `400`, what the API actually returns). The model-level check alone
  would surface as an unhandled `500` through the API since `ValueError` isn't a DRF-recognized
  exception type — the serializer layer is what makes a cross-school reference a normal
  validation error instead of a crash.
- **Permission model**: `staff.*`, `students.*` (pre-existing), `parents.*`, `academics.*` — one
  prefix per app, `view`/`create`/`update`/`delete` each. `academics.*` deliberately covers all six
  academics resources (year/term/department/subject/class/section) as one permission group rather
  than six separate ones — they're structural/configuration data typically managed together by
  the same small set of roles, and splitting them further would add granularity nobody asked for
  yet without a concrete need driving it.

## Timetable & Attendance

- **`apps.timetable`**: `TimetableEntry` is a **weekly recurring template**
  (`section` + `day_of_week` + `period` → `subject`/`teacher`/`room`) — it has no calendar date.
  Attendance (below) is the date-specific layer; the two are deliberately separate concerns.
  Class/teacher/room double-booking is prevented by `UniqueConstraint`s at the DB level —
  `unique_section_day_period` (unconditional) and `unique_teacher_day_period`/
  `unique_room_day_period` (partial, `condition=Q(teacher__isnull=False)` etc., since a lesson can
  legitimately have no assigned teacher or room). `TimetableEntrySerializer.validate()` re-checks
  the same conflicts at request time so a double-booking attempt gets a specific `400` (e.g.
  `{"teacher": "This teacher is already scheduled elsewhere in this period."}`) instead of a raw
  `IntegrityError`.
- **`apps.attendance`**: `StudentAttendance.period` is the daily/subject-level switch —
  `None` means daily/homeroom attendance, a set value means attendance for that specific lesson.
  Both are duplicate-prevented via partial `UniqueConstraint`s
  (`unique_daily_attendance_per_student` / `unique_subject_attendance_per_student_period`).
  `StaffAttendance` is a **separate model with a separate permission prefix**
  (`staff_attendance.*`, not `attendance.*`) — a teacher can mark student attendance without being
  able to mark a colleague's, which reusing one permission code would not allow distinguishing.
  `bulk-mark` (`StudentAttendanceViewSet`) marks a whole section in one call using
  `update_or_create` per student inside one `transaction.atomic()` — deliberately idempotent
  (re-submitting to correct a mistake overwrites rather than conflicts); the DB constraints, not
  the idempotent upsert, are what actually guarantee no two conflicting rows can ever coexist.

### Two DRF auto-behavior gotchas found building this (read before writing another serializer)

1. **DRF auto-generates a `UniqueTogetherValidator` per `UniqueConstraint` in `Meta.constraints`,
   including partial (conditional) ones, and forces every field in it to `required=True` —
   regardless of the model's own `null=True, blank=True`.** For `unique_teacher_day_period`/
   `unique_room_day_period` (nullable `teacher`/`room`) and
   `unique_subject_attendance_per_student_period` (nullable `period`), this broke the ordinary
   case (a lesson with no assigned teacher/room; plain daily attendance with no period) with a
   `400 "This field is required"` — over curl, not caught by the unit tests as first written,
   because those tests happened to always supply every field. **Fix**: `Meta.validators = []` on
   `TimetableEntrySerializer`/`StudentAttendanceSerializer`/`StaffAttendanceSerializer`, each of
   which already has an explicit `validate()` performing the same check correctly (nullable-aware,
   and tenant-scoped since it queries at request time). Any future serializer for a model with a
   partial `UniqueConstraint` on a nullable field needs the same treatment.
2. **`source="<relation>.__str__"` leaks a raw method-wrapper repr when the relation is null.**
   DRF's attribute-traversal helper auto-*calls* an attribute only if it passes a "simple
   callable" check (`inspect.signature` succeeds) — true for a real model instance's Python-level
   `__str__`, false for `None.__str__` (a C-level method-wrapper, uninspectable). So on a null
   relation, traversal "succeeds" (every object has `__str__`) but returns the uncalled
   method-wrapper object itself, which `CharField` then stringifies into
   `"<method-wrapper '__str__' of NoneType object at 0x...>"` — verbatim, in the API response.
   `default=None` doesn't rescue this: no exception is raised, so the missing-field fallback path
   never triggers. **Fix**: use a `SerializerMethodField` instead
   (`get_section_name(self, obj): return str(obj.section) if obj.section_id else None`) — never
   `source="model_field.__str__"`, on any serializer, ever.

Both were caught by live `curl` testing against the running dev server, not by the pytest suite as
originally written — a reminder that "the tests pass" and "the feature works" are different
claims when tests are authored to always supply the fields a bug happens to require.

## Examinations & Results

- **`apps.examinations`** splits configuration from marks: `GradingScale`/`GradeBoundary`/`Exam`/
  `ExamSchedule` are administrative setup (`examinations.*` permission); `Result` is the
  per-student mark and its lifecycle (`results.*`). An `Exam` belongs to a `Term`; an
  `ExamSchedule` is one `Subject`'s sitting of that exam for one `SchoolClass`, with its own
  `max_score`; a `Result` is one `Student`'s mark for one `ExamSchedule`.
- **`Result.grade` is always server-computed, never client-writable.** `Result.save()`
  unconditionally calls `compute_grade()`, which looks up the matching `GradeBoundary` on the
  exam's `GradingScale` by score range. There is no path — API, bulk-enter, correction, or direct
  shell access — where a stored `grade` can disagree with its `score`, because the computation
  happens inside `save()` itself rather than in a view or serializer that could be bypassed.
- **Result lifecycle**: `draft → submitted → reviewed → approved → published → locked`, each
  transition its own `@action` (`submit`/`review`/`approve`/`publish`/`lock`) on `ResultViewSet`,
  each requiring a *different* permission (`results.update` for submit/review, `results.approve`,
  `results.publish`, `results.lock`) and each rejecting a call from any status other than its
  specific predecessor with `400 INVALID_TRANSITION` — there's no path that skips a step.
  `ResultSerializer.validate()` separately blocks a plain `PATCH` once the status is `approved` or
  later, so score/comment edits are only possible pre-approval or through `correct` post-lock —
  never through the generic update endpoint once the result means something.
- **Correction, not reversion**: `POST /results/{id}/correct/` is the only way to change a
  `locked` result. It requires a `reason`, applies the change, and **stays locked** — it does not
  revert to `draft` and re-run the pipeline. This is a deliberate choice: a correction is an
  authorized override of one specific value (e.g. a recount), not grounds to make the result
  briefly disappear from report cards (which only show `published`/`locked` results) while it
  works back through five approval stages again. Every correction is audited at
  `severity=warning` with a full before/after snapshot and the reason — this is the system's
  primary example of the spec's "must not be modified without an authorized correction workflow"
  requirement.
- **`bulk-enter` only ever touches `draft` results** (or creates new ones) — if a student's result
  for that exam schedule already exists and has progressed past `draft`, bulk-enter leaves it
  alone and reports it in a `skipped` list rather than erroring the whole batch or silently
  overwriting a reviewed/approved/published/locked mark.
- **Not every `UniqueConstraint` needs `Meta.validators = []`** (the Phase 7 workaround) — that
  bug is specifically about *nullable* fields being forced `required=True`. Every constraint in
  this app (`grading_scale+grade`, `term+name`, `exam+class+subject`, `exam_schedule+student`)
  involves only required fields, so DRF's auto-generated validator works correctly here and none
  of this phase's serializers needed the override. Check which case applies before copying the
  workaround reflexively.
- **CA + exam weighted grading (Phase 44D)**: `Result.score` (the final, published value) is now
  computed from two components rather than entered directly. `Subject.ca_weight_percent` +
  `exam_weight_percent` must sum to 100 (validated in `save()`). `Assignment.weight` (relative,
  teacher-set per assignment) and `Assignment.term` (nullable FK, `due_date`-range fallback for
  legacy rows) scope the CA computation. `apps/examinations/services.py::compute_ca_score()`
  computes a weighted average over only a student's *graded* submissions for that
  subject/class/term (normalizing by the sum of weights of what's actually graded, not every
  assignment that exists) and returns `None` — never `0` — if nothing is graded yet;
  `combine_score()` folds that into `Result.exam_score` (the raw input) to produce
  `(ca_score, score)`. `ca_score`/`score` stay `null` until CA data exists, so an incomplete grade
  can never be silently published. Every write path (`ResultViewSet.bulk_enter` →
  `services.enter_exam_score()`, a plain `PATCH` via `perform_update()`, and the `correct` action's
  `exam_score` branch) funnels through the same `combine_score()`, so the three paths can't
  desync. `exam_score` stays writable on `ResultSerializer` (unlike `ca_score`/`score`, which are
  service-computed) because a single-result edit is a real UI path alongside bulk-enter.

## Finance

- **`apps.finance`**: `FeeCategory`/`FeeStructure`/`FeeStructureItem` are configuration
  (`fees.*`); `Invoice`/`InvoiceLineItem`/`Payment`/`Refund` are the money-moving side. An
  `Invoice` belongs to one `Student`; `InvoiceLineItem.amount` is signed — positive is a charge,
  negative is a discount/scholarship/waiver (`line_type` further categorizes for reporting, but
  the math is always just "sum the signed amounts").
- **Invoice totals are stored columns, recalculated on write — not computed live on read.** This
  is the opposite instinct from `Result.grade` (Phase 8, computed fresh in `save()` every time):
  the difference is that `outstanding`/`stats` need to `Sum()` `total`/`balance` **across many
  invoices at once**, which requires them to be real, indexed columns DB-side rather than Python
  properties recomputed per-row. `Invoice.recalculate_amounts()` is the single place that
  derives `subtotal`/`discount_total`/`total`/`balance`/`status` from line items + `amount_paid`,
  called after any line-item change.
- **`amount_paid` is the one field payment/refund mutate directly, and it's the system's first
  real concurrency-critical write.** `apps/finance/services.py::record_payment()` opens with
  `Invoice.unscoped_objects.select_for_update().get(pk=...)` — this locks the invoice row for the
  transaction's duration, so a second concurrent payment request against the *same* invoice
  blocks until the first commits, then sees the updated balance, rather than both reading the
  same stale value and one overwriting the other's update (the classic lost-update race).
  `record_refund()` does the same for both the payment and its invoice. **This is the template
  for any future code with the same shape** — lock the row(s) protecting an invariant, re-check
  the invariant *after* the lock is held (not before — checking before acquiring the lock doesn't
  protect against a concurrent writer that acquires it first), mutate, save, all inside one
  `transaction.atomic()`. Note `unscoped_objects`, not `objects` — the tenant-scoped manager
  returns nothing outside request context, and this function is called both from views and
  directly (tests, and potentially future non-request callers); see the broadened Gotcha #1 under
  Multi-tenancy above, which this phase is what forced restating it fully.
- **Duplicate-payment prevention**: `record_payment()` rejects an amount/method/reference
  identical to one recorded against the same invoice in the last 10 seconds
  (`DuplicatePaymentError` → HTTP `409`). This is a pragmatic double-submit guard (the classic
  "user clicks Pay twice"), not a full idempotency-key system — documented as a known,
  deliberate scope boundary in `docs/IMPLEMENTATION_STATUS.md`.
- **Service-layer exceptions (`FinanceError`, `DuplicatePaymentError`) are plain Python
  exceptions, not DRF exceptions, by design** — the service layer has no reason to import DRF.
  Every view calling into `apps.finance.services` therefore wraps the call in `try/except` and
  returns an explicit `Response` (`PaymentViewSet.create`/`.refund` do this). A call site that
  lets one of these propagate unconverted produces an unhandled `500` — this happened once in
  `InvoiceLineItemViewSet.perform_destroy()` (fixed to raise DRF's own `ValidationError` instead;
  see Phase 9 notes in IMPLEMENTATION_STATUS.md) and is worth checking for in any new call site.
- **Line items lock once any payment exists on their invoice** — enforced in
  `InvoiceLineItemSerializer.validate()` (object-level), deliberately not `validate_invoice()`
  (field-level): a field-level validator only runs when that field is present in the request
  body, so a plain `PATCH {"amount": ...}` that never mentions `invoice` would have bypassed a
  field-level check entirely. Object-level `validate()` always runs, checked against
  `self.instance.invoice` when the field itself isn't in the payload. General rule: any
  object-level business rule that must hold regardless of which fields a request touches belongs
  in `validate()`, never in that field's own `validate_<field>()`.

## Salary (Phase 44E)

- **`apps.salary`** mirrors `apps.finance` file-for-file (models/services/serializers/views/urls
  shape). `SalaryStructure`/`SalaryStructureItem` (`line_type`: basic/allowance/deduction) are the
  reusable payroll template, playing the same role `FeeStructure`/`FeeStructureItem` play for fees.
  `StaffSalaryAssignment` (`staff` OneToOne → `SalaryStructure` FK) is payroll's one real departure
  from the Finance shape: fees applies a `FeeStructure` fresh per invoice-generation run with no
  persistent link, but payroll needs a standing assignment `generate_salary_payments_for_month()`
  reads every period.
- **`SalaryPayment` snapshots `gross_amount`/`deductions_total`/`net_amount` at generation time**
  from the assigned structure's items at that moment, exactly like `Invoice`'s stored-totals
  approach — editing a structure afterward never retroactively changes an already-generated
  payment. A `UniqueConstraint` on `(staff, period_year, period_month)` is what makes
  `generate_salary_payments_for_month()` idempotent — re-running for a month that already has
  payments just skips those staff members and reports them in a `skipped` list, the same pattern
  `generate_invoices_from_structure()` uses.
- **`record_salary_payment()` reuses Finance's `select_for_update()`-then-recheck-invariant
  template** (see the School Operations note below on why this is now a checklist, not a bespoke
  solution) and Finance's own `_next_sequence_number()` helper (imported directly from
  `apps.finance.services` rather than duplicated) for `SAL-000001`-style payment numbers.
  Transitions a payment `pending → paid` and notifies the staff member in-app + email via
  `apps.notifications.services.notify()`.
- **`salary.*` is a full permission module** (`view`/`create`/`update`/`delete`), seeded via
  `catalog.PERMISSION_CATALOG` — granted in full to Accountant and School Administrator, absent
  everywhere else per the Phase 44C RBAC redesign.

## Audience targeting & student self-service (Phases 44F–I)

- **Receipts (44F) are pure frontend, no new backend surface at all** — `PaymentReceiptPage.tsx`,
  `SalaryPaymentReceiptPage.tsx`, `PurchaseOrderReceiptPage.tsx` each read an existing detail
  endpoint and render a printable page (`window.print()`), the identical shape the Transcript page
  established back in Phase 42J. `PurchaseOrderReceiptPage` deliberately shows cumulative
  received-to-date quantities, not a per-batch delta — `PurchaseOrderItem.quantity_received` is a
  running counter with no receiving-event log, so that's the only truthful thing a receipt can show.
- **Explicit-recipient targeting now has three parallel implementations of the same shape**:
  `Event`/`EventRecipient` (Phase 39-ish precedent), `Lesson`/`LessonEnrollment` (44G),
  `LiveSession`/`LiveSessionRecipient` (44H). All three: a `target_type` field defaulting to a
  broadcast mode (`school`/`class_section`) with a `specific_users`/`specific_students` alternative;
  a satellite `TenantScopedModel` (`event`/`lesson`/`session` FK + recipient FK, unique-together,
  same-school `save()` guards) populated only in the alternative mode; a dedicated ViewSet for
  managing that satellite list, gated by the *parent* resource's `update` permission rather than a
  separate view/create split (enrolling someone is itself an audience-update action). `Lesson`'s
  and `LiveSession`'s student-facing `My*View`s (`MyLessonsView`, `MyLiveSessionsView`) both filter
  on a **union** of two independent `Q()` clauses — the original class/section match (unchanged,
  so every lesson/session created before this field existed keeps behaving identically) OR an
  explicit `enrollments__student=`/`recipients__student=` match — with `.distinct()` guarding
  against a row satisfying both halves.
- **`LiveSession.target_type` is chosen independently of any linked `lesson`**, not inherited —
  a teacher picks the audience fresh per session even when `lesson` is set, since who should join a
  live call and who a lesson's static materials are visible to are genuinely separate decisions.
- **Live-session notifications intentionally use the singular `notify()` in a loop, not
  `notify_bulk()`** — confirmed `notify_bulk()` carries zero email parameters (by design: a broad
  blast is meant to be a deliberate per-caller decision, see the Finance section's note on
  `apps.communications.services`), and a specific-students invite or a "live now" alert is exactly
  the kind of thing worth an email too. `apps/live_sessions/services.py::_resolve_recipient_users()`
  is the one place that branches on `target_type` (class/section broadcast vs. the explicit
  recipient list); `notify_new_recipient()` (fired once per `LiveSessionRecipient` at creation) and
  `notify_session_started()`/`send_reminder()` (fired at `start` and on-demand respectively) all
  funnel through it, so all three call sites agree on who "the audience" is. No scheduled-task
  infrastructure exists anywhere in this codebase (no Celery, no cron beyond manually-run
  management commands) — `send_reminder()` is deliberately manual, triggered by a "Send reminder
  now" button, not a real "T-minus-15-minutes" scheduler; that remains a genuine follow-up
  requiring new infrastructure, not attempted here.
- **A live-tested RBAC gap, not just a design gap**: Phase 44C's role redesign (see the RBAC
  section above) omitted `academics.view` from Teacher, Accountant, and Exams Director — reasonable
  on paper (none of those roles manage the academic *structure*), but wrong in practice, since
  Lesson/FeeStructure/Invoice/Exam/ExamSchedule creation forms all populate their Subject/Class/
  Term/Academic-Year dropdowns from `academics.*`-gated endpoints. Caught via an actual 403 in a
  live browser test while verifying 44G (not a code-review guess), confirmed to affect all three
  roles via a targeted grep-driven audit of their forms' hook calls, and fixed by adding
  `academics.view` to all three catalog specs. The lesson: RBAC "sounds right" per-domain often
  isn't verified against real form dependencies until something 403s in the browser — this is now
  the second time in this codebase's history that a permission catalog redesign needed a live
  click-through, not just a sidebar-visibility check, to catch a real gap (the first was Phase 43's
  four sidebar-vs-action-permission mismatches).
- **Three new student self-service views** (`MyDisciplineView`, `MyMedicalView`, `MyTransportView`)
  are the exact `MyLessonsView`/`MyAssignmentsView` shape: a plain `TenantScopedAPIView`, no
  permission check at all (the `student=student_profile` filter *is* the security boundary), a
  graceful empty response when `student_profile` is `None`. `MyMedicalView` and `MyTransportView`
  each return an optional nested object (`profile`/`assignment`) rather than a list, since a
  student has at most one medical profile / transport assignment — `null` there means "not
  recorded yet," not an error. Two views that already existed server-side (`MyTimetableView`,
  `MyDocumentsView`) had no frontend page at all until this phase — the backend/frontend gap had
  simply never been closed.

## School Operations (Library, Transport, Hostel, Medical, Discipline)

- **The `select_for_update()`-then-recheck-invariant template from Finance (Phase 9) is now used
  three times independently**: `apps.finance.services.record_payment`/`record_refund`,
  `apps.library.services.checkout_book`/`return_book`/`renew_loan`, `apps.hostel.services.
  allocate_bed`/`check_out`. Each: locks the row(s) whose invariant is protected via
  `unscoped_objects.select_for_update()`, re-checks the invariant *after* the lock (not before —
  checking first doesn't protect against a concurrent writer who acquires the lock first), mutates
  and saves inside the same `transaction.atomic()`, and uses `unscoped_objects` for every read in
  the function (not just the lock acquisition) since it must work whether or not a request is on
  the call stack. This is now a checklist for any future "prevent two things from both succeeding"
  service, not a bespoke solution re-derived per domain.
- **Hostel bed allocation is enforced twice, deliberately** — once by
  `HostelAllocation`'s partial `UniqueConstraint`s (`(bed)` and `(student)`, each
  `condition=Q(status="active")`), which is the actual, DB-level, race-proof guarantee; once by
  `services.allocate_bed()`'s explicit pre-write check after acquiring the lock, which exists
  purely to turn a constraint violation into a clean `400` with a specific message instead of a
  raw `IntegrityError`. Same dual-layer shape as every other "prevent duplicate X" mechanism in
  the codebase (timetable double-booking, attendance duplicates, payment duplicates).
- **A nullable dual-FK with an "exactly one must be set" `CheckConstraint`** represents "the
  borrower/requester is either a Student or a Staff member" on `BookLoan`/`BookReservation`:
  `Q(student__isnull=False, staff__isnull=True) | Q(student__isnull=True, staff__isnull=False)`,
  mirrored by a serializer `validate()` doing `bool(student) == bool(staff)` → reject (one check
  catches both "neither set" and "both set"). Same shape as `TimetableEntry`'s teacher/room from
  Phase 7, but that one permits *zero* set too (a lesson can have no assigned teacher/room) —
  here exactly one is *required*, so the constraint is strict rather than merely mutually
  exclusive.
- **`medical.*` and `discipline.*` are deliberately absent from every seeded role's
  `DEFAULT_ROLE_PERMISSION_PREFIXES` entry except principal/school-administrator** — not an
  oversight; the spec explicitly calls for stricter access to medical records and restricted
  access to disciplinary records, and there's no seeded nurse/discipline-officer role to grant
  either to by default. A school can still assign either permission group to a custom role through
  the existing RBAC system (Phase 4) — the seeding is what's conservative, not the permission
  model itself.
- **Hostel's model layer collapses the spec's four levels (Hostel/Building/Room/Bed) into
  three** — `Hostel` stands in for both hostel and building. Similarly, `Book.author`/`.publisher`
  are plain `CharField`s rather than separate relational models. Both are deliberate scope
  decisions (logged in `docs/IMPLEMENTATION_STATUS.md`'s Known Gaps), not oversights — the extra
  relational layer would add real complexity (a `Building` model, an `Author` model with bios and
  cross-book queries) with no current requirement driving it.

## Assignments, Communications, Notifications, Documents, Inventory, Procurement & Reports

- **`apps.notifications`** is the single "a business event happened, tell someone" entry point,
  per the spec's explicit requirement that notification logic not be duplicated per domain app.
  `apps/notifications/services.py::notify()` creates one in-app `Notification` and, only if
  `email_subject`/`email_html` are both given, also sends an email — one call handles both
  channels. `notify_bulk()` is the many-recipients variant (announcements, new-assignment
  broadcasts): one `Notification.objects.bulk_create()`, deliberately no email in that path — a
  mass email is a separate, explicit per-caller decision, not a side effect of bulk in-app
  notifications. `NotificationViewSet` is read-only + `mark-read`/`mark-all-read` actions, scoped
  to `recipient=request.user` with no extra permission check — "my own inbox" needs no additional
  authorization, the queryset filter *is* the security boundary (same shape as `MyTimetableView`).
- **`apps.communications`**: `Announcement` targets one of `school/class/section/department/
  staff/students/parents/specific_users`. `apps/communications/services.py::resolve_recipients()`
  is the one place all eight branches live, and — per the spec's explicit warning that "all
  targeting must remain tenant-scoped no matter how it's sliced" — every branch filters by
  `announcement.school` explicitly and uses `unscoped_objects` throughout (not `objects`), because
  this function must work whether it's called from a request-scoped view or a bare test/management
  command (the Phase 9/10 "outside request context" rule). `publish_announcement()` calls
  `resolve_recipients()` then `notify_bulk()`, and additionally emails each recipient individually
  only if `announcement.send_email` opted in.
- **`apps.assignments`**: `Assignment` (class/section/subject/teacher/due_date/max_score/
  attachment) and `AssignmentSubmission` (one per student per assignment — `unique_together`,
  resubmission is an `update_or_create` that overwrites the same row rather than creating a new
  one). Both attachment fields are plain `models.FileField`s, not a Cloudinary-specific field type
  — they transparently route through whatever `STORAGES["default"]["BACKEND"]` base.py picked
  (`cloudinary_storage.storage.RawMediaCloudinaryStorage` once real credentials exist, local disk
  otherwise — **not** `MediaCloudinaryStorage`, which forces `resource_type=image` and rejects
  every non-image upload; see Phase 11's bug notes in IMPLEMENTATION_STATUS.md), so the model layer
  itself has zero Cloudinary awareness. `apps/common/validators.py::validate_upload_file`
  (extension allowlist + 10MB cap) is attached to every upload field in the codebase, shared rather
  than reimplemented per app. Students have no `assignments.*` permission at all (no seeded role is
  "student" — students are self-service-only, same as timetable/attendance-view elsewhere), so two
  dedicated `TenantScopedAPIView`s exist alongside the permission-gated `AssignmentViewSet`/
  `AssignmentSubmissionViewSet`: `MyAssignmentsView` (own class/section only, via
  `student_profile`) and `SubmitAssignmentView` (submit/resubmit own attachment, rejects a student
  who isn't actually enrolled in the assignment's class/section). Grading
  (`services.grade_submission()`) is capped at `assignment.max_score` and notifies the student via
  `notify()` if they have a portal account.
- **Setting `DEFAULT_FILE_STORAGE`/`STATICFILES_STORAGE` alone does nothing on this Django
  version.** Django 5.1 removed the compatibility shim that used to translate those legacy settings
  into `STORAGES`; `django.core.files.storage.default_storage` reads `STORAGES["default"]
  ["BACKEND"]` exclusively. `config/settings/base.py` and `prod.py` mutate `STORAGES` directly for
  exactly this reason — if you're wiring a new storage backend, check `settings.STORAGES` at
  runtime, not just the value of the setting you think controls it.
- **Tests force local disk storage, never live Cloudinary.** `conftest.py::_local_file_storage`
  (autouse) overrides `settings.STORAGES["default"]` to `FileSystemStorage` and `MEDIA_ROOT` to a
  pytest `tmp_path` for the whole suite — otherwise every `FileField` save in a test would attempt
  a real network call to the configured Cloudinary account the moment credentials exist in `.env`.
  This fixture originally set the dead `DEFAULT_FILE_STORAGE` setting (same mistake as the point
  above) and briefly let a test run upload real files to the live account before being caught and
  fixed the same day — see Phase 11's bug notes in IMPLEMENTATION_STATUS.md.
- **`apps.documents`**: one model, `Document`, covers school-wide policies, a specific student's
  personal documents, and a specific staff member's documents via an `owner_type` discriminator
  (`school`/`student`/`staff`) rather than three separate models — the fields (title, file,
  category, uploaded_by, expiry) don't diverge between the three cases, only *whose* record they
  attach to does. A `CheckConstraint` enforces the three-way invariant at the DB level (extending
  the two-way "exactly one of A or B" dual-nullable-FK pattern from `BookLoan`/`TimetableEntry` to a
  third `Q()` branch): `owner_type=school` requires both `student`/`staff` null, `owner_type=student`
  requires `student` set and `staff` null, and the mirror for `staff`. `documents.*` stays
  principal/school-administrator-only by default, joining `medical.*`/`discipline.*` as domains
  deliberately excluded from every other seeded role's prefix list (documents can hold confidential
  records — contracts, personal certificates). `MyDocumentsView` (self-service, no permission check
  beyond authentication, same shape as `MyTimetableView`/`MyAssignmentsView`) returns the caller's
  own personal documents unioned with every non-confidential school-wide document; `is_confidential`
  only affects that school-wide case — a personal document is always private to its owner
  regardless of the flag.
- **`apps.inventory`**: `InventoryItem` keeps a denormalized `quantity_in_stock` running total,
  mutated *only* through `apps/inventory/services.py::record_stock_in()`/`record_stock_out()` —
  the field is `read_only` in the serializer, so every change (including a brand-new item's opening
  balance) goes through one of those two functions and is therefore always paired with an
  `InventoryTransaction` ledger row (`recorded_by`, `reason`, timestamp). `record_stock_out()` is
  the fourth independent application of the Phase 9 `select_for_update()`-then-recheck-invariant
  template (after finance, library, hostel): locks the item row, re-checks
  `quantity_in_stock >= requested_quantity` after acquiring the lock, raises a clean `InventoryError`
  (converted to `400` at the view boundary) if insufficient, otherwise decrements and creates the
  ledger row in the same `transaction.atomic()` block. `quantity_in_stock`'s `PositiveIntegerField`
  backs this with an actual DB-level constraint too — same "enforced twice, deliberately" shape as
  hostel's bed allocation (Phase 10). `inventory.*` stays principal/school-administrator-only by
  default, same as library/transport/hostel (Phase 10) — there's no seeded store-keeper role among
  the 6 seeded roles, not because inventory data is confidential (contrast with
  documents/medical/discipline, which are restricted for exactly that reason).
- **`apps.procurement`**: `Supplier`; `PurchaseRequest`/`PurchaseRequestItem` (request-and-approval
  lifecycle: `draft → submitted → approved/rejected`, or `cancelled` from draft/submitted);
  `PurchaseOrder`/`PurchaseOrderItem` (supplier-facing lifecycle: `draft → sent →
  partially_received/received`, or `cancelled` from draft/sent only). `PurchaseOrder
  .recalculate_total()` mirrors `Invoice.recalculate_amounts()` (Phase 9) exactly — summed from
  line items via `unscoped_objects`, recomputed explicitly by the line-item ViewSet's
  `perform_create`/`update`/`destroy`, not auto-triggered inside the line item's own `save()`.
  `services.receive_order_items()` is the fifth independent application of the Phase 9
  `select_for_update()`-then-recheck-invariant template, and the first to call *into* another
  domain's service function from inside its own locked transaction: it locks the order and each
  referenced line item, re-checks "received + requested ≤ ordered" after the lock, and — for any
  line linked to an `InventoryItem` — calls `apps.inventory.services.record_stock_in()` in the same
  `transaction.atomic()` block, so a received shipment and the resulting stock increase either both
  happen or neither does. Nesting works cleanly because Postgres row locks are per-row: the locked
  `PurchaseOrderItem` and `InventoryItem` rows live in different tables. `procurement.*` (plus
  `inventory.view`) was added to the `accountant` role's default prefix list — purchasing is core
  to a role that already owns `fees.`/`payments.`, the first role-broadening decision since
  communications/assignments (Phase 11) rather than a restriction (Phase 12/13).
- **`apps.reports` has no models at all** — same shape as `apps.platform_admin`: a pure
  service/view layer computing aggregates from data already stored by other apps, confirmed by
  `makemigrations reports` reporting "No changes detected." `dashboard/` is the one endpoint that
  couldn't live inside any single existing domain app — it pulls headline numbers from six domains
  (students, staff, attendance, finance, inventory, procurement) into one response. Every other
  report (`enrollment/`, `attendance/`, `academic-performance/`, `finance/`) is `reports.view` to
  see as JSON, `reports.export` to download as CSV via `?export=csv` on the same endpoint — one
  view class picks the required permission based on whether CSV was requested, rather than a
  separate endpoint per format. **Not** `?format=csv` — that name collides with DRF's own
  content-negotiation query parameter (`URL_FORMAT_OVERRIDE`), and since only `JSONRenderer` is
  registered in `REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"]`, any non-"json" `?format=` value
  makes `DefaultContentNegotiation.filter_renderers()` raise `Http404` before the view ever runs
  (see Phase 15's bug notes in IMPLEMENTATION_STATUS.md) — a real bug this phase hit and fixed by
  renaming the parameter.

## Identifiers

Every model uses a UUID primary key (`apps/common/models.py::UUIDModel`), not sequential
integers, so IDs are never guessable/enumerable through the API.

## Error handling

All DRF errors are normalized to one envelope by
`apps/common/exceptions.py::custom_exception_handler`:

```json
{ "success": false, "message": "...", "code": "...", "errors": [] }
```

No tracebacks, SQL, or internals ever reach a response body; unhandled exceptions are logged
server-side and returned as a generic `INTERNAL_ERROR`.

## Audit logging

`apps/audit/models.py::AuditLog` is append-only — `save()` refuses to update an existing row,
`delete()` always raises. `school` and `actor` are nullable (platform-level events have no
school; the actor's email is denormalized so history survives account deletion). Sensitive keys
(`password`, `token`, `secret`, etc.) are scrubbed from `before`/`after` snapshots by
`apps/audit/services.py::log_action` before they're ever written.

## Backend project layout

```
backend/
├── config/
│   ├── settings/          # base.py, dev.py, prod.py (env-driven; DATABASE_URL required)
│   ├── urls.py
│   ├── wsgi.py             # config.settings.prod
│   └── asgi.py             # config.settings.prod
├── apps/
│   ├── common/              # abstract base models, DRF exception handler, pagination, base viewsets, email
│   ├── tenants/              # School model + lifecycle services, tenant context/managers/middleware/mixins, seed_dev_data
│   ├── users/                # custom User model, invite_user() service, school-scoped UserViewSet
│   ├── authorization/        # Permission/Role/RolePermission/UserRole, permission checks, seed_permissions, RoleViewSet
│   ├── authentication/       # CookieJWTAuthentication, tokens, all /api/v1/auth/ views
│   ├── audit/                 # AuditLog, request-context middleware, log_action() service, AuditLogViewSet
│   ├── platform_admin/       # platform-admin account management + platform stats (IsPlatformAdmin-only)
│   ├── academics/             # AcademicYear/Term/Department/Subject/SchoolClass/Section
│   ├── staff/                 # Staff profile (one-to-one with User)
│   ├── students/              # Student, guardian-linking actions
│   ├── parents/               # Guardian, StudentGuardian
│   ├── timetable/             # Room/Period/TimetableEntry, MyTimetableView
│   ├── attendance/            # StudentAttendance/StaffAttendance, bulk-mark, stats
│   ├── examinations/          # GradingScale/Exam/ExamSchedule, Result + lifecycle, bulk-enter, report-card
│   ├── finance/               # FeeCategory/FeeStructure, Invoice/Payment/Refund, record_payment/record_refund
│   ├── salary/                # SalaryStructure(+Item), StaffSalaryAssignment, SalaryPayment, generate/record_payment
│   ├── library/               # Book/BookCopy/BookLoan/BookReservation, checkout_book/return_book/renew_loan
│   ├── transport/             # Vehicle/Route/Stop/StudentTransportAssignment
│   ├── hostel/                # Hostel/Room/Bed/HostelAllocation, allocate_bed/check_out
│   ├── medical/               # MedicalProfile/MedicalVisit (stricter permissions)
│   ├── discipline/            # DisciplineIncident (stricter permissions)
│   ├── notifications/         # Notification, notify()/notify_bulk() — the one notification entry point
│   ├── communications/        # Announcement/AnnouncementRecipient, resolve_recipients/publish_announcement
│   ├── assignments/           # Assignment/AssignmentSubmission, Cloudinary-backed attachments, MyAssignmentsView
│   ├── documents/             # DocumentCategory/Document (owner_type discriminator), MyDocumentsView
│   ├── inventory/             # InventoryCategory/InventoryItem/InventoryTransaction, stock_in/stock_out
│   ├── procurement/           # Supplier, PurchaseRequest/Order (+Item), receive_order_items -> inventory
│   └── reports/               # no models — dashboard/enrollment/attendance/academic-performance/finance
├── tests/                   # cross-cutting integration tests (factories.py + tenant isolation, growing)
├── conftest.py               # api_client / csrf_api_client fixtures
├── pytest.ini
└── requirements/            # base.txt, dev.txt, prod.txt
```

`manage.py` defaults to `config.settings.dev`. Additional domain apps (examinations, finance,
...) are added incrementally per the phase plan in `docs/IMPLEMENTATION_STATUS.md`, following the
same `TenantScopedModel` + tenant-scoped-viewset pattern established here.

## Frontend project layout

```
frontend/
├── src/
│   ├── components/ui/   # design-system primitives: Button, Input, PasswordInput, Select,
│   │                     # Checkbox, Card, Badge, Spinner, Alert, EmptyState, Table (+Head/Body/
│   │                     # Row/RowLink/HeaderCell/Cell), Pagination, Toast (+ToastProvider/
│   │                     # useToast) — every one reads --color-*/--radius-* CSS variables from
│   │                     # index.css, never a hardcoded Tailwind palette class, so the existing
│   │                     # light/dark media query covers them for free
│   ├── features/         # one directory per domain: auth/, dashboard/, students/ (the first
│   │                     # full CRUD module — Phase 17), academics/ (both read-only class/
│   │                     # section/year lookups shared by every domain form, AND its own full
│   │                     # CRUD module for all six academics resources — Phase 18), staff/
│   │                     # (both a read-only class-teacher lookup AND its own full CRUD
│   │                     # module — Phase 19), users/ and authorization/ (minimal slices —
│   │                     # invite-a-user and list-roles only — built for the Staff create
│   │                     # form, not full modules), timetable/ (Room/Period List+Form plus a
│   │                     # weekly grid for TimetableEntry — Phase 20), attendance/ (a bulk
│   │                     # "take attendance" page, a records history, stats, plus a separate
│   │                     # Staff attendance List+Form — Phase 21), examinations/ (grading
│   │                     # scales/boundaries and exams/schedules as nested master-detail
│   │                     # List+Form, a bulk marks-entry screen, a Result status-machine
│   │                     # workflow, and a report card — Phase 22), finance/ (fee categories/
│   │                     # structures with nested line items, Invoice as a rich List+Detail+
│   │                     # (custom nested-create)Form entity, bulk invoice generation, and
│   │                     # payment/refund recording — Phase 23), library/ (book categories/
│   │                     # books with nested copies, a Checkout bulk-action screen, loans
│   │                     # with renew/return, reservations with fulfill/cancel, all under
│   │                     # one `library.*` prefix with no per-tab permission split — Phase
│   │                     # 24), transport/ (vehicles with nested maintenance, routes with
│   │                     # nested stops, a cascading Route→Stop student-assignment picker,
│   │                     # create+delete-only assignments with no edit form — Phase 25),
│   │                     # hostel/ (hostels with nested rooms with nested beds — a
│   │                     # three-level chain — a cascading Hostel→Room→Bed allocation
│   │                     # picker, create+check-out-only allocations with no edit/delete
│   │                     # at all — Phase 26), medical/ (two flat, unrelated resources —
│   │                     # profiles and visits — no nesting, no custom actions, the
│   │                     # first `datetime-local` form input — Phase 27), discipline/ (a
│   │                     # single flat resource, no tab layout, no Detail page — Phase 28),
│   │                     # communications/ (announcements with audience targeting, a
│   │                     # `publish` action, nested recipients for specific-users
│   │                     # targeting — Phase 29), assignments/ (teacher-authored
│   │                     # homework with a file attachment, nested submissions with a
│   │                     # grading action, admin/teacher side only — Phase 30),
│   │                     # documents/ (school/student/staff files with categories,
│   │                     # a three-way exclusive owner_type — Phase 31), inventory/
│   │                     # (stock items, categories, an append-only stock-movement
│   │                     # ledger, stock-in/out actions — Phase 33), procurement/
│   │                     # (suppliers, purchase requests and orders, each with its own
│   │                     # status lifecycle and nested line items, a multi-line receive
│   │                     # action — Phase 33), parents/ (Guardian contact records — backend
│   │                     # model is actually `Guardian`, not `Parent` — linking to students
│   │                     # lives on the Student Detail page instead, since the backend puts
│   │                     # it there too — Phase 37), audit/ (read-only audit-trail viewer,
│   │                     # no form pages at all — the API is list/retrieve only — Phase 38)
│   │                     # notifications/ (a topbar NotificationBell dropdown widget plus one
│   │                     # full list page — no sidebar nav entry of its own, mounted in every
│   │                     # shell instead — Phase 39)
│   │                     # — api.ts
│   │                     # (raw calls) +
│   │                     # use<Feature>.ts (TanStack Query hooks) + page(s) per feature; every
│   │                     # later domain follows the same shape. settings/ (SettingsPage —
│   │                     # profile/avatar/password self-service, reached via the topbar's
│   │                     # UserMenu under AccountLayout, not either shell's own sidebar —
│   │                     # Phase 34/36), schools/ + platform/ (platform-admin-only: school
│   │                     # tenant CRUD incl. activate/suspend, and platform-admin account
│   │                     # management + stats, reached only via PlatformShell — Phase 36),
│   │                     # notifications (topbar widget + list page, shared by both account
│   │                     # types — Phase 39) are the feature directories that aren't
│   │                     # school-scoped domain modules
│   ├── layouts/          # AppShell (protected: responsive sidebar + topbar + outlet, nav items
│   │                     # filtered by permission, modules with an in-page tab bar get a matching
│   │                     # collapsible sidebar dropdown — Phase 32 — whose own tab bar was then
│   │                     # removed as redundant once the dropdown existed — Phase 34; the sidebar
│   │                     # nav scrolls independently of the pinned header — Phase 32; the outer
│   │                     # shell is a fixed h-screen — not min-h-screen — so <main> is the only
│   │                     # region that scrolls, header/sidebar/footer stay pinned — Phase 35;
│   │                     # redirects a platform admin to /platform on render — Phase 36),
│   │                     # PlatformShell (mirror shell for platform admins only — flat 3-item
│   │                     # sidebar, redirects a non-platform-admin to /dashboard — Phase 36),
│   │                     # AccountLayout (minimal topbar-only chrome for /settings and
│   │                     # /notifications, shared by both account types since neither full
│   │                     # shell can host these pages on its own — Phase 36/39),
│   │                     # UserMenu (topbar avatar/name/role dropdown — Settings + Sign out —
│   │                     # Phase 34), Footer (thin, no-background, copyright + branding, mounted
│   │                     # in AppShell/PlatformShell/AccountLayout/AuthLayout — Phase 35/36),
│   │                     # AuthLayout (public: centered card) — every layout above carries a
│   │                     # ThemeToggle
│   │                     # (plain light/dark since Phase 34 — no more system option)
│   ├── lib/              # api-client.ts (axios + cookie CSRF + 401-refresh-retry interceptor +
│   │                     # error normalization), query-client.ts, cn.ts (clsx + tailwind-merge),
│   │                     # formErrors.ts (applyFieldErrors maps a field-tagged API error onto a
│   │                     # react-hook-form field, Phase 20; generalErrorMessage prefers the
│   │                     # first error's own text over DRF's generic top-level message, Phase 21)
│   ├── hooks/            # cross-feature hooks not specific to one domain: useDebounce, useTheme
│   ├── routes/           # AppRoutes.tsx, ProtectedRoute.tsx
│   └── types/            # shared TS types: auth.ts, pagination.ts (PaginatedResponse<T>,
│                          # matching the backend's count/next/previous/results shape exactly)
```

Path alias `@/*` → `src/*`. Dev server proxies `/api` to `http://localhost:8000` (see
`vite.config.ts`), so the frontend never hardcodes a backend origin.

**Auth state lives entirely in TanStack Query's cache — no separate Context/global-state layer.**
`useCurrentUser()` (`src/features/auth/useAuth.ts`) wraps `GET /auth/me/` with `retry: false` (a
401 there means "not logged in," not "worth retrying") and is the single source of truth
`ProtectedRoute` and `AppShell` both read; `useLogin()`/`useLogout()` write/clear that same cache
entry directly (`setQueryData`/`queryClient.clear()`) rather than invalidating-then-refetching,
since the login response already carries the full user object. `useHasPermission(code)` reads the
same cache's `permissions` array; `userHasPermission(user, code)` (Phase 17) is the same check as a
**plain, non-hook function** — `useHasPermission()` is now a thin wrapper around it. `AppShell`
filters its nav list with the plain function (`user` fetched once via `useCurrentUser()`), not by
calling `useHasPermission()` once per item inside `.filter()` — that shape was tried, recognized as
a rules-of-hooks violation (a hook called from inside a callback, not a component's own top level),
and replaced before it shipped. Any future code that needs a permission check somewhere a hook
can't legally be called (a loop, a plain callback, a non-component module) should reach for the
plain function the same way. **`code` can be a single string or an array (Phase 21)** — an array
means "any of," for the rare case where one nav item or one gate genuinely covers two different
permission sets (Attendance's nav entry is visible to `attendance.view` OR `staff_attendance.view`,
since those gate two structurally separate halves of that module). Widened additively; every
existing single-string call site is unaffected.

`apiClient`'s response interceptor handles a 401 by refreshing once and retrying the original
request — concurrent 401s share one in-flight `refreshPromise` (a module-level variable, reset in
`finally`) rather than each triggering their own `/auth/refresh/` call, and `/auth/login/`,
`/auth/refresh/`, `/auth/logout/` are explicitly excluded so a wrong password is never mistaken
for an expired session.

**The app shell's sidebar is a real responsive pattern, not an afterthought** — static at `lg:`
and up, an off-canvas drawer (overlay + slide-in panel, own open/close state) below it. This was
found missing and fixed during Phase 16's own browser verification (the pane defaults to a narrow
viewport, ~340-430px) — a concrete example of why `<when_to_verify>`'s "use the feature in a
browser" step exists: `tsc`/lint both passed the whole time the layout was actually broken.

**Branded "NTS School System"** in the browser tab title, the login page, and the sidebar's
fallback name before the real school loads. **`framer-motion`** (installed since Phase 1, unused
until this phase's polish pass) now has real callers: `LoginPage`'s entrance, the dashboard stat
cards' `staggerChildren` entrance, and the mobile drawer's `AnimatePresence` slide/fade — reserved
for actual mount/unmount transitions; a plain two-property CSS transform
(`hover:-translate-y-px active:scale-[0.97]` on `Button`) handles the simpler press/hover
micro-interaction without pulling in the animation library for something Tailwind already does.
`Input` gained an optional leading `icon` prop; `PasswordInput` (`src/components/ui/`) composes it
with a show/hide `Eye`/`EyeOff` toggle rather than forking `Input` itself.

**The Students module (Phase 17) is the reference shape every later domain screen should copy.**
One list page (debounced search, a status filter, `Table` + `Pagination`, permission-gated create
button and actions column), one form component shared by create *and* edit (branches on
`useParams()` id presence — same fields, same validation, same submit-then-navigate flow, only the
mutation hook and whether `useStudent()` pre-populates via `reset()` differ), one read-only detail
page. `StudentPayload` (the wire type) and `StudentFormValues` (the form's own zod-inferred type,
every field a controlled string) are deliberately two different types — `toPayload()` is the one
conversion point, and it drops empty-string optional fields rather than sending them, since DRF's
`DateField`/relation fields reject `""` as a format error rather than treating it as null.
`src/features/academics/` holds read-only `useAcademicYears()`/`useSchoolClasses()`/`useSections()`
lookups (page_size=100, no pagination UI — a school has a handful of each) as their own shared
module specifically because every future domain form needs the same three dropdowns, not because
Students uniquely needs them.

**The Academics module (Phase 18) is List+Form only, deliberately not the Students-shaped
List+Detail+Form** — its six resources (AcademicYear, Term, Department, Subject, SchoolClass,
Section) are reference/config records with 2–6 fields each, not rich per-person entities, so a list
row's click goes straight to Edit rather than a separate read-only view. The new CRUD functions/
hooks (`fetch*`/`get*`/`create*`/`update*`/`delete*` in `academics/api.ts`, `use*List`/`use*`/
`useCreate*`/`useUpdate*`/`useDelete*` in the new `academics/useAcademicsCrud.ts`) were named to
never collide with the pre-existing unpaginated `list*`/`use<Plural>` lookup exports Phase 17 built
and `StudentFormPage` still depends on — both live side by side in the same feature directory.
`AcademicsLayout` puts all six behind one `/academics` route with a tab-style sub-nav, and
`AppShell` gates the whole thing behind a single `academics.view` nav permission, since the backend
(confirmed against `apps/authorization/catalog.py`) uses one shared `academics.view/create/update/
delete` permission set across all six models rather than one per model. Unlike Students, `DELETE`
on every academics resource is a real hard delete — no soft-delete/archive concept exists on these
models. The Section form's optional "class teacher" field pulls from a new, deliberately minimal
`src/features/staff/` slice (`useStaffLookup()`, unpaginated, `{id, full_name}` only) — the Staff
module's own list/detail/form screens don't exist yet; this mirrors exactly how Phase 17 built the
academics lookups before Academics itself had a real module.

**The Staff module (Phase 19) is List+Detail+Form again, like Students — but its Form is two
separate components, not one shared between create and edit.** The reason is structural, not a
style choice: `Staff.user` is a required, unique `OneToOneField` to an existing `User`, and the
backend's `UserViewSet.create()` is deliberately disabled (`405` — "Users cannot be created
directly. Use the 'invite' action.") so accounts are never created with an admin-chosen password.
Creating a new staff member is therefore a genuine two-call flow with no backend-level atomicity:
`POST /users/invite/` (`email, first_name, last_name, role_id?`, via the new minimal
`src/features/users/` slice) creates the account (`is_active=False`, unusable password, an
activation email sent), then `POST /staff/` attaches a Staff profile to the id that call returns
(via `src/features/staff/`'s new `createStaff`). `StaffFormPage` (create) chains these two
mutations and is honest in its UI copy ("Invite & save," not "Save") about it being two requests;
if the second fails after the first succeeds, the error toast surfaces the already-invited email
rather than hiding that an orphaned account now exists. `StaffEditPage` (edit) is a completely
separate component that never touches the `user` link at all — only the staff-specific fields
(department, job title, qualification, hire date, emergency contact) are writable once a profile
exists. This is the deliberate exception to Phase 17's "one form, branch on `useParams()`" default:
that default holds only while create and edit fields genuinely don't diverge, and here they do.
A new minimal `src/features/authorization/` slice (`listRoles()`) feeds the create form's optional
role dropdown — `RoleViewSet` is read-only by design (roles are seeded per school, not created via
the API). Termination mirrors the backend precisely: `DELETE /staff/{id}/` doesn't remove the row,
it sets `employment_status=terminated` (`StaffViewSet.perform_destroy`), and `POST
/staff/{id}/enable/` reverses it — the UI's "Terminate"/"Reactivate" labels describe that exact
behavior rather than reusing Students' "Archive" copy for a mechanically-similar but
differently-named soft delete.

**Timetable (Phase 20) mixes both established shapes on purpose** — Room and Period are List+Form
like Academics' resources (config data, read rarely, edited occasionally); `TimetableEntry` gets a
purpose-built weekly grid (`TimetableGridPage`) instead, because a flat list of lesson rows is a
much worse way to read a schedule than a Day × Period matrix. The grid fetches one Section's
periods and entries at a time (`useAllSections()`, added alongside — not replacing — Academics'
existing class-scoped `useSections()`), renders Monday–Friday columns (the backend's `Day` enum
supports all seven days; a 5-day grid is a deliberate default, not a data-model limit — a school
that schedules weekend classes can still create those entries via the API, just not through this
grid today), and turns a clicked cell into a pre-filled create/edit navigation
(`/timetable/entries/new?section=...&day=...&period=...`). The backend already does real
double-booking prevention (a section, teacher, or room can't be scheduled twice in the same day/
period — enforced both by an explicit `serializer.validate()` for a clean 400 and by DB-level
partial `UniqueConstraint`s as the real safety net), so this is the first phase where surfacing a
*specific* server-side validation error mattered enough to build for: `src/lib/formErrors.ts`'s
`applyFieldErrors()` maps a field-tagged `ApiError.errors` entry onto the matching react-hook-form
field via `setError()`, falling back to a generic `Alert` only when nothing matched. This was
motivated by a real conflict hit during live testing (a teacher already booked elsewhere), not
a hypothetical — and it exposed a gap present since Phase 17: every earlier form only ever showed
`err.message`, which DRF's exception handler reduces to a generic `"Validation failed."` for any
field-tagged error. Not retrofitted onto Students/Academics/Staff's forms this phase — flagged as a
worthwhile but separate follow-up.

**Attendance (Phase 21) is the first domain whose primary screen is a bulk action, not a list or
a grid.** `TakeAttendancePage` picks a date/section(/subject/period) and loads that section's
active roster (a new `current_section` filter added to `StudentListParams`, additive alongside the
existing `current_class`), defaulting every student to "present" or pre-filling from any existing
record for that exact scope — safe to resubmit the same day repeatedly since the backend's
`bulk-mark` action is an upsert keyed on `(student, date, period)`. The roster-editing table is a
child component (`RosterEditor`) keyed by the scope string
(`` `${section}|${date}|${subject}|${period}` ``), so its local per-row state is computed once via
`useState(() => ...)` from the fetched roster/existing-records — changing the scope remounts it
with fresh state instead of needing a `useEffect` to re-sync, which is both React's own recommended
pattern for this and the fix for a real `oxlint` `set-state-in-effect` warning an earlier draft
produced. `AttendanceRecordsPage`/`AttendanceRecordFormPage` are the secondary "review and correct
one record" path; `AttendanceStatsPage` reuses the dashboard's `StatCard` directly. Staff attendance
is a wholly separate, simpler List+Form (no bulk-mark exists for it server-side), gated by its own
`staff_attendance.*` permission set rather than sharing `attendance.*` — the first time this app's
tab-layout pattern (Academics, Timetable) needed *per-tab* permission gating instead of one
umbrella permission for the whole layout, which is also why `userHasPermission`/`useHasPermission`
gained "any of an array" support (see above). Testing this phase also surfaced a sibling gap to
Timetable's `applyFieldErrors`: a *non-field* validation error (DRF's `non_field_errors`, e.g. a
duplicate staff/date submission) still carries a specific, useful message in `errors[0].message`,
but every existing caller of `applyFieldErrors`'s fallback was showing the generic top-level
`message` instead. Fixed with a new `generalErrorMessage()` in the same `formErrors.ts`, and
retrofitted onto Timetable's three forms too, since it's one shared function.

**Examinations (Phase 22) introduces two shapes this codebase hadn't needed before: nested
master-detail navigation, and a real multi-tier workflow permission model.** `GradeBoundary` only
means anything scoped to one `GradingScale`, and `ExamSchedule` only means anything scoped to one
`Exam` — so neither gets a flat top-level list the way every earlier config resource did. Each
scale/exam row instead gets an icon-button into a nested route
(`/examinations/scales/:scaleId/boundaries`, `/examinations/exams/:examId/schedules`) with its own
back-link and scoped Form pages. `Result` (the actual grade record) is a status machine — `draft →
submitted → reviewed → approved → published → locked`, plus a `correct` action reachable only from
`locked` that requires a reason and never changes the status — gated by a permission set with more
than the usual four verbs (`results.approve`/`publish`/`lock` alongside `view/create/update`, no
`delete` at all: the backend disables `DELETE` on this endpoint entirely, since a result is
corrected, never removed). `EnterMarksPage` mirrors Attendance's bulk-take shape exactly (same
keyed-child-component pattern, same "resubmit the whole roster, the backend upserts-or-skips"
safety), and `ResultsListPage` shows only the transition(s) a given status legally allows next,
each gated by its own specific permission — a role with `results.create/update` but not
`results.approve` correctly sees a "Reviewed" result with no further action available to them.
`ReportCardPage` renders the backend's `report-card` action's response as-is (it already owns the
published/locked filtering and the average computation); `EnterMarksPage` shows the schedule's max
score as a plain visible caption rather than a client-side validation rule, since the backend
itself never validates score against max_score — inventing a stricter client-side check here would
misrepresent what the system actually enforces.

**A live 404 caught a routing assumption that didn't hold for this one app**: every Result
endpoint was initially called at `/api/v1/results/results/...`, following the pattern every other
router-mounted app in this codebase uses (a named sub-path registration, doubled with the app's own
mount prefix). `apps/examinations/urls.py` registers `ResultViewSet` at `results_router.register("",
ResultViewSet, ...)` — the **empty string** — so combined with its `/api/v1/results/` mount, the
real paths are un-doubled (`/api/v1/results/`, `/api/v1/results/{id}/submit/`, etc.). Fixed by
reading the actual urls.py rather than continuing to infer from the general pattern once the first
live request failed.

**Finance (Phase 23) reuses nested master-detail twice more** (`FeeStructureItem` under
`FeeStructure`, `InvoiceLineItem` under `Invoice`) and is the first phase to give a rich entity
(`Invoice`) both a Detail page *and* a create form whose body shape doesn't match a plain
`ModelViewSet.create()` — the backend's `InvoiceCreateSerializer` takes a nested repeatable
`line_items` array, so `InvoiceFormPage` uses react-hook-form's `useFieldArray` (a first for this
codebase) instead of the flat single-record shape every earlier create form used. Recording a
payment lives on the Invoice Detail page, not a standalone flow, since a payment is always scoped
to one invoice and its balance is right there; refunds are reached from a payment row, since the
backend exposes no standalone refund-list endpoint at all — only the nested
`payments/{id}/refund/` action — so refund history isn't independently browsable, only the refund
action itself. `fees.*`/`payments.*` is a third instance of the two-permission-prefix-per-domain
shape Examinations introduced (`payments.*` uses non-standard verb names too — `view`/`record`/
`refund`, mirroring `results.*`'s addition of `approve`/`publish`/`lock` to the usual four).

**The same `(school, X)`-uniqueness-validator gap from Phase 20 recurred a third time, now in
`FeeCategory`/`FeeStructure`** — caught live the same way (a raw 500 on a duplicate name), fixed
the same way (explicit `validate_name` in `backend/apps/finance/serializers.py`, same shape as the
Room/Period fix). Three occurrences across three phases is a real pattern, not a coincidence — see
`docs/IMPLEMENTATION_STATUS.md`'s Phase 23 notes for why this strengthens the case for finishing
the flagged background audit rather than continuing to fix instances one live-caught 500 at a
time.

**A hand-written frontend type can be wrong even when `tsc` is clean** — `Invoice`'s type assumed
`academic_year_name`/`term_name` companions following this codebase's own raw-FK-id + `*_name`
convention, but `InvoiceSerializer` doesn't expose them (confirmed by reading the actual serializer
and the raw network response, not by a type error — there isn't one, since nothing checks a
hand-written interface against the real API shape). Fixed by resolving both names client-side from
the existing `useAcademicYears()`/`useTermList()` lookups rather than changing the backend's public
serializer for two read-only display labels. Worth remembering: `tsc` verifies internal
consistency, never truth against a live endpoint — a suspicious "—" in a rendered field is worth a
network-tab check before assuming the data is just unpopulated.

**Library (Phase 24) is the first domain with a single permission prefix instead of a two-prefix
split** — every earlier bulk-action domain (Attendance, Examinations, Finance) split its
permission catalog across two `<domain>.*` prefixes and needed per-tab gating in its layout
component; Library uses one `library.*` prefix for categories/books/copies/loans/reservations
alike, so `LibraryLayout`'s tab nav needed no per-tab permission checks at all — just the blanket
`library.view` already applied at the nav-item level in `AppShell`. `BookCopy` nested under `Book`
(`/library/books/:bookId/copies`) is the third reuse of the nested master-detail pattern
(Examinations' GradeBoundary/ExamSchedule, Finance's FeeStructureItem/InvoiceLineItem), and
`CheckoutPage` is the fourth reuse of the bulk-action-as-primary-tab pattern (take-attendance,
enter-marks, generate-invoices). **A reservation's `create()` was verified by reading
`apps/library/views.py` directly before writing the frontend call, not inferred from sibling
endpoints** — `BookReservationViewSet` has no overridden `create()`, so it returns a plain
unwrapped serializer object, unlike loan checkout's custom `create()` (wraps in `{loan: ...}`) and
the reservation `cancel`/`fulfill` actions (wrap in `{reservation: ...}`); getting this right on
the first attempt, rather than discovering a mismatch via a live 404 (as Phase 22's Result
endpoints did), came from checking the view source before writing `createReservation()`, which is
worth treating as the default habit for any custom `@action` or viewset `create()` going forward.
The same `(school, X)`-uniqueness-validator gap recurred a fourth time
(`BookCategory.name`/`Book.isbn`) — caught and fixed proactively this time (before any live 500),
since the research pass flagged it explicitly; `Book.isbn`'s constraint is additionally
*conditional* (`condition=~Q(isbn="")`, since a blank ISBN is allowed), and DRF's automatic
validator generation skips conditional constraints outright regardless of which fields are
present, so `validate_isbn` short-circuits on a blank value before checking uniqueness, mirroring
the DB partial index's own condition.

**Transport (Phase 25) refined the `(school, X)`-uniqueness rule with a live counter-example,
rather than just adding a fifth instance of the fix.** `Vehicle.registration_number` and
`Route.name` are genuine repeats of the established gap, fixed the same way. But `Stop`'s
`unique_stop_order_per_route` constraint (fields `route` + `order`, both serializer-visible) looked
identical on paper — a defensive `validate()` was added to `StopSerializer` — yet live testing
showed the actual rejection came from DRF's own automatic `UniqueTogetherValidator` ("The fields
route, order must make a unique set"), not the custom code. The precise rule, sharpened by this:
DRF auto-validates a multi-field `UniqueConstraint` whenever *every* field in it is present on the
serializer; it's only invisible when a field is absent entirely (`school`, always) or the
constraint is conditional (Library's `Book.isbn`). `route`+`order` are both ordinary serializer
fields, so DRF already covered it — the added `validate()` is a harmless backstop that never fires,
not a fix for a real gap. Worth applying to the still-outstanding Academics audit: check field
visibility per constraint before assuming a fix is needed. Transport also reuses nested
master-detail twice more (`Stop` under `Route`, `VehicleMaintenance` under `Vehicle`) and is the
first domain to give a resource (`StudentTransportAssignment`) no edit form at all — since it
carries no in-place workflow beyond existing, reassignment is modeled as delete-then-recreate,
and its cascading Route→Stop picker (`AssignmentFormPage`) deliberately uses local `useState`
rather than `watch()` to avoid adding a fourth occurrence of the `incompatible-library` oxlint
warning already accepted elsewhere.

**Hostel (Phase 26) is the first three-level nested master-detail chain** (`Bed` under `Room`
under `Hostel`) and confirms the Transport-phase refinement of the uniqueness rule holds up under
a genuinely different shape: `Room.room_number` (per-hostel) and `Bed.bed_number` (per-room) are
both ordinary, fully-serializer-visible multi-field constraints, so neither needed a manual fix —
checked directly rather than assumed, since it would have been easy to over-apply the "add a
`validate()` for every flagged constraint" habit from earlier phases. `Hostel.name` is a genuine
sixth instance of the `(school, X)` gap, fixed the same way as before. **A more interesting case**:
`HostelAllocation` carries two *conditional* unique constraints
(`unique_active_allocation_per_bed`, `unique_active_allocation_per_student` — both
`condition=Q(status="active")`), which DRF's automatic validator never covers regardless of field
visibility (the same rule that already applied to Library's `Book.isbn`). Rather than needing a
serializer-level fix, these are correctly enforced by `services.allocate_bed()` — the same
`select_for_update()`-then-recheck shape as Library's `checkout_book()` and Finance's
`record_payment()` — raising a domain `HostelError` that the view turns into a clean 400. Verified
live (a duplicate active allocation attempt surfaced the exact service-layer message, not a raw
500), confirming "DRF doesn't auto-validate this constraint" and "this constraint is unenforced"
are different claims that need checking separately. **A naming collision was caught by tooling,
not by inspection**: Hostel's own `Room` concept (a dormitory room) is unrelated to Timetable's
`Room` (a classroom), but both would have exported identically-named `RoomsListPage`/
`RoomFormPage` components — `oxlint` raised a duplicate-identifier error in `AppRoutes.tsx` the
first time both were imported together, resolved by renaming Hostel's to
`HostelRoomsListPage`/`HostelRoomFormPage` rather than reaching for an import alias or renaming
the older, already-shipped Timetable feature. `AllocationFormPage`'s cascading picker goes one
level deeper than any prior domain's (Hostel → Room → Bed, vs. two levels everywhere else), and
since `BedViewSet` filters only by `?room=` with no occupancy parameter, the final
"available beds only" narrowing happens client-side over the room-scoped result — a shape forced
by what the backend actually exposes, not a design preference.

**Medical (Phase 27) is the first domain with no backend fix at all** — both models were checked,
not assumed, and neither carries a `Meta.constraints` entry. `MedicalProfile`'s one-profile-per-
student rule comes from `student` being a plain `OneToOneField` (`unique=True` at the model-field
level, not a `UniqueConstraint` object), which is a third, simpler case alongside the `(school, X)`
gap and the multi-field-constraint rule already established: DRF attaches a `UniqueValidator`
directly to any serializer field backed by a `unique=True` model field, independent of the
`Meta.constraints` introspection that governs multi-field constraints. Verified live: a duplicate-
profile attempt surfaces DRF's own generic wording ("medical profile with this student already
exists"), not `MedicalProfileSerializer.validate_student`'s own duplicate-check message — the
automatic validator runs first and wins, the same "automatic validator fires before custom
`validate()`" ordering already seen with Transport's `Stop.order`. Medical is also the first domain
with two entirely flat, unrelated resources (`MedicalProfile`, `MedicalVisit`) and no master-detail
relationship of any kind — `MedicalLayout` needed only two plain List+Form tabs. It introduces this
codebase's first `datetime-local` input (`MedicalVisit.visited_at`): `toDatetimeLocal()`/
`nowAsDatetimeLocal()` helpers in `VisitFormPage.tsx` convert between the input's seconds-and-
timezone-free value format and the API's ISO datetime strings, submitting the raw `datetime-local`
value as-is (Django's `DateTimeField` parses a naive string directly) — the reference shape for
any future `DateTimeField` form field in this codebase. Finally, `medical.*` is confirmed (by the
backend's own tests) to be a deliberately stricter permission group than every other domain's — no
seeded role except principal/school-administrator gets it by default, unlike `students.*` or
`staff.*` which several roles share.

**Discipline (Phase 28) is the second consecutive domain with no backend fix**, and the first
domain with only one resource — confirmed via the research pass that `DisciplineIncident` has zero
`Meta.constraints` entries at all, so there was nothing resembling the `(school, X)` gap to check
beyond confirming its absence. Because it's a single resource, it skips the tab-layout pattern
every multi-resource domain since Attendance has used, following the older flat-route shape
Students/Staff established instead (`/discipline`, `/discipline/new`, `/discipline/:id/edit`, no
wrapping layout component). `reported_by` points at `users.User` (the login-user model), not
`staff.Staff` — confirmed before assuming a staff lookup was needed, so `IncidentFormPage` never
imports `useStaffLookup` at all, and shows the server-set `reported_by_name` as a plain read-only
caption next to the form's card title rather than inventing a dedicated read-only-field treatment.
`IncidentFormPage` reuses Medical's `toDatetimeLocal`/`nowAsDatetimeLocal` helpers verbatim for
`incident_date`, the same `DateTimeField`-input reference shape rather than a new implementation.

**Communications (Phase 29) is the third consecutive domain with no backend fix**
(`Announcement` has zero `Meta.constraints`; `AnnouncementRecipient`'s one multi-field constraint
is already auto-validated since both its fields are ordinary serializer fields — confirmed live,
not assumed, via the exact DRF auto-generated rejection message). It's also the first domain to
surface a **real frontend bug** rather than a backend one: `AnnouncementFormPage`'s `target_class`
field is conditionally rendered based on `watch("target_type")`, and on the edit path both values
came from the same server fetch — a `reset()` call inside a `useEffect` (every earlier form's
pattern) has nothing to hand a field that doesn't exist yet at the moment it runs, so the
conditionally-mounted `target_class` select was left empty even though the correct `<option>`
existed in the DOM. This phase's original fix switched to `useForm`'s `values` option — **later
found to be unreliable and superseded in Phase 30** (see that phase's notes): `values` was
re-verified only once and, under Phase 30's more rigorous multi-reload testing, turned out to fail
the same way on a fresh page load. The corrected, verified-repeatable fix removes the conditional
*mounting* entirely (the narrowing selects are now always rendered) and reverts to the plain
`reset()`-in-`useEffect` pattern every other form already used — eliminating the root cause instead
of working around it. `AnnouncementRecipient.user` FKs to `users.User`
directly, matching neither `Student` nor `Staff`, so a new `listUsers()`/`UserLookup` lookup was
added to the existing `users` feature (`frontend/src/features/users/api.ts`) rather than invented
inside `communications` — the first use of `/api/v1/users/` as a picker source in this codebase,
and deliberately left to 403 for roles (like the default `teacher`) that hold `communications.*`
but not the `users.view` the picker actually requires, rather than inventing a client-side
permission distinction the backend itself doesn't define.

**Assignments (Phase 30) is the homework domain — teacher-authored assignments with a file
attachment and graded student submissions — built admin/teacher-side only** (no student-facing
"my assignments"/submit self-service, even though the backend's `MyAssignmentsView`/
`SubmitAssignmentView` support it; every phase in this build has been an admin dashboard, never a
student portal, so that flow stayed out of scope). It found one real **backend** bug:
`AssignmentViewSet.perform_create` passed `teacher=staff_profile` to `serializer.save()` without
checking whether `staff_profile` was `None`, so any user with `assignments.create` but no linked
`staff.Staff` row (principal, via the wildcard role, is exactly such a user) hit an unhandled
`RelatedObjectDoesNotExist` in `Assignment.save()`'s cross-school guard — a raw 500. Fixed with an
explicit `None` check raising `serializers.ValidationError`, mirroring the same-shaped guard
`SubmitAssignmentView` already used for `student_profile`. It's also the phase that exposed
Communications' `values`-based fix (above) as unreliable: building this domain's own Class/Section
picker with `values` reproduced a field-population failure on repeated fresh loads, which prompted
re-testing Communications more rigorously and finding its fix hadn't actually held up either. Both
forms now use the same corrected pattern: always-rendered (never conditionally-mounted) narrowing
fields, populated via the original `reset()`-in-`useEffect` approach — removing the field-mounting
race at its root rather than reaching for a different sync mechanism. A second Transport naming
collision surfaced the same way as Hostel's `Room`: this domain's natural `AssignmentFormPage`/
`AssignmentsListPage` names already belong to Transport's student-route assignments (Phase 25), so
this phase's components are `HomeworkAssignmentFormPage`/`HomeworkAssignmentsListPage` instead,
caught by `oxlint`'s duplicate-identifier error before reaching the browser. **Correction (Phase
31): the diagnosis above was itself incomplete.** The "removing the field-mounting race at its
root" fix was verified only by repeated `force`-reload navigations within the same browser tab,
which don't clear React Query's in-memory cache — so the lookup queries were already warm from
earlier navigation, masking a bug that was still there. Phase 31's `DocumentFormPage` reproduced
the identical population failure with fields that were never conditionally mounted at all,
proving the real cause was neither `values` vs. `reset()` nor field mounting. See "Documents
(Phase 31)" below for the actual root cause and the corrected fix, which was retroactively applied
to this file's `HomeworkAssignmentFormPage` and to `AnnouncementFormPage`.

**Documents (Phase 31) is school/student/staff file storage with categories, confidential-flagging,
and an optional expiry date, admin/staff-side only** (no student/staff self-service "my documents"
view, same scoping call as Assignments/Communications above — `MyDocumentsView` exists and works on
the backend but building the self-service screen is a scope change). It found one real **backend**
bug: the same `(school, X)`-uniqueness-validator gap described below, recurring for
`DocumentCategory.name`; fixed with an explicit `validate_name` on `DocumentCategorySerializer`. Its
more significant contribution was **finally pinning down the true root cause of the field-population
bug this build had already misdiagnosed twice** (Communications, Phase 29; Assignments, Phase 30):
building `DocumentFormPage`'s `category` and `student` selects — each populated from a separate async
lookup query, on ordinary always-mounted fields with no conditional rendering — reproduced the exact
same failure. **The actual mechanism**: a native `<select>` element silently ignores a value
assignment made before its matching `<option>` exists in the DOM. This is a plain browser/DOM
constraint, true regardless of which React Hook Form API performs the assignment (`reset()`,
`values`, or otherwise), and regardless of conditional mounting. When a form's `useEffect` calls
`reset()` as soon as its primary `id`-scoped resource loads (e.g. `useDocument(id)`), but a field in
that call is backed by a *different*, independently-loading lookup (e.g. `useCategoryList()`,
`listStudents()`), the value is silently dropped if the lookup hasn't resolved yet — and nothing
re-applies it later, since the effect's dependency array doesn't include that lookup's data, so the
effect never re-fires once it resolves. **The fix**: add every async lookup query's `data` to the
effect's dependency array whenever `reset()` populates a field backed by it, so the effect harmlessly
re-fires (calling `reset()` again with the same values) once each lookup resolves. Applied to
`DocumentFormPage`, and retroactively to `HomeworkAssignmentFormPage` and `AnnouncementFormPage`
(both had the identical latent bug, previously masked by a warm query cache). This time verified
across **multiple independent, genuinely cold browser tabs** (opened via `tabs_create`, not a
same-tab `force` reload, which shares the tab's warm in-memory React Query cache) — now the
corrected verification standard for any fix of this shape going forward. A background task has been
flagged (not performed this session) to audit earlier phases' edit forms for the same bug shape,
since it's common throughout this codebase. A naming collision with Library's `CategoriesListPage`/
`CategoryFormPage` was resolved with an import alias in `AppRoutes.tsx` rather than renaming either
domain's components, since each name is locally sensible within its own domain and only the
route-aggregation file's import list actually collides.

**Phase 32 is a sidebar navigation overhaul requested directly by the user, not a new domain — a
scrollbar for the sidebar itself, and collapsible dropdowns in the sidebar for every module that has
an in-page tab bar, so a sub-page is reachable in one click instead of landing on the module's
default tab first.** `AppShell.tsx`'s `NavItem` gained an optional `children: NavChild[]`, populated
for the ten modules that have a `*Layout.tsx` with tabs (Academics, Timetable, Attendance,
Examinations, Finance, Library, Transport, Hostel, Medical, Documents) by copying each Layout's own
tab list, so sidebar and in-page tabs can't drift apart. Finance/Examinations/Attendance's per-tab
permission gating (mirroring each Layout's own `useHasPermission` checks) was carried over onto their
children; the other seven modules' children have no extra permission since the parent's already
covers all of them. A module with children renders as a `<button>` that only toggles an
open/closed `Set<string>`, never a link — overloading one control with both "expand" and "navigate"
makes neither predictable, so every actual navigation happens through a child (or a childless
top-level item) instead. The currently-active module auto-expands on mount and on every route
change via a `useEffect` on `location.pathname`, but nothing auto-collapses a module the user opened
deliberately — multiple groups can stay open at once. **The scrollbar fix is a flex-layout detail
worth remembering generally**: a flex child needs `min-h-0` to actually shrink and scroll via
`overflow-y-auto` — without it, `flex-1` alone lets the child grow to its content's height and
overflow its parent instead of scrolling, since a flex item's default `min-height` is `auto` (its
content size), not `0`. The sidebar's `<nav>` is now `min-h-0 flex-1 overflow-y-auto` beneath a
`shrink-0` header, and the desktop `<aside>` itself became `lg:sticky lg:top-0 lg:h-screen` so the
whole sidebar stays pinned while the main content area scrolls independently; the project's existing
themed scrollbar CSS (`index.css`) applied automatically, no new styling needed. Both the desktop
`<aside>` and the mobile off-canvas drawer render the same `SidebarContent` component, so the dropdown
and scroll behavior apply identically to both without separate implementation. Confirmed live at a
1440×900 desktop viewport (multiple dropdowns open at once, `scrollHeight` 1938px against a
`clientHeight` of 836px, a themed scrollbar visible and functional, header staying pinned) and again
at a 375×812 mobile viewport (the off-canvas drawer opening with the active module pre-expanded and
its active child highlighted). One Browser-pane testing quirk surfaced and is worth remembering for
future sessions, not an app bug: this environment's coordinate-based click occasionally lands on the
wrong sidebar row even when `getBoundingClientRect()` confirms the target element is exactly where
expected — dispatching a real `element.click()` via `javascript_tool` was reliable every time and
should be preferred over coordinate clicks when verifying a list of closely-stacked interactive rows
like this sidebar.

**Phase 33 is Inventory and Procurement, built together in one phase because they're tightly
coupled** — receiving a purchase order writes directly into the inventory stock ledger via the
backend's own `apps.inventory.services.record_stock_in`, called from
`apps.procurement.services.receive_order_items`. It found **the same `(school, X)`-uniqueness gap
four times in one phase** (`InventoryCategory.name`, `InventoryItem.sku` — a partial constraint,
only enforced when non-blank — `Supplier.name`, `PurchaseOrder.order_number`), the most in a single
phase so far, all fixed the same way as every earlier occurrence and all confirmed live as clean
400s. It also found **two new frontend bugs during its own live verification**, both fixed the same
session: (1) `PurchaseOrderFormPage`'s `source_request` preselection (from a `?source_request=`
query string, reached via the "Create order" button on an approved request) silently failed on a
cold load — the same select-population root cause as Phases 29-31 (a native `<select>` ignores a
value assigned before its matching `<option>` exists), but in a new shape: the value came from
`useForm`'s `defaultValues` in create mode, where there's no primary resource to key a populating
effect on, so nothing re-applied it once the async `approvedRequests` list loaded. Fixed by having
the same populating `useEffect` handle the create-mode case too, re-firing once `approvedRequests`/
`suppliers` load. This widens the known shape of the bug family — it isn't only
"`reset()`-in-`useEffect` keyed on the primary resource," any code path assigning a `<select>`'s
value before its options exist can hit it. (2) After recording a purchase-order receipt, the order
detail page kept showing the pre-receipt `quantity_received` until a full reload — the shared
`invalidateOrder()` cache helper invalidated the `procurement/orders` query key but not the separate
`procurement/order-items` key that `quantity_received` actually lives under. Fixed by adding the
missing key to the helper. Both fixes confirmed live (the first across a genuinely cold browser tab,
the second by observing an in-place update with no reload). Separately: the `pytest` run for this
phase's own two apps took over thirteen minutes for a small, pre-existing test suite — confirmed to
be Neon network latency for test-database setup/teardown (watched two live python processes
accumulate CPU time slowly but steadily throughout), not a hung process, worth remembering before
assuming a long-silent background test run needs to be killed and retried.

**Phase 34 is navigation cleanup plus a topbar user-account menu and a self-service Settings
page, requested directly by the user — not a new domain.** Every module `*Layout.tsx` that got a
sidebar dropdown in Phase 32 had its now-redundant in-page tab `<nav>` removed (12 files: Academics,
Timetable, Attendance, Examinations, Finance, Library, Transport, Hostel, Medical, Documents,
Inventory, Procurement) — each is now just a header plus `<Outlet />`, the sidebar dropdown being
the only way to move between sub-pages. The permission-aware index-redirect components
(`AttendanceIndexRedirect`/`ExaminationsIndexRedirect`/`FinanceIndexRedirect`) were deliberately left
untouched — which sub-route a bare `/attendance` lands on and whether a tab bar renders on that
sub-route are independent concerns, and conflating them would have been an easy mistake.
`useTheme`/`ThemeToggle` dropped from a three-state light/dark/system cycle to a plain two-state
toggle (the "desktop"/Monitor icon the user asked to remove) — `ThemeMode` is now `"light" | "dark"`
only, though the very first visit still opens in whichever theme the OS prefers (read once via
`matchMedia` to seed the initial state, so removing the explicit come-back-to-system option didn't
also remove a sensible first-run default). The topbar's bare `{full_name} + Sign out button` became
`UserMenu` (`frontend/src/layouts/UserMenu.tsx`) — an avatar/name/role dropdown (Settings + Sign
out), using the exact same click-to-open / outside-click-and-Escape-close / `framer-motion`
transition pattern as Phase 32's sidebar dropdowns, just applied to a different trigger shape. It
opens onto a new Settings page (`frontend/src/features/settings/SettingsPage.tsx`, at `/settings`,
reachable only from `UserMenu` — deliberately not in the sidebar, since it's an account page, not a
domain module): a read-only Account card (school, role badges), a Profile card (avatar picker —
identical UX to `StudentFormPage`'s photo picker — first/last name, email, phone number, saved via
a new `PATCH /api/v1/auth/me/`), and a Password card (current/new/confirm, saved via the existing
`POST /api/v1/auth/change-password/`). **The password card's success handler immediately calls
`useLogout()` and navigates to `/login`** — a password change that blacklists every outstanding
refresh token server-side has to be treated by the frontend as an implicit logout, not just "an API
call that happened to succeed," or the dead session produces a confusing 401 on the very next
request. Three backend additions made this possible, all in `apps/authentication`/`apps/users`, not
a new app: `User.photo` (a new `FileField`, the exact same shape as `Student.photo` — `Staff` has no
photo field at all, and not every `User` has a linked profile to borrow one from anyway);
`CurrentUserSerializer` gained `phone_number`, `photo`, and — the more significant gap —
`roles` (computed the same way `UserSerializer.get_roles` already does), since there was previously
**no permission-safe way for a low-privilege user to learn their own role name at all**
(`/api/v1/users/{id}/` and `/api/v1/roles/` are both gated behind `users.view`, which a plain
Teacher doesn't have; `/auth/me/` was the correct place to fix this precisely because it's the one
endpoint in the backend that's `IsAuthenticated`-only by design); and a new
`MeUpdateSerializer`/`MeView.patch()` giving `PATCH /api/v1/auth/me/` — the first "edit yourself
regardless of role" endpoint in the backend, since the existing `UserViewSet` has no self-access
exception at all (a user without `users.update` can't PATCH even their own row through it).
`pytest apps/authentication apps/users` re-run afterward purely as a regression check (nothing was
suspected broken) — all 20 existing tests still passed. Verified live end-to-end, including the
riskiest part: actually changing the live `principal@demoacademy.test` account's password, confirming
the forced logout and successful re-login with the new password, then changing it back and cleaning
up the test phone number/photo via a one-off Django shell script to restore prior state.

**School registration — how a platform/super admin registers a new school — has no frontend at
all today, confirmed by this phase's own backend research; documented here since the user asked for
an explanation.** `School` (`apps/tenants/models.py`) has no subdomain field — tenancy is per-`school`
FK on every scoped record, not subdomain-routed. Creation is a single API call,
`POST /api/v1/schools/` (`SchoolViewSet`, gated by a hardcoded `IsPlatformAdmin` check —
`user.is_platform_admin or user.is_superuser` — entirely outside the `Permission`/`Role` catalog
that governs school-scoped access; there is no `platform.*`/`tenants.*` permission code at all).
The payload carries the school's own fields (`name`, `slug`, contact/locale fields) plus three
required write-only fields for its first user: `admin_email`, `admin_first_name`,
`admin_last_name`. In one `@transaction.atomic` call (`apps/tenants/services.py:create_school`):
the `School` row is created with `status="pending"` (always, regardless of input — not a
client-settable field), `seed_default_roles_for_school()` bulk-creates the six system roles with
their permissions pre-wired, and `invite_user()` — **the identical invite-only pattern already used
for Staff accounts** — creates the admin's `User` row (`is_active=False`, unusable password) and
emails them an invitation link; they set their own password via the existing
`POST /api/v1/auth/accept-invitation/`, and are assigned the `school-administrator` role. The
platform admin never sees or sets a password for them. **One extra step is required before that
admin can actually log in**: `LoginView` rejects any login where `school.is_active` is false, so the
platform admin must separately call `POST /api/v1/schools/{id}/activate/` (there's a matching
`.../suspend/` with a required `reason`) once they're satisfied the school is legitimate. Django
admin (`/admin/`) also registers `School`, but only as a secondary superuser-console view — creating
a row there wouldn't run `create_school`'s side effects (role seeding, admin invite), so it's not
the intended path. `seed_dev_data` (the management command behind this project's demo accounts)
bypasses all of this — it creates its demo school directly as `status="active"` and sets a
hardcoded password on its users via `set_password()`, which is a dev-only shortcut, not a hint at a
different production flow. No frontend anywhere in `frontend/src/features/` consumes any of this —
building a platform-admin console (school list, the create form, activate/suspend actions) would be
new work from scratch, not a gap in something already started.

**Phase 35 is a responsive/layout polish pass requested directly by the user — tighter page
margins, an application footer, and a real app-shell bug fix found while verifying it.**
`AppShell`'s `<main>` padding was tightened from `p-4 sm:p-6` to `p-3 sm:p-4`, and a new `Footer`
(`frontend/src/layouts/Footer.tsx`) — a thin, no-background, top-border-only bar with copyright and
branding text, stacking on narrow screens — was mounted in both `AppShell` and `AuthLayout`.
**Building it exposed a real, pre-existing bug in the app shell**: the outer container was
`min-h-screen`, which only sets a *minimum* height — once total content (header + main + the new
footer) exceeded the viewport, the whole `<body>` became the scrolling element instead of just
`<main>`, carrying the header and footer off-screen with it. This was always latent (nothing before
Phase 35 pushed total content past the viewport threshold reliably enough for anyone to notice, and
the sidebar's own independent `h-screen`/`sticky` scroll masked it further) — the footer's stacked
two-line mobile layout was what finally made it visible. **Fixed** by changing the outer container
to `h-screen overflow-hidden`, giving `<main>`'s existing `flex-1 overflow-y-auto` an actual budget
to shrink into. The general lesson: `min-h-screen` and `h-screen` are not interchangeable on a flex
container that needs an internally-scrolling child — a "fixed header/sidebar, scrolling middle,
fixed footer" shell needs a genuinely fixed-height ancestor, or the *container* grows to fit content
instead of the intended child scrolling within it. The bug was found via a geometry check, not a
screenshot — comparing `element.scrollHeight` to `clientHeight` (equal means no internal overflow,
so something else must be scrolling if content is visibly cut off) alongside `document.body
.scrollHeight` vs `window.innerHeight` (unequal means the page itself is the scrolling element) —
worth reaching for this diagnostic first for any future "sticky header/footer isn't sticking"
report in this shell. Verified responsively at mobile (375×812), tablet (768×1024), and desktop
(1440×900) via a mix of live screenshots and DOM geometry checks (the Browser pane's screenshot
tool became unreliable partway through this phase's verification — a tool-session issue, not a
product bug, confirmed by the page rendering correctly via `get_page_text`/console/network checks
throughout; later checks fell back to geometry assertions instead).

**Phase 36 is Schools + Platform, the first two of six frontend modules requested in sequence
("schools, then platform, then parents, then audit, then notifications, then reports") — and the
first frontend work for a second account type, platform admins, which needed genuinely new shell
architecture, not just two new feature directories.** Backend research (done before writing any
code) found reusing `AppShell` for a platform admin would be unsafe, not just visually wrong: every
permission check in this backend (`require_permission(...)`, the whole `Permission`/`Role` catalog)
short-circuits `true` for `is_platform_admin`, and the tenant-scoped model manager
(`TenantManager`) returns **every row from every school, fully unscoped**, under a platform-admin
request context — not empty, not safely filtered to nothing, literally all tenants' data with no
`school=` filter. `apps/reports` (the Dashboard's backend) happens not to crash for one (it filters
`school=None`, matching no rows), but produces a silently hollow, misleading dashboard rather than
an error. Nothing in the backend blocks a platform admin from reaching a school-scoped endpoint —
that's left entirely to frontend routing. So: a new `PlatformShell` (`frontend/src/layouts
/PlatformShell.tsx`, a flat 3-item sidebar — Overview, Schools, Platform admins — no
dropdown/permission-filtering complexity, since gating here is one `is_platform_admin` check, not
the school-scoped Permission catalog; reuses `Footer`/`UserMenu`/`ThemeToggle` as-is), with a
**two-way routing guard, one line in each shell**: `AppShell` redirects a platform admin to
`/platform` the instant it renders, `PlatformShell` redirects a non-platform-admin to `/dashboard`
— neither shell trusts the other's route tree to keep the wrong account type out, each guards
itself. This forced a third change: `/settings` couldn't stay nested under `AppShell` anymore (a
platform admin would get bounced away from it before ever seeing it), and it can't be registered
under two different shells at the same path (React Router has no per-user path branching) — so it
moved into a new, shell-agnostic `AccountLayout` (`frontend/src/layouts/AccountLayout.tsx`, a
minimal topbar-only chrome), reachable by both account types, with a "Back" link resolving to
`/platform` or `/dashboard` depending on who's looking at it. `AppShell`'s local `LogoBadge` was
exported so `PlatformShell` could reuse the same brand mark rather than duplicating it. **Schools**
(`frontend/src/features/schools/`) is full CRUD against `apps.tenants`'s `SchoolViewSet` — list,
create (a combined "school + first admin" form; `admin_email`/`admin_first_name`/`admin_last_name`
are write-only and invite that person the same way every Staff invite already works in this
codebase, hidden entirely in edit mode since a school already has its admin by then), detail
(Activate/Suspend actions, conditionally shown — a fresh school starts `status="pending"` and shows
both, since it's neither active nor suspended yet), edit (`logo_url` only appears here, the create
endpoint doesn't accept it). **Deliberately no delete button anywhere**: research found
`SchoolViewSet.destroy` is live, unguarded (no dependent-record check), and unlogged (no audit
trail) — a real hard-delete would cascade through every record belonging to that school with zero
confirmation. Flagged as a backend gap rather than built around with a "confirm twice" UI, since
`suspend` is already the correct everyday tool for "this school shouldn't be usable." No
`(school, X)`-uniqueness-gap bug this time — `School.slug` is a plain single-column `unique=True`
(no `school` FK on `School` itself), so DRF's automatic validator already handles a duplicate slug
cleanly, confirmed by research rather than a live 500. **Platform**
(`frontend/src/features/platform/`) covers platform-admin account management — list (with a
per-row Disable/Enable, mirroring Library's loan renew/return icon-button pattern; the
currently-logged-in admin's own Disable button is client-side disabled with an explanatory tooltip,
mirroring the backend's own `SELF_DISABLE_FORBIDDEN` guard) and an Invite-only creation flow (the
backend's plain `create` action is hard-blocked, 405, specifically to force every platform admin
through the same invite mechanism — no detail page, no plain create form, matching the established
"a resource with no richer workflow doesn't need full CRUD" pattern) — plus a stats Overview page
reusing `StatCard` directly from `features/dashboard/StatCard` rather than reinventing it. Noted,
not fixed: there's no "last remaining platform admin" lockout guard beyond the self-disable check
(two admins could still disable each other down to one) — a backend invariant question outside
this phase's actual ask. Verified live as both account types (a platform admin's full school
create→activate→suspend→edit lifecycle and admin invite→disable→enable cycle; a school user's
`/dashboard` landing unaffected and a manual `/platform/schools` visit correctly bounced back) —
test records deleted afterward via a one-off Django shell script.

**Phase 37 is Parents — the backend model is actually named `Guardian`, not `Parent`
(`apps.parents.models.Guardian`); only the URL prefix (`/api/v1/parents/`) and this module's own
UI label say "parent," every field, the `StudentGuardian` through-model, and every response key say
"guardian," and the frontend's own types follow the backend's naming, not the URL's.** This is an
ordinary school-scoped domain (`parents.*` permissions, principal/school-administrator/registrar by
default) — unlike Phase 36's Schools/Platform, it needed no new shell architecture, just a normal
`AppShell` sidebar entry. `frontend/src/features/parents/` is flat CRUD for `Guardian` contact
records (list/create/edit/delete, no detail page — a `Guardian` has nothing more to show than the
list/form already covers) — deliberately with **no `user` field exposed in the form**: a `Guardian`
can optionally hold a linked login account, and it's already correctly guarded server-side
(`GuardianSerializer.validate_user()` checks same-school and not-already-linked), but there's no
invite flow or account picker anywhere in this codebase to actually populate it, so exposing the
field would just be a half-working control — flagged as a known gap instead. **The more
architecturally interesting piece: linking a guardian to a student lives on the Student Detail
page, not the Parents page**, because that's where the backend puts it —
`GET/POST/DELETE /api/v1/students/{id}/guardians/` is a custom action on `StudentViewSet`, there is
no flat `StudentGuardian` list endpoint and no reverse "this guardian's children" endpoint at all.
`StudentDetailPage.tsx` gained a `GuardiansSection`: a table of linked guardians (relationship,
Primary/Emergency badges, unlink action) plus an inline "link a guardian" mini-form — not a
separate route, since this is a lightweight one-off linking action against an already-open page,
matching the inline-editor precedent set by Attendance's roster/Examinations' bulk marks entry
rather than the separate-FormPage precedent used for resources with their own independent lifecycle
(Invoice line items, Purchase order items). `students/api.ts`/`useStudents.ts` gained the
link/unlink calls and hooks, importing `parents`' `StudentGuardian`/`LinkGuardianPayload` types —
the same cross-feature-import pattern Procurement already established by importing Inventory's
types. No backend bug this phase: `StudentGuardian`'s `(student, guardian)` `UniqueConstraint`
looked at first like the familiar `(school, X)`-gap, but isn't one — the link is created via
`get_or_create()` in the custom view action, never through a DRF serializer's `.is_valid()`/
`.save()`, so there's no auto-validation to be missing in the first place. One testing-methodology
note worth keeping: verifying a controlled checkbox via browser automation needed both a `click`
*and* a `change` event dispatched after setting the native `checked` property — `change` alone (the
technique that works fine for text inputs) silently failed to trigger the bound React `onChange`
in this session, even though the DOM's own `checked` property read back `true` immediately after;
this looked like a real bug in the linking flow until re-tested with both events dispatched, at
which point `is_primary`/`is_emergency_contact` came through correctly every time.

**Phase 38 is Audit — the first fully read-only feature built in this project.** `AuditLog` rows
are append-only at the model level itself (`save()` raises if the row already exists, `delete()`
always raises), and the API (`apps.audit`) only exposes `list`/`retrieve` — there is no
create/update/delete anywhere to build a form against, so `frontend/src/features/audit/` has no
form pages at all, just `AuditLogsListPage` and `AuditLogDetailPage`. The list page's filters are
deliberately asymmetric: `severity` is a hardcoded 3-value `Select` (`info`/`warning`/`critical`,
a real stable enum, safe to hardcode), but there's **no `action`/`entity_type` dropdown at all** —
`action` is genuinely free-text on the backend (dot-separated strings like `auth.login_success`,
`platform.school_created`, `results.corrected`, new ones appearing as new features log new
actions, no backend endpoint to fetch the distinct values dynamically either), so a hardcoded
dropdown would go stale immediately; the search box already fuzzy-matches `action`/`actor_email`/
`entity_type`/`entity_id` server-side, which covers the same need honestly instead of a
worse-than-nothing enumerated list. The detail page renders `before`/`after`/`metadata` as
formatted monospace JSON blocks, each only when non-empty (`null`/`{}` renders nothing) — these
three fields vary in shape across every different `action` value, so there's no fixed-column
inline table cell that could ever fit them, unlike the flat scalar fields (actor, IP, entity
type/id) shown in a normal field grid above them. No backend bug this phase — append-only
enforcement, tenant-scoping (a school user sees only their own school's rows; a platform admin
sees every school's via `AuditLog.objects.all()`), and permission gating (`audit.view`, only
`principal`/`school-administrator` by default — notably **not** `it-administrator`, confirmed by
research despite being the role you'd intuitively expect to have it) were all already correct.
Verified live against 88 real, already-existing audit rows accumulated from every prior phase's own
testing in this same session (logins, password changes, guardian link/unlink, a payment refund, a
result correction) — nothing fabricated, and nothing needed cleanup afterward since the feature
never writes anything. Not built: a `/platform/audit` route for platform admins to browse
cross-tenant entries — the same endpoint already supports it (`AuditLog.objects.all()` for platform
admins), and the components are plain and shell-agnostic, so adding that route would be
straightforward later, but it wasn't asked for and would need its own verification pass as a
platform admin.

**Phase 39 is Notifications — the first feature mounted in every shell instead of living behind
one shell's sidebar.** Unlike every prior module in the user's requested build order, this isn't a
school-scoped domain page: it's a self-service widget (`NotificationBell`, a topbar dropdown
matching `UserMenu`'s click-to-open pattern) plus one full page (`NotificationsListPage`, mounted at
`/notifications` inside the shared `AccountLayout`, next to `/settings`), both needed identically by
a school user and a platform admin. `useUnreadCount` polls independently every 30s
(`refetchInterval`) so the badge stays current without the dropdown being open, while the
dropdown's own preview list only fetches while `isOpen` (no point polling content nobody's viewing).
The list page's filters are `is_read` and `priority` (a small stable enum, safely hardcoded) —
**no `category` filter**, and unlike Audit's `action` field (Phase 38) there's no fuzzy-search
fallback to lean on either, since this endpoint never got `search_fields` wired up server-side; the
filter was omitted rather than shipped inert. A real backend constraint surfaced during live
verification: `Notification.school` is a required FK, confirmed by hitting an `IntegrityError` when
attempting to create a notification for a platform admin (who has no `school`) — meaning platform
admins can never actually receive a `Notification` row today. This was verified as a genuine empty
state ("You're all caught up.") in `PlatformShell` rather than worked around, and flagged as a
backend gap (nullable `school`, or a separate model) rather than fixed, since nothing in this
phase's scope needed it fixed. Test notifications for the school-user walkthrough were created
directly via `Notification.unscoped_objects.create(...)` (the tenant-scoped default manager returns
nothing outside request context, which also meant cleanup needed the same `unscoped_objects`
manager) and deleted immediately after; no backend code changed.

**Phase 40 is Reports — the sixth and final module of the original user-requested list, and purely
a read/aggregation layer.** `apps/reports` has no models at all; every endpoint (`enrollment/`,
`attendance/`, `academic-performance/`, `finance/`, plus the pre-existing `dashboard/` already
powering `DashboardPage`) computes its response on the fly from other apps' tables via Django
aggregation. `frontend/src/features/reports/` mirrors that shape: four pages, each one query hook
plus an optional filter, no forms, no mutations. Each report endpoint doubles as a CSV export via
`?export=csv` (deliberately not `?format=csv`, to avoid colliding with DRF's own content-negotiation
query param) — the frontend's `downloadReportCsv()` fetches it with `responseType: "blob"` and
triggers a real browser download via a temporary `<a download>` element, the first place in this
frontend that needed to turn an API response into a file download rather than rendered UI.

**Phase 41 (in progress) is a large, explicitly multi-phase batch** — school branding, a full-width
layout sweep, sidebar `Settings`/`Notifications` entries, a shared `Avatar` component, real
per-user presence, photo uploads on every user-representing model, default passwords + admin
reset-to-default, a charted dashboard, a platform-admin "view this school's data" mode, and two
brand-new modules (Events, Complaints) — planned once via plan mode as phases A through H (see
`docs/IMPLEMENTATION_STATUS.md`'s "Current phase" section and the plan file it references) and
executed one phase at a time, each getting the same research → build → verify → document cycle as
every single-module phase before it. **Phase A** (branding/layout/nav/`Avatar`, complete) is
notable for one architectural choice: the actual source of every Form/Detail page's unwanted
centering turned out to be a `mx-auto max-w-{lg|2xl}` wrapper div copy-pasted into each page's own
top-level JSX — never the shells themselves, which were already full-width (`flex-1`, no cap) — so
the fix was a single mechanical `sed` sweep across 74 files rather than a shell-level redesign.
`Avatar` (`frontend/src/components/ui/Avatar.tsx`) is the first shared avatar component in the
project — extracted from a pattern that had already been silently copy-pasted differently in two
places (`UserMenu`'s initials-on-gradient vs. `StudentsListPage`'s icon-on-neutral), unified behind
one component that picks the right fallback based on whether a `name` is available, and built with
an `isOnline` prop now (rendering nothing until Phase B supplies real presence data) so Phase B
doesn't need to touch every call site again later.

**Phase C added photo uploads to every user-representing model that lacked one** — `Guardian.photo`
is a genuine new `FileField` (a guardian often has no linked `User` at all, so it can't just
delegate like Staff does), while `Staff` got a read-only Python `@property` (`Staff.photo`
returning `self.user.photo`) plus a separate write-only `photo_upload` field on `StaffSerializer`.
The two-field split exists because `source="user.photo"` (a dotted source pointing through the
existing `user` FK field) would collide with that same serializer's own already-declared `user`
field name during `to_internal_value()`, and writable dotted-source fields aren't safely handled by
a plain `ModelSerializer.update()` regardless — so `StaffSerializer.save()` is overridden to pop
`photo_upload` out of `validated_data` and assign it onto `instance.user.photo` explicitly, after
the normal save completes. The frontend hides this asymmetry: `staff/api.ts`'s `toRequestBody()`
still accepts a `photo` key in `StaffPayload` (matching every other feature's convention) and
renames it to `photo_upload` only when building the `FormData`.

**Phase B added real per-user presence** — `User.last_seen_at` plus a computed `User.is_online`
property (`apps/users/models.py`, a 2-minute `ONLINE_WINDOW` constant defined right next to it) and
a single-purpose `POST /api/v1/auth/heartbeat/` endpoint that does nothing but bump that timestamp
for `request.user`, deliberately not tenant-scoped or audit-logged since it's a liveness signal,
not a domain action. The frontend's `useHeartbeat(enabled)` (`features/auth/useAuth.ts`) mounts
once in `ProtectedRoute.tsx`, pings every 60s, and swallows every error — a missed heartbeat should
never surface as a user-facing failure. `is_online` reaches the frontend via a plain `source=
"user.is_online"` dotted field on `StaffSerializer`, which is safe specifically *because* it's
read-only — contrast with Phase C's `Staff.photo`/`photo_upload` split, where a dotted source
wasn't usable for the write side because it would have collided with the serializer's own already-
declared `user` field name during `to_internal_value()`. `Guardian` was deliberately left without a
presence dot: most guardians have no linked `User` at all (no session to have a presence state),
and `GuardianSerializer` doesn't surface linked-user info the way `StaffSerializer` does.

**Phase D replaced the unusable-password/email-invite-link flow with a deterministic default
password, but only for school-scoped users.** `apps.tenants.services.generate_default_password
(school)` derives `<INITIALS>@<creation year>` from the school itself (never an individual user's
own invite date — the only way a later "reset to default" can mean one unambiguous value).
`apps.users.services.invite_user()` branches on `user_type`: a school user is now created
`is_active=True` with that password set directly (no email sent at all — the format is
deterministic and derivable from public information, so there's nothing secret to transmit, and a
plaintext password in email is worth avoiding even for a weak "secret"); a platform admin invite
is completely untouched, since there's no school to derive a value from and platform admins are a
much smaller, more trusted set. `create_school()`'s initial admin flows through the same
school-user path, gated as before by the school's own separate `pending`/`active` status (a
default password doesn't bypass that — confirmed live: login attempts fail with the existing
"school not active" 403 until a platform admin activates the school). A new
`users.reset_password` permission gates a `POST .../reset-password/` action added to both
`StaffViewSet` and `GuardianViewSet` (the latter 400s with `NO_ACCOUNT` when the guardian has no
linked `user`, which is the common case) that simply recomputes and re-sets the same value —
audit-logged, and returned in the response so the admin performing the reset can relay it.

Two operational gotchas surfaced building this, both worth remembering for any future new
permission code: (1) a DRF `@action` method with an underscore in its name (`reset_password`)
produces an underscored URL (`/reset_password/`) unless `url_path="reset-password"` is passed
explicitly — `NotificationViewSet`'s `mark_read`/`mark_all_read` already do this correctly and
would have been the pattern to check first; (2) a brand-new `PERMISSION_CATALOG` entry isn't
actually usable until `python manage.py seed_permissions` (syncs the Python list into the DB's
`Permission` table — this seeding is snapshotted, not derived live from code) and `python manage.py
resync_role_permissions` (re-grants it to every *existing* school's system roles, since a school's
roles are only granted from the catalog at that school's own creation time) are both run — both
commands already existed in this codebase for exactly this situation.

**Phase E is the first place `recharts` (an installed, previously-unused dependency) is actually
used**, and needed no new backend endpoints — it reuses the four Reports endpoints (Phase 40)
directly from `DashboardPage.tsx`. The one new shared pattern is `frontend/src/features/dashboard/
charts/ChartCard.tsx`: a fixed-height (`h-64`) `Card` wrapper, because recharts'
`ResponsiveContainer` measures its parent's actual rendered pixel size on mount and renders nothing
against an unsized or intrinsically-sized ancestor. Every chart's colors reference the theme's CSS
custom properties directly as SVG presentation-attribute values (`fill="var(--color-primary)"`) —
confirmed live to render and re-theme correctly, extending the project's "never a hardcoded palette
class" convention into SVG for the first time. Each chart's underlying report query is gated behind
`useHasPermission("reports.view")`, the same permission the Reports sidebar entry itself requires —
necessary because the Dashboard (unlike Reports) is visible to virtually every logged-in role, so
an ungated call would 403 for anyone without it on every single page load.

**Phase F gave platform admins a "view this school's data" mode — a genuine browse-as-that-school
experience across every module, not just the Schools/Platform-admin management console they had
before.** The mechanism is a single request header, `X-Acting-School`
(`apps.tenants.mixins.ACTING_SCHOOL_HEADER`), honored **only** when `TenantContextMixin` sees
`request.user.is_platform_admin` — for any other request the header is never even inspected, so a
school user cannot use it to escalate into another tenant (confirmed live: a spoofed header from a
real school user's own session is silently ignored). When present and a valid UUID, it becomes the
request's `current_school_id`, exactly as if that were the platform admin's own school.

Two precedence/plumbing bugs had to be fixed for this to actually work, both found by reasoning
through the existing architecture before writing any new code (not discovered live):
1. `TenantManager.get_queryset()` (`apps/tenants/managers.py`) used to check
   `is_platform_admin_context()` *before* looking at `current_school_id` at all, unconditionally
   returning every row across every tenant for a platform admin regardless of any school in
   context — which would have made the acting-school header a no-op for every read. The check
   order is now: a `school_id` in context (from a real school user *or* a platform admin's
   acting-school header) always wins; only a platform admin with *no* acting school set falls
   through to the fully-unscoped Platform-console behavior that already existed.
2. `TenantScopedModelViewSet.perform_create()` (`apps/common/views.py`) used to read
   `self.request.user.school` directly to populate the new row's `school` FK — always `None` for a
   platform admin, which would have thrown an `IntegrityError` on every generic create while
   acting as a school. Now reads a new `apps.tenants.services.get_current_school()` helper (resolves
   `get_current_school_id()` into a real `School` instance) instead — behaviorally identical to the
   old code for every existing school-user flow, since `get_current_school_id()` already equals
   `request.user.school_id` for them.

Fixing the base class alone was not enough. A repo-wide grep for the literal string
`request.user.school` **after** making that base-class fix turned up the same bug independently
reimplemented in every domain app's own bespoke `perform_create`/custom-`@action` overrides —
`assignments`, `attendance`, `users`, `examinations`, `parents`, `documents`, `discipline`,
`communications`, `inventory`, `students`, `finance`, `staff`, `procurement`, and all four
`apps/reports` endpoints (the Dashboard included — found live as an all-zero-stats Dashboard while
"viewing" a school with real data, before the grep-driven fix). All of them were switched to
`get_current_school()` the same way. Two occurrences were deliberately left alone —
`LogoutView`'s audit-log attribution and `SchoolSelfView` — because both are genuinely about the
authenticated account's own identity/self-service profile, where `request.user.school` is the
*correct* value, not a bug.

On the frontend, `frontend/src/lib/actingSchool.ts` stores the acting school in `localStorage` plus
fires a same-tab custom event (native `storage` events don't fire in the tab that made the change),
and `frontend/src/hooks/useActingSchool.ts` wraps it with `useSyncExternalStore` for reactive
consumers (the shell's redirect guard, the exit banner). The first version's `getSnapshot`
(`getActingSchool()`) re-parsed a new object out of `localStorage` on every call — not
referentially stable across calls with unchanged data, which `useSyncExternalStore` requires —
producing an infinite render loop the moment the banner mounted; fixed by caching the parsed value
and only re-parsing when the raw stored string changes.

**Phase G is Events, the first of the two brand-new modules (Events, Complaints) the user asked
for.** `apps/events` reuses `apps/communications`'s audience-targeting shape byte-for-byte (same
`TargetType` enum, same same-school `save()` validation, the same `AnnouncementRecipient`-shaped
`EventRecipient` join table for `specific_users` targeting) — "who does this reach" is the same
question for an announcement and an event, so it wasn't reinvented. What's genuinely new is actual
RSVP tracking: `EventRegistration` is a **separate model** from `EventRecipient`, not a reuse of it
— one is "who gets notified an event exists" (only populated for `specific_users` targeting, never
read at attendance time), the other is "who has actually signed up to attend" (always populated by
the `register` action, checked against `capacity`, surfaced as `Event.registered_count`). Conflating
them would have made every notified person look like an attendee, or forced capacity/attendance
logic to filter a table that mixes two different meanings.

`EventViewSet`'s `register`/`cancel-registration` actions operate on `request.user` implicitly (the
viewer registers *themselves*, there's no "register an arbitrary user" endpoint), gated by a new
`events.register` permission distinct from `events.view`/`.create` — an `accountant`, for instance,
gets `events.view`+`events.register` but not `events.create`/`.update` (can see the calendar and
attend a staff meeting, can't manage it), while `teacher`/`registrar` get the full `events.` prefix.
`register` returns clean `ALREADY_REGISTERED`/`EVENT_FULL`/`NOT_PUBLISHED` error codes rather than
relying on the DB's unique constraint to reject a duplicate with a raw 500.

The app's URLs are mounted bare at `api/v1/` (`path("api/v1/", include("apps.events.urls"))`,
matching `apps/assignments`) with both resources explicitly named at the router
(`router.register("events", ...)`, `router.register("event-recipients", ...)`) — deliberately
**not** the `router.register("", EventViewSet, ...)` shape `apps/students` uses for its single
dominant resource, since mixing a `""`-registered resource with a differently-named sibling
resource under the same router risks the sibling's static path segment being swallowed by the first
resource's `{pk}` detail route (DRF's default lookup regex isn't restricted to UUID shape, so
literally anything non-slash matches). Caught by reasoning through the routing before writing the
URLs, not discovered live.

**`school` never being a serializer field (consistent everywhere in this backend — it's always
set server-side in `perform_create`, never client-writable) has a sharp edge worth remembering**:
DRF's `ModelSerializer` only auto-generates a unique-together validator for a `Meta.constraints`
entry when *every* field in that constraint is present on the serializer. Since `school` never is,
any `(school, X)`-only `UniqueConstraint` — `Room`/`Period`'s name fields, for instance — gets no
automatic validation at all, and a duplicate submission crashes with a raw `IntegrityError` (500)
instead of a clean 400. Found live while testing Timetable's Period form; fixed there with explicit
`validate_name`/`validate_order` methods (see `apps/timetable/serializers.py`). The same gap likely
affects `apps/academics/serializers.py`'s `AcademicYear`/`Department`/`Subject`/`SchoolClass` (their
`Term`/`Section` siblings' multi-field constraints probably auto-validate correctly, since every
field in *those* constraints is a serializer field) — flagged as a follow-up audit rather than
fixed opportunistically here, since it spans an already-shipped domain outside this phase's scope.

**Phase H is Complaints, the second and final brand-new module (Events, Complaints) the user asked
for, and it closes out the entire Phase A–H batch.** `apps/complaints` reuses `apps/assignments`'s
`MyAssignmentsView` self-service pattern rather than inventing an RBAC-gated one: this system's
seeded role catalog (`apps/authorization/catalog.py::DEFAULT_ROLE_PERMISSION_PREFIXES`) has no
student/parent role at all, so a submitter's own-records access is achieved purely through DRF's
default `IsAuthenticated` plus `ComplaintViewSet.get_queryset()` filtering to
`submitted_by=request.user` for non-`complaints.view` holders — the same viewset serves both a
submitter's own-only list and staff's full-school list by branching in one `get_queryset()`, not two
parallel views.

`is_anonymous` is a **soft** anonymity flag, not a data-suppression one: `Complaint.submitted_by` is
always the real submitter (never null), and masking happens only at serialization time —
`ComplaintSerializer.get_submitted_by`/`get_submitted_by_name` return `None` for every viewer except
the submitter themselves, including staff with `complaints.manage`. This was a deliberate choice
over nulling the FK: nulling would make an anonymous complaint untraceable even for legitimate
moderation (e.g. detecting abuse of the anonymous option), while a serializer-level mask keeps the
data intact but genuinely hides identity from every response the frontend ever sees.

`ComplaintResponse` is a flat reply thread (complaint FK, author, message, timestamp) with no
read/unread tracking — the same shape Events' notification model doesn't need but Complaints does
for a different reason: a two-way conversation between one submitter and any staff member who picks
it up, not a broadcast. `ComplaintResponseViewSet.perform_create` checks object-level access the same
way `ComplaintViewSet.get_queryset` does (submitter-of-parent-complaint or `complaints.manage`
holder) rather than relying on a queryset filter, since a response's own `get_queryset` can't easily
express "any response on a complaint I'm allowed to see."

URLs follow the same bare-`api/v1/`-mount, fully-named-router-registration shape Phase G established
for exactly this reason (`router.register("complaints", ...)`, `router.register(
"complaint-responses", ...)`) — applied here from the start rather than re-derived, since the
DRF routing collision risk documented in Phase G's paragraph above applies identically to any new
module with a main resource plus a named sibling.

**Phase 42 is a second large batch requested after Phase 41 closed out the original module list**,
planned as phases I–T. **Phase I built the app's first modal/dialog primitive**,
`ConfirmDialog`/`useConfirm()` (`frontend/src/components/ui/ConfirmDialog.tsx`) — deliberately
mirroring `ToastProvider`/`useToast`'s exact context+provider shape rather than inventing a new
pattern, since the two are structurally identical (one in-flight item, `AnimatePresence`
fade/scale). Every one of the app's 63 `window.confirm()` call sites across 58 files was migrated to
it — done by fanning the work out to four parallel background agents, each given an explicit,
mechanical transformation spec (split the existing "Question? Detail." message on the first `"? "`
into `title`/`description`, make the enclosing handler `async`, await the new `confirm()`) and
required to self-verify with `tsc --noEmit` before reporting back, then a final full-project
`tsc`/`oxlint`/grep pass confirmed nothing was missed. The same phase fixed a real (not just
cosmetic) overflow bug in `StatCard`: its text column had `min-w-0` but was missing both `truncate`
on the label/value/footnote text **and** `flex-1` on the wrapping div — without `flex-1` a flex item
never grows to fill the row, so `truncate` had nothing to actually clip against, meaning the
original "fix" would have been a no-op without both changes together.

**Phase J added a Transcript module without a new model** — `Result` (`apps/examinations/models.py`)
already carried the full `draft→submitted→reviewed→approved→published→locked` workflow from an
earlier phase, so this phase only needed a new read path. `MyTranscriptView` reuses the
self-service-without-RBAC convention established by `MyAssignmentsView` (key off
`request.user.student_profile`, no permission gate — this system's seeded role catalog still has no
student/parent role), returning only `PUBLISHED`/`LOCKED` results grouped by term, with the school's
own name/logo embedded via the existing `SchoolSummarySerializer` so the page is visibly
that school's transcript. A new `exams-director` role (prefixes `results.`/`examinations.`) gives
literal meaning to "published by the exams director" as a delegable persona distinct from
`principal`/`school-administrator`'s blanket access — added with **no data migration**, since
`seed_default_roles_for_school()`'s `update_or_create`-per-slug shape means the existing
`resync_role_permissions` management command (already run after every new-permission-code phase)
creates a brand new role for every existing school just as readily as it grants a new permission
code to an existing one. The one new URL, `transcript/me/`, is listed as a static `path()` **before**
`ResultViewSet`'s bare `""`-registered router entries in `apps/examinations/urls.py` specifically so
it always matches first — the same DRF routing-collision risk documented in Phase G's paragraph
above, addressed here by ordering rather than by renaming the resource.

**Phase K added an Education module for lesson notes, choosing `Assignment`'s full targeting shape
over a narrower one considered during planning.** The plan initially floated `Lesson` having just
`subject` + a nullable `section` with no class scope at all, leaving "section is null" ambiguous
(whole school? whole class-independent-of-section?). At build time this was resolved by adopting
`Assignment`'s exact shape instead — `subject` and `school_class` both required, `section` nullable
narrowing within that class — since it's a proven, unambiguous pattern already used identically
elsewhere, and `MyLessonsView`'s self-service resolution (`request.user.student_profile`, no RBAC
gate, same as `MyAssignmentsView`) reads directly off `current_class_id`/`current_section_id` the
same way `MyAssignmentsView` already does, rather than needing a new join through Timetable.

**A single `FileField` can't conditionally switch its own validators, so `LessonMaterial.file` has
none at the model layer — validation happens in `LessonMaterialSerializer.validate()`**, which reads
the sibling `material_type` field and picks `validate_upload_file` (documents) or the new
`validate_video_file` (extensions `.mp4/.mov/.webm/.avi`, `MAX_VIDEO_SIZE_BYTES = 200MB` — the
user's explicit choice of direct upload over an external video link) accordingly. The new validator
was deliberately named generically rather than `validate_lesson_video_file`, anticipating Phase M's
Event media reusing it for exactly the same reason.

**Phase L integrated a third-party video SDK (Daily.co) rather than building custom WebRTC
signaling, per the user's explicit choice** — this codebase has no Django Channels/ASGI-websocket
infrastructure at all (confirmed by research before building), and standing up our own
signaling-plus-TURN stack would have been the single largest, least-reused-pattern undertaking in
this entire batch. `apps/live_sessions/daily_client.py::create_room()` is the integration surface,
built to the exact same external-dependency contract `apps.common.email.send_email` already
established for Brevo: a plain function that returns `None` (never raises) when the API key is
unset or the call fails, so a school that hasn't configured Daily.co simply gets a clean
`503 FEATURE_NOT_CONFIGURED` from the `start` action instead of anything breaking. This was
deliberately verified live in an environment with no `DAILY_API_KEY` set — scheduling a session,
listing it, and clicking Start all worked, with `start` failing cleanly and the session correctly
staying in `scheduled` status — proving the degrade-gracefully path actually works, not just that
it compiles. `LiveSession` reuses `Lesson`/`Assignment`'s exact `subject`/`school_class`/nullable-
`section` targeting shape (with an added optional `lesson` FK, since a live session is conceptually
tied to a lesson but doesn't require one), and `apps/live_sessions/services.py`'s audience
resolution is the same `_class_student_users` helper shape already duplicated once for Education —
a third near-identical copy, accepted as the pragmatic choice over extracting a shared helper this
late in the batch, since each copy differs slightly (Education has no urgency/priority concept,
Live Sessions notifies at `priority="high"` since "the call is live right now" is time-sensitive in
a way "new material was posted" isn't).

**Phase M's `EventMedia` reuses the exact media-type-branched-in-the-serializer validator pattern
Phase K established for `LessonMaterial`**, right down to the same subtlety: `file` carries no
`validators=` at the model-field level, because DRF's `ModelSerializer` auto-generates a serializer
field per model field and copies over any model-level `validators=` unconditionally — declaring
`validate_image_file` on the field itself would have silently applied image-only rules to video
uploads too. Both models instead branch on a sibling `material_type`/`media_type` field inside
`Meta`'s serializer `validate()` override. Upload/delete authorization for the gallery deliberately
reuses the Event's own `events.update`/`events.view` codes rather than minting new ones — a gallery
is part of the event, not a separately-permissioned resource, so whoever can already edit an event
can curate its photos, and whoever can already view it sees them.

**Phase N's `Complaint.addressed_to` needed a narrower staff directory than the one that already
existed, not the existing one loosened.** `/staff/` requires `staff.view`, which a plain student
submitting a complaint never has (there is still no student/parent role in this system's RBAC
catalog) — reusing it for the submission form's picker would have 403'd the exact users the feature
serves. `AddressableStaffView` exposes only `id`+`name` for active staff, gated by nothing beyond
authentication, mounted as a static path ahead of `ComplaintViewSet`'s router entries for the same
routing-collision reason documented since Phase G. **A real permission gap was found only by
testing the addressee's path live, not by reading the code**: `ComplaintResponseViewSet` recognized
`submitted_by` and `complaints.manage` as the two parties allowed to see/post in a complaint's
thread, but not `addressed_to` — so a complaint could be addressed to someone who then couldn't
reply to it. The bug was nearly missed a different way: the first live-verification attempt "as the
addressee" was actually still authenticated as the submitter (a session that looked logged-in but
had silently reverted), which would have made the broken path appear to work. Checking `/auth/me/`
mid-test caught the false pass before it was reported, and the real fix (`is_addressee` added
alongside the two existing checks in both `get_queryset` and `perform_create`) was verified for real
afterward — a concrete instance of why this session's live-verification discipline checks *who is
actually authenticated*, not just that a page loaded.

**The pre-existing `nina.nightingale@demoacademy.test` seeded test account has `is_active=False`
from earlier in this session** (unrelated to any Phase 42 work) — surfaced only because this
phase's live test needed a second staff account without `complaints.manage`; restored to its
original inactive state after testing rather than left flipped on as a side effect of unrelated
verification.

**Phase O deliberately keeps the branded-login slug presentation-only, never touching the actual
authentication contract** — `LoginView` still authenticates by email+password alone, globally, with
no per-school scoping at the auth boundary (email is unique platform-wide, per this session's
earlier research). Two new endpoints (`SchoolBrandingLookupView`, `SchoolSearchView`) are the only
completely unauthenticated, publicly-reachable-by-slug surface in the entire backend, so their
serializers (`SchoolBrandingSerializer`/`SchoolSearchResultSerializer`) are deliberately minimal —
`name`/`slug`/`logo`/`logo_url` only, modeled as their own dedicated serializers rather than reusing
`SchoolSelfSerializer` precisely so a future field added to that richer serializer (for an
authenticated audience) can never silently leak onto this unauthenticated one. The branding lookup
404s for a non-`active` school rather than differentiating "doesn't exist" from "suspended/pending"
— telling an anonymous caller a specific school is suspended is itself information disclosure.
`LoginForm.tsx` was extracted from the pre-existing generic `LoginPage.tsx` specifically so the new
`BrandedLoginPage.tsx` shares the exact same auth logic rather than a parallel copy that could drift.

**Phase P's Dashboard module panel reads `NAV_CONFIG` from its own dedicated module, not from
`AppShell.tsx` directly** — `frontend/src/layouts/navConfig.ts` was split out specifically to avoid
mixing a plain data export with a component export in one file, which trips oxlint's
`react(only-export-components)` rule (breaks Vite's Fast Refresh, since it can no longer tell
whether reloading the file should remount a component or just update a constant). Both `AppShell.tsx`
and `DashboardPage.tsx` import the identical `NAV_CONFIG`, so the sidebar and the dashboard panel are
structurally incapable of drifting apart — there's only one array, not two kept in sync by
discipline. Verified live with two roles specifically to prove the filter is real: the principal
(blanket access) saw every module, while the accountant (a handful of narrow permission prefixes)
saw a correctly narrowed subset that lined up exactly with `DEFAULT_ROLE_PERMISSION_PREFIXES
["accountant"]` in the backend catalog — a static list that merely *looked* complete would have
passed a principal-only check just as easily. Separately reconfirmed (not a Phase P regression):
`DashboardOverviewView` extends `_ReportView`, whose `get_permissions()` requires `reports.view` for
every request, including the dashboard's own core stats — a role like `teacher` with no `reports.`
prefix at all cannot open the dashboard page in the first place, a pre-existing condition from
whichever earlier phase built `DashboardOverviewView` this way, not something introduced here.

**Phase Q's summary-stat rollout is deliberately declarative, not 60 bespoke implementations** —
`SummaryStatsMixin` (`apps/common/views.py`) is mixed into both `TenantScopedModelViewSet` and
`TenantScopedReadOnlyViewSet`, so every domain ViewSet already inherits it; opting in is a one-line
`summary_stats = {"total": {}, "active": {"is_active": True}, "by_status": {"groupby": "status"}}`
class attribute, not a method to override. The generated `GET .../summary/` action reuses
`self.filter_queryset(self.get_queryset())` — the exact same search/filter params the paired list
query already applied — so a filtered list's stat row reflects the filter, not the whole table, and
a `groupby` entry runs one `Count`-annotated aggregate query rather than N separate counts. No new
permission codes were needed anywhere: an unlisted action (`summary`) falls through to whatever each
ViewSet's `get_permissions()` already does for it, and every ViewSet in this codebase already
defaults an unrecognized action to its `view` code. The frontend mirrors this with one hook
(`useSummaryStats(resource, filterParams)`) and one component (`<StatRow items={[...]} />`, built on
the overflow-safe `StatCard` from Phase I) — every one of the 60 `*ListPage.tsx` files wires the same
three pieces (`filterParams` object shared with the list query, a `<StatRow>` wrapped in
`<ScrollReveal>` after the header, and the existing `<TableContainer>` wrapped in its own
`<ScrollReveal>`), which is what let this land as a mechanical per-file diff instead of a redesign.
Two files (`AnnouncementsListPage.tsx`, `ExamSchedulesListPage.tsx`) were left with the imports added
but never wired into JSX by a background agent that died mid-edit; this surfaced as `oxlint`
`no-unused-vars` warnings during the final verification pass rather than during development, which
is why the phase's final check explicitly greps every list page for both the import **and** an
actual `useSummaryStats(`/`<ScrollReveal>` usage, not just the import's presence.

**The brand theme is a fixed set of CSS custom properties, not per-component color choices** —
`--color-primary`/`--color-accent` (blue/cyan, matched to the NTS logo) and
`--gradient-primary`/`--gradient-danger`/`--gradient-page` in `index.css`, both light and dark
variants. `Button`'s `primary`/`danger` variants paint with the gradient tokens and a matching
hover glow (`color-mix(in srgb, var(--color-primary) 65%, transparent)`); `secondary`/`ghost` stay
flat on purpose — a gradient belongs on the controls meant to draw the eye, not uniformly on every
control.

**Light/dark is a user choice, not just an OS media query** — `index.css` defines the light
variant on bare `:root` and the dark variant twice: once inside `@media (prefers-color-scheme:
dark)` guarded by `:root:not([data-theme="light"])` (so the OS preference applies only when no
explicit choice has been made), and once under `:root[data-theme="dark"]` (so an explicit choice
always wins over the OS either direction). `src/hooks/useTheme.ts` is the only code that ever
writes the `data-theme` attribute — `"light"`/`"dark"` set it, `"system"` removes it entirely
(never a third literal value), and the choice persists to `localStorage` (`nts-theme`). A tiny
inline script in `index.html`'s `<head>`, run before any stylesheet, re-applies a stored choice
synchronously so there's no flash-of-wrong-theme on load — the same technique frameworks like
`next-themes` use, done directly since nothing here needed a dependency for it.
`components/ui/ThemeToggle.tsx` is the one UI entry point (a cycling icon button, `Sun`/`Moon`/
`Monitor`), mounted in both `AppShell`'s header and `AuthLayout` so the choice is available before
and after login. **`apiClient` (`src/lib/api-client.ts`) sets no default `Content-Type` header** — axios's
own request-transform logic already infers `application/json` for a plain object body and leaves a
`FormData` body untouched, but only if no Content-Type is preset; a preset JSON header makes axios
re-serialize `FormData` (including any file inside it) into a JSON string instead, silently
breaking every multipart upload. This was found by reading axios's actual `defaults/index.js`
before shipping `Student.photo` upload, not by a failing request.

**`Student.photo` is a Cloudinary-backed `FileField`** (replacing a `photo_url` `URLField` that was
never wired to a real upload path), validated by a new
`apps/common/validators.py::validate_image_file` — the same allowlist-plus-size-cap shape as
`validate_upload_file`, narrowed to actual image extensions (`.jpg/.jpeg/.png/.gif/.webp`, 5MB cap)
since a photo field should never accept a document. `StudentFormPage`'s avatar picker manages the
selected file as local component state (not a `react-hook-form` field — a native
`<input type="file">` can't be a normal controlled value), building an object-URL preview and only
switching the mutation to a `multipart/form-data` request (via a small `toRequestBody()` helper in
`students/api.ts`) when a new file was actually picked; the common case (no photo change) stays a
plain, cheaper JSON request.

**Phase R's `notify_student_guardians()` is the one cross-domain notification helper this codebase
has, deliberately** — every earlier phase that needed to reach an audience (`events.services.
resolve_recipients`, `communications.services`) rebuilt its own `StudentGuardian`/`Student` join
inline, which was fine when only one or two callers needed it. By Phase R, five domains (`medical`,
`discipline`, `hostel`, `finance`, `attendance`) all needed the exact same "find this student's
guardians with a portal account" query, which crossed the line from "acceptable duplication" to
"the same bug fixable in five places" — so it now lives once, in `apps/parents/services.py`
(the natural owning app for guardian-relationship logic), imported by every caller. It deliberately
does **not** try to become the general audience-resolution mechanism `events`/`communications`
already have — those resolve arbitrary target types (class/section/department/specific-users), this
resolves exactly one thing (a student's own family), and generalizing it further wasn't needed by
anything Phase R actually built.

**`users_with_permission()` exists alongside `user_has_permission()`, not merged into it** —
`apps/authorization/services.py`'s existing `user_has_permission(user, code)` answers "does this
*one already-known* user have this code," cached per-user per-request
(`user._permission_codes_cache`) since a single request may ask it many times for the same user.
`users_with_permission(school, code)` answers a different question — "which users in this school
have this code at all" — needed exactly once by Inventory's low-stock alert, where there's no
single record-owning user to notify and the recipient set has to be discovered fresh. It's a plain
`User.objects.filter(...role_permissions__permission__code=code).distinct()` join, not a cached
per-user lookup, and was kept as a separate function rather than reusing/generalizing the cached
one, since the two have genuinely different shapes (one user vs. a set) and different call
frequencies (once per notify-worthy event, not once per permission check in a request).

**Every Phase R notification's email-vs-in-app-only decision is per-event, not per-domain** —
mirroring `Announcement.send_email`'s existing explicit per-item opt-in rather than "email
everything" or "email nothing" at the domain level: a `routine` medical visit is in-app only but an
`incident`/`emergency` one gets email; a `minor` discipline incident is in-app only but
`moderate`/`severe` gets email; a transport assignment (routine, expected) is in-app only while a
hostel allocation (a real move-in event) gets email. The one deliberate broadcast exception is
Inventory's low-stock alert, which reuses `notify_bulk()` and therefore has no email leg at all —
`notify_bulk()`'s own docstring already documents why a blast defaults to in-app-only, and nothing
about "several staff need to restock this item" changes that reasoning.

**`Event.register` and `Result._transition()` share one concurrency-fix template, not two** — both
had the identical shape of bug (`self.get_object()` reads state once, checks it, then writes,
with no lock in between), and both are fixed identically: re-fetch the same row by its already-
validated PK via `<Model>.unscoped_objects.select_for_update().get(pk=...)` inside
`transaction.atomic()`, re-run the *same* check against the now-locked row, and only then write.
This is the fourth and fifth use of this exact template in the codebase (after
`finance.record_payment`, `library.checkout_book`, and `hostel.allocate_bed`), not a new pattern —
Phase S's job was finding the two remaining check-then-act gaps this template hadn't yet reached,
not inventing a new locking strategy. `unscoped_objects` is used in both fixes for the same reason
it's used everywhere else this template appears: `self.get_object()` (a DRF `ModelViewSet` method)
already resolved the object against the correct tenant-scoped queryset once, so re-fetching it by
its own UUID primary key a moment later needs no fresh tenant-filtering decision — it's the same
row, not a new lookup.

**Phase 43's "Your modules" dashboard cards are a pure consumption layer over Phase Q's
infrastructure, not a new backend surface** — `moduleSummaryConfig.ts` maps each permitted
`NAV_CONFIG` item to a `resource` string (the same `/{resource}/summary/` path every domain
`ViewSet` already exposes via `SummaryStatsMixin`) plus which `summary_stats` keys to surface as
headline numbers and, when the module declares a `groupby` entry, which key holds it. Each
`ModuleSummaryCard` calls `useSummaryStats(resource)` independently and renders its own small
`recharts` `PieChart` when a breakdown exists — 22 small, independently-cached, independently-
loading cards rather than one combined endpoint, which keeps every module's card working (or
loading, or simply absent for a module the viewer lacks permission for) without any one card's
fetch blocking another's, and without the backend needing a single new endpoint for this feature.
`chartTheme.ts` (`PIE_COLORS`/`TOOLTIP_STYLE`/`statusLabel`) was extracted from `DashboardCharts.tsx`
specifically so this new file could reuse the exact same palette instead of hand-copying it a third
time — the same reasoning as `apps.parents.services.notify_student_guardians` in Phase R, applied
on the frontend.

**`DashboardOverviewView` dropping its `reports.view` requirement is a permission-model
correction, not a security loosening** — the view itself was always meant to be "the current
user's own dashboard," but inherited `_ReportView`'s blanket `reports.view` gate by extending it,
which is the wrong shape for an endpoint every logged-in user needs to load their landing page.
`services.dashboard_overview(school, user)` now does the real access control per field instead of
per endpoint: each of the six headline numbers is computed and included in the response only if
`user_has_permission(user, "<domain>.view")` for that number's own domain, so a teacher's dashboard
response genuinely doesn't contain `outstanding_fees` or `low_stock_items` at all (not merely hidden
client-side) rather than every authenticated user receiving every school-wide number regardless of
role.

**The four `navConfig.ts` permission fixes (Take attendance/Enter marks/Generate invoices/Checkout)
target a category of nav item this codebase hadn't previously distinguished**: a *dedicated action
page* (its entire reason to exist is one mutating action) versus a *browsable list page with an
optional create button* (every other list page in the app). The established convention for the
latter — gate the nav link by `.view`, let the page's own `canCreate` hide the "New X" button — is
correct there, since the page is still useful read-only. It's the wrong gate for the former: a
`.view`-only visitor to "Take attendance" gets a fully-rendered but entirely inert form (every input
`disabled={!canCreate}`, the submit button not rendered at all), which is a page the sidebar
promised they could use but can't. Each of the four was re-gated by its actual backend action
permission (`attendance.create`/`results.create`/`fees.create`/`library.create`, read directly off
each view's own `_ACTION_SUFFIX`/`action_map` rather than assumed) instead of the domain's `.view`.

## Environment configuration

- `backend/.env` (gitignored) holds `DATABASE_URL` (Neon), `DJANGO_SECRET_KEY`,
  `CLOUDINARY_*`, `BREVO_*`, CORS/CSRF origins. See `backend/.env.example` for the full list.
- Frontend never receives secrets — only `VITE_*` public config if/when needed.

## Not yet implemented

Every backend domain from the master spec is built. On the frontend, the foundation exists (auth,
protected routing, app shell, design system, table/pagination/toast primitives) and nineteen full
CRUD modules are built on it — Students (Phase 17, List+Detail+Form), Academics (Phase 18,
List+Form-only for reference/config data), Staff (Phase 19, List+Detail+(two-component)Form),
Timetable (Phase 20, List+Form for Room/Period plus a purpose-built weekly grid for
TimetableEntry), Attendance (Phase 21, a bulk "take attendance" screen plus records/stats, and a
separate simpler Staff attendance List+Form), Examinations (Phase 22, nested master-detail config,
a bulk marks-entry screen, a Result status-machine workflow, and a report card), Finance (Phase 23,
nested master-detail fee config, Invoice as a rich List+Detail+(nested-array-create)Form entity,
bulk invoice generation, and payment/refund recording), Library (Phase 24, nested master-detail
book copies, a Checkout bulk-action screen, loans with renew/return, reservations with
fulfill/cancel, all under a single `library.*` permission prefix), Transport (Phase 25, nested
master-detail stops and maintenance records, a cascading Route→Stop student-assignment picker,
create+delete-only assignments with no edit form), Hostel (Phase 26, a three-level nested
master-detail chain — Bed under Room under Hostel — a cascading Hostel→Room→Bed allocation picker,
create+check-out-only allocations with no edit or delete at all), Medical (Phase 27, two flat
unrelated resources with no nesting and no backend fix needed at all), Discipline (Phase 28, a
single flat resource with no tab layout, no Detail page, and no backend fix needed),
Communications (Phase 29, audience-targeted announcements with a `publish` action and nested
specific-user recipients), Assignments (Phase 30, teacher-authored homework with graded
submissions, admin/teacher side only, a real backend crash fix, and a correction to Phase 29's
form-population fix), Documents (Phase 31, school/student/staff files with categories and a
three-way exclusive owner_type, admin/staff side only, plus the finally-correct root-cause fix for
the field-population bug misdiagnosed in Phases 29 and 30), and Inventory + Procurement (Phase 33,
stock items with an append-only movement ledger, and suppliers/purchase requests/purchase orders
each with their own status lifecycle, built together since receiving an order writes into the
inventory ledger; four backend uniqueness-gap fixes and two new frontend bugs found and fixed
during its own live verification), Parents (Phase 37, `Guardian` contact records — the backend
model's real name, not "Parent" — plus linking them to students from the Student Detail page, since
that's where the backend's own linking action lives), and Audit (Phase 38, a fully read-only
audit-trail viewer — list/detail only, no forms, since the backend API itself exposes nothing else)
— a fuller Reports UI is the only item left from the master spec's domain list. (Phase 32 added no
new domain — it was a sidebar navigation
overhaul: collapsible dropdowns for every module with an in-page tab bar, plus an
independently-scrolling sidebar nav. Phase 34 added no new domain either — it removed those
now-redundant in-page tab bars, simplified the theme toggle to light/dark only, added a topbar
`UserMenu` and a self-service Settings page, and added `User.photo`/self-update/roles-on-`/auth/me/`
to the backend to support them. Phase 35 added no new domain either — tighter page margins, an
application footer, and the `min-h-screen`→`h-screen` app-shell fix described in this file's Phase
35 section.) **The platform-admin console flagged as a candidate in Phase 34 is now partly built**:
Phase 36 shipped Schools (tenant CRUD, activate/suspend) and Platform (admin account management +
stats) behind a new `PlatformShell`, described in full in this file's Phase 36 section — these are
intentionally not counted in the nineteen above, since they're platform-admin tooling, not a
school-scoped domain from the master spec's original list. **Phase 39 shipped Notifications** (a
topbar `NotificationBell` widget plus a `/notifications` list page, described in full in this
file's Phase 39 section) — also not counted in the nineteen above, since it's a shared self-service
feature like Settings, not a school-scoped domain module. **Phase 40 shipped Reports** (four
read-only aggregate pages plus CSV export, described in full in this file's Phase 40 section) —
this closed out every item on the master spec's original domain list. A further batch of
cross-cutting improvements and two brand-new modules (Events, Complaints) shipped as Phase 41,
planned and executed as phases A–H — school branding/full-width layout/sidebar nav/shared `Avatar`
(A), photo uploads everywhere (C), real per-user presence (B), default passwords + admin reset (D),
a charted dashboard (E), a platform-admin "view this school's data" mode (F), Events (G), and
Complaints (H) — all now complete. A second large batch is now underway as **Phase 42**, planned and
being executed as phases I–T — shared UI foundations (I), a Transcript module (J), an Education
module (K), video calls (L), an event media gallery (M), a complaints recipient picker (N), a
branded login (O), and a dashboard module panel (P) are complete; a 60-page stat-row/scroll-reveal
rollout, a notifications sweep, and a hardening pass remain. See `docs/IMPLEMENTATION_STATUS.md`
for the full phase-by-phase record.
