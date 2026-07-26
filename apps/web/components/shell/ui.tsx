import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader({ kicker, title, subtitle, action }: { kicker?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {kicker ? <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{kicker}</p> : null}
        <h1 className="mt-0.5 font-display text-2xl font-bold leading-tight tracking-tight md:text-[30px]">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-[13px] leading-5 text-muted-foreground md:text-sm">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-xl border bg-card p-4 shadow-soft", className)}>{children}</div>;
}

const statusPillVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5 ring-1", {
  variants: {
    tone: {
      success: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
      warning: "bg-amber-500/10 text-amber-700 ring-amber-500/20",
      danger: "bg-red-500/10 text-red-700 ring-red-500/20",
      info: "bg-sky-500/10 text-sky-700 ring-sky-500/20",
      neutral: "bg-muted text-foreground ring-border"
    }
  },
  defaultVariants: {
    tone: "neutral"
  }
});

export function StatusPill({ tone, className, children, ...props }: ComponentProps<"span"> & VariantProps<typeof statusPillVariants>) {
  return <span className={cn(statusPillVariants({ tone }), className)} {...props}>{children}</span>;
}

export function ProgressRing({ value, size = 96, label }: { value: number; size?: number; label?: string }) {
  const normalizedValue = Math.min(100, Math.max(0, value));
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalizedValue / 100) * circumference;
  const accessibleLabel = label ? `${label}: ${normalizedValue}%` : `${normalizedValue}% voortgang`;

  return (
    <div aria-label={accessibleLabel} className="relative inline-flex items-center justify-center" role="img" style={{ width: size, height: size }}>
      <svg aria-hidden="true" className="-rotate-90" height={size} width={size}>
        <circle className="fill-none stroke-muted" cx={size / 2} cy={size / 2} r={radius} strokeWidth={8} />
        <circle
          className="fill-none stroke-primary transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth={8}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-bold">{normalizedValue}%</span>
        {label ? <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span> : null}
      </div>
    </div>
  );
}

export function WaitlistDot({ level }: { level: "kort" | "gemiddeld" | "lang" }) {
  const levels = {
    kort: { color: "bg-emerald-500", label: "Korte wachtrij" },
    gemiddeld: { color: "bg-amber-500", label: "Gemiddelde wachtrij" },
    lang: { color: "bg-red-500", label: "Lange wachtrij" }
  } as const;
  const item = levels[level];

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", item.color)} />
      {item.label}
    </span>
  );
}
