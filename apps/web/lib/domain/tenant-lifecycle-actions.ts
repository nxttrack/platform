"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureInvitationAuthUser } from "@/lib/auth/invitations";
import { roleLabels } from "@/lib/auth/roles";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { generateInvitationCode, hashAuthCode } from "@/lib/auth/tokens";
import { renderInvitationEmail } from "@/lib/email/templates";
import { getTrustedRequestOrigin } from "@/lib/http/trusted-request-origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteMollieCustomer, MollieApiError } from "./mollie";
import type { MollieMode } from "./mollie-contract";
import { eraseTenantStorageObjects } from "@/lib/storage/tenant-erasure";
import { getThemeRelease } from "@/lib/theme/portal-theme-registry";

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
  const staff = [...new Set(splitList(readOptional(formData, "staffEmails") ?? "").map(normalizeEmail))].sort();
  const amountCents = Math.round(readPositiveNumber(formData, "monthlyAmount") * 100);
  const portalThemeSelection = readRequired(formData, "portalThemeRelease");
  const portalThemeSeparator = portalThemeSelection.lastIndexOf("@");
  const portalThemeKey = portalThemeSelection.slice(0, portalThemeSeparator);
  const portalThemeRelease = portalThemeSelection.slice(portalThemeSeparator + 1);

  if (!isEmail(ownerEmail) || staff.length === 0 || staff.some((email) => !isEmail(email)) || stageNames.length === 0 || hostname !== `${slug}.nxttrack.nl` || !getThemeRelease(portalThemeKey, portalThemeRelease)) {
    redirect("/platform/onboarding?error=validation");
  }

  const productName = readOptional(formData, "productName") ?? name;
  const primaryColor = readColor(formData, "primaryColor", "#1d4ed8").toLowerCase();
  const accentColor = readColor(formData, "accentColor", "#06b6d4").toLowerCase();
  const groupCapacity = readPositiveInteger(formData, "groupCapacity");
  const weekday = readPositiveInteger(formData, "weekday");
  const startTime = readRequired(formData, "startTime");
  const endTime = readRequired(formData, "endTime");
  const fingerprintInput = {
    accentColor,
    amountCents,
    customDomain,
    groupCapacity,
    groupName,
    hostname,
    locationName,
    name,
    ownerEmail,
    ownerName,
    poolName,
    portalThemeKey,
    portalThemeRelease,
    primaryColor,
    productName,
    programName,
    slug,
    staff,
    stageNames,
    startTime,
    endTime,
    weekday
  };
  const idempotencyKey = sha256(`tenant-provisioning:v1:${slug}`);
  const requestFingerprint = sha256(JSON.stringify(fingerprintInput));
  const acceptUrl = `${await getTrustedRequestOrigin()}/uitnodiging-accepteren`;
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1_000).toISOString();
  const invitations = [
    buildProvisioningInvitation({
      acceptUrl,
      businessKey: `owner:${ownerEmail}`,
      email: ownerEmail,
      expiresAt,
      fullName: ownerName,
      organizationName: name,
      role: "tenant_owner",
      tenantSlug: slug
    }),
    ...staff.map((email) => buildProvisioningInvitation({
      acceptUrl,
      businessKey: `staff:${email}`,
      email,
      expiresAt,
      fullName: staffDisplayName(email),
      organizationName: name,
      role: "instructor",
      tenantSlug: slug
    }))
  ];
  const provision = await admin.rpc("provision_tenant_atomic", {
    target_actor_user_id: context.user.id,
    target_idempotency_key: idempotencyKey,
    target_payload: { ...fingerprintInput, invitations },
    target_request_fingerprint: requestFingerprint
  });
  const provisionResult = parseProvisioningResult(provision.data);

  if (provision.error || !provisionResult) {
    redirect("/platform/onboarding?error=run");
  }
  if (!provisionResult.tenantId) {
    redirect(`/platform/onboarding?error=provisioning&run=${provisionResult.runId}`);
  }
  if (provisionResult.outcome !== "opened") {
    try {
      await materializeTenantOnboardingRun(context.user.id, provisionResult.runId);
    } catch {
      await admin.rpc("mark_tenant_provisioning_identity_attention", {
        target_actor_user_id: context.user.id,
        target_error_code: "auth_materialization_failed",
        target_run_id: provisionResult.runId
      });
      redirect(`/platform/onboarding?error=identity&run=${provisionResult.runId}`);
    }
  }

  revalidatePath("/platform");
  revalidatePath("/platform/onboarding");
  redirect(`/platform/onboarding?opened=1&run=${provisionResult.runId}`);
}

