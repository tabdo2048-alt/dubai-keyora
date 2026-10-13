import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, BrainCircuit, Building2, CheckCircle2, Database, Download, ExternalLink, Info, LineChart, Loader2, MapPin, RotateCcw, Search, ShieldCheck, Target, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjectById, useProjects } from "@/hooks/use-projects";
import { calculateInvestment, type InvestmentInputs } from "@/lib/investment-analysis";
import { displayPaymentPlans, type DisplayPaymentPlan } from "@/lib/payment-plans";
import { displayUnitTypes, pricedUnitTypes } from "@/lib/unit-types";
import { toast } from "sonner";
import { MarketDiscoveryPanel } from "@/components/analysis/MarketDiscoveryPanel";
import { buildMarketDecision, type InvestorRisk, type InvestorStrategy } from "@/lib/market-decision";

function ManagementPageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action: ReactNode }) {
  return <header className="flex flex-col gap-4 rounded-3xl border border-gold/20 bg-gradient-to-br from-gold/10 to-transparent p-6 md:flex-row md:items-center md:justify-between"><div><p className="text-xs uppercase tracking-widest text-gold">{eyebrow}</p><h1 className="mt-2 font-display text-3xl text-cream">{title}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p></div>{action}</header>;
}

type ComparisonItem = { key: string; inputs: InvestmentInputs; researchCount: number; savedAt: string };

const defaults: InvestmentInputs = {
  projectName: "Dubai off-plan project", unitLabel: "1 bedroom", price: 1_250_000, sizeSqft: 780,
  internalSqft: 700, balconySqft: 80, areaPsf: 1750, conservativePsf: 1650, optimisticPsf: 1850,
  annualRent: 95_000, serviceChargePsf: 16, managementPct: 5, utilitiesMonthly: 0,
  furnishedPremium: 0, dldPct: 4, dldAdmin: 40, adminFee: 4000, commissionPct: 2.1,
  yearsToHandover: 2, priceGrowthPct: 5, rentGrowthPct: 5, appreciationPremiumPct: 0,
  rentPremiumPct: 0, bookingPct: 20, constructionPct: 30, handoverPct: 50, postHandoverPct: 0,
};

type SourceKey = "bayut" | "dxb" | "propertyFinder" | "propertyMonitor";
type SourceValue = { rent: number; psf: number; sample: number; period: string };
const sourceDefaults: Record<SourceKey, SourceValue> = {
  bayut: { rent: 0, psf: 0, sample: 0, period: "Last 12 months" },
  dxb: { rent: 0, psf: 0, sample: 0, period: "Last 12 months" },
  propertyFinder: { rent: 0, psf: 0, sample: 0, period: "Last 12 months" },
  propertyMonitor: { rent: 0, psf: 0, sample: 0, period: "Last 12 months" },
};
const sourceMeta: Array<{ key: SourceKey; name: string; access: string; description: string }> = [
  { key: "bayut", name: "Bayut", access: "Public", description: "Listings and transaction trends" },
  { key: "dxb", name: "DXB Interact", access: "Public", description: "Transactions, supply and market trends" },
  { key: "propertyFinder", name: "Property Finder", access: "Public", description: "Price and rent comparables" },
  { key: "propertyMonitor", name: "Property Monitor", access: "Login required", description: "Professional transaction data" },
];

const money = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-AE", { maximumFractionDigits: 1 });
const moneyValue = (value: number) => money.format(Number.isFinite(value) ? value : 0);
const pctValue = (value: number) => `${number.format(Number.isFinite(value) ? value : 0)}%`;
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function yearsUntil(value: string | null | undefined) {
  if (!value) return defaults.yearsToHandover;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return Math.max(0.1, (parsed.getTime() - Date.now()) / 31_557_600_000);
  const match = value.match(/Q([1-4])\s*(20\d{2})/i);
  if (!match) return defaults.yearsToHandover;
  return Math.max(0.1, (new Date(Number(match[2]), Number(match[1]) * 3, 0).getTime() - Date.now()) / 31_557_600_000);
}

