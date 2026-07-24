import { Archive, Clock3, Pause, Play, ShieldCheck, Square, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { AdminSection, EmptyState, SubmitButton } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  archiveJourneyBotRunAction,
  pauseJourneyBotAction,
  resolveJourneyBotIssueAction,
  resumeJourneyBotAction,
  runJourneyBotNowAction,
  saveJourneyBotConfigAction,
  startJourneyBotWindowAction,
  stopAllJourneyBotsAction
} from "@/lib/domain/journey-bot-actions";
import { getJourneyBotDashboardData, type JourneyBotConfigRow } from "@/lib/domain/journey-bot";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function JourneyBotPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const data = await getJourneyBotDashboardData();
  const waterlijn = data.tenants.find((tenant) => tenant.slug === "waterlijn-demo");
  const config =
    data.configs.find((item) => item.tenant_id === waterlijn?.id && item.environment === data.environment.environment) ??
    data.configs.find((item) => item.environment === data.environment.environment) ??
    null;
  const configTenant = data.tenants.find((tenant) => tenant.id === config?.tenant_id) ?? waterlijn ?? data.tenants[0] ?? null;
  const programs = data.programs.filter((program) => program.tenant_id === configTenant?.id);
  const configuredProgramIds = new Set(parseStringArray(config?.program_ids_json));
  const activeJourneys = data.journeys.filter((journey) => journey.journey_status === "running");
  const completedJourneys = data.journeys.filter((journey) => String(journey.journey_status).startsWith("completed"));
  const failedJourneys = data.journeys.filter((journey) => journey.journey_status === "failed");
  const openIssues = data.issues.filter((issue) => !issue.resolved);
  const issueFilter = getParam(params, "issues") ?? "open";
  const visibleIssues = data.issues.filter((issue) => {
    if (issueFilter === "all") return true;
    if (issueFilter === "open") return !issue.resolved;
    return issue.severity === issueFilter;
  });
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Platform test tools"
        subtitle="Versnel de volledige zwemschoolreis met herkenbare, archiveerbare testdata. Externe notificaties en betalingen blijven altijd onderdrukt."
        title="Journey Simulation Bot"
      />

      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-soft">
        <div className="flex items-start gap-3">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-700" />
          <div>
            <p className="font-bold">Uitsluitend voor dev/staging testdata</p>
            <p className="mt-1 text-amber-900/80">De bot is in productie standaard hard geblokkeerd. Testrecords krijgen bron, run-id en archiveringsmarkering.</p>
          </div>
        </div>
      </div>

      {saved ? <Notice tone="success">Actie uitgevoerd: {savedLabel(saved)}.</Notice> : null}
      {error ? <Notice tone="danger">Actie kon niet veilig worden uitgevoerd ({error}). Controleer configuratie en logs.</Notice> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Botstatus" value={!config?.enabled ? "Uit" : config.paused ? "Gepauzeerd" : "Actief"} tone={!config?.enabled ? "neutral" : config.paused ? "warning" : "success"} />
        <Metric label="Environment" value={data.environment.environment ?? "Onbekend"} tone={data.environment.allowed ? "success" : "danger"} />
        <Metric label="Actief" value={activeJourneys.length.toString()} tone={activeJourneys.length ? "info" : "neutral"} />
        <Metric label="Voltooid" value={completedJourneys.length.toString()} tone="success" />
        <Metric label="Mislukt" value={failedJourneys.length.toString()} tone={failedJourneys.length ? "danger" : "neutral"} />
        <Metric label="Open issues" value={openIssues.length.toString()} tone={openIssues.length ? "warning" : "success"} />
      </div>

      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-gradient-to-r from-slate-950 to-blue-950 px-5 py-5 text-white">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-aqua">Control plane</p>
            <h2 className="mt-1 text-xl font-bold">{configTenant?.name ?? "Nog geen target tenant"}</h2>
            <p className="mt-1 text-sm text-slate-300">
              {config?.last_run_at ? `Laatste run ${formatDateTime(config.last_run_at)} · ${config.last_status ?? "onbekend"}` : "Nog geen run uitgevoerd"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={data.environment.allowed ? "success" : "danger"}>
              <ShieldCheck className="size-3.5" /> {data.environment.allowed ? "Environment veilig" : "Environment geblokkeerd"}
            </StatusPill>
            <StatusPill tone="success">Mail uit</StatusPill>
            <StatusPill tone="success">Betalingen uit</StatusPill>
          </div>
        </div>

        <form action={saveJourneyBotConfigAction} className="grid gap-6 p-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Target tenant">
                <NativeSelect defaultValue={configTenant?.id} name="tenantId" required>
                  {data.tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Scenario">
                <NativeSelect defaultValue={config?.scenario_mode ?? "full_journey_to_diploma"} name="scenarioMode">
                  <option value="intake_only">Alleen intake</option>
                  <option value="intake_to_placement">Intake tot plaatsing</option>
                  <option value="placement_to_next_stage">Plaatsing tot volgend niveau</option>
                  <option value="full_journey_to_diploma">Volledige reis tot diploma</option>
                  <option value="stress_mix">Stressmix</option>
                </NativeSelect>
              </Field>
              <Field label="Snelheid">
                <NativeSelect defaultValue={config?.run_speed ?? "fast"} name="runSpeed">
                  <option value="fast">Versneld</option>
                  <option value="balanced">Gebalanceerd</option>
                  <option value="realistic">Realistisch</option>
                </NativeSelect>
              </Field>
              <Field label="Archiveren na dagen">
                <Input defaultValue={config?.cleanup_after_days ?? 14} max={365} min={1} name="cleanupAfterDays" type="number" />
              </Field>
            </div>

            <div>
              <p className="text-sm font-bold text-foreground">Target programma&apos;s</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {programs.length ? programs.map((program) => (
                  <CheckCard
                    defaultChecked={!config || configuredProgramIds.size === 0 || configuredProgramIds.has(program.id)}
                    key={program.id}
                    label={program.name}
                    name="programIds"
                    value={program.id}
                  />
                )) : <EmptyState>Na tenantwissel eenmaal opslaan; vervolgens verschijnen de actieve programma&apos;s.</EmptyState>}
              </div>
            </div>

            <div>
              <p className="text-sm font-bold text-foreground">Actieve dagen</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((day, index) => (
                  <CheckCard
                    compact
                    defaultChecked={parseNumberArray(config?.active_days_json).includes(index + 1)}
                    key={day}
                    label={day}
                    name="activeDays"
                    value={String(index + 1)}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Actief vanaf"><Input defaultValue={parseWindow(config).start} name="windowStart" type="time" /></Field>
              <Field label="Actief tot"><Input defaultValue={parseWindow(config).end} name="windowEnd" type="time" /></Field>
            </div>
          </div>

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Min. interval (min)"><Input defaultValue={config?.min_interval_minutes ?? 3} min={1} name="minIntervalMinutes" type="number" /></Field>
              <Field label="Max. interval (min)"><Input defaultValue={config?.max_interval_minutes ?? 12} min={1} name="maxIntervalMinutes" type="number" /></Field>
              <Field label="Journeys per run"><Input defaultValue={config?.max_journeys_per_run ?? 1} max={25} min={1} name="maxJourneysPerRun" type="number" /></Field>
              <Field label="Max. tegelijk"><Input defaultValue={config?.max_active_journeys ?? 3} max={100} min={1} name="maxActiveJourneys" type="number" /></Field>
              <Field label="Max. per dag"><Input defaultValue={config?.max_journeys_per_day ?? 50} max={1000} min={1} name="maxJourneysPerDay" type="number" /></Field>
              <Field label="Stop na journeys"><Input defaultValue={config?.stop_after_journeys ?? 0} min={0} name="stopAfterJourneys" type="number" /></Field>
              <Field label="Runvenster (uren)"><Input defaultValue={0} max={168} min={0} name="runDurationHours" type="number" /></Field>
            </div>

            <div className="space-y-2 rounded-2xl border border-border bg-muted/40 p-4">
              <CheckCard defaultChecked={config?.enabled ?? false} label="Bot ingeschakeld" name="enabled" value="on" />
              <CheckCard defaultChecked={config?.paused ?? false} label="Nieuwe runs pauzeren" name="paused" value="on" />
              <CheckCard defaultChecked={config?.use_fallback_placement ?? false} label="Deterministische fallbackplaatsing toestaan" name="useFallbackPlacement" value="on" />
              <p className="pt-2 text-xs leading-5 text-muted-foreground">
                Externe notificaties en echte betalingen worden server-side altijd onderdrukt en kunnen hier niet worden uitgezet.
              </p>
            </div>
            <SubmitButton>Configuratie opslaan</SubmitButton>
          </div>
        </form>

        {config ? (
          <div className="flex flex-wrap gap-2 border-t border-border bg-muted/30 px-5 py-4">
            <ActionForm action={runJourneyBotNowAction} configId={config.id} icon={<Play className="size-4" />} label="Run now" primary />
            <form action={startJourneyBotWindowAction} className="flex items-center gap-2">
              <input name="configId" type="hidden" value={config.id} />
              <Input aria-label="Aantal uren" className="w-20" defaultValue={4} max={168} min={1} name="hours" type="number" />
              <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold hover:border-primary/40" type="submit">
                <Clock3 className="size-4" /> Run komende uren
              </button>
            </form>
            {config.paused ? (
              <ActionForm action={resumeJourneyBotAction} configId={config.id} icon={<Play className="size-4" />} label="Hervatten" />
            ) : (
              <ActionForm action={pauseJourneyBotAction} configId={config.id} icon={<Pause className="size-4" />} label="Pauzeren" />
            )}
            <form action={stopAllJourneyBotsAction}>
              <button className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100" type="submit">
                <Square className="size-4" /> Alles stoppen
              </button>
            </form>
          </div>
        ) : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <AdminSection description="De laatste tien runs, inclusief aantallen en bewaard releasebewijs." title="Recente runs">
          {data.runs.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <tr><th className="px-3 py-2">Start</th><th className="px-3 py-2">Scenario</th><th className="px-3 py-2">Resultaat</th><th className="px-3 py-2">Actie</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.runs.map((run) => (
                    <tr key={run.id}>
                      <td className="px-3 py-3"><p className="font-semibold">{formatDateTime(run.started_at)}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{run.id.slice(0, 8)}</p></td>
                      <td className="px-3 py-3">{scenarioLabel(run.scenario_mode)}</td>
                      <td className="px-3 py-3"><StatusPill tone={run.status === "completed" ? "success" : run.status === "failed" ? "danger" : run.status === "running" ? "info" : "warning"}>{run.status} · {run.completed_count}/{run.started_count}</StatusPill></td>
                      <td className="px-3 py-3">
                        <form action={archiveJourneyBotRunAction}>
                          <input name="runId" type="hidden" value={run.id} />
                          <button className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" type="submit"><Archive className="size-3.5" /> Archiveren</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState>Nog geen Journey Bot-runs.</EmptyState>}
        </AdminSection>

        <AdminSection description="Issues falen nooit stil; context en doorgaanstatus worden per stap opgeslagen." title="Issues">
          <div className="mb-3 flex flex-wrap gap-2">
            {["open", "warning", "error", "critical", "all"].map((filter) => (
              <Link className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${issueFilter === filter ? "bg-primary text-primary-foreground ring-primary" : "bg-white text-muted-foreground ring-border"}`} href={`${pagePath}?issues=${filter}`} key={filter}>
                {filter}
              </Link>
            ))}
          </div>
          {visibleIssues.length ? (
            <div className="max-h-[430px] divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {visibleIssues.map((issue) => (
                <div className="p-3" key={issue.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={issue.severity === "critical" || issue.severity === "error" ? "danger" : issue.severity === "warning" ? "warning" : "info"}>{issue.severity}</StatusPill>
                        <span className="font-mono text-[11px] text-muted-foreground">{issue.issue_type}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-foreground">{issue.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(issue.created_at)}</p>
                    </div>
                    {!issue.resolved ? (
                      <form action={resolveJourneyBotIssueAction}>
                        <input name="issueId" type="hidden" value={issue.id} />
                        <button className="text-xs font-semibold text-primary hover:underline" type="submit">Opgelost</button>
                      </form>
                    ) : <StatusPill tone="success">opgelost</StatusPill>}
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState>Geen issues voor dit filter.</EmptyState>}
        </AdminSection>
      </div>

      <AdminSection description="De laatste twintig kindreizen met korte, leesbare auditlog." title="Journey logs per kind">
        {data.journeys.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.journeys.map((journey) => {
              const events = data.events.filter((event) => event.child_journey_id === journey.id);
              return (
                <details className="group rounded-2xl border border-border bg-white p-4 open:shadow-soft" key={journey.id}>
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-foreground">{journey.child_display_name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{journey.guardian_display_name} · {journey.smoke_run_id}</p>
                      </div>
                      <StatusPill tone={journey.journey_status === "failed" ? "danger" : String(journey.journey_status).startsWith("blocked") ? "warning" : journey.journey_status === "running" ? "info" : "success"}>{journey.journey_status}</StatusPill>
                    </div>
                  </summary>
                  <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-200">{journey.summary_log || "Nog geen logregels."}</pre>
                  {events.length ? <p className="mt-2 text-xs font-semibold text-muted-foreground">{events.length} eventlog(s) bewaard</p> : null}
                </details>
              );
            })}
          </div>
        ) : <EmptyState>Na de eerste veilige run verschijnen hier de kindreizen.</EmptyState>}
      </AdminSection>
    </div>
  );
}

const pagePath = "/platform/test-tools/journey-bot";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-foreground">{label}</span>{children}</label>;
}

function CheckCard({ compact = false, defaultChecked, label, name, value }: { compact?: boolean; defaultChecked: boolean; label: string; name: string; value: string }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-white ${compact ? "px-3 py-2" : "p-3"} text-sm font-semibold text-foreground transition hover:border-primary/30`}>
      <input className="size-4 accent-primary" defaultChecked={defaultChecked} name={name} type="checkbox" value={value} />
      {label}
    </label>
  );
}

function Metric({ label, tone, value }: { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral"; value: string }) {
  const tones = {
    success: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-red-700",
    info: "text-sky-700",
    neutral: "text-foreground"
  };
  return <section className="rounded-2xl border border-border bg-card p-4 shadow-soft"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className={`mt-2 truncate text-2xl font-bold ${tones[tone]}`}>{value}</p></section>;
}

function Notice({ children, tone }: { children: React.ReactNode; tone: "success" | "danger" }) {
  return <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`} role="status">{children}</div>;
}

function ActionForm({ action, configId, icon, label, primary = false }: { action: (formData: FormData) => Promise<void>; configId: string; icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <form action={action}>
      <input name="configId" type="hidden" value={configId} />
      <button className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${primary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border bg-white hover:border-primary/40"}`} type="submit">
        {icon}{label}
      </button>
    </form>
  );
}

function parseStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseNumberArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [1, 2, 3, 4, 5];
}

function parseWindow(config: JourneyBotConfigRow | null) {
  const windows = config?.active_time_windows_json;
  if (Array.isArray(windows) && windows[0] && typeof windows[0] === "object" && !Array.isArray(windows[0])) {
    const item = windows[0] as Record<string, unknown>;
    if (typeof item.start === "string" && typeof item.end === "string") return { start: item.start, end: item.end };
  }
  return { start: "00:00", end: "23:59" };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value));
}

function scenarioLabel(value: string) {
  return {
    intake_only: "Intake",
    intake_to_placement: "Intake → plaatsing",
    placement_to_next_stage: "Doorstroom",
    full_journey_to_diploma: "Volledige reis",
    stress_mix: "Stressmix"
  }[value] ?? value;
}

function savedLabel(value: string) {
  return {
    archived: "testdata gearchiveerd",
    config: "configuratie opgeslagen",
    issue: "issue gemarkeerd",
    paused: "bot gepauzeerd",
    resumed: "bot hervat",
    run: "run voltooid",
    stopped: "alle bots gestopt",
    window: "runvenster gestart"
  }[value] ?? value;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
