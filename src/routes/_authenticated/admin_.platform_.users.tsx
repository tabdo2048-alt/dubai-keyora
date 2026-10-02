import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { UsersManager } from "@/components/admin/PlatformAccountManagers";
import { Button } from "@/components/ui/button";
import { useAuth, useIsAdmin } from "@/hooks/use-auth";
import { isPlatformOwner } from "@/lib/platform-owner";

export const Route = createFileRoute("/_authenticated/admin_/platform_/users")({
  head: () => ({ meta: [{ title: "Manage Users — KEYORA" }] }),
  component: ManageUsersPage,
});

function ManageUsersPage() {
  const navigate = useNavigate();
  const { user, ready } = useAuth();
  const { data: isAdmin, isLoading } = useIsAdmin(user);
  const canManage = Boolean(isAdmin && isPlatformOwner(user));

  useEffect(() => {
    if (ready && !isLoading && !isAdmin) navigate({ to: "/admin", replace: true });
  }, [ready, isLoading, isAdmin, navigate]);

  if (!ready || isLoading) {
    return <div className="min-h-screen"><AppNavbar /><div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-12 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking access…</div></div>;
  }
  if (!isAdmin) return null;

  return <div className="min-h-screen"><AppNavbar /><div className="mx-auto max-w-6xl px-4 py-8">
    <Button asChild variant="ghost" size="sm"><Link to="/admin/platform"><ArrowLeft className="mr-1 h-4 w-4" />Back to Platform</Link></Button>
    <h1 className="mt-4 font-display text-4xl text-cream">Manage <span className="text-gold-gradient">Users</span></h1>
    <p className="mt-1 text-sm text-muted-foreground">The platform owner can email a password reset link. Passwords are never shown here.</p>
    {!canManage && <p className="mt-4 text-sm text-muted-foreground">Read-only access. Only the platform owner can manage users.</p>}
    <UsersManager canManage={canManage} currentUserId={user?.id ?? null} />
  </div></div>;
}
