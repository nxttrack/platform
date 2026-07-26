import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const appEnv = String(process.env.APP_ENV ?? "").trim().toLowerCase();
const allowSeed = String(process.env.ALLOW_JOURNEY_BOT_SEED ?? "").trim().toLowerCase() === "true";
if (appEnv !== "staging" || !allowSeed) {
  throw new Error("Journey Bot seed is staging-only and requires ALLOW_JOURNEY_BOT_SEED=true.");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase URL and server secret are required.");

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const tenant = await one("tenants", { slug: "waterlijn-demo" });
if (!tenant) throw new Error("Zwemacademie De Waterlijn is missing. Run the Sprint 31 demo seed first.");

const program = await one("programs", { tenant_id: tenant.id, code: "ZWEM-ABC" });
if (!program) throw new Error("De Waterlijn ZWEM-ABC program is missing.");

const stageSpecs = [
  ["INSTRUCTIE", "Instructie", "#38bdf8"],
  ["BADJE-1", "Badje 1", "#0ea5e9"],
  ["BADJE-2", "Badje 2", "#06b6d4"],
  ["BADJE-3", "Badje 3", "#14b8a6"],
  ["AFZWEM-A", "Afzwemmen A", "#22c55e"],
  ["DIPLOMA-B", "Diploma B", "#84cc16"],
  ["DIPLOMA-C", "Diploma C", "#eab308"],
  ["KLAAR", "Klaar", "#64748b"]
];
const stageByCode = new Map();
for (const [index, [code, name, colorHex]] of stageSpecs.entries()) {
  const stage = await upsertOne(
    "program_stages",
    {
      tenant_id: tenant.id,
      program_id: program.id,
      code,
      name,
      badge_label: code === "KLAAR" ? "Zwem-ABC afgerond" : `${name} afgerond`,
      description: code === "KLAAR" ? "Eindstatus na diploma C." : `Journey Bot-leerlijn voor ${name}.`,
      color_hex: colorHex,
      status: "active",
      sort_order: (index + 1) * 10
    },
    "tenant_id,program_id,code"
  );
  stageByCode.set(code, stage);
}

const oldStageCodes = ["WATERVRIJ", "BASIS", "A", "B", "C"];
const { error: archiveStageError } = await admin
  .from("program_stages")
  .update({ status: "archived" })
  .eq("tenant_id", tenant.id)
  .eq("program_id", program.id)
  .in("code", oldStageCodes);
assertNoError(archiveStageError, "archive superseded demo stages");

const location =
  (await one("resources", { tenant_id: tenant.id, code: "WATERLIJN" })) ??
  (await upsertOne(
    "resources",
    { tenant_id: tenant.id, code: "WATERLIJN", kind: "location", name: "Sportcentrum De Waterlijn", status: "active", sort_order: 10 },
    "tenant_id,code"
  ));
const poolSpecs = [
  ["JB-INSTRUCTIE", "Instructiebad", 16],
  ["JB-BADJE-1", "Badje 1 · ondiep", 12],
  ["JB-BADJE-2", "Badje 2 · techniek", 12],
  ["JB-BADJE-3", "Badje 3 · diep", 12],
  ["JB-AFZWEM", "Afzwembad", 24]
];
const resourceByCode = new Map();
for (const [index, [code, name, capacity]] of poolSpecs.entries()) {
  const resource = await upsertOne(
    "resources",
    {
      tenant_id: tenant.id,
      parent_resource_id: location.id,
      code,
      kind: "pool",
      name,
      capacity,
      status: "active",
      sort_order: 100 + index * 10
    },
    "tenant_id,code"
  );
  resourceByCode.set(code, resource);
}

const instructorSpecs = [
  ["journey-instructeur-1@nxttrack.test", "Sanne Vermeer"],
  ["journey-instructeur-2@nxttrack.test", "Rachid El Idrissi"],
  ["journey-instructeur-3@nxttrack.test", "Marieke van Dongen"],
  ["journey-instructeur-4@nxttrack.test", "Jeroen Smit"]
];
const instructorIds = [];
for (const [email, fullName] of instructorSpecs) {
  const userId = await ensureTestUser(email, fullName);
  instructorIds.push(userId);
  await upsert("profiles", { id: userId, full_name: fullName, phone: "0600000000" }, "id");
  await upsert(
    "tenant_memberships",
    { tenant_id: tenant.id, user_id: userId, role: "instructor", status: "active", invited_email: email },
    "tenant_id,user_id,role"
  );
}

const groupSpecs = [
  ["JB-INS-MA-1530", "Instructie · maandag 15:30", "INSTRUCTIE", "JB-INSTRUCTIE", 1, "15:30", "16:15"],
  ["JB-B1-MA-1630", "Badje 1 · maandag 16:30", "BADJE-1", "JB-BADJE-1", 1, "16:30", "17:15"],
  ["JB-B2-DI-1600", "Badje 2 · dinsdag 16:00", "BADJE-2", "JB-BADJE-2", 2, "16:00", "16:45"],
  ["JB-B3-WO-1600", "Badje 3 · woensdag 16:00", "BADJE-3", "JB-BADJE-3", 3, "16:00", "16:45"],
  ["JB-AF-DO-1700", "Afzwemmen A · donderdag 17:00", "AFZWEM-A", "JB-AFZWEM", 4, "17:00", "17:45"],
  ["JB-B-DO-1800", "Diploma B · donderdag 18:00", "DIPLOMA-B", "JB-AFZWEM", 4, "18:00", "18:45"],
  ["JB-C-VR-1600", "Diploma C · vrijdag 16:00", "DIPLOMA-C", "JB-AFZWEM", 5, "16:00", "16:45"],
  ["JB-B1-VR-1700", "Badje 1 · vrijdag 17:00", "BADJE-1", "JB-BADJE-1", 5, "17:00", "17:45"]
];
const groupByCode = new Map();
for (const [index, [code, name, stageCode, resourceCode, weekday, start, end]] of groupSpecs.entries()) {
  const group = await upsertOne(
    "groups",
    {
      tenant_id: tenant.id,
      program_id: program.id,
      stage_id: stageByCode.get(stageCode).id,
      default_resource_id: resourceByCode.get(resourceCode).id,
      name,
      code,
      status: "active",
      capacity: 8,
      default_weekday: weekday,
      default_start_time: start,
      default_end_time: end,
      starts_on: "2026-01-01"
    },
    "tenant_id,code"
  );
  groupByCode.set(code, group);
  await upsert(
    "group_instructor_assignments",
    {
      tenant_id: tenant.id,
      group_id: group.id,
      instructor_user_id: instructorIds[index % instructorIds.length],
      role: "primary",
      status: "active",
      starts_on: "2026-01-01"
    },
    "group_id,instructor_user_id,role,starts_on"
  );
}

const baseMonday = startOfIsoWeek(new Date());
let sessionCount = 0;
for (const group of groupByCode.values()) {
  for (const weekOffset of [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]) {
    const startsAt = occurrenceForWeek(baseMonday, group.default_weekday, group.default_start_time, weekOffset);
    const endsAt = new Date(startsAt.getTime() + 45 * 60_000);
    const existing = await maybeOne("sessions", {
      tenant_id: tenant.id,
      group_id: group.id,
      starts_at: startsAt.toISOString()
    });
    const session =
      existing ??
      (await insertOne("sessions", {
        tenant_id: tenant.id,
        group_id: group.id,
        resource_id: group.default_resource_id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: weekOffset < 0 ? "completed" : "scheduled",
        notes: "JOURNEY_BOT_WATERLIJN_SEED",
        source: "journey_simulation_bot",
        is_test: true,
        test_metadata_json: { seed: "waterlijn-journey-v1", safeToArchive: true }
      }));
    sessionCount += 1;
    await upsert(
      "session_instructor_assignments",
      {
        tenant_id: tenant.id,
        session_id: session.id,
        instructor_user_id: instructorIds[[...groupByCode.values()].findIndex((item) => item.id === group.id) % instructorIds.length],
        role: "primary",
        status: "active"
      },
      "session_id,instructor_user_id,role"
    );
  }
}

const itemNames = ["Waterveilig starten", "Techniek en houding", "Zelfstandig uitvoeren", "Conditie en vertrouwen"];
for (const [index, [code, name]] of stageSpecs.entries()) {
  if (code === "KLAAR") continue;
  const stage = stageByCode.get(code);
  const module = await upsertOne(
    "progress_modules",
    {
      tenant_id: tenant.id,
      program_id: program.id,
      stage_id: stage.id,
      code: `JB-${code}`,
      name: `${name} · kernvaardigheden`,
      description: "Realistische progressiemodule voor Journey Bot-validatie.",
      template_key: "journey_bot_swim_v1",
      status: "active",
      sort_order: (index + 1) * 10
    },
    "tenant_id,code"
  );
  for (const [itemIndex, itemName] of itemNames.entries()) {
    await upsert(
      "progress_items",
      {
        tenant_id: tenant.id,
        module_id: module.id,
        code: `JB-${code}-${itemIndex + 1}`,
        name: `${itemName} · ${name}`,
        description: `Opbouwstap ${itemIndex + 1} binnen ${name}.`,
        positive_goal: "Beheerst en zelfstandig uitgevoerd.",
        status: "active",
        sort_order: (itemIndex + 1) * 10
      },
      "tenant_id,module_id,code"
    );
  }
  await upsert(
    "badge_definitions",
    {
      tenant_id: tenant.id,
      program_id: program.id,
      stage_id: stage.id,
      code: `JB-${code}-AFGEROND`,
      name: `${name} afgerond`,
      description: `Testbadge voor het afronden van ${name}.`,
      icon_name: "award",
      status: "active",
      sort_order: (index + 1) * 10
    },
    "tenant_id,code"
  );
}

await upsert(
  "journey_bot_configs",
  {
    environment: "staging",
    tenant_id: tenant.id,
    enabled: false,
    paused: false,
    scenario_mode: "full_journey_to_diploma",
    min_interval_minutes: 3,
    max_interval_minutes: 12,
    max_journeys_per_run: 1,
    max_active_journeys: 3,
    max_journeys_per_day: 50,
    active_days_json: [1, 2, 3, 4, 5, 6, 7],
    active_time_windows_json: [{ start: "00:00", end: "23:59" }],
    program_ids_json: [program.id],
    run_speed: "fast",
    suppress_external_notifications: true,
    suppress_real_payments: true,
    use_fallback_placement: false,
    cleanup_after_days: 14,
    next_run_at: null,
    last_status: "seeded"
  },
  "environment,tenant_id"
);

const weekdays = new Set(groupSpecs.map((group) => group[4]));
const invalidDurations = groupSpecs.filter((group) => minutesBetween(group[5], group[6]) !== 45);
if (groupSpecs.length < 5 || groupSpecs.length > 8 || weekdays.size !== 5 || invalidDurations.length) {
  throw new Error("Journey Bot seed invariant failed: expected 5-8 groups of 45 minutes across five weekdays.");
}

console.log(
  JSON.stringify(
    {
      configEnabled: false,
      groups: groupSpecs.length,
      instructors: instructorIds.length,
      program: program.name,
      sessions: sessionCount,
      stages: stageSpecs.map((stage) => stage[1]),
      tenant: tenant.name,
      tenantId: tenant.id,
      weekdays: [...weekdays].sort()
    },
    null,
    2
  )
);

async function ensureTestUser(email, fullName) {
  const { data: usersResult, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assertNoError(listError, "list auth users");
  const existing = usersResult.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: `JB-${randomUUID()}-aA9!`,
    app_metadata: { is_test: true, source: "journey_simulation_bot", tenant_id: tenant.id },
    user_metadata: { full_name: fullName }
  });
  assertNoError(error, `create instructor ${email}`);
  return data.user.id;
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

async function one(table, filters) {
  let query = admin.from(table).select("*");
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { data, error } = await query.maybeSingle();
  assertNoError(error, `read ${table}`);
  return data;
}

async function maybeOne(table, filters) {
  return one(table, filters);
}

function assertNoError(error, label) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

function startOfIsoWeek(date) {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);
  const weekday = result.getUTCDay() || 7;
  result.setUTCDate(result.getUTCDate() - weekday + 1);
  return result;
}

function occurrenceForWeek(monday, weekday, time, weekOffset) {
  const result = new Date(monday);
  result.setUTCDate(result.getUTCDate() + (weekday - 1) + weekOffset * 7);
  const [hours, minutes] = String(time).split(":").map(Number);
  result.setUTCHours(hours, minutes, 0, 0);
  return result;
}

function minutesBetween(start, end) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return endHour * 60 + endMinute - (startHour * 60 + startMinute);
}
