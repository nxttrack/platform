export type PasswordStrength = {
  score: number;
  label: "Zwak" | "Medium" | "Sterk";
  accepted: boolean;
  checks: {
    length: boolean;
    lower: boolean;
    upper: boolean;
    number: boolean;
    symbol: boolean;
  };
};

export function assessPasswordStrength(password: string): PasswordStrength {
  const checks = {
    length: password.length >= 10,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password)
  };
  const varietyScore = [checks.lower, checks.upper, checks.number, checks.symbol].filter(Boolean).length;
  const score = (checks.length ? 1 : 0) + varietyScore;
  const accepted = checks.length && varietyScore >= 3;

  return {
    score,
    label: accepted && score >= 5 ? "Sterk" : accepted ? "Medium" : "Zwak",
    accepted,
    checks
  };
}

export function createTemporaryPassword() {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);

  const randomPart = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");

  return `Nxt!${randomPart}7A`;
}
