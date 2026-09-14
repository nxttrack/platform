"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useRouter } from "next/navigation";
import { PortalDialog } from "@/components/portal/portal-dialog";
import { loadMessageComposerAction, saveMessageComposerAction, discardMessageComposerAction, sendMessageComposerAction } from "@/lib/domain/message-composer-actions";
import { messageThreadHref, type MessageComposerContext, type MessageComposerDraft, type MessageComposerError, type MessageComposerInput, type MessageComposerLoad } from "@/lib/domain/message-composer-contract";
import { messageVisibilityLabels, threadTypeLabels, threadTypes } from "@/lib/domain/communication-hub-contract";
import { flushDraftWriters, registerDraftWriter } from "@/components/portal/draft-navigation";
import styles from "./message-composer.module.css";

export type MessageComposerHandle = { flush: () => Promise<boolean> };
const empty: MessageComposerInput = { subject: "", plainText: "", visibility: "public_to_thread", threadType: "general" };
const networkError: MessageComposerError = { ok: false, code: "unavailable", message: "De verbinding is onderbroken. Je invoer blijft staan; probeer opnieuw op te slaan." };
const contentOf = (draft: MessageComposerDraft): MessageComposerInput => ({ subject: draft.subject, plainText: draft.plain_text, visibility: draft.visibility, threadType: draft.thread_type });
const equal = (left: MessageComposerInput, right: MessageComposerInput) => JSON.stringify(left) === JSON.stringify(right);

