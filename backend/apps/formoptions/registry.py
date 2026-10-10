"""The dropdowns that let a school add its own choices, with their built-in choices.

Importing the model enums here (rather than copying the lists) keeps one source of truth: change a
built-in choice on the model and the dropdown follows."""

from apps.complaints.models import Complaint
from apps.discipline.models import DisciplineIncident
from apps.events.models import Event

# Value reserved by the "Other" entry itself; never stored as a real choice.
OTHER_VALUE = "other"

FIELDS: dict[str, list[tuple[str, str]]] = {
    "complaints.category": list(Complaint.Category.choices),
    "events.category": list(Event.Category.choices),
    "discipline.category": list(DisciplineIncident.Category.choices),
}
