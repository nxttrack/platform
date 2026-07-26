"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowRight, Users } from "lucide-react";
import Link from "next/link";

import { DataTable, dataTableTextFilter } from "@/components/ui/data-table";
import { StatusPill } from "@/components/shell/ui";

export type FamilyTableRow = {
  guardianId: string;
  guardianName: string;
  guardianEmail: string;
  children: string;
  waiting: string;
  childCount: number;
  waitingCount: number;
};

export function FamiliesTable({ rows }: { rows: FamilyTableRow[] }) {
  const columns: ColumnDef<FamilyTableRow, unknown>[] = [
    {
      id: "guardian",
      accessorFn: (row) => `${row.guardianName} ${row.guardianEmail}`,
      header: "Ouder/verzorger",
      meta: { label: "Ouder/verzorger" },
      filterFn: dataTableTextFilter,
      cell: ({ row }) => <div><p className="font-semibold">{row.original.guardianName}</p><p className="text-xs text-muted-foreground">{row.original.guardianEmail}</p></div>
    },
    { accessorKey: "children", header: "Kinderen", meta: { label: "Kinderen" }, cell: ({ row }) => row.original.children || "Nog niet gekoppeld" },
    { accessorKey: "childCount", header: "Gezin", meta: { label: "Gezin" }, cell: ({ getValue }) => <StatusPill tone={Number(getValue()) > 1 ? "info" : "neutral"}><Users className="size-3" /> {String(getValue())}</StatusPill> },
    { accessorKey: "waitingCount", header: "Wachtlijst", meta: { label: "Wachtlijst" }, cell: ({ getValue }) => <StatusPill tone={Number(getValue()) > 0 ? "warning" : "success"}>{String(getValue())} wachtend</StatusPill> },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => <Link className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-primary hover:bg-muted" href={`/admin/gezinnen/${row.original.guardianId}`}>Dossier <ArrowRight className="size-4" /></Link>
    }
  ];
  return <DataTable columns={columns} data={rows} getRowId={(row) => row.guardianId} searchColumn="guardian" searchPlaceholder="Zoek ouder, e-mail of gezin…" storageKey="admin.families" />;
}
