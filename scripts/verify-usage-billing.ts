import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calculateProviderMapboxCost,
  calculateTenantOverage,
  estimateGrossContribution,
  warningThreshold,
} from "../src/features/usage/billing";
import type { MapboxPricingTier, TenantUsageRow } from "../src/features/usage/types";

const tiers: MapboxPricingTier[] = [
  { up_to: 100_000, price_per_1000: 5 },
  { up_to: 200_000, price_per_1000: 4 },
  { up_to: 1_000_000, price_per_1000: 3 },
  { up_to: 5_000_000, price_per_1000: 2.5 },
  { up_to: null, price_per_1000: 2.5 },
];

assert.deepEqual(calculateProviderMapboxCost(50_000, 50_000, tiers), {
  actualLoads: 50_000,
  freeLoads: 50_000,
  billableLoads: 0,
  estimatedCost: 0,
});
assert.equal(calculateProviderMapboxCost(60_000, 50_000, tiers).estimatedCost, 50);
assert.equal(calculateProviderMapboxCost(100_000, 50_000, tiers).estimatedCost, 250);
assert.equal(calculateProviderMapboxCost(150_000, 50_000, tiers).estimatedCost, 450);
assert.equal(calculateProviderMapboxCost(250_000, 50_000, tiers).estimatedCost, 800);

const tenant = {
  mapbox_loads: 31_500,
  included_mapbox_loads: 25_000,
  mapbox_overage_enabled: true,
  mapbox_overage_price_per_1000: 5,
} as TenantUsageRow;
assert.deepEqual(calculateTenantOverage(tenant), {
  included: 25_000,
  overageLoads: 6_500,
  overageCharge: 32.5,
});
assert.equal(warningThreshold(69.99), null);
assert.equal(warningThreshold(70), 70);
assert.equal(warningThreshold(80), 80);
assert.equal(warningThreshold(90), 90);
assert.equal(warningThreshold(100), 100);

const januaryStart = new Date(2026, 0, 1);
const februaryStart = new Date(2026, 1, 1);
assert.equal(estimateGrossContribution(1200, "annual", 20, januaryStart, februaryStart), 80);
assert.equal(estimateGrossContribution(100, "monthly", 20, januaryStart, februaryStart), 80);
assert.equal(estimateGrossContribution(null, "monthly", 20, januaryStart, februaryStart), null);
assert.equal(estimateGrossContribution(100, "monthly", 0, februaryStart, januaryStart), null);
assert.ok(Math.abs((estimateGrossContribution(100, "monthly", 0, januaryStart, new Date(2026, 0, 16, 12)) ?? 0) - 50) < 0.01);

const mapboxSource = readFileSync("src/components/map/MapboxView.tsx", "utf8");
assert.match(mapboxSource, /new mapboxgl\.Map\(/);
assert.match(mapboxSource, /map\.once\("load", \(\) => \{[^}]*recordMapboxInitialization\(mapInstanceId, mode, tenantIdRef\.current, reservationId\)/);
assert.doesNotMatch(mapboxSource, /map\.on\("(?:move|moveend|zoom|zoomend|click)"[^]*recordMapboxInitialization/);

const migration = readFileSync("supabase/migrations/20260928084108_add_tenant_usage_billing.sql", "utf8");
assert.match(migration, /alter table public\.usage_events enable row level security/i);
assert.match(migration, /Cannot record usage for another tenant/);
assert.match(migration, /record_public_mapbox_initialization/);
assert.match(migration, /Public usage event rate limit exceeded/);
assert.match(migration, /event_type = 'mapbox_map_initialized'/);
assert.match(migration, /create table public\.tenant_usage_daily/);

console.log("Usage metering and billing checks passed.");
