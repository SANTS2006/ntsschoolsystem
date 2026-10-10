"""Things a person created are theirs to change: documents, meetings and records can only be edited, deleted, cancelled
or otherwise managed by the person who uploaded/created/hosts them — holding the permission to *use* the module is not
enough to alter someone else's work."""

from rest_framework.exceptions import PermissionDenied


def is_owner(obj, user, field: str) -> bool:
    owner_id = getattr(obj, f"{field}_id", None)
    # Legacy rows with no recorded owner stay manageable by whoever holds the module's permission.
    return owner_id is None or owner_id == user.pk


class OwnerOnlyMutationsMixin:
    """For a ModelViewSet: `owner_field` names the FK to the creator; the actions in `owner_only_actions` (edit, delete
    and any extra ones such as cancel) are refused for anyone else."""

    owner_field = "created_by"
    owner_only_actions = {"update", "partial_update", "destroy"}
    owner_message = "You can only change things you created."

    def get_object(self):
        obj = super().get_object()
        if self.action in self.owner_only_actions and not is_owner(obj, self.request.user, self.owner_field):
            raise PermissionDenied(self.owner_message)
        return obj


def is_mine_flag(serializer, obj, field: str) -> bool:
    request = serializer.context.get("request")
    user = getattr(request, "user", None)
    return bool(user is not None and user.is_authenticated and is_owner(obj, user, field))
