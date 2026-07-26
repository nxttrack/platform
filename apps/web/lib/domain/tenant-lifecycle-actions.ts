"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createInvitation } from "@/lib/auth/invitations";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getTrustedRequestOrigin } from "@/lib/http/trusted-request-origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteMollieCustomer, MollieApiError } from "./mollie";
import type { MollieMode } from "./mollie-contract";
import { eraseTenantStorageObjects } from "@/lib/storage/tenant-erasure";

export async function provisionTenantAction(formData: FormData) {
  const context = await requirePlatformAdministrator("/platform/onboarding");
  const admin = createAdminClient();
  const name = readRequired(formData, "name");
  const slug = normalizeSlug(readRequired(formData, "slug"));
  const ownerEmail = normalizeEmail(readRequired(formData, "ownerEmail"));
  const ownerName = readRequired(formData, "ownerName");
  const hostname = readRequired(formData, "hostname").toLowerCase();
  const customDomain = readOptional(formData, "customDomain")?.toLowerCase() ?? null;
  const programName = readRequired(formData, "programName");
  const stageNames = splitList(readRequired(formData, "stageNames"));
  const locationName = readRequired(formData, "locationName");
  const poolName = readRequired(formData, "poolName");
  const groupName = readRequired(formData, "groupName");
  const staff = splitList(readOptional(formData, "staffEmails") ?? "").map(normalizeEmail);
  const amountCents = Math.round(readPositiveNumber(formData, "monthlyAmount") * 100);

  if (!isEmail(ownerEmail) || staff.length === 0 || staff.some((email) => !isEmail(email)) || stageNames.length === 0 || !hostname.endsWith(".nxttrack.nl")) {
    redirect("/platform/onboarding?error=validation");
  }

  const runResult = await admin.from("tenant_onboarding_runs").insert({
    status: "provisioning",
    current_step: "organization",
    draft_data: { name, slug, hostname, ownerEmail, programName, locationName, poolName, groupName, staffCount: staff.length },
    created_by_user_id: context.user.id
  }).select("id").single();

  if (runResult.error || !runResult.data) {
    redirect("/platform/onboarding?error=run");
  }

  const runId = (runResult.data as { id: string }).id;
  let tenantId: string | null = null;

  try {
    const tenant = await insertOne(admin.from("tenants").insert({ name, slug, sector: "swim_school", status: "inactive" }).select("id").single(), "tenant");
    tenantId = tenant.id;
    await admin.from("tenant_onboarding_runs").update({ tenant_id: tenantId, current_step: "identity" }).eq("id", runId);

    await requireWrite(admin.from("tenant_settings").insert({ tenant_id: tenantId, terminology_sector: "swim_school", locale: "nl-NL", timezone: "Europe/Amsterdam" }), "tenant settings");
    await requireWrite(admin.from("tenant_domains").insert({
      tenant_id: tenantId,
      hostname,
      kind: "subdomain",
      status: "verified",
      is_primary: true
    }), "primary domain");
    if (customDomain && customDomain !== hostname) {
      await requireWrite(admin.from("tenant_domains").insert({ tenant_id: tenantId, hostname: customDomain, kind: "custom_domain", status: "pending", is_primary: false }), "custom domain");
    }
    await requireWrite(admin.from("tenant_branding").insert({
      tenant_id: tenantId,
      product_name: readOptional(formData, "productName") ?? name,
      primary_color: readColor(formData, "primaryColor", "#1d4ed8"),
      accent_color: readColor(formData, "accentColor", "#06b6d4"),
      portal_welcome: `Welkom bij ${name}. Hier volgt u lessen, voortgang en betalingen.`,
      status: "active",
      pwa_enabled: true
    }), "branding");

    await admin.from("tenant_onboarding_runs").update({ current_step: "program" }).eq("id", runId);
    const program = await insertOne(admin.from("programs").insert({
      tenant_id: tenantId,
      name: programName,
      code: "ZWEM-ABC",
      description: "Doorlopende leerlijn met heldere voortgang per niveau.",
      status: "active",
      sort_order: 10
    }).select("id").single(), "program");
    const stageResult = await admin.from("program_stages").insert(stageNames.map((stageName, index) => ({
      tenant_id: tenantId,
      program_id: program.id,
      name: stageName,
      code: `NIVEAU-${index + 1}`,
      badge_label: stageName,
      color_hex: ["#0ea5e9", "#06b6d4", "#14b8a6", "#22c55e"][index % 4],
      status: "active",
      sort_order: (index + 1) * 10
    }))).select("id").order("sort_order");
    if (stageResult.error || !stageResult.data?.length) throw new Error(`program stages: ${stageResult.error?.message ?? "missing rows"}`);

    await admin.from("tenant_onboarding_runs").update({ current_step: "operations" }).eq("id", runId);
    const location = await insertOne(admin.from("resources").insert({ tenant_id: tenantId, kind: "location", name: locationName, code: "LOC-01", status: "active" }).select("id").single(), "location");
    const pool = await insertOne(admin.from("resources").insert({ tenant_id: tenantId, parent_resource_id: location.id, kind: "pool", name: poolName, code: "BAD-01", capacity: 24, status: "active" }).select("id").single(), "pool");
    await requireWrite(admin.from("groups").insert({
      tenant_id: tenantId,
      program_id: program.id,
      stage_id: stageResult.data[0].id,
      default_resource_id: pool.id,
      name: groupName,
      code: "GRP-01",
      status: "active",
      capacity: readPositiveInteger(formData, "groupCapacity"),
      default_weekday: readPositiveInteger(formData, "weekday"),
      default_start_time: readRequired(formData, "startTime"),
      default_end_time: readRequired(formData, "endTime"),
      starts_on: new Date().toISOString().slice(0, 10)
    }), "group");

    await admin.from("tenant_onboarding_runs").update({ current_step: "billing" }).eq("id", runId);
    await requireWrite(admin.from("payment_plans").insert({
      tenant_id: tenantId,
      program_id: program.id,
      code: "MAAND",
      name: "Maandabonnement",
      description: "Doorlopend maandabonnement voor zwemlessen.",
      amount_cents: amountCents,
      currency: "EUR",
      billing_interval: "monthly",
      billing_day: 1,
      payment_terms_days: 14,
      status: "active"
    }), "payment plan");

    await requireWrite(admin.from("tenants").update({ status: "active" }).eq("id", tenantId), "tenant activation");
    await admin.from("tenant_onboarding_runs").update({ current_step: "owner" }).eq("id", runId);
    const acceptUrl = `${await getTrustedRequestOrigin()}/uitnodiging-accepteren`;
    await createInvitation({ actor: context, email: ownerEmail, fullName: ownerName, acceptUrl, role: "tenant_owner", tenantSlug: slug });

    await admin.from("tenant_onboarding_runs").update({ current_step: "staff" }).eq("id", runId);
    for (const email of staff) {
      await createInvitation({ actor: context, email, acceptUrl, role: "instructor", tenantSlug: slug });
    }

    const checklist = {
      branding: true,
      customDomainPending: Boolean(customDomain),
      domain: true,
      group: true,
      location: true,
      ownerInvited: true,
      paymentPlan: true,
      programAndStages: true,
      staffInvited: true
    };
    await requireWrite(admin.from("tenant_onboarding_runs").update({
      status: "opened",
      current_step: "opening",
      checklist,
      completed_by_user_id: context.user.id,
      completed_at: new Date().toISOString()
    }).eq("id", runId), "opening check");
  } catch (error) {
    if (tenantId) {
      await admin.from("tenants").update({ status: "inactive" }).eq("id", tenantId);
    }
    await admin.from("tenant_onboarding_runs").update({
      status: "attention_required",
      checklist: { error: error instanceof Error ? error.message : "unknown provisioning error" }
    }).eq("id", runId);
    redirect(`/platform/onboarding?error=provisioning&run=${runId}`);
  }

  revalidatePath("/platform");
  revalidatePath("/platform/onboarding");
  redirect(`/platform/onboarding?opened=1&run=${runId}`);
}

