#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const stagingUrl = "https://staging.nxttrack.nl";
const appUrl = normalizeUrl(process.env.PLAYWRIGHT_BASE_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || stagingUrl);
const supabaseUrl = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
const supabasePublicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const tokenPepper = process.env.AUTH_CODE_PEPPER || process.env.SESSION_SECRET || process.env.JWT_SECRET || "";
const tenantSlug = process.env.PHASE16_TENANT_SLUG || "nxttrack-e2e";
const tenantHostname = process.env.PHASE16_TENANT_HOSTNAME || `${tenantSlug}.staging.nxttrack.nl`;
const configuredTenantName = process.env.PHASE16_TENANT_NAME || "";
const tenantName = /aquaswim/i.test(configuredTenantName) || !configuredTenantName
  ? "NXTTRACK technische E2E-fixture"
  : configuredTenantName;
const statePath = path.resolve(process.cwd(), process.env.PHASE16_STATE_PATH || "artifacts/phase16-state.json");
const today = new Date().toISOString().slice(0, 10);
const phase16ProgressLabel = "Superster";

const roleAccounts = {
  tenantAdmin: {
    label: "organization admin",
    role: "tenant_admin",
    email: process.env.E2E_TENANT_ADMIN_EMAIL,
    password: process.env.E2E_TENANT_ADMIN_PASSWORD,
    fullName: process.env.PHASE16_TENANT_ADMIN_NAME || "E2E Tenantbeheer"
  },
  instructor: {
    label: "instructor",
    role: "instructor",
    email: process.env.E2E_INSTRUCTOR_EMAIL,
    password: process.env.E2E_INSTRUCTOR_PASSWORD,
    fullName: process.env.PHASE16_INSTRUCTOR_NAME || "E2E Instructeur"
  },
  parent: {
    label: "parent",
    role: "parent",
    email: process.env.E2E_PARENT_EMAIL,
    password: process.env.E2E_PARENT_PASSWORD,
    fullName: process.env.PHASE16_PARENT_NAME || "E2E Ouder"
  }
};

const requiredFailures = [
  hostnameOf(appUrl) === "staging.nxttrack.nl" ? null : `APP_URL/PLAYWRIGHT_BASE_URL must resolve to ${stagingUrl}.`,
  supabaseUrl ? null : "NEXT_PUBLIC_SUPABASE_URL is required.",
  supabasePublicKey ? null : "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required.",
  supabaseSecretKey ? null : "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.",
  tokenPepper ? null : "AUTH_CODE_PEPPER, SESSION_SECRET or JWT_SECRET is required for slot-offer token hashing.",
  ...Object.entries(roleAccounts).flatMap(([key, account]) => [
    account.email ? null : `${key} email is required.`,
    account.password ? null : `${key} password is required.`
  ])
].filter(Boolean);

