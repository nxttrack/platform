import { createClient } from "@supabase/supabase-js";

const appEnv = String(process.env.APP_ENV ?? "").trim().toLowerCase();
const allowSeed = String(process.env.ALLOW_SPRINT31_DEMO_SEED ?? "").trim().toLowerCase() === "true";
if (appEnv !== "staging" || !allowSeed) {
  throw new Error("Demo seed is staging-only and requires ALLOW_SPRINT31_DEMO_SEED=true.");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase URL and server secret are required.");

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const demo = {
  name: "Zwemacademie De Waterlijn",
  slug: "waterlijn-demo",
  hostname: "waterlijn-demo.staging.nxttrack.nl"
};

const tenant = await upsertOne("tenants", { name: demo.name, sector: "swim_school", slug: demo.slug, status: "active" }, "slug");
await upsert("tenant_settings", { tenant_id: tenant.id, terminology_sector: "swim_school", locale: "nl-NL", timezone: "Europe/Amsterdam" }, "tenant_id");
await upsert("tenant_domains", { tenant_id: tenant.id, hostname: demo.hostname, kind: "subdomain", status: "verified", is_primary: true }, "hostname");
await upsert("tenant_branding", { tenant_id: tenant.id, product_name: "De Waterlijn", primary_color: "#075985", accent_color: "#14b8a6", portal_welcome: "Samen groeien van watervrij naar diploma C.", pwa_enabled: true, status: "active" }, "tenant_id");

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
  ["WATERVRIJ", "Watervrij", "#0ea5e9"], ["BASIS", "Basisvaardig", "#06b6d4"],
  ["A", "Diploma A", "#14b8a6"], ["B", "Diploma B", "#22c55e"], ["C", "Diploma C", "#84cc16"]
];
const stageByCode = new Map();
for (const [index, [code, name, color]] of stageSpecs.entries()) {
  const row = await upsertOne("program_stages", { tenant_id: tenant.id, program_id: programByCode.get("ZWEM-ABC").id, code, name, badge_label: name, color_hex: color, status: "active", sort_order: (index + 1) * 10 }, "tenant_id,program_id,code");
  stageByCode.set(code, row);
}
const toddlerStage = await upsertOne("program_stages", { tenant_id: tenant.id, program_id: programByCode.get("PEUTER").id, code: "SAMEN", name: "Samen in het water", badge_label: "Waterpret", color_hex: "#38bdf8", status: "active", sort_order: 10 }, "tenant_id,program_id,code");

const location = await upsertOne("resources", { tenant_id: tenant.id, code: "WATERLIJN", kind: "location", name: "Sportcentrum De Waterlijn", status: "active", sort_order: 10 }, "tenant_id,code");
const instructionPool = await upsertOne("resources", { tenant_id: tenant.id, parent_resource_id: location.id, code: "INSTRUCTIE", kind: "pool", name: "Instructiebad", capacity: 24, status: "active", sort_order: 10 }, "tenant_id,code");
const competitionPool = await upsertOne("resources", { tenant_id: tenant.id, parent_resource_id: location.id, code: "WEDSTRIJD", kind: "pool", name: "Wedstrijdbad", capacity: 48, status: "active", sort_order: 20 }, "tenant_id,code");