export async function startTenantOffboardingAction(formData: FormData) {
  const context = await requirePlatformAdministrator("/platform/offboarding");
  const tenantId = readRequired(formData, "tenantId");
  const retentionDays = Math.max(30, Math.min(365, readPositiveInteger(formData, "retentionDays")));
  const backupRetentionDays = Math.max(7, Math.min(90, readPositiveInteger(formData, "backupRetentionDays")));
  const admin = createAdminClient();
  const tenantResult = await admin.from("tenants").select("id, slug, name, status").eq("id", tenantId).maybeSingle();
  if (tenantResult.error || !tenantResult.data || tenantResult.data.status === "suspended") redirect("/platform/offboarding?error=tenant");
  const { error } = await admin.from("tenant_offboarding_runs").insert({
    tenant_id: tenantId,
    status: "requested",
    reason: readOptional(formData, "reason"),
    retention_ends_at: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1_000).toISOString(),
    backup_retention_days: backupRetentionDays,
    export_manifest: { format: "nxttrack-tenant-export-v1", storageBuckets: ["tenant-documents", "diploma-vault", "participant-media"] },
    tenant_name_snapshot: tenantResult.data.name,
    tenant_slug_snapshot: tenantResult.data.slug,
    requested_by_user_id: context.user.id
  });
  if (error) redirect("/platform/offboarding?error=start");
  revalidatePath("/platform/offboarding");
  redirect("/platform/offboarding?saved=requested");
}