if (requiredFailures.length > 0) {
  for (const failure of requiredFailures) {
    console.error(`[phase16] FAIL ${failure}`);
  }

  console.error("[phase16] Operational flow cannot start until the required staging environment is complete.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log(`[phase16] Starting operational flow against ${appUrl} for ${tenantSlug}.`);

const tenant = await ensureTenant();
const users = await ensureRoleUsers(tenant.id);
const core = await ensureCoreDemoData(tenant.id, users);
const intake = await ensureIntakeToPlacementFlow(tenant.id, users, core);
const learning = await ensureLearningFlow(tenant.id, users, core, intake);
const billing = await ensureBillingFlow(tenant.id, users, core, intake);
const graduation = await ensureGraduationFlow(tenant.id, users, core, intake);

await validateDatabaseState({ tenant, users, core, intake, learning, billing, graduation });
await validateRoleVisibility({ tenant, users, core, intake, learning, billing, graduation });

const state = {
  appUrl,
  tenant: {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    hostname: tenantHostname
  },
  users: {
    tenantAdmin: pickUserState(users.tenantAdmin),
    instructor: pickUserState(users.instructor),
    parent: pickUserState(users.parent)
  },
  expected: {
    participantName: core.participantName,
    parentName: roleAccounts.parent.fullName,
    programName: core.program.name,
    stageLabel: core.stage.badge_label,
    groupName: core.group.name,
    sessionId: core.session.id,
    groupId: core.group.id,
    participantId: intake.participant.id,
    badgeTitle: learning.badgeAward.title,
    progressLabel: learning.progressScore.positive_label,
    certificateTitle: graduation.certificate.title,
    paymentReference: billing.manualPayment.reference,
    declinedParticipantName: intake.declinedEntry.participant_name
  },
  offer: {
    acceptedToken: intake.acceptedOfferToken,
    declinedToken: intake.declinedOfferToken,
    acceptedOfferId: intake.acceptedOffer.id,
    declinedOfferId: intake.declinedOffer.id
  }
};

mkdirSync(path.dirname(statePath), { recursive: true });
writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
console.log(`[phase16] Wrote state to ${statePath}.`);

if (process.env.PHASE16_SKIP_PLAYWRIGHT !== "true") {
  const playwrightEnv = {
    ...process.env,
    APP_ENV: "staging",
    TARGET: "staging",
    APP_URL: appUrl,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || appUrl,
    PLAYWRIGHT_BASE_URL: appUrl,
    PHASE16_STATE_PATH: statePath,
    PHASE16_REQUIRE_PLAYWRIGHT: "true",
    E2E_TENANT_ADMIN_EMAIL: roleAccounts.tenantAdmin.email,
    E2E_TENANT_ADMIN_PASSWORD: roleAccounts.tenantAdmin.password,
    E2E_INSTRUCTOR_EMAIL: roleAccounts.instructor.email,
    E2E_INSTRUCTOR_PASSWORD: roleAccounts.instructor.password,
    E2E_PARENT_EMAIL: roleAccounts.parent.email,
    E2E_PARENT_PASSWORD: roleAccounts.parent.password
  };

  if (process.env.PHASE16_SKIP_PLAYWRIGHT_INSTALL !== "true") {
    runStep("ensure Playwright Chromium and system dependencies", "pnpm", [
      "--filter",
      "@nxttrack/web",
      "exec",
      "playwright",
      "install",
      "--with-deps",
      "chromium"
    ], playwrightEnv);
  }

  runStep("run Phase 16 Playwright operational smoke", "pnpm", ["--filter", "@nxttrack/web", "exec", "playwright", "test", "tests/e2e/phase16-operational.spec.ts"], playwrightEnv);
}

console.log("[phase16] PASS End-to-end operational flow completed.");

async function ensureTenant() {
  const tenantRow = await upsertOne(
    "tenants",
    {
      slug: tenantSlug,
      name: tenantName,
      sector: "swim_school",
      status: "active"
    },
    "slug",
    "id, slug, name"
  );

  await upsertOne(
    "tenant_settings",
    {
      tenant_id: tenantRow.id,
      terminology_sector: "swim_school",
      locale: "nl-NL",
      timezone: "Europe/Amsterdam",
      lesson_cancellation_cutoff_hours: 12,
      lesson_cancellation_credit_window_days: 60,
      lesson_cancellation_grants_credit: true
    },
    "tenant_id",
    "tenant_id"
  );

  const domainReset = await admin.from("tenant_domains").update({ is_primary: false }).eq("tenant_id", tenantRow.id).neq("hostname", tenantHostname);

  if (domainReset.error) {
    throw new Error(`[phase16] Could not reset demo tenant primary domains: ${domainReset.error.message}`);
  }

  await upsertOne(
    "tenant_domains",
    {
      tenant_id: tenantRow.id,
      hostname: tenantHostname,
      kind: "subdomain",
      status: "verified",
      is_primary: true
    },
    "hostname",
    "id"
  );

  await upsertOne(
    "tenant_branding",
    {
      tenant_id: tenantRow.id,
      product_name: "NXTTRACK E2E",
      primary_color: "#334155",
      accent_color: "#64748b",
      portal_welcome: "Technische staging-fixture voor geautomatiseerde kwaliteitscontrole.",
      pwa_enabled: false,
      status: "active"
    },
    "tenant_id",
    "tenant_id"
  );

  return tenantRow;
}

async function ensureRoleUsers(tenantId) {
  const entries = await Promise.all(
    Object.entries(roleAccounts).map(async ([key, account]) => {
      const user = await ensureUser(account.email, account.password, account.fullName);

      await upsertOne(
        "tenant_memberships",
        {
          tenant_id: tenantId,
          user_id: user.id,
          role: account.role,
          status: "active",
          invited_email: account.email
        },
        "tenant_id,user_id,role",
        "id"
      );

      return [key, user];
    })
  );

  return Object.fromEntries(entries);
}

async function ensureCoreDemoData(tenantId, users) {
  const participantName = process.env.PHASE16_PARTICIPANT_NAME || "E2E Leerling";
  const program = await upsertOne(
    "programs",
    {
      tenant_id: tenantId,
      name: "Zwemdiploma A",
      code: "PHASE16-ZWEM-A",
      description: "Phase 16 demo programma voor de volledige zwemschoolreis.",
      status: "active",
      sort_order: 16,
      min_age_months: 48,
      max_age_months: 120
    },
    "tenant_id,code",
    "id, name, code, status"
  );
  const stage = await upsertOne(
    "program_stages",
    {
      tenant_id: tenantId,
      program_id: program.id,
      name: "Badje 1",
      code: "PHASE16-BADJE-1",
      badge_label: "Badje 1",
      description: "Waterwennen, drijven en eerste slagen.",
      color_hex: "#0EA5E9",
      status: "active",
      sort_order: 1
    },
    "tenant_id,program_id,code",
    "id, name, code, badge_label, status"
  );
  const location = await upsertOne(
    "resources",
    {
      tenant_id: tenantId,
      kind: "location",
      name: "Phase 16 Zwembad",
      code: "PHASE16-LOC",
      capacity: 40,
      status: "active",
      sort_order: 1
    },
    "tenant_id,code",
    "id, name, code"
  );
  const lane = await upsertOne(
    "resources",
    {
      tenant_id: tenantId,
      parent_resource_id: location.id,
      kind: "lane",
      name: "Baan 1",
      code: "PHASE16-LANE-1",
      capacity: 8,
      status: "active",
      sort_order: 2
    },
    "tenant_id,code",
    "id, name, code"
  );
  const group = await upsertOne(
    "groups",
    {
      tenant_id: tenantId,
      program_id: program.id,
      stage_id: stage.id,
      default_resource_id: lane.id,
      name: "Maandag Badje 1",
      code: "PHASE16-GROUP-A",
      status: "active",
      capacity: 8,
      default_weekday: 1,
      default_start_time: "16:00",
      default_end_time: "16:45",
      starts_on: today
    },
    "tenant_id,code",
    "id, name, code, program_id, stage_id, default_resource_id"
  );

  await upsertOne(
    "instructor_qualifications",
    {
      tenant_id: tenantId,
      instructor_user_id: users.instructor.id,
      program_id: program.id,
      stage_id: stage.id,
      resource_id: lane.id,
      qualification_key: "phase16_zwemonderwijzer",
      name: "Phase 16 zwemonderwijzer",
      status: "active",
      valid_from: "2026-01-01",
      valid_until: "2035-12-31",
      evidence_note: "Technische staging-fixture voor de transactionele planningscontrole.",
      verified_by_user_id: users.tenantAdmin.id,
      verified_at: new Date().toISOString()
    },
    "tenant_id,instructor_user_id,qualification_key,program_id,stage_id,resource_id",
    "id"
  );

  await upsertOne(
    "group_instructor_assignments",
    {
      tenant_id: tenantId,
      group_id: group.id,
      instructor_user_id: users.instructor.id,
      role: "primary",
      status: "active",
      starts_on: "2026-01-01"
    },
    "group_id,instructor_user_id,role,starts_on",
    "id"
  );

  const sessionWindow = futureWindow(2, 16, 45);
  const session = await ensureByFilter(
    "sessions",
    [
      ["tenant_id", tenantId],
      ["group_id", group.id],
      ["notes", "phase16:primary-session"]
    ],
    {
      tenant_id: tenantId,
      group_id: group.id,
      resource_id: lane.id,
      starts_at: sessionWindow.startsAt,
      ends_at: sessionWindow.endsAt,
      status: "scheduled",
      capacity_override: 8,
      notes: "phase16:primary-session"
    },
    "id, group_id, resource_id, starts_at, ends_at, status, notes"
  );

  await upsertOne(
    "session_instructor_assignments",
    {
      tenant_id: tenantId,
      session_id: session.id,
      instructor_user_id: users.instructor.id,
      role: "primary",
      status: "active"
    },
    "session_id,instructor_user_id,role",
    "id"
  );

  const form = await ensureByFilter(
    "intake_forms",
    [
      ["tenant_id", tenantId],
      ["program_id", program.id],
      ["name", "Phase 16 intake"]
    ],
    {
      tenant_id: tenantId,
      program_id: program.id,
      name: "Phase 16 intake",
      intro: "Demo intake voor product-owner review.",
      status: "active",
      allowed_options: ["enrollment", "trial", "waitlist", "information_request"]
    },
    "id"
  );

  await upsertOne(
    "intake_questions",
    {
      tenant_id: tenantId,
      form_id: form.id,
      field_key: "swim_experience",
      label: "Heeft je kind al zwemervaring?",
      help_text: "Korte context voor de instructeur.",
      field_type: "textarea",
      required: true,
      options: [],
      applies_to_options: ["enrollment", "trial", "waitlist"],
      sort_order: 1
    },
    "tenant_id,form_id,field_key",
    "id"
  );

  return {
    participantName,
    program,
    stage,
    location,
    lane,
    group,
    session,
    form
  };
}

async function ensureIntakeToPlacementFlow(tenantId, users, core) {
  const acceptedSubmission = await ensureByFilter(
    "intake_submissions",
    [
      ["tenant_id", tenantId],
      ["message", "phase16:accepted-intake"]
    ],
    {
      tenant_id: tenantId,
      form_id: core.form.id,
      program_id: core.program.id,
      selected_option: "enrollment",
      parent_name: roleAccounts.parent.fullName,
      parent_email: normalizeEmail(roleAccounts.parent.email),
      parent_phone: "+31 6 1616 1616",
      participant_name: core.participantName,
      participant_birth_date: "2018-04-16",
      preferred_days: ["maandag"],
      preferred_notes: "Graag maandagmiddag.",
      message: "phase16:accepted-intake",
      consent_given: true,
      source_hostname: tenantHostname,
      status: "reviewing"
    },
    "id, parent_name, parent_email, participant_name, participant_birth_date, selected_option"
  );

  await ensureByFilter(
    "intake_answers",
    [
      ["tenant_id", tenantId],
      ["submission_id", acceptedSubmission.id],
      ["field_key", "swim_experience"]
    ],
    {
      tenant_id: tenantId,
      submission_id: acceptedSubmission.id,
      field_key: "swim_experience",
      answer_text: "Kan al drijven en wil graag naar badje 1."
    },
    "id"
  );

  await ensureByFilter(
    "tenant_events",
    [
      ["tenant_id", tenantId],
      ["subject_id", acceptedSubmission.id],
      ["event_type", "intake.received"]
    ],
    {
      tenant_id: tenantId,
      event_type: "intake.received",
      subject_type: "intake_submission",
      subject_id: acceptedSubmission.id,
      payload: {
        selectedOption: "enrollment",
        parentEmail: normalizeEmail(roleAccounts.parent.email),
        participantName: core.participantName,
        programId: core.program.id
      },
      status: "processed"
    },
    "id"
  );

  const acceptedEntry = await upsertOne(
    "waitlist_entries",
    {
      tenant_id: tenantId,
      intake_submission_id: acceptedSubmission.id,
      program_id: core.program.id,
      recommended_stage_id: core.stage.id,
      parent_name: roleAccounts.parent.fullName,
      parent_email: normalizeEmail(roleAccounts.parent.email),
      parent_phone: "+31 6 1616 1616",
      participant_name: core.participantName,
      participant_birth_date: "2018-04-16",
      selected_option: "enrollment",
      status: "offered",
      source: "intake",
      admin_notes: "phase16 accepted placement"
    },
    "tenant_id,intake_submission_id",
    "id, parent_name, parent_email, participant_name, participant_birth_date, program_id, recommended_stage_id, selected_option, status"
  );

  await resetWaitlistPreferences(tenantId, acceptedEntry.id);
  await insertOne("waitlist_preferences", {
    tenant_id: tenantId,
    waitlist_entry_id: acceptedEntry.id,
    weekday: 1,
    starts_after: "15:30",
    ends_before: "17:30",
    preference_weight: 5,
    notes: "Phase 16 maandagmatch"
  });

  await ensureByFilter(
    "placement_recommendations",
    [
      ["tenant_id", tenantId],
      ["waitlist_entry_id", acceptedEntry.id],
      ["recommended_stage_id", core.stage.id]
    ],
    {
      tenant_id: tenantId,
      waitlist_entry_id: acceptedEntry.id,
      recommended_stage_id: core.stage.id,
      score: 92,
      reasons: ["stage match", "voorkeursdag match", "capaciteit beschikbaar"],
      status: "accepted",
      created_by_user_id: users.tenantAdmin.id
    },
    "id"
  );

  await upsertOne(
    "placement_scores",
    {
      tenant_id: tenantId,
      waitlist_entry_id: acceptedEntry.id,
      group_id: core.group.id,
      score: 96,
      capacity_available: 7,
      stage_match: true,
      preferred_day_match: true,
      reasons: ["Badje 1", "maandag", "voldoende capaciteit"]
    },
    "tenant_id,waitlist_entry_id,group_id",
    "id"
  );

  const acceptedOfferToken = makeStableToken("accepted-slot-offer");
  const acceptedOffer = await upsertOne(
    "slot_offers",
    {
      tenant_id: tenantId,
      waitlist_entry_id: acceptedEntry.id,
      group_id: core.group.id,
      session_id: core.session.id,
      token_hash: hashOfferToken(acceptedOfferToken),
      parent_email: normalizeEmail(roleAccounts.parent.email),
      status: "sent",
      delivery_status: "sent",
      delivery_error: null,
      offered_at: new Date().toISOString(),
      expires_at: futureDateIso(7),
      created_by_user_id: users.tenantAdmin.id
    },
    "token_hash",
    "id, waitlist_entry_id, group_id, status"
  );

  const participant = await upsertOne(
    "participants",
    {
      tenant_id: tenantId,
      guardian_user_id: users.parent.id,
      display_name: core.participantName,
      birth_date: "2018-04-16",
      external_reference: "phase16-child",
      status: "active"
    },
    "tenant_id,external_reference",
    "id, guardian_user_id, display_name, birth_date, status"
  );

  const enrollment = await ensureByFilter(
    "enrollments",
    [
      ["tenant_id", tenantId],
      ["participant_id", participant.id],
      ["program_id", core.program.id],
      ["source", "intake"]
    ],
    {
      tenant_id: tenantId,
      participant_id: participant.id,
      guardian_user_id: users.parent.id,
      program_id: core.program.id,
      current_stage_id: core.stage.id,
      status: "active",
      source: "intake",
      starts_on: today
    },
    "id, participant_id, guardian_user_id, program_id, current_stage_id, status"
  );

  const groupMembership = await upsertOne(
    "group_memberships",
    {
      tenant_id: tenantId,
      group_id: core.group.id,
      enrollment_id: enrollment.id,
      participant_id: participant.id,
      status: "active",
      starts_on: today,
      capacity_weight: 1
    },
    "group_id,enrollment_id,status",
    "id, group_id, enrollment_id, participant_id, status"
  );

  await upsertOne(
    "participant_guardians",
    {
      tenant_id: tenantId,
      participant_id: participant.id,
      guardian_user_id: users.parent.id,
      relationship: "parent",
      access_level: "primary",
      status: "active"
    },
    "tenant_id,participant_id,guardian_user_id",
    "id"
  );

  await updateById("slot_offers", tenantId, acceptedOffer.id, {
    status: "accepted",
    responded_at: new Date().toISOString(),
    accepted_participant_id: participant.id,
    accepted_enrollment_id: enrollment.id,
    accepted_group_membership_id: groupMembership.id
  });
  await updateById("waitlist_entries", tenantId, acceptedEntry.id, { status: "placed" });
  await updateById("intake_submissions", tenantId, acceptedSubmission.id, { status: "converted", reviewed_at: new Date().toISOString() });
  await ensureAudit(tenantId, acceptedEntry.id, acceptedOffer.id, users.tenantAdmin.id, "slot_offer.accepted", "Phase 16 aanbod geaccepteerd.", {
    participantId: participant.id,
    enrollmentId: enrollment.id,
    groupMembershipId: groupMembership.id
  });

  const declined = await ensureDeclinedOffer(tenantId, users, core);

  return {
    acceptedSubmission,
    acceptedEntry: { ...acceptedEntry, status: "placed" },
    acceptedOffer: { ...acceptedOffer, status: "accepted" },
    acceptedOfferToken,
    participant,
    enrollment,
    groupMembership,
    ...declined
  };
}

async function ensureDeclinedOffer(tenantId, users, core) {
  const declinedName = "Milan Phase16";
  const submission = await ensureByFilter(
    "intake_submissions",
    [
      ["tenant_id", tenantId],
      ["message", "phase16:declined-intake"]
    ],
    {
      tenant_id: tenantId,
      form_id: core.form.id,
      program_id: core.program.id,
      selected_option: "trial",
      parent_name: roleAccounts.parent.fullName,
      parent_email: normalizeEmail(roleAccounts.parent.email),
      parent_phone: "+31 6 1616 1616",
      participant_name: declinedName,
      participant_birth_date: "2019-08-11",
      preferred_days: ["maandag"],
      preferred_notes: "Decline path voor Phase 16.",
      message: "phase16:declined-intake",
      consent_given: true,
      source_hostname: tenantHostname,
      status: "reviewing"
    },
    "id, participant_name"
  );
  const entry = await upsertOne(
    "waitlist_entries",
    {
      tenant_id: tenantId,
      intake_submission_id: submission.id,
      program_id: core.program.id,
      recommended_stage_id: core.stage.id,
      parent_name: roleAccounts.parent.fullName,
      parent_email: normalizeEmail(roleAccounts.parent.email),
      parent_phone: "+31 6 1616 1616",
      participant_name: declinedName,
      participant_birth_date: "2019-08-11",
      selected_option: "trial",
      status: "offered",
      source: "intake",
      admin_notes: "phase16 declined placement"
    },
    "tenant_id,intake_submission_id",
    "id, participant_name, status"
  );
  const declinedOfferToken = makeStableToken("declined-slot-offer");
  const offer = await upsertOne(
    "slot_offers",
    {
      tenant_id: tenantId,
      waitlist_entry_id: entry.id,
      group_id: core.group.id,
      session_id: core.session.id,
      token_hash: hashOfferToken(declinedOfferToken),
      parent_email: normalizeEmail(roleAccounts.parent.email),
      status: "declined",
      delivery_status: "sent",
      delivery_error: null,
      offered_at: new Date().toISOString(),
      expires_at: futureDateIso(7),
      responded_at: new Date().toISOString(),
      created_by_user_id: users.tenantAdmin.id
    },
    "token_hash",
    "id, waitlist_entry_id, group_id, status"
  );

  await updateById("waitlist_entries", tenantId, entry.id, { status: "declined" });
  await ensureAudit(tenantId, entry.id, offer.id, users.tenantAdmin.id, "slot_offer.declined", "Phase 16 aanbod geweigerd.", {});

  return {
    declinedSubmission: submission,
    declinedEntry: { ...entry, participant_name: declinedName, status: "declined" },
    declinedOffer: { ...offer, status: "declined" },
    declinedOfferToken
  };
}

async function ensureLearningFlow(tenantId, users, core, intake) {
  const attendance = await upsertOne(
    "session_attendance",
    {
      tenant_id: tenantId,
      session_id: core.session.id,
      participant_id: intake.participant.id,
      enrollment_id: intake.enrollment.id,
      status: "present",
      marked_by_user_id: users.instructor.id,
      marked_at: new Date().toISOString(),
      note: "Phase 16 aanwezig en actief meegedaan."
    },
    "tenant_id,session_id,participant_id",
    "id, status, note"
  );

  const module = await upsertOne(
    "progress_modules",
    {
      tenant_id: tenantId,
      program_id: core.program.id,
      stage_id: core.stage.id,
      code: "PHASE16-WATERWENNEN",
      name: "Waterwennen",
      description: "Phase 16 voortgangsmodule.",
      template_key: "phase16-operational-flow",
      status: "active",
      sort_order: 16
    },
    "tenant_id,code",
    "id, name, code"
  );
  const item = await upsertOne(
    "progress_items",
    {
      tenant_id: tenantId,
      module_id: module.id,
      code: "PHASE16-DRIJVEN",
      name: "Zelfstandig drijven",
      description: "Kan rustig op de rug drijven.",
      positive_goal: "Rustig en zelfverzekerd drijven",
      status: "active",
      sort_order: 1
    },
    "tenant_id,module_id,code",
    "id, name, code"
  );
  const progressScore = await upsertOne(
    "participant_progress_scores",
    {
      tenant_id: tenantId,
      participant_id: intake.participant.id,
      enrollment_id: intake.enrollment.id,
      module_id: module.id,
      item_id: item.id,
      session_id: core.session.id,
      score: 5,
      scale_version: "five_point_v1",
      source_scale_version: "five_point_v1",
      source_value: null,
      positive_label: phase16ProgressLabel,
      note: "Sofie blijft rustig en drijft zelfstandig.",
      visibility: "parent_visible",
      status: "active",
      scored_by_user_id: users.instructor.id,
      scored_at: new Date().toISOString()
    },
    "tenant_id,participant_id,item_id",
    "id, positive_label, note"
  );
  const curriculum = await ensureVersionedCurriculum(tenantId, users, core, intake, item);

  const note = await ensureByFilter(
    "progress_notes",
    [
      ["tenant_id", tenantId],
      ["participant_id", intake.participant.id],
      ["note", "Phase 16 ouderzichtbare notitie: mooie waterhouding."]
    ],
    {
      tenant_id: tenantId,
      participant_id: intake.participant.id,
      enrollment_id: intake.enrollment.id,
      session_id: core.session.id,
      instructor_user_id: users.instructor.id,
      visibility: "parent_visible",
      note: "Phase 16 ouderzichtbare notitie: mooie waterhouding.",
      status: "active"
    },
    "id, note"
  );

  const badgeDefinition = await upsertOne(
    "badge_definitions",
    {
      tenant_id: tenantId,
      program_id: core.program.id,
      stage_id: core.stage.id,
      code: "PHASE16-WATERHELD",
      name: "Waterheld",
      description: "Mooie stap in watervertrouwen.",
      icon_name: "waves",
      status: "active",
      sort_order: 16
    },
    "tenant_id,code",
    "id, name"
  );
  const badgeAward = await ensureByFilter(
    "participant_badge_awards",
    [
      ["tenant_id", tenantId],
      ["participant_id", intake.participant.id],
      ["title", "Waterheld"]
    ],
    {
      tenant_id: tenantId,
      participant_id: intake.participant.id,
      enrollment_id: intake.enrollment.id,
      badge_definition_id: badgeDefinition.id,
      awarded_by_user_id: users.instructor.id,
      source_session_id: core.session.id,
      title: "Waterheld",
      note: "Voor rustig drijven en zichtbaar vertrouwen.",
      visibility: "parent_visible",
      status: "awarded"
    },
    "id, title, note"
  );

  await ensureNotification(tenantId, users.parent.id, intake.participant.id, "progress_score", "Nieuwe voortgang", `${core.participantName}: Zelfstandig drijven: ${phase16ProgressLabel}`, {
    related_progress_score_id: progressScore.id
  });
  await ensureNotification(tenantId, users.parent.id, intake.participant.id, "badge_award", "Nieuwe badge", `${core.participantName}: Waterheld`, {
    related_badge_award_id: badgeAward.id
  });

  return { attendance, module, item, progressScore, curriculum, note, badgeDefinition, badgeAward };
}

async function ensureVersionedCurriculum(tenantId, users, core, intake, legacyItem) {
  let version = await findFirst(
    "curriculum_versions",
    [
      ["tenant_id", tenantId],
      ["program_id", core.program.id],
      ["version_number", 16]
    ],
    "id, status, revision"
  );

  if (!version) {
    version = await insertOne(
      "curriculum_versions",
      {
        tenant_id: tenantId,
        program_id: core.program.id,
        version_number: 16,
        name: "Phase 16 Zwemdiploma A",
        status: "draft",
        formula_version: "swim_progress_v3",
        weighting_enabled: false,
        wizard_step: "review",
        wizard_state_json: {
          source: "phase16_operational_flow",
          validation_example: "one_of_six_at_five_is_16_7_percent"
        },
        revision: 1,
        created_by_user_id: users.tenantAdmin.id
      },
      "id, status, revision"
    );
  }

  if (version.status === "draft") {
    const curriculumStage = await upsertOne(
      "curriculum_stages",
      {
        tenant_id: tenantId,
        curriculum_version_id: version.id,
        legacy_stage_id: core.stage.id,
        stable_key: "phase16_badje_1",
        name: "Badje 1",
        description: "Watervertrouwen en de eerste veilige basisvaardigheden.",
        color_hex: "#0EA5E9",
        sort_order: 1
      },
      "tenant_id,curriculum_version_id,stable_key",
      "id, stable_key, name"
    );
    const competency = await upsertOne(
      "curriculum_competencies",
      {
        tenant_id: tenantId,
        curriculum_version_id: version.id,
        stable_key: "watervertrouwen",
        name: "Watervertrouwen",
        description: "Beweegt rustig, veilig en zelfstandig in het water.",
        sort_order: 1
      },
      "tenant_id,curriculum_version_id,stable_key",
      "id"
    );
    const itemDefinitions = [
      {
        stableKey: "zelfstandig_drijven",
        name: "Zelfstandig drijven",
        description: "Kan rustig op de rug drijven.",
        legacyProgressItemId: legacyItem.id
      },
      {
        stableKey: "bellen_blazen",
        name: "Bellen blazen",
        description: "Blaast ontspannen en gecontroleerd uit onder water."
      },
      {
        stableKey: "veilig_springen",
        name: "Veilig in het water springen",
        description: "Springt gecontroleerd en komt zelfstandig boven."
      },
      {
        stableKey: "drijven_op_de_buik",
        name: "Drijven op de buik",
        description: "Blijft gestrekt en rustig op de buik drijven."
      },
      {
        stableKey: "eerste_beenbeweging",
        name: "Eerste beenbeweging",
        description: "Maakt een rustige, herhaalbare beenbeweging."
      },
      {
        stableKey: "veilig_uitstappen",
        name: "Veilig uit het water",
        description: "Verlaat het water zelfstandig via de afgesproken route."
      }
    ];

    for (const [index, definition] of itemDefinitions.entries()) {
      const identity = await upsertOne(
        "curriculum_item_identities",
        {
          tenant_id: tenantId,
          program_id: core.program.id,
          stable_key: `phase16_${definition.stableKey}`
        },
        "tenant_id,program_id,stable_key",
        "id"
      );
      const curriculumItem = await upsertOne(
        "curriculum_items",
        {
          tenant_id: tenantId,
          curriculum_version_id: version.id,
          curriculum_stage_id: curriculumStage.id,
          identity_id: identity.id,
          legacy_progress_item_id: definition.legacyProgressItemId ?? null,
          name: definition.name,
          description: definition.description,
          context_json: {
            environment: "pool",
            fixture: "phase16_operational_flow"
          },
          weight: 1,
          mastery_threshold: 4,
          contributes_to_stage: true,
          contributes_to_diploma: true,
          required_for_transition: true,
          required_for_graduation: true,
          sort_order: index + 1
        },
        "tenant_id,curriculum_version_id,identity_id",
        "id"
      );

      await upsertOne(
        "curriculum_item_competencies",
        {
          tenant_id: tenantId,
          curriculum_version_id: version.id,
          curriculum_item_id: curriculumItem.id,
          competency_id: competency.id,
          contribution_weight: 1
        },
        "tenant_id,curriculum_item_id,competency_id",
        "curriculum_item_id"
      );
    }

    for (const requirement of [
      {
        key: "phase16_diploma_coverage",
        kind: "coverage",
        rule: { kind: "coverage", minimumFraction: 1 }
      },
      {
        key: "phase16_manual_review",
        kind: "manual_review",
        rule: { kind: "manual_review", required: true }
      }
    ]) {
      await upsertOne(
        "curriculum_graduation_requirements",
        {
          tenant_id: tenantId,
          curriculum_version_id: version.id,
          requirement_key: requirement.key,
          requirement_kind: requirement.kind,
          target_id: null,
          threshold: null,
          rule_json: requirement.rule,
          sort_order: requirement.kind === "coverage" ? 1 : 2
        },
        "tenant_id,curriculum_version_id,requirement_key",
        "id"
      );
    }

    const publication = await admin.rpc("publish_curriculum_version", {
      target_version_id: version.id,
      expected_revision: version.revision,
      actor_user_id: users.tenantAdmin.id,
      target_idempotency_key: `phase16:curriculum:publish:${version.id}`
    });

    checked(publication, "publish curriculum_versions");
    version = { ...version, status: "published" };
  }

  if (version.status !== "published") {
    throw new Error(`[phase16] Versioned curriculum ${version.id} is not published.`);
  }

  const curriculumStage = await findFirst(
    "curriculum_stages",
    [
      ["tenant_id", tenantId],
      ["curriculum_version_id", version.id],
      ["stable_key", "phase16_badje_1"]
    ],
    "id, stable_key, name"
  );
  const curriculumItemsResult = await admin
    .from("curriculum_items")
    .select("id, legacy_progress_item_id, sort_order")
    .eq("tenant_id", tenantId)
    .eq("curriculum_version_id", version.id)
    .order("sort_order");

  if (curriculumItemsResult.error || curriculumItemsResult.data?.length !== 6 || !curriculumStage) {
    throw new Error(
      `[phase16] Versioned curriculum is incomplete: ${curriculumItemsResult.error?.message ?? "expected one stage and six items"}.`
    );
  }

  await updateById("enrollments", tenantId, intake.enrollment.id, {
    curriculum_version_id: version.id
  });
  await ensureByFilter(
    "enrollment_stage_assignments",
    [
      ["tenant_id", tenantId],
      ["enrollment_id", intake.enrollment.id]
    ],
    {
      tenant_id: tenantId,
      enrollment_id: intake.enrollment.id,
      participant_id: intake.participant.id,
      curriculum_version_id: version.id,
      curriculum_stage_id: curriculumStage.id,
      status: "active",
      starts_at: new Date().toISOString(),
      ends_at: null,
      assigned_by_user_id: users.tenantAdmin.id
    },
    "id"
  );

  const assessedItem = curriculumItemsResult.data.find((item) => item.legacy_progress_item_id === legacyItem.id);
  if (!assessedItem) {
    throw new Error("[phase16] Versioned assessment item is missing its legacy compatibility link.");
  }

  const instructor = await roleClient(roleAccounts.instructor.email, roleAccounts.instructor.password);
  const assessment = await instructor.rpc("finalize_swim_assessment", {
    target_tenant_id: tenantId,
    target_participant_id: intake.participant.id,
    target_enrollment_id: intake.enrollment.id,
    target_curriculum_item_id: assessedItem.id,
    target_rating: 5,
    target_note: "Phase 16: zelfstandig en ontspannen gedreven.",
    target_visibility: "parent_visible",
    target_context_json: {
      fixture: "phase16_operational_flow",
      scale: "five_point_v1"
    },
    target_observed_at: new Date().toISOString(),
    target_session_id: core.session.id,
    target_corrects_observation_id: null,
    target_correction_reason: null,
    target_source: "manual",
    target_client_operation_id: `phase16-assessment-${intake.enrollment.id}`,
    target_device_id: "phase16-staging",
    target_idempotency_key: `phase16:assessment:${intake.enrollment.id}:${assessedItem.id}`
  });
  const observationId = checked(assessment, "finalize swim_assessment");

  return {
    version,
    stage: curriculumStage,
    items: curriculumItemsResult.data,
    observationId
  };
}

async function ensureBillingFlow(tenantId, users, core, intake) {
  const paymentPlan = await upsertOne(
    "payment_plans",
    {
      tenant_id: tenantId,
      program_id: core.program.id,
      code: "PHASE16-MONTHLY",
      name: "Maandabonnement zwemles",
      description: "Phase 16 manual billing demo.",
      amount_cents: 6850,
      currency: "EUR",
      billing_interval: "monthly",
      billing_day: 1,
      payment_terms_days: 14,
      status: "active",
      sort_order: 16
    },
    "tenant_id,code",
    "id, name, amount_cents, currency, billing_interval"
  );
  const subscription = await ensureByFilter(
    "subscriptions",
    [
      ["tenant_id", tenantId],
      ["participant_id", intake.participant.id],
      ["enrollment_id", intake.enrollment.id],
      ["payment_plan_id", paymentPlan.id]
    ],
    {
      tenant_id: tenantId,
      participant_id: intake.participant.id,
      enrollment_id: intake.enrollment.id,
      guardian_user_id: users.parent.id,
      payment_plan_id: paymentPlan.id,
      status: "active",
      starts_on: today,
      next_due_on: futureDate(14),
      amount_cents: paymentPlan.amount_cents,
      currency: paymentPlan.currency,
      billing_interval: paymentPlan.billing_interval,
      notes: "phase16 subscription"
    },
    "id, payment_plan_id, status, amount_cents, currency, billing_interval"
  );
  const manualPayment = await ensureByFilter(
    "manual_payments",
    [
      ["tenant_id", tenantId],
      ["reference", "PHASE16-MVP-001"]
    ],
    {
      tenant_id: tenantId,
      subscription_id: subscription.id,
      participant_id: intake.participant.id,
      enrollment_id: intake.enrollment.id,
      guardian_user_id: users.parent.id,
      amount_cents: paymentPlan.amount_cents,
      currency: paymentPlan.currency,
      due_on: futureDate(14),
      paid_on: null,
      status: "due",
      reference: "PHASE16-MVP-001",
      method: "manual",
      notes: "Phase 16 open betaling",
      recorded_by_user_id: users.tenantAdmin.id
    },
    "id, reference, status, amount_cents, currency, due_on"
  );

  await ensureBillingEvent(tenantId, subscription.id, null, intake.participant.id, users.parent.id, "subscription_created", "Subscription aangemaakt.");
  await ensureBillingEvent(tenantId, subscription.id, manualPayment.id, intake.participant.id, users.parent.id, "payment_due", "Phase 16 betaling open.");
  await ensureNotification(tenantId, users.parent.id, intake.participant.id, "payment_due", "Betaling open", `${core.participantName}: PHASE16-MVP-001 staat open`, {});

  return { paymentPlan, subscription, manualPayment };
}

async function ensureGraduationFlow(tenantId, users, core, intake) {
  const readiness = await upsertOne(
    "graduation_readiness",
    {
      tenant_id: tenantId,
      participant_id: intake.participant.id,
      enrollment_id: intake.enrollment.id,
      program_id: core.program.id,
      stage_id: core.stage.id,
      status: "ready",
      readiness_score: 94,
      checklist_summary: "Phase 16: watervertrouwen, drijven en basisveiligheid op niveau.",
      reviewed_by_user_id: users.tenantAdmin.id,
      reviewed_at: new Date().toISOString(),
      next_review_on: futureDate(30)
    },
    "tenant_id,enrollment_id,stage_id",
    "id, status, readiness_score"
  );
  const eventWindow = futureWindow(21, 10, 0, 90);
  const event = await ensureByFilter(
    "graduation_events",
    [
      ["tenant_id", tenantId],
      ["notes", "phase16:graduation-event"]
    ],
    {
      tenant_id: tenantId,
      program_id: core.program.id,
      stage_id: core.stage.id,
      resource_id: core.lane.id,
      title: "Phase 16 Afzwemmen Badje 1",
      status: "published",
      starts_at: eventWindow.startsAt,
      ends_at: eventWindow.endsAt,
      capacity: 12,
      notes: "phase16:graduation-event",
      created_by_user_id: users.tenantAdmin.id
    },
    "id, title, status, starts_at, ends_at"
  );
  const eventParticipant = await upsertOne(
    "graduation_event_participants",
    {
      tenant_id: tenantId,
      event_id: event.id,
      participant_id: intake.participant.id,
      enrollment_id: intake.enrollment.id,
      readiness_id: readiness.id,
      invite_status: "confirmed",
      status: "passed",
      invited_at: new Date().toISOString(),
      responded_at: new Date().toISOString(),
      result: "passed",
      result_registered_by_user_id: users.tenantAdmin.id,
      result_registered_at: new Date().toISOString(),
      result_notes: "Phase 16 resultaat: geslaagd."
    },
    "tenant_id,event_id,participant_id",
    "id, status, result"
  );
  const certificate = await upsertOne(
    "certificate_records",
    {
      tenant_id: tenantId,
      participant_id: intake.participant.id,
      enrollment_id: intake.enrollment.id,
      program_id: core.program.id,
      stage_id: core.stage.id,
      event_participant_id: eventParticipant.id,
      certificate_number: "PHASE16-DIPLOMA-001",
      title: "Diploma Badje 1",
      status: "issued",
      issued_on: today,
      issued_by_user_id: users.tenantAdmin.id,
      notes: "Phase 16 diploma vault record."
    },
    "tenant_id,event_participant_id",
    "id, title, certificate_number, status"
  );

  await ensureNotification(tenantId, users.parent.id, intake.participant.id, "graduation_invite", "Afzwemuitnodiging", `${core.participantName}: Phase 16 Afzwemmen Badje 1`, {});
  await ensureNotification(tenantId, users.parent.id, intake.participant.id, "certificate_issued", "Diploma beschikbaar", `${core.participantName}: Diploma Badje 1`, {});

  return { readiness, event, eventParticipant, certificate };
}

async function validateDatabaseState(input) {
  const checks = [
    ["intake submission", input.intake.acceptedSubmission?.id],
    ["waitlist placed", input.intake.acceptedEntry.status === "placed"],
    ["accepted offer", input.intake.acceptedOffer.status === "accepted"],
    ["declined offer", input.intake.declinedOffer.status === "declined"],
    ["participant", input.intake.participant?.id],
    ["enrollment", input.intake.enrollment?.id],
    ["group membership", input.intake.groupMembership?.id],
    ["attendance", input.learning.attendance.status === "present"],
    ["progress score", input.learning.progressScore.positive_label],
    ["published curriculum", input.learning.curriculum.version.status === "published"],
    ["six curriculum items", input.learning.curriculum.items.length === 6],
    ["canonical observation", input.learning.curriculum.observationId],
    ["badge award", input.learning.badgeAward.title],
    ["subscription", input.billing.subscription.status === "active"],
    ["manual payment", input.billing.manualPayment.status === "due"],
    ["graduation readiness", input.graduation.readiness.status === "ready"],
    ["graduation result", input.graduation.eventParticipant.result === "passed"],
    ["certificate", input.graduation.certificate.status === "issued"]
  ];

  for (const [label, condition] of checks) {
    if (!condition) {
      throw new Error(`[phase16] Database validation failed for ${label}.`);
    }
  }

  console.log("[phase16] PASS Database happy-path state is complete.");
}

async function validateRoleVisibility(input) {
  const tenantAdmin = await roleClient(roleAccounts.tenantAdmin.email, roleAccounts.tenantAdmin.password);
  const instructor = await roleClient(roleAccounts.instructor.email, roleAccounts.instructor.password);
  const parent = await roleClient(roleAccounts.parent.email, roleAccounts.parent.password);

  await expectRows(
    tenantAdmin.from("waitlist_entries").select("id, participant_name, status").eq("tenant_id", input.tenant.id).eq("id", input.intake.acceptedEntry.id),
    "tenant admin waitlist"
  );
  await expectRows(
    tenantAdmin.from("manual_payments").select("id, reference, status").eq("tenant_id", input.tenant.id).eq("id", input.billing.manualPayment.id),
    "tenant admin billing"
  );
  await expectRows(
    instructor.from("session_attendance").select("id, status").eq("tenant_id", input.tenant.id).eq("participant_id", input.intake.participant.id),
    "instructor attendance"
  );
  await expectRows(
    instructor.from("participant_progress_scores").select("id, score").eq("tenant_id", input.tenant.id).eq("participant_id", input.intake.participant.id),
    "instructor progress"
  );
  await expectRows(
    instructor.from("swim_assessment_observations").select("id, rating").eq("tenant_id", input.tenant.id).eq("id", input.learning.curriculum.observationId),
    "instructor canonical assessment"
  );
  await expectRows(
    parent.from("participants").select("id, display_name").eq("tenant_id", input.tenant.id).eq("id", input.intake.participant.id),
    "parent participant"
  );
  await expectRows(
    parent.from("participant_progress_scores").select("id, positive_label").eq("tenant_id", input.tenant.id).eq("participant_id", input.intake.participant.id),
    "parent progress"
  );
  await expectRows(
    parent.from("swim_assessment_observations").select("id, rating").eq("tenant_id", input.tenant.id).eq("id", input.learning.curriculum.observationId),
    "parent canonical assessment"
  );
  await expectRows(
    parent.from("certificate_records").select("id, title").eq("tenant_id", input.tenant.id).eq("participant_id", input.intake.participant.id),
    "parent certificate"
  );
  await expectRows(
    parent.from("manual_payments").select("id, reference").eq("tenant_id", input.tenant.id).eq("participant_id", input.intake.participant.id),
    "parent payment"
  );

  console.log("[phase16] PASS Role-scoped visibility checks passed.");
}

async function ensureUser(email, password, fullName) {
  const normalizedEmail = normalizeEmail(email);
  let user = await findUserByEmail(normalizedEmail);

  if (!user) {
    const result = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName
      }
    });

    if (result.error || !result.data?.user) {
      throw new Error(`[phase16] Could not create ${normalizedEmail}: ${result.error?.message ?? "unknown error"}`);
    }

    user = result.data.user;
  } else if (process.env.PHASE16_RESET_E2E_PASSWORDS === "true") {
    const result = await admin.auth.admin.updateUserById(user.id, {
      password,
      user_metadata: {
        ...(user.user_metadata ?? {}),
        full_name: fullName
      }
    });

    if (result.error || !result.data?.user) {
      throw new Error(`[phase16] Could not update ${normalizedEmail}: ${result.error?.message ?? "unknown error"}`);
    }

    user = result.data.user;
  }

  await upsertOne(
    "profiles",
    {
      id: user.id,
      full_name: fullName,
      email: normalizedEmail
    },
    "id",
    "id"
  );
  await upsertOne(
    "user_security",
    {
      user_id: user.id,
      email: normalizedEmail,
      must_change_password: false,
      password_changed_at: new Date().toISOString()
    },
    "user_id",
    "user_id"
  );

  await assertCanSignIn(normalizedEmail, password);

  return {
    id: user.id,
    email: normalizedEmail,
    fullName
  };
}

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });

    if (error) {
      throw new Error(`[phase16] Could not list Supabase users: ${error.message}`);
    }

    const user = data.users.find((item) => normalizeEmail(item.email ?? "") === email);

    if (user) {
      return user;
    }

    if (data.users.length < 1000) {
      return null;
    }
  }

  return null;
}

