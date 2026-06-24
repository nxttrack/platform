import Link from "next/link";

type NoAccessPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const reasonCopy: Record<string, string> = {
  no_membership: "Je account heeft geen actieve membership voor deze omgeving.",
  role_not_allowed: "Je rol geeft geen toegang tot deze shell.",
  tenant_required: "Selecteer eerst een actieve tenant."
};

export default async function NoAccessPage({ searchParams }: NoAccessPageProps) {
  const params = (await searchParams) ?? {};
  const next = getParam(params.next) ?? "/auth/redirect";
  const reason = getParam(params.reason) ?? "role_not_allowed";

  return (
    <main className="min-h-screen px-4 py-10 md:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl flex-col justify-center">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Geen toegang</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">Deze omgeving is niet beschikbaar voor dit account.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{reasonCopy[reason] ?? reasonCopy.role_not_allowed}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow" href="/auth/redirect">
              Naar mijn omgeving
            </Link>
            <Link className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold" href={`/auth/tenant-switch?next=${encodeURIComponent(next)}`}>
              Tenant wisselen
            </Link>
            <Link className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold" href="/login">
              Ander account
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
