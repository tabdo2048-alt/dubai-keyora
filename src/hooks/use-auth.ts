import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { clearSessionWindow, getSessionExpiresAt } from "@/lib/auth-session";

const SESSION_EXPIRED_NOTICE_KEY = "dubai:session-expired";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const acceptSession = (nextSession: Session | null, forceUserUpdate = false) => {
      setSession((current) =>
        current?.access_token === nextSession?.access_token && current?.expires_at === nextSession?.expires_at
          ? current
          : nextSession,
      );
      const nextUser = nextSession?.user ?? null;
      setUser((current) =>
        !forceUserUpdate && current?.id === nextUser?.id && current?.updated_at === nextUser?.updated_at
          ? current
          : nextUser,
      );
      setReady(true);
    };
    supabase.auth.getSession().then(({ data }) => {
      acceptSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      acceptSession(nextSession, event === "USER_UPDATED");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || typeof window === "undefined") return;

    const expiresAt = getSessionExpiresAt(session);
    if (expiresAt == null) return;

    const expire = () => {
      window.sessionStorage.setItem(SESSION_EXPIRED_NOTICE_KEY, "1");
      clearSessionWindow(session);
      setSession(null);
      setUser(null);
      void supabase.auth.signOut({ scope: "local" });
    };

    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      expire();
      return;
    }

    const timeout = window.setTimeout(expire, remaining);
    return () => window.clearTimeout(timeout);
  }, [session]);

  return { session, user, ready };
}

export function useIsAdmin(user: User | null) {
  return useQuery({
    queryKey: ["is-admin", user?.id ?? "none"],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
  });
}
