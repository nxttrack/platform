import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMessageComposerContext, parseMessageComposerInput, messageComposerRevision, messageThreadHref } from "../../apps/web/lib/domain/message-composer-contract";

const user = "12345678-1234-4234-8234-123456789abc", tenant = "22345678-1234-4234-8234-123456789abc", child = "32345678-1234-4234-8234-123456789abc", item = "42345678-1234-4234-8234-123456789abc", thread = "52345678-1234-4234-8234-123456789abc";
const context = { actorId: user, tenantId: tenant, returnPath: `/portaal/inbox?kind=${child}`, threadId: null, participantId: child, curriculumItemId: item, sessionId: null };
test("message context binds actor and tenant, validates reference structure and preserves the selected child in return links", () => {
  assert.deepEqual(parseMessageComposerContext(context), context);
  for (const bad of [{ ...context, actorId: "" }, { ...context, tenantId: "other" }, { ...context, participantId: null }, { ...context, sessionId: item }, { ...context, returnPath: "//example.test/portaal/inbox" }, { ...context, returnPath: "/platform/themes" }]) assert.throws(() => parseMessageComposerContext(bad));
  const href = messageThreadHref(`${context.returnPath}&nieuw=1&onderdeel=${item}&archief=1`, thread);
  const url = new URL(href, "https://example.test");
  assert.equal(url.pathname, "/portaal/inbox"); assert.equal(url.searchParams.get("kind"), child); assert.equal(url.searchParams.get("archief"), "1"); assert.equal(url.searchParams.get("thread"), thread);
  assert.equal(url.searchParams.has("nieuw"), false); assert.equal(url.searchParams.has("onderdeel"), false);
});
test("composer boundaries preserve multiline text without allowing invalid visibility, oversized content or nonintegral revisions", () => {
  const input = { subject: "Vraag", plainText: "Regel één\n\nRegel twee", visibility: "public_to_thread" as const, threadType: "progress" as const };
  assert.deepEqual(parseMessageComposerInput(input), input);
  assert.throws(() => parseMessageComposerInput({ ...input, plainText: "x".repeat(8001) }));
  assert.throws(() => parseMessageComposerInput({ ...input, subject: "x".repeat(181) }));
  assert.throws(() => parseMessageComposerInput({ ...input, visibility: "parent" as never }));
  for (const revision of [-1, 0, 1.5, NaN, Infinity, 1_000_000_001, "1"]) assert.throws(() => messageComposerRevision(revision));
  assert.equal(messageComposerRevision(0, true), 0); assert.equal(messageComposerRevision(24), 24);
});
