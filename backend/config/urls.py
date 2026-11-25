from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, Http404
from django.urls import include, path, re_path

from accounts import views as auth
from ticketing import admin_views as back_office
from ticketing import views as ticketing

from .health import health

urlpatterns = [
    # /admin is the React platform-admin portal (Mirat); Django's own admin lives here.
    path("django-admin/", admin.site.urls),
    path("api/health", health),
    path("c/<str:token>", ticketing.CampaignRedirect.as_view()),
]
urlpatterns += [
    path("api/", include("ticketing.urls")),
    path("api/auth/register", auth.RegisterView.as_view()),
    path("api/auth/verify-email", auth.VerifyEmailView.as_view()),
    path("api/auth/verify-email/request", auth.ResendEmailVerificationView.as_view()),
    path("api/auth/login", auth.LoginView.as_view()),
    path("api/auth/refresh", auth.RefreshView.as_view()),
    path("api/auth/logout", auth.LogoutView.as_view()),
    path("api/auth/reset-password", auth.ResetPasswordView.as_view()),
    path("api/auth/reset-password/confirm", auth.ResetPasswordConfirmView.as_view()),
    path("api/auth/me", auth.MeView.as_view()),
    path("api/admin/users", auth.AdminUserList.as_view()),
    path("api/admin/users/<int:pk>/suspend", auth.AdminUserSuspend.as_view()),
    path("api/admin/events/<int:pk>/suspend", ticketing.AdminEventSuspend.as_view()),
    # Platform-admin back office (SRS 4.12), see ticketing/admin_views.py.
    path("api/admin/summary", back_office.AdminSummary.as_view()),
    path("api/admin/settings", back_office.AdminPlatformSettings.as_view()),
    path("api/admin/event-reports/<int:pk>", back_office.AdminEventReportDetail.as_view()),
    path("api/admin/exports/<str:name>", back_office.AdminReportExport.as_view()),
    path("api/admin/orders", back_office.AdminReportList.as_view(report="orders")),
    path("api/admin/payments", back_office.AdminReportList.as_view(report="payments")),
    path(
        "api/admin/payment-failures", back_office.AdminReportList.as_view(report="payment-failures")
    ),
    path("api/admin/refunds", back_office.AdminReportList.as_view(report="refunds")),
    path("api/admin/disputes", back_office.AdminReportList.as_view(report="disputes")),
    path("api/admin/event-reports", back_office.AdminReportList.as_view(report="event-reports")),
    path("api/admin/activations", ticketing.AdminActivationList.as_view()),
    path("api/admin/activations/<int:pk>/suspend", ticketing.AdminActivationSuspend.as_view()),
]


def frontend_app(request, entrypoint="index.html"):
    """Serve the requested web client's production entry point."""
    index = settings.FRONTEND_DIST / entrypoint
    if not index.is_file():
        raise Http404("Frontend build not found; in development use the Vite server.")
    response = FileResponse(index.open("rb"), content_type="text/html")
    response["Cache-Control"] = "no-cache"
    return response


urlpatterns += [
    re_path(r"^scanner/?$", frontend_app, {"entrypoint": "scanner/index.html"}),
    re_path(r"^(?!api/|django-admin/|static/|scanner/).*$", frontend_app),
]
