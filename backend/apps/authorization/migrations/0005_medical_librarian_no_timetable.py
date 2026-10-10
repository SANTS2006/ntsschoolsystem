from django.db import migrations

# Only teachers and students have a timetable. The Medical and Librarian roles were given the class timetable
# permissions; revoke them (a school can still grant them again from the role screen).


def revoke(apps, schema_editor):
    RolePermission = apps.get_model("authorization", "RolePermission")
    RolePermission.objects.filter(role__slug__in=["medical", "librarian"], permission__code__startswith="timetable.").delete()


class Migration(migrations.Migration):
    dependencies = [("authorization", "0004_suppressed_system_roles")]
    operations = [migrations.RunPython(revoke, migrations.RunPython.noop)]
