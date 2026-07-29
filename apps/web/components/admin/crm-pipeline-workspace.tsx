"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Mail,
  Merge,
  MessageSquareText,
  Phone,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  UserRound,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { StatusPill } from "@/components/shell/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { DataTable, dataTableTextFilter } from "@/components/ui/data-table";
import { DirtyForm } from "@/components/ui/dirty-form";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  dismissCrmDuplicateAction,
  mergeCrmLeadsAction,
  recordCrmContactAction,
  refreshCrmDuplicatesAction,
  revertCrmMergeAction,
  saveCrmSlaPolicyAction,
  updateCrmLeadAction
} from "@/lib/domain/crm-pipeline-actions";
import {
  crmLostReasons,
  crmPriorities,
  crmStageMeta,
  crmStageProgress,
  crmStages,
  type CrmStage
} from "@/lib/domain/crm-pipeline-contract";
import type { CrmPipelineData, CrmPipelineLead } from "@/lib/domain/crm-pipeline";

const tabs = [
  { id: "board", label: "Pipeline", icon: UsersRound },
  { id: "table", label: "Alle leads", icon: UserRound },
  { id: "duplicates", label: "Duplicaten", icon: Merge },
  { id: "settings", label: "Servicenormen", icon: Settings2 }
] as const;

export function CrmPipelineWorkspace({ activeTab, data }: { activeTab: string; data: CrmPipelineData }) {
  const safeTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : "board";
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/35 p-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <Link
            aria-current={safeTab === id ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              safeTab === id ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
            )}
            href={`/admin/crm?tab=${id}`}
            key={id}
          >
            <Icon className="size-4" />
            {label}
            {id === "duplicates" && data.duplicates.filter((item) => item.status === "open").length ? (
              <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">
                {data.duplicates.filter((item) => item.status === "open").length}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
      <div className="p-3 sm:p-4">
        {safeTab === "board" ? <PipelineBoard data={data} /> : null}
        {safeTab === "table" ? <LeadTable data={data} /> : null}
        {safeTab === "duplicates" ? <DuplicateWorkspace data={data} /> : null}
        {safeTab === "settings" ? <SlaSettings data={data} /> : null}
      </div>
    </section>
  );
}

