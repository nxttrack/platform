"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/data-table";
import { CommunicationTemplateForm } from "@/components/communication/communication-forms";
import {
  communicationTemplateChannelLabels,
  newsletterStatusLabels,
  type CommunicationTemplateChannel,
  type NewsletterStatus
} from "@/lib/domain/communication-hub-contract";
import type {
  CommunicationDeliveryRow,
  CommunicationNotification,
  CommunicationTemplateRow,
  NewsletterCampaignRow
} from "@/lib/domain/communication-hub";

export function CommunicationTemplatesTable({ data }: { data: CommunicationTemplateRow[] }) {
  const columns: ColumnDef<CommunicationTemplateRow, unknown>[] = [
    { accessorKey: "name", header: "Template", meta: { label: "Template" } },
    {
      accessorKey: "channel",
      header: "Kanaal",
      cell: ({ row }) => communicationTemplateChannelLabels[row.original.channel as CommunicationTemplateChannel] ?? row.original.channel,
      meta: { label: "Kanaal" }
    },
    { accessorKey: "status", header: "Status", meta: { label: "Status" } },
    {
      accessorKey: "updated_at",
      header: "Gewijzigd",
      cell: ({ row }) => formatDate(row.original.updated_at),
      meta: { label: "Gewijzigd" }
    }
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      detailDescription={(row) => `${row.template_key} · ${row.channel}`}
      detailTitle={(row) => row.name}
      filters={[{ column: "channel", label: "Kanaal", options: [...new Set(data.map((row) => row.channel))].map((value) => ({ label: value, value })) }]}
      getRowId={(row) => row.id}
      renderDetails={(row) => (
        <div className="grid gap-5 text-sm">
          <Detail label="Onderwerp" value={row.subject || "Niet van toepassing"} />
          <Detail label="Variabelen" value={row.variables_json.length ? row.variables_json.map((value) => `{{${value}}}`).join(", ") : "Geen"} />
          <Detail label="Status" value={row.status} />
          <div className="rounded-xl border border-border bg-muted/30 p-4" dangerouslySetInnerHTML={{ __html: previewHtml(row.content_html) }} />
          <section className="border-t border-border pt-5">
            <h3 className="mb-3 font-bold text-foreground">Template bewerken</h3>
            <CommunicationTemplateForm template={row} />
          </section>
        </div>
      )}
      searchColumn="name"
      searchPlaceholder="Zoek template…"
      storageKey="communication_templates"
    />
  );
}

export function NewsletterCampaignsTable({ data }: { data: NewsletterCampaignRow[] }) {
  const columns: ColumnDef<NewsletterCampaignRow, unknown>[] = [
    { accessorKey: "title", header: "Campagne", meta: { label: "Campagne" } },
    { accessorKey: "subject", header: "Onderwerp", meta: { label: "Onderwerp" } },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => newsletterStatusLabels[row.original.status as NewsletterStatus] ?? row.original.status,
      meta: { label: "Status" }
    },
    {
      accessorKey: "scheduled_at",
      header: "Planning",
      cell: ({ row }) => row.original.scheduled_at ? formatDate(row.original.scheduled_at) : "Niet gepland",
      meta: { label: "Planning" }
    }
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      detailDescription={(row) => newsletterStatusLabels[row.status as NewsletterStatus] ?? row.status}
      detailTitle={(row) => row.title}
      filters={[{ column: "status", label: "Status", options: [...new Set(data.map((row) => row.status))].map((value) => ({ label: value, value })) }]}
      getRowId={(row) => row.id}
      renderDetails={(row) => (
        <div className="grid gap-3 text-sm">
          <Detail label="Onderwerp" value={row.subject} />
          <Detail label="Preheader" value={row.preheader || "Geen"} />
          <Detail label="Segment" value={String(row.segment_filters_json.segment ?? "Niet gekozen")} />
          <div className="rounded-xl border border-border bg-muted/30 p-4" dangerouslySetInnerHTML={{ __html: previewHtml(row.content_html) }} />
        </div>
      )}
      searchColumn="title"
      searchPlaceholder="Zoek nieuwsbrief…"
      storageKey="newsletter_campaigns"
    />
  );
}

export function NotificationTable({ data }: { data: CommunicationNotification[] }) {
  const columns: ColumnDef<CommunicationNotification, unknown>[] = [
    { accessorKey: "title", header: "Notificatie", meta: { label: "Notificatie" } },
    { accessorKey: "priority", header: "Prioriteit", meta: { label: "Prioriteit" } },
    { accessorKey: "status", header: "Status", meta: { label: "Status" } },
    { accessorKey: "entity_type", header: "Context", cell: ({ row }) => row.original.entity_type ?? "Algemeen", meta: { label: "Context" } },
    { accessorKey: "created_at", header: "Aangemaakt", cell: ({ row }) => formatDate(row.original.created_at), meta: { label: "Aangemaakt" } }
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      filters={[
        { column: "status", label: "Status", options: ["unread", "read", "archived"].map((value) => ({ label: value, value })) },
        { column: "priority", label: "Prioriteit", options: ["low", "normal", "high", "urgent"].map((value) => ({ label: value, value })) }
      ]}
      getRowId={(row) => row.id}
      renderDetails={(row) => <div className="grid gap-3 text-sm"><Detail label="Bericht" value={row.message} /><Detail label="Context" value={row.entity_type ? `${row.entity_type} · ${row.entity_id}` : "Algemeen"} /></div>}
      searchColumn="title"
      searchPlaceholder="Zoek notificatie…"
      storageKey="communication_notifications"
    />
  );
}

export function DeliveryTable({ data }: { data: CommunicationDeliveryRow[] }) {
  const columns: ColumnDef<CommunicationDeliveryRow, unknown>[] = [
    { accessorKey: "recipient", header: "Ontvanger", meta: { label: "Ontvanger" } },
    { accessorKey: "channel", header: "Kanaal", meta: { label: "Kanaal" } },
    { accessorKey: "status", header: "Status", meta: { label: "Status" } },
    { accessorKey: "related_type", header: "Bron", meta: { label: "Bron" } },
    { accessorKey: "created_at", header: "Moment", cell: ({ row }) => formatDate(row.original.created_at), meta: { label: "Moment" } }
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      filters={[
        { column: "channel", label: "Kanaal", options: [...new Set(data.map((row) => row.channel))].map((value) => ({ label: value, value })) },
        { column: "status", label: "Status", options: [...new Set(data.map((row) => row.status))].map((value) => ({ label: value, value })) }
      ]}
      getRowId={(row) => row.id}
      renderDetails={(row) => <div className="grid gap-3 text-sm"><Detail label="Provider-ID" value={row.provider_message_id || "Niet beschikbaar"} /><Detail label="Fout" value={row.error_message || "Geen fout"} /></div>}
      searchColumn="recipient"
      searchPlaceholder="Zoek ontvanger…"
      storageKey="communication_deliveries"
    />
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-foreground">{value}</p></div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function previewHtml(value: string | null) {
  const samples: Record<string, string> = {
    parent_name: "Sam de Vries",
    child_name: "Noa de Vries",
    program_name: "Zwem-ABC",
    stage_name: "Badje 2",
    group_name: "Dolfijnen dinsdag",
    lesson_date: "dinsdag 4 augustus",
    lesson_time: "17:30",
    instructor_name: "Sanne Vermeer",
    payment_link: "https://voorbeeld.test/betalen",
    portal_link: "https://voorbeeld.test/portaal",
    tenant_name: "Zwemacademie De Waterlijn"
  };
  return (value || "<p>Geen preview.</p>").replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (token, key: string) => samples[key] ?? token
  );
}