function splitPaymentPlan(plan: DisplayPaymentPlan | undefined) {
  const split = { bookingPct: 0, constructionPct: 0, handoverPct: 0, postHandoverPct: 0 };
  for (const installment of plan?.installments ?? []) {
    const label = `${installment.label ?? ""} ${installment.due_type ?? ""} ${installment.due_label ?? ""}`.toLowerCase();
    const value = Number(installment.percentage) || 0;
    if (/post|after/.test(label)) split.postHandoverPct += value;
    else if (/handover|completion/.test(label)) split.handoverPct += value;
    else if (/booking|reservation|down/.test(label)) split.bookingPct += value;
    else split.constructionPct += value;
  }
  return Object.values(split).some(Boolean) ? split : null;
}

function Field({ label, value, onChange, suffix, min = 0 }: { label: string; value: number; onChange: (value: number) => void; suffix?: string; min?: number }) {
  return <div className="space-y-2"><Label className="text-xs text-muted-foreground">{label}</Label><div className="relative"><Input type="number" inputMode="decimal" min={min} step="any" value={value} onChange={(event) => onChange(Number(event.target.value))} className="border-white/10 bg-black/20 pr-14 text-cream" />{suffix ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] uppercase text-muted-foreground">{suffix}</span> : null}</div></div>;
}

function Metric({ label, value, hint, tone = "gold" }: { label: string; value: string; hint: string; tone?: "gold" | "green" | "red" }) {
  const color = tone === "green" ? "text-emerald-300" : tone === "red" ? "text-red-300" : "text-gold";
  return <article className="glass gold-hairline rounded-2xl p-4"><div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div><div className={`mt-3 font-display text-2xl ${color}`}>{value}</div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p></article>;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] ?? char));
}

