export type ImportType = "participants" | "guardians" | "groups" | "enrollments" | "payments" | "mixed";
export type ImportField = { key: string; label: string; required?: boolean };

export const importFieldsByType: Record<ImportType, ImportField[]> = {
  participants: [{ key: "display_name", label: "Naam leerling", required: true }, { key: "birth_date", label: "Geboortedatum" }, { key: "external_reference", label: "Externe referentie" }, { key: "guardian_email", label: "E-mail ouder" }],
  guardians: [{ key: "full_name", label: "Naam ouder", required: true }, { key: "email", label: "E-mail", required: true }],
  groups: [{ key: "name", label: "Groepsnaam", required: true }, { key: "code", label: "Groepscode", required: true }, { key: "program_code", label: "Programmacode", required: true }, { key: "stage_code", label: "Niveaucode" }, { key: "resource_code", label: "Resourcecode" }, { key: "capacity", label: "Capaciteit" }, { key: "weekday", label: "Weekdag" }, { key: "start_time", label: "Starttijd" }, { key: "end_time", label: "Eindtijd" }],
  enrollments: [{ key: "participant_reference", label: "Leerlingreferentie", required: true }, { key: "program_code", label: "Programmacode", required: true }, { key: "stage_code", label: "Niveaucode" }, { key: "starts_on", label: "Startdatum" }],
  payments: [{ key: "participant_reference", label: "Leerlingreferentie", required: true }, { key: "amount_eur", label: "Bedrag EUR", required: true }, { key: "due_on", label: "Vervaldatum", required: true }, { key: "status", label: "Status" }],
  mixed: [{ key: "record_type", label: "Recordtype", required: true }]
};

export function getImportFields(type: string) {
  const importType = asImportType(type);
  if (importType !== "mixed") return importFieldsByType[importType];
  const seen = new Set<string>();
  return Object.values(importFieldsByType).flat().filter((field) => !seen.has(field.key) && Boolean(seen.add(field.key)));
}

export function asImportType(value: string): ImportType {
  if (!["participants", "guardians", "groups", "enrollments", "payments", "mixed"].includes(value)) throw new Error("Unknown import type");
  return value as ImportType;
}
