"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const instructorRoles = ["tenant_owner", "tenant_admin", "tenant_staff", "instructor"] as const;

export async function recordAttendanceAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireInstructorContext();
  const sessionId = requiredString(formData, "session_id");
  const groupId = optionalString(formData, "group_id");

  await throwOnError(
    supabase.from("session_attendance").upsert(
      {
        tenant_id: tenantId,
        session_id: sessionId,
        enrollment_id: requiredString(formData, "enrollment_id"),
        participant_id: requiredString(formData, "participant_id"),
        status: requiredEnum(formData, "status", ["present", "absent", "late", "excused"]),
        note: optionalString(formData, "note"),
        recorded_by_profile_id: profileId,
        recorded_at: new Date().toISOString()
      },
      { onConflict: "tenant_id,session_id,enrollment_id" }
    )
  );

  revalidateInstructorPortal({ groupId, participantId: optionalString(formData, "participant_id") });
}

export async function createProgressUpdateAction(formData: FormData) {
  const { supabase, tenantId } = await requireInstructorContext();

  await throwOnError(
    supabase.from("progress").insert({
      tenant_id: tenantId,
      enrollment_id: requiredString(formData, "enrollment_id"),
      stage_id: optionalString(formData, "stage_id"),
      status: requiredEnum(formData, "status", ["observed", "in_progress", "passed", "needs_attention"]),
      score: optionalScore(formData, "score"),
      note: optionalString(formData, "note"),
      assessed_at: new Date().toISOString()
    })
  );

  revalidateInstructorPortal({ groupId: optionalString(formData, "group_id"), participantId: optionalString(formData, "participant_id") });
}

export async function createStudentNoteAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireInstructorContext();

  await throwOnError(
    supabase.from("instructor_student_notes").insert({
      tenant_id: tenantId,
      participant_id: requiredString(formData, "participant_id"),
      enrollment_id: optionalString(formData, "enrollment_id"),
      note_type: requiredEnum(formData, "note_type", ["internal", "parent_visible", "compliment"]),
      body: requiredString(formData, "body"),
      author_profile_id: profileId,
      status: "active"
    })
  );

  revalidateInstructorPortal({ groupId: optionalString(formData, "group_id"), participantId: optionalString(formData, "participant_id") });
}

async function requireInstructorContext() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canUseInstructorPortal = context.activeTenant.roles.some((role) => instructorRoles.includes(role as (typeof instructorRoles)[number]));

  if (!canUseInstructorPortal) {
    throw new Error("Je hebt geen instructeursrechten voor deze tenant.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    supabase: await createClient(),
    tenantId: context.activeTenant.tenantId,
    profileId: context.user.id
  };
}

function revalidateInstructorPortal({ groupId, participantId }: { groupId?: string | null; participantId?: string | null } = {}) {
  for (const path of ["/instructor", "/instructor/agenda", "/instructor/groepen", "/instructor/leerlingen"]) {
    revalidatePath(path);
  }

  if (groupId) {
    revalidatePath(`/instructor/group/${groupId}`);
  }

  if (participantId) {
    revalidatePath(`/instructor/student/${participantId}`);
  }
}

async function throwOnError(builder: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await builder;

  if (error) {
    throw new Error(error.message);
  }
}

function requiredString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    throw new Error(`${key} is verplicht.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function requiredEnum<Allowed extends string>(formData: FormData, key: string, allowed: Allowed[]) {
  const value = requiredString(formData, key);

  if (!allowed.includes(value as Allowed)) {
    throw new Error(`${key} heeft een ongeldige waarde.`);
  }

  return value as Allowed;
}

function optionalScore(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("Score moet tussen 0 en 100 liggen.");
  }

  return parsed;
}
