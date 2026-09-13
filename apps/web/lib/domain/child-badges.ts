export type ChildSafeBadgeDto = {
  id: string;
  title: string;
  category: string;
  earned: boolean;
  earnedAt: string | null;
  isSurprise: boolean;
};

type Award = { id: string; badge_release_id: string | null; title: string; awarded_at: string };
type EarnedRelease = {
  id: string;
  stable_key: string;
  name_default: string;
  name_boy: string | null;
  name_girl: string | null;
  category: string;
  is_surprise: boolean;
};
type StandardRelease = EarnedRelease & { tenant_id: string | null; release_number: number; audience: string };

export function projectChildSafeBadges({ awards, earnedReleases, standardReleases, latestAvailabilityByReleaseId, gender }: {
  awards: readonly Award[];
  earnedReleases: readonly EarnedRelease[];
  standardReleases: readonly StandardRelease[];
  latestAvailabilityByReleaseId: ReadonlyMap<string, string>;
  gender: string;
}): ChildSafeBadgeDto[] {
  const releaseById = new Map(earnedReleases.map((release) => [release.id, release]));
  // Awards refer to immutable historical releases; ownership follows the logical
  // badge identity even when a newer platform or tenant release becomes current.
  const earnedStableKeys = new Set(awards.flatMap((award) => {
    const release = award.badge_release_id ? releaseById.get(award.badge_release_id) : undefined;
    return release ? [release.stable_key] : [];
  }));
  const available = standardReleases
    .filter((release) => !release.is_surprise && audienceMatches(release.audience, gender))
    .filter((release) => (latestAvailabilityByReleaseId.get(release.id) ?? "available") === "available")
    .sort((first, second) => {
      if (first.stable_key !== second.stable_key) return first.stable_key.localeCompare(second.stable_key);
      const tenantPriority = Number(Boolean(second.tenant_id)) - Number(Boolean(first.tenant_id));
      return tenantPriority || second.release_number - first.release_number;
    });
  const currentByKey = new Map<string, StandardRelease>();
  for (const release of available) {
    if (!currentByKey.has(release.stable_key)) currentByKey.set(release.stable_key, release);
  }
  const earned: ChildSafeBadgeDto[] = awards.map((award) => {
    const release = award.badge_release_id ? releaseById.get(award.badge_release_id) : undefined;
    return {
      id: award.id,
      title: release ? genderedBadgeTitle(release, gender) : award.title,
      category: release?.category ?? "compliments",
      earned: true,
      earnedAt: award.awarded_at,
      isSurprise: release?.is_surprise === true
    };
  });
  const locked: ChildSafeBadgeDto[] = [...currentByKey.values()]
    .filter((release) => !earnedStableKeys.has(release.stable_key))
    .map((release) => ({
      id: `locked:${release.id}`,
      title: genderedBadgeTitle(release, gender),
      category: release.category,
      earned: false,
      earnedAt: null,
      isSurprise: false
    }));
  return earned.concat(locked);
}

function audienceMatches(audience: string, gender: string) {
  return audience === "all"
    || (audience === "boys" && gender === "boy")
    || (audience === "girls" && gender === "girl");
}

export function genderedBadgeTitle(
  release: { name_boy: string | null; name_default: string; name_girl: string | null },
  gender: string
) {
  if (gender === "boy") return release.name_boy ?? release.name_default;
  if (gender === "girl") return release.name_girl ?? release.name_default;
  return release.name_default;
}
