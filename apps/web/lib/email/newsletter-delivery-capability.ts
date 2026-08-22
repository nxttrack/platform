export type NewsletterDeliveryCapability = {
  enabled: boolean;
  featureRequested: boolean;
  reason: "feature_disabled" | "sender_not_implemented" | "ready";
  senderImplemented: boolean;
};

// This must only become true in the same reviewed change that adds and verifies
// the actual newsletter sender. An environment flag alone can never claim a
// delivery capability that the application does not have.
const newsletterSenderImplemented = false;

export function getNewsletterDeliveryCapability(
  environment?: Readonly<{ NEWSLETTER_DELIVERY_ENABLED?: string }>
): NewsletterDeliveryCapability {
  const configuredValue = environment
    ? environment.NEWSLETTER_DELIVERY_ENABLED
    : process.env.NEWSLETTER_DELIVERY_ENABLED;
  const featureRequested = configuredValue?.trim().toLowerCase() === "true";
  const enabled = featureRequested && newsletterSenderImplemented;

  return {
    enabled,
    featureRequested,
    reason: enabled ? "ready" : featureRequested ? "sender_not_implemented" : "feature_disabled",
    senderImplemented: newsletterSenderImplemented
  };
}