export async function recordTenantStorageBackupAction(formData: FormData) {
  await requirePlatformAdministrator("/platform/offboarding");
  const runId = readRequired(formData, "runId");
  const reference = readRequired(formData, "backupReference");
  const checksum = readRequired(formData, "backupChecksum").toLowerCase();

  if (reference.length < 8 || !/^[a-f0-9]{64}$/.test(checksum)) {
    redirect("/platform/offboarding?error=backup_evidence");
  }

  const admin = createAdminClient();
  const runResult = await admin
    .from("tenant_offboarding_runs")
    .select("id, status")
    .eq("id", runId)
    .maybeSingle();

  if (!runResult.data || !["requested", "export_failed", "export_ready"].includes(runResult.data.status)) {
    redirect("/platform/offboarding?error=backup_state");
  }

  await requireWrite(
    admin
      .from("tenant_offboarding_runs")
      .update({
        storage_backup_checksum: checksum,
        storage_backup_completed_at: new Date().toISOString(),
        storage_backup_reference: reference.slice(0, 500)
      })
      .eq("id", runId),
    "storage backup evidence"
  );
  revalidatePath("/platform/offboarding");
  redirect("/platform/offboarding?saved=backup");
}

export async function closeTenantAccountAction(formData: FormData) {
  await requirePlatformAdministrator("/platform/offboarding");
  const runId = readRequired(formData, "runId");
  const admin = createAdminClient();
  const runResult = await admin
    .from("tenant_offboarding_runs")
    .select("id, tenant_id, status, export_completed_at, export_errors, storage_backup_completed_at, storage_backup_checksum, storage_backup_reference")
    .eq("id", runId)
    .single();
  if (
    runResult.error ||
    !runResult.data?.tenant_id ||
    runResult.data.status !== "export_ready" ||
    !runResult.data.export_completed_at ||
    (Array.isArray(runResult.data.export_errors) && runResult.data.export_errors.length > 0) ||
    !runResult.data.storage_backup_completed_at ||
    !runResult.data.storage_backup_checksum ||
    !runResult.data.storage_backup_reference
  ) {
    redirect("/platform/offboarding?error=export_and_backup_required");
  }
  await requireWrite(admin.from("tenant_memberships").update({ status: "suspended" }).eq("tenant_id", runResult.data.tenant_id), "membership closure");
  await requireWrite(admin.from("tenants").update({ status: "suspended" }).eq("id", runResult.data.tenant_id), "tenant closure");
  await requireWrite(admin.from("tenant_offboarding_runs").update({ status: "retention", closed_at: new Date().toISOString() }).eq("id", runId), "retention start");
  revalidatePath("/platform/offboarding");
  revalidatePath("/platform");
  redirect("/platform/offboarding?saved=closed");
}

