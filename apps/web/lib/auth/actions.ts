"use server";

import { redirect } from "next/navigation";
import { acceptInvitation, createInvitation, InvitationAcceptanceError } from "./invitations";
import { confirmPasswordReset, changeAuthenticatedPassword, requestPasswordResetCode } from "./password-reset";
import { buildLoginRedirect, getDefaultRedirectForRoles, sanitizeRelativePath } from "./redirects";
import { isPlatformRole, isTenantRole, type AppRole } from "./roles";
import { resolveInvitationTenantSlug } from "./invitation-target";
import { createClient } from "@/lib/supabase/server";
import { getTrustedAuthContextForRequest, requireAuthenticatedContext, requirePrivateShellContext } from "./server-guard";
import { normalizeEmail } from "./tokens";
import { getTrustedRequestOrigin } from "@/lib/http/trusted-request-origin";
import { consumeParentReauthChallenge } from "./portal-session";
import { readAndClearParentReauthCookie } from "./portal-session-actions";

export async function loginAction(formData: FormData) {
  const nextPath = sanitizeRelativePath(formData.get("next"), "/portaal");
  const email = readString(formData, "email");
  const password = readString(formData, "password");
  let failed = false;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password
    });

    failed = !!error;
  } catch {
    failed = true;
  }

  if (failed) {
    redirect(buildLoginRedirect(nextPath, "invalid_credentials"));
  }

  const context = await getTrustedAuthContextForRequest();

  if (context.status === "anonymous") {
    redirect(buildLoginRedirect(nextPath, "invalid_credentials"));
  }

  if (context.security.mustChangePassword) {
    redirect(`/auth/wachtwoord-wijzigen?next=${encodeURIComponent(nextPath)}`);
  }

  const reauthToken = await readAndClearParentReauthCookie();
  if (reauthToken && context.session?.id) {
    const returnPath = await consumeParentReauthChallenge({
      newSessionId: context.session.id,
      token: reauthToken,
      userId: context.user.id
    });
    if (returnPath) redirect(returnPath);
  }

  redirect(nextPath === "/portaal" ? getDefaultRedirectForRoles(context.roles) : nextPath);
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = readString(formData, "email");
  const baseUrl = await getTrustedRequestOrigin();

  try {
    await requestPasswordResetCode({
      email,
      resetUrl: `${baseUrl}/wachtwoord-resetten`
    });
  } catch {
    redirect("/wachtwoord-vergeten?error=unavailable");
  }

  redirect("/wachtwoord-vergeten?sent=1");
}

export async function confirmPasswordResetAction(formData: FormData) {
  const email = readString(formData, "email");
  const code = readString(formData, "code");
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirmPassword");

  try {
    await confirmPasswordReset({
      email,
      code,
      password,
      confirmPassword
    });
  } catch {
    redirect("/wachtwoord-resetten?error=invalid_code");
  }

  redirect("/login?reset=done");
}

export async function acceptInvitationAction(formData: FormData) {
  const email = readString(formData, "email");
  const code = readString(formData, "code");
  const password = optionalString(formData, "password");
  const confirmPassword = optionalString(formData, "confirmPassword");

  try {
    await acceptInvitation({
      code,
      confirmPassword,
      email,
      password
    });
  } catch (error) {
    const reason = error instanceof InvitationAcceptanceError ? error.reason : "activation";

    if (reason === "activation") {
      console.error("[auth] Invitation activation failed.", {
        cause: error instanceof Error ? error.message : "unknown"
      });
    }

    redirect(`/uitnodiging-accepteren?error=${reason}`);
  }

  redirect("/login?invitation=accepted");
}

export async function changePasswordAction(formData: FormData) {
  const nextPath = sanitizeRelativePath(formData.get("next"), "/portaal");
  const context = await requireAuthenticatedContext("/auth/wachtwoord-wijzigen");
  const password = readString(formData, "password");
  const confirmPassword = readString(formData, "confirmPassword");

  try {
    await changeAuthenticatedPassword({
      userId: context.user.id,
      email: context.user.email,
      password,
      confirmPassword
    });
  } catch {
    redirect(`/auth/wachtwoord-wijzigen?next=${encodeURIComponent(nextPath)}&error=weak_password`);
  }

  redirect(nextPath);
}

export async function createInvitationAction(formData: FormData) {
  const returnPath = sanitizeRelativePath(formData.get("next"), "/platform/uitnodigingen");
  const guardPath = returnPath.startsWith("/admin") ? "/admin" : "/platform";
  const invitationKind = readString(formData, "invitationKind") === "tenant" ? "tenant" : "platform";
  const actor = await requirePrivateShellContext(guardPath);
  const email = readString(formData, "email");
  const fullName = optionalString(formData, "fullName");
  const role = readString(formData, "role") as AppRole;
  const tenantSlug = resolveInvitationTenantSlug({
    activeTenantSlug: actor.activeTenant?.slug,
    explicitTenantSlug: optionalString(formData, "tenantSlug"),
    shell: guardPath === "/admin" ? "admin" : "platform"
  });

  if (!isPlatformRole(role) && !isTenantRole(role)) {
    redirect(`${returnPath}?error=invalid_role&kind=${invitationKind}`);
  }

  let delivered = false;

  try {
    const result = await createInvitation({
      acceptUrl: `${await getTrustedRequestOrigin()}/uitnodiging-accepteren`,
      email,
      fullName,
      role,
      tenantSlug,
      actor
    });

    delivered = result.delivered;
  } catch (error) {
    redirect(`${returnPath}?error=${invitationErrorCode(error)}&kind=${invitationKind}`);
  }

  redirect(`${returnPath}?sent=1&delivery=${delivered ? "sent" : "skipped"}&kind=${invitationKind}`);
}

function invitationErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "Deze gebruiker heeft deze platformrol al." || message === "Deze gebruiker heeft deze tenantrol al.") {
    return "role_active";
  }

  if (message === "Kies een tenant voor tenantrollen.") return "tenant_required";
  if (message === "Deze tenant bestaat niet of is niet actief.") return "tenant_unavailable";
  if (message === "Platformrollen horen niet bij een tenant.") return "platform_tenant_mismatch";
  if (message.startsWith("Alleen ")) return "forbidden";

  return "invite_failed";
}

function readString(formData: FormData, field: string) {
  const value = formData.get(field);

  return typeof value === "string" ? value.trim() : "";
}

function optionalString(formData: FormData, field: string) {
  const value = readString(formData, field);

  return value === "" ? null : value;
}
