"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ParentBadgeShareActions({ caption, imageUrl }: { caption: string; imageUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCaption() {
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function nativeShare() {
    if (navigator.share) {
      await navigator.share({ title: "Mijn NXTTRACK-badge", text: caption });
      return;
    }
    await copyCaption();
  }

  return <div className="flex flex-wrap gap-2">
    <Button onClick={nativeShare} type="button"><Share2 className="size-4" /> Delen</Button>
    <Button onClick={copyCaption} type="button" variant="outline">{copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Gekopieerd" : "Tekst kopiëren"}</Button>
    <a className="inline-flex min-h-10 items-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-muted" download="nxttrack-badge.svg" href={imageUrl}>Download</a>
  </div>;
}