/** No sensitive localStorage. All durable text belongs to one server-authorized composer scope. */
type ComposerProps = {
  scopeKey: string; context: MessageComposerContext; allowInternal?: boolean; canReply?: boolean;
  onSent?: (threadId: string) => void; ref?: Ref<MessageComposerHandle>;
};
export function MessageComposer(props: ComposerProps) {
  // Old in-flight responses keep their own refs after an actor, tenant or context switch.
  return <ScopedMessageComposer {...props} key={JSON.stringify([props.scopeKey, props.context, props.allowInternal, props.canReply])} />;
}
function ScopedMessageComposer({ context, allowInternal = false, canReply = true, onSent, ref }: ComposerProps) {
  const router = useRouter(), fieldId = useId();
  const [loaded, setLoaded] = useState<MessageComposerLoad | null>(null), [loading, setLoading] = useState(true);
  const [input, setInput] = useState<MessageComposerInput>(empty), [draft, setDraft] = useState<MessageComposerDraft | null>(null);
  const [error, setError] = useState<MessageComposerError | null>(null), [saving, setSaving] = useState(false), [sending, setSending] = useState(false);
  const [review, setReview] = useState<MessageComposerDraft | null>(null), [confirmed, setConfirmed] = useState(false);
  const [conflict, setConflict] = useState<MessageComposerLoad | null>(null);
  const latest = useRef(input), stored = useRef<MessageComposerInput>(empty), document = useRef(draft), effectiveContext = useRef(context);
  const pending = useRef<Promise<MessageComposerDraft | null> | null>(null), mounted = useRef(true), locked = useRef(false), conflictBlocked = useRef(false);
  const reviewTrigger = useRef<HTMLButtonElement>(null), loadGeneration = useRef(0);
  latest.current = input;
  const dirty = !equal(input, stored.current);
  function accept(value: MessageComposerDraft) { document.current = value; stored.current = contentOf(value); if (mounted.current) setDraft(value); }
  function restore(value: MessageComposerLoad) {
    const record = value.draft;
    if (record && record.visibility !== "public_to_thread" && !allowInternal) {
      setError({ ok: false, code: "access", message: "Dit is een intern concept. Open het in de bevoegde teamomgeving; het wordt hier niet omgezet naar een ouderbericht." }); return;
    }
    effectiveContext.current = record ? { ...context, curriculumItemId: record.curriculum_item_id, sessionId: record.session_id } : context;
    const initial = record ? contentOf(record) : { ...empty, visibility: !canReply && allowInternal ? "internal_note" as const : "public_to_thread" as const,
      subject: value.reference.label ? `Vraag over ${value.reference.label}`.slice(0, 180) : "", threadType: value.reference.kind === "curriculum_item" ? "progress" as const : value.reference.kind === "session" ? "planning" as const : "general" as const };
    document.current = record; stored.current = initial; latest.current = initial; conflictBlocked.current = false;
    setLoaded(value); setDraft(record); setInput(initial); setError(null);
  }
  async function reload() {
    const generation = ++loadGeneration.current;
    setLoading(true);
    try { const result = await loadMessageComposerAction(context, !canReply && allowInternal ? "internal_note" : "public_to_thread"); if (mounted.current && generation === loadGeneration.current) { if (result.ok) restore(result.value); else setError(result); } }
    catch { if (mounted.current && generation === loadGeneration.current) setError(networkError); }
    finally { if (mounted.current && generation === loadGeneration.current) setLoading(false); }
  }
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; loadGeneration.current += 1; }; }, []);
  async function persist(): Promise<MessageComposerDraft | null> {
    if (pending.current) { const result = await pending.current; return result && !equal(latest.current, stored.current) ? persist() : result; }
    if (!loaded || locked.current || conflictBlocked.current) return null;
    if (equal(latest.current, stored.current) && document.current) return document.current;
    if (!latest.current.subject && !latest.current.plainText && !document.current) return null;
    const snapshot = { ...latest.current }, target = { ...effectiveContext.current };
    setSaving(true);
    const work = (async () => {
      try {
        const result = await saveMessageComposerAction(target, snapshot, document.current?.revision ?? 0);
        if (!result.ok) { conflictBlocked.current = result.code === "conflict"; if (mounted.current) setError(result); return null; }
        accept(result.value); if (mounted.current) setError(null); return result.value;
      } catch { if (mounted.current) setError(networkError); return null; }
    })();
    pending.current = work;
    const result = await work; pending.current = null; if (mounted.current) setSaving(false);
    return result && !equal(latest.current, stored.current) ? persist() : result;
  }
  const flush = async () => equal(latest.current, stored.current) && !pending.current ? true : Boolean(await persist());
  const flushRef = useRef(flush); flushRef.current = flush;
  useEffect(() => registerDraftWriter(() => flushRef.current(),()=>!equal(latest.current,stored.current) || !!pending.current), []);
  useImperativeHandle(ref, () => ({ flush }));
  useEffect(() => {
    if (!loaded || !dirty || sending || conflictBlocked.current) return;
    const timer = setTimeout(() => void persist(), 700); return () => clearTimeout(timer);
  }, [input, loaded, sending]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload); return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  useEffect(() => {
    if (!dirty && !pending.current) return;
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.download || (anchor.target && anchor.target !== "_self")) return;
      const target = new URL(anchor.href, location.href);
      if (target.origin !== location.origin || target.protocol !== location.protocol) return; // beforeunload protects external navigation.
      if (target.pathname === location.pathname && target.search === location.search) return;
      event.preventDefault(); event.stopImmediatePropagation();
      void flushDraftWriters().then((saved) => { if (saved && mounted.current) router.push(`${target.pathname}${target.search}${target.hash}`); });
    };
    window.document.addEventListener("click", navigate, true);
    return () => window.document.removeEventListener("click", navigate, true);
  }, [dirty, input, loaded]);
  async function openReview() {
    const saved = await persist(); if (!saved) return;
    if (!await flushDraftWriters()) { setError({ ...networkError, message: "Een ander concept kon niet worden opgeslagen. Controleer dat concept voordat je verdergaat." }); return; }
    setConfirmed(false); setReview(saved);
  }
  async function send() {
    if (!review || !confirmed) return;
    if (!equal(latest.current, contentOf(review))) { setReview(null); return; }
    locked.current = true; setSending(true); setError(null);
    try {
      const result = await sendMessageComposerAction(effectiveContext.current, review.id, review.revision, review.operation_id, true, loaded?.recipient?.kind === "guardian" ? loaded.recipient.id ?? null : null);
      if (!result.ok) { setError(result); return; }
      document.current = null; stored.current = empty; latest.current = empty; setDraft(null); setInput(empty); setReview(null);
      onSent?.(result.value.threadId); router.replace(messageThreadHref(context.returnPath, result.value.threadId), { scroll: false }); router.refresh();
    } catch { setError({ ...networkError, message: "De verzendbevestiging is niet ontvangen. Je concept blijft zichtbaar. Probeer hetzelfde verzoek opnieuw; het maakt geen dubbel bericht." }); }
    finally { locked.current = false; setSending(false); }
  }
  async function inspectConflict() {
    try { const result = await loadMessageComposerAction(effectiveContext.current, latest.current.visibility); if (result.ok) setConflict(result.value); else setError(result); } catch { setError(networkError); }
  }
  async function discard() {
    if (pending.current) await pending.current;
    const record = document.current;
    if (record) {
      try { const result = await discardMessageComposerAction(effectiveContext.current, record.id, record.revision); if (!result.ok) { setError(result); return; } } catch { setError(networkError); return; }
    }
    document.current = null; stored.current = empty; latest.current = empty; conflictBlocked.current = false;
    setDraft(null); setInput(empty); setError(null); setReview(null);
  }
  function keepMyInput() {
    if (!conflict) return;
    document.current = conflict.draft; stored.current = conflict.draft ? contentOf(conflict.draft) : empty;
    conflictBlocked.current = false;
    // Keep the reference belonging to this input; choosing the remote draft restores its reference instead.
    setLoaded({ ...loaded!, recipient: conflict.recipient }); setConflict(null); void persist();
  }
  if (!canReply && !allowInternal) return <p>Je kunt dit gesprek lezen. Antwoorden is voor jouw toegang niet beschikbaar.</p>;
  if (loading) return <p role="status">Concept laden…</p>;
  if (!loaded) return <div className={styles.form}><p role="alert">{error?.message ?? "Het concept is niet beschikbaar."}</p><button className={styles.button} type="button" onClick={() => void reload()}>Opnieuw laden</button></div>;
  const reference = loaded.reference;
  const recipientLabel = input.visibility === "public_to_thread" ? loaded.recipient?.label ?? "Ontvanger niet beschikbaar" : "Intern — niet zichtbaar voor ouders";
  return <div className={styles.form} data-message-composer>
    {loaded.participantLabel ? <p><strong>Over {loaded.participantLabel}</strong></p> : null}
    {input.visibility === "public_to_thread" && !loaded.recipient ? <p role="alert" className={styles.error}>Er is geen geldige ontvanger gekoppeld. Je concept blijft bewaard; de school moet eerst de oudertoegang herstellen.</p> : null}
    {reference.label ? <div className={styles.reference}><strong>{reference.label}</strong>{reference.startsAt ? <time dateTime={reference.startsAt}>{new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short", timeZone: reference.timeZone ?? "Europe/Amsterdam" }).format(new Date(reference.startsAt))}</time> : null}<span>Deze verwijzing blijft bij het bericht bewaard.</span></div> : null}
    <p className={styles.hint}>Concepten zijn alleen voor jou zichtbaar en blijven 30 dagen beschikbaar. Opslaan verstuurt niets.</p>
    {!context.threadId ? <><label htmlFor={`${fieldId}-subject`}>Onderwerp<input id={`${fieldId}-subject`} value={input.subject} maxLength={180} disabled={sending} onChange={(event) => setInput({ ...input, subject: event.target.value })} /></label><label htmlFor={`${fieldId}-type`}>Categorie<select id={`${fieldId}-type`} value={input.threadType} disabled={sending} onChange={(event) => setInput({ ...input, threadType: event.target.value as MessageComposerInput["threadType"] })}>{threadTypes.filter((type) => type !== "internal").map((type) => <option value={type} key={type}>{threadTypeLabels[type]}</option>)}</select></label></> : null}
    {allowInternal ? <label htmlFor={`${fieldId}-visibility`}>Zichtbaarheid<select id={`${fieldId}-visibility`} value={input.visibility} disabled={sending} onChange={(event) => setInput({ ...input, visibility: event.target.value as MessageComposerInput["visibility"] })}>{(["public_to_thread", "internal_note", "staff_only"] as const).filter((value) => canReply || value !== "public_to_thread").map((value) => <option key={value} value={value}>{messageVisibilityLabels[value]}</option>)}</select></label> : null}
    <label htmlFor={`${fieldId}-body`}>Bericht<textarea id={`${fieldId}-body`} value={input.plainText} maxLength={8000} rows={6} disabled={sending} onChange={(event) => setInput({ ...input, plainText: event.target.value })} /></label>
    <p role="status" className={styles.hint}>{saving ? "Concept opslaan…" : dirty ? "Nog niet opgeslagen" : draft ? "Concept opgeslagen" : "Nog geen concept opgeslagen"}</p>
    {error ? <div role="alert" className={styles.error}><p>{error.message}</p>{error.code === "conflict" ? <button className={styles.button} type="button" onClick={() => void inspectConflict()}>Opgeslagen concept bekijken</button> : <button className={styles.button} type="button" onClick={() => void persist()}>Opnieuw opslaan</button>}</div> : null}
    <div className={styles.actions}><button ref={reviewTrigger} className={styles.primary} type="button" disabled={sending || !input.plainText.trim() || (!context.threadId && !input.subject.trim()) || (!canReply && !allowInternal) || (input.visibility === "public_to_thread" && !loaded.recipient)} onClick={() => void openReview()}>Controleren en versturen</button><button className={styles.button} type="button" disabled={sending || (!draft && !dirty)} onClick={() => void discard()}>Concept verwijderen</button></div>
    <PortalDialog open={!!review} onOpenChange={(open) => { if (!open && !sending) setReview(null); }} title="Bericht controleren" description="Controleer leerling, verwijzing, ontvanger en zichtbaarheid voordat je bevestigt." returnFocusRef={reviewTrigger} footer={<button className={styles.primary} type="button" disabled={!confirmed || sending} onClick={() => void send()}>{sending ? "Bevestiging afwachten…" : "Bericht versturen"}</button>}>
      <div className={styles.form}><p><strong>Aan:</strong> {recipientLabel}</p>{loaded.participantLabel ? <p><strong>Over:</strong> {loaded.participantLabel}</p> : null}{reference.label ? <p><strong>Verwijzing:</strong> {reference.label}</p> : null}<p><strong>{review?.subject}</strong></p><p className={styles.preview}>{review?.plain_text}</p><label className={styles.confirm}><input type="checkbox" checked={confirmed} disabled={sending} onChange={(event) => setConfirmed(event.target.checked)} />Ik heb ontvanger, inhoud en zichtbaarheid gecontroleerd en wil dit bericht versturen.</label>{error ? <p role="alert" className={styles.error}>{error.message}</p> : null}</div>
    </PortalDialog>
    <PortalDialog open={!!conflict} onOpenChange={(open) => { if (!open) setConflict(null); }} title="Concept gewijzigd" description="Vergelijk je invoer met het opgeslagen concept. Kies bewust welke versie je wilt behouden." footer={<><button type="button" onClick={() => { if (conflict) restore(conflict); setConflict(null); }}>Gebruik opgeslagen versie</button><button type="button" onClick={keepMyInput}>Bewaar mijn invoer</button></>}>
      <div className={styles.form}><h3>Opgeslagen concept</h3><p>{conflict?.reference.label ?? "Zonder verwijzing"}</p><p className={styles.preview}>{conflict?.draft?.plain_text ?? "Geen opgeslagen concept"}</p><h3>Jouw invoer</h3><p>{reference.label ?? "Zonder verwijzing"}</p><p className={styles.preview}>{input.plainText}</p></div>
    </PortalDialog>
  </div>;
}
