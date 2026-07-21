#!/usr/bin/env node

import { createRequire } from "node:module";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");
const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const tenantSlug = process.env.PHASE16_TENANT_SLUG || "aquaswim-demo";

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Sprint 4 mutation cleanup is restricted to staging.nxttrack.nl.");
}

if (!supabaseUrl || !supabaseSecret) {
  throw new Error("Staging Supabase URL and server secret are required.");
}

const admin = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const tenantResult = await admin.from("tenants").select("id").eq("slug", tenantSlug).eq("status", "active").maybeSingle();

if (tenantResult.error || !tenantResult.data) {
  throw new Error("The Sprint 4 staging tenant could not be resolved.");
}

const tenantId = tenantResult.data.id;
const submissionsResult = await admin
  .from("intake_submissions")
  .select("id")
  .eq("tenant_id", tenantId)
  .like("message", "sprint4-browser:%");

if (submissionsResult.error) {
  throw new Error(`Could not inventory prior Sprint 4 fixtures: ${submissionsResult.error.message}`);
}

const submissionIds = (submissionsResult.data ?? []).map((row) => row.id);

if (submissionIds.length === 0) {
  console.log("[sprint4:prepare] PASS no prior browser-mutation fixtures found.");
  process.exit(0);
}

const waitlistDelete = await admin
  .from("waitlist_entries")
  .delete()
  .eq("tenant_id", tenantId)
  .in("intake_submission_id", submissionIds);

if (waitlistDelete.error) {
  throw new Error(`Could not remove prior Sprint 4 waitlist fixtures: ${waitlistDelete.error.message}`);
}

const eventsDelete = await admin
  .from("tenant_events")
  .delete()
  .eq("tenant_id", tenantId)
  .eq("subject_type", "intake_submission")
  .in("subject_id", submissionIds);

if (eventsDelete.error) {
  throw new Error(`Could not remove prior Sprint 4 event fixtures: ${eventsDelete.error.message}`);
}

const submissionsDelete = await admin
  .from("intake_submissions")
  .delete()
  .eq("tenant_id", tenantId)
  .in("id", submissionIds);

if (submissionsDelete.error) {
  throw new Error(`Could not remove prior Sprint 4 intake fixtures: ${submissionsDelete.error.message}`);
}

console.log(`[sprint4:prepare] PASS removed ${submissionIds.length} prior browser-mutation fixture(s).`);

function hostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
