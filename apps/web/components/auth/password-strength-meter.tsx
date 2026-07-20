"use client";

import { useMemo, useState } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
  const scorePercent = Math.min(100, Math.round((strength.score / 6) * 100));
  const barColor = strength.label === "sterk" ? "bg-success" : strength.label === "redelijk" ? "bg-warning" : "bg-danger";
  const descriptionId = `${name}-strength-description`;

  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        aria-describedby={descriptionId}
        autoComplete={autoComplete}
        className="h-11"
        id={name}
        name={name}
        onChange={(event) => setPassword(event.target.value)}
        required
        type="password"
      />
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Wachtwoordsterkte" aria-valuemin={0} aria-valuemax={100} aria-valuenow={scorePercent}>
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width }} />
      </div>
      <FieldDescription id={descriptionId}><span className="font-medium">{labelMap[strength.label]}.</span>{strength.issues.length > 0 ? ` ${strength.issues[0]}` : " Het wachtwoord voldoet aan de eisen."}</FieldDescription>
    </Field>
  );
}
