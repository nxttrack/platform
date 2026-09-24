const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const columns = "id,tenant_id,participant_id,visibility,status";
function requireFixture(condition, message) {
  if (!condition) throw new Error(`Parent progress isolation fixture ${message}.`);
}

export async function verifyParentProgressIsolation({ fixture, userId, ownTenantIds, serviceRead, parentRead }) {
  const fields = ["parentUserId", "ownTenantId", "ownParticipantId", "ownScoreId", "protectedParticipantId", "protectedScoreId", "foreignTenantId", "foreignParticipantId", "foreignScoreId", "internalScoreId"];
  requireFixture(fixture && fields.every((key) => uuid.test(fixture[key] ?? "")), "is missing required UUIDs");
  requireFixture(fixture.parentUserId === userId && ownTenantIds.has(fixture.ownTenantId) && !ownTenantIds.has(fixture.foreignTenantId), "does not match the authenticated parent tenant boundary");
  const probes = [
    { name: "own visible score", id: fixture.ownScoreId, tenant: fixture.ownTenantId, participant: fixture.ownParticipantId, visibility: "parent_visible", visible: true },
    { name: "unlinked same-tenant child", id: fixture.protectedScoreId, tenant: fixture.ownTenantId, participant: fixture.protectedParticipantId, visibility: "parent_visible", visible: false },
    { name: "foreign-tenant child", id: fixture.foreignScoreId, tenant: fixture.foreignTenantId, participant: fixture.foreignParticipantId, visibility: "parent_visible", visible: false },
    { name: "internal score of own child", id: fixture.internalScoreId, tenant: fixture.ownTenantId, participant: fixture.ownParticipantId, visibility: "internal", visible: false }
  ];
  const ids = probes.map((probe) => probe.id);
  const participants = [fixture.ownParticipantId, fixture.protectedParticipantId, fixture.foreignParticipantId];
  requireFixture(new Set(ids).size === 4 && new Set(participants).size === 3, "contains duplicate score or participant identities");
  const scores = await serviceRead(`/participant_progress_scores?select=${columns}&id=in.(${ids.join(",")})`);
  requireFixture(Array.isArray(scores) && scores.length === 4, "does not contain all four existing scores");
  for (const probe of probes) {
    const matches = scores.filter((row) => row.id === probe.id && row.tenant_id === probe.tenant && row.participant_id === probe.participant && row.visibility === probe.visibility && row.status === "active");
    requireFixture(matches.length === 1, `has an invalid ${probe.name}`);
  }
  const records = await serviceRead(`/participants?select=id,tenant_id,guardian_user_id&id=in.(${participants.join(",")})`);
  const links = await serviceRead(`/participant_guardians?select=participant_id,guardian_user_id,status&participant_id=in.(${participants.join(",")})&guardian_user_id=eq.${userId}&status=eq.active`);
  requireFixture(Array.isArray(records) && records.length === 3 && Array.isArray(links), "cannot verify participant ownership");
  const linked = (id) => links.some((row) => row.participant_id === id && row.guardian_user_id === userId && row.status === "active");
  for (const [participant, tenant, owns] of [[fixture.ownParticipantId, fixture.ownTenantId, true], [fixture.protectedParticipantId, fixture.ownTenantId, false], [fixture.foreignParticipantId, fixture.foreignTenantId, false]]) {
    const record = records.find((row) => row.id === participant && row.tenant_id === tenant);
    requireFixture(record && ((record.guardian_user_id === userId || linked(participant)) === owns), "has an unexpected parent/child relationship");
  }

  // Query each known existing record using the same authenticated parent token.
  // Client filters bound work; the negative probes still rely on RLS to hide it.
  for (const probe of probes) {
    const result = await parentRead(`/participant_progress_scores?select=${columns}&tenant_id=eq.${probe.tenant}&participant_id=eq.${probe.participant}&id=eq.${probe.id}&limit=2`);
    if (!result.ok) throw new Error(`Parent progress ${probe.name} query failed: HTTP ${result.status} ${result.bodyText}`);
    requireFixture(Array.isArray(result.rows), "returned a malformed parent response");
    if (probe.visible) {
      if (result.rows.length !== 1 || result.rows[0].id !== probe.id || result.rows[0].tenant_id !== probe.tenant || result.rows[0].participant_id !== probe.participant || result.rows[0].visibility !== probe.visibility || result.rows[0].status !== "active") {
        throw new Error("Parent progress own visible score was not returned exactly once.");
      }
    } else if (result.rows.length !== 0) {
      throw new Error(`Parent progress isolation leaked ${probe.name}.`);
    }
  }
  return probes.length;
}
