import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { addDays, addYears, localDateInTimeZone, localNoonIso, occurrenceForWeekday } from "./demo-time.mjs";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const appEnv = String(process.env.APP_ENV ?? "").trim().toLowerCase();
const allowSeed = String(process.env.ALLOW_SPRINT31_DEMO_SEED ?? "").trim().toLowerCase() === "true";
if (appEnv !== "staging" || !allowSeed) {
  throw new Error("Demo seed is staging-only and requires ALLOW_SPRINT31_DEMO_SEED=true.");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase URL and server secret are required.");

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const timeZone = "Europe/Amsterdam";
const today = localDateInTimeZone(new Date(), timeZone);
const demo = {
  name: "Zwemacademie De Waterlijn",
  slug: "waterlijn-demo",
  hostname: "waterlijn-demo.staging.nxttrack.nl",
  marker: "SPRINT31_DEMO"
};

const tenant = await upsertOne("tenants", { name: demo.name, sector: "swim_school", slug: demo.slug, status: "active" }, "slug");
await upsert("tenant_settings", { tenant_id: tenant.id, terminology_sector: "swim_school", locale: "nl-NL", timezone: timeZone }, "tenant_id");
await resetPrimaryDomain();
await upsert("tenant_domains", { tenant_id: tenant.id, hostname: demo.hostname, kind: "subdomain", status: "verified", is_primary: true }, "hostname");
await upsert(
  "tenant_branding",
  {
    tenant_id: tenant.id,
    product_name: "De Waterlijn",
    primary_color: "#075985",
    accent_color: "#14b8a6",
    portal_welcome: "Samen groeien van watervrij naar diploma C.",
    pwa_enabled: true,
    status: "active"
  },
  "tenant_id"
);

const programs = [
  { code: "ZWEM-ABC", name: "Zwem-ABC", description: "Persoonlijke leerlijn van waterveiligheid tot diploma C.", sort_order: 10 },
  { code: "PEUTER", name: "Peuter & ouder", description: "Vertrouwd bewegen in water, samen met een ouder.", sort_order: 20 }
];
const programByCode = new Map();
for (const program of programs) {
  const row = await upsertOne("programs", { tenant_id: tenant.id, ...program, status: "active" }, "tenant_id,code");
  programByCode.set(program.code, row);
}

const stageSpecs = [
  ["WATERVRIJ", "Watervrij", "#0ea5e9"],
  ["BASIS", "Basisvaardig", "#06b6d4"],
  ["A", "Diploma A", "#14b8a6"],
  ["B", "Diploma B", "#22c55e"],
  ["C", "Diploma C", "#84cc16"]
];
const stageByCode = new Map();
for (const [index, [code, name, color]] of stageSpecs.entries()) {
  const row = await upsertOne(
    "program_stages",
    {
      tenant_id: tenant.id,
      program_id: programByCode.get("ZWEM-ABC").id,
      code,
      name,
      badge_label: name,
      color_hex: color,
      status: "active",
      sort_order: (index + 1) * 10
    },
    "tenant_id,program_id,code"
  );
  stageByCode.set(code, row);
}
const toddlerStage = await upsertOne(
  "program_stages",
  {
    tenant_id: tenant.id,
    program_id: programByCode.get("PEUTER").id,
    code: "SAMEN",
    name: "Samen in het water",
    badge_label: "Waterpret",
    color_hex: "#38bdf8",
    status: "active",
    sort_order: 10
  },
  "tenant_id,program_id,code"
);

const location = await upsertOne(
  "resources",
  { tenant_id: tenant.id, code: "WATERLIJN", kind: "location", name: "Sportcentrum De Waterlijn", status: "active", sort_order: 10 },
  "tenant_id,code"
);
const instructionPool = await upsertOne(
  "resources",
  { tenant_id: tenant.id, parent_resource_id: location.id, code: "INSTRUCTIE", kind: "pool", name: "Instructiebad", capacity: 24, status: "active", sort_order: 10 },
  "tenant_id,code"
);
const competitionPool = await upsertOne(
  "resources",
  { tenant_id: tenant.id, parent_resource_id: location.id, code: "WEDSTRIJD", kind: "pool", name: "Wedstrijdbad", capacity: 48, status: "active", sort_order: 20 },
  "tenant_id,code"
);

const groupSpecs = [
  ["WV-MA-1600", "Watervrij · maandag 16:00", "ZWEM-ABC", "WATERVRIJ", instructionPool.id, 1, "16:00", "16:45", 9],
  ["BA-MA-1700", "Basisvaardig · maandag 17:00", "ZWEM-ABC", "BASIS", instructionPool.id, 1, "17:00", "17:45", 10],
  ["WV-DI-1615", "Watervrij · dinsdag 16:15", "ZWEM-ABC", "WATERVRIJ", instructionPool.id, 2, "16:15", "17:00", 9],
  ["A-WO-1530", "Diploma A · woensdag 15:30", "ZWEM-ABC", "A", competitionPool.id, 3, "15:30", "16:15", 11],
  ["A-WO-1630", "Diploma A · woensdag 16:30", "ZWEM-ABC", "A", competitionPool.id, 3, "16:30", "17:15", 11],
  ["BA-DO-1700", "Basisvaardig · donderdag 17:00", "ZWEM-ABC", "BASIS", instructionPool.id, 4, "17:00", "17:45", 10],
  ["B-VR-1600", "Diploma B · vrijdag 16:00", "ZWEM-ABC", "B", competitionPool.id, 5, "16:00", "16:45", 12],
  ["C-ZA-0900", "Diploma C · zaterdag 09:00", "ZWEM-ABC", "C", competitionPool.id, 6, "09:00", "09:45", 12],
  ["PO-ZA-1000", "Peuter & ouder · zaterdag 10:00", "PEUTER", "SAMEN", instructionPool.id, 6, "10:00", "10:40", 8]
];
const groupByCode = new Map();
for (const [code, name, programCode, stageCode, resourceId, weekday, start, end, capacity] of groupSpecs) {
  const row = await upsertOne(
    "groups",
    {
      tenant_id: tenant.id,
      code,
      name,
      program_id: programByCode.get(programCode).id,
      stage_id: stageCode === "SAMEN" ? toddlerStage.id : stageByCode.get(stageCode).id,
      default_resource_id: resourceId,
      status: "active",
      capacity,
      default_weekday: weekday,
      default_start_time: start,
      default_end_time: end,
      starts_on: addDays(today, -180)
    },
    "tenant_id,code"
  );
  groupByCode.set(code, row);
}

const staffSpecs = [
  ["sanne.devries@demo.nxttrack.test", "Sanne de Vries"],
  ["omar.elidrissi@demo.nxttrack.test", "Omar El Idrissi"],
  ["lieke.vandenberg@demo.nxttrack.test", "Lieke van den Berg"],
  ["thomas.meijer@demo.nxttrack.test", "Thomas Meijer"]
];
const staff = [];
for (const [email, fullName] of staffSpecs) {
  staff.push(await ensureSyntheticInstructor(email, fullName));
}

const demoGroupIds = [...groupByCode.values()].map((group) => group.id);
const staffIds = staff.map((member) => member.id);
await deleteWhere("group_instructor_assignments", (query) => query.eq("tenant_id", tenant.id).in("group_id", demoGroupIds).in("instructor_user_id", staffIds), "refresh demo group instructors");
for (const [index, group] of [...groupByCode.values()].entries()) {
  const primary = staff[index % staff.length];
  await insert(
    "group_instructor_assignments",
    {
      tenant_id: tenant.id,
      group_id: group.id,
      instructor_user_id: primary.id,
      role: "primary",
      status: "active",
      starts_on: addDays(today, -180)
    }
  );
  if (index % 3 === 0) {
    const support = staff[(index + 1) % staff.length];
    await insert(
      "group_instructor_assignments",
      {
        tenant_id: tenant.id,
        group_id: group.id,
        instructor_user_id: support.id,
        role: "support",
        status: "active",
        starts_on: addDays(today, -180)
      }
    );
  }
}

const participantNames = [
  "Mila de Jong", "Yassin El Amrani", "Sophie van Dijk", "Liam Jansen", "Nora Bakker", "Adam Aydin",
  "Emma Smit", "Noah Visser", "Lina Özdemir", "Sem Meijer", "Sara Vos", "Finn de Boer",
  "Aya Benali", "Lucas Mulder", "Fenna Kuiper", "Rayan Haddad", "Julia Bos", "Mats Hendriks",
  "Lotte Verhoeven", "Omar Rahmani", "Tess Scholten", "Daan Peters", "Inaya Bouma", "Mees Hoekstra",
  "Elin van Leeuwen", "Sami Kaya", "Isa Dekker", "Bram Kok", "Yara Willems", "Noud Smeets",
  "Amal Idrissi", "Jesse de Wit", "Liva Dijkstra", "Milan Vermeer", "Zeynep Demir", "Teun Blom",
  "Hannah Kramer", "Ilyas Aksoy", "Roos van Loon", "Dex van der Meer", "Nina Groen", "Mohammed Farah",
  "Liv Jacobs", "Boaz Timmer", "Sofia Castillo", "Thijs van Beek", "Maryam Ahmadi", "Guusje de Graaf"
];
const lessonGroups = [...groupByCode.values()].filter((group) => !group.code.startsWith("PO-"));
const participantRecords = [];
for (const [index, displayName] of participantNames.entries()) {
  const participant = await upsertOne(
    "participants",
    {
      tenant_id: tenant.id,
      display_name: displayName,
      birth_date: demoBirthDate(index),
      external_reference: `WL-${String(index + 1).padStart(4, "0")}`,
      status: "active"
    },
    "tenant_id,external_reference"
  );
  const group = lessonGroups[index % lessonGroups.length];
  const enrollment = await ensureEnrollment(participant, group);
  await reconcileMembership(participant, enrollment, group);
  participantRecords.push({ participant, enrollment, group });
}

const sessionRecords = [];
for (const [groupIndex, group] of [...groupByCode.values()].entries()) {
  for (const weekOffset of [-3, -2, -1, 0, 1, 2, 3, 4]) {
    const startsAt = occurrenceForWeekday(today, group.default_weekday, group.default_start_time, weekOffset, timeZone);
    const endsAt = occurrenceForWeekday(today, group.default_weekday, group.default_end_time, weekOffset, timeZone);
    const status = startsAt.getTime() < Date.now() ? "completed" : "scheduled";
    const session = await ensureSession(group, startsAt, endsAt, status);
    sessionRecords.push(session);

    const instructor = staff[groupIndex % staff.length];
    await upsert(
      "session_instructor_assignments",
      { tenant_id: tenant.id, session_id: session.id, instructor_user_id: instructor.id, role: "primary", status: "active" },
      "session_id,instructor_user_id,role"
    );

    if (status === "completed") {
      await seedAttendance(session, group);
    }
  }
}
await removeObsoleteDemoSessions(sessionRecords.map((session) => session.id));

await seedProgressTimeline(participantRecords, staff);

const abcPlan = await upsertOne(
  "payment_plans",
  {
    tenant_id: tenant.id,
    program_id: programByCode.get("ZWEM-ABC").id,
    code: "ABC-MAAND",
    name: "Zwem-ABC maandabonnement",
    description: "Inclusief voortgangsrapportage en diploma-events.",
    amount_cents: 5950,
    currency: "EUR",
    billing_interval: "monthly",
    billing_day: 1,
    payment_terms_days: 14,
    status: "active",
    sort_order: 10
  },
  "tenant_id,code"
);
await upsert(
  "payment_plans",
  {
    tenant_id: tenant.id,
    program_id: programByCode.get("PEUTER").id,
    code: "PEUTER-10",
    name: "Peuterkaart · 10 lessen",
    description: "Tien begeleide ouder-kindlessen, twaalf maanden geldig.",
    amount_cents: 13900,
    currency: "EUR",
    billing_interval: "one_time",
    payment_terms_days: 14,
    status: "active",
    sort_order: 20
  },
  "tenant_id,code"
);
await seedBilling(participantRecords.slice(0, 20), abcPlan);
await seedWaitlist();
await seedOperationalPulse(staff, participantRecords);

console.log(
  JSON.stringify(
    {
      tenantId: tenant.id,
      slug: demo.slug,
      hostname: demo.hostname,
      programs: programs.length,
      groups: groupSpecs.length,
      instructors: staff.length,
      participants: participantNames.length,
      sessions: sessionRecords.length,
      subscriptions: 20,
      waitlist: 8,
      restoredForLocalDate: today
    },
    null,
    2
  )
);

async function resetPrimaryDomain() {
  const { error } = await admin.from("tenant_domains").update({ is_primary: false }).eq("tenant_id", tenant.id).neq("hostname", demo.hostname);
  assertNoError(error, "reset Waterlijn primary domains");
}

async function ensureSyntheticInstructor(email, fullName) {
  if (!email.endsWith(".test")) throw new Error(`Synthetic demo instructor email must use .test: ${email}`);
  let user = await findAuthUser(email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: randomBytes(32).toString("base64url"),
      email_confirm: true,
      user_metadata: { full_name: fullName, synthetic_demo_identity: true, demo_tenant: demo.slug }
    });
    assertNoError(error, `create synthetic instructor ${email}`);
    user = data.user;
  }
  if (!user) throw new Error(`Synthetic instructor ${email} was not returned.`);

  await upsert("profiles", { id: user.id, full_name: fullName, email }, "id");
  await upsert(
    "user_security",
    { user_id: user.id, email, must_change_password: false, password_changed_at: new Date().toISOString() },
    "user_id"
  );
  await upsert(
    "tenant_memberships",
    { tenant_id: tenant.id, user_id: user.id, role: "instructor", status: "active", invited_email: email },
    "tenant_id,user_id,role"
  );
  return { id: user.id, email, fullName };
}

