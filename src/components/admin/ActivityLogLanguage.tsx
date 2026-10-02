import { useEffect, useState, type ReactNode } from "react";
import { ActivityLogLanguageContext, useActivityLogLanguage, type ActivityLogLanguage } from "./useActivityLogLanguage";

const ar: Record<string, string> = {
  "Back to admin": "العودة للإدارة",
  "All company usage": "استخدام كل الشركات",
  "Activity log": "سجل النشاط",
  "Company usage": "استخدام الشركة",
  "Security activity, per-company consumption, Mapbox billing estimates, and subscription limits.": "الأنشطة الأمنية واستهلاك كل شركة وتقديرات تكلفة Mapbox وحدود الاشتراك.",
  "Successful sign-ins by regular users.": "عمليات تسجيل الدخول الناجحة للمستخدمين.",
  "Detailed usage, users, Mapbox initializations, billing allocation, and limits for this tenant.": "تفاصيل الاستخدام والمستخدمين وفتح خرائط Mapbox وتوزيع التكلفة والحدود لهذه الشركة.",
  Activity: "النشاط", Usage: "الاستخدام", "Billing estimate": "تقدير التكلفة", Limits: "الحدود",
  "Activity log records": "سجلات النشاط",
  "Latest sign-ins, project creation, and limit changes.": "أحدث عمليات الدخول وإنشاء المشاريع وتغييرات الحدود.",
  Refresh: "تحديث", "Loading activity…": "جارٍ تحميل النشاط…", "Could not load the activity log.": "تعذّر تحميل سجل النشاط.",
  Time: "الوقت", User: "المستخدم", Event: "الحدث", "Unknown user": "مستخدم غير معروف",
  "Signed in": "تسجيل دخول", "Created a project": "إنشاء مشروع", Unlimited: "بلا حد",
  "Changed company Mapbox limit to": "تغيير حد Mapbox للشركة إلى",
  "Created project": "إنشاء مشروع",
  Previous: "السابق", Next: "التالي", Page: "صفحة", "No more activity on this page.": "لا توجد سجلات أخرى في هذه الصفحة.",
  "Period": "الفترة", Today: "اليوم", "7 days": "٧ أيام", "30 days": "٣٠ يومًا",
  "This month": "هذا الشهر", "Last month": "الشهر الماضي", Custom: "مخصص", From: "من", To: "إلى",
  Tenant: "الشركة", "All companies": "كل الشركات", "All users": "كل المستخدمين",
  "Event type": "نوع الحدث", "All events": "كل الأحداث",
  "mapbox map initialized": "فتح خريطة Mapbox",
  "cesium initialized": "فتح خريطة Cesium",
  "tour opened": "فتح جولة ٣٦٠", "scene viewed": "مشاهدة مشهد",
  "pdf generated": "إنشاء PDF", "project viewed": "مشاهدة مشروع",
  "login success": "تسجيل دخول ناجح",
  satellite: "القمر الصناعي", map: "الخريطة",
  Company: "الشركة", Plan: "الباقة", Subscription: "الاشتراك", Renewal: "التجديد",
  "Not assigned": "غير محددة", Unknown: "غير معروف", "Not set": "غير محدد",
  "Total tenants": "إجمالي الشركات", "Active users": "المستخدمون النشطون",
  "Mapbox loads": "مرات تحميل Mapbox", "Estimated Mapbox cost": "تكلفة Mapbox التقديرية",
  Projects: "المشاريع", "360 tours": "جولات ٣٦٠", Storage: "التخزين", "PDFs generated": "ملفات PDF المنشأة",
  "Tenant usage": "استخدام الشركات", Users: "المستخدمون", Logins: "عمليات الدخول",
  "360 opens": "فتح جولات ٣٦٠", PDFs: "ملفات PDF", Contribution: "المساهمة",
  "Top users by Mapbox loads": "أكثر المستخدمين تحميلًا لـ Mapbox",
  "Recent Mapbox initializations": "أحدث مرات فتح Mapbox",
  "Last active": "آخر نشاط", Tours: "الجولات", Mode: "الوضع", Session: "الجلسة",
  "No Mapbox loads in this period.": "لا توجد مرات تحميل لـ Mapbox في هذه الفترة.",
  "Loading charts…": "جارٍ تحميل الرسوم…", "Loading metered usage…": "جارٍ تحميل الاستخدام…",
  "Could not load usage data.": "تعذّر تحميل بيانات الاستخدام.",
  "Company Mapbox limits": "حدود Mapbox للشركات",
  "Calendar months use UTC. The company override takes priority over its plan.": "الأشهر حسب توقيت UTC، وحد الشركة يتقدّم على حد الباقة.",
  Month: "الشهر", "Loading monthly usage…": "جارٍ تحميل الاستخدام الشهري…",
  "Edit limit": "تعديل الحد", "Monthly limit": "الحد الشهري",
  None: "لا توجد", limit: "حد", tenant: "الشركة", plan: "الباقة", platform: "المنصة",
  warning: "تحذير", overage: "تجاوز", hard_limit: "حد صارم", unlimited: "بلا حد",
  "Quick load limits": "حدود التحميل السريعة",
  "Could not load monthly limits:": "تعذّر تحميل الحدود الشهرية:",
  "Used this month": "المستخدم هذا الشهر", Remaining: "المتبقي",
  Overage: "التجاوز", "No historical limit snapshot": "لا يوجد سجل تاريخي للحد",
  "Limit reached": "تم بلوغ الحد", "Near limit": "الاقتراب من الحد", Active: "نشط",
  "Monthly Mapbox loads": "مرات تحميل Mapbox شهريًا", Behavior: "التصرف عند بلوغ الحد",
  "Allow overage": "السماح بالتجاوز", Warning: "تحذير", "Hard limit": "حد صارم",
  "Overage price per 1,000": "سعر كل ١٠٠٠ تحميل زائد", Cancel: "إلغاء",
  "Enter a non-negative whole monthly load limit": "أدخل حدًا شهريًا صحيحًا لا يقل عن الصفر",
  "Enter a valid overage price": "أدخل سعر تجاوز صحيحًا",
  "Company Mapbox limit saved": "تم حفظ حد Mapbox للشركة",
  "Could not save the Mapbox limit": "تعذّر حفظ حد Mapbox",
  Save: "حفظ", "Saving…": "جارٍ الحفظ…",
  "Other resource limits": "حدود الموارد الأخرى", "Edit resources": "تعديل الموارد",
  Resources: "الموارد", "Subscription revenue": "إيراد الاشتراك",
  "Revenue period": "فترة الإيراد", Monthly: "شهري", Annual: "سنوي", "Storage (GB)": "التخزين (GB)",
  "Provider pricing settings": "إعدادات تسعير Mapbox",
  "Monthly free Mapbox loads": "مرات تحميل Mapbox المجانية شهريًا",
  Currency: "العملة", "Internal allocation": "توزيع التكلفة الداخلي",
  "Proportional usage": "حسب نسبة الاستخدام", "Included quota + overage": "الحصة والتجاوز",
  "Pricing tiers": "شرائح التسعير", "Up to load number": "حتى عدد تحميلات",
  "Price per 1,000 loads": "السعر لكل ١٠٠٠ تحميل", "Above all tiers": "أعلى من كل الشرائح",
  "Add tier": "إضافة شريحة", "Remove tier": "حذف الشريحة", "Save pricing": "حفظ التسعير",
  "Add at least one pricing tier.": "أضف شريحة سعر واحدة على الأقل.",
  "Free loads must be a non-negative whole number.": "أدخل عددًا صحيحًا غير سالب للتحميلات المجانية.",
  "Enter a valid price for each tier.": "أدخل سعرًا صحيحًا لكل شريحة.",
  "Only the final tier can have no upper limit.": "الشريحة الأخيرة فقط يمكن أن تكون بلا حد أعلى.",
  "Tier limits must increase beyond the free load count.": "يجب أن تزيد حدود الشرائح عن التحميلات المجانية وبالترتيب.",
  "Billing settings saved": "تم حفظ إعدادات الفوترة",
  "Could not save billing settings": "تعذّر حفظ إعدادات الفوترة",
  "Resource limits saved": "تم حفظ حدود الموارد",
  "Could not save limits": "تعذّر حفظ الحدود",
  "usage threshold reached": "من الحد مستهلك",
  "Cost allocation and overage": "توزيع التكلفة والتجاوز",
  "Mapbox free usage is applied once at platform level. Monthly commercial overage uses the effective company or plan limit for": "تُطبّق التحميلات المجانية مرة واحدة على مستوى المنصة. يُحسب التجاوز الشهري باستخدام حد الشركة أو الباقة لشهر",
  "Internal allocation and gross contribution are estimates over the selected range. Forecasts use elapsed days this month.": "توزيع التكلفة والمساهمة الإجمالية تقديرات للفترة المحددة. التوقعات تعتمد على الأيام المنقضية من الشهر.",
  "Select a range within one UTC month to see commercial overage.": "اختر فترة داخل شهر واحد بتوقيت UTC لعرض تكلفة التجاوز.",
  "Monthly limits could not be loaded:": "تعذّر تحميل الحدود الشهرية:",
  "Actual loads": "التحميلات الفعلية", "Free loads": "التحميلات المجانية",
  "Billable loads": "التحميلات المدفوعة", "Provider estimated cost": "تكلفة المزوّد التقديرية",
  "Average / active user": "المتوسط لكل مستخدم نشط", "Average / tenant": "المتوسط لكل شركة",
  Loads: "التحميلات", "Projected month": "توقع الشهر", "Projected annual loads": "توقع التحميلات السنوية",
  "Est. monthly infra": "تكلفة البنية الشهرية", "Projected annual infra": "تكلفة البنية السنوية",
  "Provider allocated": "حصة تكلفة المزوّد", "Monthly overage": "التجاوز الشهري",
  "Commercial overage": "تكلفة التجاوز", "Internal allocated": "التكلفة الموزعة",
  "Est. gross contribution (range)": "المساهمة الإجمالية التقديرية",
  "Set revenue": "حدد الإيراد",
  "Mapbox loads by day": "تحميلات Mapbox يوميًا",
  "Mapbox loads by tenant": "تحميلات Mapbox لكل شركة",
  "Top users": "أكثر المستخدمين",
  "Monthly usage trend": "اتجاه الاستخدام الشهري",
};

export function ActivityLogLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<ActivityLogLanguage>("en");
  useEffect(() => {
    if (window.localStorage.getItem("activity-log-language") === "ar") setLanguage("ar");
  }, []);
  const toggle = () => setLanguage((current) => {
    const next = current === "ar" ? "en" : "ar";
    window.localStorage.setItem("activity-log-language", next);
    return next;
  });
  return <ActivityLogLanguageContext.Provider value={{ language, toggle, t: (text) => language === "ar" ? ar[text] ?? text : text }}>
    {children}
  </ActivityLogLanguageContext.Provider>;
}

export function ActivityLogLanguageButton() {
  const { language, toggle } = useActivityLogLanguage();
  return <button type="button" onClick={toggle} aria-label={language === "ar" ? "Switch to English" : "الترجمة إلى العربية"}
    aria-pressed={language === "ar"} className="rounded-md border border-gold/50 px-3 py-1.5 text-sm text-gold hover:bg-gold/10">
    {language === "ar" ? "English" : "عربي"}
  </button>;
}
