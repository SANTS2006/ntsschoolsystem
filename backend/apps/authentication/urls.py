from django.urls import path

from . import two_factor_views, views

app_name = "authentication"

urlpatterns = [
    path("login/", views.LoginView.as_view(), name="login"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("refresh/", views.TokenRefreshView.as_view(), name="refresh"),
    path("me/", views.MeView.as_view(), name="me"),
    path("heartbeat/", views.HeartbeatView.as_view(), name="heartbeat"),
    path("change-password/", views.ChangePasswordView.as_view(), name="change-password"),
    path("password-reset/", views.PasswordResetRequestView.as_view(), name="password-reset-request"),
    path(
        "password-reset/confirm/",
        views.PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path(
        "email-verification/",
        views.EmailVerificationRequestView.as_view(),
        name="email-verification-request",
    ),
    path(
        "email-verification/confirm/",
        views.EmailVerificationConfirmView.as_view(),
        name="email-verification-confirm",
    ),
    path("accept-invitation/", views.AcceptInvitationView.as_view(), name="accept-invitation"),
    # Two-factor authentication
    path("2fa/verify/", two_factor_views.TwoFactorVerifyView.as_view(), name="2fa-verify"),
    path("2fa/setup/begin/", two_factor_views.TwoFactorSetupBeginView.as_view(), name="2fa-setup-begin"),
    path("2fa/setup/confirm/", two_factor_views.TwoFactorSetupConfirmView.as_view(), name="2fa-setup-confirm"),
    path("2fa/status/", two_factor_views.TwoFactorStatusView.as_view(), name="2fa-status"),
    path("2fa/enroll/", two_factor_views.TwoFactorEnrollView.as_view(), name="2fa-enroll"),
    path("2fa/enable/", two_factor_views.TwoFactorEnableView.as_view(), name="2fa-enable"),
    path("2fa/disable/", two_factor_views.TwoFactorDisableView.as_view(), name="2fa-disable"),
    path("2fa/recovery-codes/", two_factor_views.TwoFactorRecoveryCodesView.as_view(), name="2fa-recovery-codes"),
    path("2fa/admin-reset/", two_factor_views.TwoFactorAdminResetView.as_view(), name="2fa-admin-reset"),
]
