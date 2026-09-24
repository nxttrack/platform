"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { JourneyTimelineEvent } from "@/lib/theme/portal-journey-contract";
import type { PortalJourneyView } from "@/lib/domain/portal-journey-view";
import type { PortalJourneyPresentationV1 } from "@/lib/theme/portal-journey-presentation";
import { PortalJourneyScene } from "./portal-journey-scene";
import { PortalCollection } from "./portal-collection";
import type { PortalCollectionContext } from "@/lib/domain/portal-collection-contract";

/** Serializable server boundary; each audience supplies its own authorized view model. */
export function PortalJourney({ audience, participantId, collectionContext, allowCollectionDiscovery = true, ...props }: {
  audience: "parent" | "child" | "preview"; participantId?: string | null;
  presentation: PortalJourneyPresentationV1; worldId: string; model: PortalJourneyView | null; contextKey: string; title: string;
  events?: readonly JourneyTimelineEvent[];
  collectionContext?: PortalCollectionContext; allowCollectionDiscovery?: boolean;
  lesson?: { label: string; href: string } | null; assetUrls?: Readonly<Record<string, string>>; reducedMotion?: boolean;
}) {
  const router = useRouter(), searchParams = useSearchParams(), pathname = usePathname();
  function params(id: string) {
    const query = new URLSearchParams(searchParams.toString()); query.set("onderdeel", id);
    if (participantId && audience === "parent") query.set("kind", participantId);
    return query;
  }
  return <PortalJourneyScene {...props} collectionControls={audience !== "preview" && collectionContext ? <PortalCollection context={collectionContext} themeKey={props.presentation.themeId} release={props.presentation.runtimeRelease} discoverable={allowCollectionDiscovery && !searchParams.has("hoofdstuk") && props.presentation.collectibles.pool.length > 0} /> : null} selectedId={searchParams.get("onderdeel") ?? searchParams.get("focus")} onSelect={(id) => {
    const query = params(id); query.delete("detail"); query.delete("focus");
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  }} detailHref={(id) => {
    const query = params(id);
    if (audience === "child") { query.set("detail", searchParams.has("hoofdstuk") ? "chapter" : "1"); query.set("tab", searchParams.has("hoofdstuk") ? "mijlpalen" : "onderdelen"); }
    return `${audience === "parent" ? "/portaal/ontwikkeling" : audience === "child" ? "/kind/reis" : pathname}?${query.toString()}`;
  }} />;
}
