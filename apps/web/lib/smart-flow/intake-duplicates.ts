import type { SupabaseClient } from "@supabase/supabase-js";

type DuplicateClient = Pick<SupabaseClient, "from">;

export type IntakeDuplicateInput = {
  tenantId: string;
  intakeSubmissionId: string;
  participantName: string;
  participantBirthdate: string | null;
  parentEmail: string;
};

export type IntakeDuplicateSummary = {
  total: number;
  blocking: number;
  warning: number;
  matches: IntakeDuplicateMatchInput[];
};

type IntakeDuplicateMatchInput = {
  tenant_id: string;
  intake_submission_id: string;
  matched_record_type: "participant" | "intake_submission" | "guardian" | "enrollment";
  matched_record_id: string | null;
  match_type: "same_child_birthdate" | "same_guardian_email" | "similar_child_name" | "active_enrollment";
  severity: "info" | "warning" | "blocking";
  score: number;
  label: string;
  detail: string;
  metadata: Record<string, unknown>;
  status: "open";
};

type ParticipantRow = {
  id: string;
  display_name: string;
  birthdate: string | null;
  status: string;
};

type IntakeRow = {
  id: string;
  participant_name: string;
  participant_birthdate: string | null;
  parent_email: string;
  status: string;
};

type GuardianRow = {
  id: string;
  participant_id: string;
  email: string | null;
  status: string;
};

type EnrollmentRow = {
  id: string;
  participant_id: string;
  status: string;
};

