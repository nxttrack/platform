"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePrivateShellContext } from "./server-guard";
import {
  createParentReauthToken,
  hashParentReauthToken,
  requireChildPortalSession
} from "./portal-session";
import {
  CHILD_PORTAL_CONTEXT_VERSION,
  parseChildPortalSessionContext
} from "./portal-session-contract";

const REAUTH_COOKIE = "nxttrack_parent_reauth";

export async function startChildPortalSessionAction(formData: FormData) {
  const context = await requirePrivateShellContext("/portaal/kinderen");
  const participantId = readUuid(formData, "participantId");
  const tenantId = context.activeTenant?.tenantId;
  const sessionId = context.session?.id;
  if (!participantId || !tenantId || !sessionId) {
    throw new Error("A session, tenant and child are required to enter child mode");
  }

  const result = await createAdminClient().rpc("start_child_portal_session_for_service", {
    p_context_version: CHILD_PORTAL_CONTEXT_VERSION,
    p_participant_id: participantId,
    p_session_id: sessionId,
    p_tenant_id: tenantId,
    p_user_id: context.user.id
  });
  if (result.error || !parseChildPortalSessionContext(result.data)) {
    console.error("[portal-session] Child mode activation failed", {
      code: result.error?.code ?? "invalid_context"
    });
    throw new Error("Child mode could not be activated");
  }
  redirect("/kind");
}

export async function returnToParentPortalAction() {
  const context = await requirePrivateShellContext("/kind");
  const childSession = await requireChildPortalSession(context);
  const reauthToken = createParentReauthToken();
  const issueResult = await createAdminClient().rpc("issue_portal_reauth_challenge_for_service", {
    p_old_session_id: childSession.sessionId,
    p_return_path: "/portaal",
    p_tenant_id: childSession.tenantId,
    p_token_hash: hashParentReauthToken(reauthToken),
    p_user_id: childSession.userId
  });
  if (issueResult.error) throw new Error("Parent reauthentication could not be started");

  const supabase = await createClient();
  const signOutResult = await supabase.auth.signOut({ scope: "local" });
  if (signOutResult.error) {
    throw new Error("The child session remains locked because sign-out did not complete");
  }

  const cookieStore = await cookies();
  cookieStore.set(REAUTH_COOKIE, reauthToken, {
    httpOnly: true,
    maxAge: 5 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  redirect("/login?next=%2Fportaal&reauth=required");
}

export async function readAndClearParentReauthCookie() {
  const cookieStore = await cookies();
  const value = cookieStore.get(REAUTH_COOKIE)?.value ?? null;
  if (value) cookieStore.delete(REAUTH_COOKIE);
  return value;
}

function readUuid(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}
