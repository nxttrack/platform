import assert from "node:assert/strict";
import test from "node:test";

import {
  badgeProviderTextIntentUrl,
  badgeShareCapabilityMatrix,
  badgeShareProviders,
  safeBadgeShareFileName
} from "../../apps/web/lib/domain/badge-share-capabilities";

test("webmatrix belooft nooit providerpublicatie of onbetrouwbare media-attachments", () => {
  for (const provider of badgeShareProviders) {
    const capability = badgeShareCapabilityMatrix[provider];
    assert.equal(capability.supportsPublicationConfirmation, false);
    if (provider !== "system") {
      assert.equal(capability.supportsImageAttachment, false);
    }
  }
  assert.equal(badgeShareCapabilityMatrix.instagram.capability, "download_copy_fallback");
  assert.equal(badgeShareCapabilityMatrix.tiktok.capability, "download_copy_fallback");
  assert.equal(badgeShareCapabilityMatrix.snapchat.capability, "download_copy_fallback");
});

test("tekst-intents encoden badgecopy zonder een publiek kindprofiel te vereisen", () => {
  const caption = "Noor behaalde Plons & Pret!";
  const whatsapp = badgeProviderTextIntentUrl("whatsapp", caption);
  const x = badgeProviderTextIntentUrl("x", caption);

  assert.equal(whatsapp, `https://wa.me/?text=${encodeURIComponent(caption)}`);
  assert.equal(x, `https://x.com/intent/post?text=${encodeURIComponent(caption)}`);
  assert.doesNotMatch(whatsapp, /participant|guardian|birth|schedule/i);
});

test("bestandsnamen zijn lokaal, begrensd en PNG", () => {
  assert.equal(safeBadgeShareFileName("Éerste Plons / Noor", "story"), "eerste-plons-noor-story.png");
  assert.ok(safeBadgeShareFileName("x".repeat(100), "square").length <= 71);
});
