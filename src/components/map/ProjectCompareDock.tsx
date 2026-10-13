import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { GitCompareArrows, MapPin, Trash2, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useProjects } from "@/hooks/use-projects";
import { useFiltersStore } from "@/store/filters";
import { bedroomsLabel, formatAed } from "@/lib/dubai";
import { lowestUnitPrice, projectDetailSlug } from "@/lib/unit-types";
import { mediaSrc } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function ProjectCompareDock() {
  const { data: projects = [] } = useProjects();
  const { compareProjectIds, toggleCompareProject, clearComparison } = useFiltersStore();
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => compareProjectIds.flatMap((id) => {
    const project = projects.find((item) => item.id === id);
    return project ? [project] : [];
  }), [compareProjectIds, projects]);

  if (!selected.length) return null;

  return <Dialog open={open && selected.length >= 2} onOpenChange={setOpen}>
    <div className="pointer-events-none absolute left-1/2 top-4 z-40 w-[min(94vw,560px)] -translate-x-1/2 md:bottom-5 md:top-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-strong gold-hairline pointer-events-auto flex items-center gap-3 rounded-2xl p-2.5 shadow-2xl">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold"><GitCompareArrows className="size-5" /></div>
        <div className="min-w-0 flex-1"><div className="text-[10px] uppercase tracking-widest text-gold">Compare properties</div><div className="text-sm text-cream">{selected.length}/3 selected</div></div>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); clearComparison(); }} aria-label="Clear comparison"><Trash2 className="size-4" /></Button>
        <DialogTrigger asChild><Button type="button" size="sm" disabled={selected.length < 2}>Compare</Button></DialogTrigger>
      </motion.div>
    </div>
      <DialogContent className="glass-strong gold-hairline max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-5xl overflow-y-auto rounded-3xl p-4 md:p-6">
        <div className="pr-7"><div className="text-xs uppercase tracking-widest text-gold">KEYORA compare</div><DialogTitle className="font-display text-2xl text-cream">Compare your shortlist</DialogTitle><DialogDescription className="mt-2">Compare available project data. Prices are starting prices; open a project for unit details.</DialogDescription></div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{selected.map((project) => <article key={project.id} className="glass gold-hairline overflow-hidden rounded-2xl">
          <div className="relative h-36 overflow-hidden">{mediaSrc(project.main_image_thumb_src, project.main_image_src ?? project.main_image_url) ? <img src={mediaSrc(project.main_image_thumb_src, project.main_image_src ?? project.main_image_url)} alt={project.name} loading="lazy" decoding="async" className="size-full object-cover" /> : <div className="size-full bg-muted" />}<button type="button" onClick={() => { if (selected.length <= 2) setOpen(false); toggleCompareProject(project.id); }} aria-label={`Remove ${project.name}`} className="glass absolute right-2 top-2 rounded-full p-2"><X className="size-4" /></button></div>
          <div className="space-y-3 p-4"><h3 className="font-display text-xl text-cream">{project.name}</h3><p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" />{project.community?.name ?? project.address ?? "Dubai"}</p>
            <Row label="Starting price" value={formatAed(lowestUnitPrice(project.unit_types, project.starting_price_aed))} />
            <Row label="Developer" value={project.developer?.name ?? "—"} /><Row label="Bedrooms" value={bedroomsLabel(project) ?? "—"} /><Row label="Handover" value={project.completion_date ?? "TBA"} /><Row label="Payment" value={project.payment_plan ?? "—"} /><Row label="Status" value={project.status ?? "—"} />
            <Button asChild className="w-full"><Link to="/projects/$slug" params={{ slug: projectDetailSlug({ name: project.name, slug: project.slug }) }}>View project</Link></Button>
          </div>
        </article>)}</div>
      </DialogContent>
  </Dialog>;
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3 border-b border-white/10 pb-2 text-sm"><span className="text-muted-foreground">{label}</span><span className="text-right text-cream">{value}</span></div>;
}
