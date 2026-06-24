import Link from "next/link";
import { redirect } from "next/navigation";

import { sanitizeLocalPath } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";
import { changePasswordAction } from "./actions";
import { PasswordChangeForm } from "./password-change-form";

type ChangePasswordPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage({ searchParams }: ChangePasswordPageProps) {
  const params = (await searchParams) ?? {};
  const next = sanitizeLocalPath(getParam(params.next));
  const error = getParam(params.error) ?? null;
  const reason = getParam(params.reason) ?? null;

  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      redirect(`/login?next=${encodeURIComponent("/auth/change-password")}`);
    }
  } catch (cause) {
    if (isRedirectError(cause)) {
      throw cause;
    }

    redirect(`/login?next=${encodeURIComponent("/auth/change-password")}&reason=not_configured`);
  }

  return (
    <main className="min-h-screen px-4 py-10 md:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">NXTTRACK security</p>
          <h2 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight text-foreground md:text-6xl">Eerst een eigen wachtwoord.</h2>
          <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
            Tijdelijke wachtwoorden zijn alleen bedoeld om de eerste toegang veilig te maken. Daarna gebruikt iedere admin een eigen wachtwoord met minimaal medium sterkte.
          </p>
          <Link className="mt-8 inline-flex rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold shadow-soft" href="/nxttrack">
            Terug naar NXTTRACK
          </Link>
        </section>
        <PasswordChangeForm action={changePasswordAction} next={next} error={error} reason={reason} />
      </div>
    </main>
  );
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isRedirectError(cause: unknown) {
  return typeof cause === "object" && cause !== null && "digest" in cause && String((cause as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT");
}
