"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FivePointAssessment } from "./five-point-assessment";
import { PortalDialog } from "@/components/portal/portal-dialog";
import { flushDraftWriters, registerDraftWriter } from "@/components/portal/draft-navigation";
import type { AssessmentRatingDisplay } from "@/lib/theme/portal-theme-contract";
import type { LearnerAssessmentValue } from "@/lib/domain/learner-assessment";
import { readInstructorAssessmentAction, saveInstructorAssessmentDraftAction, discardInstructorAssessmentDraftAction, finalizeInstructorAssessmentAction, publishChildComplimentAction } from "@/lib/domain/instructor-assessment-actions";
import type { InstructorAssessmentContext, InstructorAssessmentDraft, InstructorAssessmentInput, InstructorAssessmentResult, InstructorAssessmentView } from "@/lib/domain/instructor-assessment-contract";

type Input = Omit<InstructorAssessmentInput, "rating"> & { rating: number | null };
type ErrorResult = Extract<InstructorAssessmentResult<never>, { ok: false }>;
const empty: Input = { rating: null, visibility: "parent_visible", baseObservationId: null, correctionReason: "" };
const equal = (a: Input, b: Input) => a.rating === b.rating && a.visibility === b.visibility && a.baseObservationId === b.baseObservationId && a.correctionReason.trim() === b.correctionReason.trim();
const draftInput = (draft: InstructorAssessmentDraft): Input => ({ rating: draft.rating, visibility: draft.visibility, baseObservationId: draft.review_base_observation_id, correctionReason: draft.review_correction_reason ?? "" });
const unavailable: ErrorResult = { ok: false, code: "unavailable", message: "De verbinding is onderbroken. Je concept blijft staan; probeer opnieuw." };
type Props = { context: InstructorAssessmentContext; participantLabel: string; itemLabel: string; display: AssessmentRatingDisplay };
export function ReviewedAssessmentCard(props: Props) { return <ScopedAssessmentCard {...props} key={JSON.stringify(props.context)} />; }

