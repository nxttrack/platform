"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, ExternalLink, ListTodo, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";

import { StatusPill } from "@/components/shell/ui";
import { DataTable, dataTableTextFilter } from "@/components/ui/data-table";
import {
  createNextBestActionTaskAction,
  setNextBestActionStatusAction
} from "@/lib/domain/next-best-actions-actions";
import {
  nextBestActionTypeLabels,
  nextBestActionTypes,
  type NextBestActionPriority,
  type NextBestActionReason,
  type NextBestActionType
} from "@/lib/domain/next-best-actions-contract";

export type NextBestActionTableRow = {
  id: string;
  actionType: NextBestActionType;
  title: string;
  description: string;
  priority: NextBestActionPriority;
  status: "open" | "dismissed" | "completed" | "auto_resolved";
  dueAt: string | null;
  reasons: NextBestActionReason[];
  sourceHref: string;
  confidence: number;
  isTest: boolean;
  generatedAt: string;
};

const columns: ColumnDef<NextBestActionTableRow, unknown>[] = [
  {
    accessorKey: "title",
    header: "Actie",
    meta: { label: "Actie" },
    filterFn: dataTableTextFilter,
    cell: ({ row }) => (
      <div className="min-w-56">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-foreground">{row.original.title}</p>
          {row.original.isTest ? <StatusPill tone="info">Journey Bot</StatusPill> : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{row.original.description}</p>
      </div>
    )
  },
  {
    accessorKey: "actionType",
    header: "Type",
    meta: { label: "Type" },
    cell: ({ getValue }) => nextBestActionTypeLabels[getValue() as NextBestActionType]
  },
  {
    accessorKey: "priority",
    header: "Prioriteit",
    meta: { label: "Prioriteit" },
    cell: ({ getValue }) => <PriorityPill priority={getValue() as NextBestActionPriority} />
  },
  {
    accessorKey: "dueAt",
    header: "Uiterlijk",
    meta: { label: "Uiterlijk" },
    cell: ({ getValue }) => getValue() ? formatDate(String(getValue())) : <span className="text-muted-foreground">Vandaag bekijken</span>
  },
  {
    accessorKey: "status",
    header: "Status",
    meta: { label: "Status" },
    cell: ({ getValue }) => <StatusPill tone={statusTone(String(getValue()))}>{statusLabel(String(getValue()))}</StatusPill>
  }
];

export function NextBestActionsTable({
  initialSearch,
  rows
}: {
  initialSearch?: string;
  rows: NextBestActionTableRow[];
}) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      detailDescription={(row) => `${nextBestActionTypeLabels[row.actionType]} · ${Math.round(row.confidence * 100)}% confidence`}
      detailTitle={(row) => row.title}
      filters={[
        {
          column: "actionType",
          label: "Type",
          options: nextBestActionTypes.map((value) => ({ label: nextBestActionTypeLabels[value], value }))
        },
        {
          column: "priority",
          label: "Prioriteit",
          options: [
            { label: "Hoog", value: "high" },
            { label: "Middel", value: "medium" },
            { label: "Laag", value: "low" }
          ]
        },
        {
          column: "status",
          label: "Status",
          options: [
            { label: "Open", value: "open" },
            { label: "Genegeerd", value: "dismissed" },
            { label: "Afgerond", value: "completed" },
            { label: "Automatisch opgelost", value: "auto_resolved" }
          ]
        }
      ]}
      getRowId={(row) => row.id}
      initialSearchValue={initialSearch}
      renderDetails={(row) => <ActionDetails row={row} />}
      searchColumn="title"
      searchPlaceholder="Zoek actie of signaal…"
      storageKey="admin.next-best-actions"
    />
  );
}

function ActionDetails({ row }: { row: NextBestActionTableRow }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityPill priority={row.priority} />
        <StatusPill tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusPill>
        <StatusPill tone="info">{Math.round(row.confidence * 100)}% confidence</StatusPill>
        {row.isTest ? <StatusPill tone="info">Journey Bot-testdata</StatusPill> : null}
      </div>
      <p className="text-[13px] leading-6 text-foreground">{row.description}</p>

      <section className="rounded-xl border border-border bg-muted/25 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          Waarom staat dit hier?
        </h3>
        <div className="mt-3 grid gap-2">
          {row.reasons.map((reason) => (
            <div className="rounded-lg bg-card px-3 py-2 shadow-soft" key={`${reason.label}-${reason.evidence}`}>
              <p className="text-xs font-bold text-foreground">{reason.label}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{reason.explanation}</p>
              <p className="mt-1 text-[11px] font-semibold text-primary">Bron: {reason.evidence}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900">
        Dit is een advies. NXTTRACK voert geen plaatsing, betaling, bericht of roosterwijziging automatisch uit.
      </p>

      <div className="flex flex-wrap gap-2">
        <Link className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground" href={row.sourceHref}>
          <ExternalLink className="size-4" aria-hidden="true" />
          Bekijk brondata
        </Link>
        {row.status === "open" ? (
          <>
            <ActionForm actionId={row.id} icon={ListTodo} label="Maak taak" serverAction={createNextBestActionTaskAction} />
            <ActionForm actionId={row.id} icon={XCircle} label="Negeer" serverAction={setNextBestActionStatusAction} status="dismissed" />
            <ActionForm actionId={row.id} icon={CheckCircle2} label="Markeer gedaan" serverAction={setNextBestActionStatusAction} status="completed" />
          </>
        ) : null}
      </div>
    </div>
  );
}

function ActionForm({
  actionId,
  icon: Icon,
  label,
  serverAction,
  status
}: {
  actionId: string;
  icon: typeof CheckCircle2;
  label: string;
  serverAction: (formData: FormData) => void | Promise<void>;
  status?: string;
}) {
  return (
    <form action={serverAction}>
      <input name="actionId" type="hidden" value={actionId} />
      {status ? <input name="status" type="hidden" value={status} /> : null}
      <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted" type="submit">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </button>
    </form>
  );
}

function PriorityPill({ priority }: { priority: NextBestActionPriority }) {
  return <StatusPill tone={priority === "high" ? "danger" : priority === "medium" ? "warning" : "neutral"}>{priority === "high" ? "Hoog" : priority === "medium" ? "Middel" : "Laag"}</StatusPill>;
}

function statusLabel(status: string) {
  return ({ open: "Open", dismissed: "Genegeerd", completed: "Afgerond", auto_resolved: "Automatisch opgelost" } as Record<string, string>)[status] ?? status;
}

function statusTone(status: string) {
  return status === "open" ? "warning" as const : status === "completed" || status === "auto_resolved" ? "success" as const : "neutral" as const;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
