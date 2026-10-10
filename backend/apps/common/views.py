import csv

from django.db.models import Count
from django.http import StreamingHttpResponse
from rest_framework import generics, views, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.tenants.context import get_current_school_id
from apps.tenants.mixins import TenantContextMixin


class SummaryStatsMixin:
    """
    Opt-in summary-stats endpoint for any ViewSet — declare a `summary_stats` dict, get a
    `GET .../summary/` action for free. Each entry is either a plain filter-kwargs dict (counted
    as-is) or `{"groupby": "<field>"}` (counted per distinct value of that field), e.g.:

        summary_stats = {
            "total": {},
            "active": {"is_active": True},
            "upcoming": {"start_datetime__gte": timezone.now},  # callables resolved per-request
            "by_status": {"groupby": "status"},
        }

    Deliberately declarative (a dict, not a method to override) so adding this to an existing
    ViewSet is a one-line addition, not a rewrite. Reuses `filter_queryset(get_queryset())` — the
    same search/filter params the caller already applied to the list also shape the summary, so a
    filtered list's stat row reflects the filter rather than the whole table. Permission: reuses
    whatever the ViewSet's own `get_permissions()` already does for an action it doesn't
    recognize — every ViewSet in this codebase defaults an unlisted action to its `view` code, so
    `summary` is covered automatically, no new permission codes needed anywhere.
    """

    summary_stats: dict[str, dict] = {}

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        base = self.filter_queryset(self.get_queryset())
        result = {}
        for key, spec in self.summary_stats.items():
            spec = dict(spec)
            groupby = spec.pop("groupby", None)
            resolved = {k: (v() if callable(v) else v) for k, v in spec.items()}
            scoped = base.filter(**resolved)
            if groupby:
                rows = scoped.values(groupby).annotate(count=Count("id")).order_by()
                result[key] = {str(row[groupby]): row["count"] for row in rows}
            else:
                result[key] = scoped.count()
        return Response({"success": True, "message": "", "code": "OK", "errors": [], "summary": result})


class _CsvEcho:
    """A fake "file" whose `write()` just returns what it was given, instead of buffering it —
    lets `csv.writer` drive a `StreamingHttpResponse` generator row-by-row so an export of a
    large table doesn't have to build the whole CSV in memory first (unlike `_csv_response` in
    `apps.reports.views`, which is fine only because its rows are a handful of aggregated
    summary rows, never a full table dump)."""

    def write(self, value):
        return value


class ExportMixin:
    """
    Opt-in `GET .../?export=csv` support for any ViewSet built on it — reuses the exact same
    `filter_queryset(get_queryset())` the normal `list` action already applies (so the current
    search/filter/ordering params shape the export too), but skips pagination's `max_page_size`
    cap entirely, since the whole point of an export is "everything that matches, not just one
    page of it."

    Columns default to every field on the ViewSet's own list serializer, in that serializer's
    declared order — the same denormalized `*_name` fields the UI table already shows, so the
    exported CSV reads the same as the on-screen table. Set `export_fields = [...]` on a ViewSet
    to curate/reorder/drop columns (e.g. to skip a heavy nested field) without touching its
    serializer.

    No separate permission code: exporting is "viewing in bulk," so it reuses whatever the list
    action's own permission check already requires (every ViewSet in this codebase already gates
    `list` on its `.view` code) — no new catalog entries needed for any app.
    """

    export_fields: list[str] | None = None
    export_filename: str | None = None

    def list(self, request, *args, **kwargs):
        if request.query_params.get("export") == "csv":
            return self._export_csv(request)
        return super().list(request, *args, **kwargs)

    def _export_csv(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        serializer_class = self.get_serializer_class()
        fields = self.export_fields or list(serializer_class().fields.keys())
        context = self.get_serializer_context()

        def rows():
            writer = csv.writer(_CsvEcho())
            yield writer.writerow(fields)
            for obj in queryset.iterator(chunk_size=500):
                data = serializer_class(obj, context=context).data
                yield writer.writerow(["" if data.get(f) is None else str(data.get(f)) for f in fields])

        filename = self.export_filename or f"{self.get_view_name().lower().replace(' ', '_')}.csv"
        response = StreamingHttpResponse(rows(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class TenantScopedAPIView(TenantContextMixin, views.APIView):
    """Base for plain APIViews that touch school-owned data."""

    pass


class TenantScopedGenericAPIView(TenantContextMixin, generics.GenericAPIView):
    pass


class TenantScopedViewSet(TenantContextMixin, viewsets.GenericViewSet):
    """
    Base for ViewSets over school-owned models. `queryset` should use the
    model's default (tenant-scoped) manager, e.g. `Student.objects.all()`
    — the manager already filters to the current request's school, and
    this mixin is what makes that filtering context exist in the first
    place. Never swap in `unscoped_objects` here.
    """

    pass


class TenantScopedModelViewSet(SummaryStatsMixin, ExportMixin, TenantContextMixin, viewsets.ModelViewSet):
    """
    `school` is deliberately never a client-settable serializer field on any
    tenant-scoped resource (never trust a client-supplied school id) — so
    the default `create()` has nothing to populate it with. This override
    sets it from the request's tenant context on every create, centrally,
    so every subclass gets it for free rather than each domain app needing
    to remember its own `perform_create()`.

    Deliberately reads `get_current_school_id()` (the same tenant context
    `TenantManager` scopes reads by) rather than `self.request.user.school`
    directly — for a normal school user these are always the same value,
    but a platform admin has no `.school` of their own at all, so reading
    it directly would break creates while a platform admin is "viewing" a
    school's data (see apps.tenants.mixins.ACTING_SCHOOL_HEADER) even
    though reads work correctly for that same case.

    A viewset with its own bespoke `create()` (e.g. one that also emails an
    invitation, like `SchoolViewSet`) doesn't call `perform_create()` at
    all, so this has no effect there.
    """

    def perform_create(self, serializer):
        serializer.save(school_id=get_current_school_id())


class TenantScopedReadOnlyViewSet(SummaryStatsMixin, ExportMixin, TenantContextMixin, viewsets.ReadOnlyModelViewSet):
    pass


class CreatorOnlyActionsMixin:
    """Restricts the listed actions on a single object to the person who created it, on top of the
    normal permission-code check — holding `events.update` lets you edit *your own* events, not
    everyone's. Everyone with the view permission still reads it. A row with no recorded creator
    (data from before the creator was tracked) stays open to anyone who passes the permission check,
    so nothing is orphaned. Set `creator_only_actions` and, if it isn't `created_by_id`, `creator_field`."""

    creator_only_actions: set = set()
    creator_field = "created_by_id"
    creator_only_message = "Only the person who created this can do that."

    def get_object(self):
        obj = super().get_object()
        if self.action in self.creator_only_actions:
            owner_id = getattr(obj, self.creator_field, None)
            if owner_id is not None and owner_id != self.request.user.id:
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied(self.creator_only_message)
        return obj
