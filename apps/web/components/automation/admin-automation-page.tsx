import { AlertTriangle, Bot, CheckCircle2, History, LockKeyhole, RotateCcw, ShieldCheck, SlidersHorizontal, ToggleLeft } from "lucide-react";
import type { ReactNode } from "react";

import { AdminTabs } from "@/components/admin/admin-tabs";
import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { createAutomationSafetyLogAction, requestAutomationRollbackAction, updateAutomationEngineSettingsAction, updateTenantFeatureFlagAction } from "@/lib/automation/admin-automation-actions";
import type { AdminAutomationSnapshot, AutomationEngineHealth, AutomationEngineSettingsRow, AutomationExecutionLogRow, TenantFeatureFlagRow } from "@/lib/automation/admin-automation-read-model";
import { automationLevels, normalizeSafetyLimits } from "@/lib/smart-flow/automation";

type Props = {
  snapshot: AdminAutomationSnapshot;
};

export function AdminAutomationPage({ snapshot }: Props) {
  if (snapshot.status !== "ready" || !snapshot.tenant) {
    return <AutomationStatusPanel snapshot={snapshot} />;
  }

  const data = snapshot.data;
  const globalFlags = Object.fromEntries(data.featureFlags.map((flag) => [flag.flag_key, flag.enabled]));
  const automaticEngines = data.engineSettings.filter((setting) => setting.automation_level === "execute_automatically").length;
  const blockedLogs = data.executionLogs.filter((log) => ["blocked", "failed"].includes(log.action_status)).length;
  const enabledFlags = data.featureFlags.filter((flag) => flag.enabled).length;

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="warning">Safety first</StatusPill>}
        kicker="Backoffice - automatisering"
        subtitle="Schakel tenants veilig op van aanbevelen naar voorbereiden, approval en uiteindelijk automatische uitvoering per smart engine."
        title="Advanced automation"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<Bot className="h-5 w-5" />} label="Engines" value={data.engineSettings.length.toString()} detail="configureerbaar per tenant" />
        <MetricCard icon={<ShieldCheck className="h-5 w-5" />} label="Auto engines" value={automaticEngines.toString()} detail="execute automatically" />
        <MetricCard icon={<ToggleLeft className="h-5 w-5" />} label="Feature flags" value={`${enabledFlags}/${data.featureFlags.length}`} detail="tenant level" />
        <MetricCard icon={<AlertTriangle className="h-5 w-5" />} label="Geblokkeerd" value={blockedLogs.toString()} detail="logs met safety stop" />
      </div>

      <AdminTabs
        tabs={[
          {
            id: "engines",
            label: "Smart engines",
            count: data.engineSettings.length,
            children: (
              <Card>
                <SectionHeader count={data.engineSettings.length} icon={<SlidersHorizontal className="h-5 w-5" />} title="Automation per smart engine" />
                <div className="grid gap-4">
                  {data.engineSettings.map((setting) => (
                    <EngineSettingsCard key={setting.id} globalFlags={globalFlags} health={data.engineHealth.find((entry) => entry.engineKey === setting.engine_key) ?? null} setting={setting} />
                  ))}
                </div>
              </Card>
            )
          },
          {
            id: "flags",
            label: "Feature flags",
            count: data.featureFlags.length,
            children: (
              <Card>
                <SectionHeader count={data.featureFlags.length} icon={<ToggleLeft className="h-5 w-5" />} title="Tenant feature flags" />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {data.featureFlags.map((flag) => (
                    <FeatureFlagCard key={flag.id} flag={flag} />
                  ))}
                </div>
              </Card>
            )
          },
          {
            id: "logs",
            label: "Logs & rollback",
            count: data.executionLogs.length,
            children: (
              <Card>
                <SectionHeader count={data.executionLogs.length} icon={<History className="h-5 w-5" />} title="Automation logs en rollback" />
                <div className="grid gap-3">
                  {data.executionLogs.length === 0 ? <EmptyState>Nog geen automation logs. Settingswijzigingen en safety checks worden vanaf S12 vastgelegd.</EmptyState> : null}
                  {data.executionLogs.map((log) => (
                    <AutomationLogCard key={log.id} log={log} />
                  ))}
                </div>
              </Card>
            )
          }
        ]}
      />
    </div>
  );
}

