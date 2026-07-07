import "server-only";

import { createHash, randomBytes } from "node:crypto";

export function generateOfferToken() {
  return randomBytes(32).toString("base64url");
}

export function hashOfferToken(token: string) {
  const pepper = process.env.AUTH_CODE_PEPPER || process.env.SESSION_SECRET || process.env.JWT_SECRET;

  if (!pepper) {
    throw new Error("Offer token hashing is not configured. Set AUTH_CODE_PEPPER, SESSION_SECRET, or JWT_SECRET.");
  }

  return createHash("sha256").update(`${pepper}:slot-offer:${token}`).digest("hex");
}
