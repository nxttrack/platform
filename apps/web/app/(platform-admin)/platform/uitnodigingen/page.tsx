import { InvitationsTable } from "@/components/admin/resource-tables";
import { Button } from "@/components/ui/button";
import { DirtyForm } from "@/components/ui/dirty-form";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { createInvitationAction } from "@/lib/auth/actions";
import { platformRoles, roleLabels, tenantRoles } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const tenantInviteRoles = tenantRoles.filter((role) => role !== "athlete");

export default async function PlatformInvitationsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const sent = getParam(params, "sent") === "1";
  const delivery = getParam(params, "delivery");
  const error = getParam(params, "error");
  const admin = createAdminClient();
  const [invitationsResult, tenantsResult] = await Promise.all([
    admin.from("auth_invitations").select("id, email, tenant_id, role, status, delivery_status, expires_at, created_at").order("created_at", { ascending: false }).limit(500),
    admin.from("tenants").select("id, name")
  ]);
  const tenantById = new Map((tenantsResult.data ?? []).map((tenant) => [tenant.id, tenant.name]));

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Platform admin</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Uitnodigingen</h1>
        <p className="mt-2 text-sm text-muted-foreground">Maak platformgebruikers of organisatiegebruikers aan met een tijdelijk wachtwoord.</p>
      </div>

      <RouteFeedback success={sent ? delivery === "sent" ? "Uitnodiging is verzonden." : "Uitnodiging is aangemaakt; mailprovider is nog niet geconfigureerd." : null} error={error ? "Uitnodiging aanmaken is niet gelukt." : null} />

      <div className="grid gap-5 2xl:grid-cols-[minmax(320px,0.65fr)_minmax(0,1.85fr)]">
      <DirtyForm action={createInvitationAction} className="rounded-xl border border-border bg-card p-5 shadow-card">
        <input name="next" type="hidden" value="/platform/uitnodigingen" />
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="fullName">Naam</FieldLabel>
            <Input className="h-11" autoComplete="name" id="fullName" name="fullName" type="text" />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">E-mail</FieldLabel>
            <Input className="h-11" autoComplete="email" id="email" name="email" required type="email" />
          </Field>
          <Field>
            <FieldLabel htmlFor="role">Rol</FieldLabel>
            <NativeSelect className="h-11" id="role" name="role" required>
              <optgroup label="Platform">
                {platformRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Organisatie">
                {tenantInviteRoles.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </optgroup>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="tenantSlug">Organisatie slug</FieldLabel>
            <Input className="h-11" id="tenantSlug" name="tenantSlug" placeholder="waterlijn-demo" type="text" />
          </Field>
        </div>
        <Button className="mt-5" size="lg" type="submit">
          Uitnodiging sturen
        </Button>
      </DirtyForm>
      <div className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-card">
        <h2 className="mb-4 text-lg font-bold">Uitnodigingsregister</h2>
        <InvitationsTable platform rows={(invitationsResult.data ?? []).map((row) => ({
          createdAt: row.created_at,
          deliveryStatus: row.delivery_status,
          email: row.email,
          expiresAt: row.expires_at,
          id: row.id,
          role: roleLabels[row.role as keyof typeof roleLabels] ?? row.role,
          status: row.status,
          tenant: row.tenant_id ? tenantById.get(row.tenant_id) ?? "Onbekende organisatie" : "NXTTRACK platform"
        }))} />
      </div>
      </div>
    </section>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
