import { Award, LockKeyhole, Sparkles } from "lucide-react";

import { StatusPill } from "@/components/shell/ui";
import { cn } from "@/lib/utils";

export function BadgeVisual({
  category,
  className,
  description,
  earned = false,
  locked = false,
  name,
  surprise = false
}: {
  category?: string;
  className?: string;
  description?: string | null;
  earned?: boolean;
  locked?: boolean;
  name: string;
  surprise?: boolean;
}) {
  return (
    <article className={cn(
      "group relative overflow-hidden rounded-3xl border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-card",
      earned ? "border-emerald-200/80" : "border-border",
      locked && "border-dashed opacity-80",
      className
    )}>
      <div aria-hidden="true" className="absolute -right-8 -top-8 size-28 rounded-full bg-aqua/10 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className={cn(
          "grid size-14 place-items-center rounded-2xl text-white shadow-glow",
          earned ? "bg-gradient-to-br from-primary via-sky-500 to-aqua" : "bg-gradient-to-br from-slate-300 to-slate-500"
        )}>
          {locked ? <LockKeyhole className="size-6" /> : surprise ? <Sparkles className="size-6" /> : <Award className="size-7" />}
        </div>
        <StatusPill tone={earned ? "success" : locked ? "neutral" : "info"}>
          {earned ? "Behaald" : locked ? "Verborgen" : category?.replaceAll("_", " ") ?? "Badge"}
        </StatusPill>
      </div>
      <h3 className="relative mt-5 text-lg font-bold tracking-tight text-foreground">{locked ? "Verrassingsbadge" : name}</h3>
      <p className="relative mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
        {locked ? "Blijf met plezier oefenen om deze verrassing te ontdekken." : description || "Een mooie stap in de zwemreis."}
      </p>
    </article>
  );
}