export async function resumeTenantProvisioningAction(formData: FormData) {
  const context = await requirePlatformAdministrator("/platform/onboarding");
  const runId = readRequired(formData, "runId");

  try {
    await materializeTenantOnboardingRun(context.user.id, runId);
  } catch {
    await createAdminClient().rpc("mark_tenant_provisioning_identity_attention", {
      target_actor_user_id: context.user.id,
      target_error_code: "auth_materialization_failed",
      target_run_id: runId
    });
    redirect(`/platform/onboarding?error=identity&run=${runId}`);
  }

  revalidatePath("/platform");
  revalidatePath("/platform/onboarding");
  redirect(`/platform/onboarding?opened=1&run=${runId}`);
}

type ProvisioningResult = {
  outcome: "attention_required" | "opened" | "ready";
  runId: string;
  tenantId: string | null;
};

async function materializeTenantOnboardingRun(actorUserId: string, runId: string) {
  const admin = createAdminClient();
  const invitationResult = await admin
    .from("auth_invitations")
    .select("id, email, identity_status, invited_user_id")
    .eq("provisioning_run_id", runId)
    .eq("status", "pending")
    .order("created_at");

  if (invitationResult.error || !invitationResult.data?.length) {
    throw new Error("Provisioning invitations are not available for identity materialization.");
  }

  for (const invitation of invitationResult.data) {
    const invitedUser = await ensureInvitationAuthUser({
      email: invitation.email,
      provisioningInvitationId: invitation.id
    });
    const materialized = await admin.rpc("materialize_tenant_onboarding_invitation", {
      target_actor_user_id: actorUserId,
      target_invitation_id: invitation.id,
      target_is_new_account: invitedUser.isNewAccount,
      target_run_id: runId,
      target_user_id: invitedUser.userId
    });

    if (materialized.error) {
      throw new Error("Provisioning identity database materialization failed.");
    }
  }

  const completed = await admin.rpc("complete_tenant_provisioning", {
    target_actor_user_id: actorUserId,
    target_run_id: runId
  });
  const completedResult = parseProvisioningResult(completed.data);

  if (completed.error || completedResult?.outcome !== "opened") {
    throw new Error("Tenant provisioning could not be opened after identity materialization.");
  }

  return completedResult;
}

function buildProvisioningInvitation(input: {
  acceptUrl: string;
  businessKey: string;
  email: string;
  expiresAt: string;
  fullName: string;
  organizationName: string;
  role: "instructor" | "tenant_owner";
  tenantSlug: string;
}) {
  const invitationCode = generateInvitationCode();
  const message = renderInvitationEmail({
    acceptUrl: input.acceptUrl,
    invitationCode,
    isNewAccount: null,
    organizationName: input.organizationName,
    roleLabel: roleLabels[input.role],
    tenantSlug: input.tenantSlug
  });

  return {
    businessKey: input.businessKey,
    codeHash: hashAuthCode(invitationCode, input.email),
    email: input.email,
    expiresAt: input.expiresAt,
    fullName: input.fullName,
    message: {
      ...message,
      organizationName: input.organizationName,
      templateKey: "auth_invitation"
    },
    role: input.role
  };
}

function parseProvisioningResult(value: unknown): ProvisioningResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const outcome = row.outcome;
  const runId = row.runId;
  const tenantId = row.tenantId;

  if (!["attention_required", "opened", "ready"].includes(String(outcome))) return null;
  if (typeof runId !== "string" || !isUuid(runId)) return null;
  if (tenantId !== null && (typeof tenantId !== "string" || !isUuid(tenantId))) return null;

  return {
    outcome: outcome as ProvisioningResult["outcome"],
    runId,
    tenantId: tenantId as string | null
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function staffDisplayName(email: string) {
  return email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "Instructeur";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
    export_manifest: { format: "nxttrack-tenant-export-v1", storageBuckets: ["tenant-documents", "diploma-vault", "participant-media", "badge-studio-assets"] },
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