async function assertCanSignIn(email, password) {
  const client = createClient(supabaseUrl, supabasePublicKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(`[phase16] Could not sign in ${email}. Set the matching E2E password or PHASE16_RESET_E2E_PASSWORDS=true. ${error.message}`);
  }
}

async function roleClient(email, password) {
  const client = createClient(supabaseUrl, supabasePublicKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  const { error } = await client.auth.signInWithPassword({ email: normalizeEmail(email), password });

  if (error) {
    throw new Error(`[phase16] Role sign-in failed for ${email}: ${error.message}`);
  }

  return client;
}

async function expectRows(query, label) {
  const { data, error } = await query;

  if (error) {
    throw new Error(`[phase16] ${label} query failed: ${error.message}`);
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`[phase16] ${label} query returned no rows.`);
  }
}

async function upsertOne(table, row, onConflict, select) {
  const result = await admin.from(table).upsert(row, { onConflict }).select(select).single();

  return checked(result, `upsert ${table}`);
}

async function insertOne(table, row, select = "id") {
  const result = await admin.from(table).insert(row).select(select).single();

  return checked(result, `insert ${table}`);
}

async function ensureByFilter(table, filters, row, select) {
  const existing = await findFirst(table, filters, "id");

  if (existing) {
    const result = await admin.from(table).update(row).eq("id", existing.id).select(select).single();

    return checked(result, `update ${table}`);
  }

  return insertOne(table, row, select);
}

