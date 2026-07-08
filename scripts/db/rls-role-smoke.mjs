#!/usr/bin/env node

const supabaseUrl = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const required = process.env.RLS_ROLE_SMOKE_REQUIRED === "true";
const roleChecks = [
  {
    key: "platform-owner",
    prefix: "E2E_PLATFORM_OWNER",
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
  }

  const leakedPlatformMembership = platformMemberships.find((membership) => membership.user_id !== auth.userId && !check.expectedPlatformRoles);

  if (leakedPlatformMembership) {
    failures.push(`${check.key} can see another user's platform membership.`);
  }

  console.log(
    `[db:rls-role-smoke] ${check.key}: tenantRows=${tenantMemberships.length} visibleTenants=${tenants.length} platformRows=${platformMemberships.length}`
  );
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
  const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    headers: {
      ...baseHeaders(),
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    failures.push(`REST query ${path} failed: HTTP ${response.status} ${await response.text()}`);
    return [];
  }

  const body = await response.json();

  return Array.isArray(body) ? body : [];
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