const groupSpecs = [
  ["WV-MA-1600", "Watervrij · maandag 16:00", "ZWEM-ABC", "WATERVRIJ", instructionPool.id, 1, "16:00", "16:45", 9],
  ["BA-MA-1700", "Basis · maandag 17:00", "ZWEM-ABC", "BASIS", instructionPool.id, 1, "17:00", "17:45", 10],
  ["A-WO-1530", "Diploma A · woensdag 15:30", "ZWEM-ABC", "A", competitionPool.id, 3, "15:30", "16:15", 11],
  ["A-WO-1630", "Diploma A · woensdag 16:30", "ZWEM-ABC", "A", competitionPool.id, 3, "16:30", "17:15", 11],
  ["B-VR-1600", "Diploma B · vrijdag 16:00", "ZWEM-ABC", "B", competitionPool.id, 5, "16:00", "16:50", 12],
  ["C-ZA-0900", "Diploma C · zaterdag 09:00", "ZWEM-ABC", "C", competitionPool.id, 6, "09:00", "09:50", 12],
  ["PO-ZA-1000", "Peuter & ouder · zaterdag 10:00", "PEUTER", "SAMEN", instructionPool.id, 6, "10:00", "10:40", 8]
];
const groupByCode = new Map();
for (const [code, name, programCode, stageCode, resourceId, weekday, start, end, capacity] of groupSpecs) {
  const row = await upsertOne("groups", { tenant_id: tenant.id, code, name, program_id: programByCode.get(programCode).id, stage_id: stageCode === "SAMEN" ? toddlerStage.id : stageByCode.get(stageCode).id, default_resource_id: resourceId, status: "active", capacity, default_weekday: weekday, default_start_time: start, default_end_time: end, starts_on: "2026-01-01" }, "tenant_id,code");
  groupByCode.set(code, row);
}

const names = [
  "Mila de Jong", "Yassin El Amrani", "Sophie van Dijk", "Liam Jansen", "Nora Bakker", "Adam Aydin",
  "Emma Smit", "Noah Visser", "Lina Özdemir", "Sem Meijer", "Sara Vos", "Finn de Boer",
  "Aya Benali", "Lucas Mulder", "Fenna Kuiper", "Rayan Haddad", "Julia Bos", "Mats Hendriks",
  "Lotte Verhoeven", "Omar Rahmani", "Tess Scholten", "Daan Peters", "Inaya Bouma", "Mees Hoekstra",
  "Elin van Leeuwen", "Sami Kaya", "Isa Dekker", "Bram Kok"
];
const activeGroups = [...groupByCode.values()].filter((group) => !group.code.startsWith("PO-"));
for (const [index, displayName] of names.entries()) {
  const participant = await upsertOne("participants", { tenant_id: tenant.id, display_name: displayName, birth_date: `20${17 + (index % 4)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 20) + 4).padStart(2, "0")}`, external_reference: `WL-${String(index + 1).padStart(4, "0")}`, status: "active" }, "tenant_id,external_reference");
  const group = activeGroups[index % activeGroups.length];
  let enrollment = await maybeOne("enrollments", { tenant_id: tenant.id, participant_id: participant.id, program_id: group.program_id, status: "active" });
  if (!enrollment) enrollment = await insertOne("enrollments", { tenant_id: tenant.id, participant_id: participant.id, program_id: group.program_id, current_stage_id: group.stage_id, status: "active", source: "manual", starts_on: "2026-01-08" });
  const existingMembership = await maybeOne("group_memberships", { tenant_id: tenant.id, group_id: group.id, enrollment_id: enrollment.id, status: "active" });
  if (!existingMembership) await insertOne("group_memberships", { tenant_id: tenant.id, group_id: group.id, enrollment_id: enrollment.id, participant_id: participant.id, status: "active", starts_on: "2026-01-08", capacity_weight: 1 });
}

