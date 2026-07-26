#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");
const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const statePath = path.resolve(process.cwd(), process.env.SPRINT4_ISOLATION_STATE_PATH || "artifacts/sprint4-isolation-state.json");
const tenantSlug = "sprint4-isolation";
const tenantHostname = `${tenantSlug}.staging.nxttrack.nl`;
const tenantName = "Sprint 4 Isolatie Tenant";
const programCode = "sprint4-isolation-program";
const programName = "Sprint 4 Isolatieprogramma";

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Sprint 4 isolation preparation is restricted to staging.nxttrack.nl.");
}

if (!supabaseUrl || !supabaseSecret) {
  throw new Error("Staging Supabase credentials are required.");
}

const admin = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const tenant = await upsertOne(
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
    tenant_id: tenant.id,
    terminology_sector: "swim_school",
    locale: "nl-NL",
    timezone: "Europe/Amsterdam"
  },
  "tenant_id",
  "tenant_id"
);

const resetDomains = await admin.from("tenant_domains").update({ is_primary: false }).eq("tenant_id", tenant.id).neq("hostname", tenantHostname);

if (resetDomains.error) {
  throw new Error(`Could not reset isolation tenant domains: ${resetDomains.error.message}`);
}

await upsertOne(
  "tenant_domains",
  {
    tenant_id: tenant.id,
    hostname: tenantHostname,
    kind: "subdomain",
    status: "verified",
    is_primary: true
  },
  "hostname",
  "id"
);

await upsertOne(
  "programs",
  {
    tenant_id: tenant.id,
    name: programName,
    code: programCode,
    description: "Publieke marker voor browserbewijs van tenantroutering en afgeschermd beheer.",
    status: "active",
    sort_order: 4
  },
  "tenant_id,code",
  "id"
);

const state = {
  tenantId: tenant.id,
  tenantSlug,
  tenantName,
  tenantUrl: `https://${tenantHostname}`,
  programName
};

mkdirSync(path.dirname(statePath), { recursive: true });
writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
console.log(`[sprint4:prepare-isolation] PASS wrote bounded isolation state to ${statePath}.`);

async function upsertOne(table, values, onConflict, select) {
  const result = await admin.from(table).upsert(values, { onConflict }).select(select).single();

  if (result.error || !result.data) {
    throw new Error(`Could not prepare Sprint 4 ${table}: ${result.error?.message ?? "row missing"}`);
  }

  return result.data;
}

function hostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
