export type InvestmentInputs = {
  projectName: string;
  unitLabel: string;
  price: number;
  sizeSqft: number;
  internalSqft: number;
  balconySqft: number;
  areaPsf: number;
  conservativePsf: number;
  optimisticPsf: number;
  annualRent: number;
  serviceChargePsf: number;
  managementPct: number;
  utilitiesMonthly: number;
  furnishedPremium: number;
  dldPct: number;
  dldAdmin: number;
  adminFee: number;
  commissionPct: number;
  yearsToHandover: number;
  priceGrowthPct: number;
  rentGrowthPct: number;
  appreciationPremiumPct: number;
  rentPremiumPct: number;
  bookingPct: number;
  constructionPct: number;
  handoverPct: number;
  postHandoverPct: number;
};

export type ScenarioResult = {
  label: string;
  growthPct: number;
  salePrice: number;
  profit: number;
  returnPct: number;
};

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const positive = (value: number) => Math.max(0, finite(value));
const pct = (value: number) => positive(value) / 100;

export function bandGrowth(rawPct: number) {
  const value = positive(rawPct);
  if (value <= 5) return value;
  if (value <= 10) return Math.max(5, value * 0.75);
  if (value <= 20) return Math.max(7.5, value * 0.5);
  return 10;
}

export function calculateInvestment(source: InvestmentInputs) {
  const input = {
    ...source,
    price: positive(source.price),
    sizeSqft: positive(source.sizeSqft),
    yearsToHandover: Math.max(0.1, positive(source.yearsToHandover)),
  };
  const unitPsf = input.sizeSqft ? input.price / input.sizeSqft : 0;
  const dld = input.price * pct(input.dldPct) + positive(input.dldAdmin);
  const acquisitionCost = input.price + dld + positive(input.adminFee);
  const chargeableArea = input.internalSqft > 0
    ? input.internalSqft + positive(input.balconySqft) * 0.25
    : input.sizeSqft;
  const serviceCharge = positive(input.serviceChargePsf) * chargeableArea * 1.05;
  const usedRentGrowthPct = bandGrowth(input.rentGrowthPct);
  const grossRent = positive(input.annualRent)
    * Math.pow(1 + pct(usedRentGrowthPct), input.yearsToHandover)
    * (1 + pct(input.rentPremiumPct))
    + positive(input.furnishedPremium);
  const management = grossRent * pct(input.managementPct);
  const utilities = positive(input.utilitiesMonthly) * 12;
  const netRent = grossRent - management - utilities - serviceCharge;
  const netYieldPct = acquisitionCost ? (netRent / acquisitionCost) * 100 : 0;
  const usedPriceGrowthPct = bandGrowth(input.priceGrowthPct);
  const conservativePsf = positive(input.conservativePsf);
  const optimisticPsf = positive(input.optimisticPsf);
  const normalPsf = conservativePsf > 0 && optimisticPsf > 0
    ? (conservativePsf + optimisticPsf) / 2
    : conservativePsf || optimisticPsf || positive(input.areaPsf) || unitPsf;
  const selectedPsf = normalPsf;
  const salePrice = selectedPsf * input.sizeSqft
    * Math.pow(1 + pct(usedPriceGrowthPct), input.yearsToHandover)
    * (1 + pct(input.appreciationPremiumPct));
  const commission = salePrice * pct(input.commissionPct);
  const profit = salePrice - acquisitionCost - commission;
  const lifecycleReturn = acquisitionCost ? profit / acquisitionCost : 0;
  const annualizedReturnPct = (1 + lifecycleReturn) > 0
    ? (Math.pow(1 + lifecycleReturn, 1 / input.yearsToHandover) - 1) * 100
    : -100;
  const paidBeforeHandoverPct = positive(input.bookingPct) + positive(input.constructionPct);
  const cashInvested = input.price * pct(paidBeforeHandoverPct) + dld + positive(input.adminFee);
  const cashOnCashPct = cashInvested ? (profit / cashInvested) * 100 : 0;
  const breakEvenSale = (input.price + dld + positive(input.adminFee)) / (1 - pct(input.commissionPct));
  const worthToday = positive(input.areaPsf) * input.sizeSqft;
  const cushionPct = worthToday ? (1 - breakEvenSale / worthToday) * 100 : 0;
  const capitalGrowthPct = unitPsf ? ((positive(input.areaPsf) - unitPsf) / unitPsf) * 100 : 0;
  const priceForSixPctYield = (netRent / 0.06 - positive(input.adminFee) - positive(input.dldAdmin)) / (1 + pct(input.dldPct));
  const strongGrowth = Math.max(8, usedPriceGrowthPct + 3);
  const marketScenarios = [
    ["Market -5%", -5],
    ["Flat market", 0],
    ["Analysis", usedPriceGrowthPct],
    ["Strong market", strongGrowth],
  ].map(([label, growthPct]) => {
    const growth = Number(growthPct);
    const scenarioSale = selectedPsf * input.sizeSqft
      * Math.pow(1 + growth / 100, input.yearsToHandover)
      * (1 + pct(input.appreciationPremiumPct));
    const scenarioProfit = scenarioSale - acquisitionCost - scenarioSale * pct(input.commissionPct);
    return { label: String(label), growthPct: growth, salePrice: scenarioSale, profit: scenarioProfit, returnPct: acquisitionCost ? scenarioProfit / acquisitionCost * 100 : 0 } satisfies ScenarioResult;
  });
  const strongRentGrowth = Math.max(8, usedRentGrowthPct + 3);
  const rentScenarios = [
    ["Rents -5%", -5],
    ["Flat rents", 0],
    ["Analysis", usedRentGrowthPct],
    ["Strong rents", strongRentGrowth],
  ].map(([label, growthPct]) => {
    const growth = Number(growthPct);
    const scenarioGross = positive(input.annualRent) * Math.pow(1 + growth / 100, input.yearsToHandover) * (1 + pct(input.rentPremiumPct)) + positive(input.furnishedPremium);
    const scenarioNet = scenarioGross - scenarioGross * pct(input.managementPct) - utilities - serviceCharge;
    return { label: String(label), growthPct: growth, netRent: scenarioNet, yieldPct: acquisitionCost ? scenarioNet / acquisitionCost * 100 : 0 };
  });
  const paymentPlan = [
    ["Booking", positive(input.bookingPct)],
    ["During construction", positive(input.constructionPct)],
    ["At handover", positive(input.handoverPct)],
    ["Post-handover", positive(input.postHandoverPct)],
  ].map(([label, percentage]) => ({ label: String(label), percentage: Number(percentage), amount: input.price * Number(percentage) / 100 }));
  const paymentTotalPct = paymentPlan.reduce((sum, item) => sum + item.percentage, 0);
  const verdict = profit > 0
    ? (cushionPct >= 5 ? "Profitable at handover, with a cushion" : "Profitable at handover, with a thin cushion")
    : "Loss at handover in this case";

  return {
    input, unitPsf, dld, acquisitionCost, serviceCharge, grossRent, management, utilities, netRent,
    netYieldPct, usedRentGrowthPct, usedPriceGrowthPct, normalPsf, salePrice, commission, profit,
    lifecycleReturnPct: lifecycleReturn * 100, annualizedReturnPct, paidBeforeHandoverPct,
    cashInvested, cashOnCashPct, breakEvenSale, worthToday, cushionPct, capitalGrowthPct,
    priceForSixPctYield, marketScenarios, rentScenarios, paymentPlan, paymentTotalPct, verdict,
  };
}
