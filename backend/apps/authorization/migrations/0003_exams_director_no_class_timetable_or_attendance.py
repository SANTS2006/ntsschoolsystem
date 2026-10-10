from django.db import migrations

# The Exams Director builds the EXAM timetable (exam_timetable.*) and has no attendance module: the class timetable is
# built by the school administrator / principal, and attendance is taken by teachers. A school that customised its
# Exams Director role keeps its own choices on every later sync, so this one-off revokes the old class-timetable and
# attendance permissions from that role in every school (the new exam_timetable.* and ca.manage permissions reach it
# through the normal sync). A school can still re-grant any of them from the role screen afterwards.
REVOKED_PREFIXES = ("timetable.", "staff_attendance.", "attendance.")


def revoke(apps, schema_editor):
    RolePermission = apps.get_model("authorization", "RolePermission")
    for prefix in REVOKED_PREFIXES:
        RolePermission.objects.filter(role__slug="exams-director", permission__code__startswith=prefix).delete()


class Migration(migrations.Migration):
    dependencies = [("authorization", "0002_role_customized")]
    operations = [migrations.RunPython(revoke, migrations.RunPython.noop)]
