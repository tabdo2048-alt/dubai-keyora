import { useDeferredValue, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { Building2, Database, FileSpreadsheet, Filter, MapPin, Search, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectWithRelations } from "@/lib/types";
import { DUBAI_INVESTMENT_AREAS, MAJOR_DUBAI_DEVELOPERS, uniqueMarketNames } from "@/lib/dubai-market-catalog";
import { parseDldProjectsCsv, type DldMarketProject } from "@/lib/dld-projects-csv";
import { toast } from "sonner";

type MarketRow = {
  key: string;
  source: "workspace" | "dld";
  workspaceId?: string;
  name: string;
  developer: string;
  area: string;
  status: string;
  projectType: string;
  completionDate: string;
  completedPct: number | null;
  totalUnits: number | null;
  price: number | null;
};

const selectClass = "h-10 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm text-cream";
const money = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 });

function workspaceRow(project: ProjectWithRelations): MarketRow {
  return {
    key: `workspace:${project.id}`,
    source: "workspace",
    workspaceId: project.id,
    name: project.name,
    developer: project.developer?.name ?? "غير محدد",
    area: project.community?.name ?? "غير محدد",
    status: project.status,
    projectType: project.category,
    completionDate: project.completion_date ?? "",
    completedPct: null,
    totalUnits: project.unit_types?.length || null,
    price: Number(project.starting_price_aed) || null,
  };
}

function dldRow(project: DldMarketProject): MarketRow {
  return {
    key: `dld:${project.key}`,
    source: "dld",
    name: project.name,
    developer: project.developerName || "غير محدد",
    area: project.areaName || "غير محدد",
    status: project.status || "غير محدد",
    projectType: project.projectType || "غير محدد",
    completionDate: project.completionDate,
    completedPct: project.completedPct,
    totalUnits: project.totalUnits,
    price: null,
  };
}

