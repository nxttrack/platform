"use client";

import { Archive, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PortalDialog } from "../portal-dialog";
import { discoverPortalCollectionAction, loadPortalCollectionAction, savePortalCollectionAction } from "@/lib/domain/portal-collection-actions";
import type { PortalCollectionContext, PortalCollectionItem, PortalCollectionOffer, PortalCollectionView } from "@/lib/domain/portal-collection-contract";

export function PortalCollection(props: { context: PortalCollectionContext; themeKey: string; release: string; discoverable: boolean }) {
  return <ScopedCollection {...props} key={`${JSON.stringify(props.context)}:${props.themeKey}:${props.release}`} />;
}
function ScopedCollection({ context, themeKey, release, discoverable }: Parameters<typeof PortalCollection>[0]) {
  const alive = useRef(true), generation = useRef(0), request = useRef<string | null>(null);
  const collectionTrigger = useRef<HTMLButtonElement>(null), discoveryTrigger = useRef<HTMLButtonElement>(null), itemTrigger = useRef<HTMLButtonElement>(null);
  const [listOpen, setListOpen] = useState(false), [discoveryOpen, setDiscoveryOpen] = useState(false), [busy, setBusy] = useState(false);
  const [view, setView] = useState<PortalCollectionView | null>(null), [offer, setOffer] = useState<PortalCollectionOffer | null>(null), [selected, setSelected] = useState<PortalCollectionItem | null>(null);
  const [query, setQuery] = useState(""), [error, setError] = useState<string | null>(null), [saved, setSaved] = useState(false), [duplicate, setDuplicate] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current += 1; }; }, []);
  const unavailable = "De verbinding is onderbroken. Er is nog geen bevestiging; probeer opnieuw.";
  async function load() {
    const current = ++generation.current; setBusy(true); setError(null);
    try {
      const result = await loadPortalCollectionAction(context);
      if (!alive.current || current !== generation.current) return;
      if (result.ok) setView(result.value); else setError(result.message);
    } catch { if (alive.current && current === generation.current) setError(unavailable); }
    finally { if (alive.current && current === generation.current) setBusy(false); }
  }
  async function discover(retry = false) {
    const current = ++generation.current;
    if (!retry || !request.current) request.current = crypto.randomUUID();
    setBusy(true); setError(null); setDiscoveryOpen(true); setOffer(null); setSaved(false); setDuplicate(false);
    try {
      const result = await discoverPortalCollectionAction(context, themeKey, release, request.current);
      if (!alive.current || current !== generation.current) return;
      if (result.ok) { setOffer(result.value); setSaved(result.value.saved); } else setError(result.message);
    } catch { if (alive.current && current === generation.current) setError(unavailable); }
    finally { if (alive.current && current === generation.current) setBusy(false); }
  }
  async function save() {
    if (!offer || busy) return;
    const current = ++generation.current;
    setBusy(true); setError(null);
    try {
      const result = await savePortalCollectionAction(context, offer.id, true);
      if (!alive.current || current !== generation.current) return;
      if (!result.ok) { setError(result.message); return; }
      setSaved(true); setDuplicate(result.value.duplicate); setOffer({ ...offer, item: result.value.item, saved: true });
      // Read from persistent storage when the collection is opened again.
      setView(null);
    } catch { if (alive.current && current === generation.current) setError(unavailable); }
    finally { if (alive.current && current === generation.current) setBusy(false); }
  }
  const button = "min-h-11 rounded-xl border bg-background px-4 py-2 font-semibold disabled:opacity-50";
  return <>
    <button ref={collectionTrigger} type="button" aria-label="Mijn verzameling" onClick={() => { setListOpen(true); void load(); }}><Archive aria-hidden="true" /></button>
    {discoverable ? <button ref={discoveryTrigger} type="button" aria-label="Ontdek een vrije vondst" onClick={() => void discover()}><Sparkles aria-hidden="true" /></button> : null}
    <PortalDialog open={listOpen} onOpenChange={setListOpen} title="Mijn verzameling" description="Bewaarde vondsten uit jouw werelden. Ze staan los van onderdelen, badges en diploma’s." returnFocusRef={collectionTrigger}>
      <div className="space-y-4" data-portal-collection>
        {busy ? <p role="status">Verzameling laden…</p> : null}
        {error ? <div role="alert"><p>{error}</p><button type="button" className={button} onClick={() => void load()}>Opnieuw laden</button></div> : null}
        {view ? <><p>{view.items.length} {view.items.length === 1 ? "bewaarde vondst" : "bewaarde vondsten"}</p><label className="grid gap-2 font-semibold">Zoek in je verzameling<input type="search" className="min-h-11 rounded-xl border p-3" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} /></label>
          <ul className="grid grid-cols-2 gap-3">{view.items.filter((entry) => entry.title.toLocaleLowerCase("nl").includes(query.trim().toLocaleLowerCase("nl"))).map((entry) => <li key={entry.id}><button className="flex min-h-32 w-full flex-col items-center gap-2 rounded-xl border p-3 text-center" type="button" onClick={(event) => { itemTrigger.current = event.currentTarget; setSelected(entry); }}><CollectionArtwork item={entry} /><strong className="break-words">{entry.title}</strong><small>{date(entry.foundAt)}</small></button></li>)}</ul>
          {!view.items.length ? <p>Je verzameling is nog leeg. Een vrije vondst bewaren verandert je voortgang niet.</p> : !view.items.some((entry) => entry.title.toLocaleLowerCase("nl").includes(query.trim().toLocaleLowerCase("nl"))) ? <p>Geen vondst met deze naam.</p> : null}
          {!view.canWrite ? <p>Deze sessie kan de verzameling bekijken. Open kindmodus opnieuw vanuit je ouderaccount als je zelf wilt bewaren.</p> : null}</> : null}
      </div>
    </PortalDialog>
    <PortalDialog open={discoveryOpen} onOpenChange={(open) => { if (!busy) setDiscoveryOpen(open); }} title="Een kleine ontdekking" description="Een willekeurige vondst uit de huidige themapool. De vindplek bepaalt niet wat je vindt." returnFocusRef={discoveryTrigger} footer={<><button className={button} type="button" disabled={busy} onClick={() => setDiscoveryOpen(false)}>Verder ontdekken</button><button className={button} type="button" disabled={busy || !offer || saved} onClick={() => void save()}>{saved ? duplicate ? "Al in je verzameling" : "Bewaard in je verzameling" : "Bewaar in mijn verzameling"}</button></>}>
      <div className="space-y-4 text-center">{busy ? <p role="status">{offer ? "Bewaren bevestigen…" : "Een vondst openen…"}</p> : null}{offer ? <><CollectionArtwork item={offer.item} /><h3 className="text-xl font-bold">{offer.item.title}</h3><p>{saved ? duplicate ? "Deze vondst had je al. Je oorspronkelijke herinnering blijft behouden." : "Je vondst is opgeslagen en blijft na opnieuw inloggen beschikbaar." : "Een klein aandenken om te bewaren."}</p></> : null}<p>Deze vondst verandert geen beoordeling, badgeprestatie, overgang of diploma.</p>{error ? <div role="alert"><p>{error}</p>{!offer ? <button className={button} type="button" onClick={() => void discover(true)}>Opnieuw openen</button> : null}</div> : null}</div>
    </PortalDialog>
    <PortalDialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }} title={selected?.title ?? "Bewaarde vondst"} description="De oorspronkelijke afbeelding en titel van deze vondst blijven bewaard." returnFocusRef={itemTrigger}>
      {selected ? <div className="space-y-4 text-center"><CollectionArtwork item={selected} /><p>Gevonden op {date(selected.foundAt)}.</p><p>Een herinnering voor jou, los van je leerprestaties.</p></div> : null}
    </PortalDialog>
  </>;
}
function CollectionArtwork({ item }: { item: PortalCollectionItem }) {
  return item.assetUrl ? <img className="mx-auto h-24 w-24 object-contain" src={item.assetUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} /> : <Sparkles aria-hidden="true" className="mx-auto h-14 w-14 text-primary" />;
}
function date(value: string) { return Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value)) : "Datum niet vastgelegd"; }
