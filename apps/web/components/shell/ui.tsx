import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  subtitle,
  action
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex min-w-0 max-w-full flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {kicker ? <p className="break-words text-xs font-semibold uppercase tracking-wider text-primary">{kicker}</p> : null}
        <h1 className="break-words text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl break-words text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`min-w-0 max-w-full overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-soft ${className}`}>{children}</div>;
}

export function StatusPill({
  tone = "neutral",
  children
}: {
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
  children: ReactNode;
}) {
  const tones = {
    success: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-700 ring-amber-500/20",
    danger: "bg-red-500/10 text-red-700 ring-red-500/20",
    info: "bg-sky-500/10 text-sky-700 ring-sky-500/20",
    neutral: "bg-muted text-foreground ring-border"
  } as const;

  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tones[tone]}`}>{children}</span>;
}
