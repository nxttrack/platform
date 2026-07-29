import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  Heart,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  Waves
} from "lucide-react";
import Link from "next/link";

import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { StatusPill } from "@/components/shell/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { Progress } from "@/components/ui/progress";
import {
  createAttentionContactTaskAction,
  refreshParticipantAttentionSignalsAction,
  resolveParticipantAttentionSignalAction,
  saveEnrollmentPauseAction
} from "@/lib/domain/retention-signals-actions";
import type { ParticipantAttentionView } from "@/lib/domain/retention-signals";
import { cn } from "@/lib/utils";

type AttentionData = Awaited<ReturnType<typeof import("@/lib/domain/retention-signals").getParticipantAttentionData>>;

export function ParticipantAttentionWorkspace({ data }: { data: AttentionData }) {
  const open = data.signals.filter((signal) => ["open", "reviewed"].includes(signal.status));

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-4 shadow-soft xl:flex-row xl:items-center xl:justify-between">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-600 text-white"><Heart className="size-5" /></span>
          <div>
            <h2 className="font-bold text-foreground">Menselijke aandacht, geen automatisch oordeel</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Signalen beschrijven alleen waar contextcontrole nuttig kan zijn. NXTTRACK verstuurt niets, schrijft niemand uit en noemt niemand een slechte klant.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminActionDrawer description="Leg een verwachte terugkeer vast zodat planning en persoonlijke opvolging tijdig zichtbaar worden." title="Pauze registreren" triggerLabel="Pauze vastleggen" triggerVariant="outline">
            <PauseForm enrollments={data.enrollments} />
          </AdminActionDrawer>
          <form action={refreshParticipantAttentionSignalsAction}>
            <Button className="gap-2" type="submit"><RefreshCw className="size-4" />Analyse verversen</Button>
          </form>
        </div>
      </section>

      {open.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {open.map((signal) => <AttentionCard key={signal.id} signal={signal} />)}
        </div>
      ) : (
        <section className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-soft">
          <CheckCircle2 className="mx-auto size-9 text-emerald-600" />
          <h2 className="mt-3 text-lg font-bold text-foreground">Geen open aandachtssignalen</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Ververs de analyse om actuele deelname, voortgang, planning, betalingen en oudervragen opnieuw te beoordelen.</p>
        </section>
      )}
    </div>
  );
}

