import "server-only";

import { createHash, randomBytes, randomInt } from "node:crypto";

export const slotOfferCookieName = "nxttrack.slot-offer";

export function generateOfferVerificationCode() {
  return randomInt(0, 100_000_000).toString().padStart(8, "0");
}

export function generateOfferSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashOfferVerificationCode(code: string, email: string) {
  return hashOfferSecret(`code:${email.trim().toLowerCase()}:${code}`);
}

export function hashOfferSessionToken(token: string) {
  return hashOfferSecret(`session:${token}`);
}

function hashOfferSecret(value: string) {
  const pepper = process.env.AUTH_CODE_PEPPER || process.env.SESSION_SECRET || process.env.JWT_SECRET;

  if (!pepper) {
    throw new Error("Offer token hashing is not configured. Set AUTH_CODE_PEPPER, SESSION_SECRET, or JWT_SECRET.");
  }

  return createHash("sha256").update(`${pepper}:slot-offer:${value}`).digest("hex");
}
