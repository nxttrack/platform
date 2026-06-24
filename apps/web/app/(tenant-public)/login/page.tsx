import Link from "next/link";

import { signInAction } from "./actions";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const reasonCopy: Record<string, string> = {
  auth_required: "Log in om verder te gaan.",
  invalid_credentials: "Deze combinatie van e-mail en wachtwoord klopt niet.",
  missing_credentials: "Vul e-mail en wachtwoord in.",
  not_configured: "Supabase Auth is nog niet geconfigureerd voor deze omgeving."
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const next = getParam(params.next) ?? "/auth/redirect";
  const reason = getParam(params.reason);

  return (
    <main className="min-h-screen px-4 py-10 md:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">NXTTRACK toegang</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight text-foreground md:text-6xl">Log in op je persoonlijke omgeving.</h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">Ouders, instructeurs, tenantbeheerders en platformbeheerders loggen via dezelfde veilige toegang in. De rol en actieve organisatie bepalen daarna de omgeving.</p>
          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            {["Ouderportaal", "Trainer app", "Backoffice"].map((item) => (
              <div key={item} className="rounded-2xl border border-border bg-card p-4 text-sm font-semibold shadow-soft">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-6 shadow-card">
          <div className="mb-6">
            <p className="text-sm font-semibold text-muted-foreground">Inloggen</p>
            <h2 className="mt-1 text-2xl font-bold">Welkom terug</h2>
            {reason ? <p className="mt-2 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">{reasonCopy[reason] ?? "Controleer je toegang en probeer opnieuw."}</p> : null}
          </div>
          <form action={signInAction} className="space-y-4">
            <input name="next" type="hidden" value={next} />
            <label className="block">
              <span className="text-sm font-medium">E-mail</span>
              <input className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary/20 focus:ring-4" name="email" type="email" autoComplete="email" required />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Wachtwoord</span>
              <input className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary/20 focus:ring-4" name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-glow" type="submit">
              Inloggen
            </button>
          </form>
          <div className="mt-5 flex items-center justify-between text-sm text-muted-foreground">
            <Link className="hover:text-foreground" href="/nxttrack">
              NXTTRACK
            </Link>
            <Link className="hover:text-foreground" href="/">
              Terug naar website
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
