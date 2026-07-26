import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AdminMetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral"
}: {
  icon?: LucideIcon;
  label: string;
  value: number | string;
  detail?: string;
  tone?: "neutral" | "info" | "success" | "warning";
}) {
  const toneClass = {
    neutral: "bg-slate-500/8 text-slate-700",
    info: "bg-sky-500/10 text-sky-700",
    success: "bg-emerald-500/10 text-emerald-700",
    warning: "bg-amber-500/10 text-amber-700"
  }[tone];

  return (
    <section className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 shadow-soft">
      {Icon ? <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", toneClass)}><Icon className="size-4" aria-hidden="true" /></span> : null}
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <p className="text-xl font-bold leading-none text-foreground">{value}</p>
          {detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
        </div>
      </div>
    </section>
  );
}

export function AdminFilterPills({
  current,
  href,
  items
}: {
  current: string;
  href: (value: string) => string;
  items: Array<{ label: string; value: string; count?: number }>;
}) {
  return (
    <nav aria-label="Overzichtsfilter" className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-muted/55 p-1">
      {items.map((item) => (
        <Link
          aria-current={current === item.value ? "page" : undefined}
          className={cn(
            "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            current === item.value ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
          )}
          href={href(item.value)}
          key={item.value}
        >
          {item.label}
          {typeof item.count === "number" ? <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{item.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function AdminListSurface({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-xl border border-border bg-card p-3 shadow-soft sm:p-4", className)}>{children}</section>;
}
