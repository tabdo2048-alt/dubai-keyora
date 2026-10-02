import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { sbAny } from "@/integrations/supabase/saas";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useActivityLogLanguage } from "./useActivityLogLanguage";

type AuditRow = {
  id: string;
  event_type: "login" | "project_created" | "mapbox_limit_changed";
  actor_email: string | null;
  tenant_id: string | null;
  project_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function eventLabel(row: AuditRow, t: (text: string) => string): string {
  if (row.event_type === "login") return t("Signed in");
  if (row.event_type === "mapbox_limit_changed") {
    const value = row.metadata?.new_limit;
    return `${t("Changed company Mapbox limit to")} ${typeof value === "number" ? new Intl.NumberFormat().format(value) : t("Unlimited")}`;
  }
  const projectName = row.metadata?.project_name;
  return typeof projectName === "string" && projectName
    ? `${t("Created project")} “${projectName}”`
    : t("Created a project");
}

export function AuditLogManager({ canView }: { canView: boolean }) {
  const { t, language } = useActivityLogLanguage();
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const query = useQuery({
    queryKey: ["platform-audit-log", user?.id, page],
    enabled: canView && Boolean(user),
    queryFn: async () => {
      const { data, error } = await sbAny
        .from("audit_logs")
        .select("id,event_type,actor_email,tenant_id,project_id,metadata,created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  if (!canView) return null;

  return (
    <section className="glass gold-hairline mt-8 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-cream">{t("Activity log records")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("Latest sign-ins, project creation, and limit changes.")}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          {t("Refresh")}
        </Button>
      </div>

      {query.isLoading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("Loading activity…")}
        </div>
      ) : query.isError ? (
        <div role="alert" className="mt-5 text-sm text-destructive">{t("Could not load the activity log.")}</div>
      ) : query.data?.length ? (
        <>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t("Time")}</th>
                <th className="px-3 py-2 font-medium">{t("User")}</th>
                <th className="px-3 py-2 font-medium">{t("Event")}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.slice(0, pageSize).map((row) => (
                <tr key={row.id} className="border-b border-white/5 last:border-0">
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                    {new Date(row.created_at).toLocaleString(language === "ar" ? "ar-EG" : undefined)}
                  </td>
                  <td className="px-3 py-3 text-cream">{row.actor_email ?? t("Unknown user")}</td>
                  <td className="px-3 py-3 text-cream">{eventLabel(row, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-end gap-3 text-sm text-muted-foreground">
          <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t("Previous")}</Button>
          {t("Page")} {page + 1}
          <Button type="button" variant="outline" size="sm" disabled={query.data.length <= pageSize} onClick={() => setPage(page + 1)}>{t("Next")}</Button>
        </div>
        </>
      ) : (
        <div className="mt-5 space-y-3 text-sm text-muted-foreground"><p>{t("No more activity on this page.")}</p>
          {page > 0 && <Button type="button" variant="outline" size="sm" onClick={() => setPage(page - 1)}>{t("Previous")}</Button>}
        </div>
      )}
    </section>
  );
}
