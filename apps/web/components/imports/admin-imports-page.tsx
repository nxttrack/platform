import { AlertTriangle, CheckCircle2, RotateCcw, Upload } from "lucide-react";

import { AdminTabs } from "@/components/admin/admin-tabs";
import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { applyImportBatchAction, createImportPreviewAction, rollbackImportBatchAction } from "@/lib/imports/admin-imports-actions";
import type { AdminImportsSnapshot, ImportBatch, ImportRow, ImportType } from "@/lib/imports/admin-imports-read-model";

const importTypeLabels: Record<ImportType, string> = {
  participants: "Deelnemers",
  guardians: "Ouders/verzorgers",
  groups: "Groepen",
  payments: "Betalingen"
};

const mappingExamples: Record<ImportType, string> = {
  participants: "external_reference=external_reference\ndisplay_name=display_name\nbirthdate=birthdate\nstatus=status",
  guardians: "participant_external_reference=participant_external_reference\nprofile_id=profile_id\nrelationship=relationship\ndisplay_name=display_name\nemail=email\nstatus=status",
  groups: "code=code\nname=name\nprogram_code=program_code\nstage_code=stage_code\nresource_code=resource_code\ninstructor_email=instructor_email\nweekday=weekday\nstarts_at=starts_at\nends_at=ends_at\ncapacity=capacity\nstatus=status",
  payments: "invoice_number=invoice_number\namount=amount\nreceived_on=received_on\npayment_method=payment_method\nstatus=status\nnote=note"
};

const csvExamples: Record<ImportType, string> = {
  participants: "external_reference,display_name,birthdate,status\nchild-1023,Sara Jansen,2018-04-12,active",
  guardians: "participant_external_reference,profile_id,relationship,display_name,email,status\nchild-1023,00000000-0000-0000-0000-000000000000,parent,Noor Jansen,noor@example.nl,active",
  groups: "code,name,program_code,stage_code,resource_code,instructor_email,weekday,starts_at,ends_at,capacity,status\na-ma-1600,Diploma A maandag 16:00,zwemdiploma-a,badje-1,bad-1-baan-1,instructeur@example.nl,1,16:00,16:45,8,active",
  payments: "invoice_number,amount,received_on,payment_method,status,note\nINV-2026-0001,79.50,2026-06-25,manual_bank_transfer,paid,SEPA ontvangen"
};

export function AdminImportsPage({ snapshot }: { snapshot: AdminImportsSnapshot }) {
  if (snapshot.status !== "ready") {
    return (
      <div>
        <PageHeader kicker="Backoffice - imports" title="Imports" subtitle="CSV-preview, mapping, validatie, duplicate detection en rollback per importbatch." />
        <Card>
          <StatusPill tone="warning">{snapshot.status}</StatusPill>
          <p className="mt-3 text-sm text-muted-foreground">{snapshot.error}</p>
        </Card>
      </div>
    );
  }

  const totals = snapshot.batches.reduce(
    (acc, batch) => {
      acc.batches += 1;
      acc.ready += Number(batch.summary.ready ?? 0);
      acc.invalid += Number(batch.summary.invalid ?? 0);
      acc.duplicate += Number(batch.summary.duplicate ?? 0);
      return acc;
    },
    { batches: 0, ready: 0, invalid: 0, duplicate: 0 }
  );

  return (
    <div>
      <PageHeader
        kicker="Backoffice - imports"
        title="Importcentrum"
        subtitle={`Beheer gecontroleerde imports voor ${snapshot.tenantName}. Eerst previewen, daarna pas toepassen of terugdraaien.`}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Batches" value={totals.batches} />
        <MetricCard label="Klaar" value={totals.ready} tone="success" />
        <MetricCard label="Duplicaten" value={totals.duplicate} tone="warning" />
        <MetricCard label="Ongeldig" value={totals.invalid} tone="danger" />
      </div>

      <div className="mt-6">
        <AdminTabs
          tabs={[
            { id: "preview", label: "Import preview", count: totals.ready + totals.invalid + totals.duplicate, children: <ImportPreviewForm /> },
            { id: "mapping", label: "Mapping & lookup", count: Object.keys(importTypeLabels).length, children: <LookupPanel snapshot={snapshot} /> },
            {
              id: "batches",
              label: "Batches",
              count: snapshot.batches.length,
              children: (
                <section className="space-y-5">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight">Recente importbatches</h2>
                      <p className="text-sm text-muted-foreground">Rows met duplicate warnings worden niet automatisch toegepast.</p>
                    </div>
                    <StatusPill tone="info">rollback/audit actief</StatusPill>
                  </div>

                  {Object.values(snapshot.errors).some(Boolean) ? (
                    <Card className="border-red-200 bg-red-50">
                      <p className="text-sm font-semibold text-red-800">Niet alle importdata kon worden opgehaald.</p>
                      <ul className="mt-2 space-y-1 text-sm text-red-700">
                        {Object.entries(snapshot.errors).map(([key, value]) => (value ? <li key={key}>{key}: {value}</li> : null))}
                      </ul>
                    </Card>
                  ) : null}

                  {snapshot.batches.length === 0 ? (
                    <Card>
                      <p className="text-sm font-semibold">Nog geen imports.</p>
                      <p className="mt-1 text-sm text-muted-foreground">Maak links een preview met CSV-data en mapping.</p>
                    </Card>
                  ) : (
                    snapshot.batches.map((batch) => (
                      <ImportBatchCard key={batch.id} audit={snapshot.auditByBatch[batch.id] ?? []} batch={batch} rows={snapshot.rowsByBatch[batch.id] ?? []} />
                    ))
                  )}
                </section>
              )
            }
          ]}
        />
      </div>
    </div>
  );
}

