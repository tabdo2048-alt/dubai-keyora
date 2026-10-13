import { createFileRoute } from "@tanstack/react-router";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { InvestmentAnalysis } from "@/components/analysis/InvestmentAnalysis";

export const Route = createFileRoute("/_authenticated/investment-analysis")({
  head: () => ({ meta: [{ title: "Investment comparison — KEYORA" }] }),
  component: InvestmentAnalysisPage,
});

function InvestmentAnalysisPage() {
  return <div className="min-h-screen bg-background"><AppNavbar /><main className="mx-auto max-w-7xl px-4 py-8"><InvestmentAnalysis /></main></div>;
}
