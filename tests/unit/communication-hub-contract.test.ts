import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assessCommunicationContent,
  canUseCommunicationChannel,
  communicationShortcodes,
  extractPlainText,
  isHumanConfirmed,
  renderCommunicationTemplate,
  sanitizeCommunicationHtml,
  summarizeNewsletterSegment,
  validateShortcodes
} from "../../apps/web/lib/domain/communication-hub-contract";

test("shortcodes gebruiken een vaste allowlist en renderen alleen bekende waarden", () => {
  const template =
    "Beste {{parent_name}}, {{child_name}} zwemt bij {{tenant_name}}.";
  const validation = validateShortcodes(template);

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.used, [
    "parent_name",
    "child_name",
    "tenant_name"
  ]);
  assert.equal(
    renderCommunicationTemplate(template, {
      parent_name: "Sam",
      child_name: "Noa",
      tenant_name: "De Waterlijn"
    }),
    "Beste Sam, Noa zwemt bij De Waterlijn."
  );
  assert.equal(communicationShortcodes.length, 11);
});

test("onbekende en ontbrekende shortcodes blokkeren rendering", () => {
  const unknown = validateShortcodes("Hallo {{secret_value}}");

  assert.equal(unknown.valid, false);
  assert.deepEqual(unknown.unknown, ["secret_value"]);
  assert.throws(
    () => renderCommunicationTemplate("Hallo {{secret_value}}", {}),
    /Onbekende communicatievariabelen/
  );
  assert.throws(
    () => renderCommunicationTemplate("Hallo {{parent_name}}", {}),
    /Ontbrekende communicatievariabelen/
  );
});

test("HTML sanitizer verwijdert actieve inhoud, attributen en onveilige links", () => {
  const html = [
    "<h2 onclick=\"steal()\">Nieuws</h2>",
    "<script>alert(1)</script>",
    "<p style=\"color:red\">Welkom <strong>ouder</strong>.</p>",
    "<a href=\"javascript&#58;alert(1)\" target=\"_blank\">Onveilig</a>",
    "<a href=\"https://nxttrack.nl/portaal\" onclick=\"steal()\">Portaal</a>",
    "<img src=x onerror=steal()>"
  ].join("");
  const sanitized = sanitizeCommunicationHtml(html);

  assert.equal(
    sanitized,
    "<h2>Nieuws</h2><p>Welkom <strong>ouder</strong>.</p><a>Onveilig</a><a href=\"https://nxttrack.nl/portaal\" rel=\"noopener noreferrer\">Portaal</a>"
  );
  assert.doesNotMatch(sanitized, /script|onclick|onerror|javascript|style=|<img/i);
});

test("plain-text extractie bewaart leesbare paragrafen en verwijdert scripts", () => {
  const plain = extractPlainText(
    "<h2>Update &amp; planning</h2><p>Les één.<br>Les twee.</p><script>geheim()</script><ul><li>Badje 1</li><li>Badje 2</li></ul>"
  );

  assert.equal(
    plain,
    "Update & planning\nLes één.\nLes twee.\n• Badje 1\n• Badje 2"
  );
  assert.doesNotMatch(plain, /geheim/);
});

test("segmenten geven een begrijpelijke en privacybewuste samenvatting", () => {
  assert.equal(
    summarizeNewsletterSegment("waitlist"),
    "Wachtlijst: Contacten op de actieve wachtlijst die nieuwsbriefcommunicatie toestaan."
  );
  assert.match(
    summarizeNewsletterSegment("open_payment_parents"),
    /alleen voor servicecommunicatie/
  );
});

