from django.contrib.auth import authenticate
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from django.contrib.auth import get_user_model
from django.db import models
from .models import CustomUser, UserProfile
import pyotp
from .recaptcha_utils import verify_recaptcha


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for user profile with address information"""
    
    class Meta:
        model = UserProfile
        fields = ('phone', 'address', 'city', 'state', 'postal_code', 'country')


class UserSerializer(serializers.ModelSerializer):
    """Serializer for user profile information"""
    profile = UserProfileSerializer(required=False)

    class Meta:
        model = CustomUser
        fields = ('id', 'username', 'email', 'is_active', 'is_staff', 'is_superuser', 'created_at', 'twofa_enabled', 'profile')
        read_only_fields = ('id', 'is_staff', 'is_superuser', 'created_at')
    
    def update(self, instance, validated_data):
        """Update user and profile data"""
        profile_data = validated_data.pop('profile', None)
        
        # Update user fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update or create profile
        if profile_data:
            UserProfile.objects.update_or_create(
                user=instance,
                defaults=profile_data
            )
        
        return instance


class RegisterSerializer(serializers.ModelSerializer):
    """Serializer for user registration"""
    password1 = serializers.CharField(write_only=True, min_length=6)
    password2 = serializers.CharField(write_only=True, min_length=6)
    gdpr_consent = serializers.BooleanField()
    captcha = serializers.CharField(write_only=True)

    class Meta:
        model = CustomUser
        fields = ('username', 'email', 'password1', 'password2', 'gdpr_consent', 'captcha')

    def validate_username(self, value):
        """Validate username is unique and meets requirements"""
        if CustomUser.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('This username is already taken.')
        if len(value) < 3:
            raise serializers.ValidationError('Username must be at least 3 characters long.')
        return value.lower()

    def validate_email(self, value):
        """Validate email is unique"""
        if CustomUser.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('This email is already registered.')
        return value.lower()

    def validate(self, data):
        """Validate password match, GDPR consent, and reCAPTCHA"""
        if data['password1'] != data['password2']:
            raise serializers.ValidationError({'password2': 'Passwords do not match.'})
        
        if not data.get('gdpr_consent'):
            raise serializers.ValidationError({'gdpr_consent': 'You must accept the terms and conditions.'})
        
        # Verify reCAPTCHA
        captcha_token = data.get('captcha')
        if not verify_recaptcha(captcha_token):
            raise serializers.ValidationError({'captcha': 'reCAPTCHA verification failed. Please try again.'})
        
        return data

    def create(self, validated_data):
        """Create new user"""
        # Remove extra fields
        password = validated_data.pop('password1')
        validated_data.pop('password2')
        validated_data.pop('captcha')
        
        # Create user
        user = CustomUser.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=password,
            gdpr_consent=validated_data['gdpr_consent']
        )
        return user


class LoginSerializer(serializers.Serializer):
    """Serializer for user login"""
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        """Validate login credentials using secure authentication"""
        email = data.get('email', '').lower()
        password = data.get('password')

        if not email or not password:
            raise serializers.ValidationError('Email and password are required.')

        try:
            user_obj = CustomUser.objects.get(email=email)
            user = authenticate(username=user_obj.username, password=password)
        except CustomUser.DoesNotExist:
            authenticate(username='nonexistent_user', password=password)
            raise serializers.ValidationError('Invalid email or password.')
        
        if not user:
            raise serializers.ValidationError('Invalid email or password.')
        
        if not user.is_active:
            raise serializers.ValidationError('User account is disabled.')
        
        data['user'] = user
        # If user has 2FA enabled, signal step-up required
        if getattr(user, 'twofa_enabled', False):
            data['twofa_required'] = True
        return data


class TokenRefreshSerializer(serializers.Serializer):
    """Serializer for token refresh using SimpleJWT rotation + blacklist."""
    refresh = serializers.CharField()

    def validate(self, data):
        refresh_token = data.get('refresh')
        try:
            refresh = RefreshToken(refresh_token)
            user_id = refresh.payload.get('user_id')
            user = CustomUser.objects.get(id=user_id)

            # Blacklist the old refresh token
            refresh.blacklist()

            # Set new refresh token
            new_refresh = RefreshToken.for_user(user)

            # Build a fresh access token and set users current token_version
            access = new_refresh.access_token
            access["tv"] = user.token_version

            data['access'] = str(access)
            data['refresh'] = str(new_refresh)
            return data
        except (TokenError, CustomUser.DoesNotExist, Exception):
            raise serializers.ValidationError('Invalid refresh token')


class TokenRevokeSerializer(serializers.Serializer):
    """Serializer for logout: blacklist refresh via SimpleJWT and bump token_version."""
    refresh = serializers.CharField()

    def validate(self, data):
        refresh_token = data.get('refresh')
        try:
            refresh = RefreshToken(refresh_token)
            user_id = refresh.payload.get('user_id')
            # Blacklist this refresh token
            refresh.blacklist()
            # Bump token_version
            CustomUser.objects.filter(id=user_id).update(token_version=models.F('token_version') + 1)
            return data
        except TokenError:
            raise serializers.ValidationError('Invalid refresh token')
        except Exception:
            raise serializers.ValidationError('Logout failed')


class PasswordResetRequestSerializer(serializers.Serializer):
    """Serializer for password reset request"""
    email = serializers.EmailField()
    captcha = serializers.CharField(write_only=True)
    
    def validate_captcha(self, value):
        """Validate reCAPTCHA"""
        if not verify_recaptcha(value):
            raise serializers.ValidationError('reCAPTCHA verification failed. Please try again.')
        return value

    def validate_email(self, value):
        """Validate email exists and user has a password"""
        User = get_user_model()
        try:
            user = User.objects.get(email__iexact=value)
        except User.DoesNotExist:
            raise serializers.ValidationError('No user found with this email address.')
        
        # Check if user has OAuth-only authentication (no password)
        if not user.has_usable_password():
            raise serializers.ValidationError(
                'This account uses oauth login (Google)'
                'Please sign in using your social account instead of resetting password.'
            )
        return value.lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Serializer for password reset confirmation"""
    token = serializers.CharField()
    new_password1 = serializers.CharField(min_length=6)
    new_password2 = serializers.CharField(min_length=6)

    def validate(self, data):
        """Validate passwords match"""
        if data['new_password1'] != data['new_password2']:
            raise serializers.ValidationError({'new_password2': 'Passwords do not match.'})
        return data


