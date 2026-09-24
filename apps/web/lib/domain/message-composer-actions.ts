"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createClient } from "@/lib/supabase/server";
import { classifyContent } from "@/lib/security/content-classification";
import { getActiveTenant } from "./core";
import { messageComposerRevision, messageComposerUuid, parseMessageComposerContext, parseMessageComposerInput,
  type MessageComposerContext, type MessageComposerDraft, type MessageComposerError, type MessageComposerInput, type MessageComposerLoad, type MessageComposerResult } from "./message-composer-contract";

async function composerContext(raw: MessageComposerContext) {
  const input = parseMessageComposerContext(raw);
  const context = await requirePrivateShellContext(input.returnPath as `/${string}`);
  const tenant = getActiveTenant(context);
  if (input.actorId !== context.user.id || input.tenantId !== tenant.id) throw new Error("message_composer_access_denied");
  return { input, context, tenant, supabase: await createClient() };
}
function contextArgs(tenant: string, input: MessageComposerContext) {
  return { p_tenant: tenant, p_thread: input.threadId, p_participant: input.participantId, p_item: input.curriculumItemId, p_session: input.sessionId };
}
function failure(error: unknown): MessageComposerError {
  unstable_rethrow(error);
  const text = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (/revision_conflict/.test(text)) return { ok: false, code: "conflict", message: "Het concept is in een ander venster gewijzigd. Je invoer blijft staan; laad het opgeslagen concept opnieuw voordat je verdergaat." };
  if (/recipient_changed/.test(text)) return { ok: false, code: "conflict", message: "De ontvanger is gewijzigd. Controleer het gesprek opnieuw; er is niets verstuurd." };
  if (/access_denied|read_only|visibility_invalid|assignment_required|replies_disabled|reference_denied/.test(text)) return { ok: false, code: "access", message: "Je hebt geen schrijfrecht voor deze combinatie van gesprek, leerling en zichtbaarheid." };
  if (/draft_unavailable/.test(text)) return { ok: false, code: "expired", message: "Dit concept is verlopen of al verwerkt. Je invoer blijft staan." };
  if (/invalid|content_required|confirmation_required|reference_participant_required/.test(text)) return { ok: false, code: "invalid", message: "Controleer de inhoud, verwijzing en bevestiging. Er is niets verstuurd." };
  return { ok: false, code: "unavailable", message: "De actie is niet bevestigd. Je invoer blijft staan; probeer het opnieuw." };
}

export async function loadMessageComposerAction(raw: MessageComposerContext, visibility: MessageComposerInput["visibility"] = "public_to_thread"): Promise<MessageComposerResult<MessageComposerLoad & { scope: string }>> {
  try {
    const { input, context, tenant, supabase } = await composerContext(raw);
    const result = await supabase.rpc("read_message_composer_draft", { ...contextArgs(tenant.id, input), p_visibility: parseMessageComposerInput({ subject: "", plainText: "", threadType: "general", visibility }).visibility });
    if (result.error || !result.data) throw result.error ?? new Error("message_read_failed");
    return { ok: true, value: { ...result.data as MessageComposerLoad, scope: `${context.user.id}:${tenant.id}:${input.threadId ?? "new"}:${input.participantId ?? "general"}` } };
  } catch (error) { return failure(error); }
}
export async function saveMessageComposerAction(raw: MessageComposerContext, content: MessageComposerInput, expectedRevision: number): Promise<MessageComposerResult<MessageComposerDraft>> {
  try {
    const { input, tenant, supabase } = await composerContext(raw), value = parseMessageComposerInput(content);
    const result = await supabase.rpc("save_message_composer_draft", { ...contextArgs(tenant.id, input), p_subject: value.subject, p_text: value.plainText,
      p_visibility: value.visibility, p_type: value.threadType, p_expected_revision: messageComposerRevision(expectedRevision, true) });
    if (result.error || !result.data) throw result.error ?? new Error("message_save_failed");
    return { ok: true, value: result.data as MessageComposerDraft };
  } catch (error) { return failure(error); }
}
export async function discardMessageComposerAction(raw: MessageComposerContext, id: string, revision: number): Promise<MessageComposerResult<null>> {
  try {
    const { tenant, supabase } = await composerContext(raw);
    const result = await supabase.rpc("discard_message_composer_draft", { p_tenant: tenant.id, p_draft: messageComposerUuid(id), p_expected_revision: messageComposerRevision(revision) });
    if (result.error) throw result.error;
    return { ok: true, value: null };
  } catch (error) { return failure(error); }
}
export async function sendMessageComposerAction(raw: MessageComposerContext, id: string, revision: number, operation: string, confirmed: boolean, expectedGuardian: string | null): Promise<MessageComposerResult<{ threadId: string; messageId: string; replayed: boolean }>> {
  try {
    const { tenant, supabase } = await composerContext(raw), draftId = messageComposerUuid(id);
    const draft = await supabase.from("message_composer_drafts").select("plain_text, visibility").eq("tenant_id", tenant.id).eq("id", draftId).maybeSingle();
    if (draft.error) throw draft.error;
    // A lost response can leave no draft: the DB receipt still safely acknowledges the same operation.
    const classification = classifyContent(draft.data?.plain_text ?? "", draft.data?.visibility === "public_to_thread" ? "personal" : "operational");
    const result = await supabase.rpc("send_message_composer_draft", { p_tenant: tenant.id, p_draft: draftId, p_revision: messageComposerRevision(revision),
      p_operation: messageComposerUuid(operation), p_human_confirmed: confirmed === true, p_classification: classification.classification, p_reasons: classification.reasons,
      p_expected_guardian: expectedGuardian === null ? null : messageComposerUuid(expectedGuardian) });
    if (result.error || !result.data) throw result.error ?? new Error("message_send_failed");
    for (const path of ["/portaal/inbox", "/instructor/berichten", "/admin/berichten"]) revalidatePath(path);
    return { ok: true, value: result.data as { threadId: string; messageId: string; replayed: boolean } };
  } catch (error) { return failure(error); }
}

export async function archiveMessageThreadAction(raw: MessageComposerContext, archived: boolean): Promise<MessageComposerResult<null>> {
  try {
    const { input, tenant, supabase } = await composerContext(raw);
    if (!input.threadId || typeof archived !== "boolean") throw new Error("message_input_invalid");
    const result = await supabase.rpc("set_message_thread_personal_archive", { p_tenant: tenant.id, p_thread: input.threadId, p_archived: archived });
    if (result.error) throw result.error;
    for (const path of ["/portaal/inbox", "/instructor/berichten", "/admin/berichten"]) revalidatePath(path);
    return { ok: true, value: null };
  } catch (error) { return failure(error); }
}
