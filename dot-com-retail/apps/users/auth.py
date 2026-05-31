from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from django.contrib.auth import get_user_model


class VersionedJWTAuthentication(JWTAuthentication):
    """Extend JWT auth to use per user token_version claim on access tokens."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        # Enforce token_version only for access tokens that include 'tv'
        token_version_claim = validated_token.get('tv', None)
        if token_version_claim is not None:
            User = get_user_model()
            try:
                fresh_version = User.objects.only('token_version').get(id=user.id).token_version
            except User.DoesNotExist:
                raise AuthenticationFailed('User not found', code='user_not_found')
            if int(token_version_claim) != int(fresh_version):
                raise AuthenticationFailed('Token revoked', code='token_revoked')
        return user
