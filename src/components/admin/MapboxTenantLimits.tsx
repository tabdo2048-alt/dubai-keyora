import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActivityLogLanguage } from "./useActivityLogLanguage";
import {
  fetchMapboxMonthlyReport,
  setTenantMapboxLimit,
  type MapboxMonthlyReport,
} from "@/features/usage/client";

type Company = MapboxMonthlyReport["tenants"][number];
const currentMonth = () => new Date().toISOString().slice(0, 7);
const number = (value: number) => new Intl.NumberFormat().format(value);

export function MapboxTenantLimits() {
  const { t } = useActivityLogLanguage();
  const [month, setMonth] = useState(currentMonth);
  const [editing, setEditing] = useState<Company | null>(null);
  const query = useQuery({
    queryKey: ["mapbox-monthly", month],
    queryFn: () => fetchMapboxMonthlyReport(month),
    staleTime: 60_000,
    retry: 1,
  });
  const client = useQueryClient();

  return <section className="mt-6 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="font-display text-2xl text-cream">{t("Company Mapbox limits")}</h2>
        <p className="text-sm text-muted-foreground">{t("Calendar months use UTC. The company override takes priority over its plan.")}</p></div>
      <label className="grid gap-1 text-xs text-muted-foreground">{t("Month")}
        <Input type="month" value={month} max={currentMonth()} onChange={(event) => setMonth(event.target.value)} />
      </label>
    </div>
    {query.isLoading && <p className="text-sm text-muted-foreground">{t("Loading monthly usage…")}</p>}
    {query.isError && <p role="alert" className="text-sm text-destructive">{t("Could not load monthly limits:")} {query.error.message}</p>}
    {query.data && <div className="space-y-3">{query.data.tenants.map((row) => {
      const limit = row.monthly_limit;
      const excess = limit == null ? 0 : Math.max(0, row.used - limit);
      const remaining = limit == null ? null : Math.max(0, limit - row.used);
      const percent = limit == null ? null : limit === 0 ? (row.used ? 100 : 0) : row.used / limit * 100;
      const status = !row.limit_recorded ? "No historical limit snapshot" :
        row.mode === "unlimited" ? "Unlimited" :
        row.mode === "hard_limit" && limit !== null && row.used >= limit ? "Limit reached" :
        excess > 0 ? "Overage" : percent !== null && percent >= 90 ? "Near limit" : "Active";
      return <div key={row.id} className="glass gold-hairline rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="font-display text-xl text-cream">{row.name}</h3>
            <p className="text-xs text-muted-foreground">{t("Plan")}: {row.plan ?? t("None")} · {t(row.source ?? "Unknown")} {t("limit")} · {t(row.mode ?? "Unknown")} · {t(status)}</p></div>
          {month === currentMonth() && <Button type="button" variant="outline" size="sm" onClick={() => setEditing(row)}>{t("Edit limit")}</Button>}
        </div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <Metric label={t("Monthly limit")} value={!row.limit_recorded ? t("Unknown") : limit == null ? t("Unlimited") : number(limit)} />
          <Metric label={t("Used this month")} value={number(row.used)} />
          <Metric label={t("Remaining")} value={!row.limit_recorded ? t("Unknown") : remaining == null ? t("Unlimited") : number(remaining)} />
          <Metric label={t("Usage")} value={!row.limit_recorded ? t("Unknown") : percent == null ? "—" : `${percent.toFixed(1)}%`} />
          <Metric label={t("Overage")} value={number(excess)} />
        </div>
      </div>;
    })}</div>}
    {editing && <MapboxLimitEditor key={editing.id} company={editing} onClose={() => setEditing(null)}
      onSaved={() => { setEditing(null); void client.invalidateQueries({ queryKey: ["mapbox-monthly"] }); void client.invalidateQueries({ queryKey: ["platform-usage-report"] }); }} />}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span className="text-muted-foreground">{label}</span><strong className="block text-cream">{value}</strong></div>;
}

function MapboxLimitEditor({ company, onClose, onSaved }: { company: Company; onClose: () => void; onSaved: () => void }) {
  const { t } = useActivityLogLanguage();
  const [mode, setMode] = useState<Company["mode"]>(company.mode === "unlimited" ? "unlimited" : company.mode ?? "overage");
  const [limit, setLimit] = useState(String(company.monthly_limit ?? 25000));
  const [overagePrice, setOveragePrice] = useState(String(company.overage_price_per_1000 ?? 0));
  const [saving, setSaving] = useState(false);
  async function save() {
    const monthlyLimit = mode === "unlimited" ? null : Number(limit);
    const price = Number(overagePrice);
    if (monthlyLimit !== null && (!Number.isSafeInteger(monthlyLimit) || monthlyLimit < 0)) {
      toast.error(t("Enter a non-negative whole monthly load limit")); return;
    }
    if (!Number.isFinite(price) || price < 0) { toast.error(t("Enter a valid overage price")); return; }
    setSaving(true);
    try {
      await setTenantMapboxLimit({ tenantId: company.id, monthlyLimit, mode, overagePrice: price });
      toast.success(t("Company Mapbox limit saved")); onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not save the Mapbox limit"));
    } finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`${t("Edit limit")}: ${company.name}`}>
    <div className="glass-strong gold-hairline w-full max-w-lg space-y-4 rounded-2xl p-6">
      <h3 className="font-display text-2xl text-cream">{company.name}</h3>
      <label className="grid gap-1 text-xs text-muted-foreground">{t("Monthly Mapbox loads")}
        <Input inputMode="numeric" value={limit} disabled={mode === "unlimited"} onChange={(event) => setLimit(event.target.value)} /></label>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("Quick load limits")}>
        {[10_000, 25_000, 50_000].map((preset) =>
          <Button key={preset} type="button" size="sm" variant={mode !== "unlimited" && Number(limit) === preset ? "default" : "outline"}
            onClick={() => { setLimit(String(preset)); if (mode === "unlimited") setMode("overage"); }}>
            {number(preset)}
          </Button>)}
        <Button type="button" size="sm" variant={mode === "unlimited" ? "default" : "outline"} onClick={() => setMode("unlimited")}>{t("Unlimited")}</Button>
      </div>
      <label className="flex items-center gap-2 text-sm text-cream"><input type="checkbox" checked={mode === "unlimited"}
        onChange={(event) => setMode(event.target.checked ? "unlimited" : "overage")} />{t("Unlimited")}</label>
      <label className="grid gap-1 text-xs text-muted-foreground">{t("Behavior")}
        <select className="h-10 rounded-md border border-white/10 bg-background px-3 text-cream" value={mode}
          onChange={(event) => setMode(event.target.value as Company["mode"])}>
          <option value="overage">{t("Allow overage")}</option><option value="warning">{t("Warning")}</option>
          <option value="hard_limit">{t("Hard limit")}</option><option value="unlimited">{t("Unlimited")}</option>
        </select></label>
      <label className="grid gap-1 text-xs text-muted-foreground">{t("Overage price per 1,000")}
        <Input inputMode="decimal" value={overagePrice} onChange={(event) => setOveragePrice(event.target.value)} /></label>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
        <Button type="button" className="bg-gold text-black" disabled={saving} onClick={() => void save()}>{t(saving ? "Saving…" : "Save")}</Button></div>
    </div>
  </div>;
}