function ScopedAssessmentCard({ context, participantLabel, itemLabel, display }: Props) {
  const router = useRouter(), mounted = useRef(true), generation = useRef(0);
  const [view, setView] = useState<InstructorAssessmentView | null>(null), [input, setInput] = useState<Input>(empty);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<InstructorAssessmentDraft | null>(null), [error, setError] = useState<ErrorResult | null>(null);
  const [badgePending, setBadgePending] = useState<InstructorAssessmentDraft | null>(null);
  const [review, setReview] = useState<InstructorAssessmentDraft | null>(null), [confirmed, setConfirmed] = useState(false);
  const [conflict, setConflict] = useState<InstructorAssessmentView | null>(null);
  const [complimentOpen, setComplimentOpen] = useState(false), [compliment, setCompliment] = useState(""), [complimentConfirmed, setComplimentConfirmed] = useState(false);
  const complimentOperation = useRef<string | null>(null), scoreTrigger = useRef<HTMLButtonElement>(null), complimentTrigger = useRef<HTMLButtonElement>(null);
  const latest = useRef(input), stored = useRef<Input>(empty), saved = useRef(draft), effectiveContext = useRef(context), pending = useRef<Promise<InstructorAssessmentDraft | null> | null>(null), conflictBlocked = useRef(false), locked = useRef(false);
  latest.current = input;
  const dirty = !equal(input, stored.current);
  const unsentCompliment = complimentOpen && compliment.length > 0;
  const unsentComplimentRef = useRef(unsentCompliment);
  unsentComplimentRef.current = unsentCompliment;
  function restore(value: InstructorAssessmentView) {
    const initial = value.draft ? draftInput(value.draft) : { ...empty, rating: value.current?.rating ?? null, visibility: value.current?.visibility ?? "parent_visible", baseObservationId: value.current?.id ?? null };
    effectiveContext.current = value.draft ? { ...context, sessionId: value.draft.review_session_id } : context;
    saved.current = value.draft; stored.current = initial; latest.current = initial; conflictBlocked.current = false;
    setDraft(value.draft); setView(value); setInput(initial); setError(null);
  }
  async function reload() {
    const request = ++generation.current; setLoading(true);
    try { const response = await readInstructorAssessmentAction(context); if (mounted.current && request === generation.current) { if (response.ok) restore(response.value); else setError(response); } }
    catch { if (mounted.current && request === generation.current) setError(unavailable); }
    finally { if (mounted.current && request === generation.current) setLoading(false); }
  }
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; generation.current += 1; }; }, []);
  async function persist(): Promise<InstructorAssessmentDraft | null> {
    if (pending.current) { const result = await pending.current; return result && !equal(latest.current, stored.current) ? persist() : result; }
    if (!view || locked.current || conflictBlocked.current || latest.current.rating === null) return null;
    if (equal(latest.current, stored.current) && saved.current) return saved.current;
    const snapshot = { ...latest.current } as InstructorAssessmentInput;
    setSaving(true);
    const work = (async () => {
      try {
        const result = await saveInstructorAssessmentDraftAction(effectiveContext.current, snapshot, saved.current?.draft_revision ?? 0);
        if (!result.ok) { conflictBlocked.current = result.code === "conflict"; if (mounted.current) setError(result); return null; }
        saved.current = result.value; stored.current = draftInput(result.value);
        if (mounted.current) { setDraft(result.value); setError(null); } return result.value;
      } catch { if (mounted.current) setError(unavailable); return null; }
    })();
    pending.current = work; const result = await work; pending.current = null; if (mounted.current) setSaving(false);
    return result && !equal(latest.current, stored.current) ? persist() : result;
  }
  const flush = useRef<() => Promise<boolean>>(async () => true);
  flush.current = async () => {
    if (unsentComplimentRef.current) {
      setError({ ok: false, code: "unavailable", message: "Je kindcompliment is nog niet gepubliceerd. Publiceer het bewust of sluit het venster en verwerp de tekst voordat je verdergaat." });
      return false;
    }
    return equal(latest.current, stored.current) && !pending.current ? true : Boolean(await persist());
  };
  useEffect(() => registerDraftWriter(() => flush.current(), () => unsentComplimentRef.current || !equal(latest.current, stored.current) || !!pending.current), []);
  useEffect(() => { if (!view || !dirty || busy || conflictBlocked.current) return; const timer = setTimeout(() => void persist(), 700); return () => clearTimeout(timer); }, [input, view, busy]);
  useEffect(() => {
    if (!dirty && !unsentCompliment) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const link = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.download || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href, location.href); if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      event.preventDefault(); event.stopImmediatePropagation(); void flushDraftWriters().then((ok) => { if (ok && mounted.current) router.push(`${url.pathname}${url.search}${url.hash}`); });
    };
    window.addEventListener("beforeunload", leave); document.addEventListener("click", link, true);
    return () => { window.removeEventListener("beforeunload", leave); document.removeEventListener("click", link, true); };
  }, [dirty, unsentCompliment, input, view]);
  async function openReview() { const result = await persist(); if (result) { setConfirmed(false); setReview(result); } }
  async function finalize() {
    if (!review || !confirmed || !equal(latest.current, draftInput(review))) return;
    locked.current = true; setBusy(true); setError(null);
    try {
      const result = await finalizeInstructorAssessmentAction(effectiveContext.current, review.id, review.draft_revision, review.client_operation_id, true);
      if (!result.ok) { setError(result); if (result.code === "conflict") conflictBlocked.current = true; return; }
      setBadgePending(result.value.badgeEvaluationPending ? review : null);
      saved.current = null; setDraft(null); setReview(null); await reload(); router.refresh();
    } catch { setError(unavailable); }
    finally { locked.current = false; setBusy(false); }
  }
  async function retryBadgeEvaluation() {
    if (!badgePending) return;
    setBusy(true);
    try {
      const result = await finalizeInstructorAssessmentAction(context, badgePending.id, badgePending.draft_revision, badgePending.client_operation_id, true);
      if (!result.ok) setError(result); else if (!result.value.badgeEvaluationPending) { setBadgePending(null); router.refresh(); }
    } catch { setError(unavailable); }
    finally { setBusy(false); }
  }
  async function inspectConflict() {
    setReview(null);
    try { const result = await readInstructorAssessmentAction(effectiveContext.current); if (result.ok) setConflict(result.value); else setError(result); } catch { setError(unavailable); }
  }
  function keepInput() {
    if (!conflict) return;
    saved.current = conflict.draft; stored.current = conflict.draft ? draftInput(conflict.draft) : empty;
    const value = { ...latest.current, baseObservationId: conflict.current?.id ?? null };
    latest.current = value; setInput(value); setView(conflict); setConflict(null); conflictBlocked.current = false; void persist();
  }
  async function discard() {
    locked.current = true; setBusy(true);
    try {
      if (pending.current) await pending.current;
      const record = saved.current;
      if (record) { const result = await discardInstructorAssessmentDraftAction(effectiveContext.current, record.id, record.draft_revision); if (!result.ok) { setError(result); return; } }
      await reload();
    } catch { setError(unavailable); }
    finally { locked.current = false; setBusy(false); }
  }
  async function publishCompliment() {
    if (!view?.current || !complimentConfirmed || !complimentOperation.current) return;
    setBusy(true); setError(null);
    try {
      const result = await publishChildComplimentAction(context, view.current.id, compliment, complimentOperation.current, true);
      if (!result.ok) { setError(result); return; }
      setCompliment(""); setComplimentOpen(false); await reload(); router.refresh();
    } catch { setError(unavailable); }
    finally { setBusy(false); }
  }
  const button = "min-h-11 rounded-xl border bg-background px-4 py-2 font-semibold disabled:opacity-50", primary = `${button} bg-primary text-primary-foreground`;
  if (loading) return <article className="rounded-xl border p-4" aria-busy="true"><h3 className="font-bold">{itemLabel}</h3><p role="status">Beoordeling laden…</p></article>;
  if (!view) return <article className="rounded-xl border p-4"><h3 className="font-bold">{itemLabel}</h3><p role="alert">{error?.message}</p><button className={button} type="button" onClick={() => void reload()}>Opnieuw laden</button></article>;
  return <article className="space-y-4 rounded-xl border bg-card p-4" data-assessment-card={context.itemId}>
    <header><h3 className="font-bold">{view.item.name}</h3>{view.item.description ? <p className="text-sm text-muted-foreground">{view.item.description}</p> : null}<p className="mt-2 text-sm">Opgeslagen: <strong>{view.current ? `${view.current.rating} / 5` : "Nog niet beoordeeld"}</strong> · Behaald vanaf {view.item.masteryThreshold} / 5</p></header>
    <fieldset disabled={busy} className="grid min-w-0 gap-4 md:grid-cols-2">
      <FivePointAssessment display={display} value={input.rating as LearnerAssessmentValue | null} onChange={(rating) => setInput({ ...input, rating })} name={`score-${context.itemId}`} />
      <label className="grid gap-2 text-sm font-semibold">Zichtbaarheid van de beoordeling<select className="min-h-11 rounded-xl border bg-background p-2" value={input.visibility} onChange={(event) => setInput({ ...input, visibility: event.target.value as Input["visibility"] })}><option value="parent_visible">Ouder- en kindportaal</option><option value="internal">Alleen intern</option></select></label>
      {input.baseObservationId ? <label className="grid gap-2 text-sm font-semibold md:col-span-2">Reden voor correctie<textarea className="rounded-xl border bg-background p-3" value={input.correctionReason} maxLength={2000} rows={2} onChange={(event) => setInput({ ...input, correctionReason: event.target.value })} /></label> : null}
    </fieldset>
    <p className="text-sm text-muted-foreground">Een concept is alleen voor jou zichtbaar. Controleren en bewaren publiceert de beoordeling. Een ouderbericht en een kindcompliment zijn afzonderlijke acties.</p>
    <p role="status" className="text-sm">{saving ? "Privéconcept opslaan…" : dirty ? "Concept nog niet opgeslagen" : draft ? "Privéconcept opgeslagen" : "Geen gewijzigd concept"}</p>
    {error ? <div role="alert" className="space-y-2 text-sm text-danger"><p>{error.message}</p><button className={button} type="button" onClick={() => error.code === "conflict" ? void inspectConflict() : void persist()}>{error.code === "conflict" ? "Actuele beoordeling vergelijken" : "Opnieuw opslaan"}</button></div> : null}
    <div className="flex flex-wrap gap-3"><button ref={scoreTrigger} className={primary} type="button" disabled={busy || input.rating === null || (!dirty && !draft)} onClick={() => void openReview()}>Controleren en bewaren</button><button className={button} type="button" disabled={busy || (!dirty && !draft)} onClick={() => void discard()}>Concept verwijderen</button></div>
    {badgePending ? <div role="status" className="rounded-xl border p-3 text-sm"><p>De beoordeling is opgeslagen. De badgecontrole is nog niet bevestigd.</p><button className={button} type="button" disabled={busy} onClick={() => void retryBadgeEvaluation()}>Badgecontrole opnieuw proberen</button></div> : null}
    <section className="border-t pt-3"><h4 className="font-semibold">Compliment voor {participantLabel}</h4>{view.compliment ? <p className="mt-2 whitespace-pre-wrap">{view.compliment.message}</p> : <><p className="my-2 text-sm text-muted-foreground">Publiceer bewust een korte, positieve tekst bij de opgeslagen beoordeling.</p><button ref={complimentTrigger} className={button} type="button" disabled={busy || dirty || !!draft || !view.current || view.current.visibility !== "parent_visible"} onClick={() => { complimentOperation.current = crypto.randomUUID(); setComplimentConfirmed(false); setError(null); setComplimentOpen(true); }}>Kindcompliment schrijven</button></>}</section>
    <PortalDialog open={!!review} onOpenChange={(open) => { if (!open && !busy) setReview(null); }} title="Beoordeling controleren" description={`Controleer de wijziging voor ${participantLabel}.`} returnFocusRef={scoreTrigger} footer={<button className={primary} type="button" disabled={!confirmed || busy} onClick={() => void finalize()}>{busy ? "Beoordeling bewaren…" : "Beoordeling bewaren"}</button>}>
      <div className="space-y-4"><h3 className="font-bold">{view.item.name}</h3><p>Van {view.current ? `${view.current.rating} / 5` : "nog niet beoordeeld"} naar <strong>{review?.rating} / 5</strong>.</p><p>{review?.visibility === "internal" ? "Deze beoordeling blijft intern." : "Deze beoordeling wordt zichtbaar in het ouder- en kindportaal."}</p>{review?.review_correction_reason ? <p className="whitespace-pre-wrap">{review.review_correction_reason}</p> : null}<p>Er wordt geen ouderbericht of kindcompliment verstuurd.</p><label className="flex gap-3"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} />Ik heb leerling, score en zichtbaarheid gecontroleerd.</label>{error ? <div role="alert"><p>{error.message}</p>{error.code === "conflict" ? <button className={button} type="button" onClick={() => void inspectConflict()}>Actuele beoordeling vergelijken</button> : null}</div> : null}</div>
    </PortalDialog>
    <PortalDialog open={!!conflict} onOpenChange={(open) => { if (!open) setConflict(null); }} title="Beoordeling intussen gewijzigd" description="Vergelijk voordat je een nieuwe correctie voorbereidt. Er wordt nu nog niets gepubliceerd." footer={<><button className={button} type="button" onClick={() => { if (conflict) restore(conflict); setConflict(null); }}>Gebruik opgeslagen concept</button><button className={primary} type="button" onClick={keepInput}>Bereid mijn score voor als nieuwe correctie</button></>}>
      <div className="space-y-3"><p>Actuele opgeslagen beoordeling: {conflict?.current?.rating ?? "Onbekend"} / 5</p><p>Opgeslagen privéconcept: {conflict?.draft?.rating ?? "Geen"}</p><p>Jouw gekozen score: {input.rating} / 5</p><p>Na deze keuze moet je de correctiereden invullen en opnieuw controleren.</p></div>
    </PortalDialog>
    <PortalDialog open={complimentOpen} onOpenChange={(open) => {
      if (busy) return;
      setComplimentOpen(open);
      if (!open) { setCompliment(""); setComplimentConfirmed(false); complimentOperation.current = null; setError(null); }
    }} dirty={!!compliment && !busy} title="Kindcompliment publiceren" description={`Deze tekst wordt bij de beoordeling zichtbaar voor ${participantLabel}.`} returnFocusRef={complimentTrigger} footer={<button className={primary} type="button" disabled={!compliment.trim() || !complimentConfirmed || busy} onClick={() => void publishCompliment()}>Publiceer kindcompliment</button>}>
      <div className="space-y-4"><p>{view.item.name} · {view.current?.rating} / 5</p><label className="grid gap-2 font-semibold">Positief compliment<textarea className="rounded-xl border bg-background p-3" value={compliment} disabled={busy} maxLength={240} rows={4} onChange={(event) => setCompliment(event.target.value)} /></label><label className="flex gap-3"><input type="checkbox" checked={complimentConfirmed} disabled={busy} onChange={(event) => setComplimentConfirmed(event.target.checked)} />Deze tekst is bedoeld voor {participantLabel} en mag zichtbaar worden.</label><p className="text-sm">De gepubliceerde tekst blijft als historie bewaard.</p>{error ? <p role="alert">{error.message}</p> : null}</div>
    </PortalDialog>
  </article>;
}