export function MarketDiscoveryPanel({
  projects,
  loading,
  onSelectProject,
}: {
  projects: ProjectWithRelations[];
  loading: boolean;
  onSelectProject: (id: string) => void;
}) {
  const [dldProjects, setDldProjects] = useState<DldMarketProject[]>([]);
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [developer, setDeveloper] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState<"all" | "workspace" | "dld">("all");
  const [selectedRegistryProject, setSelectedRegistryProject] = useState<MarketRow | null>(null);
  const deferredQuery = useDeferredValue(query);

  const rows = useMemo(
    () => [...projects.map(workspaceRow), ...dldProjects.map(dldRow)],
    [projects, dldProjects],
  );
  const areas = useMemo(
    () => uniqueMarketNames([...DUBAI_INVESTMENT_AREAS, ...rows.map((item) => item.area)]),
    [rows],
  );
  const developers = useMemo(
    () => uniqueMarketNames([...MAJOR_DUBAI_DEVELOPERS, ...rows.map((item) => item.developer)]),
    [rows],
  );
  const statuses = useMemo(() => uniqueMarketNames(rows.map((item) => item.status)), [rows]);
  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase("en");
    return rows.filter((item) => {
      if (source !== "all" && item.source !== source) return false;
      if (area && item.area !== area) return false;
      if (developer && item.developer !== developer) return false;
      if (status && item.status !== status) return false;
      if (needle && !`${item.name} ${item.developer} ${item.area}`.toLocaleLowerCase("en").includes(needle)) return false;
      return true;
    });
  }, [area, deferredQuery, developer, rows, source, status]);

  const importDld = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("الملف أكبر من 20MB. استخدم ملف Projects.csv الرسمي فقط.");
      return;
    }
    try {
      const parsed = parseDldProjectsCsv(await file.text());
      setDldProjects(parsed);
      setSource("dld");
      setArea("");
      setDeveloper("");
      setStatus("");
      toast.success(`تم استيراد ${parsed.length.toLocaleString("ar-EG")} مشروع من ملف DLD.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر قراءة الملف.");
    }
  };

  const clearFilters = () => {
    setQuery("");
    setArea("");
    setDeveloper("");
    setStatus("");
    setSource("all");
  };

  return (
    <section dir="rtl" className="glass gold-hairline overflow-hidden rounded-3xl">
      <div className="border-b border-white/10 bg-gradient-to-l from-gold/10 via-transparent to-transparent p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-gold"><Sparkles className="h-4 w-4" />Dubai market intelligence</div>
            <h2 className="mt-2 font-display text-3xl text-cream">اكتشف المنطقة والمطور والمشروع</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">فلترة موحدة لمشروعات مساحة العمل وسجل دائرة الأراضي. مناطق دبي الأساسية ظاهرة دائمًا، وملف DLD يضيف سجل المطورين والمشروعات الكامل عند استيراده.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="https://dubailand.gov.ae/en/open-data/real-estate-data/" target="_blank" rel="noreferrer"><Button variant="outline"><Database className="ml-2 h-4 w-4" />بيانات DLD الرسمية</Button></a>
            <Label className="inline-flex h-10 cursor-pointer items-center rounded-md bg-gold px-4 text-sm font-medium text-gold-foreground hover:bg-gold/90">
              <Upload className="ml-2 h-4 w-4" />رفع Projects.csv
              <input className="sr-only" type="file" accept=".csv,text/csv" onChange={importDld} />
            </Label>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={<MapPin className="h-4 w-4" />} label="مناطق في الفهرس" value={areas.length.toLocaleString("ar-EG")} />
          <Stat icon={<Building2 className="h-4 w-4" />} label="مطورون في الفهرس" value={developers.length.toLocaleString("ar-EG")} />
          <Stat icon={<Database className="h-4 w-4" />} label="مشروعات KEYORA" value={projects.length.toLocaleString("ar-EG")} />
          <Stat icon={<FileSpreadsheet className="h-4 w-4" />} label="مشروعات DLD المستوردة" value={dldProjects.length.toLocaleString("ar-EG")} />
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2 xl:col-span-1"><Label>بحث</Label><div className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="اسم مشروع أو مطور" className="border-white/10 bg-black/20 pr-9" /></div></div>
          <FilterSelect label="المنطقة" value={area} onChange={setArea} options={areas} empty="كل مناطق دبي" />
          <FilterSelect label="المطور" value={developer} onChange={setDeveloper} options={developers} empty="كل المطورين" />
          <FilterSelect label="الحالة" value={status} onChange={setStatus} options={statuses} empty="كل الحالات" />
          <FilterSelect label="المصدر" value={source} onChange={(value) => setSource(value as typeof source)} options={["workspace", "dld"]} labels={{ workspace: "KEYORA", dld: "DLD CSV" }} empty="كل المصادر" />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">تم العثور على <span className="font-semibold text-cream">{filtered.length.toLocaleString("ar-EG")}</span> مشروع{filtered.length > 60 ? " — يعرض أول 60 نتيجة" : ""}.</p>
          <Button variant="ghost" size="sm" onClick={clearFilters}><Filter className="ml-2 h-4 w-4" />مسح الفلاتر</Button>
        </div>

        {loading ? <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">جاري تحميل مشروعات مساحة العمل…</div> : null}
        {!loading && filtered.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-gold/20 p-6 text-center"><p className="text-cream">لا توجد مشروعات مطابقة داخل البيانات المحملة.</p><p className="mt-2 text-xs text-muted-foreground">لو اخترت منطقة من الفهرس مثل Dubai South ولم تظهر نتائج، ارفع ملف Projects.csv من DLD أو أضف مشروعًا داخل KEYORA.</p></div> : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.slice(0, 60).map((item) => (
            <article key={item.key} className={`rounded-2xl border p-4 transition-colors ${selectedRegistryProject?.key === item.key ? "border-gold bg-gold/10" : "border-white/10 bg-black/15 hover:border-gold/30"}`}>
              <div className="flex items-start justify-between gap-3"><div><span className={`rounded-full px-2 py-1 text-[10px] uppercase ${item.source === "workspace" ? "bg-emerald-400/10 text-emerald-300" : "bg-sky-400/10 text-sky-300"}`}>{item.source === "workspace" ? "KEYORA" : "DLD"}</span><h3 className="mt-3 font-display text-xl text-cream">{item.name}</h3></div>{item.price ? <div className="text-left text-xs text-gold">من<br />{money.format(item.price)}</div> : null}</div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">المنطقة</dt><dd className="mt-1 text-cream">{item.area}</dd></div><div><dt className="text-muted-foreground">المطور</dt><dd className="mt-1 text-cream">{item.developer}</dd></div><div><dt className="text-muted-foreground">الحالة</dt><dd className="mt-1 text-cream">{item.status}</dd></div><div><dt className="text-muted-foreground">التسليم</dt><dd className="mt-1 text-cream">{item.completionDate || "غير متاح"}</dd></div></dl>
              <Button className="mt-4 w-full" variant={item.source === "workspace" ? "default" : "outline"} onClick={() => { setSelectedRegistryProject(item); if (item.workspaceId) onSelectProject(item.workspaceId); }}>
                {item.source === "workspace" ? "استخدمه في التحليل" : "افحص اكتمال البيانات"}
              </Button>
            </article>
          ))}
        </div>

        {selectedRegistryProject?.source === "dld" ? (
          <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
            <strong>{selectedRegistryProject.name}:</strong> سجل DLD يثبت بيانات التسجيل والحالة، لكنه لا يحتوي على سعر الوحدة أو الإيجار أو رسوم الخدمة. الإجراء الآن: أضف المشروع إلى KEYORA واربط عرض السعر والوحدة قبل إصدار توصية شراء.
          </div>
        ) : null}

        <p className="mt-5 text-xs leading-5 text-muted-foreground">الفهرس المحلي يساعدك في الوصول لأي منطقة، لكنه ليس ادعاءً بأن كل منطقة لها مشروع موثق. عدد المشاريع الكامل يأتي من ملف DLD الرسمي، بينما قرار الاستثمار يحتاج أيضًا سعر الوحدة والإيجار وخطة الدفع. الملف المستورد يبقى في الجلسة الحالية فقط ولا يُرفع إلى قاعدة البيانات.</p>
      </div>
    </section>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><div className="mt-2 font-display text-2xl text-cream">{value}</div></div>;
}

function FilterSelect({ label, value, onChange, options, empty, labels = {} }: { label: string; value: string; onChange: (value: string) => void; options: string[]; empty: string; labels?: Record<string, string> }) {
  return <div className="space-y-2"><Label>{label}</Label><select value={value} onChange={(event) => onChange(event.target.value)} className={selectClass}><option value="">{empty}</option>{options.map((option) => <option key={option} value={option}>{labels[option] ?? option}</option>)}</select></div>;
}
