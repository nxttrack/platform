import { ArrowRight, CalendarDays, Gem, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";

import { ProgressRing } from "@/components/shell/ui";
import type { RegisteredPageRecipeId } from "@/lib/theme/portal-theme-contract";
import { getPortalOverviewRecipePresentation } from "@/lib/theme/portal-overview-recipes";

export type PortalOverviewHeroChild = {
  initial: string;
  name: string;
  program: string;
  stage: string;
  progressPercent: number;
  nextLesson: string | null;
  location: string | null;
};

export function PortalOverviewHero({
  child,
  href,
  recipeId
}: {
  child: PortalOverviewHeroChild | null;
  href: string;
  recipeId: RegisteredPageRecipeId;
}) {
  const presentation = getPortalOverviewRecipePresentation(recipeId);
  const destination = child?.stage && child.stage !== "Startniveau"
    ? child.stage
    : child?.program && child.program !== "Nog geen programma"
      ? child.program
      : "jouw volgende mijlpaal";

  return (
    <section
      aria-label={`${presentation.eyebrow} zwemreis`}
      className="portal-overview-journey"
      data-overview-recipe={recipeId}
    >
      <div aria-hidden="true" className="portal-overview-journey__wash" />
      <div className="portal-overview-journey__content">
        <div className="portal-overview-journey__card">
          <p className="portal-overview-journey__eyebrow">
            <Sparkles aria-hidden="true" className="size-4" />
            {presentation.eyebrow}
          </p>

          <div className="mt-4 flex items-center gap-3">
            <span aria-hidden="true" className="portal-overview-journey__avatar">{child?.initial ?? "★"}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-muted-foreground">{presentation.journeyLabel}</p>
              <p className="truncate text-xl font-extrabold text-foreground">{child?.name ?? "Jouw gezin"}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <h2 className="max-w-xl text-2xl font-extrabold leading-tight text-foreground sm:text-3xl">
              {presentation.titlePrefix} {destination}
            </h2>
            <ProgressRing label={presentation.progressLabel} size={104} value={child?.progressPercent ?? 0} />
          </div>

          <div className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
            <span className="portal-overview-journey__fact">
              <CalendarDays aria-hidden="true" className="size-4 text-primary" />
              <span><span className="block text-xs font-semibold text-muted-foreground">Volgende les</span><strong>{child?.nextLesson ?? "Nog niet gepland"}</strong></span>
            </span>
            <span className="portal-overview-journey__fact">
              <MapPin aria-hidden="true" className="size-4 text-secondary" />
              <span><span className="block text-xs font-semibold text-muted-foreground">Locatie</span><strong>{child?.location ?? "Nog niet bekend"}</strong></span>
            </span>
          </div>

          <Link className="portal-overview-journey__cta" href={href}>
            {presentation.ctaLabel}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        <div className="portal-overview-journey__milestones">
          {presentation.milestoneLabels.map((label) => (
            <span className="portal-overview-journey__milestone" key={label}>
              <Gem aria-hidden="true" className="size-4 text-[var(--portal-reward)]" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
