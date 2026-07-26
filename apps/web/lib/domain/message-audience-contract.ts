export type MessageAudience =
  | "tenant_staff"
  | "instructors"
  | "parents"
  | "all_tenant";

export type MessageVisibility = "internal" | "portal";

export function getMessageAudienceRoles(
  audience: MessageAudience,
  visibility: MessageVisibility
) {
  if (audience === "parents") {
    return visibility === "portal" ? ["parent"] : [];
  }

  if (audience === "instructors") {
    return ["instructor"];
  }

  if (audience === "all_tenant") {
    return visibility === "portal"
      ? [
          "tenant_owner",
          "tenant_admin",
          "tenant_staff",
          "instructor",
          "parent"
        ]
      : ["tenant_owner", "tenant_admin", "tenant_staff", "instructor"];
  }

  return ["tenant_owner", "tenant_admin", "tenant_staff", "instructor"];
}

export function isMessagePublicationConfirmed(
  status: string,
  confirmation: unknown
) {
  return status !== "published" || confirmation === "confirmed";
}

export function isMessageVisibilityPublishable(
  audience: MessageAudience,
  visibility: MessageVisibility
) {
  return audience !== "parents" || visibility === "portal";
}