export function InvestmentAnalysis() {
  const [inputs, setInputs] = useState(defaults);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [loadedFromProject, setLoadedFromProject] = useState(false);
  const [sources, setSources] = useState(sourceDefaults);
  const [comparison, setComparison] = useState<ComparisonItem[]>([]);
  const [strategy, setStrategy] = useState<InvestorStrategy>("balanced");
  const [risk, setRisk] = useState<InvestorRisk>("medium");
  const projectsQuery = useProjects();
  const projectQuery = useProjectById(selectedProjectId || null);
  const project = projectQuery.data;
  const units = useMemo(() => pricedUnitTypes(displayUnitTypes(project?.unit_types, project?.starting_price_aed)), [project]);
  const plans = useMemo(() => displayPaymentPlans(project?.payment_plans, project?.payment_plan), [project]);
  const selectedUnit = units.find((item) => item.id === selectedUnitId) ?? units[0];
  const selectedPlan = plans.find((item) => item.id === selectedPlanId) ?? plans.find((item) => item.is_default) ?? plans[0];
  const result = useMemo(() => calculateInvestment(inputs), [inputs]);
  const researchCount = Object.values(sources).filter((source) => source.rent > 0 || source.psf > 0).length;
  const decision = useMemo(() => buildMarketDecision({ result, researchCount, hasWorkspaceProject: loadedFromProject, strategy, risk }), [loadedFromProject, researchCount, result, risk, strategy]);
  const addComparison = () => {
    if (!loadedFromProject || !selectedProjectId) { toast.info("اختار مشروع وحمّل بياناته أولًا."); return; }
    if (inputs.price <= 0 || inputs.sizeSqft <= 0 || Math.abs(result.paymentTotalPct - 100) >= 0.01) {
      toast.error("راجع السعر والمساحة؛ مجموع خطة الدفع لازم يكون 100%."); return;
    }
    const key = `${selectedProjectId}:${selectedUnit?.id ?? ""}:${selectedPlan?.id ?? ""}`;
    if (comparison.length >= 3 && !comparison.some((item) => item.key === key)) { toast.info("يمكن مقارنة 3 تحليلات؛ احذف واحدًا لإضافة آخر."); return; }
    const snapshot = { key, inputs: { ...inputs }, researchCount, savedAt: new Date().toLocaleString("ar-EG") };
    setComparison((current) => [...current.filter((item) => item.key !== key), snapshot]);
    toast.success("تمت إضافة التحليل الحالي للمقارنة.");
  };
  const set = (key: keyof InvestmentInputs, value: string | number) => setInputs((current) => ({ ...current, [key]: value }));
  const researchQuery = encodeURIComponent([project?.name, project?.community?.name, selectedUnit?.label, "Dubai"].filter(Boolean).join(" "));
  const sourceLinks: Record<SourceKey, string> = {
    bayut: `https://www.bayut.com/for-sale/property/dubai/?q=${researchQuery}`,
    dxb: "https://dxbinteract.com/",
    propertyFinder: `https://www.propertyfinder.ae/en/search?c=1&ob=mr&page=1&q=${researchQuery}`,
    propertyMonitor: "https://propertymonitor.com/",
  };

  const chooseProject = (id: string) => {
    setSelectedProjectId(id); setSelectedUnitId(""); setSelectedPlanId(""); setLoadedFromProject(false);
  };

  const applyProjectData = () => {
    if (!project || !selectedUnit) return;
    const areas = [Number(selectedUnit.area_sqm_min), Number(selectedUnit.area_sqm_max)].filter((value) => value > 0);
    const sizeSqft = average(areas) * 10.7639;
    const dldFee = project.fees?.find((fee) => fee.fee_type === "percentage" && /dld|land department/i.test(fee.label));
    const fixedFees = (project.fees ?? []).filter((fee) => fee.fee_type === "fixed").reduce((sum, fee) => sum + (Number(fee.value) || 0), 0);
    setInputs((current) => ({
      ...current, projectName: project.name, unitLabel: selectedUnit.label,
      price: Number(selectedUnit.price_aed) || current.price,
      sizeSqft: sizeSqft || current.sizeSqft, internalSqft: sizeSqft || current.internalSqft, balconySqft: 0,
      yearsToHandover: yearsUntil(project.completion_date),
      dldPct: dldFee ? Number(dldFee.value) || current.dldPct : current.dldPct,
      adminFee: fixedFees || current.adminFee, ...(splitPaymentPlan(selectedPlan) ?? {}),
    }));
    setLoadedFromProject(true);
  };

  const applyResearch = () => {
    const rents = Object.values(sources).map((item) => item.rent).filter((value) => value > 0);
    const psfs = Object.values(sources).map((item) => item.psf).filter((value) => value > 0);
    setInputs((current) => ({ ...current,
      annualRent: rents.length ? average(rents) : current.annualRent,
      areaPsf: psfs.length ? average(psfs) : current.areaPsf,
      conservativePsf: psfs.length ? Math.min(...psfs) : current.conservativePsf,
      optimisticPsf: psfs.length ? Math.max(...psfs) : current.optimisticPsf,
    }));
  };

  const resetAll = () => {
    setInputs(defaults); setSelectedProjectId(""); setSelectedUnitId(""); setSelectedPlanId("");
    setLoadedFromProject(false); setSources(sourceDefaults);
  };

  const printReport = () => {
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.opener = null;
    const rows = result.marketScenarios.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${pctValue(item.growthPct)}</td><td>${moneyValue(item.salePrice)}</td><td>${moneyValue(item.profit)}</td><td>${pctValue(item.returnPct)}</td></tr>`).join("");
    const plan = result.paymentPlan.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${pctValue(item.percentage)}</td><td>${moneyValue(item.amount)}</td></tr>`).join("");
    const citations = sourceMeta.map((source) => { const value = sources[source.key]; return `<tr><td>${source.name}</td><td>${value.sample || "—"}</td><td>${value.psf ? moneyValue(value.psf) : "—"}</td><td>${value.rent ? moneyValue(value.rent) : "—"}</td><td>${escapeHtml(value.period)}</td></tr>`; }).join("");
    popup.document.write(`<!doctype html><html><head><title>${escapeHtml(inputs.projectName)} investment report</title><style>body{font-family:Arial,sans-serif;color:#12201d;margin:36px}h1{font-size:28px}.muted{color:#65736f}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:24px 0}.card{border:1px solid #d8dedb;border-radius:12px;padding:14px}.value{font-size:22px;font-weight:700;color:#86651c;margin-top:8px}table{width:100%;border-collapse:collapse;margin:14px 0 24px}th,td{border-bottom:1px solid #d8dedb;padding:9px;text-align:left;font-size:12px}h2{margin-top:28px;font-size:17px}.credit{margin-top:34px;border-top:1px solid #d8dedb;padding-top:12px;font-size:10px;color:#65736f}</style></head><body><div class="muted">KEYORA · Off-plan investment analysis</div><h1>${escapeHtml(inputs.projectName)} — ${escapeHtml(inputs.unitLabel)}</h1><div class="grid"><div class="card">Verdict<div class="value">${escapeHtml(result.verdict)}</div></div><div class="card">Profit<div class="value">${moneyValue(result.profit)}</div></div><div class="card">Net yield<div class="value">${pctValue(result.netYieldPct)}</div></div></div><h2>Market sources</h2><table><tr><th>Source</th><th>Sample</th><th>AED/ft²</th><th>Rent</th><th>Period</th></tr>${citations}</table><h2>Market scenarios</h2><table><tr><th>Scenario</th><th>Growth</th><th>Sale</th><th>Profit</th><th>Return</th></tr>${rows}</table><h2>Payment plan</h2><table><tr><th>Stage</th><th>%</th><th>Amount</th></tr>${plan}</table><div class="credit">Method adapted for KEYORA from The Ultimate Real Estate Calculator · Off-plan Report v1.1.0 © 2026 Abdulla Alzarooni. Estimates only; not financial advice.</div><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  return <div className="space-y-7">
    <ManagementPageHeader eyebrow="Workspace · Research & decision tools" title="تحليل الاستثمار للمشاريع" description="اختار مشروع ووحدة من KEYORA، اجمع بيانات السوق من المصادر، ثم اعمل تقرير العائد والمخاطر وخطة الدفع." action={<div className="flex gap-2"><Button variant="outline" onClick={resetAll}><RotateCcw className="mr-2 h-4 w-4" />Reset</Button><Button onClick={printReport} className="bg-gold text-gold-foreground hover:bg-gold/90"><Download className="mr-2 h-4 w-4" />Save PDF</Button></div>} />
    <div dir="rtl" className={`rounded-2xl border p-4 text-sm ${loadedFromProject ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-200" : "border-amber-400/30 bg-amber-400/10 text-amber-100"}`}>
      {loadedFromProject ? `بيانات الصفقة من المشروع المختار. ${researchCount ? `${researchCount} مصادر سوق مدخلة يدويًا.` : "الإيجار والنمو وأسعار السوق افتراضات قابلة للتعديل؛ لم يتم التحقق منها بمصادر."}` : "وضع تجريبي: الأرقام الحالية مثال حسابي، وليست بيانات السوق الكلية أو نتائج مشروع مختار."}
    </div>
    <MarketDiscoveryPanel projects={projectsQuery.data ?? []} loading={projectsQuery.isLoading} onSelectProject={chooseProject} />
    <section dir="rtl" className="glass gold-hairline rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-2xl text-cream">مقارنة المشاريع</h2><p className="mt-1 text-sm text-muted-foreground">حمّل بيانات مشروع ووحدة، راجع افتراضاتهما، ثم أضف التحليل. كرر لمشروع آخر للمقارنة.</p></div><div className="flex gap-2"><Button onClick={addComparison} disabled={!loadedFromProject}>أضف التحليل للمقارنة ({comparison.length}/3)</Button>{comparison.length > 0 && <Button variant="outline" onClick={() => setComparison([])}>مسح المقارنة</Button>}</div></div>
      {comparison.length === 0 ? <p className="mt-5 rounded-2xl border border-dashed border-gold/20 p-5 text-sm text-muted-foreground">لم تضف مشاريع بعد. استخدم اختيار المشروع أدناه أولًا.</p> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[650px] text-right text-sm"><thead><tr><th className="p-3 text-muted-foreground">المؤشر</th>{comparison.map((item) => <th key={item.key} className="min-w-48 p-3"><div className="text-cream">{item.inputs.projectName}</div><div className="mt-1 text-xs font-normal text-gold">{item.inputs.unitLabel}</div><button type="button" className="mt-2 text-xs font-normal text-muted-foreground underline" onClick={() => setComparison((current) => current.filter((value) => value.key !== item.key))}>إزالة</button></th>)}</tr></thead><tbody>{[
        { label: "سعر الشراء", value: (item: ComparisonItem) => moneyValue(item.inputs.price) },
        { label: "المساحة", value: (item: ComparisonItem) => `${number.format(item.inputs.sizeSqft)} ft²` },
        { label: "التكلفة الكلية مع الرسوم", value: (item: ComparisonItem) => moneyValue(calculateInvestment(item.inputs).acquisitionCost) },
        { label: "الربح المتوقع عند التسليم", value: (item: ComparisonItem) => moneyValue(calculateInvestment(item.inputs).profit) },
        { label: "صافي عائد الإيجار", value: (item: ComparisonItem) => pctValue(calculateInvestment(item.inputs).netYieldPct) },
        { label: "سعر التعادل", value: (item: ComparisonItem) => moneyValue(calculateInvestment(item.inputs).breakEvenSale) },
        { label: "الربح في السيناريو الضعيف", value: (item: ComparisonItem) => moneyValue(calculateInvestment(item.inputs).marketScenarios[0].profit) },
        { label: "المدة للتسليم", value: (item: ComparisonItem) => `${number.format(item.inputs.yearsToHandover)} سنة` },
        { label: "مصادر السوق المدخلة", value: (item: ComparisonItem) => item.researchCount ? `${item.researchCount} مصادر` : "افتراضات — لم تُدخل مصادر" },
        { label: "وقت إضافة التحليل", value: (item: ComparisonItem) => item.savedAt },
      ].map((row) => <tr key={row.label} className="border-t border-white/10"><td className="p-3 text-muted-foreground">{row.label}</td>{comparison.map((item) => <td key={item.key} className="p-3 text-cream">{row.value(item)}</td>)}</tr>)}</tbody></table></div>}
      {comparison.length > 0 && <p className="mt-4 text-xs text-muted-foreground">المقارنة تحفظ نسخة من كل تحليل داخل الصفحة؛ تعديل المشروع الحالي لا يغير التحليلات المضافة. المقارنة تُمسح عند تحديث الصفحة. استخدم افتراضات وفترات متقاربة لتكون المقارنة عادلة.</p>}
    </section>

    <section className="glass gold-hairline rounded-3xl p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3"><Building2 className="mt-1 h-5 w-5 text-gold" /><div><h2 className="font-display text-2xl text-cream">1. اربط التحليل بالمشروع</h2><p className="mt-1 text-sm text-muted-foreground">السعر والمساحة والتسليم وخطة الدفع تُقرأ من KEYORA حسب صلاحيات الـworkspace.</p></div></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2"><Label>المشروع</Label><select value={selectedProjectId} onChange={(event) => chooseProject(event.target.value)} className="h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm text-cream"><option value="">اختر مشروعًا</option>{(projectsQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{projectsQuery.isLoading ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />جاري التحميل</p> : null}</div>
        <div className="space-y-2"><Label>الوحدة</Label><select value={selectedUnit?.id ?? ""} onChange={(event) => { setSelectedUnitId(event.target.value); setLoadedFromProject(false); }} disabled={!project} className="h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm text-cream disabled:opacity-50"><option value="">اختر وحدة</option>{units.map((item) => <option key={item.id} value={item.id}>{item.label} · {moneyValue(item.price_aed ?? 0)}</option>)}</select></div>
        <div className="space-y-2"><Label>خطة الدفع</Label><select value={selectedPlan?.id ?? ""} onChange={(event) => { setSelectedPlanId(event.target.value); setLoadedFromProject(false); }} disabled={!plans.length} className="h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm text-cream disabled:opacity-50"><option value="">الخطة الافتراضية</option>{plans.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3"><Button onClick={applyProjectData} disabled={!project || !selectedUnit || projectQuery.isLoading} className="bg-gold text-gold-foreground hover:bg-gold/90"><Database className="mr-2 h-4 w-4" />تحميل بيانات المشروع</Button>{loadedFromProject ? <span className="flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />تم تحميل البيانات المتاحة</span> : <span className="text-xs text-muted-foreground">أي بيانات غير موجودة تظل قابلة للتعديل يدويًا.</span>}</div>
    </section>

    <section className="glass gold-hairline rounded-3xl p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><Search className="mt-1 h-5 w-5 text-gold" /><div><h2 className="font-display text-2xl text-cream">2. اجمع بيانات السوق</h2><p className="mt-1 text-sm text-muted-foreground">افتح المصدر، اقرأ المقارنات، وسجل المتوسط وعدد العينات والفترة. المصادر المدفوعة تحتاج حسابك.</p></div></div><Button variant="outline" onClick={applyResearch}><LineChart className="mr-2 h-4 w-4" />استخدم المتوسطات</Button></div>
      <div className="grid gap-4 xl:grid-cols-2">{sourceMeta.map((source) => <article key={source.key} className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-display text-xl text-cream">{source.name}</h3><span className="rounded-full border border-gold/20 bg-gold/5 px-2 py-0.5 text-[10px] uppercase text-gold">{source.access}</span></div><p className="mt-1 text-xs text-muted-foreground">{source.description}</p></div><a href={sourceLinks[source.key]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gold hover:underline">Open <ExternalLink className="h-3 w-3" /></a></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Field label="Annual rent" value={sources[source.key].rent} onChange={(value) => setSources((current) => ({ ...current, [source.key]: { ...current[source.key], rent: value } }))} suffix="AED" /><Field label="Sale value" value={sources[source.key].psf} onChange={(value) => setSources((current) => ({ ...current, [source.key]: { ...current[source.key], psf: value } }))} suffix="AED/ft²" /><Field label="Sample" value={sources[source.key].sample} onChange={(value) => setSources((current) => ({ ...current, [source.key]: { ...current[source.key], sample: value } }))} /><div className="space-y-2"><Label className="text-xs text-muted-foreground">Period</Label><Input value={sources[source.key].period} onChange={(event) => setSources((current) => ({ ...current, [source.key]: { ...current[source.key], period: event.target.value } }))} className="border-white/10 bg-black/20 text-cream" /></div></div></article>)}</div>
      <div className="mt-5 flex flex-wrap gap-2"><a href={project ? `https://www.google.com/maps/search/?api=1&query=${project.lat},${project.lng}` : "https://maps.google.com/"} target="_blank" rel="noreferrer"><Button variant="outline" size="sm"><MapPin className="mr-2 h-4 w-4" />Google Maps</Button></a>{[["SunCalc", "https://www.suncalc.org/"], ["ShadeMap", "https://shademap.app/"], ["Windy", project ? `https://www.windy.com/${project.lat}/${project.lng}` : "https://www.windy.com/"], ["Noise map", "https://noise-map.com/"]].map(([label, href]) => <a key={label} href={href} target="_blank" rel="noreferrer"><Button variant="outline" size="sm">{label}</Button></a>)}</div>
    </section>

    <section className="glass gold-hairline rounded-3xl p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Project</Label><Input value={inputs.projectName} onChange={(event) => set("projectName", event.target.value)} className="border-white/10 bg-black/20" /></div><div className="space-y-2"><Label>Unit</Label><Input value={inputs.unitLabel} onChange={(event) => set("unitLabel", event.target.value)} className="border-white/10 bg-black/20" /></div></div>
      <div className="mt-6 grid gap-7 xl:grid-cols-3">
        <div><h2 className="mb-4 flex items-center gap-2 font-display text-xl text-cream"><WalletCards className="h-5 w-5 text-gold" />Unit & costs</h2><div className="grid gap-4 sm:grid-cols-2"><Field label="Unit price" value={inputs.price} onChange={(v) => set("price", v)} suffix="AED" /><Field label="Total size" value={inputs.sizeSqft} onChange={(v) => set("sizeSqft", v)} suffix="sqft" /><Field label="Internal area" value={inputs.internalSqft} onChange={(v) => set("internalSqft", v)} suffix="sqft" /><Field label="Balcony" value={inputs.balconySqft} onChange={(v) => set("balconySqft", v)} suffix="sqft" /><Field label="DLD" value={inputs.dldPct} onChange={(v) => set("dldPct", v)} suffix="%" /><Field label="Admin / Oqood" value={inputs.adminFee} onChange={(v) => set("adminFee", v)} suffix="AED" /></div></div>
        <div><h2 className="mb-4 flex items-center gap-2 font-display text-xl text-cream"><LineChart className="h-5 w-5 text-gold" />Market assumptions</h2><div className="grid gap-4 sm:grid-cols-2"><Field label="Area value today" value={inputs.areaPsf} onChange={(v) => set("areaPsf", v)} suffix="AED/ft²" /><Field label="Conservative" value={inputs.conservativePsf} onChange={(v) => set("conservativePsf", v)} suffix="AED/ft²" /><Field label="Optimistic" value={inputs.optimisticPsf} onChange={(v) => set("optimisticPsf", v)} suffix="AED/ft²" /><Field label="Years to handover" value={inputs.yearsToHandover} onChange={(v) => set("yearsToHandover", v)} suffix="years" min={0.1} /><Field label="Price growth / year" value={inputs.priceGrowthPct} onChange={(v) => set("priceGrowthPct", v)} suffix="%" /><Field label="Resale commission" value={inputs.commissionPct} onChange={(v) => set("commissionPct", v)} suffix="%" /></div></div>
        <div><h2 className="mb-4 flex items-center gap-2 font-display text-xl text-cream"><ShieldCheck className="h-5 w-5 text-gold" />Rent assumptions</h2><div className="grid gap-4 sm:grid-cols-2"><Field label="Annual rent today" value={inputs.annualRent} onChange={(v) => set("annualRent", v)} suffix="AED" /><Field label="Rent growth / year" value={inputs.rentGrowthPct} onChange={(v) => set("rentGrowthPct", v)} suffix="%" /><Field label="Service charge" value={inputs.serviceChargePsf} onChange={(v) => set("serviceChargePsf", v)} suffix="AED/ft²" /><Field label="Management" value={inputs.managementPct} onChange={(v) => set("managementPct", v)} suffix="%" /><Field label="Utilities / month" value={inputs.utilitiesMonthly} onChange={(v) => set("utilitiesMonthly", v)} suffix="AED" /><Field label="Furnished premium" value={inputs.furnishedPremium} onChange={(v) => set("furnishedPremium", v)} suffix="AED" /></div></div>
      </div>
    </section>

    <section><h2 className="mb-4 font-display text-2xl text-cream">3. نتيجة الصفقة</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Profit at handover" value={moneyValue(result.profit)} hint={`${pctValue(result.lifecycleReturnPct)} lifecycle · ${pctValue(result.annualizedReturnPct)} annualised`} tone={result.profit >= 0 ? "green" : "red"} /><Metric label="Net rental yield" value={pctValue(result.netYieldPct)} hint={`${moneyValue(result.netRent)} net rent after costs`} tone={result.netYieldPct >= 6 ? "green" : result.netYieldPct < 5 ? "red" : "gold"} /><Metric label="Break-even sale" value={moneyValue(result.breakEvenSale)} hint={`${pctValue(result.cushionPct)} cushion versus today's area value`} tone={result.cushionPct >= 0 ? "green" : "red"} /><Metric label="Cash-on-cash" value={pctValue(result.cashOnCashPct)} hint={`On ${moneyValue(result.cashInvested)} paid before handover`} tone={result.profit >= 0 ? "green" : "red"} /></div></section>

    <section dir="rtl" className="glass gold-hairline overflow-hidden rounded-3xl">
      <div className="border-b border-white/10 bg-gradient-to-l from-gold/10 to-transparent p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3"><BrainCircuit className="mt-1 h-6 w-6 text-gold" /><div><div className="text-[10px] uppercase tracking-[0.24em] text-gold">KEYORA decision engine · مجاني</div><h2 className="mt-1 font-display text-3xl text-cream">تعمل إيه دلوقتي؟</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">تقييم شفاف مبني على العائد، سيناريو الهبوط، هامش الأمان، اكتمال البيانات واستراتيجيتك. لا يحتاج اشتراك AI مدفوع.</p></div></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>هدفك</Label><select value={strategy} onChange={(event) => setStrategy(event.target.value as InvestorStrategy)} className="h-10 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-cream"><option value="balanced">متوازن</option><option value="income">دخل إيجاري</option><option value="growth">نمو رأسمالي</option></select></div>
            <div className="space-y-2"><Label>تحمل المخاطر</Label><select value={risk} onChange={(event) => setRisk(event.target.value as InvestorRisk)} className="h-10 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-cream"><option value="low">منخفض</option><option value="medium">متوسط</option><option value="high">مرتفع</option></select></div>
          </div>
        </div>
      </div>
      <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[280px_1fr]">
        <div className="rounded-3xl border border-gold/25 bg-gold/10 p-5"><div className="text-xs text-muted-foreground">Decision score</div><div className="mt-2 font-display text-6xl text-gold">{decision.score}<span className="text-xl text-muted-foreground">/100</span></div><div className="mt-4 rounded-full border border-gold/20 bg-black/20 px-3 py-2 text-center text-sm font-semibold text-cream">{decision.action}</div><p className="mt-3 text-center text-xs text-muted-foreground">ثقة {decision.confidence}</p></div>
        <div><p className="text-lg leading-8 text-cream">{decision.summary}</p><div className="mt-5 grid gap-4 md:grid-cols-3"><DecisionList title="عوامل إيجابية" icon={<CheckCircle2 className="h-4 w-4 text-emerald-300" />} items={decision.positives} empty="لا توجد عوامل مؤكدة بعد." /><DecisionList title="مخاطر" icon={<AlertTriangle className="h-4 w-4 text-amber-300" />} items={decision.risks} empty="لم تظهر مخاطر حسابية كبيرة." /><DecisionList title="الخطوة التالية" icon={<Target className="h-4 w-4 text-gold" />} items={decision.nextSteps} /></div></div>
      </div>
      <div className="border-t border-white/10 px-5 py-3 text-xs text-muted-foreground">هذا محرك قرار حسابي قابل للتفسير وليس ضمانًا للربح أو بديلًا عن الفحص القانوني والمالي المستقل.</div>
    </section>

    <section className="glass gold-hairline rounded-3xl p-5 sm:p-6"><div className="flex justify-between gap-3"><div><div className="text-[10px] uppercase tracking-[0.24em] text-gold">Current view</div><h2 className="mt-1 font-display text-2xl text-cream">{result.verdict}</h2></div><div className="text-sm text-muted-foreground">Normal value {moneyValue(result.normalPsf)} / ft²</div></div><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-[10px] uppercase text-muted-foreground"><tr><th className="pb-3">Scenario</th><th>Growth</th><th>Sale at handover</th><th>Profit</th><th>Return</th></tr></thead><tbody>{result.marketScenarios.map((item) => <tr key={item.label} className="border-t border-white/10"><td className="py-3 text-cream">{item.label}</td><td>{pctValue(item.growthPct)}</td><td>{moneyValue(item.salePrice)}</td><td className={item.profit >= 0 ? "text-emerald-300" : "text-red-300"}>{moneyValue(item.profit)}</td><td>{pctValue(item.returnPct)}</td></tr>)}</tbody></table></div></section>

    <section className="grid gap-6 xl:grid-cols-2"><div className="glass gold-hairline rounded-3xl p-5"><h2 className="font-display text-2xl text-cream">Rent scenarios</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{result.rentScenarios.map((item) => <div key={item.label} className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="text-xs text-muted-foreground">{item.label} · {pctValue(item.growthPct)}</div><div className="mt-2 font-display text-xl text-cream">{moneyValue(item.netRent)}</div><div className="mt-1 text-xs text-gold">{pctValue(item.yieldPct)} net yield</div></div>)}</div></div><div className="glass gold-hairline rounded-3xl p-5"><h2 className="font-display text-2xl text-cream">Payment plan</h2><div className="mt-5 grid grid-cols-2 gap-3"><Field label="Booking" value={inputs.bookingPct} onChange={(v) => set("bookingPct", v)} suffix="%" /><Field label="Construction" value={inputs.constructionPct} onChange={(v) => set("constructionPct", v)} suffix="%" /><Field label="Handover" value={inputs.handoverPct} onChange={(v) => set("handoverPct", v)} suffix="%" /><Field label="Post-handover" value={inputs.postHandoverPct} onChange={(v) => set("postHandoverPct", v)} suffix="%" /></div><div className={`mt-3 text-xs ${Math.abs(result.paymentTotalPct - 100) < 0.01 ? "text-emerald-300" : "text-red-300"}`}>Plan total: {pctValue(result.paymentTotalPct)}{Math.abs(result.paymentTotalPct - 100) < 0.01 ? " — valid" : " — must equal 100%"}</div></div></section>

    <div className="flex items-start gap-3 rounded-2xl border border-gold/20 bg-gold/5 p-4 text-xs leading-relaxed text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0 text-gold" /><p>KEYORA لا يسحب مواقع الطرف الثالث خلسة. افتح المصادر وسجل البيانات التي تحققت منها؛ المصادر المدفوعة تحتاج حسابًا صالحًا. Method adapted for KEYORA from The Ultimate Real Estate Calculator · Off-plan Report v1.1.0 © 2026 Abdulla Alzarooni. Estimates only; not financial advice.</p></div>
  </div>;
}

function DecisionList({ title, icon, items, empty }: { title: string; icon: ReactNode; items: string[]; empty?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/15 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-cream">{icon}{title}</div><ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">{items.length ? items.map((item) => <li key={item}>• {item}</li>) : <li>{empty}</li>}</ul></div>;
}
