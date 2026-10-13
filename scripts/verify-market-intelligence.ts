import assert from "node:assert/strict";
import { DUBAI_INVESTMENT_AREAS } from "../src/lib/dubai-market-catalog";
import { parseDldProjectsCsv } from "../src/lib/dld-projects-csv";
import { calculateInvestment, type InvestmentInputs } from "../src/lib/investment-analysis";
import { buildMarketDecision } from "../src/lib/market-decision";

assert.ok(DUBAI_INVESTMENT_AREAS.includes("Dubai South"), "Dubai South must be available in the market filter");

const csv = `Project Number,Project Name,Developer Name,Area Name,Project Status,Project Type,Completion Date,Percent Completed,Total Units,Master Project
101,"South, Residences",Example Developer,Dubai South,ACTIVE,Residential,2028-12-31,42%,350,Dubai South
102,Creek Tower,Another Developer,Dubai Creek Harbour,COMPLETED,Mixed Use,2025-01-10,100%,220,Dubai Creek Harbour`;
const projects = parseDldProjectsCsv(csv);

assert.equal(projects.length, 2);
assert.equal(projects[0].name, "South, Residences");
assert.equal(projects[0].areaName, "Dubai South");
assert.equal(projects[0].completedPct, 42);
assert.equal(projects[1].totalUnits, 220);

const inputs: InvestmentInputs = {
  projectName: "Test project",
  unitLabel: "1BR",
  price: 1_000_000,
  sizeSqft: 800,
  internalSqft: 740,
  balconySqft: 60,
  areaPsf: 1_450,
  conservativePsf: 1_400,
  optimisticPsf: 1_600,
  annualRent: 82_000,
  serviceChargePsf: 15,
  managementPct: 5,
  utilitiesMonthly: 0,
  furnishedPremium: 0,
  dldPct: 4,
  dldAdmin: 580,
  adminFee: 5_000,
  commissionPct: 2,
  yearsToHandover: 2,
  priceGrowthPct: 5,
  rentGrowthPct: 4,
  appreciationPremiumPct: 0,
  rentPremiumPct: 0,
  bookingPct: 20,
  constructionPct: 30,
  handoverPct: 50,
  postHandoverPct: 0,
};

const result = calculateInvestment(inputs);
const incompleteDecision = buildMarketDecision({ result, researchCount: 0, hasWorkspaceProject: false, strategy: "balanced", risk: "medium" });
assert.equal(incompleteDecision.action, "اجمع بيانات");
assert.equal(incompleteDecision.confidence, "منخفضة");

const researchedDecision = buildMarketDecision({ result, researchCount: 3, hasWorkspaceProject: true, strategy: "balanced", risk: "medium" });
assert.notEqual(researchedDecision.action, "اجمع بيانات");
assert.equal(researchedDecision.confidence, "مرتفعة");

console.log(`Market intelligence verified: ${projects.length} CSV rows, ${DUBAI_INVESTMENT_AREAS.length} Dubai areas, decision score ${researchedDecision.score}/100.`);