async function findAuthUser(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    assertNoError(error, "list Auth users for demo instructors");
    const match = data.users.find((user) => String(user.email ?? "").toLowerCase() === email.toLowerCase());
    if (match || data.users.length < 1000) return match ?? null;
  }
  return null;
}

async function ensureEnrollment(participant, group) {
  const existing = await maybeOne("enrollments", {
    tenant_id: tenant.id,
    participant_id: participant.id,
    program_id: group.program_id,
    status: "active"
  });
  if (existing) {
    return updateOne("enrollments", existing.id, {
      current_stage_id: group.stage_id,
      starts_on: addDays(today, -120),
      ends_on: null,
      source: "manual"
    });
  }
  return insertOne("enrollments", {
    tenant_id: tenant.id,
    participant_id: participant.id,
    program_id: group.program_id,
    current_stage_id: group.stage_id,
    status: "active",
    source: "manual",
    starts_on: addDays(today, -120)
  });
}

async function reconcileMembership(participant, enrollment, group) {
  const { error: deleteError } = await admin
    .from("group_memberships")
    .delete()
    .eq("tenant_id", tenant.id)
    .eq("participant_id", participant.id)
    .in("group_id", demoGroupIds)
    .neq("group_id", group.id);
  assertNoError(deleteError, "reconcile demo group memberships");

  const membership = await maybeOne("group_memberships", {
    tenant_id: tenant.id,
    group_id: group.id,
    participant_id: participant.id,
    status: "active"
  });
  if (membership) {
    await updateOne("group_memberships", membership.id, { enrollment_id: enrollment.id, ends_on: null, starts_on: addDays(today, -120), capacity_weight: 1 });
    return;
  }
  await insert("group_memberships", {
    tenant_id: tenant.id,
    group_id: group.id,
    enrollment_id: enrollment.id,
    participant_id: participant.id,
    status: "active",
    starts_on: addDays(today, -120),
    capacity_weight: 1
  });
}

