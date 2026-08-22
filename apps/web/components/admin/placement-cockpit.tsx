"use client";

import { toAmsterdamDate } from "@/lib/date/business-date";

import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, CheckCircle2, Clock3, ListTodo, RefreshCw, Sparkles, UserCheck, Users, XCircle } from "lucide-react";
import Link from "next/link";

import { ActivityTimeline } from "@/components/admin/activity-timeline";
import { SubmitButton } from "@/components/admin/domain-ui";
import { WaitTimeInsight } from "@/components/admin/wait-time-insight";
import { DataTable, dataTableTextFilter } from "@/components/ui/data-table";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusPill } from "@/components/shell/ui";
import { confirmDirectPlacementAction, createPlacementSuggestionTaskAction, createSlotOfferAction, createWaitlistEntryFromIntakeAction, declineIntakeForWaitlistAction, scoreWaitlistEntryAction, updateWaitlistEntryStatusAction } from "@/lib/domain/placement-actions";
import type { SmartActivityItem } from "@/lib/domain/smart-event-contract";
import type { WaitTimePrediction } from "@/lib/domain/wait-time-contract";
import { getWaitlistStatusMeta } from "@/lib/ui/status-meta";

export type PlacementCockpitRow = {
  id: string;
  guardianId: string | null;
  participantName: string;
  parentName: string;
  parentEmail: string;
  program: string;
  stage: string | null;
  status: string;
  priorityDate: string;
  isTest: boolean;
  journeyRunId: string | null;
  minimumAgeBlocked: boolean;
  eligibleFrom: string | null;
  waitTime: WaitTimePrediction;
  proposals: Array<{
    capacity: number;
    capacityFixed: number;
    capacityUsed: number;
    confidence: number;
    groupId: string;
    groupName: string;
    reasons: Array<{ label: string; explanation: string; evidence: string }>;
    blockers: Array<{ code: string; label: string; explanation: string; evidence: string }>;
    score: number;
    canOffer: boolean;
  }>;
  offerGroups: Array<{ id: string; name: string }>;
  offers: Array<{ deliveryStatus: string; groupName: string; status: string }>;
  preferences: string[];
  auditEvents: Array<{ createdAt: string; eventType: string; message: string }>;
  smartEvents: SmartActivityItem[];
};

export type PendingIntakeRow = {
  id: string;
  isTest: boolean;
  option: string;
  parentName: string;
  participantName: string;
  program: string;
  receivedAt: string;
};

export function PendingIntakesTable({ rows }: { rows: PendingIntakeRow[] }) {
  const pendingColumns: ColumnDef<PendingIntakeRow, unknown>[] = [
    { accessorKey: "participantName", header: "Kind", meta: { label: "Kind" }, filterFn: dataTableTextFilter, cell: ({ row }) => <div><p className="font-semibold text-foreground">{row.original.participantName}</p><p className="text-xs text-muted-foreground">{row.original.parentName}</p></div> },
    { accessorKey: "program", header: "Programma", meta: { label: "Programma" } },
    { accessorKey: "option", header: "Aanvraag", meta: { label: "Aanvraag" } },
    { accessorKey: "receivedAt", header: "Ontvangen", meta: { label: "Ontvangen" }, cell: ({ getValue }) => new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(getValue()))) },
    { id: "actions", header: "Acties", enableSorting: false, enableHiding: false, cell: ({ row }) => <div className="flex flex-wrap gap-1.5" onClick={(event) => event.stopPropagation()}><form action={createWaitlistEntryFromIntakeAction}><input name="intakeSubmissionId" type="hidden" value={row.original.id} /><button className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground" type="submit"><UserCheck className="size-3.5" />Accepteren</button></form><form action={declineIntakeForWaitlistAction}><input name="intakeSubmissionId" type="hidden" value={row.original.id} /><button className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:border-danger/30 hover:bg-danger/5 hover:text-danger" type="submit"><XCircle className="size-3.5" />Weigeren</button></form></div> }
  ];
  return <DataTable columns={pendingColumns} data={rows} getRowId={(row) => row.id} searchColumn="participantName" searchPlaceholder="Zoek nieuwe aanvraag…" storageKey="admin.waitlist.pending" />;
}

