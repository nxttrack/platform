export const badgeShareProviders = [
  "system",
  "whatsapp",
  "facebook",
  "instagram",
  "tiktok",
  "snapchat",
  "x"
] as const;

export type BadgeShareProvider = (typeof badgeShareProviders)[number];
export type BadgeShareCapability =
  | "native_file"
  | "native_text"
  | "provider_text_intent"
  | "download_copy_fallback";

export type BadgeShareProviderContract = {
  capability: BadgeShareCapability;
  label: string;
  promise: string;
  supportsImageAttachment: boolean | "runtime";
  supportsPublicationConfirmation: false;
};

/**
 * Browser capability contract for privacy-safe badge assets.
 *
 * Provider apps may change independently of NXTTRACK. The web client therefore
 * promises only what it can observe: a system hand-off, a text intent, or a
 * local download/copy fallback. It never reports that a provider published.
 */
export const badgeShareCapabilityMatrix = {
  system: {
    capability: "native_file",
    label: "Delen via apparaat",
    promise: "Deel het PNG-bestand via het systeemmenu als dit apparaat dat ondersteunt.",
    supportsImageAttachment: "runtime",
    supportsPublicationConfirmation: false
  },
  whatsapp: {
    capability: "provider_text_intent",
    label: "WhatsApp (tekst)",
    promise: "Open een WhatsApp-tekstconcept; voeg de afbeelding handmatig toe.",
    supportsImageAttachment: false,
    supportsPublicationConfirmation: false
  },
  facebook: {
    capability: "download_copy_fallback",
    label: "Facebook: download + kopieer",
    promise: "Download de afbeelding en kopieer de tekst voor handmatige plaatsing.",
    supportsImageAttachment: false,
    supportsPublicationConfirmation: false
  },
  instagram: {
    capability: "download_copy_fallback",
    label: "Instagram: download + kopieer",
    promise: "Download de afbeelding en kopieer de tekst voor handmatige plaatsing.",
    supportsImageAttachment: false,
    supportsPublicationConfirmation: false
  },
  tiktok: {
    capability: "download_copy_fallback",
    label: "TikTok: download + kopieer",
    promise: "Download de afbeelding en kopieer de tekst voor handmatige plaatsing.",
    supportsImageAttachment: false,
    supportsPublicationConfirmation: false
  },
  snapchat: {
    capability: "download_copy_fallback",
    label: "Snapchat: download + kopieer",
    promise: "Download de afbeelding en kopieer de tekst voor handmatige plaatsing.",
    supportsImageAttachment: false,
    supportsPublicationConfirmation: false
  },
  x: {
    capability: "provider_text_intent",
    label: "X (tekst)",
    promise: "Open een X-tekstconcept; voeg de afbeelding handmatig toe.",
    supportsImageAttachment: false,
    supportsPublicationConfirmation: false
  }
} as const satisfies Record<BadgeShareProvider, BadgeShareProviderContract>;

export function badgeProviderTextIntentUrl(
  provider: Extract<BadgeShareProvider, "whatsapp" | "x">,
  caption: string
) {
  const text = encodeURIComponent(caption);
  return provider === "whatsapp"
    ? `https://wa.me/?text=${text}`
    : `https://x.com/intent/post?text=${text}`;
}

export function safeBadgeShareFileName(value: string, format: "square" | "story") {
  const stem = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "zwembadge";
  return `${stem}-${format}.png`;
}
