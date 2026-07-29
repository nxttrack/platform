"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, ExternalLink, ListPlus, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";

import { StatusPill } from "@/components/shell/ui";
import { Button } from "@/components/ui/button";
import { DataTable, dataTableTextFilter } from "@/components/ui/data-table";
import {
  createDataQualityTaskAction,
  setDataQualityIssueStatusAction
} from "@/lib/domain/data-quality-actions";
import type {
  DataQualityIssueStatus,
  DataQualitySeverity
} from "@/lib/domain/data-quality-contract";

export type DataQualityTableRow = {
  id: string;
  entityType: string;
  entityLabel: string;
  entityHref: string;
  issueType: string;
  severity: DataQualitySeverity;
  title: string;
  description: string;
  suggestedAction: string;
  status: DataQualityIssueStatus;
  detectedAt: string;
  lastDetectedAt: string;
  confidence: number;
  evidence: string[];
  isTest: boolean;
};

export function DataQualityTable({ initialSearch, rows }: { initialSearch?: string; rows: DataQualityTableRow[] }) {
  const issueTypes = [...new Set(rows.map((row) => row.issueType))].sort();
  const entityTypes = [...new Set(rows.map((row) => row.entityType))].sort();
  const columns: ColumnDef<DataQualityTableRow, unknown>[] = [
    {
      id: "search",
      accessorFn: (row) => `${row.entityLabel} ${row.title} ${row.issueType}`,
      header: "Record",
      meta: { label: "Record" },
      filterFn: dataTableTextFilter,
      cell: ({ row }) => (
        <div className="min-w-52">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-semibold text-foreground">{row.original.entityLabel}</p>
            {row.original.isTest ? <StatusPill tone="info">Journey Bot</StatusPill> : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{entityTypeLabel(row.original.entityType)}</p>
        </div>
      )
    },
    {
      accessorKey: "title",
      header: "Signaal",
      meta: { label: "Signaal" },
      cell: ({ getValue }) => <span className="font-medium text-foreground">{String(getValue())}</span>
    },
    {
      accessorKey: "entityType",
      header: "Recordsoort",
      meta: { label: "Recordsoort" },
      cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{entityTypeLabel(String(getValue()))}</span>
    },
    {
      accessorKey: "issueType",
      header: "Type",
      meta: { label: "Type" },
      cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{issueTypeLabel(String(getValue()))}</span>
    },
    {
      accessorKey: "severity",
      header: "Ernst",
      meta: { label: "Ernst" },
      cell: ({ getValue }) => <StatusPill tone={severityTone(String(getValue()) as DataQualitySeverity)}>{severityLabel(String(getValue()) as DataQualitySeverity)}</StatusPill>
    },
    {
      accessorKey: "status",
      header: "Status",
      meta: { label: "Status" },
      cell: ({ getValue }) => <StatusPill tone={statusTone(String(getValue()) as DataQualityIssueStatus)}>{statusLabel(String(getValue()) as DataQualityIssueStatus)}</StatusPill>
    },
    {
      accessorKey: "lastDetectedAt",
      header: "Laatst gezien",
      meta: { label: "Laatst gezien" },
      cell: ({ getValue }) => formatDateTime(String(getValue()))
    }
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      detailDescription={(row) => `${entityTypeLabel(row.entityType)} · ${Math.round(row.confidence * 100)}% confidence`}
      detailTitle={(row) => row.title}
      emptyMessage="Geen datakwaliteitsissues voor deze selectie."
      filters={[
        {
          column: "severity",
          label: "Ernst",
          options: (["critical", "error", "warning", "info"] as DataQualitySeverity[]).map((value) => ({ label: severityLabel(value), value }))
        },
        {
          column: "status",
          label: "Status",
          options: (["open", "ignored", "resolved", "auto_resolved"] as DataQualityIssueStatus[]).map((value) => ({ label: statusLabel(value), value }))
        },
        {
          column: "issueType",
          label: "Type",
          options: issueTypes.map((value) => ({ label: issueTypeLabel(value), value }))
        },
        {
          column: "entityType",
          label: "Recordsoort",
          options: entityTypes.map((value) => ({ label: entityTypeLabel(value), value }))
        }
      ]}
      getRowId={(row) => row.id}
      initialSearchValue={initialSearch}
      renderDetails={(row) => (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={severityTone(row.severity)}>{severityLabel(row.severity)}</StatusPill>
            <StatusPill tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusPill>
            <StatusPill tone="neutral">{Math.round(row.confidence * 100)}% confidence</StatusPill>
            {row.isTest ? <StatusPill tone="info">Journey Bot-testdata</StatusPill> : null}
          </div>

          <section>
            <h3 className="text-sm font-bold text-foreground">Waarom dit relevant is</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{row.description}</p>
          </section>

          <section className="rounded-xl border border-primary/15 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-bold text-foreground">Aanbevolen vervolgstap</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{row.suggestedAction}</p>
                <p className="mt-2 text-xs font-semibold text-primary">NXTTRACK past de brondata niet automatisch aan.</p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-bold text-foreground">Brongegevens voor dit signaal</h3>
            <ul className="mt-2 grid gap-2">
              {row.evidence.map((evidence) => <li className="rounded-lg border border-border bg-muted/45 px-3 py-2 text-[13px] text-muted-foreground" key={evidence}>{evidence}</li>)}
            </ul>
          </section>

          <dl className="grid gap-2 sm:grid-cols-2">
            <Detail label="Record" value={row.entityLabel} />
            <Detail label="Recordsoort" value={entityTypeLabel(row.entityType)} />
            <Detail label="Eerst gedetecteerd" value={formatDateTime(row.detectedAt)} />
            <Detail label="Laatst gedetecteerd" value={formatDateTime(row.lastDetectedAt)} />
          </dl>

          <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-muted" href={row.entityHref}>
            <ExternalLink className="size-4" aria-hidden="true" />
            Betrokken record bekijken
          </Link>

          {row.status === "open" ? (
            <section className="rounded-xl border border-border bg-muted/30 p-4">
              <h3 className="text-sm font-bold text-foreground">Menselijke beslissing</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Deze acties wijzigen alleen het issue of maken een opvolgtaak. De leerling-, ouder-, planning- en betaaldata blijven ongewijzigd.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={createDataQualityTaskAction}>
                  <input name="issueId" type="hidden" value={row.id} />
                  <Button type="submit" variant="outline"><ListPlus className="size-4" />Maak taak</Button>
                </form>
                <form action={setDataQualityIssueStatusAction}>
                  <input name="issueId" type="hidden" value={row.id} />
                  <input name="status" type="hidden" value="ignored" />
                  <Button type="submit" variant="outline"><XCircle className="size-4" />Negeer false positive</Button>
                </form>
                <form action={setDataQualityIssueStatusAction}>
                  <input name="issueId" type="hidden" value={row.id} />
                  <input name="status" type="hidden" value="resolved" />
                  <Button type="submit"><CheckCircle2 className="size-4" />Markeer opgelost</Button>
                </form>
              </div>
            </section>
          ) : null}
        </div>
      )}
      searchColumn="search"
      searchPlaceholder="Zoek issue, leerling, groep of type…"
      storageKey="admin.data-quality"
    />
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/45 p-3"><dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-[13px] font-medium text-foreground">{value}</dd></div>;
}

function severityTone(severity: DataQualitySeverity) {
  return severity === "critical" || severity === "error" ? "danger" : severity === "warning" ? "warning" : "info";
}

function severityLabel(severity: DataQualitySeverity) {
  return ({ critical: "Kritiek", error: "Fout", warning: "Waarschuwing", info: "Informatie" } as const)[severity];
}

function statusTone(status: DataQualityIssueStatus) {
  return status === "open" ? "warning" : status === "ignored" ? "neutral" : "success";
}

function statusLabel(status: DataQualityIssueStatus) {
  return ({ open: "Open", ignored: "Genegeerd", resolved: "Opgelost", auto_resolved: "Automatisch hersteld" } as const)[status];
}

function entityTypeLabel(value: string) {
  return (
    {
      participant: "Leerling",
      guardian: "Ouder/verzorger",
      intake_submission: "Intake",
      waitlist_entry: "Wachtlijst",
      enrollment: "Inschrijving",
      group_membership: "Groepsplaatsing",
      group: "Lesgroep",
      session: "Sessie",
      subscription: "Abonnement",
      payment: "Betaling"
    } as Record<string, string>
  )[value] ?? value.replaceAll("_", " ");
}

function issueTypeLabel(value: string) {
  return value.replaceAll("_", " ");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
