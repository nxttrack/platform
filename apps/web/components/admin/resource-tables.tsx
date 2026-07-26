"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Download, Mail, Users } from "lucide-react";
import Link from "next/link";

import { WaitTimeChip } from "@/components/public/wait-time-chip";
import { StatusPill } from "@/components/shell/ui";
import { Button } from "@/components/ui/button";
import { DataTable, dataTableTextFilter } from "@/components/ui/data-table";
import { DirtyForm } from "@/components/ui/dirty-form";
import { updateAdminTaskStatusAction } from "@/lib/domain/admin-operations-actions";
import { updateIntakeDuplicateStateAction } from "@/lib/domain/intake-actions";

export type StudentTableRow = {
  guardian: string;
  groups: string;
  id: string;
  isTest: boolean;
  name: string;
  program: string;
  stage: string;
  startsOn: string;
  status: string;
};

export function StudentsTable({ initialSearch, rows }: { initialSearch?: string; rows: StudentTableRow[] }) {
  const columns: ColumnDef<StudentTableRow, unknown>[] = [
    { id: "name", accessorFn: (row) => `${row.name} ${row.guardian}`, header: "Leerling", meta: { label: "Leerling" }, filterFn: dataTableTextFilter, cell: ({ row }) => <div><p className="font-semibold text-foreground">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.guardian}</p>{row.original.isTest ? <StatusPill tone="info">Journey Bot</StatusPill> : null}</div> },
    { accessorKey: "program", header: "Programma", meta: { label: "Programma" } },
    { accessorKey: "stage", header: "Niveau", meta: { label: "Niveau" } },
    { accessorKey: "groups", header: "Lesgroep", meta: { label: "Lesgroep" } },
    { accessorKey: "status", header: "Status", meta: { label: "Status" }, cell: ({ getValue }) => <StatusPill tone={getValue() === "active" ? "success" : "neutral"}>{String(getValue())}</StatusPill> },
    { accessorKey: "startsOn", header: "Start", meta: { label: "Startdatum" }, cell: ({ getValue }) => formatDate(String(getValue())) }
  ];
  return <DataTable columns={columns} data={rows} detailDescription={(row) => `${row.program} · ${row.stage}`} detailTitle={(row) => row.name} filters={[statusFilter(["active", "paused", "completed", "cancelled"])]} getRowId={(row) => row.id} initialSearchValue={initialSearch} renderDetails={(row) => <DetailList entries={[["Ouder/verzorger", row.guardian], ["Programma", row.program], ["Niveau", row.stage], ["Lesgroep", row.groups], ["Status", row.status], ["Startdatum", formatDate(row.startsOn)]]} />} searchColumn="name" searchPlaceholder="Zoek leerling of ouder…" storageKey="admin.students" />;
}

export type GroupTableRow = {
  capacityLabel: string;
  capacityStatus: "available" | "full" | "over_capacity" | "unknown";
  code: string;
  id: string;
  instructors: string;
  name: string;
  program: string;
  resource: string;
  stage: string;
  status: string;
  time: string;
};

export function GroupsTable({ initialSearch, rows }: { initialSearch?: string; rows: GroupTableRow[] }) {
  const columns: ColumnDef<GroupTableRow, unknown>[] = [
    { accessorKey: "name", header: "Lesgroep", meta: { label: "Lesgroep" }, filterFn: dataTableTextFilter, cell: ({ row }) => <div><p className="font-semibold">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.code}</p></div> },
    { accessorKey: "program", header: "Programma", meta: { label: "Programma" } },
    { accessorKey: "stage", header: "Niveau", meta: { label: "Niveau" } },
    { accessorKey: "time", header: "Lesmoment", meta: { label: "Lesmoment" } },
    { accessorKey: "instructors", header: "Instructeurs", meta: { label: "Instructeurs" } },
    { accessorKey: "status", header: "Status", meta: { label: "Status" }, cell: ({ getValue }) => <StatusPill tone={getValue() === "active" ? "success" : "neutral"}>{String(getValue())}</StatusPill> },
    { accessorKey: "capacityStatus", header: "Capaciteit", meta: { label: "Capaciteit" }, cell: ({ row }) => <StatusPill tone={row.original.capacityStatus === "available" ? "success" : row.original.capacityStatus === "full" ? "warning" : row.original.capacityStatus === "over_capacity" ? "danger" : "neutral"}>{row.original.capacityLabel}</StatusPill> }
  ];
  return <DataTable columns={columns} data={rows} detailDescription={(row) => `${row.program} · ${row.stage}`} detailTitle={(row) => row.name} filters={[statusFilter(["planned", "active", "paused", "archived"]), { column: "capacityStatus", label: "Capaciteit", options: [{ label: "Beschikbaar", value: "available" }, { label: "Vol", value: "full" }, { label: "Over capaciteit", value: "over_capacity" }] }]} getRowId={(row) => row.id} initialSearchValue={initialSearch} renderDetails={(row) => <DetailList entries={[["Code", row.code || "—"], ["Programma", row.program], ["Niveau", row.stage], ["Resource", row.resource], ["Lesmoment", row.time], ["Instructeurs", row.instructors], ["Capaciteit", row.capacityLabel], ["Status", row.status]]} />} searchColumn="name" searchPlaceholder="Zoek groep…" storageKey="admin.groups" />;
}

