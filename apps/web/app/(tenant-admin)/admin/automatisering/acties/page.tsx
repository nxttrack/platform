import { AlertTriangle, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { NextBestActionsTable } from "@/components/admin/next-best-actions-table";
import { SubmitButton } from "@/components/admin/domain-ui";
import { PageHeader } from "@/components/shell/ui";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { generateNextBestActionsAction } from "@/lib/domain/next-best-actions-actions";
import { getTenantNextBestActions } from "@/lib/domain/next-best-actions";

export const dynamic = "force-dynamic";

export default async function NextBestActionsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requirePrivateShellContext("/admin/automatisering/acties");
  const tenant = getActiveTenant(context);
  const actions = await getTenantNextBestActions({ tenantId: tenant.id });
  const params = (await searchParams) ?? {};
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const search = getParam(params, "q");
  const open = actions.filter((action) => action.status === "open");

  return (
    <div className="space-y-5">
      <PageHeader
        action={<form action={generateNextBestActionsAction}><SubmitButton><RefreshCw className="size-4" />Signalen nu verversen</SubmitButton></form>}
        kicker="Automatisering"
        title="Vandaag belangrijk"
        subtitle="Verklaarbare prioriteiten uit intake, wachtlijst, capaciteit, planning, betalingen en datakwaliteit. Elk operationeel besluit blijft menselijk."
      />
      {saved ? <Feedback ok>{feedbackLabel(saved, params)}</Feedback> : null}
      {error ? <Feedback>Actie kon niet worden uitgevoerd ({error}).</Feedback> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <AdminMetricCard icon={AlertTriangle} label="Open" tone={open.length ? "warning" : "success"} value={open.length} />
        <AdminMetricCard icon={Clock3} label="Hoge prioriteit" tone={open.some((action) => action.priority === "high") ? "danger" : "neutral"} value={open.filter((action) => action.priority === "high").length} />
        <AdminMetricCard icon={CheckCircle2} label="Afgerond / opgelost" tone="success" value={actions.filter((action) => ["completed", "auto_resolved"].includes(action.status)).length} />
      </div>

      <AdminListSurface>
        <div className="mb-3">
          <h2 className="text-base font-bold text-foreground">Actievoorstellen</h2>
          <p className="text-[13px] leading-5 text-muted-foreground">Open een rij voor redenen, brondata, confidence en veilige vervolgstappen.</p>
        </div>
        <NextBestActionsTable
          initialSearch={search}
          rows={actions.map((action) => ({
            id: action.id,
            actionType: action.action_type,
            title: action.title,
            description: action.description,
            priority: action.priority,
            status: action.status,
            dueAt: action.due_at,
            reasons: action.reasons_json,
            sourceHref: action.source_href,
            confidence: Number(action.confidence),
            isTest: action.is_test,
            generatedAt: action.last_generated_at
          }))}
        />
      </AdminListSurface>
    </div>
  );
}

function Feedback({ children, ok = false }: { children: ReactNode; ok?: boolean }) {
  return <p className={ok ? "rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success" : "rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger"}>{children}</p>;
}

function feedbackLabel(saved: string, params: Record<string, string | string[] | undefined>) {
  if (saved === "generated") return `${getParam(params, "detected") ?? "0"} signalen gevonden; ${getParam(params, "resolved") ?? "0"} verouderde acties automatisch opgelost.`;
  if (saved === "task") return "Taak is aangemaakt en aan de bronactie gekoppeld.";
  if (saved === "task_exists") return "Er bestaat al een open taak voor deze actie.";
  if (saved === "dismissed") return "Actie is genegeerd en blijft auditbaar.";
  if (saved === "completed") return "Actie is als gedaan gemarkeerd.";
  return "Actie opgeslagen.";
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
