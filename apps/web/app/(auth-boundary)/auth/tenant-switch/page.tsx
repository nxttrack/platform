import Link from "next/link";
import { redirect } from "next/navigation";

import { buildLoginPath, buildNoAccessPath, sanitizeLocalPath } from "@/lib/auth/redirects";
import { roleLabels } from "@/lib/auth/roles";
import { getTrustedAuthContext } from "@/lib/auth/server-context";

import { selectTenantAction } from "./actions";

type TenantSwitchPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function TenantSwitchPage({ searchParams }: TenantSwitchPageProps) {
  const params = (await searchParams) ?? {};
  const next = sanitizeLocalPath(getParam(params.next), "/auth/redirect");
  const context = await getTrustedAuthContext();

  if (context.status === "anonymous") {
    redirect(buildLoginPath(next));
  }

  if (context.tenants.length === 0) {
    redirect(buildNoAccessPath(next, "no_membership"));
  }

  return (
    <main className="min-h-screen px-4 py-10 md:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl flex-col justify-center">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Tenant kiezen</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">Kies met welke organisatie je wilt werken.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Deze keuze bepaalt de actieve organisatie voor ouderportaal, instructeur app en backoffice.</p>
          <div className="mt-6 grid gap-3">
            {context.tenants.map((tenant) => (
              <form key={tenant.tenantId} action={selectTenantAction}>
                <input name="next" type="hidden" value={next} />
                <input name="tenantId" type="hidden" value={tenant.tenantId} />
                <button className="flex w-full items-center justify-between rounded-2xl border border-border bg-background p-4 text-left transition hover:bg-muted" type="submit">
                  <span>
                    <span className="block text-sm font-semibold">{tenant.name}</span>
                    <span className="block text-xs text-muted-foreground">{tenant.slug}</span>
                  </span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{tenant.roles.map((role) => roleLabels[role]).join(", ")}</span>
                </button>
              </form>
            ))}
          </div>
          <Link className="mt-5 inline-flex rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold" href="/auth/redirect">
            Terug naar mijn omgeving
          </Link>
        </div>
      </section>
    </main>
  );
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
