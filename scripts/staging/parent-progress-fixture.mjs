const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function prepareParentProgressFixture(admin, phase, foreignTenantId) {
  const ownTenantId = phase?.tenant?.id, parentUserId = phase?.users?.parent?.id;
  const ownParticipantId = phase?.expected?.participantId, ownScoreId = phase?.expected?.progressScoreId;
  if (![ownTenantId, parentUserId, ownParticipantId, ownScoreId, foreignTenantId].every((value) => uuid.test(value ?? "")) || ownTenantId === foreignTenantId) {
    throw new Error("Parent progress fixtures require the current Phase 16 tenant, parent, participant and score identities plus a different isolation tenant.");
  }
  // The caller is staging-only. Dedicated codes make reruns idempotent without
  // changing the existing positive Phase 16 score or any guardian relationships.
  async function upsert(table, values, onConflict) {
    const result = await admin.from(table).upsert(values, { onConflict }).select("id").single();
    if (result.error || !result.data?.id) throw new Error(`Could not prepare bounded parent progress ${table} fixture.`);
    return result.data.id;
  }
  async function fixtureRows(tenantId) {
    const participantId = await upsert("participants", {
      tenant_id: tenantId, display_name: "Fictieve RLS-isolatiedeelnemer", external_reference: "rls-parent-score-isolation", status: "active"
    }, "tenant_id,external_reference");
    const moduleId = await upsert("progress_modules", {
      tenant_id: tenantId, code: "RLS-PARENT-SCORE-ISOLATION", name: "Technische RLS-isolatiecontrole", status: "active"
    }, "tenant_id,code");
    const itemId = await upsert("progress_items", {
      tenant_id: tenantId, module_id: moduleId, code: "RLS-PARENT-SCORE-ISOLATION", name: "Fictieve afgeschermde score", status: "active"
    }, "tenant_id,module_id,code");
    return { participantId, moduleId, itemId };
  }
  async function score(tenantId, participantId, rows, visibility) {
    return upsert("participant_progress_scores", {
      tenant_id: tenantId, participant_id: participantId, module_id: rows.moduleId, item_id: rows.itemId,
      score: 1, scale_version: "five_point_v1", source_scale_version: "five_point_v1",
      positive_label: "Fictieve isolatiecontrole", visibility, status: "active"
    }, "tenant_id,participant_id,item_id");
  }
  const ownRows = await fixtureRows(ownTenantId), foreignRows = await fixtureRows(foreignTenantId);
  return {
    parentUserId, ownTenantId, ownParticipantId, ownScoreId,
    protectedParticipantId: ownRows.participantId,
    protectedScoreId: await score(ownTenantId, ownRows.participantId, ownRows, "parent_visible"),
    foreignTenantId, foreignParticipantId: foreignRows.participantId,
    foreignScoreId: await score(foreignTenantId, foreignRows.participantId, foreignRows, "parent_visible"),
    internalScoreId: await score(ownTenantId, ownParticipantId, ownRows, "internal")
  };
}