export async function approveTenantDeletionAction(formData: FormData) {
  const context = await requirePlatformAdministrator("/platform/offboarding");
  if (!context.platform?.roles.includes("platform_owner")) redirect("/platform/offboarding?error=owner_required");
  const runId = readRequired(formData, "runId");
  const confirmationSlug = readRequired(formData, "confirmationSlug");
  const admin = createAdminClient();
  const runResult = await admin.from("tenant_offboarding_runs").select("id, tenant_id, status, retention_ends_at").eq("id", runId).single();
  if (runResult.error || !runResult.data || runResult.data.status !== "retention" || new Date(runResult.data.retention_ends_at).getTime() > Date.now()) redirect("/platform/offboarding?error=retention");
  const tenantResult = await admin.from("tenants").select("slug").eq("id", runResult.data.tenant_id).single();
  if (tenantResult.error || tenantResult.data?.slug !== confirmationSlug) redirect("/platform/offboarding?error=confirmation");
  await requireWrite(admin.from("tenant_offboarding_runs").update({ status: "deletion_approved", deletion_approved_at: new Date().toISOString(), approved_by_user_id: context.user.id }).eq("id", runId), "deletion approval");
  revalidatePath("/platform/offboarding");
  redirect("/platform/offboarding?saved=approved");
}

export async function permanentlyDeleteTenantAction(formData: FormData) {
  const context = await requirePlatformAdministrator("/platform/offboarding");
  if (!context.platform?.roles.includes("platform_owner")) redirect("/platform/offboarding?error=owner_required");
  const runId = readRequired(formData, "runId");
  const confirmation = readRequired(formData, "confirmation");
  const admin = createAdminClient();
  const runResult = await admin
    .from("tenant_offboarding_runs")
    .select("id, tenant_id, status, export_manifest, retention_ends_at, backup_retention_days, storage_backup_completed_at, storage_backup_checksum, storage_backup_reference")
    .eq("id", runId)
    .single();
  if (
    runResult.error ||
    !runResult.data ||
    !["deletion_approved", "erasure_attention_required"].includes(runResult.data.status) ||
    new Date(runResult.data.retention_ends_at).getTime() > Date.now()
  ) {
    redirect("/platform/offboarding?error=not_approved");
  }
  if (!runResult.data.tenant_id || !runResult.data.storage_backup_completed_at || !runResult.data.storage_backup_checksum || !runResult.data.storage_backup_reference) {
    redirect("/platform/offboarding?error=backup_required");
  }
  const tenantResult = await admin.from("tenants").select("id, slug, name, status").eq("id", runResult.data.tenant_id).single();
  if (tenantResult.error || !tenantResult.data || tenantResult.data.status !== "suspended" || confirmation !== `VERWIJDER ${tenantResult.data.slug}`) redirect("/platform/offboarding?error=confirmation");

  const manifest: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    storageBackup: {
      checksum: runResult.data.storage_backup_checksum,
      completedAt: runResult.data.storage_backup_completed_at,
      reference: runResult.data.storage_backup_reference
    }
  };
  await requireWrite(
    admin.from("tenant_offboarding_runs").update({ status: "erasure_in_progress", erasure_error: null, erasure_manifest: manifest }).eq("id", runId),
    "erasure start"
  );

  try {
    manifest.externalProviders = await eraseExternalTenantProviderData(tenantResult.data.id);
    await persistErasureManifest(runId, manifest);

    manifest.storage = await eraseTenantStorageObjects(tenantResult.data.id);
    await persistErasureManifest(runId, manifest);

    const tenantUserIds = await collectTenantAuthUserIds(tenantResult.data.id);
    manifest.auth = await eraseExclusiveTenantAuthAccounts(tenantResult.data.id, tenantUserIds);
    await persistErasureManifest(runId, manifest);

    const backupErasureDueAt = new Date(
      Date.now() + Number(runResult.data.backup_retention_days ?? 30) * 24 * 60 * 60 * 1_000
    ).toISOString();
    manifest.database = { tenantRowDeleted: true };
    manifest.completedAt = new Date().toISOString();

    await requireWrite(
      admin.from("tenant_deletion_tombstones").upsert({
        former_tenant_id: tenantResult.data.id,
        former_slug: tenantResult.data.slug,
        former_name: tenantResult.data.name,
        offboarding_run_id: runId,
        export_manifest: runResult.data.export_manifest,
        erasure_manifest: manifest,
        backup_erasure_due_at: backupErasureDueAt,
        approved_by_user_id: context.user.id
      }, { onConflict: "former_tenant_id" }),
      "deletion tombstone"
    );
    await requireWrite(admin.from("tenants").delete().eq("id", tenantResult.data.id), "tenant deletion");
    await requireWrite(
      admin
        .from("tenant_offboarding_runs")
        .update({
          status: "backup_retention",
          backup_erasure_due_at: backupErasureDueAt,
          backup_erasure_status: "retained",
          erased_at: new Date().toISOString(),
          erasure_error: null,
          erasure_manifest: manifest
        })
        .eq("id", runId),
      "backup retention start"
    );
  } catch (error) {
    await admin
      .from("tenant_offboarding_runs")
      .update({
        status: "erasure_attention_required",
        erasure_error: safeErrorMessage(error),
        erasure_manifest: manifest
      })
      .eq("id", runId);
    redirect("/platform/offboarding?error=erasure_attention_required");
  }

  revalidatePath("/platform/offboarding");
  revalidatePath("/platform");
  redirect("/platform/offboarding?saved=erased_backup_retained");
}

