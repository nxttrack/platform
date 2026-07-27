#!/usr/bin/env node

const supabaseUrl = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const required = process.env.RLS_ROLE_SMOKE_REQUIRED === "true";
const roleChecks = [
  {
    key: "platform-owner",
    prefix: "E2E_PLATFORM_OWNER",
    expectedEmail: process.env.RLS_PLATFORM_OWNER_EMAIL,
    expectedPlatformRoles: ["platform_owner", "platform_admin", "platform_support"]
  },
  {
    key: "tenant-admin",
    prefix: "E2E_TENANT_ADMIN",
    expectedTenantRoles: ["tenant_owner", "tenant_admin", "tenant_staff"]
  },
  {
    key: "instructor",
    prefix: "E2E_INSTRUCTOR",
    expectedTenantRoles: ["instructor"],
    selfOnlyTenantMemberships: true
  },
  {
    key: "parent",
    prefix: "E2E_PARENT",
    expectedTenantRoles: ["parent"],
    selfOnlyTenantMemberships: true
  }
];
const tenantScopedTables = parseTableList(
  process.env.RLS_TENANT_SCOPED_TABLES ||
    [
      "programs",
      "program_stages",
      "resources",
      "groups",
      "sessions",
      "participants",
      "enrollments",
      "group_memberships",
      "intake_submissions",
      "waitlist_entries",
      "placement_recommendations",
      "slot_offers",
      "participant_progress_scores",
      "participant_badge_awards",
      "tenant_notifications",
      "graduation_readiness",
      "graduation_events",
      "certificate_records",
      "payment_plans",
      "subscriptions",
      "manual_payments",
      "tenant_messages",
      "tenant_tasks",
      "tenant_documents",
      "participant_media",
      "media_consent_events",
      "media_access_logs",
      "communication_templates",
      "message_threads",
      "message_thread_participants",
      "messages",
      "newsletter_campaigns",
      "newsletter_recipients",
      "communication_deliveries",
      "tenant_badge_module_settings",
      "tenant_badge_settings",
      "tenant_custom_badges",
      "badge_message_suggestions",
      "badge_collections",
      "badge_share_template_sets",
      "badge_share_assets",
      "badge_analytics_events"
    ].join(",")
);

const configuredRoleChecks = roleChecks
  .map((check) => ({ ...check, credentials: credentialsFor(check.prefix) }))
  .filter((check) => check.credentials);

if (!supabaseUrl || !supabaseKey || configuredRoleChecks.length === 0) {
  const missing = [
    supabaseUrl ? null : "NEXT_PUBLIC_SUPABASE_URL",
    supabaseKey ? null : "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    configuredRoleChecks.length > 0 ? null : "E2E_* role credentials"
  ].filter(Boolean);

  const message = `[db:rls-role-smoke] ${required ? "FAIL" : "SKIP"} Missing ${missing.join(", ")}.`;

  if (required) {
    console.error(message);
    process.exit(1);
  }

  console.log(message);
  process.exit(0);
}

const missingRequiredRoles = required ? roleChecks.filter((check) => !credentialsFor(check.prefix)).map((check) => check.key) : [];

if (missingRequiredRoles.length > 0) {
  console.error(`[db:rls-role-smoke] FAIL Missing required credentials for: ${missingRequiredRoles.join(", ")}.`);
  process.exit(1);
}

const failures = [];

