import { createRequire } from "node:module";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

if (String(process.env.APP_ENV ?? "").trim().toLowerCase() !== "staging") {
  throw new Error("Waterlijn verification is staging-only.");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase URL and server secret are required.");

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const tenant = await one("tenants", (query) => query.eq("slug", "waterlijn-demo"), "Waterlijn tenant");
const failures = [];
const canonicalGroupCodes = ["WV-MA-1600", "BA-MA-1700", "WV-DI-1615", "A-WO-1530", "A-WO-1630", "BA-DO-1700", "B-VR-1600", "C-ZA-0900", "PO-ZA-1000"];

if (tenant.name !== "Zwemacademie De Waterlijn" || tenant.status !== "active") {
  failures.push("tenant identity is not the active canonical Waterlijn showcase");
}

const [
  domains,
  programs,
  groups,
  participants,
  sessions,
  instructorMemberships,
  subscriptions,
  payments,
  waitlist,
  progress,
  badges,
  messages,
  tasks
] = await Promise.all([
  rows("tenant_domains", (query) => query.eq("tenant_id", tenant.id).eq("is_primary", true)),
  rows("programs", (query) => query.eq("tenant_id", tenant.id).eq("status", "active")),
  rows("groups", (query) => query.eq("tenant_id", tenant.id).eq("status", "active").in("code", canonicalGroupCodes)),
  rows("participants", (query) => query.eq("tenant_id", tenant.id).like("external_reference", "WL-%").eq("status", "active")),
  rows("sessions", (query) => query.eq("tenant_id", tenant.id).eq("notes", "SPRINT31_DEMO")),
  rows("tenant_memberships", (query) => query.eq("tenant_id", tenant.id).eq("role", "instructor").eq("status", "active")),
  rows("subscriptions", (query) => query.eq("tenant_id", tenant.id).eq("notes", "SPRINT31_DEMO")),
  rows("manual_payments", (query) => query.eq("tenant_id", tenant.id).like("reference", "WL-%")),
  rows("waitlist_entries", (query) => query.eq("tenant_id", tenant.id).like("parent_email", "waterlijn-demo-%@example.test")),
  rows("participant_progress_scores", (query) => query.eq("tenant_id", tenant.id).eq("status", "active")),
  rows("participant_badge_awards", (query) => query.eq("tenant_id", tenant.id).eq("status", "awarded")),
  rows("tenant_messages", (query) => query.eq("tenant_id", tenant.id).eq("status", "published")),
  rows("tenant_tasks", (query) => query.eq("tenant_id", tenant.id).in("status", ["open", "in_progress"]))
]);
const groupIds = new Set(groups.map((group) => group.id));
const memberships = await rows("group_instructor_assignments", (query) =>
  query.eq("tenant_id", tenant.id).eq("status", "active").in("group_id", [...groupIds])
);

expectCount("primary domain", domains, 1);
if (domains[0]?.hostname !== "waterlijn-demo.staging.nxttrack.nl" || domains[0]?.status !== "verified") {
  failures.push("canonical Waterlijn hostname is not the verified primary domain");
}
expectCount("programs", programs, 2);
expectCount("groups", groups, 9);
expectCount("participants", participants, 48);
expectCount("demo sessions", sessions, 72);
expectMinimum("group instructor assignments", memberships, 9);
expectCount("demo subscriptions", subscriptions, 20);
expectCount("demo payments", payments, 20);
expectCount("demo waitlist", waitlist, 8);
expectMinimum("progress scores", progress, 24);
expectMinimum("badge awards", badges, 18);
expectMinimum("published messages", messages, 2);
expectMinimum("open operational tasks", tasks, 3);

if (memberships.some((assignment) => !groupIds.has(assignment.group_id))) {
  failures.push("a counted instructor assignment does not belong to a canonical Waterlijn group");
}

const syntheticStaff = await Promise.all(
  instructorMemberships.map(async (membership) => one("profiles", (query) => query.eq("id", membership.user_id), `profile ${membership.user_id}`))
);
const safeSyntheticStaff = syntheticStaff.filter((profile) => String(profile.email ?? "").endsWith("@demo.nxttrack.test"));
expectCount("showcase instructors", safeSyntheticStaff, 4);
if (waitlist.some((entry) => !String(entry.parent_email ?? "").endsWith("@example.test"))) {
  failures.push("showcase waitlist addresses must use example.test");
}

const now = Date.now();
if (!sessions.some((session) => new Date(session.starts_at).getTime() < now && session.status === "completed")) {
  failures.push("showcase has no recent completed sessions");
}
if (!sessions.some((session) => new Date(session.starts_at).getTime() > now && session.status === "scheduled")) {
  failures.push("showcase has no upcoming scheduled sessions");
}
if (!payments.some((payment) => payment.status === "paid") || !payments.some((payment) => payment.status === "due") || !payments.some((payment) => payment.status === "overdue")) {
  failures.push("payment mix must contain paid, due and overdue examples");
}

const duplicateSessionKeys = duplicates(sessions.map((session) => `${session.group_id}:${session.starts_at}`));
const duplicateReferences = duplicates(payments.map((payment) => payment.reference));
if (duplicateSessionKeys.length) failures.push(`duplicate demo sessions: ${duplicateSessionKeys.join(", ")}`);
if (duplicateReferences.length) failures.push(`duplicate demo payment references: ${duplicateReferences.join(", ")}`);

if (failures.length) {
  console.error(`[waterlijn:verify] FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "pass",
      tenant: tenant.slug,
      programs: programs.length,
      groups: groups.length,
      instructors: safeSyntheticStaff.length,
      participants: participants.length,
      sessions: sessions.length,
      subscriptions: subscriptions.length,
      payments: payments.length,
      waitlist: waitlist.length,
      progressScores: progress.length,
      badgeAwards: badges.length
    },
    null,
    2
  )
);

async function rows(table, buildQuery) {
  const { data, error } = await buildQuery(admin.from(table).select("*"));
  if (error) throw new Error(`Could not verify ${table}: ${error.message}`);
  return data ?? [];
}

async function one(table, buildQuery, label) {
  const { data, error } = await buildQuery(admin.from(table).select("*")).maybeSingle();
  if (error || !data) throw new Error(`Could not verify ${label}: ${error?.message ?? "missing"}`);
  return data;
}

function expectCount(label, values, expected) {
  if (values.length !== expected) failures.push(`${label}: expected ${expected}, found ${values.length}`);
}

function expectMinimum(label, values, minimum) {
  if (values.length < minimum) failures.push(`${label}: expected at least ${minimum}, found ${values.length}`);
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}