function FeatureFlagCard({ flag }: { flag: TenantFeatureFlagRow }) {
  return (
    <form action={updateTenantFeatureFlagAction} className="grid gap-3 rounded-2xl border border-border bg-muted/35 p-4">
      <input name="flag_key" type="hidden" value={flag.flag_key} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{flag.label}</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{flag.description ?? flag.flag_key}</p>
        </div>
        <StatusPill tone={flag.enabled ? "success" : "neutral"}>{flag.enabled ? "aan" : "uit"}</StatusPill>
      </div>
      <CheckboxField defaultChecked={flag.enabled} label="Ingeschakeld" name="enabled" />
      <SelectField defaultValue={flag.rollout_state} label="Rollout" name="rollout_state" options={rolloutOptions} />
      <button className={primaryButtonClassName} type="submit">
        Flag opslaan
      </button>
    </form>
  );
}

function EngineSettingsCard({ globalFlags, health, setting }: { globalFlags: Record<string, boolean>; health: AutomationEngineHealth | null; setting: AutomationEngineSettingsRow }) {
  const limits = normalizeSafetyLimits(setting.safety_limits);
  const featureFlags = { ...globalFlags, ...setting.feature_flags };
  const safetyJson = JSON.stringify(limits);
  const flagsJson = JSON.stringify(featureFlags);

  return (
    <details className="rounded-3xl border border-border bg-muted/35 p-4" open={["placement", "slot_offer", "flow_through", "diploma_readiness"].includes(setting.engine_key)}>
      <summary className="cursor-pointer">
        <div className="inline-flex w-full flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold">{engineLabel(setting.engine_key)}</p>
            <p className="text-sm text-muted-foreground">
              {setting.engine_key} - {setting.rule_version} - legacy mode {setting.mode}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={levelTone(setting.automation_level)}>{automationLevelLabel(setting.automation_level)}</StatusPill>
            <StatusPill tone={health?.safeForAutomatic ? "success" : "warning"}>{health?.safeForAutomatic ? "auto safe" : "guarded"}</StatusPill>
          </div>
        </div>
      </summary>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <form action={updateAutomationEngineSettingsAction} className="grid gap-4 rounded-2xl border border-border bg-card p-4">
          <input name="engine_key" type="hidden" value={setting.engine_key} />
          <div className="grid gap-3 md:grid-cols-3">
            <SelectField defaultValue={setting.automation_level} label="Automation level" name="automation_level" options={automationLevelOptions} />
            <SelectField defaultValue={limits.min_confidence} label="Min confidence" name="min_confidence" options={confidenceOptions} />
            <TextField defaultValue={limits.min_score} label="Min score" name="min_score" type="number" />
            <TextField defaultValue={limits.max_auto_offers_per_day} label="Max auto offers per dag" name="max_auto_offers_per_day" type="number" />
            <TextField defaultValue={limits.rollback_window_minutes} label="Rollback window minuten" name="rollback_window_minutes" type="number" />
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <CheckboxField defaultChecked={limits.block_on_duplicate_risk} label="Blokkeer bij duplicaatrisico" name="block_on_duplicate_risk" />
            <CheckboxField defaultChecked={limits.require_available_target_group} label="Doelgroep verplicht" name="require_available_target_group" />
            <CheckboxField defaultChecked={limits.require_registered_result_for_diploma} label="Diploma-resultaat verplicht" name="require_registered_result_for_diploma" />
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <CheckboxField defaultChecked={setting.feature_flags.auto_execution === true} label="Engine auto execution" name="engine_auto_execution" />
            <CheckboxField defaultChecked={setting.feature_flags.auto_placement === true} label="Auto placement" name="engine_auto_placement" />
            <CheckboxField defaultChecked={setting.feature_flags.auto_slot_offers === true} label="Auto slot offers" name="engine_auto_slot_offers" />
            <CheckboxField defaultChecked={setting.feature_flags.auto_flow_through === true} label="Auto flow-through" name="engine_auto_flow_through" />
            <CheckboxField defaultChecked={setting.feature_flags.auto_diploma === true} label="Auto diploma" name="engine_auto_diploma" />
          </div>
          <button className={primaryButtonClassName} type="submit">
            Automation opslaan
          </button>
        </form>

        <div className="grid gap-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="font-bold">Safety status</p>
            <div className="mt-3 grid gap-2">
              {health?.blockers.length ? health.blockers.map((blocker) => <SafetyRow key={blocker} tone="danger" text={blocker} />) : <SafetyRow tone="success" text="Geen blocking safety issues in de huidige preview." />}
              {health?.warnings.map((warning) => <SafetyRow key={warning} tone="warning" text={warning} />)}
            </div>
          </div>

          <form action={createAutomationSafetyLogAction} className="grid gap-3 rounded-2xl border border-border bg-card p-4">
            <input name="engine_key" type="hidden" value={setting.engine_key} />
            <input name="automation_level" type="hidden" value={setting.automation_level} />
            <input name="safety_limits" type="hidden" value={safetyJson} />
            <input name="feature_flags" type="hidden" value={flagsJson} />
            <p className="font-bold">Safety check loggen</p>
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField defaultValue="high" label="Confidence" name="confidence" options={confidenceOptions} />
              <TextField defaultValue={90} label="Score" name="score" type="number" />
              <SelectField defaultValue="none" label="Duplicaatrisico" name="duplicate_risk" options={duplicateRiskOptions} />
              <TextField defaultValue={0} label="Auto offers vandaag" name="auto_offers_today" type="number" />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <CheckboxField defaultChecked label="Beschikbare doelgroep" name="available_target_group" />
              <CheckboxField defaultChecked={setting.engine_key !== "diploma_readiness"} label="Geregistreerd resultaat" name="registered_result" />
            </div>
            <button className={secondaryButtonClassName} type="submit">
              Safety check bewaren
            </button>
          </form>
        </div>
      </div>
    </details>
  );
}