async function ensureSession(group, startsAt, endsAt, status) {
  const existing = await maybeOne("sessions", {
    tenant_id: tenant.id,
    group_id: group.id,
    starts_at: startsAt.toISOString(),
    notes: demo.marker
  });
  if (existing) {
    return updateOne("sessions", existing.id, {
      resource_id: group.default_resource_id,
      ends_at: endsAt.toISOString(),
      status,
      capacity_override: null
    });
  }
  return insertOne("sessions", {
    tenant_id: tenant.id,
    group_id: group.id,
    resource_id: group.default_resource_id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status,
    notes: demo.marker
  });
}

async function removeObsoleteDemoSessions(keptIds) {
  const { data, error } = await admin.from("sessions").select("id").eq("tenant_id", tenant.id).eq("notes", demo.marker);
  assertNoError(error, "inventory demo sessions");
  const obsolete = (data ?? []).map((row) => row.id).filter((id) => !keptIds.includes(id));
  if (!obsolete.length) return;
  const { error: deleteError } = await admin.from("sessions").delete().in("id", obsolete);
  assertNoError(deleteError, "remove obsolete demo sessions");
}

async function seedAttendance(session, group) {
  const { data, error } = await admin
    .from("group_memberships")
    .select("participant_id, enrollment_id")
    .eq("tenant_id", tenant.id)
    .eq("group_id", group.id)
    .eq("status", "active");
  assertNoError(error, "read demo group memberships");
  if (!data?.length) return;
  const rows = data.map((membership, index) => ({
    tenant_id: tenant.id,
    session_id: session.id,
    participant_id: membership.participant_id,
    enrollment_id: membership.enrollment_id,
    status: index % 13 === 0 ? "absent" : index % 9 === 0 ? "late" : "present",
    note: index % 13 === 0 ? "Afwezig gemeld door ouder." : null,
    marked_at: session.ends_at
  }));
  const { error: attendanceError } = await admin.from("session_attendance").upsert(rows, { onConflict: "tenant_id,session_id,participant_id" });
  assertNoError(attendanceError, "seed demo attendance");
}

