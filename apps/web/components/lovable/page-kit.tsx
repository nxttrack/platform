import { ArrowRight, CheckCircle2, Sparkles, Waves } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

type LinkTarget = {
  href: string;
  label: string;
};

export function PageHero({
  kicker,
  title,
  sub,
  primary,
  secondary,
  visual,
  chips
}: {
  kicker: string;
  title: string;
  sub: string;
  primary: LinkTarget;
  secondary?: LinkTarget;
  visual?: ReactNode;
  chips?: string[];
}) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-slate-50 to-white">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/3 h-[520px] w-[1000px] -translate-x-1/2 rounded-full bg-gradient-to-br from-blue-100 via-sky-50 to-transparent blur-3xl" />
        <div className="absolute -right-20 top-32 h-72 w-72 rounded-full bg-[#B6FF2E]/25 blur-3xl" />
      </div>
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
        <div className={visual ? "grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14" : "mx-auto max-w-3xl text-center"}>
          <div>
            <Kicker>{kicker}</Kicker>
            <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-slate-950 md:text-5xl">{title}</h1>
            <p className={visual ? "mt-4 max-w-xl text-base text-slate-600 md:text-lg" : "mx-auto mt-4 max-w-2xl text-base text-slate-600 md:text-lg"}>{sub}</p>
            <div className={visual ? "mt-7 flex flex-wrap items-center gap-3" : "mt-7 flex flex-wrap items-center justify-center gap-3"}>
              <PrimaryLink {...primary} />
              {secondary ? <SecondaryLink {...secondary} /> : null}
            </div>
            {chips ? (
              <div className={visual ? "mt-7 flex flex-wrap items-center gap-2" : "mt-7 flex flex-wrap items-center justify-center gap-2"}>
                {chips.map((chip) => (
                  <span key={chip} className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-slate-600">
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {visual ? <div className="relative">{visual}</div> : null}
        </div>
      </div>
    </section>
  );
}

export function PageSection({
  kicker,
  title,
  sub,
  children,
  tinted
}: {
  kicker?: string;
  title?: string;
  sub?: string;
  children: ReactNode;
  tinted?: boolean;
}) {
  return (
    <section className={tinted ? "bg-slate-50/70" : ""}>
      <div className="mx-auto max-w-7xl px-4 py-14 md:px-8 md:py-20">
        {title ? (
          <div className="mx-auto mb-10 max-w-2xl text-center">
            {kicker ? <p className="text-xs font-semibold uppercase tracking-wider text-primary">{kicker}</p> : null}
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">{title}</h2>
            {sub ? <p className="mt-3 text-base text-slate-600">{sub}</p> : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}

export function FeatureGrid({
  items
}: {
  items: { icon: ComponentType<{ className?: string }>; title: string; description: string }[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.title} className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-card">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-primary">
            <item.icon className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-card-foreground">{item.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

export function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <span className="text-sm text-slate-700">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Photo({
  label,
  hint,
  ratio = "aspect-[4/3]",
  className,
  src,
  alt,
  width = 1200,
  height = 900,
  priority = false
}: {
  label: string;
  hint?: string;
  ratio?: string;
  className?: string;
  src?: string;
  alt?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}) {
  const sceneLabel = label.replace(/^foto:\s*/i, "");

  if (src) {
    return <Image alt={alt || sceneLabel} className={`${ratio} ${className ?? ""} w-full rounded-2xl object-cover shadow-sm`} height={height} priority={priority} src={src} width={width} />;
  }

  const sceneTone = getSceneTone(sceneLabel);

  return (
    <div
      aria-label={alt || sceneLabel}
      className={`relative ${ratio} ${className ?? ""} w-full overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-br ${sceneTone} shadow-sm`}
      role="img"
    >
      <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-white/30 blur-2xl" />
      <div className="absolute -bottom-20 -left-16 h-64 w-64 rounded-full border-[28px] border-white/20" />
      <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.65)_1px,transparent_0)] [background-size:18px_18px]" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-slate-950/45 to-transparent" />
      <div className="absolute left-5 top-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/90 text-[#1D4ED8] shadow-lg ring-1 ring-white/80 backdrop-blur">
        <Waves className="h-5 w-5" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-5 text-white md:p-6">
        <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">
          <Sparkles className="h-3 w-3" /> NXTTRACK in de praktijk
        </p>
        <p className="mt-2 max-w-sm text-base font-bold leading-snug drop-shadow-sm md:text-lg">{sceneLabel}</p>
      </div>
    </div>
  );
}

function getSceneTone(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("ouder") || normalized.includes("app")) {
    return "from-cyan-500 via-sky-600 to-blue-900";
  }

  if (normalized.includes("instructeur") || normalized.includes("trainer")) {
    return "from-indigo-500 via-blue-700 to-slate-950";
  }

  if (normalized.includes("diploma") || normalized.includes("badge")) {
    return "from-amber-400 via-orange-500 to-rose-700";
  }

  return "from-sky-400 via-blue-600 to-indigo-950";
}

export const ImagePlaceholder = Photo;

export function HeroVisual({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] shadow-card ring-1 ring-slate-900/10">
      {children}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-slate-950/25 via-transparent to-transparent" />
      {caption ? (
        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-700 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {caption}
        </div>
      ) : null}
    </div>
  );
}

export function FinalCTA({ variant = "staging" }: { variant?: "marketing" | "staging" }) {
  const marketing = variant === "marketing";

  return (
    <section className="px-4 pb-20 pt-10 md:px-8">
      <div className="mx-auto max-w-6xl rounded-3xl bg-[#0f172a] p-10 text-white md:p-14">
        <div className="grid gap-6 md:grid-cols-[1.4fr_auto] md:items-center">
          <div>
            <h2 className="text-2xl font-bold md:text-3xl">{marketing ? "Klaar om jouw zwemschool next-gen te maken?" : "Staging blijft de plek voor bewijs."}</h2>
            <p className="mt-2 text-sm text-white/70">
              {marketing
                ? "Plan een demo en ontdek wat NXTTRACK voor jouw organisatie kan doen."
                : "Gebruik deze omgeving om rollen, workflows, styling en security te valideren voordat productie wordt vrijgegeven."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="inline-flex items-center gap-2 rounded-lg bg-[#B6FF2E] px-5 py-3 text-sm font-bold text-slate-900" href={marketing ? "/nxttrack/demo" : "/platform"}>
              {marketing ? "Plan demo" : "Platformbeheer"} <ArrowRight className="h-4 w-4" />
            </Link>
            {marketing ? (
              <Link className="inline-flex items-center rounded-lg border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10" href="/nxttrack/prijzen">
                Bekijk prijzen
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
      <span className="h-1.5 w-1.5 rounded-full bg-[#B6FF2E]" />
      {children}
    </span>
  );
}

export { FloatCard } from "@/components/lovable/float-card";

function PrimaryLink({ href, label }: LinkTarget) {
  return (
    <Link className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800" href={href}>
      {label} <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function SecondaryLink({ href, label }: LinkTarget) {
  return (
    <Link className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50" href={href}>
      {label}
    </Link>
  );
}
