import { Activity, ArrowLeft, ClipboardCheck, MessageSquareText, TrendingUp, UsersRound } from "lucide-react";
import Link from "next/link";

import { AdminFilterPills, AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import {
  AttendanceSignalsTable,
  BottlenecksTable
} from "@/components/admin/intelligence-tables";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { getTenantCoreData } from "@/lib/domain/core";
import {
  detectAttendanceRisks,
  detectProgressBottlenecks
} from "@/lib/domain/learning-intelligence";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function LearningQualityPage({ searchParams }: PageProps) {
  const [data, rawParams] = await Promise.all([
    getTenantCoreData(),
    searchParams ?? Promise.resolve({})
  ]);
  const weeks = parseWeeks(getParam(rawParams, "period"));
  const includeTestData = getParam(rawParams, "view") === "include-test";
  const period = {
    from: new Date(Date.now() - weeks * 7 * dayMs).toISOString(),
    to: new Date().toISOString()
  };
  const filters = {
    programId: getParam(rawParams, "program") || undefined,
    stageId: getParam(rawParams, "stage") || undefined,
    groupId: getParam(rawParams, "group") || undefined
  };
  const [attendanceSignals, bottlenecks, draftResult] = await Promise.all([
    detectAttendanceRisks(data.tenant.id, { includeTestData }),
    detectProgressBottlenecks({
      tenantId: data.tenant.id,
      period,
      includeTestData,
      ...filters
    }),
    createAdminClient()
      .from("participant_contact_drafts")
      .select("id, participant_id, title, status, created_at, is_test")
      .eq("tenant_id", data.tenant.id)
      .in("status", ["draft", "reviewed"])
      .order("created_at", { ascending: false })
      .limit(8)
  ]);
  if (draftResult.error) throw new Error(`Could not load contact drafts: ${draftResult.error.message}`);

  const participantById = new Map(data.participants.map((row) => [row.id, row]));
  const groupById = new Map(data.groups.map((row) => [row.id, row]));
  const programById = new Map(data.programs.map((row) => [row.id, row]));
  const stageById = new Map(data.stages.map((row) => [row.id, row]));
  const scopedAttendance = attendanceSignals.filter((signal) => {
    const group = groupById.get(signal.group_id);
    if (!group) return false;
    if (filters.programId && group.program_id !== filters.programId) return false;
    if (filters.stageId && group.stage_id !== filters.stageId) return false;
    if (filters.groupId && signal.group_id !== filters.groupId) return false;
    return true;
  });
  const groupSignalCounts = [...new Set(scopedAttendance.map((row) => row.group_id))].length;
  const highSignals = scopedAttendance.filter((row) => row.risk_level === "high").length;
  const drafts = (draftResult.data ?? []) as Array<{
    id: string;
    participant_id: string;
    title: string;
    status: string;
    created_at: string;
    is_test: boolean;
  }>;
  const saved = getParam(rawParams, "saved");
  const error = getParam(rawParams, "error");

  return (
    <div className="space-y-5">
      <PageHeader
        action={
          <Link className={buttonVariants({ variant: "outline" })} href="/admin/rapportages"><ArrowLeft className="size-4" />Alle rapportages</Link>
        }
        kicker="Begeleiding & leskwaliteit"
        title="Group Health en voortgang"
        subtitle="Neutrale aanwezigheidssignalen en geaggregeerde vaardigheidsbottlenecks, met uitlegbare brondata."
      />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={Activity} label="Begeleidingssignalen" tone={scopedAttendance.length ? "warning" : "success"} value={scopedAttendance.length} />
        <AdminMetricCard icon={UsersRound} label="Groepen om te volgen" tone={groupSignalCounts ? "info" : "success"} value={groupSignalCounts} />
        <AdminMetricCard icon={TrendingUp} label="Vaardigheidsfocus" tone={bottlenecks.length ? "warning" : "success"} value={bottlenecks.length} />
        <AdminMetricCard icon={MessageSquareText} label="Concepten ter review" tone={drafts.length ? "info" : "success"} value={drafts.length} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[auto_1fr] xl:items-start">
        <AdminFilterPills
          current={String(weeks)}
          href={(value) => buildHref(rawParams, { period: value })}
          items={[
            { label: "4 weken", value: "4" },
            { label: "8 weken", value: "8" },
            { label: "12 weken", value: "12" }
          ]}
        />
        <form className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft sm:grid-cols-2 xl:grid-cols-4">
          <input name="period" type="hidden" value={weeks} />
          <FilterSelect defaultValue={filters.programId} label="Programma" name="program">
            <option value="">Alle programma’s</option>
            {data.programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
          </FilterSelect>
          <FilterSelect defaultValue={filters.stageId} label="Niveau" name="stage">
            <option value="">Alle niveaus</option>
            {data.stages.filter((stage) => !filters.programId || stage.program_id === filters.programId).map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.badge_label ?? stage.name}</option>
            ))}
          </FilterSelect>
          <FilterSelect defaultValue={filters.groupId} label="Lesgroep" name="group">
            <option value="">Alle groepen</option>
            {data.groups.filter((group) => !filters.programId || group.program_id === filters.programId).map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </FilterSelect>
          <div className="flex items-end"><Button className="w-full" type="submit">Filters toepassen</Button></div>
          {includeTestData ? <input name="view" type="hidden" value="include-test" /> : null}
        </form>
      </div>

      <section className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-foreground">Veilige signalering</p>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              Signalen ondersteunen een gesprek of betere lesfocus. Ze schrijven nooit automatisch uit, nemen geen plek af en versturen geen bericht. Concepten blijven deelnemergebonden en moeten apart worden beoordeeld.
            </p>
          </div>
          <StatusPill tone={highSignals ? "warning" : "success"}>
            {highSignals ? `${highSignals} hoge signalen` : "Geen hoge signalen"}
          </StatusPill>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="attendance-signals">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Begeleiding</p>
          <h2 className="mt-1 text-xl font-bold text-foreground" id="attendance-signals">Aanwezigheid en warme opvolging</h2>
        </div>
        <AdminListSurface>
          <AttendanceSignalsTable
            rows={scopedAttendance.map((signal) => ({
              id: `${signal.participant_id}:${signal.group_id}:${signal.signal_type}`,
              participantId: signal.participant_id,
              participant: participantById.get(signal.participant_id)?.display_name ?? "Leerling",
              groupId: signal.group_id,
              group: groupById.get(signal.group_id)?.name ?? "Lesgroep",
              signalType: signal.signal_type,
              signalLabel: attendanceSignalLabels[signal.signal_type],
              risk: signal.risk_level,
              confidence: signal.confidence,
              reason: signal.reason,
              evidence: signal.evidence,
              suggestedAction: signal.suggested_action,
              isTest: signal.is_test
            }))}
          />
        </AdminListSurface>
      </section>

      <section className="space-y-3" aria-labelledby="progress-bottlenecks">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Leskwaliteit</p>
          <h2 className="mt-1 text-xl font-bold text-foreground" id="progress-bottlenecks">Voortgangsbottlenecks</h2>
          <p className="mt-1 text-sm text-muted-foreground">Alleen voldoende grote samples worden getoond; namen staan uitsluitend in het bevoegde detailpaneel.</p>
        </div>
        <AdminListSurface>
          <BottlenecksTable
            rows={bottlenecks.flatMap((bottleneck) => {
              if (!bottleneck.group_id) return [];
              const group = groupById.get(bottleneck.group_id);
              return [{
                id: `${bottleneck.group_id}:${bottleneck.skill_id}`,
                groupId: bottleneck.group_id,
                group: group?.name ?? "Lesgroep",
                program: bottleneck.program_id ? programById.get(bottleneck.program_id)?.name ?? "Programma" : "Programma",
                stage: bottleneck.stage_id ? stageById.get(bottleneck.stage_id)?.badge_label ?? stageById.get(bottleneck.stage_id)?.name ?? "Niveau" : "Niveau",
                skillId: bottleneck.skill_id,
                skill: bottleneck.skill_label,
                affected: bottleneck.affected_count,
                total: bottleneck.total_count,
                rate: bottleneck.stagnation_rate,
                trend: bottleneck.trend.replaceAll("_", " "),
                confidence: bottleneck.confidence,
                reasons: bottleneck.reasons,
                suggestedFocus: bottleneck.suggested_lesson_focus,
                participantNames: bottleneck.participant_ids.map((id) => participantById.get(id)?.display_name ?? "Leerling"),
                isTest: bottleneck.is_test
              }];
            })}
          />
        </AdminListSurface>
      </section>

      {drafts.length ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Deelnemergebonden concepten</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Deze concepten kunnen vanuit deze feature niet worden verstuurd.</p>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {drafts.map((draft) => (
              <article className="rounded-xl border border-border bg-muted/30 p-3" key={draft.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{draft.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {participantById.get(draft.participant_id)?.display_name ?? "Leerling"} · {formatDate(draft.created_at)}
                    </p>
                  </div>
                  <StatusPill tone={draft.status === "reviewed" ? "success" : "info"}>{draft.status}</StatusPill>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function FilterSelect({
  children,
  defaultValue,
  label,
  name
}: {
  children: React.ReactNode;
  defaultValue?: string;
  label: string;
  name: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-foreground">
      {label}
      <select className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal" defaultValue={defaultValue ?? ""} name={name}>
        {children}
      </select>
    </label>
  );
}

function Feedback({ error, saved }: { error?: string; saved?: string }) {
  if (saved) return <p className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm font-semibold text-success">Actie opgeslagen: {saved}.</p>;
  if (error) return <p className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">Actie is niet gelukt: {error}.</p>;
  return null;
}

function buildHref(
  params: Record<string, string | string[] | undefined>,
  changes: Record<string, string>
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) query.set(key, first);
  }
  for (const [key, value] of Object.entries(changes)) query.set(key, value);
  return `/admin/rapportages/leskwaliteit?${query.toString()}`;
}

function parseWeeks(value?: string): 4 | 8 | 12 {
  return value === "4" ? 4 : value === "8" ? 8 : 12;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

const attendanceSignalLabels = {
  repeated_no_show: "Herhaalde afwezigheid",
  frequent_absence: "Vaak gemiste lessen",
  rising_group_absence: "Oplopend groepssignaal",
  late_cancellation: "Late afmeldingen",
  missing_check_in: "Registratie controleren",
  long_absence_without_contact: "Warme check-in"
};
const dayMs = 86_400_000;
