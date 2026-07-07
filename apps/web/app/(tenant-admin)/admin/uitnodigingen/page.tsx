import { createInvitationAction } from "@/lib/auth/actions";
import { roleLabels, tenantRoles } from "@/lib/auth/roles";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";

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

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Tenant admin</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Uitnodigingen</h1>
        <p className="mt-2 text-sm text-muted-foreground">Nodig instructeurs, teamleden en ouders uit voor {context.activeTenant?.name ?? "deze tenant"}.</p>
      </div>

      {sent ? <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">{delivery === "sent" ? "Uitnodiging is verzonden." : "Uitnodiging is aangemaakt; mailprovider is nog niet geconfigureerd."}</p> : null}
      {error ? <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Uitnodiging aanmaken is niet gelukt.</p> : null}

      <form action={createInvitationAction} className="rounded-xl border border-border bg-card p-5 shadow-card">
        <input name="next" type="hidden" value="/admin/uitnodigingen" />
        <input name="tenantSlug" type="hidden" value={tenantSlug} />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground" htmlFor="fullName">
              Naam
            </label>
            <input className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" id="fullName" name="fullName" type="text" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground" htmlFor="email">
              E-mail
            </label>
            <input className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" id="email" name="email" required type="email" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-semibold text-foreground" htmlFor="role">
              Rol
            </label>
            <select className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" id="role" name="role" required>
              {tenantInviteRoles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="mt-5 h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90" type="submit">
          Uitnodiging sturen
        </button>
      </form>
    </section>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
