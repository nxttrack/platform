"use client";

import { useEffect, useState } from "react";

import { ChildJourneyMap, type ChildJourneyNodeDto } from "@/components/child/child-journey-map";
import type { JourneyTimelineEvent } from "@/lib/theme/portal-journey-contract";

type JourneyHarnessProps = {
  desktopArtwork: string | null;
  events: JourneyTimelineEvent[];
  mascotKind: "beach-lifeguard" | "dolphin" | "manta" | "penguin" | "sea-turtle" | null;
  mascotUrl: string | null;
  mobileArtwork: string | null;
  nodes: ChildJourneyNodeDto[];
};

/**
 * Test-only state wrapper around the production component. The route containing
 * this module is fail-closed unless APP_ENV=test. A DOM event lets Playwright
 * reproduce a cache/query refresh without adding controls to production UI.
 */
export function JourneyHarnessClient(props: JourneyHarnessProps) {
  const [events, setEvents] = useState(props.events);

  useEffect(() => {
    const insertEvent = () => setEvents((current) => current.some((event) => event.id === "badge-live")
      ? current
      : [...current, {
          anchorNodeId: "doel-4",
          description: "Deze mijlpaal verscheen na een veilige gegevensverversing.",
          earnedAt: "2026-08-02T12:00:00.000Z",
          eventType: "badge",
          id: "badge-live",
          label: "Live mijlpaal"
        }]);
    window.addEventListener("journey-test-live-event", insertEvent);
    return () => window.removeEventListener("journey-test-live-event", insertEvent);
  }, []);

  return <ChildJourneyMap {...props} events={events} />;
}
