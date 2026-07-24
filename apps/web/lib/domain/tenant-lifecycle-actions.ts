"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createInvitation } from "@/lib/auth/invitations";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getTrustedRequestOrigin } from "@/lib/http/trusted-request-origin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function provisionTenantAction(formData: FormData) {
  const context = await requirePlatformAdministrator("/platform/onboarding");
  const admin = createAdminClient();
  const name = readRequired(formData, "name");
  const slug = normalizeSlug(readRequired(formData, "slug"));
  const ownerEmail = normalizeEmail(readRequired(formData, "ownerEmail"));
  const ownerName = readRequired(formData, "ownerName");
  const hostname = readRequired(formData, "hostname").toLowerCase();
  const programName = readRequired(formData, "programName");
  const stageNames = splitList(readRequired(formData, "stageNames"));
  const locationName = readRequired(formData, "locationName");
  const poolName = readRequired(formData, "poolName");
  const groupName = readRequired(formData, "groupName");
  const staff = splitList(readOptional(formData, "staffEmails") ?? "").map(normalizeEmail);
  const amountCents = Math.round(readPositiveNumber(formData, "monthlyAmount") * 100);

  if (!isEmail(ownerEmail) || staff.some((email) => !isEmail(email)) || stageNames.length === 0) {
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
      kind: hostname.endsWith(".nxttrack.nl") ? "subdomain" : "custom_domain",
      status: hostname.endsWith(".nxttrack.nl") ? "verified" : "pending",
      is_primary: true
    }), "primary domain");
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
    const loginUrl = `${await getTrustedRequestOrigin()}/login?next=${encodeURIComponent("/admin")}`;
    await createInvitation({ actor: context, email: ownerEmail, fullName: ownerName, loginUrl, role: "tenant_owner", tenantSlug: slug });

    await admin.from("tenant_onboarding_runs").update({ current_step: "staff" }).eq("id", runId);
    for (const email of staff) {
      await createInvitation({ actor: context, email, loginUrl, role: "instructor", tenantSlug: slug });
    }

    const checklist = {
      branding: true,
      domain: hostname.endsWith(".nxttrack.nl"),
      group: true,
      location: true,
      ownerInvited: true,
      paymentPlan: true,
      programAndStages: true,
      staffInvited: staff.length > 0
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
