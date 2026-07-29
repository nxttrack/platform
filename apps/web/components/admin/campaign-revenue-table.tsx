"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { StatusPill } from "@/components/shell/ui";
import { DataTable, dataTableTextFilter } from "@/components/ui/data-table";
import type { CampaignFunnelRow } from "@/lib/analytics/campaign-revenue-contract";

export function CampaignRevenueTable({ rows }: { rows: CampaignFunnelRow[] }) {
  const columns: ColumnDef<CampaignFunnelRow, unknown>[] = [
    {
      id: "campaignSearch",
      accessorFn: (row) => `${row.channelLabel} ${row.source} ${row.medium} ${row.campaign}`,
      header: "Campagne",
      meta: { label: "Campagne" },
      filterFn: dataTableTextFilter,
      cell: ({ row }) => <div><p className="font-semibold">{row.original.campaign}</p><p className="text-xs text-muted-foreground">{row.original.source} · {row.original.medium}</p></div>
    },
    { accessorKey: "channel", header: "Kanaal", meta: { label: "Kanaal" }, cell: ({ row }) => row.original.channelLabel },
    { accessorKey: "intakes", header: "Intakes", meta: { label: "Intakes" } },
    { accessorKey: "placements", header: "Geplaatst", meta: { label: "Geplaatst" } },
    { accessorKey: "activeSubscriptions", header: "Actief", meta: { label: "Actieve abonnementen" } },
    { accessorKey: "placementConversion", header: "Conversie", meta: { label: "Plaatsingsconversie" }, cell: ({ getValue }) => `${String(getValue())}%` },
    { id: "netReceived", accessorFn: (row) => Object.values(row.netReceivedByCurrency).reduce((sum, value) => sum + value, 0), header: "Netto ontvangen", meta: { label: "Netto ontvangen" }, cell: ({ row }) => formatMoneyMap(row.original.netReceivedByCurrency) },
    { accessorKey: "confidence", header: "Confidence", meta: { label: "Confidence" }, cell: ({ getValue }) => <StatusPill tone={getValue() === "high" ? "success" : getValue() === "medium" ? "info" : "warning"}>{String(getValue())}</StatusPill> }
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      detailDescription={(row) => `${row.channelLabel} · ${row.source} · ${row.medium}`}
      detailTitle={(row) => row.campaign}
      filters={[{
        column: "channel",
        label: "Kanaal",
        options: [...new Map(rows.map((row) => [row.channel, { label: row.channelLabel, value: row.channel }])).values()]
      }, {
        column: "confidence",
        label: "Confidence",
        options: [{ label: "Hoog", value: "high" }, { label: "Middel", value: "medium" }, { label: "Laag", value: "low" }]
      }]}
      getRowId={(row) => row.key}
      renderDetails={(row) => <CampaignDetails row={row} />}
      searchColumn="campaignSearch"
      searchPlaceholder="Zoek campagne, source of medium…"
      storageKey="admin.campaign-revenue"
    />
  );
}

function CampaignDetails({ row }: { row: CampaignFunnelRow }) {
  const steps = [
    { label: "Intakes", value: row.intakes },
    { label: "Proeflessen", value: row.trials },
    { label: "Geplaatst", value: row.placements },
    { label: "Gestart", value: row.started },
    { label: "Actief abonnement", value: row.activeSubscriptions },
    { label: "Betalende leads", value: row.payingLeads }
  ];
  const maximum = Math.max(1, row.intakes);
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        {steps.map((step) => (
          <div className="grid grid-cols-[8rem_minmax(0,1fr)_3rem] items-center gap-3" key={step.label}>
            <span className="text-xs font-semibold text-muted-foreground">{step.label}</span>
            <div className="h-7 overflow-hidden rounded-full bg-muted"><div className="flex h-full min-w-8 items-center rounded-full bg-primary px-2 text-[11px] font-bold text-primary-foreground" style={{ width: `${Math.max(4, (step.value / maximum) * 100)}%` }}>{step.value}</div></div>
            <span className="text-right text-xs font-bold">{Math.round((step.value / maximum) * 100)}%</span>
          </div>
        ))}
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        <Detail label="Netto ontvangen betalingen" value={formatMoneyMap(row.netReceivedByCurrency)} />
        <Detail label="Plaatsingsconversie" value={`${row.placementConversion}%`} />
        <Detail label="Abonnementsconversie" value={`${row.subscriptionConversion}%`} />
        <Detail label="Attributieconfidence" value={row.confidence} />
      </dl>
      <section className="rounded-xl border border-border bg-muted/30 p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Waarom deze confidence</h3>
        <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">{row.confidenceReasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>
      </section>
      <p className="text-xs text-muted-foreground">Netto ontvangen = betaald bedrag minus geregistreerde refunds en chargebacks. Dit is geen boekhoudkundige omzet en valuta worden nooit samengevoegd.</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border p-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>;
}

function formatMoneyMap(values: Record<string, number>) {
  const entries = Object.entries(values);
  if (entries.length === 0) return "€ 0,00";
  return entries.map(([currency, cents]) => new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(cents / 100)).join(" · ");
}
