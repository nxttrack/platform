"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PortalJourneyView } from "@/lib/domain/portal-journey-view";
import type { PortalJourneyPresentationV1 } from "@/lib/theme/portal-journey-presentation";
import { PortalJourneyScene } from "./portal-journey-scene";

/** Serializable server boundary; each audience supplies its own authorized view model. */
export function PortalJourney({ audience, participantId, ...props }: {
  audience: "parent" | "child" | "preview"; participantId?: string | null;
  presentation: PortalJourneyPresentationV1; worldId: string; model: PortalJourneyView | null; contextKey: string; title: string;
  lesson?: { label: string; href: string } | null; assetUrls?: Readonly<Record<string, string>>; reducedMotion?: boolean;
}) {
  const router = useRouter(), searchParams = useSearchParams(), pathname = usePathname();
  function params(id: string) {
    const query = new URLSearchParams(searchParams.toString()); query.set("onderdeel", id);
    if (participantId && audience === "parent") query.set("kind", participantId);
    return query;
  }
  return <PortalJourneyScene {...props} selectedId={searchParams.get("onderdeel")} onSelect={(id) => {
    router.replace(`${pathname}?${params(id).toString()}`, { scroll: false });
  }} detailHref={(id) => `${audience === "parent" ? "/portaal/ontwikkeling" : audience === "child" ? "/kind/reis" : pathname}?${params(id).toString()}`} />;
}