export async function finalizeTenantBackupErasureAction(formData: FormData) {
  const context = await requirePlatformAdministrator("/platform/offboarding");
  if (!context.platform?.roles.includes("platform_owner")) redirect("/platform/offboarding?error=owner_required");
  const runId = readRequired(formData, "runId");
  const confirmation = readRequired(formData, "confirmation");
  const admin = createAdminClient();
  const runResult = await admin
    .from("tenant_offboarding_runs")
    .select("id, status, tenant_slug_snapshot, backup_erasure_due_at")
    .eq("id", runId)
    .single();

  if (
    runResult.error ||
    !runResult.data ||
    runResult.data.status !== "backup_retention" ||
    !runResult.data.backup_erasure_due_at ||
    new Date(runResult.data.backup_erasure_due_at).getTime() > Date.now() ||
    confirmation !== `BACK-UPS VERSTREKEN ${runResult.data.tenant_slug_snapshot}`
  ) {
    redirect("/platform/offboarding?error=backup_retention");
  }

  const completedAt = new Date().toISOString();
  await requireWrite(
    admin
      .from("tenant_offboarding_runs")
      .update({
        status: "completed",
        backup_erasure_completed_at: completedAt,
        backup_erasure_status: "expired_confirmed"
      })
      .eq("id", runId),
    "backup erasure completion"
  );
  await requireWrite(
    admin
      .from("tenant_deletion_tombstones")
      .update({ backup_erasure_completed_at: completedAt })
      .eq("offboarding_run_id", runId),
    "tombstone backup erasure completion"
  );
  revalidatePath("/platform/offboarding");
  redirect("/platform/offboarding?saved=completed");
}

async function eraseExternalTenantProviderData(tenantId: string) {
  const admin = createAdminClient();
  const [configsResult, customersResult] = await Promise.all([
    admin
      .from("billing_provider_configs")
      .select("id, provider, mode, secret_reference")
      .eq("tenant_id", tenantId),
    admin
      .from("billing_provider_customers")
      .select("id, provider_config_id, provider_customer_id")
      .eq("tenant_id", tenantId)
  ]);

  if (configsResult.error || customersResult.error) {
    throw new Error(`Provider inventory failed: ${configsResult.error?.message ?? customersResult.error?.message}`);
  }

  const configs = new Map((configsResult.data ?? []).map((config) => [config.id, config]));
  let deletedCustomers = 0;

  for (const customer of customersResult.data ?? []) {
    const config = configs.get(customer.provider_config_id);
    if (!config || config.provider !== "mollie" || !config.secret_reference) {
      throw new Error(`Unsupported or incomplete provider cleanup for customer ${customer.id}.`);
    }

    try {
      await deleteMollieCustomer(
        customer.provider_customer_id,
        config.secret_reference,
        config.mode as MollieMode
      );
      deletedCustomers += 1;
    } catch (error) {
      if (!(error instanceof MollieApiError) || error.status !== 404) throw error;
    }
  }

  return {
    mollieCustomersDeleted: deletedCustomers,
    sendGrid: "tenant mail logs deleted with tenant; provider retention governed by the processor agreement"
  };
}

