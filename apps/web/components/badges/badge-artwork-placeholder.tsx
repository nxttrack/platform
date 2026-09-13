import { LockKeyhole, Sparkles } from "lucide-react";

export const badgeArtworkContract = {
  badgeArtworkReady: false,
  placeholderOnly: true
} as const;

export function BadgeArtworkPlaceholder({ earned }: { earned: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="child-badge-placeholder"
      data-artwork-ready={badgeArtworkContract.badgeArtworkReady}
      data-placeholder-only={badgeArtworkContract.placeholderOnly}
      data-state={earned ? "earned" : "locked"}
    >
      {earned ? <Sparkles /> : <LockKeyhole />}
    </span>
  );
}
