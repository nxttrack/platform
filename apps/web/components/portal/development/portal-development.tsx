"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PortalDialog } from "../portal-dialog";
import { nodeStatus } from "../journey/portal-journey-scene";
import type { PortalDevelopmentItem, PortalDevelopmentView } from "@/lib/domain/portal-development-view";
import styles from "./portal-development.module.css";

export type DevelopmentChapter = { id: string; stageId: string; title: string; completedAt: string; badgeCount: number; themeRelease: string; items: readonly { id: string; label: string; rating: number | null }[]; available: boolean };
export type DevelopmentBadge = { id: string; title: string; date: string | null; description: string | null };
const initialFilters = { query: "", status: "all", sort: "curriculum", stage: "current", historyItem: "all", milestone: "all" };
const date = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value)) : "Datum niet vastgelegd";
const tabs = [{ id: "onderdelen", title: "Onderdelen" }, { id: "historie", title: "Historie" }, { id: "mijlpalen", title: "Mijlpalen" }] as const;

export function PortalDevelopment({ model, chapters, badges, contextKey, participantId, audience = "parent", canAsk = false, itemContent }: {
  model: PortalDevelopmentView; chapters: readonly DevelopmentChapter[]; badges: readonly DevelopmentBadge[];
  contextKey: string; participantId: string; audience?: "parent" | "child"; canAsk?: boolean;
  itemContent?: Readonly<Record<string, ReactNode>>;
}) {
  const params = useSearchParams(), router = useRouter(), pathname = usePathname();
  const [filters, setFilters] = useState(initialFilters), [restored, setRestored] = useState(false), [scaleOpen, setScaleOpen] = useState(false), [badgeId, setBadgeId] = useState<string | null>(null);
  const lastTrigger = useRef<HTMLElement | null>(null), fallback = useRef<HTMLHeadingElement>(null);
  const selectedId = params.get("onderdeel") ?? params.get("focus"), selected = !params.get("hoofdstuk") && (audience === "parent" || params.get("detail") === "1") ? model.items.find((item) => item.id === selectedId) ?? null : null;
  const chapter = audience === "parent" || params.get("detail") === "chapter" ? chapters.find((entry) => entry.id === params.get("hoofdstuk")) ?? null : null;
  const tab = chapter ? "mijlpalen" : tabs.some((entry) => entry.id === params.get("tab")) ? params.get("tab")! : "onderdelen";
  const badge = badges.find((entry) => entry.id === badgeId) ?? null;
  const storageKey = `nxttrack:development:${contextKey}`;
  useEffect(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null"); if (saved && typeof saved === "object") setFilters(Object.fromEntries(Object.entries(initialFilters).map(([key, value]) => [key, typeof saved[key] === "string" && saved[key].length <= 200 ? saved[key] : value])) as typeof initialFilters); } catch { /* Reading the portal never requires local storage. */ }
    setRestored(true);
  }, [storageKey]);
  useEffect(() => { if (restored) try { sessionStorage.setItem(storageKey, JSON.stringify(filters)); } catch { /* View preferences only. */ } }, [filters, restored, storageKey]);
  function query(change: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString()); if (audience === "parent") next.set("kind", participantId);
    for (const [key, value] of Object.entries(change)) if (value === null) next.delete(key); else next.set(key, value);
    return next.toString();
  }
  function navigate(change: Record<string, string | null>) { router.replace(`${pathname}?${query(change)}`, { scroll: false }); }
  function openItem(item: PortalDevelopmentItem, trigger: HTMLElement) { lastTrigger.current = trigger; navigate({ onderdeel: item.id, focus: null, hoofdstuk: null, detail: audience === "child" ? "1" : null }); }
  function closeDetail() { navigate({ onderdeel: audience === "child" ? params.get("onderdeel") : null, focus: null, hoofdstuk: audience === "child" ? params.get("hoofdstuk") : null, detail: null }); }
  function worldHref(item?: PortalDevelopmentItem, snapshot?: DevelopmentChapter) {
    const archived = snapshot ?? (item && !item.current ? chapters.find((entry) => entry.stageId === item.stageId) : null);
    if (item && !item.current && !archived) return null;
    if (archived && !archived.available) return null;
    const next = new URLSearchParams(audience === "parent" ? { kind: participantId } : {});
    if (item) next.set("onderdeel", item.id); if (archived) next.set("hoofdstuk", archived.id);
    return `${audience === "parent" ? "/portaal" : "/kind/reis"}?${next}`;
  }
  const rows = useMemo(() => model.items.filter((item) => (filters.stage === "all" || (filters.stage === "current" ? item.current : item.stageId === filters.stage))
    && (filters.status === "all" || (filters.status === "done" ? item.completed : filters.status === "open" ? item.rating === null : !item.completed && item.rating !== null))
    && `${item.label} ${item.description ?? ""}`.toLocaleLowerCase("nl").includes(filters.query.trim().toLocaleLowerCase("nl"))).sort((left, right) => filters.sort === "name" ? left.label.localeCompare(right.label, "nl") : filters.sort === "rating" ? (right.rating ?? -1) - (left.rating ?? -1) : filters.sort === "updated" ? (Date.parse(right.lastUpdatedAt ?? "") || 0) - (Date.parse(left.lastUpdatedAt ?? "") || 0) : 0), [model.items, filters]);
  const current = model.items.filter((item) => item.current), history = model.history.filter((entry) => filters.historyItem === "all" || entry.itemId === filters.historyItem);
  const selectedHistory = selected ? model.history.filter((entry) => entry.itemId === selected.id) : [];
  const milestones = [
    ...model.items.filter((item) => item.completed).map((item) => ({ id: `item:${item.id}`, title: item.label, date: item.completedAt, type: "skill", description: "Onderdeel behaald", item, chapter: null as DevelopmentChapter | null, badge: null as DevelopmentBadge | null })),
    ...chapters.map((entry) => ({ id: `chapter:${entry.id}`, title: entry.title, date: entry.completedAt, type: "chapter", description: "Afgerond hoofdstuk", item: null, chapter: entry, badge: null })),
    ...badges.map((entry) => ({ id: `badge:${entry.id}`, title: entry.title, date: entry.date, type: "personal", description: entry.description ?? "Een vastgelegd moment", item: null, chapter: null, badge: entry }))
  ].filter((entry) => filters.milestone === "all" || entry.type === filters.milestone).sort((left, right) => (Date.parse(right.date ?? "") || 0) - (Date.parse(left.date ?? "") || 0) || left.id.localeCompare(right.id));
  const worldLink = selected ? worldHref(selected) : null;
  return <div className={styles.content} data-development-tab={tab}>
    <h2 ref={fallback} tabIndex={-1} className="text-xl font-bold">{model.stageName ?? "Mijn ontwikkeling"}</h2>
    <div className={styles.summary} aria-label="Actuele onderdelen"><div><strong>{current.filter((item) => item.completed).length} / {current.length}</strong><span>Behaald</span></div><div><strong>{current.filter((item) => !item.completed && item.rating !== null).length}</strong><span>Aan het oefenen</span></div><div><strong>{current.filter((item) => item.rating === null).length}</strong><span>Nog niet beoordeeld</span></div></div>
    <nav className={styles.actions} aria-label="Ontwikkeling navigatie">{tabs.map((entry) => <Link className={styles.action} aria-current={tab === entry.id ? "page" : undefined} key={entry.id} href={`${pathname}?${query({ tab: entry.id, onderdeel: null, focus: null, hoofdstuk: null, detail: null })}`} scroll={false}>{entry.title}</Link>)}</nav>
    {tab === "onderdelen" ? <>
      <div className={styles.toolbar}><label>Zoek onderdelen<input type="search" value={filters.query} maxLength={200} onChange={(event) => setFilters({ ...filters, query: event.target.value })} /></label><label>Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="all">Alle statussen</option><option value="done">Behaald</option><option value="practice">Aan het oefenen</option><option value="open">Nog niet beoordeeld</option></select></label><label>Niveau<select value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value })}><option value="current">Huidige onderdelen</option><option value="all">Alle niveaus</option>{model.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label><label>Volgorde<select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value })}><option value="curriculum">Schoolvolgorde</option><option value="name">Onderdeelnaam</option><option value="rating">Beoordeling</option><option value="updated">Laatst beoordeeld</option></select></label></div>
      <div className={styles.actions}><span role="status">{rows.length} van {model.items.length} onderdelen</span><button type="button" className={styles.action} onClick={() => setFilters(initialFilters)}>Wis filters</button><button type="button" className={styles.action} onClick={(event) => { lastTrigger.current = event.currentTarget; setScaleOpen(true); }}>Beoordelingsschaal</button></div>
      {rows.length ? <table role="table" className={styles.table}><caption className="sr-only">Onderdelen, alleen-lezen beoordelingen</caption><thead role="rowgroup"><tr role="row"><th role="columnheader">Onderdeel</th><th role="columnheader">Beoordeling</th><th role="columnheader">Status</th><th role="columnheader">Laatst beoordeeld</th><th role="columnheader">Acties</th></tr></thead><tbody role="rowgroup">{rows.map((item) => <tr role="row" data-highlight={item.id === selectedId} data-development-skill={item.id} key={item.id}><td role="cell"><strong>{item.label}</strong><small>{item.description}</small>{!item.current ? <small>{item.stageName}</small> : null}</td><td role="cell" className={styles.score}>{item.rating === null ? "—" : `${item.rating} / 5`}</td><td role="cell">{nodeStatus(item)}</td><td role="cell">{item.lastUpdatedAt ? date(item.lastUpdatedAt) : "Nog geen beoordeling"}</td><td role="cell"><div className={styles.actions}><button type="button" className={styles.action} onClick={(event) => openItem(item, event.currentTarget)} aria-label={`Bekijk ${item.label}`}>Bekijk</button>{worldHref(item) ? <Link className={styles.action} href={worldHref(item)!}>In de reis</Link> : null}</div></td></tr>)}</tbody></table> : <p className={styles.empty}>{model.items.length ? "Geen onderdelen gevonden. Pas je zoekopdracht of filters aan." : "De school heeft nog geen onderdelen gekoppeld."}</p>}
      <p className={styles.note}>De schoolvolgorde en je persoonlijke reisvolgorde kunnen verschillen. De beoordelingen zijn dezelfde.</p>
    </> : tab === "historie" ? <>
      <div className={styles.toolbar}><h3 className="text-xl font-bold">Beoordelingen door de tijd</h3><label>Onderdeel<select value={filters.historyItem} onChange={(event) => setFilters({ ...filters, historyItem: event.target.value })}><option value="all">Alle onderdelen</option>{model.items.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label></div>
      <p className={styles.note}>Nieuwste beschikbare beoordeling eerst. Een gecorrigeerde of ingetrokken beoordeling is historie; de actuele score staat bij Onderdelen. Ontbrekende eerdere scores worden niet ingevuld.</p>
      <ol className={styles.history}>{history.map((entry) => <li key={entry.id} className={styles.event} data-status={entry.status}><div><time dateTime={entry.at}>{date(entry.at)}</time><h3 className="font-bold">{entry.label}</h3><p>{entry.status === "retracted" ? "Ingetrokken beoordeling" : entry.status === "corrected" ? "Vervangen door een correctie" : entry.correction ? "Correctie vastgelegd" : entry.current ? "Huidige beoordeling" : "Eerder vastgelegd"}</p>{entry.positiveLabel ? <p>{entry.positiveLabel}</p> : null}<button className={styles.action} type="button" onClick={(event) => { const item = model.items.find((item) => item.id === entry.itemId); if (item) openItem(item, event.currentTarget); }}>Onderdeel bekijken</button></div><span className={styles.score}>{entry.previousRating === null ? "" : `${entry.previousRating} → `}{entry.rating} / 5</span></li>)}</ol>
      {!history.length ? <p className={styles.empty}>Er is nog geen beoordelingshistorie beschikbaar voor deze selectie.</p> : null}
    </> : <>
      <div className={styles.toolbar}><h3 className="text-xl font-bold">Momenten om op terug te kijken</h3><label>Mijlpalen filteren<select value={filters.milestone} onChange={(event) => setFilters({ ...filters, milestone: event.target.value })}><option value="all">Alles</option><option value="skill">Onderdelen</option><option value="personal">Persoonlijk</option><option value="chapter">Hoofdstukken</option></select></label></div>
      <div className={styles.milestones}>{milestones.map((entry) => <article className={styles.milestone} key={entry.id}><time dateTime={entry.date ?? undefined}>{date(entry.date)}</time><h3>{entry.title}</h3><p>{entry.description}</p><button className={styles.action} type="button" onClick={(event) => { lastTrigger.current = event.currentTarget; if (entry.item) openItem(entry.item, event.currentTarget); else if (entry.chapter) navigate({ hoofdstuk: entry.chapter.id, onderdeel: null, focus: null, detail: audience === "child" ? "chapter" : null }); else if (entry.badge) setBadgeId(entry.badge.id); }}>Bekijken</button></article>)}</div>
      {!milestones.length ? <p className={styles.empty}>Hier verschijnen de vastgelegde momenten. Er worden geen mijlpalen vooraf ingevuld.</p> : null}
      <p className={styles.note}>Alle onderdelen behaald is geen diploma. Diploma’s en bewijzen vragen een afzonderlijke bevestiging. Vondsten in je verzameling tellen niet mee als leerprestatie.</p>
    </>}
    <PortalDialog open={!!selected} onOpenChange={(open) => { if (!open) closeDetail(); }} title={selected?.label ?? "Onderdeel"} description="De actuele beoordeling en beschikbare historie van dit onderdeel." returnFocusRef={lastTrigger.current ? lastTrigger : fallback} footer={<>{worldLink ? <Link className={styles.action} href={worldLink}>Bekijk in mijn reis</Link> : null}{canAsk && selected ? <Link className={styles.action} href={`/portaal/inbox?${new URLSearchParams({ kind: participantId, nieuw: "1", onderwerp: selected.label, onderdeel: selected.id })}`}>Vraag over dit onderdeel</Link> : null}</>}>
      {selected ? <div className={styles.detail}><p>{selected.description ?? "Dit onderdeel oefen je tijdens de les."}</p><dl><dt>Beoordeling</dt><dd>{selected.rating === null ? "Nog niet beoordeeld" : `${selected.rating} / 5`}</dd><dt>Status</dt><dd>{nodeStatus(selected)}</dd><dt>Behaald vanaf</dt><dd>{selected.masteryThreshold} / 5</dd><dt>Laatst beoordeeld</dt><dd>{date(selected.lastUpdatedAt)}</dd></dl>{selected.positiveLabel ? <p>{selected.positiveLabel}</p> : null}{itemContent?.[selected.id]}<h3 className="font-bold">Beschikbare historie</h3>{selectedHistory.length ? <ul>{selectedHistory.map((entry) => <li key={entry.id}>{date(entry.at)} · {entry.rating} / 5{entry.status === "corrected" ? " · gecorrigeerd" : entry.status === "retracted" ? " · ingetrokken" : ""}</li>)}</ul> : <p>Er zijn geen eerdere beoordelingen beschikbaar.</p>}</div> : null}
    </PortalDialog>
    <PortalDialog open={!!chapter} onOpenChange={(open) => { if (!open) closeDetail(); }} title={chapter?.title ?? "Hoofdstuk"} description="Een vaste herinnering aan het afrondingsmoment." returnFocusRef={lastTrigger.current ? lastTrigger : fallback} footer={chapter && worldHref(undefined, chapter) ? <Link className={styles.action} href={worldHref(undefined, chapter)!}>Bekijk eerdere wereld</Link> : null}>
      {chapter ? <div className={styles.detail}><p>Afgerond op {date(chapter.completedAt)} · {chapter.badgeCount} badges · vormgeving {chapter.themeRelease}</p>{chapter.items.length ? <ul>{chapter.items.map((item) => <li key={item.id}>{item.label} · {item.rating === null ? "Score niet vastgelegd" : `${item.rating} / 5`}</li>)}</ul> : <p>Afzonderlijke scores zijn niet vastgelegd in deze herinnering en worden niet aangevuld met huidige scores.</p>}{!chapter.available ? <p>De historische wereldbeelden zijn niet beschikbaar. Deze samenvatting blijft behouden.</p> : null}</div> : null}
    </PortalDialog>
    <PortalDialog open={!!badge} onOpenChange={(open) => { if (!open) setBadgeId(null); }} title={badge?.title ?? "Mijlpaal"} description="Een eerder vastgelegd moment." returnFocusRef={lastTrigger}>{badge ? <div className={styles.detail}><p>{date(badge.date)}</p><p>{badge.description ?? "Een mooie stap om te bewaren."}</p></div> : null}</PortalDialog>
    <PortalDialog open={scaleOpen} onOpenChange={setScaleOpen} title="Zo lees je de voortgang" description="De school bepaalt de voorwaarden per onderdeel." returnFocusRef={lastTrigger}><div className={styles.detail}><p>Een niet-beoordeeld onderdeel heeft geen score. Een beoordeling loopt van 1 tot en met 5; bij het onderdeel staat vanaf welke score het is behaald.</p><p>Voortgang en dekking komen uit het gekoppelde leerplan. Een thema verandert de weging, voorwaarden of diploma-afgifte niet.</p></div></PortalDialog>
  </div>;
}