async function seedProgressTimeline(records, instructors) {
  const module = await upsertOne(
    "progress_modules",
    {
      tenant_id: tenant.id,
      program_id: programByCode.get("ZWEM-ABC").id,
      code: "WATERLIJN-ROUTE",
      name: "Zwemroute De Waterlijn",
      description: "Positieve voortgang van watervertrouwen naar zelfstandig zwemmen.",
      template_key: "waterlijn-showcase-v1",
      status: "active",
      sort_order: 10
    },
    "tenant_id,code"
  );
  const itemSpecs = [
    ["VERTROUWEN", "Watervertrouwen", "Beweegt ontspannen en veilig in het water."],
    ["TECHNIEK", "Techniek", "Past ademhaling, armslag en beenslag steeds zelfstandiger toe."],
    ["VEILIGHEID", "Waterveiligheid", "Herkent situaties en bereikt zelfstandig de kant."]
  ];
  const items = [];
  for (const [index, [code, name, positiveGoal]] of itemSpecs.entries()) {
    items.push(
      await upsertOne(
        "progress_items",
        {
          tenant_id: tenant.id,
          module_id: module.id,
          code,
          name,
          description: positiveGoal,
          positive_goal: positiveGoal,
          status: "active",
          sort_order: (index + 1) * 10
        },
        "tenant_id,module_id,code"
      )
    );
  }
  const badgeSpecs = [
    ["WATERLIJN-VERTROUWEN", "Watervertrouwen", "Voor ontspannen en veilig bewegen in het water.", "waves"],
    ["WATERLIJN-TECHNIEK", "Techniekgroei", "Voor een zichtbare stap in zwemtechniek.", "sparkles"],
    ["WATERLIJN-DOORZETTER", "Doorzetter", "Voor positief blijven proberen en groeien.", "award"]
  ];
  const badges = [];
  for (const [index, [code, name, description, iconName]] of badgeSpecs.entries()) {
    badges.push(
      await upsertOne(
        "badge_definitions",
        {
          tenant_id: tenant.id,
          program_id: programByCode.get("ZWEM-ABC").id,
          code,
          name,
          description,
          icon_name: iconName,
          status: "active",
          sort_order: (index + 1) * 10
        },
        "tenant_id,code"
      )
    );
  }

  for (const [index, record] of records.slice(0, 24).entries()) {
    const instructor = instructors[index % instructors.length];
    const item = items[index % items.length];
    const score = 2 + (index % 4);
    const scoredAt = localNoonIso(addDays(today, -(2 + (index % 24))), timeZone);
    await upsert(
      "participant_progress_scores",
      {
        tenant_id: tenant.id,
        participant_id: record.participant.id,
        enrollment_id: record.enrollment.id,
        module_id: module.id,
        item_id: item.id,
        score,
        positive_label: ["Ik probeer het", "Ik groei erin", "Ik kan het bijna zelf", "Ik kan het zelfstandig"][score - 2],
        note: ["Blijft rustig oefenen.", "Mooie groei in controle en vertrouwen.", "Techniek wordt steeds stabieler."][index % 3],
        visibility: "parent_visible",
        status: "active",
        scored_by_user_id: instructor.id,
        scored_at: scoredAt
      },
      "tenant_id,participant_id,item_id"
    );

    if (index < 12) {
      const note = ["Met veel vertrouwen geoefend op drijven.", "Ademhaling blijft rustig tijdens de hele oefening.", "Pakt aanwijzingen snel op en probeert zelfstandig opnieuw."][index % 3];
      await ensureByFilter(
        "progress_notes",
        { tenant_id: tenant.id, participant_id: record.participant.id, note },
        {
          tenant_id: tenant.id,
          participant_id: record.participant.id,
          enrollment_id: record.enrollment.id,
          instructor_user_id: instructor.id,
          visibility: "parent_visible",
          note,
          status: "active",
          created_at: scoredAt
        }
      );
    }

    if (index < 18) {
      const badge = badges[index % badges.length];
      await ensureByFilter(
        "participant_badge_awards",
        { tenant_id: tenant.id, participant_id: record.participant.id, badge_definition_id: badge.id, title: badge.name },
        {
          tenant_id: tenant.id,
          participant_id: record.participant.id,
          enrollment_id: record.enrollment.id,
          badge_definition_id: badge.id,
          awarded_by_user_id: instructor.id,
          title: badge.name,
          note: badge.description,
          visibility: "parent_visible",
          status: "awarded",
          awarded_at: scoredAt
        }
      );
    }
  }
}

