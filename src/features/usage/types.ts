export const USAGE_EVENT_TYPES = [
  "mapbox_map_initialized",
  "cesium_initialized",
  "tour_opened",
  "scene_viewed",
  "pdf_generated",
  "project_viewed",
  "login_success",
] as const;

export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];
export type LimitAction = "soft_limit" | "hard_limit" | "overage";
export type AllocationStrategy = "proportional_usage" | "included_quota_overage";

export type MapboxPricingTier = {
  up_to: number | null;
  price_per_1000: number;
};
export type UsageBillingSettings = {
  singleton: boolean;
  monthly_free_mapbox_loads: number;
  mapbox_pricing_tiers: MapboxPricingTier[];
  currency: string;
  billing_period: "monthly" | "annual";
  allocation_strategy: AllocationStrategy;
  updated_at: string;
};

export type TenantUsageRow = {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  subscription_status: string;
  current_period_end: string | null;
  users: number;
  projects: number;
  tours: number;
  storage_bytes: number;
  mapbox_loads: number;
  logins: number;
  tour_opens: number;
  pdfs: number;
  project_views: number;
  active_users: number;
  max_projects: number | null;
  max_users: number | null;
  max_360_tours: number | null;
  max_storage_bytes: number | null;
  included_mapbox_loads: number | null;
  mapbox_overage_enabled: boolean;
  mapbox_overage_price_per_1000: number | null;
  limit_action: LimitAction;
  subscription_revenue: number | null;
  revenue_period: "monthly" | "annual" | null;
};

export type UserUsageRow = {
  tenant_id: string | null;
  user_id: string;
  email: string | null;
  last_active: string;
  logins: number;
  mapbox_loads: number;
  tour_opens: number;
  pdfs: number;
  project_views: number;
};

export type DailyUsageRow = {
  usage_date: string;
  tenant_id: string | null;
  mapbox_loads: number;
};

export type RecentMapboxEvent = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  email: string | null;
  session_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type UsageReport = {
  range: { start: string; end: string };
  summary: {
    total_tenants: number;
    active_users: number;
    mapbox_loads: number;
    logins: number;
    tour_opens: number;
    pdfs: number;
    projects: number;
    tours: number;
    storage_bytes: number;
  };
  settings: UsageBillingSettings;
  tenants: TenantUsageRow[];
  users: UserUsageRow[];
  daily: DailyUsageRow[];
  recent_mapbox: RecentMapboxEvent[];
};
