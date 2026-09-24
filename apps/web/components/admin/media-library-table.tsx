"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Eye, ExternalLink, ShieldCheck, TimerReset } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table";
import { StatusPill } from "@/components/shell/ui";
import type { MediaLibraryRow } from "@/lib/domain/media-library";

const columns: ColumnDef<MediaLibraryRow, unknown>[] = [
  { accessorKey: "participantName", header: "Leerling", cell: ({ row }) => <div><p className="font-bold">{row.original.participantName}</p><p className="text-xs text-muted-foreground">{row.original.caption}</p></div>, meta: { label: "Leerling" } },
  { accessorKey: "status", header: "Workflow", cell: ({ row }) => <StatusPill tone={row.original.status === "published" ? "success" : row.original.status === "draft" ? "info" : "warning"}>{row.original.status}</StatusPill>, meta: { label: "Workflow" } },
  { accessorKey: "consentStatus", header: "Privacy", cell: ({ row }) => <StatusPill tone={row.original.consentStatus === "active" ? "success" : row.original.consentStatus === "expired" ? "warning" : "danger"}>{row.original.consentStatus === "active" ? "toestemming actief" : row.original.consentStatus === "expired" ? "verlopen" : "geblokkeerd"}</StatusPill>, meta: { label: "Privacy" } },
  { accessorKey: "expiresAt", header: "Verloopt", cell: ({ row }) => <span className="text-sm">{formatDate(row.original.expiresAt)}</span>, meta: { label: "Verloopt" } },
  { accessorKey: "accessCount", header: "Inzage", cell: ({ row }) => <span className="text-sm font-semibold">{row.original.accessCount}×</span>, meta: { label: "Inzage" } },
  { accessorKey: "searchText", header: "Zoektekst", cell: () => null, meta: { label: "Zoektekst" } }
];

export function MediaLibraryTable({ rows }: { rows: MediaLibraryRow[] }) {
  return <DataTable columns={columns} data={rows} detailDescription={(row) => `${row.participantName} · ${formatDate(row.createdAt)}`} detailTitle={(row) => row.caption} filters={[{ column: "status", label: "Workflow", options: [...new Set(rows.map((row) => row.status))].map((value) => ({ label: value, value })) }, { column: "consentStatus", label: "Privacy", options: [{ label: "Toestemming actief", value: "active" }, { label: "Geblokkeerd", value: "blocked" }, { label: "Verlopen", value: "expired" }] }]} getRowId={(row) => row.id} renderDetails={(row) => <div className="grid gap-5">{row.mediaType === "video" ? <video className="aspect-[4/3] w-full rounded-2xl border border-border bg-muted object-cover" controls playsInline preload="metadata" src={`/api/files/participant-media/${row.id}?review=1`} /> : <img alt={row.caption} className="aspect-[4/3] w-full rounded-2xl border border-border bg-muted object-cover" src={`/api/files/participant-media/${row.id}?review=1`} />}<div className="grid gap-3 sm:grid-cols-3"><Detail icon={<ShieldCheck className="size-4" />} label="Privacy" value={row.consentStatus} /><Detail icon={<TimerReset className="size-4" />} label="Verloopt" value={formatDate(row.expiresAt)} /><Detail icon={<Eye className="size-4" />} label="Inzage" value={`${row.accessCount} keer`} /></div><Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground" href={`/admin/leerlingen/${row.participantId}/media`}><ExternalLink className="size-4" />Volledig mediadossier</Link></div>} searchColumn="searchText" searchPlaceholder="Zoek leerling, bijschrift of status…" storageKey="admin.media" />;
}
function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-xl border border-border bg-muted/20 p-3"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">{icon}{label}</div><p className="mt-2 text-sm font-semibold">{value}</p></div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value)); }
