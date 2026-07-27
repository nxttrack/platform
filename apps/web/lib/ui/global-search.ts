import "server-only";

import type { GlobalSearchItem } from "@/components/shell/global-command-palette";
import type { AuthenticatedTrustedAuthContext } from "@/lib/auth/trusted-context";
import { createAdminClient } from "@/lib/supabase/admin";

const resultLimit = 18;

export async function getAdminGlobalSearchItems(context: AuthenticatedTrustedAuthContext): Promise<GlobalSearchItem[]> {
  const tenantId = context.activeTenant?.tenantId;
  if (!tenantId) return [];
  const admin = createAdminClient();
  const [participants, groups, tasks, leads, memberships, threads] = await Promise.all([
    admin.from("participants").select("id, display_name, guardian_user_id, status").eq("tenant_id", tenantId).order("display_name").limit(resultLimit),
    admin.from("groups").select("id, name, code, status").eq("tenant_id", tenantId).order("name").limit(resultLimit),
    admin.from("tenant_tasks").select("id, title, priority, status").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(resultLimit),
    admin.from("intake_submissions").select("id, participant_name, parent_name, parent_email, status").eq("tenant_id", tenantId).order("received_at", { ascending: false }).limit(resultLimit),
    admin.from("tenant_memberships").select("user_id").eq("tenant_id", tenantId).eq("role", "parent").eq("status", "active").limit(resultLimit),
    admin.from("message_threads").select("id, subject, thread_type, status").eq("tenant_id", tenantId).order("last_message_at", { ascending: false, nullsFirst: false }).limit(resultLimit)
  ]);

  const parentIds = (memberships.data ?? []).map((row) => row.user_id);
  const profiles = parentIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", parentIds).limit(resultLimit)
    : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }> };

  return [
    ...(participants.data ?? []).map((row) => ({
      description: `Leerling · ${statusLabel(row.status)}`,
      group: "Leerlingen",
      href: `/admin/leerlingen?q=${encodeURIComponent(row.display_name)}`,
      keywords: ["leerling", "deelnemer", row.status],
      label: row.display_name
    })),
    ...(groups.data ?? []).map((row) => ({
      description: `Lesgroep${row.code ? ` · ${row.code}` : ""} · ${statusLabel(row.status)}`,
      group: "Groepen",
      href: `/admin/groepen?q=${encodeURIComponent(row.name)}`,
      keywords: ["groep", "les", row.code ?? "", row.status],
      label: row.name
    })),
    ...(profiles.data ?? []).map((row) => ({
      description: row.email ? `Ouder/verzorger · ${row.email}` : "Ouder/verzorger",
      group: "Ouders",
      href: `/admin/leerlingen?q=${encodeURIComponent(row.full_name || row.email || row.id)}`,
      keywords: ["ouder", "guardian", "verzorger", row.email ?? ""],
      label: row.full_name || row.email || "Ouder zonder naam"
    })),
    ...(tasks.data ?? []).map((row) => ({
      description: `${row.priority} · ${statusLabel(row.status)}`,
      group: "Taken",
      href: `/admin/taken?q=${encodeURIComponent(row.title)}`,
      keywords: ["taak", row.priority, row.status],
      label: row.title
    })),
    ...(leads.data ?? []).map((row) => ({
      description: `${row.parent_name} · ${row.parent_email} · ${statusLabel(row.status)}`,
      group: "Leads",
      href: `/admin/intake?q=${encodeURIComponent(row.participant_name)}`,
      keywords: ["lead", "intake", "aanmelding", row.parent_name, row.parent_email, row.status],
      label: row.participant_name
    })),
    ...(threads.data ?? []).map((row) => ({
      description: `${row.thread_type.replaceAll("_", " ")} · ${statusLabel(row.status)}`,
      group: "Berichten",
      href: `/admin/berichten?thread=${row.id}`,
      keywords: ["bericht", "gesprek", row.thread_type, row.status],
      label: row.subject
    }))
  ];
}

export async function getPlatformGlobalSearchItems(): Promise<GlobalSearchItem[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("tenants").select("id, name, slug, status, sector").order("name").limit(50);
  return (data ?? []).map((tenant) => ({
    description: `${tenant.slug} · ${statusLabel(tenant.status)}`,
    group: "Tenants",
    href: `/platform/organisaties/${tenant.id}`,
    keywords: ["tenant", "organisatie", tenant.slug, tenant.status, tenant.sector],
    label: tenant.name
  }));
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}