async function seedBilling(records, paymentPlan) {
  const { data: oldSubscriptions, error } = await admin
    .from("subscriptions")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("notes", demo.marker);
  assertNoError(error, "inventory demo subscriptions");
  if (oldSubscriptions?.length) {
    const { error: deleteError } = await admin.from("subscriptions").delete().in("id", oldSubscriptions.map((row) => row.id));
    assertNoError(deleteError, "refresh demo subscriptions");
  }

  for (const [index, record] of records.entries()) {
    const subscription = await insertOne("subscriptions", {
      tenant_id: tenant.id,
      participant_id: record.participant.id,
      enrollment_id: record.enrollment.id,
      payment_plan_id: paymentPlan.id,
      status: "active",
      starts_on: addDays(today, -120),
      next_due_on: addDays(today, 12),
      amount_cents: paymentPlan.amount_cents,
      currency: paymentPlan.currency,
      billing_interval: paymentPlan.billing_interval,
      collection_method: "manual",
      billing_anchor_day: 1,
      current_period_start: addDays(today, -18),
      current_period_end: addDays(today, 12),
      notes: demo.marker
    });

    const paymentStatus = index < 14 ? "paid" : index < 18 ? "due" : "overdue";
    const dueOn = paymentStatus === "overdue" ? addDays(today, -10 - index) : paymentStatus === "due" ? addDays(today, 8 + index) : addDays(today, -5 - index);
    const paidOn = paymentStatus === "paid" ? addDays(dueOn, -2) : null;
    const payment = await insertOne("manual_payments", {
      tenant_id: tenant.id,
      subscription_id: subscription.id,
      participant_id: record.participant.id,
      enrollment_id: record.enrollment.id,
      amount_cents: paymentPlan.amount_cents,
      currency: paymentPlan.currency,
      due_on: dueOn,
      paid_on: paidOn,
      status: paymentStatus,
      reference: `WL-${today.slice(0, 7).replace("-", "")}-${String(index + 1).padStart(3, "0")}`,
      method: paymentStatus === "paid" ? (index % 2 === 0 ? "iDEAL" : "Bankoverschrijving") : null,
      notes: "Maandtermijn zwemles"
    });
    await insert("billing_events", {
      tenant_id: tenant.id,
      subscription_id: subscription.id,
      manual_payment_id: payment.id,
      participant_id: record.participant.id,
      type: paymentStatus === "paid" ? "payment_paid" : paymentStatus === "overdue" ? "payment_overdue" : "payment_due",
      status: paymentStatus === "paid" ? "processed" : "open",
      occurred_at: localNoonIso(paymentStatus === "paid" ? paidOn : dueOn, timeZone),
      message: paymentStatus === "paid" ? "Maandtermijn ontvangen." : paymentStatus === "overdue" ? "Maandtermijn vraagt opvolging." : "Nieuwe maandtermijn ingepland."
    });
  }
}