function AutomationLogCard({ log }: { log: AutomationExecutionLogRow }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold">
            {engineLabel(log.engine_key)} - {log.action_key}
          </p>
          <p className="text-sm text-muted-foreground">
            {log.trigger_source} - {formatDateTime(log.created_at)} {log.subject_type ? `- ${log.subject_type}` : ""}
          </p>
          {log.failure_reason ? <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{log.failure_reason}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={statusTone(log.action_status)}>{log.action_status}</StatusPill>
          <StatusPill tone={log.rollback_available ? "info" : "neutral"}>{log.rollback_status}</StatusPill>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <InfoTile label="Level" value={automationLevelLabel(log.automation_level)} />
        <InfoTile label="Rollback ref" value={log.rollback_reference_table ? `${log.rollback_reference_table}:${log.rollback_reference_id?.slice(0, 8) ?? "-"}` : "-"} />
        <InfoTile label="Result" value={Object.keys(log.result ?? {}).length.toString()} />
      </div>
      {log.rollback_available || log.rollback_status === "available" ? (
        <form action={requestAutomationRollbackAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input name="id" type="hidden" value={log.id} />
          <label className="grid min-w-[16rem] flex-1 gap-1 text-xs font-semibold text-muted-foreground">
            <span>Rollback notitie</span>
            <input className={fieldClassName} name="note" placeholder="Waarom rollback review?" />
          </label>
          <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-bold text-amber-800 hover:bg-amber-100" type="submit">
            <RotateCcw className="h-4 w-4" />
            Rollback review
          </button>
        </form>
      ) : null}
    </div>
  );
}

function SafetyRow({ text, tone }: { text: string; tone: "success" | "warning" | "danger" }) {
  const icon = tone === "success" ? <CheckCircle2 className="h-4 w-4" /> : tone === "warning" ? <AlertTriangle className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />;
  const className = tone === "success" ? "bg-emerald-50 text-emerald-800" : tone === "warning" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800";

  return (
    <div className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${className}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function AutomationStatusPanel({ snapshot }: Props) {
  return (
    <div className="grid gap-6">
      <PageHeader kicker="Backoffice - automatisering" subtitle="Controleer tenantcontext, Supabase configuratie en S12 migraties." title="Automatisering niet beschikbaar" />
      <Card>
        <StatusPill tone={snapshot.status === "not_configured" ? "warning" : "danger"}>{snapshot.status}</StatusPill>
        <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
          {snapshot.errors.length === 0 ? <p>Geen extra foutdetails beschikbaar.</p> : null}
          {snapshot.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      </Card>
    </div>
  );
}

function MetricCard({ detail, icon, label, value }: { detail: string; icon: ReactNode; label: string; value: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
    </Card>
  );
}

function SectionHeader({ count, icon, title }: { count: number; icon: ReactNode; title: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <StatusPill tone="neutral">{count}</StatusPill>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-bold">{value}</p>
    </div>
  );
}

function TextField({ defaultValue, label, name, type = "text" }: { defaultValue?: number | string; label: string; name: string; type?: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <input className={fieldClassName} defaultValue={defaultValue ?? ""} name={name} type={type} />
    </label>
  );
}

function SelectField({ defaultValue, label, name, options }: { defaultValue?: string | null; label: string; name: string; options: { label: string; value: string }[] }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <select className={fieldClassName} defaultValue={defaultValue ?? ""} name={name}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxField({ defaultChecked, label, name }: { defaultChecked?: boolean; label: string; name: string }) {
  return (
    <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground">
      <input className="h-4 w-4 accent-primary" defaultChecked={defaultChecked} name={name} type="checkbox" />
      {label}
    </label>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">{children}</div>;
}

function engineLabel(engineKey: string) {
  const labels: Record<string, string> = {
    intake_recommendation: "Intake recommendation",
    stage_recommendation: "Stage recommendation",
    capacity: "Capacity engine",
    waitlist: "Smart waitlist",
    placement: "Placement assistant",
    slot_offer: "Slot offer flow",
    lesson: "Lesson and makeup",
    progress: "Progress engine",
    badge: "Badge engine",
    flow_through: "Flow-through",
    diploma_readiness: "Afzwem radar",
    milestone_event: "Milestone events",
    certificate: "Certificate vault",
    notification: "Notifications",
    task: "Task engine",
    reporting: "Reporting engine"
  };

  return labels[engineKey] ?? engineKey;
}

function automationLevelLabel(level: string) {
  const labels: Record<string, string> = {
    disabled: "Disabled",
    recommend_only: "Recommend only",
    recommend_and_prepare: "Recommend + prepare",
    execute_with_approval: "Execute with approval",
    execute_automatically: "Execute automatically"
  };

  return labels[level] ?? level;
}

function levelTone(level: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (level === "execute_automatically") {
    return "danger";
  }

  if (level === "execute_with_approval") {
    return "warning";
  }

  if (level === "recommend_and_prepare") {
    return "info";
  }

  if (level === "disabled") {
    return "neutral";
  }

  return "success";
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["executed", "prepared", "rolled_back"].includes(status)) {
    return "success";
  }

  if (["approval_required", "planned"].includes(status)) {
    return "warning";
  }

  if (["blocked", "failed", "rollback_unavailable"].includes(status)) {
    return "danger";
  }

  return "neutral";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const automationLevelOptions = automationLevels.map((level) => ({ label: automationLevelLabel(level), value: level }));

const confidenceOptions = [
  { label: "Unknown", value: "unknown" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Manual", value: "manual" }
];

const rolloutOptions = [
  { label: "Uit", value: "disabled" },
  { label: "Intern", value: "internal" },
  { label: "Beta", value: "beta" },
  { label: "Aan", value: "enabled" }
];

const duplicateRiskOptions = [
  { label: "Geen", value: "none" },
  { label: "Waarschuwing", value: "warning" },
  { label: "Blokkerend", value: "blocking" }
];

const fieldClassName = "min-h-10 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2";
const primaryButtonClassName = "inline-flex w-fit items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-soft hover:bg-primary/90";
const secondaryButtonClassName = "inline-flex w-fit items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-bold text-foreground hover:bg-muted";
