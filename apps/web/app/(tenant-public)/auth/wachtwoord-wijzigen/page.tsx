import { redirect } from "next/navigation";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { changePasswordAction } from "@/lib/auth/actions";
import { getDefaultRedirectForRoles, sanitizeRelativePath } from "@/lib/auth/redirects";
import { requireAuthenticatedContext } from "@/lib/auth/server-guard";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ForcePasswordChangePage({ searchParams }: PageProps) {
  const context = await requireAuthenticatedContext("/auth/wachtwoord-wijzigen");
  const params = (await searchParams) ?? {};
  const nextPath = sanitizeRelativePath(getParam(params, "next"), getDefaultRedirectForRoles(context.roles));
  const error = getParam(params, "error");

  if (!context.security.mustChangePassword) {
    redirect(nextPath);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">NXTTRACK</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Kies een nieuw wachtwoord</h1>
        <p className="mt-2 text-sm text-muted-foreground">Je tijdelijke wachtwoord moet eerst worden vervangen.</p>

        {error ? <p className="mt-5 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Kies een sterker wachtwoord en bevestig het opnieuw.</p> : null}

        <form action={changePasswordAction} className="mt-6 space-y-4">
          <input name="next" type="hidden" value={nextPath} />
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
            Wachtwoord opslaan
          </Button>
        </form>
      </section>
    </main>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
