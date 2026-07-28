"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Clock3, Database, UserRound } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { StatusPill } from "@/components/shell/ui";
import type { AuditExplorerRow } from "@/lib/domain/audit-explorer";

const columns: ColumnDef<AuditExplorerRow, unknown>[] = [
  { accessorKey: "createdAt", header: "Moment", cell: ({ row }) => <span className="whitespace-nowrap text-sm">{formatDateTime(row.original.createdAt)}</span>, meta: { label: "Moment" } },
  { accessorKey: "event", header: "Gebeurtenis", cell: ({ row }) => <div><p className="font-mono text-xs font-bold text-foreground">{row.original.event}</p><p className="mt-1 text-xs text-muted-foreground">{row.original.subject}</p></div>, meta: { label: "Gebeurtenis" } },
  { accessorKey: "actor", header: "Door", cell: ({ row }) => <span className="text-sm font-semibold">{row.original.actor}</span>, meta: { label: "Door" } },
  { accessorKey: "source", header: "Bron", cell: ({ row }) => <span className="text-sm">{sourceLabel(row.original.source)}</span>, meta: { label: "Bron" } },
  { accessorKey: "outcome", header: "Resultaat", cell: ({ row }) => <StatusPill tone={outcomeTone(row.original.outcome)}>{outcomeLabel(row.original.outcome)}</StatusPill>, meta: { label: "Resultaat" } },
  { accessorKey: "searchText", header: "Zoektekst", enableHiding: true, cell: () => null, meta: { label: "Zoektekst" } }
];

export function AuditExplorerTable({ rows, storageKey }: { rows: AuditExplorerRow[]; storageKey: string }) {
  const sources = [...new Set(rows.map((row) => row.source))].sort();
  return <DataTable
    columns={columns}
    data={rows}
    detailDescription={(row) => `${sourceLabel(row.source)} · ${formatDateTime(row.createdAt)}`}
    detailTitle={(row) => row.event}
    filters={[
      { column: "source", label: "Bron", options: sources.map((source) => ({ label: sourceLabel(source), value: source })) },
      { column: "outcome", label: "Resultaat", options: ["applied", "completed", "failed", "informational", "reverted"].map((value) => ({ label: outcomeLabel(value), value })) }
    ]}
    getRowId={(row) => row.id}
    initialPageSize={20}
    renderDetails={(row) => <div className="grid gap-4"><div className="grid gap-3 sm:grid-cols-3"><Detail icon={<UserRound className="size-4" />} label="Actor" value={row.actor} /><Detail icon={<Clock3 className="size-4" />} label="Moment" value={formatDateTime(row.createdAt)} /><Detail icon={<Database className="size-4" />} label="Bron" value={sourceLabel(row.source)} /></div><section><h3 className="text-sm font-bold">Object</h3><p className="mt-1 text-sm text-muted-foreground">{row.subject}</p></section><section><h3 className="text-sm font-bold">Veilig auditdetail</h3><pre className="mt-2 max-h-96 overflow-auto rounded-xl border border-border bg-slate-950 p-4 text-xs leading-5 text-slate-100">{JSON.stringify(row.payload, null, 2)}</pre><p className="mt-2 text-xs text-muted-foreground">Secrets, tokens en wachtwoorden worden altijd afgeschermd.</p></section></div>}
    searchColumn="searchText"
    searchPlaceholder="Zoek gebeurtenis, actor of object…"
    storageKey={storageKey}
  />;
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-xl border border-border bg-muted/30 p-3"><div className="flex items-center gap-2 text-primary">{icon}<span className="text-xs font-bold uppercase tracking-wider">{label}</span></div><p className="mt-2 text-sm font-semibold">{value}</p></div>; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function sourceLabel(value: string) { return ({ automation: "Automatisering", control_plane: "Platformbeheer", diploma: "Diploma", import: "Import", placement: "Plaatsing", planning: "Planning", privacy_media: "Privacy-media" } as Record<string, string>)[value] ?? value; }
function outcomeLabel(value: string) { return ({ applied: "Toegepast", completed: "Afgerond", failed: "Mislukt", informational: "Informatie", reverted: "Teruggedraaid" } as Record<string, string>)[value] ?? value; }
function outcomeTone(value: AuditExplorerRow["outcome"]) { return value === "failed" ? "danger" as const : value === "reverted" ? "warning" as const : value === "informational" ? "info" as const : "success" as const; }
