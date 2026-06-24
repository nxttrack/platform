"use client";

import { CheckCircle2, EyeOff, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { assessPasswordStrength } from "@/lib/auth/password-policy";

type PasswordChangeFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  next: string;
  error: string | null;
  reason: string | null;
};

const errorCopy: Record<string, string> = {
  missing: "Vul beide wachtwoordvelden in.",
  mismatch: "De wachtwoorden zijn niet gelijk.",
  weak: "Kies minimaal medium sterkte: 10 tekens en minstens 3 soorten tekens.",
  update_failed: "Het wachtwoord kon niet worden bijgewerkt.",
  server_error: "De wachtwoordwissel kon niet volledig worden afgerond."
};

export function PasswordChangeForm({ action, next, error, reason }: PasswordChangeFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const strength = useMemo(() => assessPasswordStrength(password), [password]);
  const matches = confirmPassword.length === 0 || password === confirmPassword;
  const width = `${Math.min(100, Math.max(12, strength.score * 20))}%`;

  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-card">
      <div className="mb-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <p className="mt-4 text-sm font-semibold text-muted-foreground">Wachtwoord verplicht wijzigen</p>
        <h1 className="mt-1 text-2xl font-bold">Maak je definitieve wachtwoord.</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {reason === "admin_reset" ? "Je tijdelijke wachtwoord is opnieuw ingesteld." : "Je bent ingelogd met een tijdelijk wachtwoord."}
        </p>
        {error ? <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{errorCopy[error] ?? "Controleer je wachtwoord en probeer opnieuw."}</p> : null}
      </div>

      <form action={action} className="space-y-4">
        <input name="next" type="hidden" value={next} />
        <label className="block">
          <span className="text-sm font-medium">Nieuw wachtwoord</span>
          <input
            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary/20 focus:ring-4"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-muted-foreground">Sterkte</span>
            <span className={strength.accepted ? "text-xs font-semibold text-emerald-700" : "text-xs font-semibold text-amber-700"}>{strength.label}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className={strength.accepted ? "h-full rounded-full bg-emerald-500" : "h-full rounded-full bg-amber-500"} style={{ width }} />
          </div>
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <CheckItem active={strength.checks.length}>10 tekens</CheckItem>
            <CheckItem active={strength.checks.upper}>Hoofdletter</CheckItem>
            <CheckItem active={strength.checks.lower}>Kleine letter</CheckItem>
            <CheckItem active={strength.checks.number || strength.checks.symbol}>Cijfer of symbool</CheckItem>
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Herhaal wachtwoord</span>
          <input
            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary/20 focus:ring-4"
            name="confirm_password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </label>
        {!matches ? <p className="text-sm text-red-700">De wachtwoorden zijn nog niet gelijk.</p> : null}

        <button className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-glow" type="submit">
          <EyeOff className="h-4 w-4" />
          Wachtwoord opslaan
        </button>
      </form>
    </section>
  );
}

function CheckItem({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span className={active ? "inline-flex items-center gap-2 text-emerald-700" : "inline-flex items-center gap-2"}>
      <CheckCircle2 className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}
