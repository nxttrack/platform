import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { createInvitationAction } from "@/lib/auth/actions";
import { platformRoles, roleLabels, tenantRoles } from "@/lib/auth/roles";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const tenantInviteRoles = tenantRoles.filter((role) => role !== "athlete");

export default async function PlatformInvitationsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const sent = getParam(params, "sent") === "1";
  const delivery = getParam(params, "delivery");
  const error = getParam(params, "error");

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Platform admin</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Uitnodigingen</h1>
        <p className="mt-2 text-sm text-muted-foreground">Maak platformgebruikers of organisatiegebruikers aan met een tijdelijk wachtwoord.</p>
      </div>

      {sent ? <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">{delivery === "sent" ? "Uitnodiging is verzonden." : "Uitnodiging is aangemaakt; mailprovider is nog niet geconfigureerd."}</p> : null}
      {error ? <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Uitnodiging aanmaken is niet gelukt.</p> : null}

      <form action={createInvitationAction} className="rounded-xl border border-border bg-card p-5 shadow-card">
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
            <Input className="h-11" id="tenantSlug" name="tenantSlug" placeholder="aquaswim-demo" type="text" />
          </Field>
        </div>
        <Button className="mt-5" size="lg" type="submit">
          Uitnodiging sturen
        </Button>
      </form>
    </section>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
