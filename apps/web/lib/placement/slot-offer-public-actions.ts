"use server";

import { redirect } from "next/navigation";

import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function respondToSlotOfferAction(formData: FormData) {
  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  const token = requiredString(formData, "token");
  const response = enumValue(formData, "response", ["accepted", "declined"], "declined");
  const supabase = await createClient();
  const result = await supabase.from("slot_offer_responses").insert({
    offer_token: token,
    response,
    parent_note: optionalString(formData, "parent_note")
  });

  if (result.error) {
    throw new Error(result.error.message);
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
