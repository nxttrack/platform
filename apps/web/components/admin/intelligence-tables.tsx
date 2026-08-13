"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, ClipboardPlus, MessageSquareText, Waves } from "lucide-react";
import Link from "next/link";

import { StatusPill } from "@/components/shell/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { DataTable, dataTableTextFilter } from "@/components/ui/data-table";
import {
  addBottleneckLessonFocusAction,
  createAttendanceContactDraftAction,
  createAttendanceFollowUpTaskAction,
  createBottleneckTaskAction
} from "@/lib/domain/learning-intelligence-actions";
import type {
  AttendanceRiskLevel,
  CapacityRiskLevel,
  IntelligenceConfidence
} from "@/lib/domain/learning-intelligence-contract";

export type CapacityForecastTableRow = {
  id: string;
  group: string;
  program: string;
  stage: string;
  day: string;
  timeBlock: string;
  location: string;
  resource: string;
  capacity: number;
  occupied: number;
  activeSoftReservations: number;
  expectedOpenings: number;
  expectedBottlenecks: number;
  waitlistDemand: number;
  risk: CapacityRiskLevel;
  confidence: IntelligenceConfidence;
  reasons: Array<{
    code: string;
    label: string;
    explanation: string;
    evidence: string;
  }>;
  actions: Array<{ label: string; href: string }>;
  isTest: boolean;
  modelVersion: string;
  confidenceScore: number;
  availabilityRange: {
    earliest: string | null;
    likely: string | null;
    latest: string | null;
  };
  openingScenarios: {
    conservative: number;
    likely: number;
    optimistic: number;
  };
  dataQuality: {
    historicalExitSampleSize: number;
    issueCount: number;
    hasHistory: boolean;
  };
};

