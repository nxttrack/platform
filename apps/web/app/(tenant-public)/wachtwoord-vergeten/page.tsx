import Link from "next/link";
import { requestPasswordResetAction } from "@/lib/auth/actions";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForgotPasswordPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const sent = getParam(params, "sent") === "1";
  const email = getParam(params, "email") ?? "";
  const error = getParam(params, "error");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">NXTTRACK</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Wachtwoord wijzigen</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ontvang een 6-cijferige code per e-mail om een nieuw wachtwoord te kiezen.</p>

        {sent ? <p className="mt-5 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Als dit e-mailadres bekend is, is de code verzonden.</p> : null}
        {error ? <p className="mt-5 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">De resetmail kan nu niet worden verstuurd.</p> : null}

        <form action={requestPasswordResetAction} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground" htmlFor="email">
              E-mail
            </label>
            <input
              autoComplete="email"
              className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              defaultValue={email}
              id="email"
              name="email"
              required
              type="email"
            />
          </div>
          <button className="h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90" type="submit">
            Code versturen
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm">
          <Link className="font-semibold text-primary hover:underline" href={`/wachtwoord-resetten${email ? `?email=${encodeURIComponent(email)}` : ""}`}>
            Ik heb een code
          </Link>
          <Link className="text-muted-foreground hover:text-foreground" href="/login">
            Terug naar login
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