class TwoFASetupSerializer(serializers.Serializer):
    """Begin 2FA setup: returns provisioning URI and secret."""

    def create(self, validated_data):
        user = self.context['request'].user
        # Generate secret and store temporarily until enable
        secret = pyotp.random_base32()
        user.twofa_secret = secret
        user.save(update_fields=['twofa_secret'])
        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(name=user.email or user.username, issuer_name='Dot-Com Retail')
        return {'secret': secret, 'provisioning_uri': provisioning_uri}


class TwoFAEnableSerializer(serializers.Serializer):
    code = serializers.CharField()

    def validate(self, data):
        user = self.context['request'].user
        if not user.twofa_secret:
            raise serializers.ValidationError('2FA not initiated')
        totp = pyotp.TOTP(user.twofa_secret)
        if not totp.verify(data['code'], valid_window=1):
            raise serializers.ValidationError('Invalid 2FA code')
        return data

    def save(self, **kwargs):
        user = self.context['request'].user
        user.twofa_enabled = True
        user.save(update_fields=['twofa_enabled'])
        return {'enabled': True}


class TwoFADisableSerializer(serializers.Serializer):
    code = serializers.CharField()

    def validate(self, data):
        user = self.context['request'].user
        if not user.twofa_enabled or not user.twofa_secret:
            raise serializers.ValidationError('2FA not enabled')
        totp = pyotp.TOTP(user.twofa_secret)
        if not totp.verify(data['code'], valid_window=1):
            raise serializers.ValidationError('Invalid 2FA code')
        return data

    def save(self, **kwargs):
        user = self.context['request'].user
        user.twofa_enabled = False
        user.twofa_secret = None
        user.save(update_fields=['twofa_enabled', 'twofa_secret'])
        return {'enabled': False}


class TwoFAVerifyLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    code = serializers.CharField()

    def validate(self, data):
        try:
            user = CustomUser.objects.get(username=data['username'])
        except CustomUser.DoesNotExist:
            raise serializers.ValidationError('Invalid user')
        if not user.twofa_enabled or not user.twofa_secret:
            raise serializers.ValidationError('2FA not enabled')
        totp = pyotp.TOTP(user.twofa_secret)
        if not totp.verify(data['code'], valid_window=1):
            raise serializers.ValidationError('Invalid 2FA code')
        data['user'] = user
        return data


def get_tokens_for_user(user):
    """Generate JWT tokens for user and embed token_version in access token."""
    refresh = RefreshToken.for_user(user)
    access = refresh.access_token
    # Embed token version claim for access token invalidation
    access["tv"] = user.token_version
    return {
        'refresh': str(refresh),
        'access': str(access),
    }