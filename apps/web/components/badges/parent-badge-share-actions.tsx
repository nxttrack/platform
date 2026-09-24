"use client";

import { Check, Copy, Download, ExternalLink, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { recordBadgeShareEventAction } from "@/lib/domain/badge-system-actions";
import {
  badgeProviderTextIntentUrl,
  badgeShareCapabilityMatrix,
  type BadgeShareProvider
} from "@/lib/domain/badge-share-capabilities";

type ParentBadgeShareActionsProps = {
  assetId: string;
  caption: string;
  fileName: string;
  imageUrl: string;
};

export function ParentBadgeShareActions({
  assetId,
  caption,
  fileName,
  imageUrl
}: ParentBadgeShareActionsProps) {
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [sharing, setSharing] = useState(false);

  async function copyCaption(provider: BadgeShareProvider | "copy" = "copy") {
    await copyText(caption);
    setCopied(true);
    setMessage(provider === "copy" ? "Tekst gekopieerd." : "Afbeelding gedownload en tekst gekopieerd.");
    window.setTimeout(() => setCopied(false), 1800);
    if (provider === "copy") {
      void track("share_fallback", "copy", "download_copy_fallback");
    }
  }

  async function nativeShare() {
    if (sharing) return;
    setSharing(true);
    setMessage("");
    try {
      const file = await dataUrlToFile(imageUrl, fileName);
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await track("share_started", "system", "native_file");
        await navigator.share({
          files: [file],
          title: "Mijn NXTTRACK-badge",
          text: caption
        });
        await track("share_handed_off", "system", "native_file");
        setMessage("Het bestand is aan het systeemmenu overgedragen.");
        return;
      }
      if (navigator.share) {
        await track("share_started", "system", "native_text");
        await navigator.share({ title: "Mijn NXTTRACK-badge", text: caption });
        await track("share_handed_off", "system", "native_text");
        setMessage("De tekst is aan het systeemmenu overgedragen; download de afbeelding zo nodig apart.");
        return;
      }
      downloadImage();
      await copyCaption("system");
      await track("share_fallback", "system", "download_copy_fallback");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessage("Delen geannuleerd.");
      } else {
        setMessage("Systeemdelen is niet beschikbaar. Gebruik download en kopiëren.");
      }
    } finally {
      setSharing(false);
    }
  }

  function downloadImage() {
    const anchor = document.createElement("a");
    anchor.download = fileName;
    anchor.href = imageUrl;
    anchor.rel = "noopener";
    anchor.click();
    setMessage("PNG-afbeelding gedownload.");
    void track("downloaded", "download", "download");
  }

  function openTextIntent(provider: Extract<BadgeShareProvider, "whatsapp" | "x">) {
    const popup = window.open(
      badgeProviderTextIntentUrl(provider, caption),
      "_blank",
      "noopener,noreferrer"
    );
    setMessage(
      popup
        ? `${badgeShareCapabilityMatrix[provider].label} geopend. Voeg de PNG handmatig toe.`
        : "De browser blokkeerde het venster. Kopieer de tekst of gebruik het systeemmenu."
    );
    void track(
      popup ? "share_started" : "share_fallback",
      provider,
      "provider_text_intent"
    );
  }

  async function providerFallback(
    provider: Extract<BadgeShareProvider, "facebook" | "instagram" | "tiktok" | "snapchat">
  ) {
    downloadImage();
    try {
      await copyCaption(provider);
    } finally {
      void track("share_fallback", provider, "download_copy_fallback");
    }
  }

  async function track(
    eventType: "downloaded" | "share_started" | "share_fallback" | "share_handed_off",
    provider: BadgeShareProvider | "copy" | "download",
    capability: "native_file" | "native_text" | "provider_text_intent" | "download_copy_fallback" | "download"
  ) {
    try {
      await recordBadgeShareEventAction({ assetId, capability, eventType, provider });
    } catch {
      // Telemetry must never block a local or native share action.
    }
  }

  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <Button disabled={sharing} onClick={nativeShare} type="button">
        <Share2 className="size-4" /> {sharing ? "Openen…" : "Delen via apparaat"}
      </Button>
      <Button onClick={() => void copyCaption()} type="button" variant="outline">
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Gekopieerd" : "Tekst kopiëren"}
      </Button>
      <Button onClick={downloadImage} type="button" variant="outline">
        <Download className="size-4" /> PNG downloaden
      </Button>
    </div>
    <details className="rounded-2xl border border-border bg-muted/20 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Delen met een specifieke app</summary>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        NXTTRACK opent alleen wat de browser echt ondersteunt. Een overdracht is geen bevestiging dat iets is geplaatst.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["whatsapp", "x"] as const).map((provider) =>
          <Button key={provider} onClick={() => openTextIntent(provider)} size="sm" type="button" variant="outline">
            <ExternalLink className="size-3.5" /> {badgeShareCapabilityMatrix[provider].label}
          </Button>
        )}
        {(["facebook", "instagram", "tiktok", "snapchat"] as const).map((provider) =>
          <Button key={provider} onClick={() => void providerFallback(provider)} size="sm" type="button" variant="outline">
            <Download className="size-3.5" /> {badgeShareCapabilityMatrix[provider].label}
          </Button>
        )}
      </div>
    </details>
    <p aria-live="polite" className="min-h-5 text-xs leading-5 text-muted-foreground">{message}</p>
  </div>;
}

async function dataUrlToFile(dataUrl: string, fileName: string) {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("Badge asset could not be loaded.");
  return new File([await response.blob()], fileName, { type: "image/png" });
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Clipboard is not available.");
}