const columns: ColumnDef<PlacementCockpitRow, unknown>[] = [
  {
    accessorKey: "participantName",
    header: "Deelnemer",
    cell: ({ row }) => <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-foreground">{row.original.participantName}</p>{row.original.isTest ? <StatusPill tone="info">Journey Bot</StatusPill> : null}</div><p className="text-xs text-muted-foreground">{row.original.parentName}</p></div>,
    filterFn: dataTableTextFilter
  },
  { accessorKey: "program", header: "Programma", meta: { label: "Programma" } },
  { accessorKey: "stage", header: "Niveau", meta: { label: "Niveau" }, cell: ({ getValue }) => String(getValue() || "Nog te bepalen") },
  {
    id: "bestMatch",
    accessorFn: (row) => row.proposals[0]?.score ?? 0,
    header: "Beste match",
    meta: { label: "Beste match" },
    cell: ({ row }) => row.original.proposals[0] ? <div className="min-w-36"><p className="font-semibold text-foreground">{row.original.proposals[0].groupName}</p><p className="text-xs text-muted-foreground">score {Math.round(row.original.proposals[0].score)} · {Math.round(row.original.proposals[0].confidence * 100)}% confidence · {row.original.proposals[0].capacity} vrij</p></div> : <span className="text-muted-foreground">Geen match</span>
  },
  {
    accessorKey: "status",
    header: "Status",
    meta: { label: "Status" },
    cell: ({ getValue }) => { const meta = getWaitlistStatusMeta(String(getValue())); return <StatusPill tone={meta.tone} title={meta.description}>{meta.label}</StatusPill>; }
  },
  { accessorKey: "priorityDate", header: "Sinds", meta: { label: "Prioriteit" }, cell: ({ getValue }) => new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(String(getValue()))) }
];

export function PlacementCockpit({ initialSearch, rows }: { initialSearch?: string; rows: PlacementCockpitRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      detailDescription={(row) => `${row.program} · ${row.parentName}`}
      detailTitle={(row) => row.participantName}
      filters={[{ column: "status", label: "Statussen", options: ["waiting", "reviewing", "offered", "placed", "declined"].map((value) => ({ label: getWaitlistStatusMeta(value).label, value })) }]}
      getRowId={(row) => row.id}
      initialSearchValue={initialSearch}
      renderDetails={(row) => <PlacementDetails row={row} />}
      searchColumn="participantName"
      searchPlaceholder="Zoek deelnemer…"
      storageKey="admin.placement"
    />
  );
}

