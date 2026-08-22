import { InvitationsTable } from "@/components/admin/resource-tables";
import { Button } from "@/components/ui/button";
import { DirtyForm } from "@/components/ui/dirty-form";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createInvitationAction } from "@/lib/auth/actions";
import { roleLabels, tenantRoles } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const tenantInviteRoles = tenantRoles.filter((role) => role !== "athlete");
const platformInviteRoles = ["platform_support", "platform_admin", "platform_owner"] as const;
const platformRoleDescriptions = {
  platform_support: "Alleen-lezen platformwerk; organisatie-inzage vereist tijdelijke goedkeuring.",
  platform_admin: "Beheert organisaties, accounts en platformconfiguratie zonder eigenaarstaken.",
  platform_owner: "Volledige platformtoegang, inclusief beveiligingsgevoelige eigenaarstaken."
} as const;

export default async function PlatformInvitationsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const sent = getParam(params, "sent") === "1";
  const delivery = getParam(params, "delivery");
  const error = getParam(params, "error");
  const invitationKind = getParam(params, "kind") === "tenant" ? "tenant" : "platform";
  const admin = createAdminClient();
  const [invitationsResult, tenantsResult] = await Promise.all([
    admin.from("auth_invitations").select("id, email, tenant_id, role, status, delivery_status, expires_at, created_at").order("created_at", { ascending: false }).limit(500),
    admin.from("tenants").select("id, name, slug").eq("status", "active").order("name")
  ]);
  const tenantById = new Map((tenantsResult.data ?? []).map((tenant) => [tenant.id, tenant.name]));

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Platform admin</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Uitnodigingen</h1>
        <p className="mt-2 text-sm text-muted-foreground">Nodig een NXTTRACK-teamlid of zwemschoolgebruiker uit met een veilige, tijdgebonden code.</p>
      </div>

      <RouteFeedback success={sent ? delivery === "accepted" ? "Uitnodiging is door de mailprovider geaccepteerd; aflevering is nog niet bevestigd." : "Uitnodiging is aangemaakt; mailtransport is uitgeschakeld of niet geconfigureerd." : null} error={error ? invitationErrorMessage(error) : null} />

      <div className="grid gap-5 2xl:grid-cols-[minmax(320px,0.65fr)_minmax(0,1.85fr)]">
      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div>
          <h2 className="text-lg font-bold">Nieuwe gebruiker</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Kies eerst waar de gebruiker toegang toe krijgt.</p>
        </div>
        <Tabs className="mt-5" defaultValue={invitationKind}>
          <TabsList aria-label="Type gebruiker">
            <TabsTrigger value="platform">NXTTRACK-team</TabsTrigger>
            <TabsTrigger value="tenant">Zwemschool</TabsTrigger>
          </TabsList>
          <TabsContent value="platform">
            <PlatformInvitationForm />
          </TabsContent>
          <TabsContent value="tenant">
            <TenantInvitationForm tenants={tenantsResult.data ?? []} />
          </TabsContent>
        </Tabs>
      </div>
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

function PlatformInvitationForm() {
  return (
    <DirtyForm action={createInvitationAction}>
      <InvitationIdentityFields idPrefix="platform" />
      <Field>
        <FieldLabel htmlFor="platformRole">Toegangsniveau</FieldLabel>
        <NativeSelect className="h-11" defaultValue="" id="platformRole" name="role" required>
          <option disabled value="">Kies een platformrol</option>
          {platformInviteRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
        </NativeSelect>
        <div className="grid gap-2 rounded-xl border border-border bg-muted/30 p-3">
          {platformInviteRoles.map((role) => (
            <p className="text-xs leading-5 text-muted-foreground" key={role}>
              <strong className="text-foreground">{roleLabels[role]}:</strong> {platformRoleDescriptions[role]}
            </p>
          ))}
        </div>
      </Field>
      <InvitationSubmitFields kind="platform" label="Platformuitnodiging sturen" />
    </DirtyForm>
  );
}

function TenantInvitationForm({ tenants }: { tenants: Array<{ id: string; name: string; slug: string }> }) {
  return (
    <DirtyForm action={createInvitationAction}>
      <Field>
        <FieldLabel htmlFor="tenantSlug">Organisatie</FieldLabel>
        <NativeSelect className="h-11" defaultValue="" id="tenantSlug" name="tenantSlug" required>
          <option disabled value="">Kies een zwemschool</option>
          {tenants.map((tenant) => <option key={tenant.id} value={tenant.slug}>{tenant.name}</option>)}
        </NativeSelect>
        <FieldDescription>De gebruiker krijgt alleen toegang tot deze organisatie.</FieldDescription>
      </Field>
      <InvitationIdentityFields idPrefix="tenant" />
      <Field>
        <FieldLabel htmlFor="tenantRole">Rol binnen de zwemschool</FieldLabel>
        <NativeSelect className="h-11" defaultValue="" id="tenantRole" name="role" required>
          <option disabled value="">Kies een organisatierol</option>
          {tenantInviteRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
        </NativeSelect>
      </Field>
      <InvitationSubmitFields kind="tenant" label="Organisatie-uitnodiging sturen" />
    </DirtyForm>
  );
}

function InvitationIdentityFields({ idPrefix }: { idPrefix: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}FullName`}>Naam</FieldLabel>
        <Input className="h-11" autoComplete="name" id={`${idPrefix}FullName`} name="fullName" required type="text" />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}Email`}>E-mail</FieldLabel>
        <Input className="h-11" autoComplete="email" id={`${idPrefix}Email`} name="email" required type="email" />
      </Field>
    </div>
  );
}

function InvitationSubmitFields({ kind, label }: { kind: "platform" | "tenant"; label: string }) {
  return (
    <>
      <input name="next" type="hidden" value="/platform/uitnodigingen" />
      <input name="invitationKind" type="hidden" value={kind} />
      <Button className="w-full" size="lg" type="submit">{label}</Button>
    </>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}

function invitationErrorMessage(value: string) {
  return ({
    forbidden: "Je hebt niet de juiste platformrechten om deze gebruiker uit te nodigen.",
    invalid_role: "Kies een geldig toegangsniveau.",
    platform_tenant_mismatch: "Een platformmedewerker kan niet aan één organisatie worden gekoppeld.",
    role_active: "Deze gebruiker heeft deze rol al. Kies een andere rol of beheer het bestaande account.",
    tenant_required: "Kies eerst een organisatie.",
    tenant_unavailable: "De gekozen organisatie bestaat niet of is niet actief."
  } as Record<string, string>)[value] ?? "Uitnodiging aanmaken is niet gelukt. Probeer het opnieuw of controleer het bestaande account.";
}
