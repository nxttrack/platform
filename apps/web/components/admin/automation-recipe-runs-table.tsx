"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { StatusPill } from "@/components/shell/ui";
import { DataTable, dataTableTextFilter } from "@/components/ui/data-table";
import {
  getAutomationRecipeDefinition,
  type AutomationRecipeExecutionMode,
  type AutomationRecipeKey
} from "@/lib/domain/automation-recipe-contract";

export type AutomationRecipeRunTableRow = {
  id: string;
  recipeKey: AutomationRecipeKey;
  status: "running" | "completed" | "skipped" | "failed";
  executionMode: AutomationRecipeExecutionMode;
  triggerEntityType: string | null;
  reviewTaskId: string | null;
  actions: string[];
  reasons: string[];
  sourceData: Record<string, boolean | number | string | null>;
  confidence: number | null;
  skippedReason: string | null;
  errorCode: string | null;
  isTest: boolean;
  startedAt: string;
};

const columns: ColumnDef<AutomationRecipeRunTableRow, unknown>[] = [
  {
    accessorKey: "recipeKey",
    header: "Recipe",
    meta: { label: "Recipe" },
    filterFn: dataTableTextFilter,
    cell: ({ row }) => (
      <div>
        <p className="font-semibold text-foreground">{getAutomationRecipeDefinition(row.original.recipeKey).name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(row.original.startedAt)}</p>
      </div>
    )
  },
  {
    accessorKey: "executionMode",
    header: "Modus",
    meta: { label: "Modus" },
    cell: ({ getValue }) => <StatusPill tone={getValue() === "test" ? "info" : "neutral"}>{getValue() === "test" ? "Test" : "Live"}</StatusPill>
  },
  {
    accessorKey: "status",
    header: "Status",
    meta: { label: "Status" },
    cell: ({ getValue }) => {
      const status = String(getValue());
      return <StatusPill tone={status === "completed" ? "success" : status === "failed" ? "danger" : status === "skipped" ? "warning" : "info"}>{statusLabel(status)}</StatusPill>;
    }
  },
  {
    accessorKey: "confidence",
    header: "Confidence",
    meta: { label: "Confidence" },
    cell: ({ getValue }) => getValue() === null ? "—" : `${Math.round(Number(getValue()) * 100)}%`
  }
];

export function AutomationRecipeRunsTable({ rows }: { rows: AutomationRecipeRunTableRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      detailDescription={(row) => `${row.executionMode === "test" ? "Testmodus" : "Live controle"} · ${formatDateTime(row.startedAt)}`}
      detailTitle={(row) => getAutomationRecipeDefinition(row.recipeKey).name}
      filters={[
        {
          column: "executionMode",
          label: "Modus",
          options: [{ label: "Test", value: "test" }, { label: "Live", value: "live" }]
        },
        {
          column: "status",
          label: "Status",
          options: [
            { label: "Afgerond", value: "completed" },
            { label: "Overgeslagen", value: "skipped" },
            { label: "Mislukt", value: "failed" },
            { label: "Bezig", value: "running" }
          ]
        }
      ]}
      getRowId={(row) => row.id}
      renderDetails={(row) => <RunDetails row={row} />}
      searchColumn="recipeKey"
      searchPlaceholder="Zoek recipe-run…"
      storageKey="admin.automation-recipe-runs"
    />
  );
}

function RunDetails({ row }: { row: AutomationRecipeRunTableRow }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <StatusPill tone={row.executionMode === "test" ? "info" : "neutral"}>{row.executionMode === "test" ? "Test zonder bijwerking" : "Live interne controle"}</StatusPill>
        <StatusPill tone={row.status === "completed" ? "success" : row.status === "failed" ? "danger" : "warning"}>{statusLabel(row.status)}</StatusPill>
        {row.isTest ? <StatusPill tone="info">Testbron geblokkeerd</StatusPill> : null}
      </div>
      <section className="rounded-xl border border-border bg-muted/30 p-4">
        <h3 className="text-sm font-bold">Waarom deze uitkomst?</h3>
        <ul className="mt-3 grid gap-2 text-[13px] leading-5 text-muted-foreground">
          {row.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
        </ul>
      </section>
      <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
        <Detail label="Bronsoort" value={row.triggerEntityType ?? "Geen passend record"} />
        <Detail label="Confidence" value={row.confidence === null ? "Niet van toepassing" : `${Math.round(row.confidence * 100)}%`} />
        <Detail label="Skipreden" value={row.skippedReason ?? "—"} />
        <Detail label="Foutcode" value={row.errorCode ?? "—"} />
        <Detail label="Uitgevoerde veilige actie" value={row.actions.length ? row.actions.join(", ") : "Geen"} />
        <Detail label="Bronvelden" value={Object.entries(row.sourceData).map(([key, value]) => `${key}: ${String(value)}`).join(" · ") || "Geen"} />
      </dl>
      {row.reviewTaskId ? (
        <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground" href="/admin/taken">
          <ExternalLink className="size-4" aria-hidden="true" />
          Open controletaken
        </Link>
      ) : null}
      <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-950">
        Deze run heeft nooit een extern bericht, betaling, plaatsing of nadelige statusmutatie uitgevoerd.
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-background p-3"><dt className="text-xs font-bold text-foreground">{label}</dt><dd className="mt-1 break-words text-muted-foreground">{value}</dd></div>;
}

function statusLabel(value: string) {
  return ({ completed: "Afgerond", failed: "Mislukt", running: "Bezig", skipped: "Overgeslagen" } as Record<string, string>)[value] ?? value;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
