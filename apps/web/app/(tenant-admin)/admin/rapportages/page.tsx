import { Activity, AlertTriangle, ArrowRight, BarChart3, CalendarRange, CheckCircle2, Save, Sparkles } from "lucide-react";
import Link from "next/link";
import { AdminSection, EmptyState, Field, SelectField, SubmitButton } from "@/components/admin/domain-ui";
import { CapacityChart, StatusDonutChart } from "@/components/admin/operational-charts";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildAdminChartData } from "@/lib/domain/admin-chart-data";
import { buildLeadAttributionReport } from "@/lib/analytics/lead-report";
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
  const charts = buildAdminChartData(data);
  const leadReport = buildLeadAttributionReport(data.intakeSubmissions);
  const activeCapacity = data.groups.filter((group) => group.status === "active").reduce((total, group) => total + Number(group.capacity), 0);
  const occupancy = activeCapacity ? Math.round((data.kpis.activeEnrollments / activeCapacity) * 100) : 0;
  const placed = data.waitlistEntries.filter((entry) => entry.status === "placed").length;
  const conversion = data.waitlistEntries.length ? Math.round((placed / data.waitlistEntries.length) * 100) : 0;
  const attended = data.attendance.filter((row) => ["present", "late", "trial"].includes(row.status)).length;
  const attendanceRate = data.attendance.length ? Math.round((attended / data.attendance.length) * 100) : 0;
  const growthActions = [
    { href: "/admin/wachtlijst", label: "Plaatsingsvoorstellen beoordelen", metric: `${conversion}% wachtlijstconversie`, urgent: data.kpis.openWaitlist > 0 },
    { href: "/admin/agenda", label: "Capaciteit en planning optimaliseren", metric: `${occupancy}% bezetting`, urgent: occupancy > 90 || occupancy < 60 },
    { href: "/admin/betalingen", label: "Betalingsachterstand opvolgen", metric: `${data.kpis.overduePayments} overdue`, urgent: data.kpis.overduePayments > 0 },
    { href: "/instructor/groepen", label: "Aanwezigheid met team bespreken", metric: `${attendanceRate}% attendance`, urgent: attendanceRate > 0 && attendanceRate < 85 }
  ];

  return (
    <div className="space-y-6">
      <PageHeader kicker="Operations" title="Rapportages" subtitle="Basisrapportages met echte tenant-data uit operatie, intake, billing en voortgang." />
      <Feedback saved={saved} error={error} />

      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-gradient-to-r from-blue-950 to-primary px-5 py-4 text-white"><div><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-aqua"><Sparkles className="size-4" />School Health & Growth</p><h2 className="mt-1 text-xl font-bold">Van metric naar vervolgstap</h2></div><span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">{growthActions.filter((action) => action.urgent).length} aandachtspunt(en)</span></div>
        <div className="grid gap-px bg-border md:grid-cols-2 xl:grid-cols-4">{growthActions.map((action) => <Link className="group bg-card p-4 transition hover:bg-primary/5" href={action.href} key={action.label}><div className="flex items-center justify-between gap-3">{action.urgent ? <AlertTriangle className="size-5 text-warning" /> : <CheckCircle2 className="size-5 text-success" />}<ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" /></div><p className="mt-4 text-2xl font-bold text-foreground">{action.metric}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{action.label}</p></Link>)}</div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Link className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card" href="/admin/rapportages/capaciteit">
          <div className="flex items-start justify-between gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarRange className="size-5" /></span>
            <ArrowRight className="size-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-foreground">Capaciteitsvoorspelling</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Kijk 4, 8 of 12 weken vooruit naar voorzichtige openingen, vraagdruk, resources en instructeurdekking.</p>
        </Link>
        <Link className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card" href="/admin/rapportages/leskwaliteit">
          <div className="flex items-start justify-between gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-aqua/15 text-primary"><Activity className="size-5" /></span>
            <ArrowRight className="size-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
          </div>
          <h2 className="mt-5 text-lg font-bold text-foreground">Group Health & leskwaliteit</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Volg aanwezigheid positief, vind geaggregeerde vaardigheidsbottlenecks en zet veilige vervolgacties klaar.</p>
        </Link>
      </div>

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

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft xl:col-span-2"><CapacityChart data={charts.capacity} /></section>
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft"><StatusDonutChart data={charts.intake} title="Intakeverdeling" description="Aanvragen gegroepeerd op actuele workflowstatus." /></section>
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft"><StatusDonutChart data={charts.payments} title="Betalingen per status" description="Werkelijke waarde van handmatige betalingen." valueLabel="Bedrag" valueFormat="currency" /></section>
      </div>

      <AdminSection
        title="Leadherkomst en conversie"
        description="First-party CRM-inzicht uit werkelijk verstuurde intakes. Journey Bot-data is uitgesloten; Google Analytics is hiervoor niet de bron van waarheid."
      >
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ReportMetric label="Leads" value={leadReport.totalLeads.toString()} />
          <ReportMetric label="Niet-direct herleid" value={`${leadReport.attributedLeads}`} />
          <ReportMetric label="Geconverteerd" value={leadReport.converted.toString()} />
          <ReportMetric label="Conversie" value={`${leadReport.conversionRate}%`} />
        </div>

        {leadReport.sources.length === 0 ? (
          <EmptyState>Nog geen echte intakeleads met herkomstgegevens.</EmptyState>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableCaption>Leadbronnen, gesorteerd op aantal echte intakes.</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kanaal</TableHead>
                    <TableHead>Bron</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Conversie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leadReport.sources.map((source) => (
                    <TableRow key={source.key}>
                      <TableCell><StatusPill tone={source.channel === "direct" ? "neutral" : "info"}>{source.channelLabel}</StatusPill></TableCell>
                      <TableCell className="font-medium text-foreground">{source.source}</TableCell>
                      <TableCell className="text-right font-semibold">{source.leads}</TableCell>
                      <TableCell className="text-right">{source.converted} · {source.conversionRate}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-foreground">Campagnes</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Topcampagnes op basis van veilige UTM-velden.</p>
                </div>
                <StatusPill tone="neutral">{leadReport.analyticsConsentRate}% GA-consent</StatusPill>
              </div>
              {leadReport.campaigns.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {leadReport.campaigns.map((campaign) => (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2" key={`${campaign.source}-${campaign.campaign}`}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{campaign.campaign}</p>
                        <p className="truncate text-xs text-muted-foreground">{campaign.source}</p>
                      </div>
                      <p className="shrink-0 text-xs font-semibold text-muted-foreground">{campaign.leads} · {campaign.conversionRate}%</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-lg bg-card px-3 py-4 text-sm text-muted-foreground">Nog geen UTM-campagnes ontvangen.</p>
              )}
              <Link className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline" href="/admin/intake">
                Open de intake-inbox <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        )}
      </AdminSection>

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
            <Table>
              <TableCaption>Opgeslagen rapportmomenten, nieuwste eerst.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Titel</TableHead>
                  <TableHead>Rapport</TableHead>
                  <TableHead>Metrics</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {data.reportSnapshots.map((snapshot) => (
                <TableRow key={snapshot.id}>
                  <TableCell className="min-w-44 font-semibold text-foreground">{snapshot.title}</TableCell>
                  <TableCell className="min-w-40"><p className="font-medium text-foreground">{snapshot.report_key}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(snapshot.created_at)}</p></TableCell>
                  <TableCell className="min-w-64"><div className="flex flex-wrap gap-2">{Object.entries(snapshot.metrics).slice(0, 6).map(([key, value]) => <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground" key={key}>{key}: {String(value)}</span>)}</div></TableCell>
                  <TableCell className="text-right"><StatusPill tone={snapshot.status === "active" ? "success" : "neutral"}>{snapshot.status}</StatusPill></TableCell>
                </TableRow>
              ))}
              </TableBody>
            </Table>
          )}
        </AdminSection>
      </div>
    </div>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
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
