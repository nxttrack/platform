import "server-only";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GroupRow, ProgramRow, ProgramStageRow } from "./core";
import { hashOfferSessionToken, slotOfferCookieName } from "./placement-token";
import type { WaitlistEntryRow } from "./placement";

export type PublicSlotOffer = {
  status: "missing" | "invalid" | "expired" | "responded" | "open";
  offer: {
    id: string;
    status: string;
    expiresAt: string;
  } | null;
  entry: WaitlistEntryRow | null;
  group: GroupRow | null;
  program: ProgramRow | null;
  stage: ProgramStageRow | null;
};

export async function getPublicSlotOffer(): Promise<PublicSlotOffer> {
  const token = (await cookies()).get(slotOfferCookieName)?.value;

  if (!token) {
    return emptyOffer("missing");
  }

  const admin = createAdminClient();
  const offerResult = await admin
    .from("slot_offers")
    .select("id, tenant_id, waitlist_entry_id, group_id, status, expires_at")
    .eq("verified_session_hash", hashOfferSessionToken(token))
    .gt("verified_session_expires_at", new Date().toISOString())
    .maybeSingle();

  if (offerResult.error || !offerResult.data) {
    return emptyOffer("invalid");
  }

  const offer = offerResult.data as {
    id: string;
    tenant_id: string;
    waitlist_entry_id: string;
    group_id: string;
    status: string;
    expires_at: string;
  };

  const [entryResult, groupResult] = await Promise.all([
    admin
      .from("waitlist_entries")
      .select("id, intake_submission_id, program_id, recommended_stage_id, parent_name, parent_email, parent_phone, participant_name, participant_birth_date, selected_option, status, priority_date, admin_notes")
      .eq("tenant_id", offer.tenant_id)
      .eq("id", offer.waitlist_entry_id)
      .maybeSingle(),
    admin
      .from("groups")
      .select("id, program_id, stage_id, default_resource_id, name, code, status, capacity, default_weekday, default_start_time, default_end_time")
      .eq("tenant_id", offer.tenant_id)
      .eq("id", offer.group_id)
      .maybeSingle()
  ]);

  const entry = (entryResult.data as WaitlistEntryRow | null) ?? null;
  const group = (groupResult.data as GroupRow | null) ?? null;
  const [programResult, stageResult] = await Promise.all([
    entry ? admin.from("programs").select("id, name, code, description, status, sort_order").eq("tenant_id", offer.tenant_id).eq("id", entry.program_id).maybeSingle() : Promise.resolve({ data: null }),
    entry?.recommended_stage_id ? admin.from("program_stages").select("id, program_id, name, code, badge_label, color_hex, status, sort_order").eq("tenant_id", offer.tenant_id).eq("id", entry.recommended_stage_id).maybeSingle() : Promise.resolve({ data: null })
  ]);

  const status = resolveOfferStatus(offer.status, offer.expires_at);

  return {
    status,
    offer: {
      id: offer.id,
      status: offer.status,
      expiresAt: offer.expires_at
    },
    entry,
    group,
    program: (programResult.data as ProgramRow | null) ?? null,
    stage: (stageResult.data as ProgramStageRow | null) ?? null
  };
}

function resolveOfferStatus(status: string, expiresAt: string): PublicSlotOffer["status"] {
  if (new Date(expiresAt).getTime() < Date.now()) {
    return "expired";
  }

  if (status === "accepted" || status === "declined" || status === "expired" || status === "revoked") {
    return "responded";
  }

  return "open";
}

function emptyOffer(status: "missing" | "invalid"): PublicSlotOffer {
  return {
    status,
    offer: null,
    entry: null,
    group: null,
    program: null,
    stage: null
  };
}
