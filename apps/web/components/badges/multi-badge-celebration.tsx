"use client";

import { Images, Sparkles } from "lucide-react";
import { useState } from "react";

import { ParentBadgeShareActions } from "@/components/badges/parent-badge-share-actions";
import { Button } from "@/components/ui/button";
import { generateBadgeShareAssetAction } from "@/lib/domain/badge-system-actions";
import { safeBadgeShareFileName } from "@/lib/domain/badge-share-capabilities";

export type MultiBadgeCelebrationItem = {
  awardId: string;
  badgeName: string;
  description: string | null;
  imageUrl: string | null;
  shareAsset: {
    caption: string;
    id: string;
    previewDataUrl: string;
  } | null;
};

export function MultiBadgeCelebration({
  items,
  nextPath
}: {
  items: MultiBadgeCelebrationItem[];
  nextPath: string;
}) {
  const [selectedAwardId, setSelectedAwardId] = useState(items[0]?.awardId ?? "");
  const selected = items.find((item) => item.awardId === selectedAwardId) ?? items[0];
  if (!selected || items.length < 2) return null;

  return <section className="overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-secondary/10 shadow-card">
    <div className="border-b border-primary/10 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
          <Sparkles className="size-5" />
        </span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Samen behaald</p>
          <h3 className="mt-1 text-xl font-bold">{items.length} badges in één viermoment</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Bekijk ze samen en kies daarna altijd één badge om afzonderlijk te delen.
          </p>
        </div>
      </div>
      <div aria-label="Kies een behaalde badge" className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist">
        {items.map((item) =>
          <button
            aria-selected={item.awardId === selected.awardId}
            className={`min-h-11 shrink-0 rounded-xl border px-4 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-ring ${
              item.awardId === selected.awardId
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted"
            }`}
            key={item.awardId}
            onClick={() => setSelectedAwardId(item.awardId)}
            role="tab"
            type="button"
          >
            {item.badgeName}
          </button>
        )}
      </div>
    </div>
    <div className="grid gap-5 p-5 sm:grid-cols-2">
      <div className="aspect-square overflow-hidden rounded-2xl border border-border bg-card">
        {selected.shareAsset?.previewDataUrl || selected.imageUrl
          ? <img
              alt={`Badge ${selected.badgeName}`}
              className="size-full object-cover"
              src={selected.shareAsset?.previewDataUrl ?? selected.imageUrl ?? ""}
            />
          : <span className="grid size-full place-items-center bg-primary/10 p-5 text-center text-lg font-bold text-primary">{selected.badgeName}</span>}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Geselecteerde badge</p>
        <h4 className="mt-1 text-2xl font-bold">{selected.badgeName}</h4>
        {selected.description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{selected.description}</p> : null}
        <div className="mt-4">
          {selected.shareAsset
            ? <ParentBadgeShareActions
                assetId={selected.shareAsset.id}
                caption={selected.shareAsset.caption}
                fileName={safeBadgeShareFileName(selected.badgeName, "square")}
                imageUrl={selected.shareAsset.previewDataUrl}
              />
            : <form action={generateBadgeShareAssetAction}>
                <input name="awardId" type="hidden" value={selected.awardId} />
                <input name="format" type="hidden" value="square" />
                <input name="humanConfirmation" type="hidden" value="confirmed" />
                <input name="next" type="hidden" value={nextPath} />
                <Button type="submit" variant="outline">
                  <Images className="size-4" /> Deelafbeelding voor deze badge maken
                </Button>
              </form>}
        </div>
      </div>
    </div>
  </section>;
}
