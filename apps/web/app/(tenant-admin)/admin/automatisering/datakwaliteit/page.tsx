import { AlertTriangle, CircleAlert, DatabaseZap, ShieldCheck } from "lucide-react";

import { AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { DataQualityTable } from "@/components/admin/data-quality-table";
import { PageHeader } from "@/components/shell/ui";
import { Button } from "@/components/ui/button";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { runDataQualityChecksAction } from "@/lib/domain/data-quality-actions";
import { getDataQualityDashboardData } from "@/lib/domain/data-quality";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DataQualityPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([
    getDataQualityDashboardData(),
    searchParams ?? Promise.resolve({})
  ]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const query = getParam(params, "q");
  const openIssues = data.issues.filter((issue) => issue.status === "open");
  const counts = {
    critical: openIssues.filter((issue) => issue.severity === "critical").length,
    error: openIssues.filter((issue) => issue.severity === "error").length,
    warning: openIssues.filter((issue) => issue.severity === "warning").length,
    healthy: data.issues.filter((issue) => ["resolved", "auto_resolved"].includes(issue.status)).length
  };

  return (
    <div className="space-y-5">
      <PageHeader
        action={
          <form action={runDataQualityChecksAction}>
            <Button className="min-h-11" type="submit">
              <DatabaseZap className="size-4" aria-hidden="true" />
              Controle uitvoeren
            </Button>
          </form>
        }
        kicker="Automatisering"
        title="Data Quality Assistant"
        subtitle="Signaleert uitlegbaar waar brondata slimme plaatsing, planning, communicatie of betaling kan verstoren. NXTTRACK wijzigt nooit automatisch leerlingdata."
      />

      <RouteFeedback
        success={successMessage(saved, params)}
        error={error ? errorMessage(error) : null}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={CircleAlert} label="Kritiek" tone={counts.critical ? "danger" : "success"} value={counts.critical} detail="direct beoordelen" />
        <AdminMetricCard icon={AlertTriangle} label="Fouten" tone={counts.error ? "warning" : "success"} value={counts.error} detail="beïnvloedt workflows" />
        <AdminMetricCard icon={ShieldCheck} label="Waarschuwingen" tone={counts.warning ? "warning" : "success"} value={counts.warning} detail="menselijke controle" />
        <AdminMetricCard icon={DatabaseZap} label="Hersteld" tone="success" value={counts.healthy} detail="handmatig of automatisch" />
      </div>

      <section className="rounded-xl border border-primary/15 bg-gradient-to-r from-primary/5 via-card to-card px-4 py-3 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-primary">Controleerbare assistent</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ieder signaal bevat reden, bronbewijs en confidence. Negeerde false positives blijven genegeerd; verdwenen open issues worden bij een volgende scan automatisch als hersteld gemarkeerd.
            </p>
          </div>
          <p className="shrink-0 text-xs font-semibold text-muted-foreground">
            Laatste controle: {data.lastScanAt ? formatDateTime(data.lastScanAt) : "nog niet uitgevoerd"}
          </p>
        </div>
      </section>

      <AdminListSurface>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Datakwaliteitsissues</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">Open een rij voor bewijs, aanbevolen vervolgstap en expliciete menselijke acties.</p>
          </div>
          <p className="text-xs font-semibold text-muted-foreground">{openIssues.length} open · {data.issues.length} totaal</p>
        </div>
        <DataQualityTable
          initialSearch={query}
          rows={data.issues.map((issue) => ({
            id: issue.id,
            entityType: issue.entity_type,
            entityLabel: stringMetadata(issue.metadata_json, "entityLabel", "Onbekend record"),
            entityHref: safeHref(issue.metadata_json.entityHref),
            issueType: issue.issue_type,
            severity: issue.severity,
            title: issue.title,
            description: issue.description,
            suggestedAction: issue.suggested_action,
            status: issue.status,
            detectedAt: issue.detected_at,
            lastDetectedAt: issue.last_detected_at,
            confidence: numberMetadata(issue.metadata_json, "confidence", 0.8),
            evidence: stringArrayMetadata(issue.metadata_json.evidence),
            isTest: issue.is_test
          }))}
        />
      </AdminListSurface>
    </div>
  );
}

function successMessage(saved: string | undefined, params: Record<string, string | string[] | undefined>) {
  if (saved === "scan") {
    return `Controle afgerond: ${getParam(params, "detected") ?? "0"} signalen gevonden, ${getParam(params, "created") ?? "0"} nieuw of heropend en ${getParam(params, "resolved") ?? "0"} automatisch hersteld.`;
  }
  if (saved === "ignored") return "Het issue is als false positive genegeerd en blijft auditbaar.";
  if (saved === "resolved") return "Het issue is handmatig als opgelost gemarkeerd.";
  if (saved === "task") return "Opvolgtaak aangemaakt; de brondata is niet gewijzigd.";
  if (saved === "task_exists") return "Voor dit issue bestaat al een open opvolgtaak.";
  return null;
}

function errorMessage(error: string) {
  return (
    {
      scan: "De controle kon niet volledig worden uitgevoerd. Er zijn geen bronrecords automatisch gewijzigd.",
      issue_state: "Het issue is intussen gewijzigd of niet meer open. Vernieuw het overzicht.",
      issue_missing: "Het issue kon niet tenant-veilig worden teruggevonden.",
      task: "De opvolgtaak kon niet worden aangemaakt.",
      task_lookup: "Bestaande opvolgtaken konden niet betrouwbaar worden gecontroleerd.",
      forbidden: "Je hebt geen beheerrecht voor deze actie.",
      identifier: "Het issue-ID is ongeldig.",
      status: "De gekozen issue-status is ongeldig."
    } as Record<string, string>
  )[error] ?? "De datakwaliteitsactie is niet gelukt.";
}

function stringMetadata(metadata: Record<string, unknown>, key: string, fallback: string) {
  return typeof metadata[key] === "string" && metadata[key] ? String(metadata[key]) : fallback;
}

function numberMetadata(metadata: Record<string, unknown>, key: string, fallback: number) {
  return typeof metadata[key] === "number" && Number.isFinite(metadata[key]) ? Number(metadata[key]) : fallback;
}

function stringArrayMetadata(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function safeHref(value: unknown) {
  return typeof value === "string" && value.startsWith("/admin") ? value : "/admin/automatisering/datakwaliteit";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