export function CapacityForecastTable({
  rows
}: {
  rows: CapacityForecastTableRow[];
}) {
  const columns: ColumnDef<CapacityForecastTableRow, unknown>[] = [
    {
      accessorKey: "group",
      header: "Lesgroep",
      meta: { label: "Lesgroep" },
      filterFn: dataTableTextFilter,
      cell: ({ row }) => (
        <div>
          <p className="font-semibold text-foreground">{row.original.group}</p>
          <p className="text-xs text-muted-foreground">
            {row.original.day} · {row.original.timeBlock}
          </p>
        </div>
      )
    },
    { accessorKey: "stage", header: "Niveau", meta: { label: "Niveau" } },
    {
      accessorKey: "occupied",
      header: "Nu",
      meta: { label: "Huidige bezetting" },
      cell: ({ row }) => (
        <span className="font-semibold">{row.original.occupied}/{row.original.capacity}</span>
      )
    },
    {
      accessorKey: "expectedOpenings",
      header: "Openingen",
      meta: { label: "Verwachte openingen" },
      cell: ({ getValue }) => <span className="text-success">{String(getValue())}</span>
    },
    {
      id: "likelyAvailability",
      header: "Waarschijnlijk",
      meta: { label: "Waarschijnlijke beschikbaarheid" },
      accessorFn: (row) => row.availabilityRange.likely ?? "",
      cell: ({ row }) => (
        <span className="text-xs font-semibold">
          {formatForecastDate(row.original.availabilityRange.likely)}
        </span>
      )
    },
    {
      accessorKey: "waitlistDemand",
      header: "Vraag",
      meta: { label: "Wachtlijstvraag" }
    },
    {
      accessorKey: "expectedBottlenecks",
      header: "Knelpunt",
      meta: { label: "Verwacht knelpunt" },
      cell: ({ getValue }) => (
        <span className={Number(getValue()) > 0 ? "font-bold text-warning" : "text-muted-foreground"}>
          {String(getValue())}
        </span>
      )
    },
    {
      accessorKey: "risk",
      header: "Risico",
      meta: { label: "Risico" },
      cell: ({ getValue }) => <CapacityRiskBadge risk={getValue() as CapacityRiskLevel} />
    },
    {
      accessorKey: "confidence",
      header: "Zekerheid",
      meta: { label: "Zekerheid" },
      cell: ({ getValue }) => <ConfidenceBadge confidence={getValue() as IntelligenceConfidence} />
    }
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      detailDescription={(row) => `${row.program} · ${row.stage} · ${row.location}`}
      detailTitle={(row) => row.group}
      filters={[
        {
          column: "risk",
          label: "Risico",
          options: [
            { label: "Kritiek", value: "critical" },
            { label: "Knelpunt", value: "bottleneck" },
            { label: "Volgen", value: "watch" },
            { label: "Gezond", value: "healthy" }
          ]
        },
        {
          column: "confidence",
          label: "Zekerheid",
          options: ["hoog", "middel", "laag"].map((value) => ({ label: value, value }))
        }
      ]}
      getRowId={(row) => row.id}
      renderDetails={(row) => (
        <div className="grid gap-5">
          <div className="flex flex-wrap gap-2">
            <CapacityRiskBadge risk={row.risk} />
            <ConfidenceBadge confidence={row.confidence} />
            {row.isTest ? <StatusPill tone="info">Journey Bot</StatusPill> : null}
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Huidig" value={`${row.occupied} van ${row.capacity}`} />
            <Detail label="Zachte reserveringen" value={String(row.activeSoftReservations)} />
            <Detail label="Wachtlijstvraag" value={String(row.waitlistDemand)} />
            <Detail label="Voorzichtige openingen" value={String(row.expectedOpenings)} />
            <Detail label="Onvervulde verwachte vraag" value={String(row.expectedBottlenecks)} />
            <Detail label="Vroegst" value={formatForecastDate(row.availabilityRange.earliest)} />
            <Detail label="Waarschijnlijk" value={formatForecastDate(row.availabilityRange.likely)} />
            <Detail label="Uiterlijk" value={formatForecastDate(row.availabilityRange.latest)} />
            <Detail label="Scenario’s" value={`${row.openingScenarios.conservative} / ${row.openingScenarios.likely} / ${row.openingScenarios.optimistic}`} />
            <Detail label="Model" value={row.modelVersion} />
            <Detail label="Confidence" value={`${Math.round(row.confidenceScore * 100)}%`} />
            <Detail label="Historische steekproef" value={String(row.dataQuality.historicalExitSampleSize)} />
            <Detail label="Datakwaliteitsissues" value={String(row.dataQuality.issueCount)} />
            <Detail label="Locatie" value={row.location} />
            <Detail label="Resource" value={row.resource} />
          </dl>
          <section aria-labelledby={`reasons-${row.id}`}>
            <h3 className="font-bold text-foreground" id={`reasons-${row.id}`}>Waarom dit signaal?</h3>
            <div className="mt-3 grid gap-2">
              {row.reasons.map((reason) => (
                <article className="rounded-xl border border-border bg-muted/35 p-3" key={reason.code}>
                  <p className="text-sm font-semibold text-foreground">{reason.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{reason.explanation}</p>
                  <p className="mt-2 text-xs font-semibold text-primary">{reason.evidence}</p>
                </article>
              ))}
            </div>
          </section>
          <p className="rounded-xl border border-warning/20 bg-warning/10 p-3 text-xs leading-5 text-muted-foreground">
            Dit is een operationele voorspelling, geen toezegging aan ouders. No-shows zijn niet als vrijgekomen plek gerekend en deze voorspelling verplaatst nooit zelfstandig een leerling.
          </p>
          <div className="flex flex-wrap gap-2">
            {row.actions.map((action) => (
              <Link className={buttonVariants({ variant: "outline" })} href={action.href} key={`${action.label}-${action.href}`}>{action.label}<ArrowRight className="size-4" /></Link>
            ))}
          </div>
        </div>
      )}
      searchColumn="group"
      searchPlaceholder="Zoek lesgroep…"
      storageKey="admin.capacity-forecast"
    />
  );
}

export type AttendanceSignalTableRow = {
  id: string;
  participantId: string;
  participant: string;
  groupId: string;
  group: string;
  signalType: string;
  signalLabel: string;
  risk: AttendanceRiskLevel;
  confidence: IntelligenceConfidence;
  reason: string;
  evidence: string[];
  suggestedAction: string;
  isTest: boolean;
};

export function AttendanceSignalsTable({
  rows
}: {
  rows: AttendanceSignalTableRow[];
}) {
  const columns: ColumnDef<AttendanceSignalTableRow, unknown>[] = [
    {
      accessorKey: "participant",
      header: "Leerling",
      meta: { label: "Leerling" },
      filterFn: dataTableTextFilter,
      cell: ({ row }) => (
        <div>
          <p className="font-semibold text-foreground">{row.original.participant}</p>
          <p className="text-xs text-muted-foreground">{row.original.group}</p>
        </div>
      )
    },
    { accessorKey: "signalLabel", header: "Signaal", meta: { label: "Signaal" } },
    {
      accessorKey: "risk",
      header: "Aandacht",
      meta: { label: "Aandacht" },
      cell: ({ getValue }) => <AttendanceRiskBadge risk={getValue() as AttendanceRiskLevel} />
    },
    {
      accessorKey: "confidence",
      header: "Zekerheid",
      meta: { label: "Zekerheid" },
      cell: ({ getValue }) => <ConfidenceBadge confidence={getValue() as IntelligenceConfidence} />
    }
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      detailDescription={(row) => `${row.group} · ${row.signalLabel}`}
      detailTitle={(row) => row.participant}
      filters={[
        {
          column: "risk",
          label: "Aandacht",
          options: [
            { label: "Hoog", value: "high" },
            { label: "Verhoogd", value: "elevated" },
            { label: "Volgen", value: "watch" }
          ]
        }
      ]}
      getRowId={(row) => row.id}
      renderDetails={(row) => (
        <div className="grid gap-5">
          <div className="flex flex-wrap gap-2">
            <AttendanceRiskBadge risk={row.risk} />
            <ConfidenceBadge confidence={row.confidence} />
            {row.isTest ? <StatusPill tone="info">Journey Bot · alleen bekijken</StatusPill> : null}
          </div>
          <p className="text-sm leading-6 text-foreground">{row.reason}</p>
          <div className="grid gap-2">
            {row.evidence.map((evidence) => (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground" key={evidence}>
                {evidence}
              </p>
            ))}
          </div>
          <p className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm leading-6 text-muted-foreground">
            <span className="font-semibold text-foreground">Veilige vervolgstap:</span> {row.suggestedAction}
          </p>
          {row.isTest ? (
            <p className="text-xs text-muted-foreground">
              Journey Bot-signalen kunnen geen echte taak of ouderconcept aanmaken.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <form action={createAttendanceFollowUpTaskAction}>
                <SignalInputs row={row} />
                <Button type="submit" variant="outline"><ClipboardPlus className="size-4" />Taak maken</Button>
              </form>
              <form action={createAttendanceContactDraftAction}>
                <SignalInputs row={row} />
                <Button type="submit" variant="outline"><MessageSquareText className="size-4" />Conceptbericht</Button>
              </form>
            </div>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            Geen automatische uitschrijving, geen plaatsverlies en geen verzonden bericht. Een medewerker beoordeelt iedere vervolgstap.
          </p>
        </div>
      )}
      searchColumn="participant"
      searchPlaceholder="Zoek leerling…"
      storageKey="admin.attendance-signals"
    />
  );
}

export type BottleneckTableRow = {
  id: string;
  groupId: string;
  group: string;
  program: string;
  stage: string;
  skillId: string;
  skill: string;
  affected: number;
  total: number;
  rate: number;
  trend: string;
  confidence: IntelligenceConfidence;
  reasons: Array<{ code: string; label: string; explanation: string; evidence: string }>;
  suggestedFocus: string;
  participantNames: string[];
  isTest: boolean;
};

export function BottlenecksTable({ rows }: { rows: BottleneckTableRow[] }) {
  const columns: ColumnDef<BottleneckTableRow, unknown>[] = [
    {
      accessorKey: "skill",
      header: "Vaardigheid",
      meta: { label: "Vaardigheid" },
      filterFn: dataTableTextFilter,
      cell: ({ row }) => (
        <div>
          <p className="font-semibold text-foreground">{row.original.skill}</p>
          <p className="text-xs text-muted-foreground">{row.original.group}</p>
        </div>
      )
    },
    { accessorKey: "stage", header: "Niveau", meta: { label: "Niveau" } },
    {
      accessorKey: "affected",
      header: "Observaties",
      meta: { label: "Observaties" },
      cell: ({ row }) => `${row.original.affected} van ${row.original.total}`
    },
    {
      accessorKey: "rate",
      header: "Groepssignaal",
      meta: { label: "Groepssignaal" },
      cell: ({ getValue }) => `${Math.round(Number(getValue()) * 100)}%`
    },
    { accessorKey: "trend", header: "Trend", meta: { label: "Trend" } },
    {
      accessorKey: "confidence",
      header: "Zekerheid",
      meta: { label: "Zekerheid" },
      cell: ({ getValue }) => <ConfidenceBadge confidence={getValue() as IntelligenceConfidence} />
    }
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      detailDescription={(row) => `${row.group} · ${row.affected} van ${row.total} observaties`}
      detailTitle={(row) => row.skill}
      getRowId={(row) => row.id}
      renderDetails={(row) => (
        <div className="grid gap-5">
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="warning">Leskwaliteitssignaal</StatusPill>
            <ConfidenceBadge confidence={row.confidence} />
            {row.isTest ? <StatusPill tone="info">Journey Bot · alleen bekijken</StatusPill> : null}
          </div>
          <p className="rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm font-medium leading-6 text-foreground">
            {row.suggestedFocus}
          </p>
          <div className="grid gap-2">
            {row.reasons.map((reason) => (
              <article className="rounded-xl border border-border p-3" key={reason.code}>
                <p className="text-sm font-semibold text-foreground">{reason.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{reason.explanation}</p>
                <p className="mt-2 text-xs font-semibold text-primary">{reason.evidence}</p>
              </article>
            ))}
          </div>
          {row.participantNames.length ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Betrokken observaties</p>
              <p className="mt-2 text-sm leading-6 text-foreground">{row.participantNames.join(", ")}</p>
            </div>
          ) : null}
          {row.isTest ? (
            <p className="text-xs text-muted-foreground">Testsignalen blijven volledig gescheiden van operationele acties.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <form action={createBottleneckTaskAction}>
                <BottleneckInputs row={row} />
                <Button type="submit" variant="outline"><ClipboardPlus className="size-4" />Instructeurtaak</Button>
              </form>
              <form action={addBottleneckLessonFocusAction}>
                <BottleneckInputs row={row} />
                <Button type="submit" variant="outline"><Waves className="size-4" />Aan lesfocus toevoegen</Button>
              </form>
            </div>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            Namen zijn alleen zichtbaar voor bevoegd personeel. Het signaal beoordeelt de leercontext en plakt geen negatief label op kinderen.
          </p>
        </div>
      )}
      searchColumn="skill"
      searchPlaceholder="Zoek vaardigheid…"
      storageKey="admin.progress-bottlenecks"
    />
  );
}

function SignalInputs({ row }: { row: AttendanceSignalTableRow }) {
  return (
    <>
      <input name="participantId" type="hidden" value={row.participantId} />
      <input name="groupId" type="hidden" value={row.groupId} />
      <input name="signalType" type="hidden" value={row.signalType} />
      <input name="next" type="hidden" value="/admin/rapportages/leskwaliteit" />
    </>
  );
}

function BottleneckInputs({ row }: { row: BottleneckTableRow }) {
  return (
    <>
      <input name="groupId" type="hidden" value={row.groupId} />
      <input name="skillId" type="hidden" value={row.skillId} />
      <input name="next" type="hidden" value="/admin/rapportages/leskwaliteit" />
    </>
  );
}

function CapacityRiskBadge({ risk }: { risk: CapacityRiskLevel }) {
  const meta = {
    healthy: { label: "Gezond", tone: "success" as const },
    watch: { label: "Volgen", tone: "info" as const },
    bottleneck: { label: "Knelpunt", tone: "warning" as const },
    critical: { label: "Kritiek", tone: "danger" as const }
  }[risk];
  return <StatusPill tone={meta.tone}>{meta.label}</StatusPill>;
}

function AttendanceRiskBadge({ risk }: { risk: AttendanceRiskLevel }) {
  const meta = {
    watch: { label: "Volgen", tone: "info" as const },
    elevated: { label: "Verhoogd", tone: "warning" as const },
    high: { label: "Hoog", tone: "danger" as const }
  }[risk];
  return <StatusPill tone={meta.tone}>{meta.label}</StatusPill>;
}

function ConfidenceBadge({ confidence }: { confidence: IntelligenceConfidence }) {
  return (
    <StatusPill tone={confidence === "hoog" ? "success" : confidence === "middel" ? "info" : "neutral"}>
      {confidence} vertrouwen
    </StatusPill>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/35 p-3">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function formatForecastDate(value: string | null) {
  if (!value) return "onvoldoende historie";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}