function PipelineBoard({ data }: { data: CrmPipelineData }) {
  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 overflow-x-auto pb-2">
        <div className="grid min-w-[1280px] grid-cols-7 gap-3">
          {crmStages.map((stage) => {
            const rows = data.leads.filter((lead) => lead.stage === stage);
            return (
              <section aria-labelledby={`crm-stage-${stage}`} className="rounded-xl border border-border bg-muted/25 p-2.5" key={stage}>
                <div className="flex items-center justify-between gap-2 px-1 pb-2">
                  <div>
                    <h2 className="text-xs font-bold" id={`crm-stage-${stage}`}>{crmStageMeta[stage].label}</h2>
                    <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{crmStageMeta[stage].description}</p>
                  </div>
                  <span className="rounded-full bg-card px-2 py-1 text-[10px] font-bold shadow-soft">{rows.length}</span>
                </div>
                <div className="grid max-h-[64vh] gap-2 overflow-y-auto pr-0.5">
                  {rows.length ? rows.map((lead) => <LeadCard key={lead.id} lead={lead} selected={data.selectedLead?.id === lead.id} />) : (
                    <p className="rounded-lg border border-dashed border-border bg-card/60 px-3 py-5 text-center text-[11px] text-muted-foreground">Geen leads</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <LeadDetail data={data} />
    </div>
  );
}

function LeadCard({ lead, selected }: { lead: CrmPipelineLead; selected: boolean }) {
  return (
    <Link
      className={cn(
        "block rounded-xl border bg-card p-3 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary/50 ring-2 ring-primary/10" : "border-border"
      )}
      href={`/admin/crm?tab=board&lead=${lead.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{lead.participantName}</p>
          <p className="truncate text-[11px] text-muted-foreground">{lead.parentName}</p>
        </div>
        <PriorityDot value={lead.priority} />
      </div>
      <p className="mt-2 truncate text-[11px] font-medium text-foreground">{lead.programName}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        <SlaPill lead={lead} />
        {lead.scoreBand ? <StatusPill tone="info">{lead.scoreBand}</StatusPill> : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
        <span className="truncate">{lead.ownerName}</span>
        <span>{lead.contactCount} contact</span>
      </div>
    </Link>
  );
}

function LeadDetail({ data }: { data: CrmPipelineData }) {
  const lead = data.selectedLead;
  const [stage, setStage] = useState<CrmStage>(lead?.stage ?? "new");
  if (!lead) {
    return <aside className="grid min-h-80 place-items-center rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">Selecteer een lead om het dossier te openen.</aside>;
  }
  return (
    <aside className="self-start overflow-hidden rounded-xl border border-border bg-card shadow-soft 2xl:sticky 2xl:top-4">
      <div className="bg-gradient-to-br from-primary/10 via-aqua/10 to-transparent p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Leaddossier</p>
            <h2 className="mt-1 text-xl font-bold">{lead.participantName}</h2>
            <p className="text-sm text-muted-foreground">{lead.parentName} · {lead.programName}</p>
          </div>
          <StatusPill tone={crmStageMeta[lead.stage].tone}>{crmStageMeta[lead.stage].label}</StatusPill>
        </div>
        <Progress aria-label={`Pipelinevoortgang ${crmStageProgress(lead.stage)} procent`} className="mt-4" value={crmStageProgress(lead.stage)} />
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Info icon={Mail} label={lead.parentEmail} />
          <Info icon={Phone} label={lead.parentPhone || "Geen telefoon"} />
          <Info icon={Sparkles} label={lead.sourceLabel} />
          <Info icon={CalendarClock} label={formatDateTime(lead.receivedAt)} />
        </div>
      </div>
      <div className="max-h-[calc(100vh-14rem)] space-y-5 overflow-y-auto p-4">
        <DirtyForm action={updateCrmLeadAction} className="rounded-xl border border-border p-3">
          <input name="leadId" type="hidden" value={lead.id} />
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold">Pipeline & eigenaar</h3>
            <SlaPill lead={lead} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
            <Field label="Fase">
              <select className={inputClass} defaultValue={lead.stage} name="stage" onChange={(event) => setStage(event.target.value as CrmStage)}>
                {crmStages.map((value) => <option key={value} value={value}>{crmStageMeta[value].label}</option>)}
              </select>
            </Field>
            <Field label="Prioriteit">
              <select className={inputClass} defaultValue={lead.priority} name="priority">
                {crmPriorities.map((value) => <option key={value} value={value}>{priorityLabel(value)}</option>)}
              </select>
            </Field>
            <Field label="Lead owner">
              <select className={inputClass} defaultValue={lead.ownerId ?? ""} name="ownerId">
                <option value="">Niet toegewezen</option>
                {data.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.label}</option>)}
              </select>
            </Field>
            <Field label="Volgende opvolging">
              <input className={inputClass} defaultValue={toLocalDateTime(lead.nextFollowUpAt)} name="nextFollowUpAt" type="datetime-local" />
            </Field>
            <Field label="SLA-deadline">
              <input className={inputClass} defaultValue={toLocalDateTime(lead.slaDueAt)} name="slaDueAt" type="datetime-local" />
            </Field>
          </div>
          {stage === "lost" ? (
            <div className="grid gap-3 rounded-lg border border-danger/20 bg-danger/5 p-3">
              <Field label="Verloren-reden">
                <select className={inputClass} defaultValue={lead.lostReason ?? "other"} name="lostReason" required>
                  {crmLostReasons.map((value) => <option key={value} value={value}>{lostReasonLabel(value)}</option>)}
                </select>
              </Field>
              <Field label="Interne toelichting">
                <textarea className={cn(inputClass, "min-h-20 py-2")} maxLength={2000} name="lostNotes" />
              </Field>
            </div>
          ) : null}
          <Button type="submit"><CheckCircle2 className="size-4" />Wijzigingen opslaan</Button>
        </DirtyForm>

        <DirtyForm action={recordCrmContactAction} className="rounded-xl border border-border p-3">
          <input name="leadId" type="hidden" value={lead.id} />
          <input name="humanConfirmation" type="hidden" value="confirmed" />
          <h3 className="text-sm font-bold">Contact vastleggen</h3>
          <p className="text-xs leading-5 text-muted-foreground">Leg alleen werkelijk uitgevoerd contact vast. Er wordt niets automatisch verzonden.</p>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
            <Field label="Type">
              <select className={inputClass} name="eventType"><option value="call">Telefoongesprek</option><option value="email">E-mail</option><option value="in_app">In-app</option><option value="meeting">Persoonlijk gesprek</option><option value="note">Interne notitie</option><option value="trial">Proefles</option></select>
            </Field>
            <Field label="Richting">
              <select className={inputClass} name="direction"><option value="outbound">Uitgaand</option><option value="inbound">Inkomend</option><option value="internal">Intern</option></select>
            </Field>
            <Field label="Kanaal">
              <select className={inputClass} name="channel"><option value="phone">Telefoon</option><option value="email">E-mail</option><option value="in_app">In-app</option><option value="in_person">Persoonlijk</option><option value="system">Systeemnotitie</option></select>
            </Field>
            <Field label="Uitkomst">
              <select className={inputClass} name="outcome"><option value="">Geen</option><option value="connected">Gesproken</option><option value="left_message">Bericht achtergelaten</option><option value="no_answer">Geen gehoor</option><option value="replied">Reactie ontvangen</option><option value="scheduled">Afspraak gepland</option><option value="completed">Afgerond</option><option value="needs_follow_up">Opvolging nodig</option></select>
            </Field>
          </div>
          <Field label="Onderwerp"><input className={inputClass} maxLength={180} name="subject" /></Field>
          <Field label="Samenvatting"><textarea className={cn(inputClass, "min-h-24 py-2")} maxLength={4000} name="summary" required /></Field>
          <Field label="Nieuwe opvolgdatum"><input className={inputClass} name="nextFollowUpAt" type="datetime-local" /></Field>
          <Button variant="outline" type="submit"><MessageSquareText className="size-4" />Contact toevoegen</Button>
        </DirtyForm>

        <section>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold">Tijdlijn</h3>
            <StatusPill tone="neutral">{data.timeline.length} momenten</StatusPill>
          </div>
          <div className="mt-3 grid gap-2">
            {data.timeline.length ? data.timeline.map((item) => (
              <article className="relative rounded-lg border border-border p-3 pl-4" key={`${item.kind}-${item.id}`}>
                <span className={cn("absolute inset-y-3 left-0 w-1 rounded-r-full", item.tone === "success" ? "bg-success" : item.tone === "warning" ? "bg-warning" : item.tone === "info" ? "bg-primary" : "bg-border")} />
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold">{item.title}</p>
                  <time className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(item.occurredAt)}</time>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                <p className="mt-1 text-[10px] font-medium text-muted-foreground">{item.actorName}</p>
              </article>
            )) : <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nog geen contact- of fasehistorie.</p>}
          </div>
        </section>

        {data.activeMerge ? (
          <ConfirmActionForm
            action={revertCrmMergeAction}
            confirmLabel="Samenvoeging herstellen"
            description="De oorspronkelijke leadstatus, eigenaar, prioriteit en opvolgdatum worden teruggezet. Tijdlijn en auditbewijs blijven bewaard."
            hiddenFields={{ leadId: lead.id, mergeEventId: data.activeMerge.id, humanConfirmation: "UNDO" }}
            title="Duplicate merge ongedaan maken?"
            triggerLabel={<><RotateCcw className="size-4" />Merge herstellen</>}
            triggerVariant="outline"
          />
        ) : null}
      </div>
    </aside>
  );
}

function LeadTable({ data }: { data: CrmPipelineData }) {
  const columns = useMemo<ColumnDef<CrmPipelineLead, unknown>[]>(() => [
    {
      id: "lead",
      accessorFn: (row) => `${row.participantName} ${row.parentName} ${row.parentEmail}`,
      header: "Lead",
      meta: { label: "Lead" },
      filterFn: dataTableTextFilter,
      cell: ({ row }) => <div><p className="font-semibold">{row.original.participantName}</p><p className="text-xs text-muted-foreground">{row.original.parentName} · {row.original.parentEmail}</p></div>
    },
    { accessorKey: "programName", header: "Programma", meta: { label: "Programma" } },
    { accessorKey: "stage", header: "Fase", meta: { label: "Fase" }, cell: ({ row }) => <StatusPill tone={crmStageMeta[row.original.stage].tone}>{crmStageMeta[row.original.stage].label}</StatusPill> },
    { accessorKey: "ownerName", header: "Eigenaar", meta: { label: "Eigenaar" } },
    { accessorKey: "sourceLabel", header: "Bron", meta: { label: "Bron" } },
    { id: "sla", accessorFn: (row) => row.sla.status, header: "SLA", meta: { label: "SLA" }, cell: ({ row }) => <SlaPill lead={row.original} /> },
    { id: "open", header: "", enableSorting: false, enableHiding: false, cell: ({ row }) => <Link className={buttonVariants({ size: "sm", variant: "outline" })} href={`/admin/crm?tab=board&lead=${row.original.id}`}>Open <ArrowRight className="size-3.5" /></Link> }
  ], []);
  return (
    <DataTable
      columns={columns}
      data={data.leads}
      filters={[
        { column: "stage", label: "Fase", options: crmStages.map((stage) => ({ label: crmStageMeta[stage].label, value: stage })) },
        { column: "sla", label: "SLA", options: [{ label: "Op schema", value: "on_track" }, { label: "Bijna", value: "due_soon" }, { label: "Te laat", value: "overdue" }, { label: "Gesloten", value: "closed" }] }
      ]}
      getRowId={(row) => row.id}
      searchColumn="lead"
      searchPlaceholder="Zoek kind, ouder of e-mail…"
      storageKey="admin.crm.pipeline"
    />
  );
}

function DuplicateWorkspace({ data }: { data: CrmPipelineData }) {
  const openRows = data.duplicates.filter((row) => row.status === "open");
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-gradient-to-r from-warning/10 to-transparent p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold">Herstelbare duplicate review</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Vergelijkt e-mail, telefoon, kindnaam en geboortedatum. NXTTRACK voegt nooit automatisch samen en verwijdert geen brondata.</p>
        </div>
        <form action={refreshCrmDuplicatesAction}><Button type="submit" variant="outline"><RefreshCw className="size-4" />Opnieuw controleren</Button></form>
      </div>
      {openRows.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {openRows.map((row) => (
            <article className="rounded-xl border border-border bg-card p-4 shadow-soft" key={row.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-warning">Mogelijk duplicaat</p>
                  <h3 className="mt-1 font-bold">{row.sourceLabel}</h3>
                  <p className="text-sm text-muted-foreground">lijkt op {row.candidateLabel}</p>
                </div>
                <StatusPill tone={row.score >= 90 ? "danger" : "warning"}>{row.score}% match</StatusPill>
              </div>
              <ul className="mt-3 grid gap-1 text-xs text-muted-foreground">
                {row.reasons.map((reason) => <li className="flex items-center gap-2" key={reason}><CheckCircle2 className="size-3.5 text-success" />{reason}</li>)}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <ConfirmActionForm
                  action={mergeCrmLeadsAction}
                  confirmLabel="Herstelbaar samenvoegen"
                  description={`De nieuwste lead ${row.sourceLabel} wordt logisch gekoppeld aan ${row.candidateLabel}. Er wordt niets verwijderd en de merge kan worden hersteld.`}
                  hiddenFields={{ sourceId: row.sourceId, targetId: row.candidateId, humanConfirmation: "MERGE", reason: `Duplicate review: ${row.reasons.join(", ")}` }}
                  title="Deze leads samenvoegen?"
                  triggerLabel={<><Merge className="size-4" />Samenvoegen</>}
                  triggerVariant="outline"
                />
                <form action={dismissCrmDuplicateAction}>
                  <input name="duplicateId" type="hidden" value={row.id} />
                  <Button type="submit" variant="ghost">Geen duplicaat</Button>
                </form>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Geen onbeoordeelde duplicaten. De pipeline is schoon.</p>}
    </div>
  );
}

function SlaSettings({ data }: { data: CrmPipelineData }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <DirtyForm action={saveCrmSlaPolicyAction} className="rounded-xl border border-border p-4">
        <div>
          <h2 className="font-bold">Servicenormen</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Deze normen sturen reminders en kleursignalen. Ze sturen nooit automatisch communicatie.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField defaultValue={data.slaPolicy.firstResponseHours} label="Eerste reactie" name="firstResponseHours" suffix="uur" />
          <NumberField defaultValue={data.slaPolicy.followUpHours} label="Reguliere opvolging" max={336} name="followUpHours" suffix="uur" />
          <NumberField defaultValue={data.slaPolicy.offerFollowUpHours} label="Open aanbod" name="offerFollowUpHours" suffix="uur" />
          <NumberField defaultValue={data.slaPolicy.trialFollowUpHours} label="Na proefles" name="trialFollowUpHours" suffix="uur" />
        </div>
        <Button type="submit"><Clock3 className="size-4" />Servicenormen opslaan</Button>
      </DirtyForm>
      <aside className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <h3 className="font-bold text-primary">Menselijke CRM-grens</h3>
        <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
          <li>• Geen automatische e-mail of plaatsing.</li>
          <li>• Verloren vereist een expliciete reden.</li>
          <li>• Duplicate merges zijn herstelbaar.</li>
          <li>• Leadscore prioriteert alleen handmatige review.</li>
          <li>• Journey Bot-data blijft buiten live CRM.</li>
        </ul>
      </aside>
    </div>
  );
}

function SlaPill({ lead }: { lead: CrmPipelineLead }) {
  const tone = lead.sla.status === "overdue" ? "danger" : lead.sla.status === "due_soon" ? "warning" : lead.sla.status === "on_track" ? "success" : "neutral";
  return <StatusPill tone={tone}>{lead.sla.status === "overdue" ? <Clock3 className="size-3" /> : null}{lead.sla.label}</StatusPill>;
}

function PriorityDot({ value }: { value: string }) {
  const label = priorityLabel(value);
  return <span aria-label={`Prioriteit ${label}`} className={cn("mt-1 size-2.5 shrink-0 rounded-full ring-4", value === "urgent" ? "bg-danger ring-danger/10" : value === "high" ? "bg-warning ring-warning/10" : value === "low" ? "bg-slate-400 ring-slate-400/10" : "bg-primary ring-primary/10")} title={`Prioriteit ${label}`} />;
}

function Info({ icon: Icon, label }: { icon: typeof Mail; label: string }) {
  return <span className="flex min-w-0 items-center gap-1.5 rounded-lg bg-card/70 px-2 py-1.5"><Icon className="size-3.5 shrink-0 text-primary" /><span className="truncate">{label}</span></span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-semibold">{label}{children}</label>;
}

function NumberField({ defaultValue, label, name, suffix, max = 168 }: { defaultValue: number; label: string; name: string; suffix: string; max?: number }) {
  return <Field label={label}><span className="flex items-center rounded-lg border border-border bg-background pr-3"><input className="min-h-11 w-full bg-transparent px-3 outline-none" defaultValue={defaultValue} max={max} min={1} name={name} type="number" /><span className="text-xs text-muted-foreground">{suffix}</span></span></Field>;
}

const inputClass = "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/10";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function priorityLabel(value: string) {
  return ({ low: "Laag", normal: "Normaal", high: "Hoog", urgent: "Urgent" } as Record<string, string>)[value] ?? value;
}

function lostReasonLabel(value: string) {
  return ({
    no_response: "Geen reactie",
    not_interested: "Geen interesse",
    schedule_mismatch: "Geen passend lesmoment",
    price: "Prijs",
    moved: "Verhuisd",
    chose_other_provider: "Andere aanbieder gekozen",
    not_eligible: "Niet passend/eligible",
    other: "Anders"
  } as Record<string, string>)[value] ?? value;
}
