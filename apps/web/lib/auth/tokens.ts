import "server-only";

import { createHash, randomInt, randomBytes } from "node:crypto";

export function generateSixDigitCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function generateTemporaryPassword() {
  const prefix = randomBytes(9).toString("base64url");
  const suffix = randomInt(10, 99).toString();

  return `Nxt-${prefix}-${suffix}!`;
}

export function hashAuthCode(code: string, email: string) {
  const pepper = process.env.AUTH_CODE_PEPPER || process.env.SESSION_SECRET || process.env.JWT_SECRET;

  if (!pepper) {
    throw new Error("Password code hashing is not configured. Set AUTH_CODE_PEPPER, SESSION_SECRET, or JWT_SECRET.");
  }

  return createHash("sha256").update(`${pepper}:${email.trim().toLowerCase()}:${code}`).digest("hex");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
