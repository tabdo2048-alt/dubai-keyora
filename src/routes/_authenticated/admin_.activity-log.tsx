import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { UsageAdminWorkspace } from "@/components/admin/UsageAdminWorkspace";
import { AuditLogManager } from "@/components/admin/AuditLogManager";
import { ActivityLogLanguageButton, ActivityLogLanguageProvider } from "@/components/admin/ActivityLogLanguage";
import { useActivityLogLanguage } from "@/components/admin/useActivityLogLanguage";
import { Button } from "@/components/ui/button";
import { useAuth, useIsAdmin } from "@/hooks/use-auth";
import { isLimitedAuditViewer, isPlatformOwner } from "@/lib/platform-owner";

export const Route = createFileRoute("/_authenticated/admin_/activity-log")({
  head: () => ({ meta: [{ title: "Activity log — KEYORA" }] }),
  component: ActivityLogPage,
});

function ActivityLogPage() {
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const { data: isAdmin, isLoading } = useIsAdmin(user);
  const isOwner = Boolean(isAdmin && isPlatformOwner(user));
  const isLimitedViewer = Boolean(isAdmin && isLimitedAuditViewer(user));
  const canView = isOwner || isLimitedViewer;

  useEffect(() => {
    if (ready && !isLoading && !canView) {
      navigate({ to: "/admin", replace: true });
    }
  }, [canView, isLoading, navigate, ready]);

  if (!ready || isLoading) {
    return (
      <div className="min-h-screen">
        <AppNavbar />
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking access…
        </div>
      </div>
    );
  }

  if (!canView) return null;

  return <ActivityLogLanguageProvider><ActivityLogContent isOwner={isOwner} /></ActivityLogLanguageProvider>;
}

function ActivityLogContent({ isOwner }: { isOwner: boolean }) {
  const { t, language } = useActivityLogLanguage();
  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto max-w-6xl px-4 py-8" lang={language} dir={language === "ar" ? "rtl" : "ltr"}>
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-cream">
            <Link to={isOwner ? "/admin/platform" : "/admin"}><ArrowLeft className="mr-1 h-4 w-4" /> {t("Back to admin")}</Link>
          </Button>
          <ActivityLogLanguageButton />
        </div>
        <h1 className="mt-4 font-display text-4xl text-cream">
          {t("Activity log")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isOwner
            ? t("Security activity, per-company consumption, Mapbox billing estimates, and subscription limits.")
            : t("Successful sign-ins by regular users.")}
        </p>
        {isOwner ? <UsageAdminWorkspace canView /> : <AuditLogManager canView />}
      </div>
    </div>
  );
}