async function findFirst(table, filters, select = "*") {
  let query = admin.from(table).select(select).limit(1);

  for (const [column, value] of filters) {
    query = value === null ? query.is(column, null) : query.eq(column, value);
  }

  const result = await query.maybeSingle();

  if (result.error) {
    throw new Error(`[phase16] Could not find ${table}: ${result.error.message}`);
  }

  return result.data ?? null;
}

async function updateById(table, tenantId, id, values) {
  const result = await admin.from(table).update(values).eq("tenant_id", tenantId).eq("id", id).select("id").single();

  return checked(result, `update ${table}`);
}

async function resetWaitlistPreferences(tenantId, waitlistEntryId) {
  const { error } = await admin.from("waitlist_preferences").delete().eq("tenant_id", tenantId).eq("waitlist_entry_id", waitlistEntryId);

  if (error) {
    throw new Error(`[phase16] Could not reset waitlist preferences: ${error.message}`);
  }
}

async function ensureAudit(tenantId, waitlistEntryId, slotOfferId, actorUserId, eventType, message, payload) {
  return ensureByFilter(
    "placement_audit_events",
    [
      ["tenant_id", tenantId],
      ["waitlist_entry_id", waitlistEntryId],
      ["slot_offer_id", slotOfferId],
      ["event_type", eventType]
    ],
    {
      tenant_id: tenantId,
      waitlist_entry_id: waitlistEntryId,
      slot_offer_id: slotOfferId,
      actor_user_id: actorUserId,
      event_type: eventType,
      message,
      payload
    },
    "id"
  );
}

