import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import pg from "pg";
import { adminPublicationWindowsSql, adminSessionWindowsSql, requireAdminSessionWindows } from "../../scripts/staging/admin-session-windows.mjs";

// Explicit opt-in; temporary tables only, on a local test database.
const connectionString = process.env.ADMIN_PLANNING_TEST_DATABASE_URL;
if (!connectionString || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(connectionString).hostname)) {
  throw new Error("ADMIN_PLANNING_TEST_DATABASE_URL must identify a local test database.");
}
const client = new pg.Client({ connectionString });
const tenant = "00000000-0000-0000-0000-000000000001";
const otherTenant = "00000000-0000-0000-0000-000000000002";
const parent = "00000000-0000-0000-0000-000000000003";
const lane = "00000000-0000-0000-0000-000000000004";
const child = "00000000-0000-0000-0000-000000000005";
const otherResource = "00000000-0000-0000-0000-000000000006";
const instructor = "00000000-0000-0000-0000-000000000007";

before(async () => {
  await client.connect();
  await client.query(`
    create temp table resources(tenant_id uuid, id uuid, parent_resource_id uuid);
    create temp table session_resource_reservations(tenant_id uuid, resource_id uuid, status text, starts_at timestamptz, ends_at timestamptz);
    create temp table session_instructor_reservations(tenant_id uuid, instructor_user_id uuid, status text, starts_at timestamptz, ends_at timestamptz);
    create temp table season_blackout_periods(tenant_id uuid, resource_id uuid, status text, starts_at timestamptz, ends_at timestamptz);
  `);
  await client.query("insert into pg_temp.resources values ($1,$2,null),($1,$3,$2),($1,$4,$3),($1,$5,null)", [tenant, parent, lane, child, otherResource]);
});
beforeEach(async () => {
  await client.query("truncate pg_temp.session_resource_reservations, pg_temp.session_instructor_reservations, pg_temp.season_blackout_periods");
});
after(async () => { await client.end(); });

async function windows(today = "2026-09-20", query = adminSessionWindowsSql) {
  await client.query("begin read only");
  try {
    // Only schema qualification changes; execute the production fixture query.
    return (await client.query(query.replaceAll("public.", "pg_temp."), [tenant, lane, instructor, today])).rows;
  } finally { await client.query("rollback"); }
}

test("selects two distinct future days and keeps them inside the agenda window", async () => {
  assert.deepEqual(requireAdminSessionWindows(await windows()), [
    { startsAt: "2026-09-21T06:00", endsAt: "2026-09-21T06:45" },
    { startsAt: "2026-09-22T06:00", endsAt: "2026-09-22T06:45" }
  ]);
});

for (const [label, resource] of [["parent", parent], ["same resource", lane], ["descendant", child]]) {
  test(`avoids active ${label} reservations`, async () => {
    await client.query("insert into pg_temp.session_resource_reservations values ($1,$2,'active','2026-09-21T06:00Z','2026-09-21T06:45Z')", [tenant, resource]);
    assert.equal((await windows())[0].startsAt, "2026-09-21T07:00");
  });
}

test("ignores released bookings and other resources or tenants", async () => {
  await client.query(`insert into pg_temp.session_resource_reservations values
    ($1,$2,'released','2026-09-21T00:00Z','2026-09-22T00:00Z'),
    ($1,$3,'active','2026-09-21T00:00Z','2026-09-22T00:00Z'),
    ($4,$2,'active','2026-09-21T00:00Z','2026-09-22T00:00Z')`, [tenant, lane, otherResource, otherTenant]);
  assert.equal((await windows())[0].startsAt, "2026-09-21T06:00");
});

test("avoids instructor conflicts in both UTC and Amsterdam interpretations", async () => {
  await client.query("insert into pg_temp.session_instructor_reservations values ($1,$2,'active','2026-09-21T06:00Z','2026-09-21T08:00Z')", [tenant, instructor]);
  assert.equal((await windows())[0].startsAt, "2026-09-21T10:00");
});

test("published closures block dates, and exhaustion fails without leaving the window", async () => {
  await client.query("insert into pg_temp.season_blackout_periods values ($1,null,'published','2026-09-21T00:00Z','2026-09-22T00:00Z')", [tenant]);
  assert.equal((await windows())[0].startsAt, "2026-09-22T06:00");
  await client.query("insert into pg_temp.season_blackout_periods values ($1,null,'published','2026-09-20T00:00Z','2026-10-04T00:00Z')", [tenant]);
  const unavailable = await windows();
  assert.deepEqual(unavailable, []);
  assert.throws(() => requireAdminSessionWindows(unavailable), /Two distinct free/);
});

test("a reservation ending at the candidate start does not overlap", async () => {
  await client.query("insert into pg_temp.session_resource_reservations values ($1,$2,'active','2026-09-21T05:15Z','2026-09-21T06:00Z')", [tenant, lane]);
  assert.equal((await windows())[0].startsAt, "2026-09-21T06:00");
});

test("calendar selection stays within its date window across winter and summer time changes", async () => {
  assert.equal((await windows("2026-03-28"))[0].startsAt, "2026-03-29T06:00");
  assert.equal((await windows("2026-10-24"))[0].startsAt, "2026-10-25T06:00");
});

test("publications use Sundays beyond the agenda window and within qualification validity", async () => {
  for (const today of ["2026-09-20", "2026-03-29", "2026-10-25", "2027-01-01"]) {
    const selected = requireAdminSessionWindows(await windows(today, adminPublicationWindowsSql));
    for (const window of selected) {
      const date = new Date(`${window.startsAt}Z`);
      const days = (date.getTime() - Date.parse(`${today}T00:00Z`)) / 86_400_000;
      assert.equal(date.getUTCDay(), 0);
      assert.ok(days >= 14 && days < 651);
      assert.equal(window.startsAt.slice(11), "20:00");
    }
  }
});

test("publication selection also skips resource conflicts in Amsterdam time", async () => {
  await client.query("insert into pg_temp.session_resource_reservations values ($1,$2,'active','2026-10-04T18:00Z','2026-10-04T18:45Z')", [tenant, lane]);
  assert.equal((await windows("2026-09-20", adminPublicationWindowsSql))[0].startsAt, "2026-10-11T20:00");
});