export async function detectAndStoreIntakeDuplicates(client: DuplicateClient, input: IntakeDuplicateInput): Promise<IntakeDuplicateSummary> {
  await client.from("intake_duplicate_matches").update({ status: "resolved" }).eq("tenant_id", input.tenantId).eq("intake_submission_id", input.intakeSubmissionId).eq("status", "open");

  const normalizedName = normalizeName(input.participantName);
  const normalizedEmail = input.parentEmail.trim().toLowerCase();
  const [participantsResult, intakesResult, guardiansResult] = await Promise.all([
    client.from("participants").select("id, display_name, birthdate, status").eq("tenant_id", input.tenantId).limit(100),
    client.from("intake_submissions").select("id, participant_name, participant_birthdate, parent_email, status").eq("tenant_id", input.tenantId).neq("id", input.intakeSubmissionId).limit(100),
    client.from("participant_guardians").select("id, participant_id, email, status").eq("tenant_id", input.tenantId).limit(100)
  ]);

  throwIfError(participantsResult.error);
  throwIfError(intakesResult.error);
  throwIfError(guardiansResult.error);

  const participants = asRows<ParticipantRow>(participantsResult.data);
  const intakes = asRows<IntakeRow>(intakesResult.data);
  const guardians = asRows<GuardianRow>(guardiansResult.data);
  const matches: IntakeDuplicateMatchInput[] = [];

  for (const participant of participants) {
    const participantName = normalizeName(participant.display_name);

    if (input.participantBirthdate && participant.birthdate === input.participantBirthdate && participantName === normalizedName) {
      matches.push(createMatch(input, "participant", participant.id, "same_child_birthdate", "blocking", 98, "Leerling bestaat mogelijk al", `${participant.display_name} heeft dezelfde naam en geboortedatum.`, { participant_status: participant.status }));
    } else if (participantName === normalizedName || isSimilarName(participantName, normalizedName)) {
      matches.push(createMatch(input, "participant", participant.id, "similar_child_name", "warning", 72, "Vergelijkbare leerlingnaam", `${participant.display_name} lijkt op de nieuwe intake.`, { participant_status: participant.status, participant_birthdate: participant.birthdate }));
    }
  }

  for (const intake of intakes) {
    const intakeName = normalizeName(intake.participant_name);

    if (input.participantBirthdate && intake.participant_birthdate === input.participantBirthdate && intakeName === normalizedName) {
      matches.push(createMatch(input, "intake_submission", intake.id, "same_child_birthdate", "warning", 88, "Vergelijkbare open intake", `${intake.participant_name} heeft dezelfde naam en geboortedatum in een eerdere intake.`, { intake_status: intake.status }));
    }

    if (intake.parent_email.trim().toLowerCase() === normalizedEmail) {
      matches.push(createMatch(input, "intake_submission", intake.id, "same_guardian_email", "warning", 78, "Ouder e-mail komt al voor", `Het e-mailadres ${input.parentEmail} komt voor in een eerdere intake.`, { intake_status: intake.status }));
    }
  }

  for (const guardian of guardians) {
    if (guardian.email?.trim().toLowerCase() === normalizedEmail) {
      matches.push(createMatch(input, "guardian", guardian.id, "same_guardian_email", "warning", 82, "Ouderaccount bestaat mogelijk al", `Het e-mailadres ${input.parentEmail} is al gekoppeld aan een ouder/verzorger.`, { participant_id: guardian.participant_id, guardian_status: guardian.status }));
    }
  }

  const participantIds = [...new Set(matches.filter((match) => match.matched_record_type === "participant").flatMap((match) => (match.matched_record_id ? [match.matched_record_id] : [])))];

  if (participantIds.length > 0) {
    const enrollmentsResult = await client.from("enrollments").select("id, participant_id, status").eq("tenant_id", input.tenantId).in("participant_id", participantIds).in("status", ["pending", "active", "paused"]);
    throwIfError(enrollmentsResult.error);

    for (const enrollment of asRows<EnrollmentRow>(enrollmentsResult.data)) {
      matches.push(createMatch(input, "enrollment", enrollment.id, "active_enrollment", "blocking", 95, "Actieve inschrijving gevonden", "Er bestaat al een actieve of lopende inschrijving voor een vergelijkbare leerling.", { participant_id: enrollment.participant_id, enrollment_status: enrollment.status }));
    }
  }

  const uniqueMatches = dedupe(matches);

  if (uniqueMatches.length > 0) {
    const { error } = await client.from("intake_duplicate_matches").upsert(uniqueMatches, { onConflict: "tenant_id,intake_submission_id,matched_record_type,matched_record_id,match_type" });
    throwIfError(error);
  }

  const summary = {
    total: uniqueMatches.length,
    blocking: uniqueMatches.filter((match) => match.severity === "blocking").length,
    warning: uniqueMatches.filter((match) => match.severity === "warning").length,
    matches: uniqueMatches
  };

  const { error: updateError } = await client
    .from("intake_submissions")
    .update({
      duplicate_snapshot: {
        total: summary.total,
        blocking: summary.blocking,
        warning: summary.warning,
        checked_at: new Date().toISOString()
      }
    })
    .eq("tenant_id", input.tenantId)
    .eq("id", input.intakeSubmissionId);

  throwIfError(updateError);

  return summary;
}

function createMatch(input: IntakeDuplicateInput, matchedRecordType: IntakeDuplicateMatchInput["matched_record_type"], matchedRecordId: string | null, matchType: IntakeDuplicateMatchInput["match_type"], severity: IntakeDuplicateMatchInput["severity"], score: number, label: string, detail: string, metadata: Record<string, unknown>): IntakeDuplicateMatchInput {
  return {
    tenant_id: input.tenantId,
    intake_submission_id: input.intakeSubmissionId,
    matched_record_type: matchedRecordType,
    matched_record_id: matchedRecordId,
    match_type: matchType,
    severity,
    score,
    label,
    detail,
    metadata,
    status: "open"
  };
}

function dedupe(matches: IntakeDuplicateMatchInput[]) {
  const seen = new Set<string>();

  return matches.filter((match) => {
    const key = `${match.matched_record_type}:${match.matched_record_id ?? "none"}:${match.match_type}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isSimilarName(left: string, right: string) {
  if (!left || !right || left === right) {
    return left === right;
  }

  return left.includes(right) || right.includes(left);
}

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

function asRows<Row>(rows: unknown): Row[] {
  return Array.isArray(rows) ? (rows as Row[]) : [];
}
