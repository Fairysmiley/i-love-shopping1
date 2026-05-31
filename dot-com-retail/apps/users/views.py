from rest_framework import status
from rest_framework.generics import CreateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from django.db import IntegrityError
from datetime import timedelta
import secrets
import hashlib
import google.auth
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from .models import PasswordResetToken
from .serializers import (
    RegisterSerializer,
    LoginSerializer,
    TokenRefreshSerializer,
    TokenRevokeSerializer,
    UserSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
    get_tokens_for_user,
    TwoFASetupSerializer,
    TwoFAEnableSerializer,
    TwoFADisableSerializer,
    TwoFAVerifyLoginSerializer,
)


class ApiRegisterView(CreateAPIView):
    """User registration endpoint"""
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.save()
        tokens = get_tokens_for_user(user)

        return Response({
            'user': UserSerializer(user).data,
            'access': tokens['access'],
            'refresh': tokens['refresh'],
            'message': 'Registration successful'
        }, status=status.HTTP_201_CREATED)


class ApiLoginView(APIView):
    """User login endpoint"""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']

            # If 2FA is enabled, require TOTP verification first
            if getattr(user, 'twofa_enabled', False):
                return Response({
                    'twofa_required': True,
                    'username': user.username,
                    'message': 'Two-factor authentication required'
                }, status=status.HTTP_200_OK)

            # Issue tokens
            tokens = get_tokens_for_user(user)
            user_data = UserSerializer(user).data
            resp = Response({
                'user': user_data,
                'access': tokens['access'],
                'message': 'Login successful'
            }, status=status.HTTP_200_OK)

            # Set HttpOnly refresh cookie
            try:
                refresh_lifetime = settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME']
                max_age = int(refresh_lifetime.total_seconds())
            except Exception:
                max_age = 3 * 24 * 60 * 60  # 3 days fallback

            # Use secure cookies only in production (HTTPS)
            is_secure = not settings.DEBUG
            resp.set_cookie(
                key='refresh_token',
                value=tokens['refresh'],
                max_age=max_age,
                httponly=True,
                secure=is_secure,
                samesite='Lax' if not is_secure else 'None',
                path='/'
            )

            return resp

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ApiTokenRefreshView(APIView):
    """Token refresh endpoint using HttpOnly cookie for refresh token."""
    permission_classes = [AllowAny]

    def post(self, request):
        cookie_refresh = request.COOKIES.get('refresh_token')
        if not cookie_refresh:
            return Response({'error': 'No refresh token'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            refresh = RefreshToken(cookie_refresh)
            user_id = refresh.payload.get('user_id')
            
            # Blacklist old refresh token for single-use validation
            # Use get_or_create to handle race conditions from concurrent requests
            try:
                jti = refresh.payload.get('jti')
                token = OutstandingToken.objects.get(jti=jti)
                BlacklistedToken.objects.get_or_create(token=token)
            except OutstandingToken.DoesNotExist:
                # Token not tracked, continue anyway
                pass
            except IntegrityError:
                # Token already blacklisted by concurrent request, this is fine
                pass

            # Generate new refresh token
            User = get_user_model()
            user = User.objects.get(id=user_id)
            new_refresh = RefreshToken.for_user(user)
            access = new_refresh.access_token
            # token_version claim for access
            access['tv'] = getattr(user, 'token_version', 0)

            resp = Response({
                'access': str(access),
                'message': 'Token refreshed successfully'
            }, status=status.HTTP_200_OK)

            try:
                refresh_lifetime = settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME']
                max_age = int(refresh_lifetime.total_seconds())
            except Exception:
                max_age = 3 * 24 * 60 * 60

            # Use secure cookies only in production (HTTPS)
            is_secure = not settings.DEBUG
            resp.set_cookie(
                key='refresh_token',
                value=str(new_refresh),
                max_age=max_age,
                httponly=True,
                secure=is_secure,
                samesite='Lax' if not is_secure else 'None',
                path='/'
            )
            return resp
        except Exception:
            return Response({'error': 'Invalid refresh token'}, status=status.HTTP_401_UNAUTHORIZED)


class ApiTokenRevokeView(APIView):
    """Token revocation (logout) endpoint"""
    permission_classes = [AllowAny]

    def post(self, request):
        # Read refresh token from cookie
        cookie_refresh = request.COOKIES.get('refresh_token')
        if cookie_refresh:
            try:
                refresh = RefreshToken(cookie_refresh)
                try:
                    refresh.blacklist()
                except Exception:
                    # Token already blacklisted or invalid, continue
                    pass
            except Exception:
                pass
        # Bump token_version for the authenticated user (if provided via header)
        if request.user and request.user.is_authenticated:
            request.user.token_version = (request.user.token_version or 0) + 1
            request.user.save(update_fields=['token_version'])

        resp = Response({'message': 'Logout successful'}, status=status.HTTP_200_OK)
        # Clear the cookie by setting it with expired date
        # Because delete_cookie() in django < 4.1 doesnt support samesite/secure params
        # Use same secure/samesite settings as when cookie was set
        is_secure = not settings.DEBUG
        resp.set_cookie(
            key='refresh_token',
            value='',
            max_age=0,  # Expire immediately
            expires='Thu, 01 Jan 1970 00:00:00 GMT',
            path='/',
            httponly=True,
            secure=is_secure,
            samesite='Lax' if not is_secure else 'None'
        )
        return resp


class ApiUserProfileView(APIView):
    """Get and update authenticated user's profile information"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    def put(self, request):
        """Update user profile including address information"""
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ApiTwoFASetupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = TwoFASetupSerializer(data={}, context={'request': request})
        # create() returns data directly
        data = serializer.create({})
        return Response(data, status=status.HTTP_200_OK)


class ApiTwoFAEnableView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = TwoFAEnableSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            result = serializer.save()
            return Response(result, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ApiTwoFADisableView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = TwoFADisableSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            result = serializer.save()
            return Response(result, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ApiTwoFAVerifyLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = TwoFAVerifyLoginSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.validated_data['user']
            tokens = get_tokens_for_user(user)
            user_data = UserSerializer(user).data
            resp = Response({
                'user': user_data,
                'access': tokens['access'],
                'message': 'Login successful'
            }, status=status.HTTP_200_OK)

            try:
                refresh_lifetime = settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME']
                max_age = int(refresh_lifetime.total_seconds())
            except Exception:
                max_age = 3 * 24 * 60 * 60

            # Use secure cookies only in production (HTTPS)
            is_secure = not settings.DEBUG
            resp.set_cookie(
                key='refresh_token',
                value=tokens['refresh'],
                max_age=max_age,
                httponly=True,
                secure=is_secure,
                samesite='Lax' if not is_secure else 'None',
                path='/'
            )
            return resp
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ApiGoogleOAuthView(APIView):
    """Google OAuth authentication endpoint"""
    permission_classes = [AllowAny]

    def post(self, request):
        """
        Handle Google OAuth token verification and user creation/login
        Expects: {'token': 'google_oauth_token'}
        """
        try:
            google_token = request.data.get('token')
            if not google_token:
                return Response({
                    'error': 'Google token is required'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Verify the token with Google
            CLIENT_ID = settings.GOOGLE_CLIENT_ID

            try:
                # Verify the token
                idinfo = id_token.verify_oauth2_token(
                    google_token,
                    google_requests.Request(),
                    CLIENT_ID
                )

                # Extract user info from Google
                google_user_id = idinfo['sub']
                email = idinfo.get('email', '')
                username = idinfo.get('name', email.split('@')[0])

                if not email:
                    return Response({
                        'error': 'Email not provided by Google'
                    }, status=status.HTTP_400_BAD_REQUEST)

                # Check if user exists by oauth_id or email
                User = get_user_model()
                user = None

                try:
                    # Try to find user by oauth_id first
                    user = User.objects.get(oauth_id=google_user_id)
                except User.DoesNotExist:
                    try:
                        user = User.objects.get(email=email)
                        if not user.oauth_id:
                            user.oauth_id = google_user_id
                            user.save()
                        elif user.oauth_id != google_user_id:
                            return Response({
                                'error': 'Email already associated with different OAuth provider'
                            }, status=status.HTTP_400_BAD_REQUEST)
                    except User.DoesNotExist:
                        # Generate unique username
                        base_username = username.lower().replace(' ', '_')
                        unique_username = base_username
                        counter = 1
                        while User.objects.filter(username=unique_username).exists():
                            unique_username = f"{base_username}_{counter}"
                            counter += 1

                        user = User.objects.create_oauth_user(
                            username=unique_username,
                            email=email,
                            oauth_id=google_user_id,
                            gdpr_consent=True
                        )

                # Enforce 2FA step-up if enabled
                if getattr(user, 'twofa_enabled', False):
                    return Response({
                        'twofa_required': True,
                        'username': user.username,
                        'message': 'Two-factor authentication required'
                    }, status=status.HTTP_200_OK)

                # Generate JWT tokens
                tokens = get_tokens_for_user(user)
                user_data = UserSerializer(user).data

                resp = Response({
                    'user': user_data,
                    'access': tokens['access'],
                    'message': 'Google OAuth login successful'
                }, status=status.HTTP_200_OK)

                try:
                    refresh_lifetime = settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME']
                    max_age = int(refresh_lifetime.total_seconds())
                except Exception:
                    max_age = 3 * 24 * 60 * 60

                # Use secure cookies only in production (HTTPS)
                is_secure = not settings.DEBUG
                resp.set_cookie(
                    key='refresh_token',
                    value=tokens['refresh'],
                    max_age=max_age,
                    httponly=True,
                    secure=is_secure,
                    samesite='Lax' if not is_secure else 'None',
                    path='/'
                )

                return resp

            except ValueError as e:
                # Invalid token
                return Response({
                    'error': 'Invalid Google token'
                }, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({
                'error': 'OAuth authentication failed'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ApiPasswordResetRequestView(APIView):
    """Request password reset email"""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if serializer.is_valid():
            email = serializer.validated_data['email']

            try:
                User = get_user_model()
                user = User.objects.get(email__iexact=email)

                # Generate secure token
                token = secrets.token_urlsafe(32)

                # Create password reset token record
                reset_token = PasswordResetToken.objects.create(
                    user=user,
                    token=hashlib.sha256(token.encode()).hexdigest(),
                    expires_at=timezone.now() + timedelta(hours=2)
                )

                # Send email with reset link
                reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"

                send_mail(
                    subject='Password Reset Request',
                    message=f'''
Hello {user.username},

You have requested to reset your password. Click the link below to reset your password:

{reset_url}

This link will expire in 24 hours.
                    ''',
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                    fail_silently=False,
                )

                return Response({
                    'message': 'Password reset email sent successfully'
                }, status=status.HTTP_200_OK)

            except User.DoesNotExist:
                # Return success to prevent email enumeration
                return Response({
                    'message': 'Password reset email sent successfully'
                }, status=status.HTTP_200_OK)
            except Exception as e:
                return Response({
                    'error': 'Failed to send password reset email'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ApiPasswordResetConfirmView(APIView):
    """Confirm password reset with token"""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        if serializer.is_valid():
            token = serializer.validated_data['token']
            new_password = serializer.validated_data['new_password1']

            try:
                # Hash the token for lookup
                hashed_token = hashlib.sha256(token.encode()).hexdigest()

                # Find valid, unused token
                reset_token = PasswordResetToken.objects.get(
                    token=hashed_token,
                    used=False,
                    expires_at__gte=timezone.now()
                )

                # Update user password
                user = reset_token.user
                user.set_password(new_password)
                user.save()

                # Mark token as used
                reset_token.used = True
                reset_token.save()

                # Clean up expired tokens for this user
                PasswordResetToken.objects.filter(
                    user=user,
                    expires_at__lt=timezone.now()
                ).delete()

                return Response({
                    'message': 'Password reset successful'
                }, status=status.HTTP_200_OK)

            except PasswordResetToken.DoesNotExist:
                return Response({
                    'error': 'Invalid or expired reset token'
                }, status=status.HTTP_400_BAD_REQUEST)
            except Exception as e:
                return Response({
                    'error': 'Password reset failed'
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
