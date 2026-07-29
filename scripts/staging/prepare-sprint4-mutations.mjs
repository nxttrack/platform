#!/usr/bin/env node

import { createRequire } from "node:module";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");
const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const tenantSlug = process.env.PHASE16_TENANT_SLUG || "nxttrack-e2e";
const edgeGroupCode = "sprint4-edge-full";
const edgeParticipantReference = "sprint4-edge-full-participant";

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Sprint 4 mutation cleanup is restricted to staging.nxttrack.nl.");
}

if (!supabaseUrl || !supabaseSecret) {
  throw new Error("Staging Supabase URL and server secret are required.");
}

const admin = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const tenantResult = await admin.from("tenants").select("id").eq("slug", tenantSlug).eq("status", "active").maybeSingle();

if (tenantResult.error || !tenantResult.data) {
  throw new Error("The Sprint 4 staging tenant could not be resolved.");
}

const tenantId = tenantResult.data.id;
await removeRows(admin.from("progress_notes").delete().eq("tenant_id", tenantId).like("note", "sprint4-instructor:%"), "instructor note fixtures");
await retireBadgeFixtures(admin, tenantId);
const submissionsResult = await admin
  .from("intake_submissions")
  .select("id")
  .eq("tenant_id", tenantId)
  .or("preferred_notes.like.sprint4-browser:%,message.like.sprint4-browser:%");

if (submissionsResult.error) {
  throw new Error(`Could not inventory prior Sprint 4 fixtures: ${submissionsResult.error.message}`);
}

const submissionIds = (submissionsResult.data ?? []).map((row) => row.id);
let entryIds = [];
let offerIds = [];
let acceptedParticipantIds = [];

if (submissionIds.length > 0) {
  const entriesResult = await admin
    .from("waitlist_entries")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("intake_submission_id", submissionIds);

  if (entriesResult.error) {
    throw new Error(`Could not inventory prior Sprint 4 waitlist fixtures: ${entriesResult.error.message}`);
  }

  entryIds = (entriesResult.data ?? []).map((row) => row.id);
}

if (entryIds.length > 0) {
  const offersResult = await admin
    .from("slot_offers")
    .select("id, accepted_participant_id")
    .eq("tenant_id", tenantId)
    .in("waitlist_entry_id", entryIds);

  if (offersResult.error) {
    throw new Error(`Could not inventory prior Sprint 4 offer fixtures: ${offersResult.error.message}`);
  }

  offerIds = (offersResult.data ?? []).map((row) => row.id);
  acceptedParticipantIds = (offersResult.data ?? []).flatMap((row) => (row.accepted_participant_id ? [row.accepted_participant_id] : []));
}

if (offerIds.length > 0) {
  await removeRows(
    admin.from("email_delivery_attempts").delete().eq("tenant_id", tenantId).eq("related_type", "slot_offer").in("related_id", offerIds),
    "mail-delivery attempts"
  );
}

if (entryIds.length > 0) {
  await removeRows(admin.from("waitlist_entries").delete().eq("tenant_id", tenantId).in("id", entryIds), "waitlist fixtures");
}

if (acceptedParticipantIds.length > 0) {
  await removeRows(admin.from("participants").delete().eq("tenant_id", tenantId).in("id", acceptedParticipantIds), "accepted participant fixtures");
}

if (submissionIds.length > 0) {
  await removeRows(
    admin.from("tenant_events").delete().eq("tenant_id", tenantId).eq("subject_type", "intake_submission").in("subject_id", submissionIds),
    "event fixtures"
  );
  await removeRows(admin.from("intake_submissions").delete().eq("tenant_id", tenantId).in("id", submissionIds), "intake fixtures");
}

await removeRows(admin.from("participants").delete().eq("tenant_id", tenantId).eq("external_reference", edgeParticipantReference), "full-capacity participant fixture");
await removeRows(admin.from("groups").delete().eq("tenant_id", tenantId).eq("code", edgeGroupCode), "full-capacity group fixture");

console.log(
  `[sprint4:prepare] PASS removed ${submissionIds.length} intake, ${entryIds.length} waitlist and ${offerIds.length} offer fixture(s).`
);

function hostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

async function removeRows(query, label) {
  const result = await query;

  if (result.error) {
    throw new Error(`Could not remove prior Sprint 4 ${label}: ${result.error.message}`);
  }
}

async function retireBadgeFixtures(client, scopedTenantId) {
  const inventory = await client
    .from("participant_badge_awards")
    .select("id, status")
    .eq("tenant_id", scopedTenantId)
    .like("note", "sprint4-instructor:%");

  if (inventory.error) {
    throw new Error(`Could not inventory prior Sprint 4 instructor badge fixtures: ${inventory.error.message}`);
  }

  const removableIds = (inventory.data ?? [])
    .filter((row) => row.status === "pending" || row.status === "rejected")
    .map((row) => row.id);
  const earnedIds = (inventory.data ?? [])
    .filter((row) => row.status === "awarded")
    .map((row) => row.id);

  if (removableIds.length > 0) {
    await removeRows(
      client.from("participant_badge_awards").delete().eq("tenant_id", scopedTenantId).in("id", removableIds),
      "open instructor badge fixtures"
    );
  }

  if (earnedIds.length > 0) {
    const revoked = await client
      .from("participant_badge_awards")
      .update({ status: "revoked" })
      .eq("tenant_id", scopedTenantId)
      .in("id", earnedIds);

    if (revoked.error) {
      throw new Error(`Could not revoke prior Sprint 4 instructor badge fixtures: ${revoked.error.message}`);
    }
  }
}
