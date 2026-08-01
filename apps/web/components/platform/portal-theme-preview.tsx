"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, LockKeyhole, Waves } from "lucide-react";
import { useState } from "react";

import { trackPortalThemeEvent } from "@/lib/analytics/portal-theme-events";
import type { ParentPortalRouteId, PortalThemeManifestV2 } from "@/lib/theme/portal-theme-contract";
import { getPortalRoutePresentation } from "@/lib/theme/portal-page-recipes";
import { portalThemeCssVariables } from "@/lib/theme/portal-theme-web";

type PreviewState = "data" | "empty" | "locked" | "error";

const previewRoutes: Array<{ id: ParentPortalRouteId; label: string }> = [
  { id: "overview", label: "Overzicht" },
  { id: "planning", label: "Planning" },
  { id: "lesson-detail", label: "Lesdetail" },
  { id: "progress", label: "Ontwikkeling" },
  { id: "badges", label: "Badges" },
  { id: "media", label: "Media" },
  { id: "diplomas", label: "Diploma’s" },
  { id: "inbox", label: "Inbox" },
  { id: "payments", label: "Betalingen" },
  { id: "documents", label: "Documenten" },
  { id: "feedback", label: "Feedback" },
  { id: "family-access", label: "Gezin & toegang" },
  { id: "profile", label: "Profiel & meer" }
];