async function collectTenantAuthUserIds(tenantId: string) {
  const admin = createAdminClient();
  const results = await Promise.all([
    admin.from("tenant_memberships").select("user_id").eq("tenant_id", tenantId),
    admin.from("participants").select("guardian_user_id").eq("tenant_id", tenantId).not("guardian_user_id", "is", null),
    admin.from("participant_guardians").select("guardian_user_id").eq("tenant_id", tenantId),
    admin.from("group_instructor_assignments").select("instructor_user_id").eq("tenant_id", tenantId),
    admin.from("session_instructor_assignments").select("instructor_user_id").eq("tenant_id", tenantId)
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(`Auth inventory failed: ${error.message}`);

  const ids = new Set<string>();
  for (const result of results) {
    for (const row of result.data ?? []) {
      for (const value of Object.values(row)) {
        if (typeof value === "string") ids.add(value);
      }
    }
  }
  return [...ids];
}

async function eraseExclusiveTenantAuthAccounts(tenantId: string, userIds: string[]) {
  const admin = createAdminClient();
  let deleted = 0;
  let retainedShared = 0;

  for (const userId of userIds) {
    const [tenantMemberships, platformMemberships, participants, guardians, groupAssignments, sessionAssignments] = await Promise.all([
      admin.from("tenant_memberships").select("tenant_id").eq("user_id", userId).neq("tenant_id", tenantId).limit(1),
      admin.from("platform_memberships").select("user_id").eq("user_id", userId).limit(1),
      admin.from("participants").select("tenant_id").eq("guardian_user_id", userId).neq("tenant_id", tenantId).limit(1),
      admin.from("participant_guardians").select("tenant_id").eq("guardian_user_id", userId).neq("tenant_id", tenantId).limit(1),
      admin.from("group_instructor_assignments").select("tenant_id").eq("instructor_user_id", userId).neq("tenant_id", tenantId).limit(1),
      admin.from("session_instructor_assignments").select("tenant_id").eq("instructor_user_id", userId).neq("tenant_id", tenantId).limit(1)
    ]);
    const results = [tenantMemberships, platformMemberships, participants, guardians, groupAssignments, sessionAssignments];
    const error = results.find((result) => result.error)?.error;
    if (error) throw new Error(`Shared Auth reference check failed for ${userId}: ${error.message}`);

    if (results.some((result) => (result.data ?? []).length > 0)) {
      retainedShared += 1;
      continue;
    }

    const lookup = await admin.auth.admin.getUserById(userId);
    if (lookup.error && !isMissingAuthUserError(lookup.error.message)) {
      throw new Error(`Auth lookup failed for ${userId}: ${lookup.error.message}`);
    }
    if (!lookup.data.user) continue;

    const deletion = await admin.auth.admin.deleteUser(userId);
    if (deletion.error && !isMissingAuthUserError(deletion.error.message)) {
      throw new Error(`Auth deletion failed for ${userId}: ${deletion.error.message}`);
    }
    deleted += 1;
  }

  return { deletedExclusiveAccounts: deleted, retainedSharedAccounts: retainedShared };
}

async function persistErasureManifest(runId: string, manifest: Record<string, unknown>) {
  const admin = createAdminClient();
  await requireWrite(
    admin.from("tenant_offboarding_runs").update({ erasure_manifest: manifest }).eq("id", runId),
    "erasure progress"
  );
}

function isMissingAuthUserError(message: string) {
  return /not found|does not exist/i.test(message);
}

function safeErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}

async function requirePlatformAdministrator(path: `/${string}`) {
  const context = await requirePrivateShellContext(path);
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) redirect("/platform?error=forbidden");
  return context;
}

async function insertOne<T extends { id: string }>(operation: PromiseLike<{ data: T | null; error: { message: string } | null }>, label: string) {
  const result = await operation;
  if (result.error || !result.data) throw new Error(`${label}: ${result.error?.message ?? "missing row"}`);
  return result.data;
}

async function requireWrite(operation: PromiseLike<{ error: { message: string } | null }>, label: string) {
  const result = await operation;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
}

function readRequired(formData: FormData, field: string) {
  const value = readOptional(formData, field);
  if (!value) throw new Error(`${field} is required`);
  return value;
}
function readOptional(formData: FormData, field: string) { return String(formData.get(field) ?? "").trim() || null; }
function readPositiveNumber(formData: FormData, field: string) { const value = Number(readRequired(formData, field)); if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} is invalid`); return value; }
function readPositiveInteger(formData: FormData, field: string) { const value = Number.parseInt(readRequired(formData, field), 10); if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} is invalid`); return value; }
function readColor(formData: FormData, field: string, fallback: string) { const value = readOptional(formData, field) ?? fallback; return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
function normalizeSlug(value: string) { const slug = value.trim().toLowerCase(); if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("slug is invalid"); return slug; }
function splitList(value: string) { return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean); }
function isEmail(value: string) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value); }
