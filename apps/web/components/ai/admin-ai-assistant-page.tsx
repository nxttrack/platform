import { AlertTriangle, Bot, CheckCircle2, ClipboardList, FileText, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { AdminTabs } from "@/components/admin/admin-tabs";
import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { generateAiAssistantSuggestionAction, updateAiAssistantSettingAction, updateAiAssistantSuggestionAction } from "@/lib/ai/admin-ai-actions";
import type { AdminAiAssistantSnapshot, AiAssistantContextOption, AiAssistantSuggestionRow, TenantAiAssistantSettingRow } from "@/lib/ai/admin-ai-read-model";
import { aiAssistantCapabilities, aiCapabilityDescription, aiCapabilityLabel, type AiAssistantCapability } from "@/lib/ai/assistant";

type Props = {
  snapshot: AdminAiAssistantSnapshot;
};

export function AdminAiAssistantPage({ snapshot }: Props) {
  if (snapshot.status !== "ready" || !snapshot.tenant) {
    return <AiStatusPanel snapshot={snapshot} />;
  }

  const data = snapshot.data;
  const enabledSettings = data.settings.filter((setting) => setting.enabled).length;
  const approvedSettings = data.settings.filter((setting) => setting.sensitive_data_review_status === "approved").length;
  const draftedSuggestions = data.suggestions.filter((suggestion) => ["drafted", "edited"].includes(suggestion.status)).length;
  const blockedSuggestions = data.suggestions.filter((suggestion) => ["blocked", "failed"].includes(suggestion.status)).length;

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone={data.provider.serverEnabled && data.provider.configured ? "success" : "warning"}>{data.provider.serverEnabled && data.provider.configured ? "provider klaar" : "provider guarded"}</StatusPill>}
        kicker="Backoffice - AI assistent"
        subtitle="AI maakt alleen bewerkbare suggesties bovenop de rules-based brondata. Admins blijven verantwoordelijk voor elke eindbeslissing."
        title="AI Assistant Layer"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<Bot className="h-5 w-5" />} label="Capabilities" value={data.settings.length.toString()} detail="suggestion only" />
        <MetricCard icon={<ShieldCheck className="h-5 w-5" />} label="Review" value={`${approvedSettings}/${data.settings.length}`} detail="sensitive data goedgekeurd" />
        <MetricCard icon={<Sparkles className="h-5 w-5" />} label="Actief" value={enabledSettings.toString()} detail={`model ${data.provider.defaultModel}`} />
        <MetricCard icon={<AlertTriangle className="h-5 w-5" />} label="Blocked/failed" value={blockedSuggestions.toString()} detail={`${draftedSuggestions} concepten`} />
      </div>

      <Card className="bg-sky-50/60">
        <div className="grid gap-3 md:grid-cols-[auto_1fr] md:items-start">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">AI-regels voor NXTTRACK</h2>
            <div className="mt-3 grid gap-2 text-sm text-sky-950 md:grid-cols-2">
              <RuleRow>AI-output is altijd gelabeld als suggestie.</RuleRow>
              <RuleRow>Rules-based smart decisions blijven de bron van waarheid.</RuleRow>
              <RuleRow>Elke suggestie is bewerkbaar voordat zij gebruikt wordt.</RuleRow>
              <RuleRow>Sensitive data review moet goedgekeurd zijn voor activatie.</RuleRow>
            </div>
          </div>
        </div>
      </Card>

      <AdminTabs
        tabs={[
          {
            id: "suggesties",
            label: "Suggesties maken",
            count: data.contextOptions.length,
            children: (
              <Card>
                <SectionHeader count={data.contextOptions.length} icon={<Sparkles className="h-5 w-5" />} title="Suggesties maken" />
                <div className="grid gap-5">
                  {aiAssistantCapabilities.map((capability) => (
                    <CapabilityWorkspace key={capability} capability={capability} contextOptions={data.contextOptions.filter((option) => option.capability === capability)} setting={data.settings.find((setting) => setting.capability === capability) ?? null} />
                  ))}
                </div>
              </Card>
            )
          },
          {
            id: "instellingen",
            label: "Instellingen",
            count: data.settings.length,
            children: (
              <Card>
                <SectionHeader count={data.settings.length} icon={<ShieldCheck className="h-5 w-5" />} title="Capability instellingen" />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {data.settings.map((setting) => (
                    <AiSettingCard key={setting.capability} setting={setting} />
                  ))}
                </div>
              </Card>
            )
          },
          {
            id: "audit",
            label: "Audit & drafts",
            count: data.suggestions.length,
            children: (
              <Card>
                <SectionHeader count={data.suggestions.length} icon={<ClipboardList className="h-5 w-5" />} title="AI-suggestie audit en drafts" />
                <div className="grid gap-3">
                  {data.suggestions.length === 0 ? <EmptyState>Nog geen AI-suggesties. Maak eerst een gecontroleerd concept vanuit een capability.</EmptyState> : null}
                  {data.suggestions.map((suggestion) => (
                    <SuggestionCard key={suggestion.id} suggestion={suggestion} />
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

function AiSettingCard({ setting }: { setting: TenantAiAssistantSettingRow }) {
  return (
    <form action={updateAiAssistantSettingAction} className="grid gap-3 rounded-2xl border border-border bg-muted/35 p-4">
      <input name="capability" type="hidden" value={setting.capability} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">{setting.label}</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{setting.description ?? aiCapabilityDescription(setting.capability)}</p>
        </div>
        <StatusPill tone={setting.enabled ? "success" : "neutral"}>{setting.enabled ? "aan" : "uit"}</StatusPill>
      </div>
      <CheckboxField defaultChecked={setting.enabled} label="Capability inschakelen" name="enabled" />
      <SelectField defaultValue={setting.mode} label="Modus" name="mode" options={modeOptions} />
      <SelectField defaultValue={setting.allowed_context_level} label="Contextniveau" name="allowed_context_level" options={contextLevelOptions} />
      <SelectField defaultValue={setting.sensitive_data_review_status} label="Sensitive data review" name="sensitive_data_review_status" options={reviewOptions} />
      <TextField defaultValue={setting.model} label="Model" name="model" />
      <button className={primaryButtonClassName} type="submit">
        AI-instelling opslaan
      </button>
    </form>
  );
}

function CapabilityWorkspace({ capability, contextOptions, setting }: { capability: AiAssistantCapability; contextOptions: AiAssistantContextOption[]; setting: TenantAiAssistantSettingRow | null }) {
  const guarded = !setting?.enabled || setting.sensitive_data_review_status !== "approved";

  return (
    <details className="rounded-3xl border border-border bg-muted/30 p-4" open={["intake_summary", "admin_explanation", "risk_signal_summary"].includes(capability)}>
      <summary className="cursor-pointer">
        <div className="inline-flex w-full flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold">{aiCapabilityLabel(capability)}</p>
            <p className="text-sm text-muted-foreground">{aiCapabilityDescription(capability)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={guarded ? "warning" : "success"}>{guarded ? "guarded" : "ready"}</StatusPill>
            <StatusPill tone="neutral">{contextOptions.length} bronnen</StatusPill>
          </div>
        </div>
      </summary>
      <div className="mt-4 grid gap-3">
        {guarded ? <WarningState>Deze capability maakt pas live suggesties wanneer zij ingeschakeld is en de sensitive data review op goedgekeurd staat. Een poging wordt wel als geblokkeerde auditregel opgeslagen.</WarningState> : null}
        {contextOptions.length === 0 ? <EmptyState>Geen broncontext gevonden voor deze capability. Je kunt later modules koppelen zodra er data is.</EmptyState> : null}
        {contextOptions.slice(0, 5).map((option) => (
          <AiGenerateForm key={`${option.capability}-${option.subjectType}-${option.subjectId}`} option={option} />
        ))}
      </div>
    </details>
  );
}

function AiGenerateForm({ option }: { option: AiAssistantContextOption }) {
  return (
    <form action={generateAiAssistantSuggestionAction} className="grid gap-3 rounded-2xl border border-border bg-card p-4">
      <input name="capability" type="hidden" value={option.capability} />
      <input name="subject_type" type="hidden" value={option.subjectType} />
      <input name="subject_id" type="hidden" value={option.subjectId} />
      <input name="source_engine_key" type="hidden" value={option.sourceEngineKey ?? ""} />
      <input name="smart_decision_id" type="hidden" value={option.smartDecisionId ?? ""} />
      <input name="source_of_truth" type="hidden" value={JSON.stringify(option.sourceOfTruth)} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold">{option.label}</p>
          <p className="text-sm text-muted-foreground">{option.subjectType}</p>
        </div>
        <StatusPill tone="info">AI-suggestie</StatusPill>
      </div>
      <TextField defaultValue="" label="Doel of toon" name="goal" placeholder="Bijv. korter, oudervriendelijker, managementsamenvatting..." />
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        <span>Broncontext</span>
        <textarea className={`${fieldClassName} min-h-40 whitespace-pre-wrap`} defaultValue={option.context} name="source_context" />
      </label>
      <button className={primaryButtonClassName} type="submit">
        Suggestie maken
      </button>
    </form>
  );
}

function SuggestionCard({ suggestion }: { suggestion: AiAssistantSuggestionRow }) {
  const editableText = suggestion.edited_output_text ?? suggestion.output_text ?? "";

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">{aiCapabilityLabel(suggestion.capability)}</p>
          <p className="text-sm text-muted-foreground">
            {suggestion.suggestion_label} - {formatDateTime(suggestion.created_at)} {suggestion.subject_type ? `- ${suggestion.subject_type}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={statusTone(suggestion.status)}>{suggestion.status}</StatusPill>
          <StatusPill tone="neutral">{suggestion.model}</StatusPill>
        </div>
      </div>
      {suggestion.error_message ? <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{suggestion.error_message}</p> : null}
      {editableText ? (
        <form action={updateAiAssistantSuggestionAction} className="mt-3 grid gap-3">
          <input name="id" type="hidden" value={suggestion.id} />
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            <span>Bewerkbare output</span>
            <textarea className={`${fieldClassName} min-h-36 whitespace-pre-wrap`} defaultValue={editableText} name="edited_output_text" />
          </label>
          <div className="grid gap-3 md:grid-cols-[14rem_1fr_auto]">
            <SelectField defaultValue={suggestion.human_decision ?? "edited"} label="Menselijke actie" name="human_decision" options={decisionOptions} />
            <TextField defaultValue={suggestion.human_note ?? ""} label="Notitie" name="human_note" placeholder="Waarom accepteer/bewerk/verwerp je dit concept?" />
            <button className={secondaryButtonClassName} type="submit">
              Concept vastleggen
            </button>
          </div>
        </form>
      ) : null}
      <details className="mt-3 rounded-2xl border border-border bg-card p-3">
        <summary className="cursor-pointer text-sm font-bold">Bron en policy</summary>
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
          <InfoTile label="Bron" value={JSON.stringify(suggestion.source_of_truth).slice(0, 160)} />
          <InfoTile label="Redactie" value={JSON.stringify(suggestion.redaction_summary).slice(0, 160)} />
          <InfoTile label="Prompt" value={JSON.stringify(suggestion.prompt_snapshot).slice(0, 160)} />
        </div>
      </details>
    </div>
  );
}

function AiStatusPanel({ snapshot }: Props) {
  return (
    <div className="grid gap-6">
      <PageHeader kicker="Backoffice - AI assistent" subtitle="Controleer tenantcontext, Supabase configuratie en S13 migraties." title="AI-assistent niet beschikbaar" />
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

function RuleRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-white/70 px-3 py-2">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <span>{children}</span>
    </div>
  );
}

function WarningState({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">{children}</div>;
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3">
      <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-1 break-words text-xs font-medium text-foreground">{value}</p>
    </div>
  );
}

function TextField({ defaultValue, label, name, placeholder, type = "text" }: { defaultValue?: number | string; label: string; name: string; placeholder?: string; type?: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <input className={fieldClassName} defaultValue={defaultValue ?? ""} name={name} placeholder={placeholder} type={type} />
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

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["drafted", "edited", "accepted"].includes(status)) {
    return "success";
  }

  if (status === "blocked") {
    return "warning";
  }

  if (status === "failed") {
    return "danger";
  }

  return "neutral";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const modeOptions = [
  { label: "Uit", value: "disabled" },
  { label: "Alleen suggestie", value: "suggestion_only" },
  { label: "Draft met review", value: "draft_with_review" }
];

const contextLevelOptions = [
  { label: "Minimaal", value: "minimal" },
  { label: "Operationeel", value: "operational" },
  { label: "Gevoelig", value: "sensitive" }
];

const reviewOptions = [
  { label: "In review", value: "pending" },
  { label: "Goedgekeurd", value: "approved" },
  { label: "Geblokkeerd", value: "blocked" }
];

const decisionOptions = [
  { label: "Bewerkt", value: "edited" },
  { label: "Geaccepteerd", value: "accepted" },
  { label: "Verworpen", value: "dismissed" }
];

const fieldClassName = "min-h-10 min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2";
const primaryButtonClassName = "inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-soft hover:bg-primary/90";
const secondaryButtonClassName = "inline-flex w-fit items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-bold text-foreground hover:bg-muted";