export function PortalThemePreview({
  compact = false,
  manifest
}: {
  compact?: boolean;
  manifest: PortalThemeManifestV2;
}) {
  const [routeId, setRouteId] = useState<ParentPortalRouteId>("overview");
  const [state, setState] = useState<PreviewState>("data");
  const presentation = getPortalRoutePresentation(manifest, routeId);

  if (compact) {
    return (
      <div
        aria-label={`${manifest.theme.displayName}: desktop- en mobiele preview`}
        className="grid grid-cols-[1fr_3.25rem] items-end gap-2 p-3"
        style={{ ...portalThemeCssVariables(manifest), background: manifest.tokens.color.canvas }}
      >
        <PreviewViewport manifest={manifest} mode="desktop" routeId="overview" state="data" />
        <PreviewViewport manifest={manifest} mode="mobile" routeId="overview" state="data" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-theme-preview={manifest.theme.key} style={portalThemeCssVariables(manifest)}>
      <div className="flex flex-wrap gap-2">
        <label className="text-xs font-bold text-muted-foreground">
          <span className="sr-only">Previewroute</span>
          <select
            aria-label="Previewroute"
            className="h-10 rounded-lg border border-input bg-background px-3"
            onChange={(event) => {
              setRouteId(event.target.value as ParentPortalRouteId);
              trackPortalThemeEvent("portal_theme_previewed", {
                platform: "web",
                release: manifest.theme.release,
                routeId: event.target.value as ParentPortalRouteId,
                state,
                themeKey: manifest.theme.key
              });
            }}
            value={routeId}
          >
            {previewRoutes.map((route) => <option key={route.id} value={route.id}>{route.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold text-muted-foreground">
          <span className="sr-only">Previewstate</span>
          <select
            aria-label="Previewstate"
            className="h-10 rounded-lg border border-input bg-background px-3"
            onChange={(event) => {
              setState(event.target.value as PreviewState);
              trackPortalThemeEvent("portal_theme_previewed", {
                platform: "web",
                release: manifest.theme.release,
                routeId,
                state: event.target.value as PreviewState,
                themeKey: manifest.theme.key
              });
            }}
            value={state}
          >
            <option value="data">Met data</option>
            <option value="empty">Lege state</option>
            <option value="locked">Locked state</option>
            <option value="error">Assetfout/fallback</option>
          </select>
        </label>
        <span className="self-center text-xs font-semibold text-muted-foreground">
          {presentation.cue} · {presentation.recipeId}
        </span>
      </div>
      <div className="grid items-end gap-4 lg:grid-cols-[minmax(0,1fr)_13rem]">
        <PreviewViewport manifest={manifest} mode="desktop" routeId={routeId} state={state} />
        <PreviewViewport manifest={manifest} mode="mobile" routeId={routeId} state={state} />
      </div>
      <p className="text-xs text-muted-foreground">
        Read-only sandbox · tenantaccent wordt beperkt tot {manifest.branding.maximumAccentCoveragePercent}% · {manifest.accessibility.minimumContrast}
      </p>
    </div>
  );
}

function PreviewViewport({
  manifest,
  mode,
  routeId,
  state
}: {
  manifest: PortalThemeManifestV2;
  mode: "desktop" | "mobile";
  routeId: ParentPortalRouteId;
  state: PreviewState;
}) {
  const presentation = getPortalRoutePresentation(manifest, routeId);
  const overview = mode === "mobile"
    ? manifest.assets["overview.hero.mobile"]?.path
    : manifest.assets["overview.hero.desktop"]?.path;
  const progress = mode === "mobile"
    ? manifest.assets["progress.journey.mobile"]?.path
    : manifest.assets["progress.journey.desktop"]?.path;
  const artwork = state === "error" ? null : routeId === "progress" ? progress : routeId === "overview" ? overview : null;
  const icon = state === "locked"
    ? <LockKeyhole />
    : state === "error"
      ? <AlertTriangle />
      : state === "empty"
        ? <Waves />
        : routeId === "planning"
          ? <CalendarDays />
          : <CheckCircle2 />;

  return (
    <div
      className={`overflow-hidden border border-white/70 shadow-lg ${mode === "mobile" ? "aspect-[9/16] rounded-[1.35rem]" : "aspect-[16/9] rounded-xl"}`}
      data-preview-mode={mode}
      data-preview-route={routeId}
      data-preview-state={state}
      style={{ background: manifest.tokens.color.canvas, color: manifest.tokens.color.text }}
    >
      <div className="flex h-full">
        {mode === "desktop" ? <div className="w-[16%] p-2" style={{ background: manifest.tokens.color.rail }}><Waves className="size-4 text-white" /></div> : null}
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="flex h-[14%] items-center justify-between border-b border-white/50 bg-white/85 px-[5%]">
            <span className="h-2 w-1/3 rounded-full" style={{ background: manifest.tokens.color.primary }} />
            <span className="size-3 rounded-full" style={{ background: manifest.tokens.color.secondary }} />
          </div>
          {artwork ? (
            <div className="absolute inset-x-0 top-[14%] h-[50%] bg-cover bg-center opacity-75" style={{ backgroundImage: `url("${artwork}")` }} />
          ) : (
            <div className="absolute inset-x-0 top-[14%] h-[50%] opacity-55" style={{ background: `radial-gradient(circle at 70% 30%, ${manifest.tokens.color.secondary}, transparent 35%), linear-gradient(145deg, ${manifest.tokens.color.canvas}, ${manifest.tokens.color.primary}55)` }} />
          )}
          <div className="absolute inset-x-[6%] top-[24%]">
            <p className="text-[7px] font-extrabold uppercase tracking-wider" style={{ color: manifest.tokens.color.primaryStrong }}>
              {presentation.cue}
            </p>
            <div className="mt-1 h-2.5 w-2/3 rounded-full" style={{ background: manifest.tokens.color.text }} />
          </div>
          <div className="absolute inset-x-[6%] bottom-[7%] rounded-xl border border-white/80 bg-white/90 p-[6%] shadow">
            <span className="grid size-6 place-items-center rounded-lg text-white [&>svg]:size-3.5" style={{ background: manifest.tokens.color.primary }}>{icon}</span>
            <div className="mt-2 h-2 w-3/4 rounded-full" style={{ background: manifest.tokens.color.text }} />
            <div className="mt-1 h-1.5 w-full rounded-full opacity-40" style={{ background: manifest.tokens.color.textMuted }} />
          </div>
        </div>
      </div>
    </div>
  );
}