async function ensureBillingEvent(tenantId, subscriptionId, paymentId, participantId, guardianUserId, type, message) {
  return ensureByFilter(
    "billing_events",
    [
      ["tenant_id", tenantId],
      ["subscription_id", subscriptionId],
      ["manual_payment_id", paymentId],
      ["type", type]
    ],
    {
      tenant_id: tenantId,
      subscription_id: subscriptionId,
      manual_payment_id: paymentId,
      participant_id: participantId,
      guardian_user_id: guardianUserId,
      type,
      status: "open",
      message
    },
    "id"
  );
}

async function ensureNotification(tenantId, recipientUserId, participantId, type, title, message, links) {
  return ensureByFilter(
    "tenant_notifications",
    [
      ["tenant_id", tenantId],
      ["recipient_user_id", recipientUserId],
      ["participant_id", participantId],
      ["type", type],
      ["title", title],
      ["message", message]
    ],
    {
      tenant_id: tenantId,
      recipient_user_id: recipientUserId,
      participant_id: participantId,
      type,
      title,
      message,
      status: "unread",
      related_progress_score_id: links.related_progress_score_id ?? null,
      related_badge_award_id: links.related_badge_award_id ?? null
    },
    "id"
  );
}

function checked(result, label) {
  if (result.error || !result.data) {
    throw new Error(`[phase16] ${label} failed: ${result.error?.message ?? "no data returned"}`);
  }

  return result.data;
}

