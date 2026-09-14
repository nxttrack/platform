import { messageVisibilities, threadTypes, type MessageVisibility, type ThreadType } from "./communication-hub-contract";

export type MessageComposerContext = {
  actorId: string; tenantId: string; returnPath: string; threadId: string | null; participantId: string | null; curriculumItemId: string | null; sessionId: string | null;
};
export type MessageComposerInput = { subject: string; plainText: string; visibility: MessageVisibility; threadType: ThreadType };
export type MessageComposerDraft = {
  id: string; tenant_id: string; author_user_id: string; thread_id: string | null; participant_id: string | null;
  curriculum_item_id: string | null; session_id: string | null; subject: string; plain_text: string;
  visibility: MessageVisibility; thread_type: ThreadType; revision: number; operation_id: string; updated_at: string; expires_at: string;
};
export type MessageContextReference = { kind: "curriculum_item" | "session"; id: string; participantId: string; label: string; stableKey?: string; curriculumVersionId?: string; startsAt?: string; timeZone?: string };
export type MessageComposerLoad = {
  draft: MessageComposerDraft | null; reference: MessageContextReference | Record<string, never>;
  recipient: { kind: "school" | "guardian"; id?: string; label: string } | null; participantLabel: string | null;
};
export type MessageComposerError = { ok: false; code: "conflict" | "access" | "expired" | "invalid" | "unavailable"; message: string };
export type MessageComposerResult<T> = { ok: true; value: T } | MessageComposerError;

export function messageComposerUuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("message_input_invalid");
  return value.toLowerCase();
}
export function messageComposerRevision(value: unknown, allowNew = false): number {
  if (!Number.isSafeInteger(value) || Number(value) < (allowNew ? 0 : 1) || Number(value) > 1_000_000_000) throw new Error("message_input_invalid");
  return Number(value);
}
export function parseMessageComposerContext(value: MessageComposerContext): MessageComposerContext {
  if (!value || typeof value !== "object" || typeof value.returnPath !== "string" || value.returnPath.length > 2000
    || !["/portaal/inbox", "/instructor/berichten", "/admin/berichten"].includes(value.returnPath.split("?")[0])) throw new Error("message_input_invalid");
  const nullable = (input: unknown) => input == null ? null : messageComposerUuid(input);
  const parsed = { actorId: messageComposerUuid(value.actorId), tenantId: messageComposerUuid(value.tenantId), returnPath: value.returnPath, threadId: nullable(value.threadId), participantId: nullable(value.participantId), curriculumItemId: nullable(value.curriculumItemId), sessionId: nullable(value.sessionId) };
  if ((parsed.curriculumItemId && parsed.sessionId) || ((parsed.curriculumItemId || parsed.sessionId) && !parsed.participantId)) throw new Error("message_input_invalid");
  return parsed;
}
export function parseMessageComposerInput(value: MessageComposerInput): MessageComposerInput {
  if (!value || typeof value !== "object" || typeof value.subject !== "string" || value.subject.length > 180 || typeof value.plainText !== "string" || value.plainText.length > 8000
    || !messageVisibilities.includes(value.visibility) || !threadTypes.includes(value.threadType)) throw new Error("message_input_invalid");
  return { subject: value.subject, plainText: value.plainText, visibility: value.visibility, threadType: value.threadType };
}
export function messageThreadHref(base: string, threadId: string): string {
  const url = new URL(base, "https://portal.invalid"); url.searchParams.set("thread", messageComposerUuid(threadId));
  for (const key of ["nieuw", "onderdeel", "les", "onderwerp"]) url.searchParams.delete(key);
  return `${url.pathname}?${url.searchParams}${url.hash}`;
}
