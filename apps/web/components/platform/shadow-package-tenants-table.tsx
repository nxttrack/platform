"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Box, Building2, Database, Users } from "lucide-react";

import { StatusPill } from "@/components/shell/ui";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { DataTable, dataTableTextFilter } from "@/components/ui/data-table";
import { assignShadowPackageAction } from "@/lib/domain/shadow-entitlements-actions";
import type { ShadowPackageTenantRow } from "@/lib/domain/shadow-entitlements";

type PackageOption = { id: string; name: string; status: string };

export function ShadowPackageTenantsTable({
  canManage,
  packages,
  rows
}: {
  canManage: boolean;
  packages: PackageOption[];
  rows: ShadowPackageTenantRow[];
}) {
  const columns: ColumnDef<ShadowPackageTenantRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Organisatie",
      meta: { label: "Organisatie" },
      filterFn: dataTableTextFilter,
      cell: ({ row }) => <div><p className="font-semibold">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.slug}</p></div>
    },
    {
      accessorKey: "packageName",
      header: "Simulatiepakket",
      meta: { label: "Simulatiepakket" },
      cell: ({ getValue }) => <span className="inline-flex items-center gap-2 font-semibold"><Box className="size-4 text-primary" />{String(getValue())}</span>
    },
    {
      accessorKey: "activeParticipants",
      header: "Leerlingen",
      meta: { label: "Leerlingen" },
      cell: ({ getValue }) => <span className="inline-flex items-center gap-2"><Users className="size-4 text-muted-foreground" />{String(getValue())}</span>
    },
    {
      accessorKey: "activeStaff",
      header: "Team",
      meta: { label: "Team" }
    },
    {
      accessorKey: "locations",
      header: "Locaties",
      meta: { label: "Locaties" },
      cell: ({ getValue }) => <span className="inline-flex items-center gap-2"><Building2 className="size-4 text-muted-foreground" />{String(getValue())}</span>
    },
    {
      accessorKey: "storageGb",
      header: "Opslag",
      meta: { label: "Opslag" },
      cell: ({ getValue }) => <span className="inline-flex items-center gap-2"><Database className="size-4 text-muted-foreground" />{String(getValue())} GB</span>
    },
    {
      accessorKey: "evaluationStatus",
      header: "Shadow-resultaat",
      meta: { label: "Shadow-resultaat" },
      cell: ({ row }) => <ShadowStatus status={row.original.evaluationStatus} />
    }
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      detailDescription={(row) => `${row.packageName} · toegang blijft volledig actief`}
      detailTitle={(row) => row.name}
      filters={[
        {
          column: "evaluationStatus",
          label: "Shadow-resultaat",
          options: [
            { label: "Binnen limiet", value: "within" },
            { label: "Nadert limiet", value: "approaching" },
            { label: "Overschreden", value: "exceeded" },
            { label: "Niet gemeten", value: "not_measured" }
          ]
        },
        {
          column: "packageName",
          label: "Simulatiepakket",
          options: packages.map((item) => ({ label: item.name, value: item.name }))
        }
      ]}
      getRowId={(row) => row.id}
      renderDetails={(row) => (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-2">
            <DetailMetric label="Functies in simulatie" value={`${row.featureIncludedCount}/${row.featureTotalCount}`} />
            <DetailMetric label="Toegang geblokkeerd" value="0" />
            <DetailMetric label="Actieve leerlingen" value={String(row.activeParticipants)} />
            <DetailMetric label="Gevolgde opslag" value={`${row.storageGb} GB`} />
          </div>
          <section className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-bold">Uitlegbare limietmeting</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Brondata en reden per zachte limiet. Dit scherm voert geen autorisatiebesluit uit.</p></div>
              <ShadowStatus status={row.evaluationStatus} />
            </div>
            <div className="mt-3 grid gap-2">
              {row.evaluations.length ? row.evaluations.map((item) => (
                <article className="rounded-lg border border-border bg-card p-3" key={item.key}>
                  <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{item.label}</p><StatusPill tone={statusTone(item.evaluation.status)}>{item.value} / {item.limit}{item.unit === "gigabytes" ? " GB" : ""}</StatusPill></div>
                  <p className="mt-2 text-xs font-medium text-foreground">{item.evaluation.headline}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
                    {item.evaluation.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                </article>
              )) : <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Dit pakket heeft geen zachte limieten. Volledige toegang blijft actief.</p>}
            </div>
          </section>
          {canManage ? (
            <ConfirmActionForm
              action={assignShadowPackageAction}
              confirmLabel="Simulatiepakket wijzigen"
              description="Alleen de simulatie verandert. Geen functie, account of tenanttoegang wordt geblokkeerd."
              hiddenFields={{ humanConfirmation: "assign-shadow-package", tenantId: row.id }}
              title={`Pakketsimulatie voor ${row.name} wijzigen?`}
              triggerLabel="Simulatie wijzigen"
              triggerVariant="outline"
            >
              <label className="mb-3 grid gap-2 text-sm font-semibold">
                Nieuw simulatiepakket
                <select className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm" defaultValue={row.packageId} name="packageId">
                  {packages.map((item) => <option key={item.id} value={item.id}>{item.name}{item.status === "draft" ? " · concept" : ""}</option>)}
                </select>
              </label>
            </ConfirmActionForm>
          ) : null}
        </div>
      )}
      searchColumn="name"
      searchPlaceholder="Zoek organisatie…"
      storageKey="platform.package-simulations"
    />
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-card p-3"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>;
}

function ShadowStatus({ status }: { status: ShadowPackageTenantRow["evaluationStatus"] }) {
  const label = status === "exceeded" ? "Zacht overschreden" : status === "approaching" ? "Nadert limiet" : status === "within" ? "Binnen limiet" : "Niet gemeten";
  return <StatusPill tone={statusTone(status)}>{label}</StatusPill>;
}

function statusTone(status: ShadowPackageTenantRow["evaluationStatus"]) {
  return status === "exceeded" ? "danger" as const : status === "approaching" ? "warning" as const : status === "within" ? "success" as const : "neutral" as const;
}
