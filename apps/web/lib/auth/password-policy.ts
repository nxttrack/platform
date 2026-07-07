export type PasswordStrength = {
  score: number;
  label: "te_zwak" | "redelijk" | "sterk";
  issues: string[];
};

export function getPasswordStrength(password: string): PasswordStrength {
  const issues: string[] = [];
  let score = 0;

  if (password.length >= 12) {
    score += 2;
  } else {
    issues.push("Gebruik minimaal 12 tekens.");
  }

  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    issues.push("Gebruik minimaal een kleine letter.");
  }

  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    issues.push("Gebruik minimaal een hoofdletter.");
  }

  if (/\d/.test(password)) {
    score += 1;
  } else {
    issues.push("Gebruik minimaal een cijfer.");
  }

  if (/[^A-Za-z0-9]/.test(password)) {
    score += 1;
  } else {
    issues.push("Gebruik minimaal een symbool.");
  }

  return {
    score,
    label: score >= 6 ? "sterk" : score >= 4 ? "redelijk" : "te_zwak",
    issues
  };
}

export function assertStrongPassword(password: string, confirmPassword: string) {
  if (password !== confirmPassword) {
    throw new Error("De wachtwoorden komen niet overeen.");
  }

  const strength = getPasswordStrength(password);

  if (strength.score < 6) {
    throw new Error(strength.issues[0] ?? "Kies een sterker wachtwoord.");
  }
}

export function isSixDigitCode(value: string) {
  return /^\d{6}$/.test(value);
}
