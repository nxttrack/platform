"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Clock3, RefreshCw, Sparkles, Users } from "lucide-react";

import { SubmitButton } from "@/components/admin/domain-ui";
import { DataTable, dataTableTextFilter } from "@/components/ui/data-table";
import { Progress } from "@/components/ui/progress";
import { StatusPill } from "@/components/shell/ui";
import { createSlotOfferAction, scoreWaitlistEntryAction } from "@/lib/domain/placement-actions";

export type PlacementCockpitRow = {
  id: string;
  participantName: string;
  parentName: string;
  parentEmail: string;
  program: string;
  stage: string | null;
  status: string;
  priorityDate: string;
  proposals: Array<{ capacity: number; groupId: string; groupName: string; reasons: string[]; score: number }>;
  offerGroups: Array<{ id: string; name: string }>;
  offers: Array<{ deliveryStatus: string; groupName: string; status: string }>;
};

const columns: ColumnDef<PlacementCockpitRow, unknown>[] = [
  {
    accessorKey: "participantName",
    header: "Deelnemer",
    cell: ({ row }) => <div><p className="font-semibold text-foreground">{row.original.participantName}</p><p className="text-xs text-muted-foreground">{row.original.parentName}</p></div>,
    filterFn: dataTableTextFilter
  },
  { accessorKey: "program", header: "Programma", meta: { label: "Programma" } },
  { accessorKey: "stage", header: "Niveau", meta: { label: "Niveau" }, cell: ({ getValue }) => String(getValue() || "Nog te bepalen") },
  {
    id: "bestMatch",
    accessorFn: (row) => row.proposals[0]?.score ?? 0,
    header: "Beste match",
    meta: { label: "Beste match" },
    cell: ({ row }) => row.original.proposals[0] ? <div className="min-w-36"><p className="font-semibold text-foreground">{row.original.proposals[0].groupName}</p><p className="text-xs text-muted-foreground">score {Math.round(row.original.proposals[0].score)} · {row.original.proposals[0].capacity} vrij</p></div> : <span className="text-muted-foreground">Geen match</span>
  },
  {
    accessorKey: "status",
    header: "Status",
    meta: { label: "Status" },
    cell: ({ getValue }) => { const status = String(getValue()); return <StatusPill tone={status === "waiting" ? "info" : status === "offered" ? "warning" : status === "placed" ? "success" : "neutral"}>{statusLabel(status)}</StatusPill>; }
  },
  { accessorKey: "priorityDate", header: "Sinds", meta: { label: "Prioriteit" }, cell: ({ getValue }) => new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(String(getValue()))) }
];

export function PlacementCockpit({ rows }: { rows: PlacementCockpitRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      detailDescription={(row) => `${row.program} · ${row.parentName}`}
      detailTitle={(row) => row.participantName}
      filters={[{ column: "status", label: "Statussen", options: ["waiting", "reviewing", "offered", "placed", "declined"].map((value) => ({ label: statusLabel(value), value })) }]}
      getRowId={(row) => row.id}
      renderDetails={(row) => <PlacementDetails row={row} />}
      searchColumn="participantName"
      searchPlaceholder="Zoek deelnemer…"
      storageKey="admin.placement"
    />
  );
}

function PlacementDetails({ row }: { row: PlacementCockpitRow }) {
  return (
    <div className="grid gap-6">
      <section className="grid grid-cols-2 gap-3">
        <DetailStat icon={Clock3} label="Wacht sinds" value={new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(row.priorityDate))} />
        <DetailStat icon={Users} label="Alternatieven" value={String(Math.max(0, row.proposals.length - 1))} />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h3 className="font-bold text-foreground">Verklaarbare voorstellen</h3><p className="text-sm text-muted-foreground">Capaciteit, niveau en voorkeur bepalen de score.</p></div>
          <form action={scoreWaitlistEntryAction}><input name="waitlistEntryId" type="hidden" value={row.id} /><button className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" type="submit" aria-label="Voorstellen herberekenen"><RefreshCw className="size-4" /></button></form>
        </div>
        <div className="grid gap-3">
          {row.proposals.map((proposal, index) => <article className="rounded-xl border border-border p-3" key={proposal.groupId}><div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-semibold text-foreground">{index === 0 ? <Sparkles className="size-4 text-primary" /> : null}{proposal.groupName}</p><p className="mt-1 text-xs text-muted-foreground">{proposal.reasons.join(" · ")}</p></div><span className="text-lg font-bold text-primary">{Math.round(proposal.score)}</span></div><Progress className="mt-3" value={Math.min(100, proposal.score)} aria-label={`Matchscore ${Math.round(proposal.score)} van 100`} /></article>)}
          {!row.proposals.length ? <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Geen actieve groep voldoet aan de basisvoorwaarden.</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <h3 className="font-bold text-foreground">Handmatig goedkeuren</h3>
        <p className="mt-1 text-sm text-muted-foreground">Kies bewust een voorstel of alternatief; er wordt pas daarna een aanbod verstuurd.</p>
        <form action={createSlotOfferAction} className="mt-4 grid gap-3">
          <input name="waitlistEntryId" type="hidden" value={row.id} />
          <label className="grid gap-1.5 text-sm font-semibold text-foreground" htmlFor={`placement-group-${row.id}`}>Groep<select className="h-10 rounded-lg border border-border bg-background px-3 font-normal" id={`placement-group-${row.id}`} name="groupId" required defaultValue=""><option disabled value="">Kies een groep</option>{row.offerGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          <SubmitButton>Goedkeuren en aanbod maken</SubmitButton>
        </form>
      </section>

      {row.offers.length ? <section><h3 className="font-bold text-foreground">Recente aanbiedingen</h3><div className="mt-2 grid gap-2">{row.offers.slice(0, 5).map((offer, index) => <div className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2 text-sm" key={`${offer.groupName}-${index}`}><CheckCircle2 className="size-4 text-primary" /><span className="flex-1 font-medium">{offer.groupName}</span><span className="text-muted-foreground">{offer.status} · {offer.deliveryStatus}</span></div>)}</div></section> : null}
    </div>
  );
}

function DetailStat({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return <div className="rounded-xl bg-muted p-3"><Icon className="size-4 text-primary" /><p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-bold text-foreground">{value}</p></div>;
}

function statusLabel(status: string) {
  return ({ waiting: "Wachtend", reviewing: "In beoordeling", offered: "Aangeboden", placed: "Geplaatst", declined: "Afgewezen" } as Record<string, string>)[status] ?? status;
}
