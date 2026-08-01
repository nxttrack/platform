"use client";

import { Gem, MapPin, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { trackPortalThemeEvent } from "@/lib/analytics/portal-theme-events";
import type { PortalThemeManifestV2 } from "@/lib/theme/portal-theme-contract";
import {
  getPortalRoutePresentation,
  resolvePortalRouteId
} from "@/lib/theme/portal-page-recipes";

export function PortalRouteFrame({
  children,
  manifest
}: {
  children: ReactNode;
  manifest: PortalThemeManifestV2;
}) {
  const pathname = usePathname();
  const routeId = resolvePortalRouteId(pathname);
  const presentation = getPortalRoutePresentation(manifest, routeId);
  const showRouteAtmosphere = routeId !== "overview";

  useEffect(() => {
    trackPortalThemeEvent("portal_route_viewed", {
      breakpoint: window.matchMedia("(max-width: 767px)").matches ? "mobile" : window.matchMedia("(max-width: 1199px)").matches ? "tablet" : "desktop",
      platform: "web",
      release: manifest.theme.release,
      routeId,
      state: "data",
      themeKey: manifest.theme.key
    });
  }, [manifest.theme.key, manifest.theme.release, routeId]);

  return (
    <section
      className={`portal-route-frame portal-route-frame--${presentation.intensity}`}
      data-portal-motif={presentation.motif}
      data-portal-recipe={presentation.recipeId}
      data-portal-route-id={routeId}
    >
      {showRouteAtmosphere ? (
        <div aria-hidden="true" className="portal-route-atmosphere">
          <div className="portal-route-atmosphere__art" />
          <div className="portal-route-atmosphere__trail">
            {presentation.milestones.map((label, index) => (
              <span className="portal-route-atmosphere__waypoint" key={label}>
                {index === 0 ? <MapPin /> : index === 1 ? <Gem /> : <Sparkles />}
                <span>{label}</span>
              </span>
            ))}
          </div>
          <p className="portal-route-atmosphere__cue">{presentation.cue}</p>
        </div>
      ) : null}
      <div className="portal-route-frame__content">{children}</div>
    </section>
  );
}
