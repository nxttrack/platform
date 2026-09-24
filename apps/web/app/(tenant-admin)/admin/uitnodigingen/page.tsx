import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminListSurface } from "@/components/admin/admin-patterns";
import { InvitationsTable } from "@/components/admin/resource-tables";
import { PageHeader } from "@/components/shell/ui";
import { Button } from "@/components/ui/button";
import { DirtyForm } from "@/components/ui/dirty-form";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { createInvitationAction } from "@/lib/auth/actions";
import { roleLabels, tenantRoles } from "@/lib/auth/roles";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const tenantInviteRoles = tenantRoles.filter((role) => role !== "athlete");

export default async function TenantInvitationsPage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/admin");
  const params = (await searchParams) ?? {};
  const sent = getParam(params, "sent") === "1";
  const delivery = getParam(params, "delivery");
  const error = getParam(params, "error");
  const tenantSlug = context.activeTenant?.slug ?? "";
  const tenantId = context.activeTenant?.tenantId;
  const admin = createAdminClient();
  const invitationsResult = tenantId
    ? await admin.from("auth_invitations").select("id, email, role, status, delivery_status, expires_at, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(250)
    : { data: [] };

  return (
    <section className="space-y-5">
      <PageHeader action={<AdminActionDrawer description="De ontvanger krijgt een tijdgebonden code en kiest bij een nieuw account een eigen wachtwoord." title="Account uitnodigen" triggerLabel="Uitnodiging sturen"><InvitationForm tenantSlug={tenantSlug} /></AdminActionDrawer>} kicker="Leerlingen" title="Uitnodigingen" subtitle={`Nodig instructeurs, teamleden en ouders uit voor ${context.activeTenant?.name ?? "deze organisatie"}.`} />

      <RouteFeedback success={sent ? delivery === "accepted" ? "Uitnodiging is door de mailprovider geaccepteerd; aflevering is nog niet bevestigd." : "Uitnodiging is aangemaakt; mailtransport is uitgeschakeld of niet geconfigureerd." : null} error={error ? "Uitnodiging aanmaken is niet gelukt." : null} />

      <AdminListSurface>
        <div className="mb-3"><h2 className="text-base font-bold">Verzonden uitnodigingen</h2><p className="text-[13px] text-muted-foreground">Controleer bezorging, status en vervaldatum vanuit het detailpaneel.</p></div>
        <InvitationsTable rows={(invitationsResult.data ?? []).map((row) => ({
          createdAt: row.created_at,
          deliveryStatus: row.delivery_status,
          email: row.email,
          expiresAt: row.expires_at,
          id: row.id,
          role: roleLabels[row.role as keyof typeof roleLabels] ?? row.role,
          status: row.status,
          tenant: context.activeTenant?.name ?? tenantSlug
        }))} />
      </AdminListSurface>
    </section>
  );
}

function InvitationForm({ tenantSlug }: { tenantSlug: string }) {
  return (
    <DirtyForm action={createInvitationAction} className="grid gap-4">
      <input name="next" type="hidden" value="/admin/uitnodigingen" />
      <input name="tenantSlug" type="hidden" value={tenantSlug} />
      <Field><FieldLabel htmlFor="fullName">Naam</FieldLabel><Input autoComplete="name" id="fullName" name="fullName" type="text" /></Field>
      <Field><FieldLabel htmlFor="email">E-mail</FieldLabel><Input autoComplete="email" id="email" name="email" required type="email" /></Field>
      <Field><FieldLabel htmlFor="role">Rol</FieldLabel><NativeSelect id="role" name="role" required>{tenantInviteRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</NativeSelect></Field>
      <Button type="submit">Uitnodiging sturen</Button>
    </DirtyForm>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
