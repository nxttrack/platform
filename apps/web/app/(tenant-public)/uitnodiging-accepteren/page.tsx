import Link from "next/link";

import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { acceptInvitationAction } from "@/lib/auth/actions";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AcceptInvitationPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const error = getParam(params, "error");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">NXTTRACK</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Uitnodiging accepteren</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Vul je e-mailadres en de 8-cijferige code uit de uitnodigingsmail in. Heb je nog geen
          NXTTRACK-account, kies dan direct je eigen wachtwoord.
        </p>

        {error ? (
          <p className="mt-5 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
            De code is ongeldig, verlopen of het gekozen wachtwoord voldoet niet aan de eisen.
          </p>
        ) : null}

        <form action={acceptInvitationAction} className="mt-6 space-y-4">
          <Field>
            <FieldLabel htmlFor="email">E-mail</FieldLabel>
            <Input autoComplete="email" className="h-11" id="email" name="email" required type="email" />
          </Field>
          <Field>
            <FieldLabel htmlFor="code">8-cijferige uitnodigingscode</FieldLabel>
            <Input
              autoComplete="one-time-code"
              className="h-11 tracking-[0.25em]"
              id="code"
              inputMode="numeric"
              maxLength={8}
              minLength={8}
              name="code"
              pattern="[0-9]{8}"
              required
              type="text"
            />
          </Field>
          <PasswordStrengthMeter
            label="Nieuw wachtwoord — alleen voor een nieuw account"
            required={false}
          />
          <Field>
            <FieldLabel htmlFor="confirmPassword">Bevestig nieuw wachtwoord</FieldLabel>
            <Input
              autoComplete="new-password"
              className="h-11"
              id="confirmPassword"
              name="confirmPassword"
              type="password"
            />
            <FieldDescription>
              Heb je al een NXTTRACK-account? Laat beide wachtwoordvelden dan leeg.
            </FieldDescription>
          </Field>
          <Button className="w-full" size="lg" type="submit">
            Uitnodiging accepteren
          </Button>
        </form>

        <p className="mt-5 text-sm text-muted-foreground">
          Code verlopen? Vraag de beheerder om een nieuwe uitnodiging.{" "}
          <Link className="font-semibold text-primary hover:underline" href="/login">
            Terug naar login
          </Link>
        </p>
      </section>
    </main>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
