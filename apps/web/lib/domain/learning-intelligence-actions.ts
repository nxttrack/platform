"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getFormNextPath,
  requirePrivateShellContext
} from "@/lib/auth/server-guard";
import { classifyContent } from "@/lib/security/content-classification";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import {
  calculateDiplomaReadiness,
  detectAttendanceRisks,
  detectProgressBottlenecks,
  generateLessonFocusCards
} from "./learning-intelligence";

export async function createAttendanceFollowUpTaskAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/rapportages/leskwaliteit");
  const { tenant, userId } = await getAdminActionContext(nextPath);
  const participantId = readUuid(formData, "participantId", nextPath);
  const groupId = readUuid(formData, "groupId", nextPath);
  const signalType = readRequired(formData, "signalType", nextPath);
  const signal = (await detectAttendanceRisks(tenant.id)).find((row) =>
    row.participant_id === participantId &&
    row.group_id === groupId &&
    row.signal_type === signalType
  );
  if (!signal || signal.is_test) redirect(`${nextPath}?error=signal`);

  const description = [
    signal.reason,
    `Brondata: ${signal.evidence.join(" · ")}`,
    `Voorgestelde vervolgstap: ${signal.suggested_action}`,
    "Dit is een ondersteunend signaal. Uitschrijven, een plek intrekken of oudercontact versturen vereist altijd een afzonderlijke menselijke beoordeling."
  ].join("\n\n");
  const classification = classifyContent(
    { title: "Warme aanwezigheidscheck", description },
    "personal"
  );
  const result = await createAdminClient().from("tenant_tasks").insert({
    tenant_id: tenant.id,
    created_by_user_id: userId,
    related_participant_id: participantId,
    title: "Warme aanwezigheidscheck",
    description,
    priority: signal.risk_level === "high" ? "high" : "normal",
    status: "open",
    content_classification: classification.classification,
    classification_reasons: classification.reasons
  });
  if (result.error) redirect(`${nextPath}?error=task`);
  revalidateLearningPaths();
  redirect(`${nextPath}?saved=task`);
}

export async function createAttendanceContactDraftAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/rapportages/leskwaliteit");
  const { tenant, userId } = await getAdminActionContext(nextPath);
  const participantId = readUuid(formData, "participantId", nextPath);
  const groupId = readUuid(formData, "groupId", nextPath);
  const signalType = readRequired(formData, "signalType", nextPath);
  const signal = (await detectAttendanceRisks(tenant.id)).find((row) =>
    row.participant_id === participantId &&
    row.group_id === groupId &&
    row.signal_type === signalType
  );
  if (!signal || signal.is_test) redirect(`${nextPath}?error=signal`);

  const admin = createAdminClient();
  const [participantResult, guardiansResult] = await Promise.all([
    admin
      .from("participants")
      .select("display_name, guardian_user_id")
      .eq("tenant_id", tenant.id)
      .eq("id", participantId)
      .maybeSingle(),
    admin
      .from("participant_guardians")
      .select("guardian_user_id")
      .eq("tenant_id", tenant.id)
      .eq("participant_id", participantId)
      .eq("status", "active")
      .order("created_at")
      .limit(1)
  ]);
  if (participantResult.error || guardiansResult.error || !participantResult.data) {
    redirect(`${nextPath}?error=participant`);
  }
  const recipientId = participantResult.data.guardian_user_id ??
    guardiansResult.data?.[0]?.guardian_user_id ??
    null;
  const title = `Even afstemmen over ${participantResult.data.display_name}`;
  const body = [
    "Hallo,",
    `We willen graag even horen hoe het met ${participantResult.data.display_name} gaat en of het huidige lesmoment nog prettig aansluit.`,
    "Laat gerust weten of we ergens in kunnen meedenken. We kijken graag samen naar een passende vervolgstap.",
    "Met vriendelijke groet"
  ].join("\n\n");
  const classification = classifyContent({ title, body }, "personal");
  const result = await admin
    .from("participant_contact_drafts")
    .upsert({
      tenant_id: tenant.id,
      participant_id: participantId,
      recipient_user_id: recipientId,
      created_by_user_id: userId,
      title,
      body,
      source_type: "attendance_risk",
      source_fingerprint: attendanceFingerprint(participantId, groupId, signalType),
      status: "draft",
      content_classification: classification.classification,
      classification_reasons: classification.reasons,
      source: "learning_intelligence",
      is_test: false,
      journey_run_id: null
    }, { onConflict: "tenant_id,source_fingerprint", ignoreDuplicates: true });
  if (result.error) redirect(`${nextPath}?error=draft`);
  revalidateLearningPaths();
  redirect(`${nextPath}?saved=draft`);
}

