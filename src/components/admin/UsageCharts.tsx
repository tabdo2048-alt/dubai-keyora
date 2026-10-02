import { useMemo, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TenantUsageRow, UserUsageRow } from "@/features/usage/types";
import { useActivityLogLanguage } from "./useActivityLogLanguage";

type DailyPoint = { date: string; loads: number };

function ChartShell({ title, children }: { title: string; children: ReactNode }) {
  return <div className="glass gold-hairline rounded-2xl p-5"><h3 className="font-display text-xl text-cream">{title}</h3><div className="mt-4 h-64">{children}</div></div>;
}

const axisTick = { fill: "#9ca3af", fontSize: 11 };

export default function UsageCharts({ daily, tenants, users }: { daily: DailyPoint[]; tenants: TenantUsageRow[]; users: UserUsageRow[] }) {
  const { t } = useActivityLogLanguage();
  const monthly = useMemo(() => {
    const totals = new Map<string, number>();
    for (const point of daily) {
      const month = point.date.slice(0, 7);
      totals.set(month, (totals.get(month) ?? 0) + point.loads);
    }
    return [...totals].map(([month, loads]) => ({ month, loads }));
  }, [daily]);
  const tenantData = tenants.slice(0, 10).map((tenant) => ({ name: tenant.name, loads: tenant.mapbox_loads }));
  const userData = users.slice(0, 10).map((user) => ({ name: user.email ?? user.user_id.slice(0, 8), loads: user.mapbox_loads }));

  return <div className="grid gap-6 xl:grid-cols-2">
    <ChartShell title={t("Mapbox loads by day")}><ResponsiveContainer width="100%" height="100%"><LineChart data={daily}><XAxis dataKey="date" tick={axisTick} /><YAxis allowDecimals={false} tick={axisTick} /><Tooltip /><Line type="monotone" dataKey="loads" stroke="#d5b75f" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></ChartShell>
    <ChartShell title={t("Mapbox loads by tenant")}><ResponsiveContainer width="100%" height="100%"><BarChart data={tenantData}><XAxis dataKey="name" tick={axisTick} interval={0} angle={-15} height={54} /><YAxis allowDecimals={false} tick={axisTick} /><Tooltip /><Bar dataKey="loads" fill="#d5b75f" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></ChartShell>
    <ChartShell title={t("Top users")}><ResponsiveContainer width="100%" height="100%"><BarChart data={userData} layout="vertical"><XAxis type="number" allowDecimals={false} tick={axisTick} /><YAxis type="category" dataKey="name" width={110} tick={axisTick} /><Tooltip /><Bar dataKey="loads" fill="#b99b4c" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></ChartShell>
    <ChartShell title={t("Monthly usage trend")}><ResponsiveContainer width="100%" height="100%"><LineChart data={monthly}><XAxis dataKey="month" tick={axisTick} /><YAxis allowDecimals={false} tick={axisTick} /><Tooltip /><Line type="monotone" dataKey="loads" stroke="#f0dc94" strokeWidth={2} /></LineChart></ResponsiveContainer></ChartShell>
  </div>;
}
