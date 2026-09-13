import type { SupabaseClient } from "@supabase/supabase-js";

type Membership = { group_id: string; starts_on: string; ends_on: string | null };
type Session = { id: string; group_id: string; resource_id: string | null; starts_at: string; ends_at: string; status: string };

export async function loadChildAgendaSessions(admin: SupabaseClient, tenantId: string, memberships: Membership[], timeZone: string, now = new Date()) {
  const visible: Session[] = [];
  if (!memberships.length) return { data: visible, error: null };
  const groupIds = [...new Set(memberships.map((membership) => membership.group_id))];
  // Bound the database scan around each placement. A one-day UTC margin
  // includes every tenant offset; exact inclusive local dates are checked below.
  const utcDayOffset = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString();
  const intervals = memberships.map((membership) => `and(group_id.eq.${membership.group_id},starts_at.gte.${utcDayOffset(membership.starts_on, -1)}${membership.ends_on ? `,starts_at.lt.${utcDayOffset(membership.ends_on, 2)}` : ""})`).join(",");
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const result = await admin.from("sessions")
      .select("id, group_id, resource_id, starts_at, ends_at, status")
      .eq("tenant_id", tenantId)
      .in("group_id", groupIds)
      .eq("status", "scheduled")
      .gte("ends_at", now.toISOString())
      .or(intervals)
      .order("starts_at")
      .order("id")
      .range(offset, offset + pageSize - 1)
      .returns<Session[]>();
    if (result.error) return { data: [], error: result.error };
    for (const session of result.data ?? []) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(session.starts_at)).map((part) => [part.type, part.value]));
      const localDate = `${parts.year}-${parts.month}-${parts.day}`;
      if (memberships.some((membership) => membership.group_id === session.group_id
        && membership.starts_on <= localDate && (!membership.ends_on || localDate <= membership.ends_on))) visible.push(session);
      if (visible.length === 24) return { data: visible, error: null };
    }
    if ((result.data?.length ?? 0) < pageSize) return { data: visible, error: null };
  }
}
