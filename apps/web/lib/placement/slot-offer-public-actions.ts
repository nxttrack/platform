"use server";

import { redirect } from "next/navigation";

import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";

export async function respondToSlotOfferAction(formData: FormData) {
  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  const token = requiredString(formData, "token");
  const response = enumValue(formData, "response", ["accepted", "declined"], "declined");
  const supabase = createAdminClient();
  const offerLookup = await supabase.from("slot_offers").select("id").eq("offer_token", token).maybeSingle();

  if (offerLookup.error) {
    throw new Error(offerLookup.error.message);
  }

  if (!offerLookup.data) {
    redirect(`/slot-offers/${encodeURIComponent(token)}?status=invalid`);
  }

  const result = await supabase
    .from("slot_offer_responses")
    .insert({
      offer_token: token,
      response,
      parent_note: optionalString(formData, "parent_note"),
      decline_reason: response === "declined" ? optionalString(formData, "decline_reason") : null
    })
    .select("processing_status, processing_error")
    .single();

  if (result.error) {
    throw new Error(result.error.message);
  }

  const processingStatus = typeof result.data?.processing_status === "string" ? result.data.processing_status : "processed";
  const processingError = typeof result.data?.processing_error === "string" ? result.data.processing_error : null;

  if (processingStatus === "failed") {
    const status = processingError?.toLowerCase().includes("expired") ? "expired" : "pending";
    redirect(`/slot-offers/${encodeURIComponent(token)}?status=${status}`);
  }

  redirect(`/slot-offers/${encodeURIComponent(token)}?status=${response}`);
}

function requiredString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    throw new Error(`${key} is verplicht.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function enumValue<const Value extends string>(formData: FormData, key: string, allowed: readonly Value[], fallback: Value) {
  const value = optionalString(formData, key) ?? fallback;

  return allowed.includes(value as Value) ? (value as Value) : fallback;
}