function ImportPreviewForm() {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Nieuwe import-preview</h2>
          <p className="mt-1 text-sm text-muted-foreground">Plak CSV, kies type en overschrijf kolommapping waar nodig.</p>
        </div>
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
          <Upload className="h-5 w-5" />
        </div>
      </div>

      <form action={createImportPreviewAction} className="mt-5 grid gap-4">
        <label className="grid gap-2 text-sm font-semibold">
          Importtype
          <select name="import_type" className="rounded-2xl border border-border bg-background px-4 py-3 text-sm">
            {Object.entries(importTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Bronnaam
          <input name="source_name" className="rounded-2xl border border-border bg-background px-4 py-3 text-sm" placeholder="leerlingen-juni.csv" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Mapping
          <textarea
            name="mapping_text"
            rows={8}
            className="rounded-2xl border border-border bg-background px-4 py-3 font-mono text-xs"
            placeholder={mappingExamples.participants}
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          CSV
          <textarea name="csv_text" rows={8} className="rounded-2xl border border-border bg-background px-4 py-3 font-mono text-xs" placeholder={csvExamples.participants} required />
        </label>
        <button className="inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground" type="submit">
          Preview maken
        </button>
      </form>

      <details className="mt-5 rounded-2xl bg-muted p-4 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-semibold text-foreground">Mapping voorbeelden</summary>
        <div className="mt-3 grid gap-3">
          {Object.entries(mappingExamples).map(([type, example]) => (
            <pre key={type} className="overflow-auto rounded-xl bg-background p-3">
              {importTypeLabels[type as ImportType]}
              {"\n"}
              {example}
            </pre>
          ))}
        </div>
      </details>
    </Card>
  );
}

function LookupPanel({ snapshot }: { snapshot: Extract<AdminImportsSnapshot, { status: "ready" }> }) {
  return (
    <Card>
      <h2 className="text-lg font-bold">Importregels en referenties</h2>
      <p className="mt-1 text-sm text-muted-foreground">Gebruik codes en factuurnummers uit deze tenantdata voor betrouwbare mapping.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ReferenceList title="Programma codes" items={snapshot.lookup.programs.map((item) => `${item.code} - ${item.name}`)} />
        <ReferenceList title="Niveau codes" items={snapshot.lookup.stages.map((item) => `${item.code} - ${item.name}`)} />
        <ReferenceList title="Resource codes" items={snapshot.lookup.resources.map((item) => `${item.code} - ${item.name}`)} />
        <ReferenceList title="Instructeurs" items={snapshot.lookup.instructors.map((item) => item.email ?? item.display_name)} />
        <ReferenceList title="Leerling referenties" items={snapshot.lookup.participants.map((item) => item.external_reference ?? item.display_name)} />
        <ReferenceList title="Facturen" items={snapshot.lookup.invoices.map((item) => `${item.invoice_number} - ${formatMoney(item.amount_due_cents, item.currency)} - ${item.status}`)} />
      </div>
    </Card>
  );
}

function ImportBatchCard({ batch, rows, audit }: { batch: ImportBatch; rows: ImportRow[]; audit: { id: string; event_type: string; summary: string; created_at: string }[] }) {
  const canApply = batch.status === "previewed" || batch.status === "failed";
  const canRollback = batch.status === "applied";
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">{importTypeLabels[batch.import_type]}</h3>
            <StatusPill tone={statusTone(batch.status)}>{statusLabel(batch.status)}</StatusPill>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {batch.source_name ?? "Onbekende bron"} - {new Date(batch.created_at).toLocaleString("nl-NL")}
          </p>
          {batch.error_message ? <p className="mt-2 text-sm font-semibold text-red-700">{batch.error_message}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canApply ? (
            <form action={applyImportBatchAction}>
              <input type="hidden" name="batch_id" value={batch.id} />
              <button className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground" type="submit">
                <CheckCircle2 className="h-4 w-4" /> Ready toepassen
              </button>
            </form>
          ) : null}
          {canRollback ? (
            <form action={rollbackImportBatchAction}>
              <input type="hidden" name="batch_id" value={batch.id} />
              <button className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700" type="submit">
                <RotateCcw className="h-4 w-4" /> Rollback batch
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <MetricCard label="Totaal" value={batch.summary.total ?? rows.length} small />
        <MetricCard label="Ready" value={batch.summary.ready ?? 0} tone="success" small />
        <MetricCard label="Duplicaat" value={batch.summary.duplicate ?? 0} tone="warning" small />
        <MetricCard label="Ongeldig" value={batch.summary.invalid ?? 0} tone="danger" small />
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[72px_110px_1fr] gap-3 bg-muted px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span>Regel</span>
          <span>Status</span>
          <span>Validatie</span>
        </div>
        {rows.slice(0, 60).map((row) => (
          <div key={row.id} className="grid grid-cols-[72px_110px_1fr] gap-3 border-t border-border px-4 py-3 text-sm">
            <span className="font-semibold">#{row.row_number}</span>
            <span>
              <StatusPill tone={rowTone(row.status)}>{row.status}</StatusPill>
            </span>
            <div>
              <p className="break-words text-xs text-muted-foreground">{compactMapped(row.mapped_data)}</p>
              {row.validation_errors.length > 0 ? <IssueList tone="danger" items={row.validation_errors} /> : null}
              {row.duplicate_warnings.length > 0 ? <IssueList tone="warning" items={row.duplicate_warnings} /> : null}
              {row.created_table && row.created_record_id ? (
                <p className="mt-1 text-xs text-emerald-700">
                  Aangemaakt: {row.created_table} / {row.created_record_id}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {audit.length > 0 ? (
        <div className="mt-5 rounded-2xl bg-muted p-4">
          <p className="text-sm font-bold">Audit trail</p>
          <div className="mt-2 space-y-2">
            {audit.slice(0, 8).map((event) => (
              <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{event.summary}</span>
                <span>{new Date(event.created_at).toLocaleString("nl-NL")}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function ReferenceList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <p className="text-sm font-bold">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Nog geen data.</p>
      ) : (
        <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs text-muted-foreground">
          {items.slice(0, 30).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MetricCard({ label, value, tone = "info", small = false }: { label: string; value: number; tone?: "success" | "warning" | "danger" | "info"; small?: boolean }) {
  const tones = {
    success: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-red-700",
    info: "text-foreground"
  };

  return (
    <Card className={small ? "p-4" : ""}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</p>
    </Card>
  );
}

function IssueList({ items, tone }: { items: string[]; tone: "warning" | "danger" }) {
  return (
    <div className={`mt-2 rounded-xl px-3 py-2 text-xs ${tone === "danger" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-3.5 w-3.5" />
        {tone === "danger" ? "Validatiefouten" : "Duplicaatwaarschuwingen"}
      </div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function compactMapped(mapped: Record<string, string>) {
  return Object.entries(mapped)
    .filter(([, value]) => value)
    .slice(0, 8)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" | ");
}

function statusTone(status: ImportBatch["status"]) {
  if (status === "applied") return "success";
  if (status === "failed") return "danger";
  if (status === "rolled_back") return "warning";
  return "info";
}

function rowTone(status: ImportRow["status"]) {
  if (status === "ready" || status === "applied") return "success";
  if (status === "invalid" || status === "failed") return "danger";
  if (status === "duplicate" || status === "rolled_back") return "warning";
  return "neutral";
}

function statusLabel(status: ImportBatch["status"]) {
  const labels = {
    draft: "concept",
    previewed: "preview",
    applying: "bezig",
    applied: "toegepast",
    failed: "mislukt",
    rolled_back: "teruggedraaid"
  };
  return labels[status];
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(cents / 100);
}