export type IntakeTableRow = {
  choice: string;
  duplicateState: string;
  email: string;
  experience: string;
  id: string;
  isTest: boolean;
  option: string;
  parent: string;
  participant: string;
  phone: string;
  preferredDays: string;
  program: string;
  receivedAt: string;
  source: string;
  status: string;
  waitBand: "short" | "medium" | "long" | null;
};

export function IntakeTable({ initialSearch, rows }: { initialSearch?: string; rows: IntakeTableRow[] }) {
  const columns: ColumnDef<IntakeTableRow, unknown>[] = [
    { accessorKey: "participant", header: "Kind", meta: { label: "Kind" }, filterFn: dataTableTextFilter, cell: ({ row }) => <div><p className="font-semibold">{row.original.participant}</p><p className="text-xs text-muted-foreground">{row.original.parent}</p></div> },
    { accessorKey: "option", header: "Aanvraag", meta: { label: "Aanvraag" } },
    { accessorKey: "program", header: "Programma", meta: { label: "Programma" } },
    { accessorKey: "preferredDays", header: "Voorkeur", meta: { label: "Voorkeur" } },
    { accessorKey: "waitBand", header: "Wachttijd", meta: { label: "Wachttijd" }, cell: ({ row }) => row.original.waitBand ? <WaitTimeChip band={row.original.waitBand} /> : <span className="text-muted-foreground">Onbekend</span> },
    { accessorKey: "status", header: "Status", meta: { label: "Status" }, cell: ({ row }) => <div className="flex flex-wrap gap-1"><StatusPill tone={row.original.status === "received" ? "info" : "neutral"}>{row.original.status}</StatusPill>{row.original.duplicateState === "possible_duplicate" ? <StatusPill tone="warning">mogelijk dubbel</StatusPill> : null}</div> },
    { accessorKey: "receivedAt", header: "Ontvangen", meta: { label: "Ontvangen" }, cell: ({ getValue }) => formatDateTime(String(getValue())) }
  ];
  return <DataTable columns={columns} data={rows} detailDescription={(row) => `${row.parent} · ${row.email}`} detailTitle={(row) => row.participant} filters={[statusFilter(["received", "reviewing", "converted", "closed"]), { column: "waitBand", label: "Wachttijd", options: [{ label: "Kort", value: "short" }, { label: "Gemiddeld", value: "medium" }, { label: "Lang", value: "long" }] }]} getRowId={(row) => row.id} initialSearchValue={initialSearch} renderDetails={(row) => <div className="grid gap-5"><DetailList entries={[["Ouder/verzorger", row.parent], ["E-mail", row.email], ["Telefoon", row.phone || "—"], ["Programma", row.program], ["Zwemervaring", row.experience || "—"], ["Voorkeursdagen", row.preferredDays || "—"], ["Eerste momentkeuze", row.choice || "—"], ["Herkomst", row.source], ["Ontvangen", formatDateTime(row.receivedAt)]]} />{row.duplicateState === "possible_duplicate" ? <div className="flex flex-wrap gap-2"><DuplicateButton id={row.id} label="Markeer als dubbel" state="confirmed_duplicate" /><DuplicateButton id={row.id} label="Markeer als uniek" state="dismissed" /></div> : null}</div>} searchColumn="participant" searchPlaceholder="Zoek kind of lead…" storageKey="admin.intake" />;
}

export type DocumentTableRow = {
  audience: string;
  classification: string;
  createdAt: string;
  description: string;
  fileName: string;
  id: string;
  malwareStatus: string;
  sizeLabel: string;
  status: string;
  storageStatus: string;
  title: string;
  visibility: string;
};

