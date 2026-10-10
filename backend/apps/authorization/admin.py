from django.contrib import admin

from .models import Permission, Role, RolePermission, UserRole


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "module")
    list_filter = ("module",)
    search_fields = ("code", "name")


class RolePermissionInline(admin.TabularInline):
    model = RolePermission
    extra = 0
    autocomplete_fields = ("permission",)


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("name", "school", "slug", "is_system", "is_active")
    list_filter = ("is_system", "is_active", "school")
    search_fields = ("name", "slug")
    inlines = [RolePermissionInline]

    def get_queryset(self, request):
        return Role.unscoped_objects.all()


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "school", "assigned_at", "assigned_by")
    list_filter = ("school", "role")
    search_fields = ("user__email", "role__name")

    def get_queryset(self, request):
        return UserRole.unscoped_objects.all()
