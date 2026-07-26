import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyContent,
  sanitizeImportedCell
} from "../../apps/web/lib/security/content-classification";

test("classificeert gewone operationele inhoud zonder persoonsgegevens", () => {
  assert.deepEqual(classifyContent({ title: "Rooster bijgewerkt", body: "De les start om acht uur." }), {
    classification: "operational",
    reasons: []
  });
});

test("verhoogt classificatie voor persoonsgegevens en gezondheidsinformatie", () => {
  const personal = classifyContent("Neem contact op via ouder@example.nl");
  assert.equal(personal.classification, "personal");
  assert.ok(personal.reasons.includes("email_address"));

  const sensitive = classifyContent("Heeft een medicatieplan voor astma.", "personal");
  assert.equal(sensitive.classification, "sensitive");
  assert.ok(sensitive.reasons.includes("health_information"));
});

test("herkent strikt beperkte waarden en bewaart geen inhoud in redenen", () => {
  const result = classifyContent("Rekening NL91ABNA0417164300");
  assert.equal(result.classification, "restricted");
  assert.deepEqual(result.reasons, ["bank_account_number"]);
});

test("normaliseert importcellen en weigert binaire of buitensporige inhoud", () => {
  assert.equal(sanitizeImportedCell("  veilig\u0007  "), "veilig");
  assert.throws(() => sanitizeImportedCell("fout\0waarde"), /NUL/);
  assert.throws(() => sanitizeImportedCell("x".repeat(2_001)), /langer/);
});
