import assert from "node:assert/strict";
import { bandGrowth, calculateInvestment, type InvestmentInputs } from "../src/lib/investment-analysis";

const input: InvestmentInputs = {
  projectName: "Test project", unitLabel: "1BR", price: 1_250_000, sizeSqft: 780,
  internalSqft: 700, balconySqft: 80, areaPsf: 1750, conservativePsf: 1650, optimisticPsf: 1850,
  annualRent: 95_000, serviceChargePsf: 16, managementPct: 5, utilitiesMonthly: 0,
  furnishedPremium: 0, dldPct: 4, dldAdmin: 40, adminFee: 4000, commissionPct: 2.1,
  yearsToHandover: 2, priceGrowthPct: 5, rentGrowthPct: 5, appreciationPremiumPct: 0,
  rentPremiumPct: 0, bookingPct: 20, constructionPct: 30, handoverPct: 50, postHandoverPct: 0,
};

const result = calculateInvestment(input);
assert.equal(result.paymentTotalPct, 100);
assert.equal(result.marketScenarios.length, 4);
assert.equal(result.rentScenarios.length, 4);
assert.ok(result.acquisitionCost > input.price);
assert.ok(result.marketScenarios[0].profit < result.marketScenarios[2].profit);
assert.ok(result.netRent < result.grossRent);
assert.equal(bandGrowth(-5), 0);
assert.equal(bandGrowth(8), 6);
assert.equal(bandGrowth(25), 10);
console.log("investment analysis checks passed");