test("delivery gating vereist exact ingeschakelde e-mail en passende toestemming", () => {
  const defaults = {
    emailEnabled: "true",
    hasConsent: true,
    whatsappEnabled: false,
    smsEnabled: false
  };

  assert.equal(
    canUseCommunicationChannel({ ...defaults, channel: "in_app" }),
    true
  );
  assert.equal(
    canUseCommunicationChannel({ ...defaults, channel: "email" }),
    true
  );
  assert.equal(
    canUseCommunicationChannel({
      ...defaults,
      channel: "email",
      emailEnabled: "TRUE"
    }),
    false
  );
  assert.equal(
    canUseCommunicationChannel({
      ...defaults,
      channel: "newsletter",
      hasConsent: false
    }),
    false
  );
  assert.equal(
    canUseCommunicationChannel({
      ...defaults,
      channel: "whatsapp_urgent",
      whatsappEnabled: true
    }),
    true
  );
  assert.equal(
    canUseCommunicationChannel({
      ...defaults,
      channel: "sms_fallback",
      smsEnabled: true,
      hasConsent: false
    }),
    false
  );
});

test("menselijke bevestiging accepteert uitsluitend de afgesproken waarde", () => {
  assert.equal(isHumanConfirmed("confirmed"), true);
  assert.equal(isHumanConfirmed(true), false);
  assert.equal(isHumanConfirmed("true"), false);
  assert.equal(isHumanConfirmed(undefined), false);
});

test("bestaande classificatie blokkeert gevoelige externe communicatie", () => {
  const operational = assessCommunicationContent("De les start om 17:30.");
  const personal = assessCommunicationContent(
    "Stuur het antwoord naar ouder@example.nl."
  );
  const sensitive = assessCommunicationContent(
    "De leerling gebruikt medicatie voor astma."
  );

  assert.equal(operational.classification, "operational");
  assert.equal(operational.blocksExternalDelivery, false);
  assert.equal(personal.classification, "personal");
  assert.equal(personal.requiresHumanReview, true);
  assert.equal(sensitive.classification, "sensitive");
  assert.equal(sensitive.blocksExternalDelivery, true);
  assert.match(sensitive.warning ?? "", /Externe verzending is geblokkeerd/);
});

test("hubacties maken alleen in-app evidence en doen geen externe provider-call", () => {
  const source = readFileSync(
    new URL("../../apps/web/lib/domain/communication-hub-actions.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /deliverEmail: false/);
  assert.match(source, /\.from\("communication_deliveries"\)\.insert/);
  assert.match(source, /status: candidate\.consent \? "pending" : "skipped_no_consent"/);
  assert.doesNotMatch(source, /sendTransactionalEmail|sendWithSendGrid|api\.sendgrid\.com|twilio|fetch\(/i);
});

test("gespreksacties valideren ouder-kindrelaties en trekken oude toegang in", () => {
  const source = readFileSync(
    new URL("../../apps/web/lib/domain/communication-hub-actions.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /guardianCanViewParticipant/);
  assert.match(source, /De gekozen ouder\/verzorger heeft geen toegang tot deze leerling/);
  assert.match(source, /status: "removed"/);
  assert.match(source, /can_view_internal: false/);
  assert.match(source, /Interne notities zijn alleen beschikbaar wanneer je aan dit gesprek bent toegewezen/);
});

test("alle geconfigureerde nieuwsbriefsegmenten hebben een veilige resolver", () => {
  const source = readFileSync(
    new URL("../../apps/web/lib/domain/communication-hub-actions.ts", import.meta.url),
    "utf8"
  );

  for (const segment of [
    "program_parents",
    "group_parents",
    "stage_parents",
    "graduation_candidates",
    "makeup_credit_parents",
    "open_payment_parents"
  ]) {
    assert.match(source, new RegExp(`input\\.segment === "${segment}"`));
  }
  assert.match(source, /isReservedTestEmail/);
  assert.match(source, /skipped_no_consent/);
  assert.match(source, /recipientCount === 0/);
  assert.match(source, /geen ontvangers met geldige toestemming/);
});

test("rijke inhoud is niet leeg en nieuwsbriefshortcodes gebruiken dezelfde allowlist", () => {
  const source = readFileSync(
    new URL("../../apps/web/lib/domain/communication-hub-actions.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /Vul inhoud voor de template in/);
  assert.match(source, /Vul inhoud voor de nieuwsbrief in/);
  assert.match(source, /validateShortcodes\(`\$\{readRequired\(formData, "subject"/);
});
