import { Activity, BookOpen, CheckCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AutomationRecipeGallery } from "@/components/admin/automation-recipe-gallery";
import {
  AutomationRecipeRunsTable,
  type AutomationRecipeRunTableRow
} from "@/components/admin/automation-recipe-runs-table";
import { AdminSection } from "@/components/admin/domain-ui";
import { PageHeader } from "@/components/shell/ui";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { getAutomationRecipeDashboard } from "@/lib/domain/automation-recipes";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AutomationRecipeGalleryPage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/admin/automatisering");
  const canManage = context.activeTenant?.roles.some(
    (role) => role === "tenant_owner" || role === "tenant_admin"
  ) ?? false;
  if (!canManage) redirect("/admin?error=forbidden");

  const tenant = getActiveTenant(context);
  const dashboard = await getAutomationRecipeDashboard(tenant.id);
  const params = (await searchParams) ?? {};
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const activeCount = dashboard.configs.filter((config) => config.enabled).length;
  const completedReviewTasks = dashboard.runs.filter(
    (run) => run.actions_taken_json.includes("review_task_created")
  ).length;

  const rows: AutomationRecipeRunTableRow[] = dashboard.runs.map((run) => ({
    id: run.id,
    recipeKey: run.recipe_key,
    status: run.status,
    executionMode: run.execution_mode,
    triggerEntityType: run.trigger_entity_type,
    reviewTaskId: run.review_task_id,
    actions: run.actions_taken_json,
    reasons: run.reasons_json,
    sourceData: run.source_data_json,
    confidence: run.confidence,
    skippedReason: run.skipped_reason,
    errorCode: run.error_code,
    isTest: run.is_test,
    startedAt: run.started_at
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        action={(
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-bold text-foreground shadow-soft hover:bg-muted"
            href="/admin/automatisering/regels"
          >
            <BookOpen className="size-4" aria-hidden="true" />
            Eigen regels
          </Link>
        )}
        kicker="Veilige automatisering"
        subtitle={`Kies gecontroleerde recipes voor ${tenant.name}. Iedere live uitkomst blijft een interne taak met menselijke beoordeling.`}
        title="Automation recipegallery"
      />

      {saved ? <Feedback ok>{savedMessage(saved)}</Feedback> : null}
      {error ? <Feedback>{errorMessage(error)}</Feedback> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric icon={ShieldCheck} label="Beschikbare recipes" value={dashboard.catalog.length} />
        <Metric icon={Activity} label="Actief" value={activeCount} />
        <Metric icon={CheckCheck} label="Reviewtaken in log" value={completedReviewTasks} />
      </div>

      <AutomationRecipeGallery
        canManage
        configs={dashboard.configs}
        recipes={dashboard.catalog}
      />

      <AdminSection
        description="Laatste 100 runs met uitlegbare brondata, redenen, confidence en veilige uitkomst. Testmodus maakt nooit een taak."
        title="Recipe-auditlog"
      >
        <AutomationRecipeRunsTable rows={rows} />
      </AdminSection>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Activity;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function Feedback({ children, ok = false }: { children: string; ok?: boolean }) {
  return (
    <p className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
      ok
        ? "border-success/20 bg-success/10 text-success"
        : "border-danger/20 bg-danger/10 text-danger"
    }`}>
      {children}
    </p>
  );
}

function savedMessage(value: string) {
  const messages: Record<string, string> = {
    activated: "Recipe geactiveerd. Alleen interne controletaken zijn toegestaan.",
    config: "Veilige recipeconfiguratie opgeslagen.",
    duplicate: "Dit signaal was al verwerkt; er is geen dubbele taak gemaakt.",
    failed: "De recipe-run is gelogd, maar de interne controletaak kon niet worden gemaakt.",
    paused: "Recipe gepauzeerd.",
    review_task: "Interne controletaak gemaakt. Er is niets extern verstuurd of operationeel gewijzigd.",
    skipped: "Geen veilig passend live signaal gevonden; de controle is gelogd.",
    test: "Test afgerond zonder taak of andere bijwerking."
  };
  return messages[value] ?? "Automatisering verwerkt.";
}

function errorMessage(value: string) {
  const messages: Record<string, string> = {
    activation: "Activeren of pauzeren is niet gelukt.",
    activation_confirmation: "Bevestig eerst de review-only veiligheidsgrens.",
    config_lookup: "De recipeconfiguratie kon niet worden geladen.",
    config_save: "De recipeconfiguratie kon niet worden opgeslagen.",
    evaluation: "De recipe kon niet veilig worden geëvalueerd.",
    forbidden: "Alleen organisatie-eigenaren en beheerders mogen recipes beheren.",
    live_confirmation: "Bevestig eerst dat je één interne controletaak wilt laten maken.",
    recipe: "Deze recipe bestaat niet.",
    recipe_not_active: "Activeer de recipe voordat je een live signaal controleert."
  };
  return messages[value] ?? "Automatisering kon niet worden verwerkt.";
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
