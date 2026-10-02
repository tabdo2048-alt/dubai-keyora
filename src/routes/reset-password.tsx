import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { clearPasswordRecovery, markPasswordRecovery, readPasswordRecovery } from "@/lib/password-recovery";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Reset password — KEYORA" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const recoveryToken = params.get("type") === "recovery" ? params.get("access_token") : null;
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session?.user) {
        markPasswordRecovery(session.user.id);
        if (alive) setState("ready");
      }
    });
    void Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]).then(([userResult, sessionResult]) => {
      if (!alive) return;
      const marker = readPasswordRecovery();
      const user = userResult.data.user;
      const validLinkSession = Boolean(recoveryToken && sessionResult.data.session?.access_token === recoveryToken);
      if (!userResult.error && user && validLinkSession) markPasswordRecovery(user.id);
      setState(!userResult.error && user && (marker === user.id || validLinkSession) ? "ready" : "invalid");
    }).catch(() => { if (alive) setState("invalid"); });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (state !== "ready" || saving) return;
    if (password.length < 8) { toast.error("Use at least 8 characters."); return; }
    if (password !== confirm) { toast.error("Passwords do not match."); return; }
    setSaving(true);
    try {
      const { data: user, error: userError } = await supabase.auth.getUser();
      if (userError || !user.user || readPasswordRecovery() !== user.user.id) {
        throw new Error("This recovery link is no longer valid. Request a new one.");
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      clearPasswordRecovery();
      await supabase.auth.signOut({ scope: "global" });
      toast.success("Password changed. Sign in with your new password.");
      navigate({ to: "/auth", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the password.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="min-h-screen"><AppNavbar /><div className="mx-auto grid max-w-md px-4 py-16">
    <div className="glass-strong gold-hairline rounded-3xl p-8">
      <h1 className="font-display text-3xl text-cream">Reset <span className="text-gold-gradient">password</span></h1>
      {state === "checking" && <p className="mt-4 text-sm text-muted-foreground">Checking your recovery link…</p>}
      {state === "invalid" && <div className="mt-4 space-y-4"><p role="alert" className="text-sm text-destructive">This link has expired or is invalid. Request a new one from the sign-in page.</p><Button asChild variant="outline"><Link to="/auth">Back to sign in</Link></Button></div>}
      {state === "ready" && <form onSubmit={(e) => void save(e)} className="mt-6 space-y-4">
        <div><Label htmlFor="new-password" className="text-cream">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password}
            onChange={(e) => setPassword(e.target.value)} className="glass gold-hairline mt-1 text-cream" /></div>
        <div><Label htmlFor="confirm-password" className="text-cream">Confirm password</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirm}
            onChange={(e) => setConfirm(e.target.value)} className="glass gold-hairline mt-1 text-cream" /></div>
        <Button type="submit" disabled={saving} className="w-full bg-gold text-gold-foreground">{saving ? "Saving…" : "Set new password"}</Button>
      </form>}
    </div>
  </div></div>;
}
