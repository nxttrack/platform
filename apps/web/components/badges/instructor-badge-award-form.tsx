"use client";

import { Award, Check, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { badgeMatchesAudience, normalizeBadgeGender, resolveGenderedCopy, type BadgeAudience } from "@/lib/domain/badge-system-contract";
import { awardPremiumBadgeAction } from "@/lib/domain/badge-system-actions";
import { cn } from "@/lib/utils";

type BadgeOption = {
  id: string;
  kind: "catalog" | "custom";
  badgeKey: string;
  nameDefault: string;
  nameBoy: string | null;
  nameGirl: string | null;
  description: string;
  category: string;
  audience: BadgeAudience;
};

type Suggestion = {
  catalog_definition_id: string | null;
  custom_badge_id: string | null;
  suggestion_default: string;
  suggestion_boy: string | null;
  suggestion_girl: string | null;
  sort_order: number;
};

export function InstructorBadgeAwardForm({
  badges,
  directAward,
  nextPath,
  participantGender,
  participantId,
  suggestions
}: {
  badges: BadgeOption[];
  directAward: boolean;
  nextPath: string;
  participantGender: string;
  participantId: string;
  suggestions: Suggestion[];
}) {
  const gender = normalizeBadgeGender(participantGender);
  const available = useMemo(() => badges.filter((badge) => badgeMatchesAudience(gender, badge.audience)), [badges, gender]);
  const [selectedId, setSelectedId] = useState(available[0]?.id ?? "");
  const selected = available.find((badge) => badge.id === selectedId) ?? null;
  const resolvedSuggestions = useMemo(() =>
    suggestions
      .filter((suggestion) =>
        selected?.kind === "catalog"
          ? suggestion.catalog_definition_id === selected.id
          : suggestion.custom_badge_id === selected?.id
      )
      .slice(0, 3)
      .map((suggestion) =>
        resolveGenderedCopy(
          { default: suggestion.suggestion_default, boy: suggestion.suggestion_boy, girl: suggestion.suggestion_girl },
          gender
        )
      ),
    [gender, selected, suggestions]
  );
  const [message, setMessage] = useState("");

  if (!available.length) {
    return <p className="rounded-2xl border border-dashed border-border p-5 text-sm leading-6 text-muted-foreground">Er zijn voor deze leerling nog geen passende handmatige badges actief.</p>;
  }

  return <form action={awardPremiumBadgeAction} className="mt-4 grid gap-4">
    <input name="participantId" type="hidden" value={participantId} />
    <input name="next" type="hidden" value={nextPath} />
    <input name={selected?.kind === "custom" ? "customBadgeId" : "catalogDefinitionId"} type="hidden" value={selectedId} />
    <label className="grid gap-1.5 text-sm font-semibold">Complimentbadge
      <select className="h-11 rounded-xl border border-border bg-background px-3 font-normal" onChange={(event) => { setSelectedId(event.target.value); setMessage(""); }} value={selectedId}>
        {available.map((badge) => <option key={badge.id} value={badge.id}>{resolvedName(badge, gender)} · {categoryLabel(badge.category)}</option>)}
      </select>
    </label>
    {selected ? <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-aqua text-white"><Award className="size-5" /></span><div><p className="font-bold">{resolvedName(selected, gender)}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{selected.description}</p></div></div></div> : null}
    {resolvedSuggestions.length ? <fieldset><legend className="flex items-center gap-2 text-sm font-bold"><Sparkles className="size-4 text-primary" /> Drie positieve suggesties</legend><div className="mt-2 grid gap-2">{resolvedSuggestions.map((suggestion) => <button className={cn("rounded-xl border p-3 text-left text-sm leading-6 transition", message === suggestion ? "border-primary bg-primary/5" : "border-border bg-white hover:border-primary/30")} key={suggestion} onClick={() => setMessage(suggestion)} type="button">{message === suggestion ? <Check className="mr-2 inline size-4 text-primary" /> : null}{suggestion}</button>)}</div></fieldset> : null}
    <label className="grid gap-1.5 text-sm font-semibold">Persoonlijke boodschap<textarea className="min-h-24 rounded-xl border border-border p-3 font-normal" maxLength={1000} name="message" onChange={(event) => setMessage(event.target.value)} placeholder="Bewerk een suggestie of schrijf zelf een positief bericht." value={message} /></label>
    <label className="grid gap-1.5 text-sm font-semibold">Zichtbaarheid<select className="h-11 rounded-xl border border-border bg-background px-3 font-normal" defaultValue="parent_visible" name="visibility"><option value="parent_visible">Zichtbaar voor ouder</option><option value="internal">Alleen intern</option></select></label>
    <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4 text-sm leading-6"><input className="mt-1 size-4 accent-primary" name="humanConfirmation" required type="checkbox" value="confirmed" /><span><strong>Ik bevestig dit positieve moment.</strong><span className="block text-xs text-muted-foreground">{directAward ? "De badge wordt direct toegekend volgens tenantinstellingen." : "Een tenantadmin beoordeelt dit voorstel voordat het zichtbaar wordt."}</span></span></label>
    <Button type="submit"><Award className="size-4" /> {directAward ? "Badge toekennen" : "Ter goedkeuring indienen"}</Button>
  </form>;
}

function resolvedName(badge: BadgeOption, gender: ReturnType<typeof normalizeBadgeGender>) {
  return resolveGenderedCopy({ default: badge.nameDefault, boy: badge.nameBoy, girl: badge.nameGirl }, gender);
}
function categoryLabel(value: string) { return value.replaceAll("_", " "); }