const { data: oldDemoSessions, error: oldSessionsError } = await admin.from("sessions").select("id").eq("tenant_id", tenant.id).eq("notes", "SPRINT31_DEMO");
assertNoError(oldSessionsError, "read demo sessions");
if (oldDemoSessions?.length) {
  const { error } = await admin.from("sessions").delete().in("id", oldDemoSessions.map((session) => session.id));
  assertNoError(error, "refresh demo sessions");
}
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
for (const group of groupByCode.values()) {
  for (const weekOffset of [-1, 0, 1]) {
    const startsAt = occurrenceForWeekday(today, group.default_weekday, group.default_start_time, weekOffset);
    const endsAt = occurrenceForWeekday(today, group.default_weekday, group.default_end_time, weekOffset);
    const session = await insertOne("sessions", { tenant_id: tenant.id, group_id: group.id, resource_id: group.default_resource_id, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), status: weekOffset < 0 ? "completed" : "scheduled", notes: "SPRINT31_DEMO" });
    if (weekOffset < 0) {
      const { data: memberships, error } = await admin.from("group_memberships").select("participant_id, enrollment_id").eq("tenant_id", tenant.id).eq("group_id", group.id).eq("status", "active");
      assertNoError(error, "read group memberships");
      if (memberships?.length) {
        const attendanceRows = memberships.map((membership, index) => ({ tenant_id: tenant.id, session_id: session.id, participant_id: membership.participant_id, enrollment_id: membership.enrollment_id, status: index % 11 === 0 ? "absent" : index % 7 === 0 ? "late" : "present", note: index % 11 === 0 ? "Afwezig gemeld door ouder." : null }));
        const { error: attendanceError } = await admin.from("session_attendance").insert(attendanceRows);
        assertNoError(attendanceError, "seed attendance");
      }
    }
  }
}

await upsert("payment_plans", { tenant_id: tenant.id, program_id: programByCode.get("ZWEM-ABC").id, code: "ABC-MAAND", name: "Zwem-ABC maandabonnement", description: "Inclusief voortgangsrapportage en diploma-events.", amount_cents: 4950, currency: "EUR", billing_interval: "monthly", billing_day: 1, payment_terms_days: 14, status: "active", sort_order: 10 }, "tenant_id,code");
await upsert("payment_plans", { tenant_id: tenant.id, program_id: programByCode.get("PEUTER").id, code: "PEUTER-10", name: "Peuterkaart · 10 lessen", amount_cents: 12500, currency: "EUR", billing_interval: "one_time", payment_terms_days: 14, status: "active", sort_order: 20 }, "tenant_id,code");

const waitlistNames = ["Olivia Martens", "Ibrahim Korkmaz", "Maeve Prins", "Noud van Dam", "Amira Zahra", "Cas van Rijn"];
const { data: existingWaitlist, error: waitlistReadError } = await admin.from("waitlist_entries").select("participant_name").eq("tenant_id", tenant.id);
assertNoError(waitlistReadError, "read waitlist");
for (const [index, participantName] of waitlistNames.entries()) {
  if ((existingWaitlist ?? []).some((row) => row.participant_name === participantName)) continue;
  await insertOne("waitlist_entries", { tenant_id: tenant.id, program_id: programByCode.get("ZWEM-ABC").id, recommended_stage_id: stageByCode.get(index < 3 ? "WATERVRIJ" : "BASIS").id, parent_name: ["S. Martens", "D. Korkmaz", "R. Prins", "E. van Dam", "N. Zahra", "M. van Rijn"][index], parent_email: `demo-ouder-${index + 1}@example.test`, participant_name: participantName, participant_birth_date: `2020-0${(index % 8) + 1}-12`, selected_option: "waitlist", status: index === 0 ? "reviewing" : "waiting", priority_date: `2026-0${(index % 6) + 1}-15`, source: "manual", admin_notes: index === 0 ? "Voorkeur woensdagmiddag; niveaucheck gepland." : null });
}

console.log(JSON.stringify({ tenantId: tenant.id, slug: demo.slug, hostname: demo.hostname, programs: programs.length, groups: groupSpecs.length, participants: names.length, waitlist: waitlistNames.length }, null, 2));

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
async function maybeOne(table, filters) {
  let query = admin.from(table).select("*");
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { data, error } = await query.maybeSingle();
  assertNoError(error, `read ${table}`);
  return data;
}
function assertNoError(error, label) {
  if (error) throw new Error(`${label}: ${error.message}`);
}
function occurrenceForWeekday(baseDate, weekday, time, weekOffset) {
  const date = new Date(baseDate);
  const currentWeekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (weekday - currentWeekday) + weekOffset * 7);
  const [hours, minutes] = String(time).split(":").map(Number);
  date.setUTCHours(hours, minutes, 0, 0);
  return date;
}