function hashOfferToken(token) {
  return createHash("sha256").update(`${tokenPepper}:slot-offer:${token}`).digest("hex");
}

function makeStableToken(label) {
  return createHash("sha256").update(`${tokenPepper}:phase16:${tenantSlug}:${label}`).digest("base64url");
}

function futureDate(days) {
  const value = new Date();

  value.setDate(value.getDate() + days);

  return value.toISOString().slice(0, 10);
}

function futureDateIso(days) {
  const value = new Date();

  value.setDate(value.getDate() + days);

  return value.toISOString();
}

function futureWindow(days, hour, minute, durationMinutes = 45) {
  const starts = new Date();

  starts.setDate(starts.getDate() + days);
  starts.setHours(hour, minute, 0, 0);

  const ends = new Date(starts.getTime() + durationMinutes * 60 * 1000);

  return {
    startsAt: starts.toISOString(),
    endsAt: ends.toISOString()
  };
}

function runStep(label, command, args, env) {
  console.log(`[phase16] ${label}.`);

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  if (result.error) {
    console.error(`[phase16] FAIL ${label}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[phase16] FAIL ${label}: exit code ${result.status ?? 1}.`);
    process.exit(result.status ?? 1);
  }
}

function pickUserState(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName
  };
}

function normalizeUrl(value) {
  return value.replace(/\/+$/, "");
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function hostnameOf(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
