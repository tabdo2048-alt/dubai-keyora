import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Building2,
  Calculator,
  Database,
  Gauge,
  Loader2,
  RefreshCw,
  Save,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AuditLogManager } from "./AuditLogManager";
import { MapboxTenantLimits } from "./MapboxTenantLimits";
import { useActivityLogLanguage } from "./useActivityLogLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  allocateProviderCost,
  calculateProviderMapboxCost,
  estimateGrossContribution,
  usagePercent,
  usageProjection,
  warningThreshold,
} from "@/features/usage/billing";
import {
  fetchUsageReport,
  fetchMapboxMonthlyReport,
  saveBillingSettings,
  saveTenantLimits,
} from "@/features/usage/client";
import type {
  MapboxPricingTier,
  TenantUsageRow,
  UsageEventType,
  UsageBillingSettings,
  UsageReport,
} from "@/features/usage/types";
import { USAGE_EVENT_TYPES } from "@/features/usage/types";

const UsageCharts = lazy(() => import("./UsageCharts"));

type RangePreset = "today" | "7d" | "30d" | "this_month" | "last_month" | "custom";
type WorkspaceTab = "activity" | "usage" | "billing" | "limits";

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function rangeFor(preset: RangePreset, customStart: string, customEnd: string) {
  const now = new Date();
  const end = new Date(now);
  if (preset === "today") return { start: startOfDay(now), end };
  if (preset === "7d" || preset === "30d") {
    const start = startOfDay(now);
    start.setDate(start.getDate() - (preset === "7d" ? 6 : 29));
    return { start, end };
  }
  if (preset === "last_month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 1),
    };
  }
  if (preset === "custom" && customStart && customEnd) {
    const customEndDate = new Date(`${customEnd}T00:00:00`);
    customEndDate.setDate(customEndDate.getDate() + 1);
    return { start: new Date(`${customStart}T00:00:00`), end: customEndDate };
  }
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value;
  let unit = -1;
  do {
    size /= 1024;
    unit += 1;
  } while (size >= 1024 && unit < units.length - 1);
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`;
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

function KpiCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Activity }) {
  return (
    <div className="glass gold-hairline rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-wider text-muted-foreground">
        {label}<Icon className="h-4 w-4 text-gold" />
      </div>
      <div className="mt-2 font-display text-3xl text-cream">{value}</div>
    </div>
  );
}

function UsageFilters({
  preset,
  setPreset,
  customStart,
  customEnd,
  setCustomStart,
  setCustomEnd,
  tenantId,
  setTenantId,
  userId,
  setUserId,
  eventType,
  setEventType,
  tenants,
  users,
  onRefresh,
  refreshing,
}: {
  preset: RangePreset;
  setPreset: (value: RangePreset) => void;
  customStart: string;
  customEnd: string;
  setCustomStart: (value: string) => void;
  setCustomEnd: (value: string) => void;
  tenantId: string;
  setTenantId: (value: string) => void;
  userId: string;
  setUserId: (value: string) => void;
  eventType: string;
  setEventType: (value: string) => void;
  tenants: TenantUsageRow[];
  users: UsageReport["users"];
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const { t } = useActivityLogLanguage();
  return (
    <div className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      <label className="grid gap-1 text-xs text-muted-foreground">
        {t("Period")}
        <select className="h-10 rounded-md border border-white/10 bg-background px-3 text-sm text-cream" value={preset} onChange={(event) => setPreset(event.target.value as RangePreset)}>
          <option value="today">{t("Today")}</option><option value="7d">{t("7 days")}</option><option value="30d">{t("30 days")}</option>
          <option value="this_month">{t("This month")}</option><option value="last_month">{t("Last month")}</option><option value="custom">{t("Custom")}</option>
        </select>
      </label>
      {preset === "custom" ? <>
        <label className="grid gap-1 text-xs text-muted-foreground">{t("From")}<Input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">{t("To")}<Input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
      </> : null}
      <label className="grid min-w-52 gap-1 text-xs text-muted-foreground">
        {t("Tenant")}
        <select className="h-10 rounded-md border border-white/10 bg-background px-3 text-sm text-cream" value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
          <option value="">{t("All companies")}</option>
          {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
        </select>
      </label>
      <label className="grid min-w-52 gap-1 text-xs text-muted-foreground">
        {t("User")}
        <select className="h-10 rounded-md border border-white/10 bg-background px-3 text-sm text-cream" value={userId} onChange={(event) => setUserId(event.target.value)}>
          <option value="">{t("All users")}</option>
          {users.filter((user) => !tenantId || user.tenant_id === tenantId).map((user) => <option key={`${user.tenant_id}:${user.user_id}`} value={user.user_id}>{user.email ?? user.user_id}</option>)}
        </select>
      </label>
      <label className="grid min-w-48 gap-1 text-xs text-muted-foreground">
        {t("Event type")}
        <select className="h-10 rounded-md border border-white/10 bg-background px-3 text-sm text-cream" value={eventType} onChange={(event) => setEventType(event.target.value)}>
          <option value="">{t("All events")}</option>
          {USAGE_EVENT_TYPES.map((type) => <option key={type} value={type}>{t(type.replaceAll("_", " "))}</option>)}
        </select>
      </label>
      <Button type="button" variant="outline" onClick={onRefresh} disabled={refreshing}>
        {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}{t("Refresh")}
      </Button>
    </div>
  );
}

function UsageOverview({ report }: { report: UsageReport }) {
  const { t, language } = useActivityLogLanguage();
  const provider = calculateProviderMapboxCost(
    report.summary.mapbox_loads,
    report.settings.monthly_free_mapbox_loads,
    report.settings.mapbox_pricing_tiers,
  );
  const daily = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of report.daily) totals.set(row.usage_date, (totals.get(row.usage_date) ?? 0) + row.mapbox_loads);
    return [...totals].map(([date, loads]) => ({ date, loads }));
  }, [report.daily]);
  const selectedTenant = report.tenants.length === 1 ? report.tenants[0] : null;
  return (
    <div className="mt-6 space-y-6">
      {selectedTenant ? <div className="glass gold-hairline grid gap-4 rounded-2xl p-5 md:grid-cols-4">
        <div><div className="text-xs uppercase text-muted-foreground">{t("Company")}</div><div className="mt-1 font-display text-2xl text-cream">{selectedTenant.name}</div></div>
        <div><div className="text-xs uppercase text-muted-foreground">{t("Plan")}</div><div className="mt-1 text-cream">{selectedTenant.plan ?? t("Not assigned")}</div></div>
        <div><div className="text-xs uppercase text-muted-foreground">{t("Subscription")}</div><div className="mt-1 text-cream">{selectedTenant.subscription_status ?? t("Unknown")}</div></div>
        <div><div className="text-xs uppercase text-muted-foreground">{t("Renewal")}</div><div className="mt-1 text-cream">{selectedTenant.current_period_end ? new Date(selectedTenant.current_period_end).toLocaleDateString(language === "ar" ? "ar-EG" : undefined) : t("Not set")}</div></div>
      </div> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={t("Total tenants")} value={formatNumber(report.summary.total_tenants)} icon={Building2} />
        <KpiCard label={t("Active users")} value={formatNumber(report.summary.active_users)} icon={Users} />
        <KpiCard label={t("Mapbox loads")} value={formatNumber(report.summary.mapbox_loads)} icon={BarChart3} />
        <KpiCard label={t("Estimated Mapbox cost")} value={money(provider.estimatedCost, report.settings.currency)} icon={Calculator} />
        <KpiCard label={t("Projects")} value={formatNumber(report.summary.projects)} icon={Building2} />
        <KpiCard label={t("360 tours")} value={formatNumber(report.summary.tours)} icon={Gauge} />
        <KpiCard label={t("Storage")} value={formatBytes(report.summary.storage_bytes)} icon={Database} />
        <KpiCard label={t("PDFs generated")} value={formatNumber(report.summary.pdfs)} icon={Activity} />
      </div>
      {daily.length ? <Suspense fallback={<div className="glass gold-hairline grid h-64 place-items-center rounded-2xl text-sm text-muted-foreground">{t("Loading charts…")}</div>}><UsageCharts daily={daily} tenants={report.tenants} users={report.users} /></Suspense> : <div className="glass gold-hairline grid h-40 place-items-center rounded-2xl text-sm text-muted-foreground">{t("No Mapbox loads in this period.")}</div>}
      <div className="glass gold-hairline overflow-x-auto rounded-2xl p-5">
        <h3 className="font-display text-xl text-cream">{t("Tenant usage")}</h3>
        <table className="mt-4 w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-muted-foreground"><tr>
            <th className="px-3 py-2">{t("Company")}</th><th className="px-3 py-2">{t("Users")}</th><th className="px-3 py-2">{t("Projects")}</th><th className="px-3 py-2">{t("Mapbox loads")}</th><th className="px-3 py-2">{t("Logins")}</th><th className="px-3 py-2">{t("360 opens")}</th><th className="px-3 py-2">{t("PDFs")}</th><th className="px-3 py-2">{t("Contribution")}</th>
          </tr></thead>
          <tbody>{report.tenants.map((tenant) => <tr key={tenant.id} className="border-b border-white/5 last:border-0">
            <td className="px-3 py-3"><Link to="/admin/activity-log/$tenantId" params={{ tenantId: tenant.id }} className="font-medium text-gold hover:underline">{tenant.name}</Link></td>
            <td className="px-3 py-3 text-cream">{tenant.users}</td><td className="px-3 py-3 text-cream">{tenant.projects}</td><td className="px-3 py-3 text-cream">{formatNumber(tenant.mapbox_loads)}</td><td className="px-3 py-3 text-cream">{tenant.logins}</td><td className="px-3 py-3 text-cream">{tenant.tour_opens}</td><td className="px-3 py-3 text-cream">{tenant.pdfs}</td><td className="px-3 py-3 text-muted-foreground">{report.summary.mapbox_loads ? `${((tenant.mapbox_loads / report.summary.mapbox_loads) * 100).toFixed(1)}%` : "0%"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="glass gold-hairline overflow-x-auto rounded-2xl p-5">
          <h3 className="font-display text-xl text-cream">{t("Top users by Mapbox loads")}</h3>
          <table className="mt-4 w-full min-w-[720px] text-left text-sm"><thead className="border-b border-white/10 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">{t("User")}</th><th className="px-3 py-2">{t("Last active")}</th><th className="px-3 py-2">{t("Logins")}</th><th className="px-3 py-2">Mapbox</th><th className="px-3 py-2">{t("Tours")}</th><th className="px-3 py-2">{t("PDFs")}</th><th className="px-3 py-2">{t("Projects")}</th></tr></thead><tbody>{report.users.slice(0, 20).map((user) => <tr key={`${user.tenant_id}:${user.user_id}`} className="border-b border-white/5"><td className="px-3 py-3 text-cream">{user.email ?? user.user_id}</td><td className="px-3 py-3 text-muted-foreground">{new Date(user.last_active).toLocaleString(language === "ar" ? "ar-EG" : undefined)}</td><td className="px-3 py-3">{user.logins}</td><td className="px-3 py-3 text-gold">{user.mapbox_loads}</td><td className="px-3 py-3">{user.tour_opens}</td><td className="px-3 py-3">{user.pdfs}</td><td className="px-3 py-3">{user.project_views}</td></tr>)}</tbody></table>
        </div>
        <div className="glass gold-hairline overflow-x-auto rounded-2xl p-5">
          <h3 className="font-display text-xl text-cream">{t("Recent Mapbox initializations")}</h3>
          <table className="mt-4 w-full min-w-[520px] text-left text-sm"><thead className="border-b border-white/10 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">{t("Time")}</th><th className="px-3 py-2">{t("User")}</th><th className="px-3 py-2">{t("Mode")}</th><th className="px-3 py-2">{t("Session")}</th></tr></thead><tbody>{report.recent_mapbox.slice(0, 20).map((event) => <tr key={event.id} className="border-b border-white/5"><td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{new Date(event.created_at).toLocaleString(language === "ar" ? "ar-EG" : undefined)}</td><td className="px-3 py-3 text-cream">{event.email ?? t("Unknown")}</td><td className="px-3 py-3">{t(typeof event.metadata.map_mode === "string" ? event.metadata.map_mode : "map")}</td><td className="max-w-36 truncate px-3 py-3 font-mono text-xs text-muted-foreground" title={event.session_id ?? undefined}>{event.session_id ?? "—"}</td></tr>)}</tbody></table>
        </div>
      </div>
    </div>
  );
}

function BillingEditor({ settings, onSaved }: { settings: UsageBillingSettings; onSaved: () => void }) {
  const { t } = useActivityLogLanguage();
  const [free, setFree] = useState(String(settings.monthly_free_mapbox_loads));
  const [currency, setCurrency] = useState(settings.currency);
  const [tiers, setTiers] = useState(() => settings.mapbox_pricing_tiers.map((tier) => ({
    upTo: tier.up_to == null ? "" : String(tier.up_to),
    price: String(tier.price_per_1000),
  })));
  const [allocationStrategy, setAllocationStrategy] = useState(settings.allocation_strategy);
  const [saving, setSaving] = useState(false);
  const editTier = (index: number, field: "upTo" | "price", value: string) =>
    setTiers((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  const addTier = () => setTiers((current) => {
    const last = current.at(-1);
    const previous = current.length > 1 ? current[current.length - 2] : undefined;
    const upTo = String((Number(last?.upTo || previous?.upTo || free) || 0) + 10_000);
    const next = { upTo, price: last?.price ?? "0" };
    return last && last.upTo === "" ? [...current.slice(0, -1), next, last] : [...current, next];
  });
  const save = async () => {
    setSaving(true);
    try {
      if (!tiers.length) throw new Error(t("Add at least one pricing tier."));
      const freeLoads = Number(free);
      if (!Number.isSafeInteger(freeLoads) || freeLoads < 0) throw new Error(t("Free loads must be a non-negative whole number."));
      let previousLimit = freeLoads;
      const parsed: MapboxPricingTier[] = tiers.map((tier, index) => {
        const price = Number(tier.price);
        const upTo = tier.upTo.trim() === "" ? null : Number(tier.upTo);
        if (tier.price.trim() === "" || !Number.isFinite(price) || price < 0) throw new Error(t("Enter a valid price for each tier."));
        if (upTo === null && index !== tiers.length - 1) throw new Error(t("Only the final tier can have no upper limit."));
        if (upTo !== null && (!Number.isSafeInteger(upTo) || upTo <= previousLimit)) {
          throw new Error(t("Tier limits must increase beyond the free load count."));
        }
        if (upTo !== null) previousLimit = upTo;
        return { up_to: upTo, price_per_1000: price };
      });
      await saveBillingSettings({ monthly_free_mapbox_loads: freeLoads, mapbox_pricing_tiers: parsed, currency: currency.toUpperCase(), allocation_strategy: allocationStrategy });
      toast.success(t("Billing settings saved")); onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : t("Could not save billing settings")); }
    finally { setSaving(false); }
  };
  return <details className="glass gold-hairline rounded-2xl p-5"><summary className="cursor-pointer font-medium text-gold">{t("Provider pricing settings")}</summary>
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <label className="grid gap-1 text-xs text-muted-foreground">{t("Monthly free Mapbox loads")}<Input type="number" min="0" step="1" value={free} onChange={(event) => setFree(event.target.value)} /></label>
      <label className="grid gap-1 text-xs text-muted-foreground">{t("Currency")}<Input maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value)} /></label>
      <label className="grid gap-1 text-xs text-muted-foreground">{t("Internal allocation")}<select className="h-10 rounded-md border border-white/10 bg-background px-3 text-cream" value={allocationStrategy} onChange={(event) => setAllocationStrategy(event.target.value as UsageBillingSettings["allocation_strategy"])}><option value="proportional_usage">{t("Proportional usage")}</option><option value="included_quota_overage">{t("Included quota + overage")}</option></select></label>
      <div className="space-y-3 md:col-span-2"><h4 className="text-sm text-cream">{t("Pricing tiers")}</h4>
        {tiers.map((tier, index) => <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-1 text-xs text-muted-foreground">{t("Up to load number")}
            <Input type="number" min="0" step="1" placeholder={t("Above all tiers")} value={tier.upTo} onChange={(event) => editTier(index, "upTo", event.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">{t("Price per 1,000 loads")}
            <Input type="number" min="0" step="any" value={tier.price} onChange={(event) => editTier(index, "price", event.target.value)} />
          </label>
          <Button type="button" variant="outline" disabled={tiers.length === 1} onClick={() => setTiers((current) => current.filter((_, i) => i !== index))}>{t("Remove tier")}</Button>
        </div>)}
        <Button type="button" variant="outline" onClick={addTier}>{t("Add tier")}</Button>
      </div>
      <Button type="button" onClick={() => void save()} disabled={saving} className="w-fit bg-gold text-black"><Save className="mr-2 h-4 w-4" />{t("Save pricing")}</Button>
    </div>
  </details>;
}

function BillingView({ report, onSaved }: { report: UsageReport; onSaved: () => void }) {
  const { t } = useActivityLogLanguage();
  const rangeStart = new Date(report.range.start);
  const rangeEnd = new Date(report.range.end);
  const firstMonth = rangeStart.toISOString().slice(0, 7);
  const lastIncludedDay = new Date(rangeEnd.getTime() - 1);
  const singleUtcMonth = firstMonth === lastIncludedDay.toISOString().slice(0, 7);
  const monthly = useQuery({
    queryKey: ["mapbox-monthly", firstMonth],
    queryFn: () => fetchMapboxMonthlyReport(firstMonth),
    enabled: singleUtcMonth,
    staleTime: 60_000,
    retry: 1,
  });
  const monthlyTenants = new Map(monthly.data?.tenants.map((row) => [row.id, row]) ?? []);
  const provider = calculateProviderMapboxCost(report.summary.mapbox_loads, report.settings.monthly_free_mapbox_loads, report.settings.mapbox_pricing_tiers);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const platformProjection = usageProjection(report.summary.mapbox_loads, monthStart, now, monthEnd);
  const projectedProvider = calculateProviderMapboxCost(platformProjection.projectedMonthlyLoads, report.settings.monthly_free_mapbox_loads, report.settings.mapbox_pricing_tiers);
  return <div className="mt-6 space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><KpiCard label={t("Actual loads")} value={formatNumber(provider.actualLoads)} icon={BarChart3} /><KpiCard label={t("Free loads")} value={formatNumber(provider.freeLoads)} icon={Gauge} /><KpiCard label={t("Billable loads")} value={formatNumber(provider.billableLoads)} icon={Activity} /><KpiCard label={t("Provider estimated cost")} value={money(provider.estimatedCost, report.settings.currency)} icon={Calculator} /><KpiCard label={t("Average / active user")} value={formatNumber(report.summary.active_users ? Math.round(report.summary.mapbox_loads / report.summary.active_users) : 0)} icon={Users} /><KpiCard label={t("Average / tenant")} value={formatNumber(report.summary.total_tenants ? Math.round(report.summary.mapbox_loads / report.summary.total_tenants) : 0)} icon={Building2} /></div>
    <div className="glass gold-hairline overflow-x-auto rounded-2xl p-5"><h3 className="font-display text-xl text-cream">{t("Cost allocation and overage")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("Mapbox free usage is applied once at platform level. Monthly commercial overage uses the effective company or plan limit for")} {firstMonth} UTC. {t("Internal allocation and gross contribution are estimates over the selected range. Forecasts use elapsed days this month.")}</p>
      {!singleUtcMonth && <p className="mt-2 text-xs text-amber-300">{t("Select a range within one UTC month to see commercial overage.")}</p>}
      {singleUtcMonth && monthly.isError && <p role="alert" className="mt-2 text-xs text-destructive">{t("Monthly limits could not be loaded:")} {monthly.error.message}</p>}
      <table className="mt-4 w-full min-w-[1450px] text-left text-sm"><thead className="border-b border-white/10 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">{t("Company")}</th><th className="px-3 py-2">{t("Loads")}</th><th className="px-3 py-2">{t("Projected month")}</th><th className="px-3 py-2">{t("Projected annual loads")}</th><th className="px-3 py-2">{t("Est. monthly infra")}</th><th className="px-3 py-2">{t("Projected annual infra")}</th><th className="px-3 py-2">{t("Provider allocated")}</th><th className="px-3 py-2">{t("Monthly limit")}</th><th className="px-3 py-2">{t("Monthly overage")}</th><th className="px-3 py-2">{t("Commercial overage")}</th><th className="px-3 py-2">{t("Internal allocated")}</th><th className="px-3 py-2">{t("Est. gross contribution (range)")}</th></tr></thead><tbody>{report.tenants.map((tenant) => {
        const allocated = allocateProviderCost(provider.estimatedCost, tenant.mapbox_loads, report.summary.mapbox_loads);
        const effective = monthlyTenants.get(tenant.id);
        const validLimit = effective?.limit_recorded && effective.mode !== "unlimited";
        const excess = validLimit && effective.monthly_limit !== null ? Math.max(0, effective.used - effective.monthly_limit) : 0;
        const monthlyCharge = effective?.mode === "overage" ? excess / 1000 * effective.overage_price_per_1000 : 0;
        const rangeShare = effective?.used ? Math.min(1, tenant.mapbox_loads / effective.used) : 0;
        const internalAllocated = report.settings.allocation_strategy === "included_quota_overage" && effective?.limit_recorded ? monthlyCharge * rangeShare : allocated;
        const contribution = estimateGrossContribution(tenant.subscription_revenue, tenant.revenue_period, internalAllocated, rangeStart, rangeEnd);
        const projection = usageProjection(tenant.mapbox_loads, monthStart, now, monthEnd);
        const projectedInfrastructure = allocateProviderCost(projectedProvider.estimatedCost, projection.projectedMonthlyLoads, platformProjection.projectedMonthlyLoads);
        return <tr key={tenant.id} className="border-b border-white/5"><td className="px-3 py-3 text-gold">{tenant.name}</td><td className="px-3 py-3">{formatNumber(tenant.mapbox_loads)}</td><td className="px-3 py-3">{formatNumber(projection.projectedMonthlyLoads)}</td><td className="px-3 py-3">{formatNumber(projection.projectedAnnualLoads)}</td><td className="px-3 py-3">{money(projectedInfrastructure, report.settings.currency)}</td><td className="px-3 py-3">{money(projectedInfrastructure * 12, report.settings.currency)}</td><td className="px-3 py-3">{money(allocated, report.settings.currency)}</td><td className="px-3 py-3">{effective?.limit_recorded ? effective.mode === "unlimited" || effective.monthly_limit === null ? t("Unlimited") : formatNumber(effective.monthly_limit) : "—"}</td><td className="px-3 py-3">{effective?.limit_recorded ? formatNumber(excess) : "—"}</td><td className="px-3 py-3">{effective?.limit_recorded ? money(monthlyCharge, report.settings.currency) : "—"}</td><td className="px-3 py-3">{money(internalAllocated, report.settings.currency)}</td><td className="px-3 py-3">{contribution == null ? t("Set revenue") : money(contribution, report.settings.currency)}</td></tr>;
      })}</tbody></table></div>
    <BillingEditor settings={report.settings} onSaved={onSaved} />
  </div>;
}

function LimitMeter({ label, used, limit, format = formatNumber }: { label: string; used: number; limit: number | null; format?: (value: number) => string }) {
  const { t } = useActivityLogLanguage();
  const percent = usagePercent(used, limit); const threshold = warningThreshold(percent);
  return <div><div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{t(label)}</span><span className={threshold && threshold >= 90 ? "text-amber-300" : "text-cream"}>{format(used)} / {limit == null ? t("Unlimited") : format(limit)}</span></div><Progress className="mt-1.5 h-2" value={Math.min(100, percent ?? 0)} />{threshold ? <div className="mt-1 text-[11px] text-amber-300">{threshold}% {t("usage threshold reached")}</div> : null}</div>;
}

function ResourceLimitsView({ report, onSaved }: { report: UsageReport; onSaved: () => void }) {
  const { t } = useActivityLogLanguage();
  const [editing, setEditing] = useState<string | null>(null);
  const tenant = report.tenants.find((row) => row.id === editing);
  return <section className="mt-8 space-y-4"><h2 className="font-display text-2xl text-cream">{t("Other resource limits")}</h2>
    {report.tenants.map((row) => <div key={row.id} className="glass gold-hairline rounded-2xl p-5">
      <div className="flex justify-between gap-3"><h3 className="font-display text-xl text-cream">{row.name}</h3>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(row.id)}>{t("Edit resources")}</Button></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LimitMeter label="Projects" used={row.projects} limit={row.max_projects} />
        <LimitMeter label="Users" used={row.users} limit={row.max_users} />
        <LimitMeter label="360 tours" used={row.tours} limit={row.max_360_tours} />
        <LimitMeter label="Storage" used={row.storage_bytes} limit={row.max_storage_bytes} format={formatBytes} />
      </div></div>)}
    {tenant && <ResourceLimitEditor tenant={tenant} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onSaved(); }} />}
  </section>;
}

function optionalNumber(value: string): number | null { return value.trim() === "" ? null : Number(value); }

function ResourceLimitEditor({ tenant, onClose, onSaved }: { tenant: TenantUsageRow; onClose: () => void; onSaved: () => void }) {
  const { t } = useActivityLogLanguage();
  const [form, setForm] = useState({
    max_projects: String(tenant.max_projects ?? ""), max_users: String(tenant.max_users ?? ""),
    max_360_tours: String(tenant.max_360_tours ?? ""),
    max_storage_gb: tenant.max_storage_bytes == null ? "" : String(tenant.max_storage_bytes / 1024 ** 3),
    subscription_revenue: String(tenant.subscription_revenue ?? ""),
    revenue_period: tenant.revenue_period ?? "monthly",
  });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await saveTenantLimits(tenant.id, {
        max_projects: optionalNumber(form.max_projects), max_users: optionalNumber(form.max_users),
        max_360_tours: optionalNumber(form.max_360_tours),
        max_storage_bytes: form.max_storage_gb.trim() === "" ? null : Math.round(Number(form.max_storage_gb) * 1024 ** 3),
        subscription_revenue: optionalNumber(form.subscription_revenue), revenue_period: form.revenue_period,
      });
      toast.success(t("Resource limits saved")); onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : t("Could not save limits")); }
    finally { setSaving(false); }
  }
  const field = (key: Exclude<keyof typeof form, "revenue_period">, label: string) =>
    <label className="grid gap-1 text-xs text-muted-foreground">{t(label)}<Input value={form[key]}
      onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} /></label>;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`${t("Edit resources")}: ${tenant.name}`}>
    <div className="glass-strong gold-hairline w-full max-w-2xl rounded-2xl p-6"><h3 className="font-display text-2xl text-cream">{t("Resources")} · {tenant.name}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{field("max_projects", "Projects")}{field("max_users", "Users")}
        {field("max_360_tours", "360 tours")}{field("max_storage_gb", "Storage (GB)")}
        {field("subscription_revenue", "Subscription revenue")}
        <label className="grid gap-1 text-xs text-muted-foreground">{t("Revenue period")}
          <select className="h-10 rounded-md border border-white/10 bg-background px-3 text-cream" value={form.revenue_period}
            onChange={(event) => setForm((current) => ({ ...current, revenue_period: event.target.value as "monthly" | "annual" }))}>
            <option value="monthly">{t("Monthly")}</option><option value="annual">{t("Annual")}</option>
          </select></label></div>
      <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
        <Button type="button" className="bg-gold text-black" disabled={saving} onClick={() => void save()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{t("Save")}
        </Button></div></div></div>;
}

export function UsageAdminWorkspace({ canView, initialTab = "activity", tenantId: initialTenantId = "" }: { canView: boolean; initialTab?: WorkspaceTab; tenantId?: string }) {
  const { t } = useActivityLogLanguage();
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [preset, setPreset] = useState<RangePreset>("this_month");
  const [customStart, setCustomStart] = useState(""); const [customEnd, setCustomEnd] = useState("");
  const [tenantId, setTenantId] = useState(initialTenantId);
  const [userId, setUserId] = useState("");
  const [eventType, setEventType] = useState("");
  const range = useMemo(() => rangeFor(preset, customStart, customEnd), [customEnd, customStart, preset]);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["platform-usage-report", range.start.toISOString(), range.end.toISOString(), tenantId || "all", userId || "all", eventType || "all"], enabled: canView && tab !== "activity", queryFn: () => fetchUsageReport(range.start, range.end, tenantId || undefined, userId || undefined, (eventType || undefined) as UsageEventType | undefined) });
  const allTenantQuery = useQuery({ queryKey: ["platform-usage-report-tenants", new Date().toISOString().slice(0, 7)], enabled: canView, staleTime: 60_000, queryFn: () => { const now = new Date(); return fetchUsageReport(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), now); } });
  const report = query.data;
  const refresh = () => { void query.refetch(); void allTenantQuery.refetch(); };
  const shared = report ? <><UsageFilters preset={preset} setPreset={setPreset} customStart={customStart} customEnd={customEnd} setCustomStart={setCustomStart} setCustomEnd={setCustomEnd} tenantId={tenantId} setTenantId={(value) => { setTenantId(value); setUserId(""); }} userId={userId} setUserId={setUserId} eventType={eventType} setEventType={setEventType} tenants={allTenantQuery.data?.tenants ?? report.tenants} users={allTenantQuery.data?.users ?? report.users} onRefresh={refresh} refreshing={query.isFetching} />{query.isError ? <div role="alert" className="mt-5 text-sm text-destructive">{t("Could not load usage data.")}</div> : null}</> : null;
  const loading = query.isLoading ? <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("Loading metered usage…")}</div> : null;
  return <Tabs value={tab} onValueChange={(value) => setTab(value as WorkspaceTab)} className="mt-7"><TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-black/20 p-1 md:grid-cols-4"><TabsTrigger value="activity">{t("Activity")}</TabsTrigger><TabsTrigger value="usage">{t("Usage")}</TabsTrigger><TabsTrigger value="billing">{t("Billing estimate")}</TabsTrigger><TabsTrigger value="limits">{t("Limits")}</TabsTrigger></TabsList><TabsContent value="activity"><AuditLogManager canView={canView} /></TabsContent><TabsContent value="usage">{shared}{loading}{report ? <UsageOverview report={report} /> : null}</TabsContent><TabsContent value="billing">{shared}{loading}{report ? <BillingView report={report} onSaved={() => { void queryClient.invalidateQueries({ queryKey: ["platform-usage-report"] }); refresh(); }} /> : null}</TabsContent><TabsContent value="limits"><MapboxTenantLimits />{allTenantQuery.data ? <ResourceLimitsView report={allTenantQuery.data} onSaved={refresh} /> : null}</TabsContent></Tabs>;
}
