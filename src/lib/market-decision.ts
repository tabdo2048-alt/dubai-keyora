import type { calculateInvestment } from "@/lib/investment-analysis";

type InvestmentResult = ReturnType<typeof calculateInvestment>;

export type InvestorStrategy = "income" | "growth" | "balanced";
export type InvestorRisk = "low" | "medium" | "high";

export type MarketDecision = {
  score: number;
  confidence: "منخفضة" | "متوسطة" | "مرتفعة";
  action: "اجمع بيانات" | "استبعد مؤقتًا" | "تفاوض" | "تقدم للفحص النهائي";
  summary: string;
  positives: string[];
  risks: string[];
  nextSteps: string[];
};

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

export function buildMarketDecision({
  result,
  researchCount,
  hasWorkspaceProject,
  strategy,
  risk,
}: {
  result: InvestmentResult;
  researchCount: number;
  hasWorkspaceProject: boolean;
  strategy: InvestorStrategy;
  risk: InvestorRisk;
}): MarketDecision {
  const positives: string[] = [];
  const risks: string[] = [];
  let score = 50;

  if (result.netYieldPct >= 7) { score += strategy === "income" ? 20 : 14; positives.push("صافي العائد الإيجاري أعلى من 7%."); }
  else if (result.netYieldPct >= 6) { score += 9; positives.push("صافي العائد الإيجاري وصل إلى نطاق 6% المقبول."); }
  else if (result.netYieldPct < 5) { score -= strategy === "income" ? 18 : 10; risks.push("العائد الإيجاري أقل من 5% في الافتراض الحالي."); }

  if (result.annualizedReturnPct >= 10) { score += strategy === "growth" ? 18 : 12; positives.push("العائد السنوي المتوقع مزدوج الرقم."); }
  else if (result.annualizedReturnPct < 4) { score -= 12; risks.push("العائد السنوي المتوقع ضعيف مقابل مدة التسليم."); }

  const downside = result.marketScenarios[0]?.profit ?? 0;
  if (downside >= 0) { score += 14; positives.push("الصفقة تظل موجبة في سيناريو هبوط السوق 5%."); }
  else { score -= risk === "low" ? 18 : risk === "medium" ? 12 : 7; risks.push("سيناريو هبوط السوق 5% ينتج خسارة."); }

  if (result.cushionPct >= 5) { score += 10; positives.push("يوجد هامش أمان سعري لا يقل عن 5%."); }
  else if (result.cushionPct < 0) { score -= 12; risks.push("سعر التعادل أعلى من قيمة المنطقة المستخدمة في الحساب."); }

  if (Math.abs(result.paymentTotalPct - 100) >= 0.01) { score -= 20; risks.push("خطة الدفع غير مكتملة أو لا تساوي 100%."); }
  if (!hasWorkspaceProject) { score -= 12; risks.push("لم يتم ربط القرار بمشروع موثق داخل مساحة العمل."); }
  if (researchCount === 0) { score -= 18; risks.push("لا توجد مقارنات سعر وإيجار موثقة من السوق."); }
  else if (researchCount >= 3) { score += 8; positives.push("الافتراضات مدعومة بثلاثة مصادر سوق أو أكثر."); }

  const finalScore = clamp(score);
  const confidence = researchCount >= 3 && hasWorkspaceProject ? "مرتفعة" : researchCount >= 1 && hasWorkspaceProject ? "متوسطة" : "منخفضة";
  const action = researchCount === 0 || !hasWorkspaceProject
    ? "اجمع بيانات"
    : finalScore < 45
      ? "استبعد مؤقتًا"
      : finalScore < 72
        ? "تفاوض"
        : "تقدم للفحص النهائي";

  const summary = action === "اجمع بيانات"
    ? "الأرقام الحالية لا تكفي لقرار شراء. أكمل سعر الوحدة والإيجار والمقارنات أولًا."
    : action === "استبعد مؤقتًا"
      ? "المخاطر أعلى من العائد وفق الافتراضات الحالية. لا تدفع حجزًا قبل تغيير السعر أو الشروط."
      : action === "تفاوض"
        ? "الصفقة قابلة للتحسين. تفاوض على السعر أو خطة الدفع ثم أعد تشغيل السيناريو الضعيف."
        : "النتيجة قوية مبدئيًا، لكنها تحتاج تحققًا قانونيًا وفنيًا قبل الحجز.";

  const nextSteps = action === "اجمع بيانات"
    ? ["أدخل 3 مقارنات بيع حديثة على الأقل.", "أدخل إيجارات فعلية لنفس نوع الوحدة.", "اربط وحدة وخطة دفع من المشروع."]
    : action === "استبعد مؤقتًا"
      ? ["احسب أقصى سعر شراء يحقق 6% عائد.", "اطلب خصمًا أو إعفاء رسوم.", "قارن مع مشروعين في نفس المنطقة."]
      : action === "تفاوض"
        ? ["استخدم سعر التعادل كحد تفاوض.", "ثبّت كل الوعود داخل SPA.", "اختبر تأخير التسليم 12 شهرًا."]
        : ["تحقق من تسجيل المشروع وحساب الضمان.", "راجع SPA مع مستشار مستقل.", "أكد رسوم الخدمة وخطة الخروج."];

  return { score: finalScore, confidence, action, summary, positives, risks, nextSteps };
}
