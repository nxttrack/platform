"use client";

import { useRouter } from "next/navigation";

export function RefreshJourneyFixture() {
  const router = useRouter();
  return <button type="button" onClick={() => router.refresh()}>Fixture opnieuw laden</button>;
}
