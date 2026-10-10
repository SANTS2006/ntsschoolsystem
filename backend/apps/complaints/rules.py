from apps.authorization.services import user_has_permission


def can_act_on_complaint(user, complaint) -> bool:
    """Who gets the "Staff actions" (assign / resolve / reject) on a complaint: a staff member who
    handles complaints, who did NOT submit it themselves, and — when the complaint names a specific
    recipient — only that recipient. A complaint addressed to "anyone who handles complaints"
    (no addressee) is open to any handler other than its author."""
    if not user_has_permission(user, "complaints.manage"):
        return False
    if complaint.submitted_by_id == user.id:
        return False
    return complaint.addressed_to_id is None or complaint.addressed_to_id == user.id
