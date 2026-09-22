from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsReadOnly(BasePermission):
    def has_permission(self, request, view):
        return request.method in SAFE_METHODS


class IsStaff(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user.is_staff)


class IsParticipant(BasePermission):
    def has_permission(self, request, view):
        return hasattr(request.user, "participant")
