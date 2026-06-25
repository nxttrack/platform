"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const tenantWriteRoles = ["tenant_owner", "tenant_admin", "tenant_staff"] as const;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type GroupRow = {
  id: string;
  tenant_id: string;
  resource_id: string | null;
  instructor_id: string | null;
  name: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  status: string;
};

type SessionConflict = {
  id: string;
  group_id: string;
  starts_at: string;
  ends_at: string;
  resource_id: string | null;
  instructor_id: string | null;
};

export async function generateGroupSessionsAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const groupId = requiredString(formData, "group_id");
  const fromDate = requiredDate(formData, "from_date");
  const weeks = intValue(formData, "weeks", 4, 1, 16);
  const group = await getGroup(supabase, tenantId, groupId);
  const dates = sessionDatesForGroup(group, fromDate, weeks);
  let created = 0;
  let skipped = 0;

  for (const date of dates) {
    const startsAt = buildTimestamp(date, group.starts_at);
    const endsAt = buildTimestamp(date, group.ends_at);
    const conflict = await findSessionConflict(supabase, tenantId, {
      resourceId: group.resource_id,
      instructorId: group.instructor_id,
      startsAt,
      endsAt,
      excludeSessionId: null
    });

    if (conflict) {
      skipped += 1;
      continue;
    }

    const { error } = await supabase.from("sessions").upsert(
      {
        tenant_id: tenantId,
        group_id: group.id,
        resource_id: group.resource_id,
        instructor_id: group.instructor_id,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "scheduled"
      },
      { onConflict: "group_id,starts_at", ignoreDuplicates: true }
    );

    if (error) {
      throw new Error(error.message);
    }

    created += 1;
  }

  if (created === 0 && skipped > 0) {
    throw new Error(`Geen lessen aangemaakt: ${skipped} moment(en) hadden een resource- of instructeurconflict.`);
  }

  revalidatePlanning();
}

export async function createConflictCheckedSessionAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const groupId = requiredString(formData, "group_id");
  const group = await getGroup(supabase, tenantId, groupId);
  const startsAt = requiredDateTime(formData, "starts_at");
  const endsAt = requiredDateTime(formData, "ends_at");
  const resourceId = optionalString(formData, "resource_id") ?? group.resource_id;
  const instructorId = optionalString(formData, "instructor_id") ?? group.instructor_id;

  if (new Date(startsAt).getTime() >= new Date(endsAt).getTime()) {
    throw new Error("Eindtijd moet na starttijd liggen.");
  }

  const conflict = await findSessionConflict(supabase, tenantId, {
    resourceId,
    instructorId,
    startsAt,
    endsAt,
    excludeSessionId: null
  });

  if (conflict) {
    throw new Error("Deze les overlapt met een bestaande les voor dezelfde resource of instructeur.");
  }

  await throwOnError(
    supabase.from("sessions").insert({
      tenant_id: tenantId,
      group_id: groupId,
      resource_id: resourceId,
      instructor_id: instructorId,
      starts_at: startsAt,
      ends_at: endsAt,
      status: requiredEnum(formData, "status", ["scheduled", "completed", "cancelled"], "scheduled")
    })
  );

  revalidatePlanning();
}

export async function updateCatchUpRequestAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const requestId = requiredString(formData, "id");
  const status = requiredEnum(formData, "status", ["requested", "approved", "rejected", "cancelled", "used"], "approved");
  const note = optionalString(formData, "note");
  const request = await getCatchUpRequest(supabase, tenantId, requestId);

  await throwOnError(
    supabase
      .from("lesson_catch_up_requests")
      .update({
        status,
        resolved_at: status === "requested" ? null : new Date().toISOString()
      })
      .eq("tenant_id", tenantId)
      .eq("id", requestId)
  );

  await notifyGuardians(supabase, tenantId, request.participant_id, {
    participantId: request.participant_id,
    enrollmentId: request.enrollment_id,
    title: catchUpNotificationTitle(status),
    body: note ?? catchUpNotificationBody(status),
    notificationType: "catch_up"
  });

  revalidatePlanning();
}

async function requireTenantWriter() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canWrite = context.activeTenant.roles.some((role) => tenantWriteRoles.includes(role as (typeof tenantWriteRoles)[number]));

  if (!canWrite) {
    throw new Error("Je hebt geen rechten om planning te wijzigen.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    supabase: await createClient(),
    tenantId: context.activeTenant.tenantId
  };
}

async function getGroup(supabase: SupabaseClient, tenantId: string, groupId: string) {
  const { data, error } = await supabase
    .from("groups")
    .select("id, tenant_id, resource_id, instructor_id, name, weekday, starts_at, ends_at, status")
    .eq("tenant_id", tenantId)
    .eq("id", groupId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Groep niet gevonden.");
  }

  return data as GroupRow;
}

