import { BarChart3, Save } from "lucide-react";
import { AdminSection, DataList, EmptyState, Field, SelectField, SubmitButton } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { createReportSnapshotAction } from "@/lib/domain/admin-operations-actions";
import { formatDateTime, getAdminOperationsData } from "@/lib/domain/admin-operations";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminReportsPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getAdminOperationsData(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");

  return (
    <div className="space-y-6">
      <PageHeader kicker="Operations" title="Rapportages" subtitle="Basisrapportages met echte tenant-data uit operatie, intake, billing en voortgang." />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.reports.map((report) => (
          <section className="rounded-xl border border-border bg-card p-4 shadow-soft" key={report.key}>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-foreground">{report.title}</h2>
            </div>
            <div className="mt-4 space-y-3">
              {report.metrics.map((metric) => (
                <div className="flex items-center justify-between gap-3" key={metric.label}>
                  <span className="text-sm text-muted-foreground">{metric.label}</span>
                  <StatusPill tone={metric.tone ?? "neutral"}>{metric.value}</StatusPill>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <AdminSection title="Snapshot vastleggen" description="Sla de huidige metrics op als referentiepunt voor product-owner review of dagstart.">
          <form action={createReportSnapshotAction} className="grid gap-4">
            <Field label="Titel" name="title" placeholder="Dagstart operations" />
            <SelectField label="Rapport" name="reportKey">
              {data.reports.map((report) => (
                <option key={report.key} value={report.key}>
                  {report.title}
                </option>
              ))}
            </SelectField>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Periode start" name="periodStart" type="date" />
              <Field label="Periode einde" name="periodEnd" type="date" />
            </div>
            <SubmitButton>
              <span className="inline-flex items-center gap-2">
                <Save className="h-4 w-4" />
                Snapshot opslaan
              </span>
            </SubmitButton>
          </form>
        </AdminSection>

        <AdminSection title="Snapshots">
          {data.reportSnapshots.length === 0 ? (
            <EmptyState>Nog geen rapport snapshots.</EmptyState>
          ) : (
            <DataList>
              {data.reportSnapshots.map((snapshot) => (
                <div className="px-3 py-3" key={snapshot.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{snapshot.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {snapshot.report_key} - {formatDateTime(snapshot.created_at)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(snapshot.metrics).slice(0, 6).map(([key, value]) => (
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground" key={key}>
                            {key}: {String(value)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <StatusPill tone={snapshot.status === "active" ? "success" : "neutral"}>{snapshot.status}</StatusPill>
                  </div>
                </div>
              ))}
            </DataList>
          )}
        </AdminSection>
      </div>
    </div>
  );
}

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Opgeslagen: {saved}.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Actie is niet gelukt: {error}.</p>;
  }

  return null;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
