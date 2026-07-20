import Link from "next/link";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { confirmPasswordResetAction } from "@/lib/auth/actions";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const email = getParam(params, "email") ?? "";
  const error = getParam(params, "error");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">NXTTRACK</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Nieuwe code invullen</h1>
        <p className="mt-2 text-sm text-muted-foreground">Vul de 6-cijferige code uit je e-mail in en kies een sterk wachtwoord.</p>

        {error ? <p className="mt-5 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">De code is ongeldig, verlopen of het wachtwoord is niet sterk genoeg.</p> : null}

        <form action={confirmPasswordResetAction} className="mt-6 space-y-4">
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
          <Field>
            <FieldLabel htmlFor="code">6-cijferige code</FieldLabel>
            <Input
              autoComplete="one-time-code"
              className="h-11 tracking-[0.3em]"
              id="code"
              inputMode="numeric"
              maxLength={6}
              minLength={6}
              name="code"
              pattern="[0-9]{6}"
              required
              type="text"
            />
          </Field>
          <PasswordStrengthMeter />
          <Field>
            <FieldLabel htmlFor="confirmPassword">Bevestig wachtwoord</FieldLabel>
            <Input
              autoComplete="new-password"
              className="h-11"
              id="confirmPassword"
              name="confirmPassword"
              required
              type="password"
            />
          </Field>
          <Button className="w-full" size="lg" type="submit">
            Wachtwoord wijzigen
          </Button>
        </form>

        <div className="mt-5 text-sm">
          <Link className="font-semibold text-primary hover:underline" href="/wachtwoord-vergeten">
            Nieuwe code aanvragen
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
