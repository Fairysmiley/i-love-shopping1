from rest_framework.permissions import BasePermission


class IsAdminWith2FA(BasePermission):
    """
    Permission class that ensures user is staff AND has 2FA enabled
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        if not request.user.is_staff:
            return False
        
        # Enforce 2FA for all admin users
        if not request.user.twofa_enabled:
            return False
        
        return True
    
    message = 'Admin access requires 2FA to be enabled. Please enable 2FA in your account settings.'
