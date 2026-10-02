import type { MapboxPricingTier, TenantUsageRow } from "./types";

export type ProviderCostEstimate = {
  actualLoads: number;
  freeLoads: number;
  billableLoads: number;
  estimatedCost: number;
};

function finiteNonNegative(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
export function normalizePricingTiers(value: unknown): MapboxPricingTier[] {
  if (!Array.isArray(value)) return [];
  const tiers = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { up_to?: unknown; price_per_1000?: unknown };
    const price = Number(row.price_per_1000);
    const upTo = row.up_to == null ? null : Number(row.up_to);
    if (!Number.isFinite(price) || price < 0) return [];
    if (upTo !== null && (!Number.isFinite(upTo) || upTo < 0)) return [];
    return [{ up_to: upTo, price_per_1000: price }];
  });
  return tiers.sort((a, b) => {
    if (a.up_to === null) return 1;
    if (b.up_to === null) return -1;
    return a.up_to - b.up_to;
  });
}

export function calculateProviderMapboxCost(
  loadCount: number,
  freeThreshold: number,
  pricingTiers: MapboxPricingTier[],
): ProviderCostEstimate {
  const actualLoads = Math.floor(finiteNonNegative(loadCount));
  const freeLoads = Math.min(actualLoads, Math.floor(finiteNonNegative(freeThreshold)));
  const billableLoads = Math.max(0, actualLoads - freeLoads);
  if (billableLoads === 0) return { actualLoads, freeLoads, billableLoads, estimatedCost: 0 };

  const tiers = normalizePricingTiers(pricingTiers);
  let cursor = freeLoads;
  let remaining = billableLoads;
  let estimatedCost = 0;
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const capacity = tier.up_to === null ? remaining : Math.max(0, tier.up_to - cursor);
    const units = Math.min(remaining, capacity);
    estimatedCost += (units / 1000) * tier.price_per_1000;
    remaining -= units;
    cursor += units;
  }
  return { actualLoads, freeLoads, billableLoads, estimatedCost };
}

export function calculateTenantOverage(tenant: TenantUsageRow) {
  const included = tenant.included_mapbox_loads;
  const overageLoads = included == null ? 0 : Math.max(0, tenant.mapbox_loads - included);
  const rate = finiteNonNegative(tenant.mapbox_overage_price_per_1000);
  const overageCharge = tenant.mapbox_overage_enabled ? (overageLoads / 1000) * rate : 0;
  return { included, overageLoads, overageCharge };
}

export function allocateProviderCost(totalCost: number, tenantLoads: number, platformLoads: number): number {
  if (totalCost <= 0 || tenantLoads <= 0 || platformLoads <= 0) return 0;
  return totalCost * (tenantLoads / platformLoads);
}

/** Recognize subscription revenue over the selected date range, then subtract its allocated variable cost. */
export function estimateGrossContribution(
  subscriptionRevenue: number | null,
  revenuePeriod: "monthly" | "annual" | null,
  allocatedCost: number,
  rangeStart: Date,
  rangeEnd: Date,
): number | null {
  if (subscriptionRevenue == null || !Number.isFinite(subscriptionRevenue)) return null;
  const end = new Date(Math.min(rangeEnd.getTime(), Date.now()));
  if (!Number.isFinite(rangeStart.getTime()) || !Number.isFinite(end.getTime()) || end <= rangeStart) return null;

  const monthlyRevenue = subscriptionRevenue / (revenuePeriod === "annual" ? 12 : 1);
  let recognizedRevenue = 0;
  for (let month = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1); month < end; month = new Date(month.getFullYear(), month.getMonth() + 1, 1)) {
    const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const overlap = Math.max(0, Math.min(end.getTime(), nextMonth.getTime()) - Math.max(rangeStart.getTime(), month.getTime()));
    recognizedRevenue += monthlyRevenue * overlap / (nextMonth.getTime() - month.getTime());
  }
  return recognizedRevenue - allocatedCost;
}

export function usagePercent(used: number, limit: number | null): number | null {
  if (limit == null) return null;
  if (limit === 0) return used > 0 ? 100 : 0;
  return Math.max(0, (used / limit) * 100);
}

export function warningThreshold(percent: number | null): 70 | 80 | 90 | 100 | null {
  if (percent == null || percent < 70) return null;
  if (percent >= 100) return 100;
  if (percent >= 90) return 90;
  if (percent >= 80) return 80;
  return 70;
}

export function usageProjection(loads: number, rangeStart: Date, now: Date, periodEnd: Date) {
  const elapsedMs = Math.max(1, now.getTime() - rangeStart.getTime());
  const elapsedDays = elapsedMs / 86_400_000;
  const totalDays = Math.max(elapsedDays, (periodEnd.getTime() - rangeStart.getTime()) / 86_400_000);
  const averagePerDay = loads / elapsedDays;
  const projectedMonthlyLoads = Math.round(averagePerDay * totalDays);
  return {
    averagePerDay,
    projectedMonthlyLoads,
    projectedAnnualLoads: Math.round(projectedMonthlyLoads * 12),
  };
}
