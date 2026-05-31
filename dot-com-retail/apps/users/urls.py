from django.urls import path
from . import views

app_name = 'users'
urlpatterns = [
    path('register/', views.ApiRegisterView.as_view(), name='register'),
    path('login/', views.ApiLoginView.as_view(), name='login'),
    path('oauth/google/', views.ApiGoogleOAuthView.as_view(), name='google_oauth'),

    path('token/refresh/', views.ApiTokenRefreshView.as_view(), name='token_refresh'),
    path('token/revoke/', views.ApiTokenRevokeView.as_view(), name='token_revoke'),

    path('profile/', views.ApiUserProfileView.as_view(), name='user_profile'),

    path('password-reset/request/', views.ApiPasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset/confirm/', views.ApiPasswordResetConfirmView.as_view(), name='password_reset_confirm'),

    # 2FA
    path('2fa/setup/', views.ApiTwoFASetupView.as_view(), name='twofa_setup'),
    path('2fa/enable/', views.ApiTwoFAEnableView.as_view(), name='twofa_enable'),
    path('2fa/disable/', views.ApiTwoFADisableView.as_view(), name='twofa_disable'),
    path('2fa/verify/', views.ApiTwoFAVerifyLoginView.as_view(), name='twofa_verify'),
]