async function seedWaitlist() {
  const { error: cleanupError } = await admin
    .from("waitlist_entries")
    .delete()
    .eq("tenant_id", tenant.id)
    .like("parent_email", "waterlijn-demo-%@example.test");
  assertNoError(cleanupError, "refresh demo waitlist");

  const entries = [
    ["Olivia Martens", "Sanne Martens", "WATERVRIJ", "reviewing", "Voorkeur woensdagmiddag; niveaucheck gepland."],
    ["Ibrahim Korkmaz", "Deniz Korkmaz", "WATERVRIJ", "waiting", "Maandag of dinsdag na 16:00."],
    ["Maeve Prins", "Robin Prins", "WATERVRIJ", "waiting", "Kan op korte termijn starten."],
    ["Noud van Dam", "Eva van Dam", "BASIS", "waiting", "Voorkeur voor een kleine groep."],
    ["Amira Zahra", "Nadia Zahra", "BASIS", "waiting", "Donderdag heeft de voorkeur."],
    ["Cas van Rijn", "Milan van Rijn", "BASIS", "waiting", "Eerst een niveaucheck inplannen."],
    ["Léna Dubois", "Camille Dubois", "A", "reviewing", "Overstap vanuit een andere zwemschool."],
    ["Mika de Bruin", "Joris de Bruin", "A", "waiting", "Beschikbaar op woensdag en vrijdag."]
  ];
  for (const [index, [participantName, parentName, stageCode, status, adminNotes]] of entries.entries()) {
    await insert("waitlist_entries", {
      tenant_id: tenant.id,
      program_id: programByCode.get("ZWEM-ABC").id,
      recommended_stage_id: stageByCode.get(stageCode).id,
      parent_name: parentName,
      parent_email: `waterlijn-demo-${index + 1}@example.test`,
      participant_name: participantName,
      participant_birth_date: addYears(addDays(today, -(index * 41)), -6),
      selected_option: "waitlist",
      status,
      priority_date: addDays(today, -(7 + index * 4)),
      source: "manual",
      admin_notes: adminNotes
    });
  }
}

