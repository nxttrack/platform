import assert from "node:assert/strict";
import test from "node:test";

import {
  coachCommunication,
  reviewCommunicationProposal
} from "../../apps/web/lib/domain/communication-coach-contract";
import {
  getMessageAudienceRoles,
  isMessagePublicationConfirmed,
  isMessageVisibilityPublishable
} from "../../apps/web/lib/domain/message-audience-contract";

const baseInput = {
  audience: "parents" as const,
  body: "Hierbij willen wij u graag informeren dat de les op 12-08-2026 om 17:30 start. Meer informatie staat op https://nxttrack.nl/les.",
  goal: "shorter" as const,
  status: "draft" as const,
  title: "Lesinformatie",
  visibility: "portal" as const
};

test("maakt een bericht korter zonder beschermde feiten te wijzigen", () => {
  const result = coachCommunication(baseInput);

  assert.equal(result.blocked, false);
  assert.equal(
    result.proposal.body,
    "We laten je weten dat de les op 12-08-2026 om 17:30 start. Meer informatie staat op https://nxttrack.nl/les."
  );
  assert.ok(result.protectedFacts.includes("12-08-2026"));
  assert.ok(result.protectedFacts.includes("17:30"));
  assert.ok(result.protectedFacts.includes("https://nxttrack.nl/les."));
  assert.equal(result.confidence, "high");
});

test("is deterministisch en idempotent", () => {
  const first = coachCommunication(baseInput);
  const second = coachCommunication({
    ...baseInput,
    body: first.proposal.body
  });

  assert.deepEqual(coachCommunication(baseInput), first);
  assert.equal(second.changed, false);
  assert.equal(second.proposal.body, first.proposal.body);
});

test("voegt alleen een neutrale warme omlijsting toe", () => {
  const result = coachCommunication({
    ...baseInput,
    body: "De training start maandag.",
    goal: "warmer"
  });

  assert.match(result.proposal.body, /^Beste ouder\/verzorger,/);
  assert.match(result.proposal.body, /Met vriendelijke groet,\nhet team$/);
  assert.equal(result.blocked, false);
});

test("weigert restricted en gevoelige inhoud te herschrijven", () => {
  const restricted = coachCommunication({
    ...baseInput,
    body: "Gebruik rekening NL91ABNA0417164300."
  });
  const sensitive = coachCommunication({
    ...baseInput,
    body: "De leerling gebruikt medicatie voor astma."
  });

  assert.equal(restricted.blocked, true);
  assert.ok(
    restricted.warnings.some(
      (warning) => warning.code === "restricted_content"
    )
  );
  assert.equal(sensitive.blocked, true);
  assert.ok(
    sensitive.warnings.some(
      (warning) => warning.code === "sensitive_content"
    )
  );
});

test("weigert automatische wijzigingen aan nadelige communicatie", () => {
  const result = coachCommunication({
    ...baseInput,
    body: "We moeten de leerling uitschrijven.",
    goal: "warmer"
  });

  assert.equal(result.blocked, true);
  assert.equal(result.proposal.body, "We moeten de leerling uitschrijven.");
  assert.ok(
    result.warnings.some((warning) => warning.code === "adverse_decision")
  );
});

test("blokkeert een handmatige wijziging van beschermd feit of ontkenning", () => {
  const factChanged = reviewCommunicationProposal(baseInput, {
    title: baseInput.title,
    body: baseInput.body.replace("17:30", "18:00")
  });
  const negationInput = {
    ...baseInput,
    body: "De les gaat niet door."
  };
  const negationChanged = reviewCommunicationProposal(negationInput, {
    title: negationInput.title,
    body: "De les gaat door."
  });

  assert.equal(factChanged.blocked, true);
  assert.ok(
    factChanged.warnings.some(
      (warning) => warning.code === "protected_fact_changed"
    )
  );
  assert.equal(negationChanged.blocked, true);
  assert.ok(
    negationChanged.warnings.some(
      (warning) => warning.code === "negation_changed"
    )
  );

  const factAdded = reviewCommunicationProposal(
    {
      ...baseInput,
      body: "De les start maandag."
    },
    {
      title: baseInput.title,
      body: "De les start maandag om 18:00."
    }
  );
  assert.equal(factAdded.blocked, true);
});

test("waarschuwt dat ouders bij een intern brede doelgroep worden uitgesloten", () => {
  const result = coachCommunication({
    ...baseInput,
    audience: "all_tenant",
    visibility: "internal"
  });

  assert.ok(
    result.warnings.some(
      (warning) => warning.code === "all_tenant_internal"
    )
  );
});

test("verlaagt de classificatie van een voorstel nooit", () => {
  const input = {
    ...baseInput,
    body: "Neem contact op via ouder@example.nl."
  };
  const result = reviewCommunicationProposal(input, {
    title: input.title,
    body: "Neem contact op met de administratie."
  });

  assert.equal(result.originalClassification, "personal");
  assert.equal(result.proposalClassification, "operational");
  assert.equal(result.effectiveClassification, "personal");
});

test("sluit ouders uit van interne berichten voor iedereen", () => {
  assert.deepEqual(getMessageAudienceRoles("all_tenant", "internal"), [
    "tenant_owner",
    "tenant_admin",
    "tenant_staff",
    "instructor"
  ]);
  assert.deepEqual(getMessageAudienceRoles("parents", "internal"), []);
  assert.ok(
    getMessageAudienceRoles("all_tenant", "portal").includes("parent")
  );
});

test("vereist de afzonderlijke menselijke bevestiging voor publiceren", () => {
  assert.equal(isMessagePublicationConfirmed("draft", null), true);
  assert.equal(isMessagePublicationConfirmed("published", null), false);
  assert.equal(
    isMessagePublicationConfirmed("published", "confirmed"),
    true
  );
});

test("weigert een gepubliceerd ouderbericht dat ouders niet kunnen openen", () => {
  assert.equal(isMessageVisibilityPublishable("parents", "internal"), false);
  assert.equal(isMessageVisibilityPublishable("parents", "portal"), true);
  assert.equal(
    isMessageVisibilityPublishable("all_tenant", "internal"),
    true
  );
});