export async function createBottleneckTaskAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/rapportages/leskwaliteit");
  const { tenant, userId } = await getAdminActionContext(nextPath);
  const groupId = readUuid(formData, "groupId", nextPath);
  const skillId = readUuid(formData, "skillId", nextPath);
  const bottleneck = await findCurrentBottleneck(tenant.id, groupId, skillId);
  if (!bottleneck || bottleneck.is_test) redirect(`${nextPath}?error=signal`);

  const description = [
    `Groepsfocus: ${bottleneck.suggested_lesson_focus}`,
    `${bottleneck.affected_count} van ${bottleneck.total_count} recente observaties vragen extra oefenruimte.`,
    ...bottleneck.reasons.map((reason) => `${reason.label}: ${reason.evidence}`),
    "Het signaal is bedoeld voor leskwaliteit en labelt geen individuele leerling."
  ].join("\n\n");
  const classification = classifyContent(
    { title: `Lesfocus: ${bottleneck.skill_label}`, description },
    "operational"
  );
  const result = await createAdminClient().from("tenant_tasks").insert({
    tenant_id: tenant.id,
    created_by_user_id: userId,
    title: `Lesfocus: ${bottleneck.skill_label}`,
    description,
    priority: bottleneck.stagnation_rate >= 0.6 ? "high" : "normal",
    status: "open",
    content_classification: classification.classification,
    classification_reasons: classification.reasons
  });
  if (result.error) redirect(`${nextPath}?error=task`);
  revalidateLearningPaths();
  redirect(`${nextPath}?saved=task`);
}

export async function addBottleneckLessonFocusAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/rapportages/leskwaliteit");
  const { tenant } = await getAdminActionContext(nextPath);
  const groupId = readUuid(formData, "groupId", nextPath);
  const skillId = readUuid(formData, "skillId", nextPath);
  const bottleneck = await findCurrentBottleneck(tenant.id, groupId, skillId);
  if (!bottleneck || bottleneck.is_test) redirect(`${nextPath}?error=signal`);

  const admin = createAdminClient();
  const sessionResult = await admin
    .from("sessions")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("group_id", groupId)
    .eq("status", "scheduled")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  if (sessionResult.error || !sessionResult.data) redirect(`${nextPath}?error=session`);

  await generateLessonFocusCards({
    tenantId: tenant.id,
    sessionId: sessionResult.data.id
  });
  const cardsResult = await admin
    .from("lesson_focus_cards")
    .select("id, participant_id, focus_points_json, status")
    .eq("tenant_id", tenant.id)
    .eq("session_id", sessionResult.data.id)
    .in("participant_id", bottleneck.participant_ids);
  if (cardsResult.error) redirect(`${nextPath}?error=focus`);

  for (const card of cardsResult.data ?? []) {
    const points = parsePoints(card.focus_points_json);
    const manual = {
      fingerprint: `manual:bottleneck:${skillId}`,
      source_type: "manual",
      source_id: skillId,
      label: bottleneck.suggested_lesson_focus,
      explanation: `Handmatig bevestigd vanuit groepssignaal met ${bottleneck.total_count} observaties.`
    };
    const nextPoints = [
      manual,
      ...points.filter((point) => point.fingerprint !== manual.fingerprint)
    ].slice(0, 3);
    const result = await admin
      .from("lesson_focus_cards")
      .update({
        focus_points_json: nextPoints,
        status: card.status === "treated" ? "treated" : "active",
        generated_at: new Date().toISOString()
      })
      .eq("tenant_id", tenant.id)
      .eq("id", card.id);
    if (result.error) redirect(`${nextPath}?error=focus`);
  }

  revalidateLearningPaths();
  redirect(`${nextPath}?saved=focus`);
}

export async function createReadinessPracticeTaskAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/afzwemmen");
  const { tenant, userId } = await getAdminActionContext(nextPath);
  const participantId = readUuid(formData, "participantId", nextPath);
  const programId = readUuid(formData, "programId", nextPath);
  const readiness = await calculateDiplomaReadiness({
    tenantId: tenant.id,
    participantId,
    programId
  });
  const description = [
    readiness.suggested_next_step,
    readiness.unstable_skills.length
      ? `Positieve oefenpunten:\n${readiness.unstable_skills.map((skill) => `- ${skill.skill_label}: ${skill.reason}`).join("\n")}`
      : "Geen specifiek instabiel oefenpunt zichtbaar; plan een brede proefbeoordeling.",
    `Zekerheid: ${readiness.confidence}. De instructeur of admin neemt altijd het uiteindelijke besluit.`
  ].join("\n\n");
  const classification = classifyContent(
    { title: "Oefentaak richting afzwemreview", description },
    "personal"
  );
  const result = await createAdminClient().from("tenant_tasks").insert({
    tenant_id: tenant.id,
    created_by_user_id: userId,
    related_participant_id: participantId,
    title: "Oefentaak richting afzwemreview",
    description,
    priority: "normal",
    status: "open",
    content_classification: classification.classification,
    classification_reasons: classification.reasons
  });
  if (result.error) redirect(`${nextPath}?error=task`);
  revalidateLearningPaths();
  redirect(`${nextPath}?saved=practice`);
}