async function seedOperationalPulse(instructors, records) {
  const messages = [
    {
      title: "Kijkweek start volgende maandag",
      body: "Ouders zijn tijdens de laatste vijftien minuten welkom om de voortgang in het bad te bekijken.",
      audience: "parents",
      visibility: "portal"
    },
    {
      title: "Teamupdate: nieuwe leskaarten",
      body: "De vernieuwde leskaarten voor waterveiligheid staan klaar voor alle instructeurs.",
      audience: "instructors",
      visibility: "internal"
    }
  ];
  for (const [index, message] of messages.entries()) {
    await ensureByFilter(
      "tenant_messages",
      { tenant_id: tenant.id, title: message.title },
      {
        tenant_id: tenant.id,
        author_user_id: instructors[index].id,
        ...message,
        status: "published",
        published_at: localNoonIso(addDays(today, -(index + 1)), timeZone)
      }
    );
  }

  const tasks = [
    ["Niveaucheck wachtlijst voorbereiden", "Bekijk de drie nieuwe niveauchecks en plan een geschikt proefmoment.", "high", "open", 1, 0],
    ["Diploma-event bevestigen", "Controleer badindeling, materialen en ouderinformatie voor het volgende afzwemmoment.", "normal", "in_progress", 4, 1],
    ["Leskaart waterveiligheid delen", "Bespreek de vernieuwde lesfocus tijdens de teamstart.", "normal", "open", 2, 2]
  ];
  for (const [title, description, priority, status, dueOffset, assigneeIndex] of tasks) {
    await ensureByFilter(
      "tenant_tasks",
      { tenant_id: tenant.id, title },
      {
        tenant_id: tenant.id,
        created_by_user_id: instructors[0].id,
        assigned_to_user_id: instructors[assigneeIndex].id,
        related_participant_id: title.startsWith("Niveaucheck") ? records[0].participant.id : null,
        title,
        description,
        priority,
        status,
        due_on: addDays(today, dueOffset),
        completed_at: null
      }
    );
  }
}

