import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
          <Field>
            <FieldLabel htmlFor="email">E-mail</FieldLabel>
            <Input
              autoComplete="email"
              className="h-11"
              defaultValue={email}
              id="email"
              name="email"
              required
              type="email"
            />
          </Field>
          <Button className="w-full" size="lg" type="submit">
            Code versturen
          </Button>
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