export async function markLessonFocusTreatedAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor");
  const context = await requirePrivateShellContext("/instructor");
  const tenant = getActiveTenant(context);
  const cardId = readUuid(formData, "cardId", nextPath);
  const admin = createAdminClient();
  const cardResult = await admin
    .from("lesson_focus_cards")
    .select("id, session_id, participant_id, status")
    .eq("tenant_id", tenant.id)
    .eq("id", cardId)
    .maybeSingle();
  if (cardResult.error || !cardResult.data) redirect(`${nextPath}?error=focus`);
  if (!await canManageFocusCard({
    tenantId: tenant.id,
    userId: context.user.id,
    roles: context.activeTenant?.roles ?? [],
    sessionId: cardResult.data.session_id
  })) redirect(`${nextPath}?error=access`);

  const result = await admin
    .from("lesson_focus_cards")
    .update({
      status: "treated",
      treated_at: new Date().toISOString(),
      treated_by_user_id: context.user.id
    })
    .eq("tenant_id", tenant.id)
    .eq("id", cardId)
    .neq("status", "dismissed");
  if (result.error) redirect(`${nextPath}?error=focus`);
  revalidateLearningPaths();
  redirect(`${nextPath}?saved=focus`);
}

async function findCurrentBottleneck(
  tenantId: string,
  groupId: string,
  skillId: string
) {
  const signals = await detectProgressBottlenecks({
    tenantId,
    groupId,
    period: {
      from: new Date(Date.now() - 84 * dayMs).toISOString(),
      to: new Date().toISOString()
    }
  });
  return signals.find((row) => row.group_id === groupId && row.skill_id === skillId);
}

async function getAdminActionContext(nextPath: string) {
  const context = await requirePrivateShellContext("/admin");
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) =>
    ["tenant_owner", "tenant_admin", "tenant_staff"].includes(role)
  )) redirect(`${nextPath}?error=access`);
  return { tenant, userId: context.user.id };
}

async function canManageFocusCard(input: {
  tenantId: string;
  userId: string;
  roles: readonly string[];
  sessionId: string;
}) {
  if (input.roles.some((role) =>
    ["tenant_owner", "tenant_admin", "tenant_staff"].includes(role)
  )) return true;
  if (!input.roles.includes("instructor")) return false;
  const admin = createAdminClient();
  const sessionResult = await admin
    .from("sessions")
    .select("group_id")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.sessionId)
    .maybeSingle();
  if (sessionResult.error || !sessionResult.data) return false;
  const [sessionAssignment, groupAssignment] = await Promise.all([
    admin
      .from("session_instructor_assignments")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("session_id", input.sessionId)
      .eq("instructor_user_id", input.userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    admin
      .from("group_instructor_assignments")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("group_id", sessionResult.data.group_id)
      .eq("instructor_user_id", input.userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
  ]);
  return !!sessionAssignment.data || !!groupAssignment.data;
}

function parsePoints(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((point): point is {
    fingerprint: string;
    source_type: string;
    source_id: string | null;
    label: string;
    explanation: string;
  } => !!point && typeof point === "object" &&
    typeof point.fingerprint === "string" &&
    typeof point.label === "string" &&
    typeof point.explanation === "string");
}

function attendanceFingerprint(
  participantId: string,
  groupId: string,
  signalType: string
) {
  return `attendance:${participantId}:${groupId}:${signalType}`;
}

function readRequired(formData: FormData, key: string, nextPath: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) redirect(`${nextPath}?error=input`);
  return value;
}

function readUuid(formData: FormData, key: string, nextPath: string) {
  const value = readRequired(formData, key, nextPath);
  if (!uuidPattern.test(value)) redirect(`${nextPath}?error=input`);
  return value;
}

function revalidateLearningPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/rapportages");
  revalidatePath("/admin/rapportages/leskwaliteit");
  revalidatePath("/admin/rapportages/capaciteit");
  revalidatePath("/admin/afzwemmen");
  revalidatePath("/admin/taken");
  revalidatePath("/instructor");
  revalidatePath("/instructor/groepen");
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dayMs = 86_400_000;