export function DocumentsTable({ initialSearch, rows }: { initialSearch?: string; rows: DocumentTableRow[] }) {
  const columns: ColumnDef<DocumentTableRow, unknown>[] = [
    { accessorKey: "title", header: "Document", meta: { label: "Document" }, filterFn: dataTableTextFilter, cell: ({ row }) => <div><p className="font-semibold">{row.original.title}</p><p className="max-w-72 truncate text-xs text-muted-foreground">{row.original.fileName}</p></div> },
    { accessorKey: "audience", header: "Doelgroep", meta: { label: "Doelgroep" } },
    { accessorKey: "visibility", header: "Zichtbaarheid", meta: { label: "Zichtbaarheid" }, cell: ({ getValue }) => <StatusPill tone={getValue() === "portal" ? "success" : "neutral"}>{String(getValue())}</StatusPill> },
    { accessorKey: "classification", header: "Classificatie", meta: { label: "Classificatie" }, cell: ({ getValue }) => <StatusPill tone={getValue() === "operational" ? "neutral" : getValue() === "personal" ? "info" : "warning"}>{String(getValue())}</StatusPill> },
    { accessorKey: "malwareStatus", header: "Scan", meta: { label: "Malwarescan" }, cell: ({ getValue }) => <StatusPill tone={getValue() === "clean" ? "success" : "warning"}>{String(getValue())}</StatusPill> },
    { accessorKey: "createdAt", header: "Toegevoegd", meta: { label: "Toegevoegd" }, cell: ({ getValue }) => formatDateTime(String(getValue())) }
  ];
  return <DataTable columns={columns} data={rows} detailDescription={(row) => `${row.fileName} · ${row.sizeLabel}`} detailTitle={(row) => row.title} filters={[{ column: "visibility", label: "Zichtbaarheid", options: [{ label: "Portaal", value: "portal" }, { label: "Intern", value: "internal" }] }, { column: "status", label: "Status", options: [{ label: "Actief", value: "active" }, { label: "Archief", value: "archived" }] }]} getRowId={(row) => row.id} initialSearchValue={initialSearch} renderDetails={(row) => <div className="grid gap-5">{row.description ? <p className="text-sm leading-6 text-muted-foreground">{row.description}</p> : null}<DetailList entries={[["Bestand", row.fileName], ["Grootte", row.sizeLabel], ["Doelgroep", row.audience], ["Zichtbaarheid", row.visibility], ["Classificatie", row.classification], ["Opslag", row.storageStatus], ["Malwarescan", row.malwareStatus], ["Status", row.status]]} />{row.storageStatus === "stored" && row.malwareStatus === "clean" ? <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" href={`/api/files/tenant-document/${row.id}`}><Download className="size-4" />Download veilig bestand</Link> : null}</div>} searchColumn="title" searchPlaceholder="Zoek document…" storageKey="admin.documents" />;
}

export type TaskTableRow = {
  assignee: string;
  description: string;
  dueOn: string;
  id: string;
  participant: string;
  priority: string;
  status: string;
  title: string;
  updatedAt: string;
};

export function TasksTable({ initialSearch, rows }: { initialSearch?: string; rows: TaskTableRow[] }) {
  const columns: ColumnDef<TaskTableRow, unknown>[] = [
    { accessorKey: "title", header: "Taak", meta: { label: "Taak" }, filterFn: dataTableTextFilter, cell: ({ row }) => <div><p className="font-semibold">{row.original.title}</p><p className="text-xs text-muted-foreground">{row.original.participant}</p></div> },
    { accessorKey: "assignee", header: "Toegewezen aan", meta: { label: "Toegewezen aan" } },
    { accessorKey: "dueOn", header: "Deadline", meta: { label: "Deadline" }, cell: ({ getValue }) => getValue() ? formatDate(String(getValue())) : "Geen" },
    { accessorKey: "priority", header: "Prioriteit", meta: { label: "Prioriteit" }, cell: ({ getValue }) => <StatusPill tone={["urgent", "high"].includes(String(getValue())) ? "warning" : "neutral"}>{String(getValue())}</StatusPill> },
    { accessorKey: "status", header: "Status", meta: { label: "Status" }, cell: ({ getValue }) => <StatusPill tone={getValue() === "done" ? "success" : getValue() === "in_progress" ? "info" : "neutral"}>{String(getValue())}</StatusPill> }
  ];
  return <DataTable columns={columns} data={rows} detailDescription={(row) => `${row.assignee} · ${row.participant}`} detailTitle={(row) => row.title} filters={[statusFilter(["open", "in_progress", "done", "cancelled"]), { column: "priority", label: "Prioriteit", options: ["urgent", "high", "normal", "low"].map((value) => ({ label: value, value })) }]} getRowId={(row) => row.id} initialSearchValue={initialSearch} renderDetails={(row) => <div className="grid gap-5">{row.description ? <p className="text-sm leading-6 text-muted-foreground">{row.description}</p> : null}<DetailList entries={[["Assignee", row.assignee], ["Leerling", row.participant], ["Deadline", row.dueOn ? formatDate(row.dueOn) : "Geen"], ["Prioriteit", row.priority], ["Status", row.status], ["Bijgewerkt", formatDateTime(row.updatedAt)]]} /><DirtyForm action={updateAdminTaskStatusAction} className="rounded-xl border border-border p-4"><input name="taskId" type="hidden" value={row.id} /><label className="grid gap-1.5 text-sm font-semibold">Status<select className="min-h-11 rounded-lg border border-border bg-background px-3 font-normal" defaultValue={row.status} name="status"><option value="open">Open</option><option value="in_progress">Bezig</option><option value="done">Klaar</option><option value="cancelled">Geannuleerd</option></select></label><Button type="submit"><CheckCircle2 className="size-4" />Status bijwerken</Button></DirtyForm></div>} searchColumn="title" searchPlaceholder="Zoek taak…" storageKey="admin.tasks" />;
}

export type PaymentTableRow = {
  amount: string;
  dueOn: string;
  id: string;
  method: string;
  paidOn: string;
  participant: string;
  plan: string;
  reference: string;
  status: string;
};

export function PaymentsTable({ initialSearch, rows }: { initialSearch?: string; rows: PaymentTableRow[] }) {
  const columns: ColumnDef<PaymentTableRow, unknown>[] = [
    { accessorKey: "participant", header: "Leerling", meta: { label: "Leerling" }, filterFn: dataTableTextFilter, cell: ({ row }) => <div><p className="font-semibold">{row.original.participant}</p><p className="text-xs text-muted-foreground">{row.original.reference}</p></div> },
    { accessorKey: "plan", header: "Plan", meta: { label: "Plan" } },
    { accessorKey: "amount", header: "Bedrag", meta: { label: "Bedrag" } },
    { accessorKey: "dueOn", header: "Vervaldatum", meta: { label: "Vervaldatum" }, cell: ({ getValue }) => formatDate(String(getValue())) },
    { accessorKey: "method", header: "Methode", meta: { label: "Methode" } },
    { accessorKey: "status", header: "Status", meta: { label: "Status" }, cell: ({ getValue }) => <StatusPill tone={getValue() === "paid" ? "success" : getValue() === "overdue" ? "danger" : getValue() === "due" ? "warning" : "neutral"}>{String(getValue())}</StatusPill> }
  ];
  return <DataTable columns={columns} data={rows} detailDescription={(row) => `${row.plan} · ${row.amount}`} detailTitle={(row) => row.participant} filters={[statusFilter(["due", "overdue", "paid", "waived", "cancelled", "refunded", "chargeback"])]} getRowId={(row) => row.id} initialSearchValue={initialSearch} renderDetails={(row) => <DetailList entries={[["Leerling", row.participant], ["Betaalplan", row.plan], ["Bedrag", row.amount], ["Referentie", row.reference || "—"], ["Vervaldatum", formatDate(row.dueOn)], ["Betaaldatum", row.paidOn ? formatDate(row.paidOn) : "—"], ["Methode", row.method || "—"], ["Status", row.status]]} />} searchColumn="participant" searchPlaceholder="Zoek betaling…" storageKey="admin.payments" />;
}

export type InvitationTableRow = {
  createdAt: string;
  deliveryStatus: string;
  email: string;
  expiresAt: string;
  id: string;
  role: string;
  status: string;
  tenant: string;
};

export function InvitationsTable({ platform = false, rows }: { platform?: boolean; rows: InvitationTableRow[] }) {
  const columns: ColumnDef<InvitationTableRow, unknown>[] = [
    { accessorKey: "email", header: "E-mail", meta: { label: "E-mail" }, filterFn: dataTableTextFilter, cell: ({ getValue }) => <span className="inline-flex items-center gap-2 font-semibold"><Mail className="size-4 text-primary" />{String(getValue())}</span> },
    { accessorKey: "tenant", header: "Organisatie", meta: { label: "Organisatie" } },
    { accessorKey: "role", header: "Rol", meta: { label: "Rol" } },
    { accessorKey: "deliveryStatus", header: "Bezorging", meta: { label: "Bezorging" }, cell: ({ getValue }) => <StatusPill tone={getValue() === "sent" ? "success" : getValue() === "failed" ? "danger" : "neutral"}>{String(getValue())}</StatusPill> },
    { accessorKey: "status", header: "Status", meta: { label: "Status" }, cell: ({ getValue }) => <StatusPill tone={getValue() === "accepted" ? "success" : getValue() === "pending" ? "warning" : "neutral"}>{String(getValue())}</StatusPill> },
    { accessorKey: "expiresAt", header: "Verloopt", meta: { label: "Verloopt" }, cell: ({ getValue }) => formatDateTime(String(getValue())) }
  ];
  return <DataTable columns={columns} data={rows} detailDescription={(row) => `${row.role} · ${row.tenant}`} detailTitle={(row) => row.email} filters={[statusFilter(["pending", "accepted", "expired", "revoked"])]} getRowId={(row) => row.id} renderDetails={(row) => <DetailList entries={[["E-mail", row.email], ["Organisatie", row.tenant], ["Rol", row.role], ["Bezorging", row.deliveryStatus], ["Status", row.status], ["Aangemaakt", formatDateTime(row.createdAt)], ["Verloopt", formatDateTime(row.expiresAt)]]} />} searchColumn="email" searchPlaceholder="Zoek uitnodiging…" storageKey={platform ? "platform.invitations" : "admin.invitations"} />;
}

export type PlatformTenantTableRow = {
  createdAt: string;
  domain: string;
  id: string;
  memberCount: number;
  name: string;
  sector: string;
  slug: string;
  status: string;
};

export function PlatformTenantsTable({ initialSearch, rows }: { initialSearch?: string; rows: PlatformTenantTableRow[] }) {
  const columns: ColumnDef<PlatformTenantTableRow, unknown>[] = [
    { accessorKey: "name", header: "Organisatie", meta: { label: "Organisatie" }, filterFn: dataTableTextFilter, cell: ({ row }) => <div><p className="font-semibold">{row.original.name}</p><p className="text-xs text-muted-foreground">{row.original.slug}</p></div> },
    { accessorKey: "domain", header: "Primair domein", meta: { label: "Primair domein" } },
    { accessorKey: "sector", header: "Sector", meta: { label: "Sector" } },
    { accessorKey: "memberCount", header: "Gebruikers", meta: { label: "Gebruikers" }, cell: ({ getValue }) => <span className="inline-flex items-center gap-1.5"><Users className="size-4 text-primary" />{String(getValue())}</span> },
    { accessorKey: "status", header: "Status", meta: { label: "Status" }, cell: ({ getValue }) => <StatusPill tone={getValue() === "active" ? "success" : getValue() === "suspended" ? "danger" : "warning"}>{String(getValue())}</StatusPill> },
    { accessorKey: "createdAt", header: "Aangemaakt", meta: { label: "Aangemaakt" }, cell: ({ getValue }) => formatDate(String(getValue())) }
  ];
  return <DataTable columns={columns} data={rows} detailDescription={(row) => `${row.slug} · ${row.domain}`} detailTitle={(row) => row.name} filters={[statusFilter(["active", "onboarding", "suspended", "closed"])]} getRowId={(row) => row.id} initialSearchValue={initialSearch} renderDetails={(row) => <DetailList entries={[["Slug", row.slug], ["Domein", row.domain], ["Sector", row.sector], ["Actieve gebruikers", String(row.memberCount)], ["Status", row.status], ["Aangemaakt", formatDate(row.createdAt)]]} />} searchColumn="name" searchPlaceholder="Zoek tenant…" storageKey="platform.tenants" />;
}

function DuplicateButton({ id, label, state }: { id: string; label: string; state: "confirmed_duplicate" | "dismissed" }) {
  return <form action={updateIntakeDuplicateStateAction}><input name="submissionId" type="hidden" value={id} /><input name="duplicateState" type="hidden" value={state} /><Button className="min-h-11" type="submit" variant="outline">{label}</Button></form>;
}

function DetailList({ entries }: { entries: Array<[string, string]> }) {
  return <dl className="grid gap-3">{entries.map(([label, value]) => <div className="rounded-xl bg-muted p-3" key={label}><dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium text-foreground">{value}</dd></div>)}</dl>;
}

function statusFilter(statuses: string[]) {
  return { column: "status", label: "Status", options: statuses.map((value) => ({ label: value.replaceAll("_", " "), value })) };
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
