"use client";

import { useMemo, useState } from "react";
import { getPasswordStrength } from "@/lib/auth/password-policy";

type Props = {
  name?: string;
  label?: string;
  autoComplete?: string;
};

const labelMap = {
  te_zwak: "Te zwak",
  redelijk: "Redelijk",
  sterk: "Sterk"
};

export function PasswordStrengthMeter({ name = "password", label = "Nieuw wachtwoord", autoComplete = "new-password" }: Props) {
  const [password, setPassword] = useState("");
  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const width = `${Math.min(100, Math.round((strength.score / 6) * 100))}%`;
  const barColor = strength.label === "sterk" ? "bg-success" : strength.label === "redelijk" ? "bg-warning" : "bg-danger";

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-foreground" htmlFor={name}>
        {label}
      </label>
      <input
        autoComplete={autoComplete}
        className="h-11 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        id={name}
        name={name}
        onChange={(event) => setPassword(event.target.value)}
        required
        type="password"
      />
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width }} />
      </div>
      <p className="text-xs font-medium text-muted-foreground">{labelMap[strength.label]}</p>
      {strength.issues.length > 0 ? <p className="text-xs text-muted-foreground">{strength.issues[0]}</p> : null}
    </div>
  );
}
