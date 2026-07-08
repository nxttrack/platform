import Link from "next/link";
import { loginAction } from "@/lib/auth/actions";
import { sanitizeRelativePath } from "@/lib/auth/redirects";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const errorMessages: Record<string, string> = {
  invalid_credentials: "E-mail of wachtwoord klopt niet.",
  forbidden: "Je account heeft geen toegang tot deze omgeving."
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const error = getParam(params, "error");
  const nextPath = sanitizeRelativePath(getParam(params, "next"), "/portaal");
  const resetDone = getParam(params, "reset") === "done";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">NXTTRACK</p>
          <h1 className="mt-2 text-2xl font-bold text-foreground">Inloggen</h1>
          <p className="mt-2 text-sm text-muted-foreground">Gebruik je NXTTRACK account voor het portaal, instructeursomgeving, backoffice of platformbeheer.</p>
        </div>

        {error ? <p className="mb-4 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{errorMessages[error] ?? "Inloggen is niet gelukt."}</p> : null}
        {resetDone ? <p className="mb-4 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Je wachtwoord is gewijzigd. Log opnieuw in.</p> : null}

        <form action={loginAction} className="space-y-4">
          <input name="next" type="hidden" value={nextPath} />
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground" htmlFor="email">
              E-mail
            </label>
            <input
              autoComplete="email"
              className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              id="email"
              name="email"
              required
              type="email"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground" htmlFor="password">
              Wachtwoord
            </label>
            <input
              autoComplete="current-password"
              className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              id="password"
              name="password"
              required
              type="password"
            />
          </div>
          <button className="h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90" type="submit">
            Inloggen
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm">
          <Link className="font-semibold text-primary hover:underline" href="/wachtwoord-vergeten">
            Wachtwoord vergeten
          </Link>
          <Link className="text-muted-foreground hover:text-foreground" href="/">
            Terug
          </Link>
        </div>
      </section>
    </main>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