async function ensureByFilter(table, filters, value) {
  const existing = await maybeOne(table, filters);
  if (!existing) return insertOne(table, value);
  return updateOne(table, existing.id, value);
}

async function upsertOne(table, value, onConflict) {
  const { data, error } = await admin.from(table).upsert(value, { onConflict }).select("*").single();
  assertNoError(error, `upsert ${table}`);
  return data;
}

async function upsert(table, value, onConflict) {
  const { error } = await admin.from(table).upsert(value, { onConflict });
  assertNoError(error, `upsert ${table}`);
}

async function insertOne(table, value) {
  const { data, error } = await admin.from(table).insert(value).select("*").single();
  assertNoError(error, `insert ${table}`);
  return data;
}

async function insert(table, value) {
  const { error } = await admin.from(table).insert(value);
  assertNoError(error, `insert ${table}`);
}

async function updateOne(table, id, value) {
  const { data, error } = await admin.from(table).update(value).eq("id", id).select("*").single();
  assertNoError(error, `update ${table}`);
  return data;
}

async function maybeOne(table, filters) {
  let query = admin.from(table).select("*");
  for (const [column, value] of Object.entries(filters)) query = value === null ? query.is(column, null) : query.eq(column, value);
  const { data, error } = await query.maybeSingle();
  assertNoError(error, `read ${table}`);
  return data;
}

async function deleteWhere(table, queryBuilder, label) {
  const { error } = await queryBuilder(admin.from(table).delete());
  assertNoError(error, label);
}

function assertNoError(error, label) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

function demoBirthDate(index) {
  const years = 5 + (index % 5);
  return addYears(addDays(today, -(index % 210)), -years);
}
