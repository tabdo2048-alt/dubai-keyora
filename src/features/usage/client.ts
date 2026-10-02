import { sbAny } from "@/integrations/supabase/saas";
import type { UsageEventType, UsageReport } from "./types";

const APP_SESSION_KEY = "keyora:usage-session:v1";

export function appUsageSessionId(): string | null {
  if (typeof window === "undefined") return null;
  const existing = window.sessionStorage.getItem(APP_SESSION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(APP_SESSION_KEY, created);
  return created;
}

export async function recordUsageEvent(
  eventType: UsageEventType,
  metadata: Record<string, unknown> = {},
  tenantId?: string | null,
): Promise<void> {
  if (typeof window === "undefined") return;
  const sessionId = appUsageSessionId();
  const { data: sessionData } = await sbAny.auth.getSession();
  const isAuthenticatedUser = Boolean(sessionData.session?.user && !sessionData.session.user.is_anonymous);
  if (!isAuthenticatedUser) {
    if (eventType !== "mapbox_map_initialized" || !sessionId) return;
    const { error } = await sbAny.rpc("record_public_mapbox_initialization", {
      _session_id: sessionId,
      _metadata: metadata,
    });
    if (error && import.meta.env.DEV) console.warn("[usage] public Mapbox initialization was not recorded", error.message);
    return;
  }
  const { error } = await sbAny.rpc("record_usage_event", {
    _event_type: eventType,
    _session_id: sessionId,
    _metadata: metadata,
    _tenant_id: tenantId ?? null,
  });
  if (error && import.meta.env.DEV) {
    console.warn(`[usage] ${eventType} was not recorded`, error.message);
  }
}

export function recordMapboxInitialization(
  mapInstanceId: string,
  mapMode: string,
  tenantId?: string | null,
  reservationId?: string | null,
): void {
  void recordUsageEvent(
    "mapbox_map_initialized",
    {
      map_instance_id: mapInstanceId,
      ...(reservationId ? { reservation_id: reservationId } : {}),
      map_mode: mapMode,
      route: typeof window === "undefined" ? null : window.location.pathname,
    },
    tenantId,
  );
}

export async function requestMapboxLoad(tenantId: string | null, mapInstanceId: string): Promise<{ allowed: boolean; reservationId: string | null }> {
  const { data, error } = await sbAny.rpc("request_mapbox_load", { _tenant_id: tenantId, _map_instance_id: mapInstanceId });
  // Deploys still awaiting the existing tenant-limit migration retain the old
  // metered Satellite behavior. Any other RPC error blocks this new load.
  if (error?.code === "PGRST202" || error?.code === "42883") return { allowed: true, reservationId: null };
  if (error) throw error;
  return { allowed: data?.allowed === true, reservationId: data?.reservation_id ?? null };
}

export async function releaseMapboxLoad(reservationId: string): Promise<void> {
  const { error } = await sbAny.rpc("release_mapbox_load", { _reservation_id: reservationId });
  if (error && import.meta.env.DEV) console.warn("[usage] Mapbox reservation release failed", error.message);
}

export type MapboxMonthlyReport = {
  month: string;
  total_loads: number;
  tenants: Array<{
    id: string; name: string; plan: string | null; monthly_limit: number | null;
    mode: "warning" | "overage" | "hard_limit" | "unlimited";
    source: "tenant" | "plan" | "platform";
    overage_price_per_1000: number; limit_recorded: boolean; used: number;
  }>;
};

export async function fetchMapboxMonthlyReport(month: string): Promise<MapboxMonthlyReport> {
  const { data, error } = await sbAny.rpc("platform_mapbox_monthly_usage", { _month: `${month}-01` });
  if (error) throw error;
  return data as MapboxMonthlyReport;
}

export async function setTenantMapboxLimit(input: {
  tenantId: string; monthlyLimit: number | null; mode: MapboxMonthlyReport["tenants"][number]["mode"]; overagePrice: number;
}): Promise<void> {
  const { error } = await sbAny.rpc("platform_set_tenant_mapbox_limit", {
    _tenant_id: input.tenantId,
    _monthly_limit: input.monthlyLimit,
    _mode: input.mode,
    _overage_price_per_1000: input.overagePrice,
  });
  if (error) throw error;
}

export async function fetchUsageReport(
  start: Date,
  end: Date,
  tenantId?: string,
  userId?: string,
  eventType?: UsageEventType,
): Promise<UsageReport> {
  const { data, error } = await sbAny.rpc("platform_usage_report", {
    _start_at: start.toISOString(),
    _end_at: end.toISOString(),
    _tenant_id: tenantId ?? null,
    _user_id: userId ?? null,
    _event_type: eventType ?? null,
  });
  if (error) throw error;
  return data as UsageReport;
}

export async function saveBillingSettings(input: {
  monthly_free_mapbox_loads: number;
  mapbox_pricing_tiers: Array<{ up_to: number | null; price_per_1000: number }>;
  currency: string;
  allocation_strategy: "proportional_usage" | "included_quota_overage";
}): Promise<void> {
  const { error } = await sbAny
    .from("usage_billing_settings")
    .update(input)
    .eq("singleton", true);
  if (error) throw error;
}

export async function saveTenantLimits(tenantId: string, input: Record<string, unknown>): Promise<void> {
  const { error } = await sbAny
    .from("tenant_usage_limits")
    .update(input)
    .eq("tenant_id", tenantId);
  if (error) throw error;
}