function PlacementDetails({ row }: { row: PlacementCockpitRow }) {
  const statusMeta = getWaitlistStatusMeta(row.status);
  const effectivelyAgeBlocked = row.minimumAgeBlocked && (
    !row.eligibleFrom || row.eligibleFrom > toAmsterdamDate()
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={statusMeta.tone}>{statusMeta.label}</StatusPill>
        {row.isTest ? <StatusPill tone="info">Journey Bot</StatusPill> : null}
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="justify-start">
          <TabsTrigger className="flex-none" value="overview">Overzicht</TabsTrigger>
          <TabsTrigger className="flex-none" value="placement">Plaatsingsmogelijkheden</TabsTrigger>
          <TabsTrigger className="flex-none" value="communication">Communicatie</TabsTrigger>
          <TabsTrigger className="flex-none" value="activity">Activiteit</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-4">
            <section className="grid grid-cols-2 gap-3">
              <DetailStat icon={Clock3} label="Wacht sinds" value={new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(row.priorityDate))} />
              <DetailStat icon={Users} label="Alternatieven" value={String(Math.max(0, row.proposals.length - 1))} />
            </section>
            <div className="rounded-xl border border-border bg-muted/35 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Voorkeuren</p>
              <p className="mt-2 text-[13px] leading-5 text-foreground">{row.preferences.join(" · ") || "Geen specifieke voorkeur vastgelegd."}</p>
            </div>
            <WaitTimeInsight prediction={row.waitTime} />
            {row.isTest ? <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">Journey Bot-testdata · run {row.journeyRunId?.slice(0, 8) ?? "onbekend"} · veilig te archiveren via platformbeheer</p> : null}
            {effectivelyAgeBlocked ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-900">Plaatsing geblokkeerd tot {row.eligibleFrom ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(row.eligibleFrom)) : "de vierde verjaardag"}.</p> : null}
            <section className="rounded-xl border border-border p-4">
              <h3 className="text-sm font-bold text-foreground">Wachtlijststatus</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{statusMeta.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {row.status !== "waiting" ? <StatusAction id={row.id} label="Terug op wachtlijst" status="waiting" /> : null}
                {!statusMeta.isTerminal ? <StatusAction id={row.id} label="Weigeren" status="declined" tone="danger" /> : null}
                {!statusMeta.isTerminal ? <StatusAction id={row.id} label="Archiveren" status="closed" /> : null}
              </div>
            </section>
          </div>
        </TabsContent>
        <TabsContent value="placement">
          <Link className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-primary hover:bg-muted" href={row.guardianId ? `/admin/gezinnen/${row.guardianId}` : "/admin/gezinnen"}>
            <Users className="size-4" />
            Zoek gezinsmatch
          </Link>
          <div className="grid gap-4">
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div><h3 className="text-sm font-bold text-foreground">Verklaarbare voorstellen</h3><p className="text-xs text-muted-foreground">Niveau, voorkeur, capaciteit, resource, instructeur, leeftijd, FIFO en doorstroom bepalen de score.</p></div>
                <form action={scoreWaitlistEntryAction}><input name="waitlistEntryId" type="hidden" value={row.id} /><button className="grid size-10 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground" type="submit" aria-label="Voorstellen herberekenen"><RefreshCw className="size-4" /></button></form>
              </div>
              <div className="grid gap-3">
                {row.proposals.map((proposal, index) => (
                  <article className={proposal.blockers.length ? "rounded-xl border border-amber-200 bg-amber-50/35 p-3" : "rounded-xl border border-border p-3"} key={proposal.groupId}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">{index === 0 ? <Sparkles className="size-4 text-primary" /> : null}{proposal.groupName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {proposal.capacityUsed}/{proposal.capacityFixed} bezet · {proposal.capacity} vrij · {Math.round(proposal.confidence * 100)}% confidence
                        </p>
                      </div>
                      <span className="text-lg font-bold text-primary">{Math.round(proposal.score)}</span>
                    </div>
                    <Progress className="mt-3" value={Math.min(100, proposal.score)} aria-label={`Matchscore ${Math.round(proposal.score)} van 100`} />
                    <div className="mt-3 grid gap-2">
                      {proposal.reasons.slice(0, 5).map((reason) => (
                        <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs" key={reason.label}>
                          <p className="font-semibold text-foreground">{reason.label}</p>
                          <p className="mt-0.5 leading-5 text-muted-foreground">{reason.explanation} <span className="font-medium">Bron: {reason.evidence}.</span></p>
                        </div>
                      ))}
                      {proposal.blockers.map((blocker) => (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950" key={blocker.code}>
                          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                          <p><span className="font-bold">{blocker.label}.</span> {blocker.explanation} Bron: {blocker.evidence}.</p>
                        </div>
                      ))}
                    </div>
                    <form action={createPlacementSuggestionTaskAction} className="mt-3">
                      <input name="waitlistEntryId" type="hidden" value={row.id} />
                      <input name="groupId" type="hidden" value={proposal.groupId} />
                      <button className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted" type="submit">
                        <ListTodo className="size-4" aria-hidden="true" />
                        Maak taak
                      </button>
                    </form>
                  </article>
                ))}
                {!row.proposals.length ? <p className="rounded-xl bg-muted p-3 text-[13px] text-muted-foreground">Geen actieve groep voldoet aan de basisvoorwaarden.</p> : null}
              </div>
            </section>
            {!effectivelyAgeBlocked && !statusMeta.isTerminal ? <section className="rounded-xl border border-primary/20 bg-primary/5 p-4"><h3 className="text-sm font-bold text-foreground">Plaatsingsvoorstel maken</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Kies bewust een blocker-vrije groep. De geverifieerde ouderaanbieding blijft de aanbevolen route.</p><ConfirmActionForm action={createSlotOfferAction} className="mt-4 grid gap-3" confirmLabel="Aanbod maken en e-mail versturen" description="De plaatsing wordt opnieuw gecontroleerd. Daarna maakt NXTTRACK het aanbod aan en verstuurt de geverifieerde uitnodiging naar de ouder." hiddenFields={{ waitlistEntryId: row.id, humanConfirmation: "confirmed" }} title={`Aanbod voor ${row.participantName} versturen?`} triggerLabel="Controleer en maak aanbod"><label className="grid gap-1.5 text-[13px] font-semibold text-foreground" htmlFor={`placement-group-${row.id}`}>Groep<select className="h-10 rounded-lg border border-border bg-background px-3 font-normal" id={`placement-group-${row.id}`} name="groupId" required defaultValue=""><option disabled value="">Kies een groep</option>{row.offerGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label></ConfirmActionForm>
              <details className="mt-4 border-t border-primary/15 pt-4">
                <summary className="cursor-pointer text-xs font-bold text-muted-foreground">Direct plaatsen na reeds verkregen oudertoestemming</summary>
                <form action={confirmDirectPlacementAction} className="mt-3 grid gap-3">
                  <input name="waitlistEntryId" type="hidden" value={row.id} />
                  <label className="grid gap-1.5 text-[13px] font-semibold text-foreground" htmlFor={`direct-placement-group-${row.id}`}>Groep
                    <select className="h-10 rounded-lg border border-border bg-background px-3 font-normal" id={`direct-placement-group-${row.id}`} name="groupId" required defaultValue="">
                      <option disabled value="">Kies een groep</option>
                      {row.offerGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </select>
                  </label>
                  <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                    <input className="mt-1 size-4 shrink-0" name="humanConfirmation" required type="checkbox" value="confirmed" />
                    Ik bevestig dat de ouder buiten NXTTRACK toestemming gaf en dat ik deze directe plaatsing bewust uitvoer. Capaciteit, niveau, resource en instructeur worden opnieuw transactioneel gecontroleerd.
                  </label>
                  <SubmitButton>Plaats direct en leg vast in auditlog</SubmitButton>
                </form>
              </details>
            </section> : null}
          </div>
        </TabsContent>
        <TabsContent value="communication">
          {row.offers.length ? <div className="grid gap-2">{row.offers.slice(0, 8).map((offer, index) => <div className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2 text-[13px]" key={`${offer.groupName}-${index}`}><CheckCircle2 className="size-4 text-primary" /><span className="flex-1 font-medium">{offer.groupName}</span><span className="text-xs text-muted-foreground">{offer.status} · {offer.deliveryStatus}</span></div>)}</div> : <p className="rounded-xl bg-muted p-4 text-[13px] text-muted-foreground">Nog geen aanbodcommunicatie voor deze kandidaat.</p>}
        </TabsContent>
        <TabsContent value="activity">
          <div className="grid gap-5">
            <ActivityTimeline events={row.smartEvents} />
            <section className="border-t border-border pt-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">Technische plaatsingsaudit</h3>
              {row.auditEvents.length ? <ol className="mt-3 grid gap-3">{row.auditEvents.map((event, index) => <li className="border-l-2 border-primary/25 pl-3" key={`${event.eventType}-${index}`}><p className="text-[13px] font-semibold">{event.eventType.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{event.message || "Geen toelichting"} · {new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.createdAt))}</p></li>)}</ol> : <p className="mt-3 rounded-xl bg-muted p-4 text-[13px] text-muted-foreground">Nog geen technische auditgebeurtenissen vastgelegd.</p>}
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DetailStat({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return <div className="rounded-xl bg-muted p-3"><Icon className="size-4 text-primary" /><p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-bold text-foreground">{value}</p></div>;
}

function StatusAction({ id, label, status, tone = "default" }: { id: string; label: string; status: string; tone?: "default" | "danger" }) {
  return <form action={updateWaitlistEntryStatusAction}><input name="waitlistEntryId" type="hidden" value={id} /><input name="status" type="hidden" value={status} /><button className={tone === "danger" ? "min-h-9 rounded-lg border border-danger/20 bg-danger/5 px-3 text-xs font-semibold text-danger" : "min-h-9 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"} type="submit">{label}</button></form>;
}
