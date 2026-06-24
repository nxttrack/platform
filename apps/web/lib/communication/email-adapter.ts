export type EmailProvider = "smtp" | "sendgrid" | "internal";

export type PreparedEmailEnvelope = {
  provider: EmailProvider;
  liveSendEnabled: false;
  dispatchStatus: "draft" | "queued";
  note: string;
};

export function prepareEmailEnvelope(provider: EmailProvider, requestedStatus: "draft" | "queued"): PreparedEmailEnvelope {
  if (provider === "sendgrid") {
    return {
      provider,
      liveSendEnabled: false,
      dispatchStatus: "draft",
      note: "SendGrid API adapter is voorbereid, maar live verzending blijft uit totdat SMTP-first klopt."
    };
  }

  if (provider === "smtp") {
    return {
      provider,
      liveSendEnabled: false,
      dispatchStatus: requestedStatus,
      note: "SMTP via SendGrid is voorbereid als eerste verzendpad; een worker verstuurt later vanuit de outbox."
    };
  }

  return {
    provider,
    liveSendEnabled: false,
    dispatchStatus: requestedStatus,
    note: "In-app bericht is voorbereid zonder externe emailprovider."
  };
}