for (const check of configuredRoleChecks) {
  await runRoleCheck(check);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[db:rls-role-smoke] FAIL ${failure}`);
  }

  process.exit(1);
}

console.log(`[db:rls-role-smoke] PASS ${configuredRoleChecks.length} role RLS smoke check(s) passed.`);

async function runRoleCheck(check) {
  if (required && check.expectedEmail && normalizeEmail(check.credentials.email) !== normalizeEmail(check.expectedEmail)) {
    failures.push(`${check.key} credentials must use ${check.expectedEmail}, got ${check.credentials.email}.`);
    return;
  }

  const auth = await signIn(check.credentials.email, check.credentials.password);

  if (!auth) {
    return;
  }

  const [tenantMemberships, platformMemberships, tenants] = await Promise.all([
    rest(auth.accessToken, "/tenant_memberships?select=tenant_id,user_id,role,status&status=eq.active"),
    rest(auth.accessToken, "/platform_memberships?select=user_id,role,status&status=eq.active"),
    rest(auth.accessToken, "/tenants?select=id,slug,status&status=eq.active")
  ]);

  const ownTenantIds = new Set(tenantMemberships.filter((membership) => membership.user_id === auth.userId).map((membership) => membership.tenant_id));
  const ownTenantRoles = tenantMemberships.filter((membership) => membership.user_id === auth.userId).map((membership) => membership.role);
  const ownPlatformRoles = platformMemberships.filter((membership) => membership.user_id === auth.userId).map((membership) => membership.role);

  if (check.expectedPlatformRoles && !ownPlatformRoles.some((role) => check.expectedPlatformRoles.includes(role))) {
    failures.push(`${check.key} does not expose an active expected platform membership for its own user.`);
  }

  if (check.expectedTenantRoles && !ownTenantRoles.some((role) => check.expectedTenantRoles.includes(role))) {
    failures.push(`${check.key} does not expose an active expected tenant membership for its own user.`);
  }

  if (check.selfOnlyTenantMemberships && tenantMemberships.some((membership) => membership.user_id !== auth.userId)) {
    failures.push(`${check.key} can see tenant memberships for another user.`);
  }

  if (check.expectedTenantRoles) {
    const leakedTenant = tenants.find((tenant) => !ownTenantIds.has(tenant.id));

    if (leakedTenant) {
      failures.push(`${check.key} can see tenant ${leakedTenant.slug ?? leakedTenant.id} outside its own memberships.`);
    }

    await assertTenantScopedTableIsolation(check, auth, ownTenantIds);
  }

  const leakedPlatformMembership = platformMemberships.find((membership) => membership.user_id !== auth.userId && !check.expectedPlatformRoles);

  if (leakedPlatformMembership) {
    failures.push(`${check.key} can see another user's platform membership.`);
  }

  console.log(
    `[db:rls-role-smoke] ${check.key}: tenantRows=${tenantMemberships.length} visibleTenants=${tenants.length} platformRows=${platformMemberships.length}`
  );
}

async function assertTenantScopedTableIsolation(check, auth, ownTenantIds) {
  if (ownTenantIds.size === 0) {
    failures.push(`${check.key} has no own tenant ids available for tenant-scoped isolation checks.`);
    return;
  }

  for (const table of tenantScopedTables) {
    const rows = await optionalRest(auth.accessToken, `/${table}?select=tenant_id&limit=50`, table);
    const leakedRow = rows.find((row) => row.tenant_id && !ownTenantIds.has(row.tenant_id));

    if (leakedRow) {
      failures.push(`${check.key} can see a ${table} row for another tenant.`);
    }
  }
}

async function signIn(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    failures.push(`sign-in failed for ${email}: HTTP ${response.status} ${await response.text()}`);
    return null;
  }

  const body = await response.json();

  if (!body.access_token || !body.user?.id) {
    failures.push(`sign-in response for ${email} did not include access_token and user.id.`);
    return null;
  }

  return {
    accessToken: body.access_token,
    userId: body.user.id
  };
}

async function rest(accessToken, path) {
  const result = await fetchRest(accessToken, path);

  if (!result.ok) {
    failures.push(`REST query ${path} failed: HTTP ${result.status} ${result.bodyText}`);
    return [];
  }

  return result.rows;
}

async function optionalRest(accessToken, path, label) {
  const result = await fetchRest(accessToken, path);

  if (!result.ok) {
    if ([401, 403, 404].includes(result.status)) {
      console.log(`[db:rls-role-smoke] optional table ${label} inaccessible with HTTP ${result.status}; treating as no leakage.`);
      return [];
    }

    failures.push(`Optional REST query ${path} failed: HTTP ${result.status} ${result.bodyText}`);
    return [];
  }

  return result.rows;
}

async function fetchRest(accessToken, path) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
      headers: {
        ...baseHeaders(),
        authorization: `Bearer ${accessToken}`
      }
    });

    if (response.ok) {
      const body = await response.json();

      return {
        ok: true,
        status: response.status,
        bodyText: "",
        rows: Array.isArray(body) ? body : []
      };
    }

    const bodyText = await response.text();
    const transientClockSkew =
      response.status === 401 &&
      bodyText.includes('"code":"PGRST303"') &&
      bodyText.includes("JWT issued at future");

    if (!transientClockSkew || attempt === 3) {
      return {
        ok: false,
        status: response.status,
        bodyText,
        rows: []
      };
    }

    const delayMs = (attempt + 1) * 1_000;
    console.log(`[db:rls-role-smoke] Supabase clock skew detected; retrying REST query in ${delayMs}ms.`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("Unreachable REST retry state.");
}

function baseHeaders() {
  return {
    apikey: supabaseKey,
    "content-type": "application/json"
  };
}

function credentialsFor(prefix) {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

function normalizeUrl(value) {
  return value ? value.replace(/\/+$/, "") : "";
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function parseTableList(value) {
  return value
    .split(/[\s,]+/)
    .map((table) => table.trim())
    .filter(Boolean);
}