function AttentionCard({ signal }: { signal: ParticipantAttentionView }) {
  const meta = signalMeta(signal.signalType);
  const Icon = meta.icon;

  return (
    <article className={cn("flex flex-col overflow-hidden rounded-2xl border bg-card shadow-soft", signal.attentionLevel === "priority_contact" ? "border-red-200" : signal.attentionLevel === "contact_suggested" ? "border-amber-200" : "border-border")}>
      <header className="flex gap-3 border-b border-border bg-muted/20 p-4">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", meta.className)}><Icon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={levelTone(signal.attentionLevel)}>{levelLabel(signal.attentionLevel)}</StatusPill>
            <StatusPill tone="neutral">{meta.label}</StatusPill>
            {signal.taskCreated ? <StatusPill tone="info">Contacttaak klaar</StatusPill> : null}
          </div>
          <h2 className="mt-2 text-base font-bold leading-6 text-foreground">{signal.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{signal.summary}</p>
        </div>
      </header>
      <div className="flex-1 p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <Progress aria-label={`Confidence ${Math.round(signal.confidence * 100)} procent`} value={signal.confidence * 100} />
          <span className="text-xs font-bold tabular-nums text-foreground">{Math.round(signal.confidence * 100)}% confidence</span>
        </div>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Brondata & redenen</p>
        <ul className="mt-2 space-y-2">
          {signal.reasons.map((reason) => <li className="flex gap-2 text-xs leading-5 text-muted-foreground" key={reason}><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet-500" />{reason}</li>)}
        </ul>
        <p className="mt-4 rounded-xl bg-sky-50 p-3 text-xs font-medium leading-5 text-sky-950">{signal.recommendedAction}</p>
        <p className="mt-3 text-[11px] text-muted-foreground">Laatst gezien {formatDateTime(signal.lastObservedAt)} · vervalt automatisch {formatDate(signal.expiresAt)}</p>
      </div>
      <footer className="space-y-2 border-t border-border bg-muted/15 p-3">
        <div className="flex flex-wrap gap-2">
          <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/admin/leerlingen?participant=${signal.participantId}`}>Open dossier <ArrowUpRight className="ml-1 size-3.5" /></Link>
          {!signal.taskCreated ? (
            <ConfirmActionForm
              action={createAttentionContactTaskAction}
              confirmLabel="Interne contacttaak maken"
              description="Dit maakt alleen een interne taak met een menselijke contextcheck. Er wordt geen bericht verstuurd en geen status gewijzigd."
              hiddenFields={{ signalId: signal.id, humanConfirmation: "confirmed" }}
              title={`Persoonlijke opvolging voor ${signal.participantName}?`}
              triggerLabel="Maak contacttaak"
              triggerVariant="outline"
            />
          ) : <Link className={buttonVariants({ size: "sm" })} href="/admin/taken">Open taken</Link>}
        </div>
        <div className="flex flex-wrap gap-2">
          <ConfirmActionForm
            action={resolveParticipantAttentionSignalAction}
            confirmLabel="Markeer opgelost"
            description="Sluit dit signaal voor de huidige brongegevens. Een nieuwe of veranderde situatie kan later een nieuw uitlegbaar signaal opleveren."
            hiddenFields={{ signalId: signal.id, decision: "resolved", humanConfirmation: "resolved" }}
            title="Is de situatie persoonlijk beoordeeld en opgelost?"
            triggerLabel="Opgelost"
            triggerVariant="outline"
          />
          <ConfirmActionForm
            action={resolveParticipantAttentionSignalAction}
            confirmLabel="Signaal niet relevant"
            description="Gebruik dit wanneer de volledige context laat zien dat opvolging niet passend is. Er verandert niets aan het leerling- of gezinsdossier."
            hiddenFields={{ signalId: signal.id, decision: "dismissed", humanConfirmation: "dismissed" }}
            title="Dit signaal bewust negeren?"
            triggerLabel="Niet relevant"
            triggerVariant="outline"
          />
        </div>
      </footer>
    </article>
  );
}

function PauseForm({ enrollments }: { enrollments: AttentionData["enrollments"] }) {
  return (
    <form action={saveEnrollmentPauseAction} className="space-y-4">
      <SelectField label="Leerling" name="enrollmentId" required>
        <option value="">Kies actieve inschrijving</option>
        {enrollments.map((enrollment) => <option key={enrollment.id} value={enrollment.id}>{enrollment.participantName} · {enrollment.status}</option>)}
      </SelectField>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start pauze" name="startsOn" type="date" required />
        <Field label="Verwachte terugkeer" name="expectedReturnOn" type="date" />
      </div>
      <SelectField label="Operationele reden" name="reasonCategory" defaultValue="other">
        <option value="medical">Medisch — geen details</option>
        <option value="holiday">Vakantie</option>
        <option value="schedule">Rooster</option>
        <option value="financial">Financieel</option>
        <option value="family">Gezin</option>
        <option value="other">Anders</option>
      </SelectField>
      <TextAreaField label="Interne notitie — optioneel" name="internalNote" maxLength={1000} placeholder="Alleen operationele context die nodig is voor terugkeer." />
      <SubmitButton>Pauze opslaan</SubmitButton>
    </form>
  );
}

function signalMeta(type: string) {
  return ({
    repeated_absence: { label: "Aanwezigheid", icon: Clock3, className: "bg-amber-500/10 text-amber-800" },
    declining_participation: { label: "Deelname", icon: TrendingDown, className: "bg-violet-500/10 text-violet-700" },
    progress_stall: { label: "Voortgang", icon: Waves, className: "bg-sky-500/10 text-sky-700" },
    unpaid_balance: { label: "Betaling", icon: CreditCard, className: "bg-red-500/10 text-red-700" },
    open_parent_question: { label: "Oudercontact", icon: MessageCircle, className: "bg-cyan-500/10 text-cyan-700" },
    pause_ending: { label: "Pauze", icon: CalendarClock, className: "bg-emerald-500/10 text-emerald-700" },
    schedule_friction: { label: "Rooster", icon: ShieldCheck, className: "bg-orange-500/10 text-orange-800" }
  } as Record<string, { label: string; icon: typeof Clock3; className: string }>)[type] ?? { label: type, icon: ShieldCheck, className: "bg-muted text-muted-foreground" };
}

function levelTone(level: ParticipantAttentionView["attentionLevel"]) {
  return level === "priority_contact" ? "danger" as const : level === "contact_suggested" ? "warning" as const : "info" as const;
}

function levelLabel(level: ParticipantAttentionView["attentionLevel"]) {
  return level === "priority_contact" ? "Persoonlijk prioriteren" : level === "contact_suggested" ? "Contact overwegen" : "Observeren";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeZone: "Europe/Amsterdam" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value));
}
