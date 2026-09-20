const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Raw fixture logins bypass the app's getTrustedAuthContext setup. Authenticate
// their exact token before reproducing that setup; never change rollout flags or
// reinterpret/revoke another session. Data queries still use the role's client.
export async function initializeParentRoleSession({ accessToken, expectedUserId, tenantId, verifyUser, initialize }) {
  let claims;
  try {
    const segments = accessToken.split(".");
    if (segments.length !== 3) throw new Error("Invalid token");
    claims = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("Parent role setup requires a valid fresh Auth access token.");
  }

  if (!uuidPattern.test(tenantId ?? "") || !uuidPattern.test(expectedUserId ?? "") ||
      !uuidPattern.test(claims?.session_id ?? "") || claims.sub !== expectedUserId) {
    throw new Error("Parent role setup has an invalid tenant/user/session binding.");
  }

  // Decoding above is only structural validation. Auth must authenticate this
  // same token before any privileged session initialization is permitted.
  const verified = await verifyUser(accessToken);
  if (verified.error || verified.data?.user?.id !== expectedUserId) {
    throw new Error("Parent role setup could not authenticate the expected fixture user.");
  }

  const result = await initialize("initialize_parent_portal_session_for_service", {
    p_session_id: claims.session_id,
    p_user_id: expectedUserId,
    p_tenant_id: tenantId
  });
  if (result.error || typeof result.data !== "boolean") {
    throw new Error("Parent role setup could not initialize the authenticated portal session.");
  }

  // A disabled split rollout returns false. Do not override that configuration;
  // subsequent RLS queries remain the authority on actual role visibility.
  return result.data;
}
