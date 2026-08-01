export type ParentPortalSearchParams = Record<string, string | string[] | undefined>;

export function getSelectedParticipantId(
  params: ParentPortalSearchParams,
  participantIds: readonly string[]
) {
  const rawValue = params.kind;
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  return value && participantIds.includes(value) ? value : null;
}

export function filterForSelectedParticipant<T extends { participant_id: string }>(
  rows: readonly T[],
  selectedParticipantId: string | null
) {
  return selectedParticipantId
    ? rows.filter((row) => row.participant_id === selectedParticipantId)
    : [...rows];
}

export function participantContextHref(href: string, selectedParticipantId: string | null) {
  if (!selectedParticipantId) return href;
  const [pathAndQuery, hash] = href.split("#");
  const separator = pathAndQuery.includes("?") ? "&" : "?";
  return `${pathAndQuery}${separator}kind=${encodeURIComponent(selectedParticipantId)}${hash ? `#${hash}` : ""}`;
}
