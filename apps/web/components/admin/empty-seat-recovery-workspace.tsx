import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UsersRound
} from "lucide-react";
import Link from "next/link";

import {
  createEmptySeatReviewTaskAction,
  dismissEmptySeatCandidateAction,
  refreshEmptySeatRecoveryAction,
  resolveEmptySeatSnapshotAction
} from "@/lib/domain/empty-seat-recovery-actions";
import type { EmptySeatRecoveryView } from "@/lib/domain/empty-seat-recovery";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/shell/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { Progress } from "@/components/ui/progress";

export function EmptySeatRecoveryWorkspace({ snapshots }: { snapshots: EmptySeatRecoveryView[] }) {
  const open = snapshots.filter((snapshot) => snapshot.status !== "resolved");

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-xl border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-cyan-50 p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-600 text-white shadow-sm"><Sparkles className="size-5" /></span>
          <div>
            <h2 className="font-bold text-foreground">Uitlegbare capaciteitsmatching</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              NXTTRACK combineert groepsruimte, afmeldingen, niveau, voorkeuren, FIFO, inhaalcredits en gezinsplanning. Er wordt nooit automatisch geboekt, aangeboden of gemaild.
            </p>
          </div>
        </div>
        <form action={refreshEmptySeatRecoveryAction}>
          <Button className="w-full gap-2 sm:w-auto" type="submit"><RefreshCw className="size-4" />Analyse verversen</Button>
        </form>
      </section>

      {open.length ? (
        <div className="grid gap-4 2xl:grid-cols-2">
          {open.map((snapshot) => <RecoveryCard key={snapshot.id} snapshot={snapshot} />)}
        </div>
      ) : (
        <section className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center shadow-soft">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-700"><CheckCircle2 className="size-6" /></span>
          <h2 className="mt-4 text-lg font-bold text-foreground">Geen open herstelkansen</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Ververs de analyse na een afmelding of roosterwijziging. Alleen toekomstige lessen met aantoonbare vrije capaciteit worden getoond.
          </p>
        </section>
      )}
    </div>
  );
}

function RecoveryCard({ snapshot }: { snapshot: EmptySeatRecoveryView }) {
  const activeCandidates = snapshot.candidates.filter((candidate) => candidate.status !== "dismissed");

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <header className="border-b border-border bg-muted/25 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-foreground">{snapshot.groupName}</h2>
              <RecoveryBand band={snapshot.recoveryBand} />
              <StatusPill tone={snapshot.status === "resolved" ? "success" : "neutral"}>{snapshot.status === "resolved" ? "Afgehandeld" : "Open"}</StatusPill>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(snapshot.startsAt)} · {snapshot.locationName}</p>
          </div>
          <div className="rounded-xl bg-background px-3 py-2 text-right ring-1 ring-border">
            <p className="text-xl font-bold tabular-nums text-foreground">{snapshot.availableSeats}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{snapshot.availableSeats === 1 ? "vrije plek" : "vrije plekken"}</p>
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold leading-6 text-foreground">{snapshot.summary}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <Progress aria-label={`Confidence ${Math.round(snapshot.confidence * 100)} procent`} value={snapshot.confidence * 100} />
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{Math.round(snapshot.confidence * 100)}% confidence</span>
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Brondata van het advies">
          {snapshot.reasons.map((reason) => <li className="rounded-full bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-border" key={reason}>{reason}</li>)}
        </ul>
      </header>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground"><UsersRound className="size-4 text-sky-600" />Passende kandidaten</h3>
          <StatusPill tone={snapshot.actionableCandidateCount ? "success" : "warning"}>{snapshot.actionableCandidateCount} zonder blocker</StatusPill>
        </div>
        {activeCandidates.length ? activeCandidates.slice(0, 6).map((candidate, index) => (
          <section className={cn("rounded-xl border p-3", candidate.actionable ? "border-emerald-200 bg-emerald-50/45" : "border-border bg-muted/25")} key={candidate.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-background text-xs font-bold text-foreground ring-1 ring-border">{index + 1}</span>
                  <p className="font-semibold text-foreground">{candidate.displayName}</p>
                  <StatusPill tone={candidate.type === "makeup" ? "info" : "neutral"}>{candidate.type === "makeup" ? "Inhaalcredit" : `Wachtlijst${candidate.fifoRank ? ` · FIFO ${candidate.fifoRank}` : ""}`}</StatusPill>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{candidate.suggestedAction}</p>
              </div>
              <div className="text-right">
                <p className="text-base font-bold tabular-nums text-foreground">{candidate.score}%</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">match</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {candidate.reasons.map((reason) => <span className="rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-800" key={reason}>{reason}</span>)}
              {candidate.blockers.map((blocker) => <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900" key={blocker}>{blocker}</span>)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={candidate.sourceHref}>Open bron <ArrowUpRight className="ml-1 size-3.5" /></Link>
              {candidate.actionable && candidate.status !== "review_task_created" ? (
                <ConfirmActionForm
                  action={createEmptySeatReviewTaskAction}
                  confirmLabel="Reviewtaak aanmaken"
                  description="Dit maakt alleen een interne taak. Er wordt geen plek gereserveerd en er gaat geen bericht of aanbod naar de ouder."
                  hiddenFields={{ candidateId: candidate.id, humanConfirmation: "confirmed" }}
                  title={`Menselijke review voor ${candidate.displayName}?`}
                  triggerLabel={<><ListChecks className="mr-1 size-3.5" />Maak reviewtaak</>}
                  triggerVariant="outline"
                />
              ) : candidate.status === "review_task_created" ? <StatusPill tone="info">Reviewtaak staat klaar</StatusPill> : null}
              <form action={dismissEmptySeatCandidateAction}>
                <input name="candidateId" type="hidden" value={candidate.id} />
                <Button size="sm" type="submit" variant="ghost">Niet relevant</Button>
              </form>
            </div>
          </section>
        )) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Nog geen passende kandidaat binnen de veilige matchregels.</p>
        )}
      </div>

      <footer className="flex flex-col gap-3 border-t border-border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-emerald-600" />Menselijke beslissing blijft verplicht.</p>
        <ConfirmActionForm
          action={resolveEmptySeatSnapshotAction}
          confirmLabel="Markeer als afgehandeld"
          description="Gebruik dit nadat een medewerker de plek handmatig heeft beoordeeld. Dit wijzigt geen inschrijving, boeking of communicatie."
          hiddenFields={{ snapshotId: snapshot.id, humanConfirmation: "resolved" }}
          title="Herstelkans afronden?"
          triggerLabel={<><CheckCircle2 className="mr-1 size-3.5" />Afhandelen</>}
          triggerVariant="outline"
        />
      </footer>
    </article>
  );
}

function RecoveryBand({ band }: { band: string }) {
  const meta = {
    within_24h: { label: "Waarschijnlijk binnen 24 uur", tone: "success" as const, icon: Sparkles },
    within_48h: { label: "Waarschijnlijk binnen 48 uur", tone: "success" as const, icon: Clock3 },
    within_72h: { label: "Menselijke opvolging", tone: "info" as const, icon: Clock3 },
    manual_outreach: { label: "Handmatige afweging", tone: "warning" as const, icon: ShieldCheck },
    no_match: { label: "Nog geen match", tone: "neutral" as const, icon: ShieldCheck }
  }[band] ?? { label: band, tone: "neutral" as const, icon: ShieldCheck };
  const Icon = meta.icon;
  return <StatusPill tone={meta.tone}><Icon className="size-3" />{meta.label}</StatusPill>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam"
  }).format(new Date(value));
}
