import { InvitationsTable } from "@/components/admin/resource-tables";
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
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Backoffice</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Uitnodigingen</h1>
        <p className="mt-2 text-sm text-muted-foreground">Nodig instructeurs, teamleden en ouders uit voor {context.activeTenant?.name ?? "deze organisatie"}.</p>
      </div>

      <RouteFeedback success={sent ? delivery === "sent" ? "Uitnodiging is verzonden." : "Uitnodiging is aangemaakt; mailprovider is nog niet geconfigureerd." : null} error={error ? "Uitnodiging aanmaken is niet gelukt." : null} />

      <div className="grid gap-5 2xl:grid-cols-[minmax(320px,0.65fr)_minmax(0,1.85fr)]">
      <DirtyForm action={createInvitationAction} className="rounded-xl border border-border bg-card p-5 shadow-card">
        <input name="next" type="hidden" value="/admin/uitnodigingen" />
        <input name="tenantSlug" type="hidden" value={tenantSlug} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="fullName">Naam</FieldLabel>
            <Input className="h-11" autoComplete="name" id="fullName" name="fullName" type="text" />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">E-mail</FieldLabel>
            <Input className="h-11" autoComplete="email" id="email" name="email" required type="email" />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="role">Rol</FieldLabel>
            <NativeSelect className="h-11" id="role" name="role" required>
              {tenantInviteRoles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        <Button className="mt-5" size="lg" type="submit">
          Uitnodiging sturen
        </Button>
      </DirtyForm>
      <div className="min-w-0 rounded-xl border border-border bg-card p-5 shadow-card">
        <h2 className="mb-4 text-lg font-bold">Verzonden uitnodigingen</h2>
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
      </div>
      </div>
    </section>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
