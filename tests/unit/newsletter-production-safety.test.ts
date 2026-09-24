import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getNewsletterDeliveryCapability } from "../../apps/web/lib/email/newsletter-delivery-capability";

test("newsletter delivery is default-off and an env flag cannot invent a sender", () => {
  assert.deepEqual(getNewsletterDeliveryCapability({}), {
    enabled: false,
    featureRequested: false,
    reason: "feature_disabled",
    senderImplemented: false
  });
  assert.deepEqual(getNewsletterDeliveryCapability({ NEWSLETTER_DELIVERY_ENABLED: "true" }), {
    enabled: false,
    featureRequested: true,
    reason: "sender_not_implemented",
    senderImplemented: false
  });
  for (const value of ["", "false", "1", "yes"]) {
    assert.equal(getNewsletterDeliveryCapability({ NEWSLETTER_DELIVERY_ENABLED: value }).enabled, false);
  }
});

test("newsletter server action rejects non-draft state before recipient preparation", () => {
  const source = readFileSync(
    new URL("../../apps/web/lib/domain/communication-hub-actions.ts", import.meta.url),
    "utf8"
  );
  const start = source.indexOf("export async function createNewsletterCampaignAction");
  const end = source.indexOf("export async function updateCommunicationSettingsAction");
  const action = source.slice(start, end);
  assert.match(action, /getNewsletterDeliveryCapability\(\)/);
  assert.match(action, /status !== "draft" && !deliveryCapability\.enabled/);
  assert.ok(action.indexOf("status !== \"draft\"") < action.indexOf("prepareNewsletterRecipients"));
  assert.doesNotMatch(action, /sendTransactionalEmail|enqueue_email_outbox|fetch\(/i);
});

test("newsletter UI exposes concept-only authoring and no schedule control", () => {
  const form = readFileSync(
    new URL("../../apps/web/components/communication/communication-forms.tsx", import.meta.url),
    "utf8"
  );
  const start = form.indexOf("export function NewsletterCampaignForm");
  const end = form.indexOf("export function CommunicationSettingsForm");
  const newsletterForm = form.slice(start, end);
  assert.match(newsletterForm, /name="status" type="hidden" value="draft"/);
  assert.match(newsletterForm, /Concept-only/);
  assert.doesNotMatch(newsletterForm, /value="scheduled"|name="scheduledAt"|Nieuwsbrief inplannen/);
});
