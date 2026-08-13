import "server-only";

import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthenticatedTrustedAuthContext } from "./trusted-context";
import {
  parsePortalSessionContext,
  type ChildPortalSessionContext,
  type PortalSessionContext
} from "./portal-session-contract";

export const resolvePortalSessionContext = cache(async (
  context: AuthenticatedTrustedAuthContext
): Promise<PortalSessionContext> => {
  if (!context.session?.id) return { mode: "parent" };
  const result = await createAdminClient().rpc("resolve_portal_session_for_service", {
    p_session_id: context.session.id,
    p_user_id: context.user.id
  });
  if (result.error) {
    console.error("[portal-session] Session context resolution failed", {
      code: result.error.code
    });
    throw new Error("Portal session context is temporarily unavailable");
  }
  const parsed = parsePortalSessionContext(result.data);
  if (!parsed) {
    console.error("[portal-session] Invalid session context contract");
    throw new Error("Portal session context is invalid");
  }
  return parsed;
});

export async function requireChildPortalSession(
  context: AuthenticatedTrustedAuthContext
): Promise<ChildPortalSessionContext> {
  const portalSession = await resolvePortalSessionContext(context);
  if (portalSession.mode !== "child") throw new Error("Active child portal session required");
  return portalSession;
}

export function createParentReauthToken() {
  return randomBytes(32).toString("base64url");
}

export function hashParentReauthToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function consumeParentReauthChallenge(input: {
  token: string;
  userId: string;
  newSessionId: string;
}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) return null;
  const result = await createAdminClient().rpc("consume_portal_reauth_challenge_for_service", {
    p_new_session_id: input.newSessionId,
    p_token_hash: hashParentReauthToken(input.token),
    p_user_id: input.userId
  });
  if (result.error) throw new Error("Parent reauthentication could not be completed");
  return typeof result.data === "string" && result.data.startsWith("/portaal")
    ? result.data as `/portaal${string}` | "/portaal"
    : null;
}
