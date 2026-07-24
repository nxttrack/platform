import { CheckCircle2 } from "lucide-react";

import { TenantOnboardingWizard } from "@/components/platform/tenant-onboarding-wizard";
import { Photo } from "@/components/lovable/page-kit";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function PlatformOnboardingPage({ searchParams }: PageProps) {
  await requirePrivateShellContext("/platform/onboarding");
  const params = (await searchParams) ?? {};
  const opened = getParam(params, "opened") === "1";
  const error = getParam(params, "error");
  const runs = await getRecentRuns();

  return (
    <div className="space-y-6">
      <PageHeader kicker="Tenant lifecycle" title="Nieuwe zwemschool onboarden" subtitle="Van lege tenant naar gecontroleerd geopende organisatie in één herhaalbare flow." />
      {opened ? <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm font-semibold text-success"><CheckCircle2 className="size-5" />Tenant geopend en eigenaar uitgenodigd.</div> : null}
      {error ? <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm font-semibold text-danger">Provisioning is veilig gestopt. De tenant blijft inactief; controleer de run hieronder.</div> : null}
      <Photo className="max-h-56" label="Zwemschoolteam start de onboarding samen aan een lichte werktafel" promptId="IMG-31-11" ratio="aspect-[16/5]" />
      <TenantOnboardingWizard />
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-lg font-bold">Recente onboardingruns</h2>
        <div className="mt-4 space-y-3">
          {runs.length ? runs.map((run) => (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3" key={run.id}>
              <div><p className="font-semibold">{String(run.draft_data.name ?? "Onbekende tenant")}</p><p className="text-xs text-muted-foreground">{run.current_step} · {new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(run.created_at))}</p>{typeof run.checklist.error === "string" ? <p className="mt-1 text-xs text-danger">{run.checklist.error}</p> : null}</div>
              <StatusPill tone={run.status === "opened" ? "success" : run.status === "attention_required" ? "danger" : "warning"}>{run.status}</StatusPill>
            </div>
          )) : <p className="text-sm text-muted-foreground">Nog geen onboardingruns.</p>}
        </div>
      </section>
    </div>
  );
}

async function getRecentRuns() {
  const admin = createAdminClient();
  const { data, error } = await admin.from("tenant_onboarding_runs").select("id, status, current_step, draft_data, checklist, created_at").order("created_at", { ascending: false }).limit(10);
  if (error) throw new Error(`Could not load onboarding runs: ${error.message}`);
  return (data ?? []) as { id: string; status: string; current_step: string; draft_data: Record<string, unknown>; checklist: Record<string, unknown>; created_at: string }[];
}
function getParam(params: Record<string, string | string[] | undefined>, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] : value; }