async function getCatchUpRequest(supabase: SupabaseClient, tenantId: string, requestId: string) {
  const { data, error } = await supabase
    .from("lesson_catch_up_requests")
    .select("id, participant_id, enrollment_id")
    .eq("tenant_id", tenantId)
    .eq("id", requestId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Inhaallesaanvraag niet gevonden.");
  }

  return data as { id: string; participant_id: string; enrollment_id: string };
}

async function findSessionConflict(
  supabase: SupabaseClient,
  tenantId: string,
  input: {
    resourceId: string | null;
    instructorId: string | null;
    startsAt: string;
    endsAt: string;
    excludeSessionId: string | null;
  }
) {
  if (!input.resourceId && !input.instructorId) {
    return null;
  }

  let query = supabase
    .from("sessions")
    .select("id, group_id, starts_at, ends_at, resource_id, instructor_id")
    .eq("tenant_id", tenantId)
    .in("status", ["scheduled", "completed"])
    .lt("starts_at", input.endsAt)
    .gt("ends_at", input.startsAt)
    .limit(20);

  if (input.excludeSessionId) {
    query = query.neq("id", input.excludeSessionId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? (data as SessionConflict[]) : [];

  return rows.find((row) => (input.resourceId && row.resource_id === input.resourceId) || (input.instructorId && row.instructor_id === input.instructorId)) ?? null;
}

async function notifyGuardians(
  supabase: SupabaseClient,
  tenantId: string,
  participantId: string,
  input: {
    participantId: string;
    enrollmentId: string;
    title: string;
    body: string;
    notificationType: "lesson" | "catch_up";
  }
) {
  const { data, error } = await supabase
    .from("participant_guardians")
    .select("profile_id")
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .eq("status", "active");

  if (error) {
    throw new Error(error.message);
  }

  const guardians = Array.isArray(data) ? (data as { profile_id: string }[]) : [];

  if (guardians.length === 0) {
    return;
  }

  await throwOnError(
    supabase.from("parent_notifications").insert(
      guardians.map((guardian) => ({
        tenant_id: tenantId,
        recipient_profile_id: guardian.profile_id,
        participant_id: input.participantId,
        enrollment_id: input.enrollmentId,
        title: input.title,
        body: input.body,
        notification_type: input.notificationType,
        status: "unread"
      }))
    )
  );
}

function sessionDatesForGroup(group: GroupRow, fromDate: string, weeks: number) {
  const dates: string[] = [];
  const cursor = new Date(`${fromDate}T12:00:00`);
  const wantedDay = group.weekday === 7 ? 0 : group.weekday;

  while (cursor.getDay() !== wantedDay) {
    cursor.setDate(cursor.getDate() + 1);
  }

  for (let index = 0; index < weeks; index += 1) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 7);
  }

  return dates;
}

function buildTimestamp(date: string, time: string) {
  const normalizedTime = time.slice(0, 5);

  return `${date}T${normalizedTime}:00`;
}

function catchUpNotificationTitle(status: string) {
  if (status === "approved") {
    return "Inhaalles goedgekeurd";
  }

  if (status === "rejected") {
    return "Inhaalles afgewezen";
  }

  if (status === "used") {
    return "Inhaalles gebruikt";
  }

  return "Inhaalles bijgewerkt";
}

function catchUpNotificationBody(status: string) {
  if (status === "approved") {
    return "De aanvraag voor een inhaalles is goedgekeurd. De zwemschool neemt contact op over het passende moment.";
  }

  if (status === "rejected") {
    return "De aanvraag voor een inhaalles is afgewezen. Neem contact op met de zwemschool bij vragen.";
  }

  if (status === "used") {
    return "De inhaalles is verwerkt.";
  }

  return "De status van de inhaallesaanvraag is bijgewerkt.";
}

function revalidatePlanning() {
  for (const path of ["/admin", "/admin/agenda", "/admin/sessions", "/admin/rapportages", "/admin/taken", "/parent/lessen", "/parent/notificaties", "/instructor", "/instructor/agenda", "/instructor/groepen"]) {
    revalidatePath(path);
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

function requiredEnum<Allowed extends string>(formData: FormData, key: string, allowed: Allowed[], fallback: Allowed) {
  const value = optionalString(formData, key) ?? fallback;

  if (!allowed.includes(value as Allowed)) {
    throw new Error(`${key} heeft een ongeldige waarde.`);
  }

  return value as Allowed;
}

function intValue(formData: FormData, key: string, fallback: number, min: number, max: number) {
  const value = optionalString(formData, key);
  const parsed = value ? Number.parseInt(value, 10) : fallback;

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} heeft geen geldige waarde.`);
  }

  return parsed;
}

function requiredDate(formData: FormData, key: string) {
  const value = requiredString(formData, key);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige datum.`);
  }

  return value;
}

function requiredDateTime(formData: FormData, key: string) {
  const value = requiredString(formData, key);

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige datum/tijd.`);
  }

  return value;
}
