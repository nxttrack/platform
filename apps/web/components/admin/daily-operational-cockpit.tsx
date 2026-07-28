import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  Check,
  CircleDollarSign,
  Clock3,
  Image,
  MessageCircle,
  PanelTop,
  RefreshCcw,
  ShieldAlert,
  UserRoundSearch,
  UsersRound
} from "lucide-react";
import Link from "next/link";

import { AdminFilterPills } from "@/components/admin/admin-patterns";
import { StatusPill } from "@/components/shell/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import type { PrioritizedOperationalSignal } from "@/lib/domain/operational-cockpit-contract";
import { updateOperationalSignalStateAction } from "@/lib/domain/operational-cockpit-actions";
import { cn } from "@/lib/utils";

type Filter = "all" | "now" | "today" | "this_week" | "planning" | "relations" | "finance" | "system";

export function DailyOperationalCockpit({
  filter,
  generatedAt,
  signals
}: {
  filter: string;
  generatedAt: string;
  signals: PrioritizedOperationalSignal[];
}) {
  const safeFilter = isFilter(filter) ? filter : "all";
  const visible = signals.filter((signal) => matchesFilter(signal, safeFilter));
  const counts = {
    all: signals.length,
    now: signals.filter((signal) => signal.window === "now").length,
    today: signals.filter((signal) => signal.window === "today").length,
    this_week: signals.filter((signal) => signal.window === "this_week").length,
    planning: signals.filter((signal) => category(signal.type) === "planning").length,
    relations: signals.filter((signal) => category(signal.type) === "relations").length,
    finance: signals.filter((signal) => category(signal.type) === "finance").length,
    system: signals.filter((signal) => category(signal.type) === "system").length
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-3 shadow-soft">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <AdminFilterPills
            current={safeFilter}
            href={(value) => `/admin?filter=${value}`}
            items={[
              { label: "Alles", value: "all", count: counts.all },
              { label: "Nu", value: "now", count: counts.now },
              { label: "Vandaag", value: "today", count: counts.today },
              { label: "Deze week", value: "this_week", count: counts.this_week },
              { label: "Planning", value: "planning", count: counts.planning },
              { label: "Relaties", value: "relations", count: counts.relations },
              { label: "Financieel", value: "finance", count: counts.finance },
              { label: "Systeem", value: "system", count: counts.system }
            ]}
          />
          <p className="shrink-0 text-xs text-muted-foreground">Live samengesteld · {formatTime(generatedAt)}</p>
        </div>
      </section>

      {visible.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((signal) => <SignalCard key={signal.key} signal={signal} />)}
        </div>
      ) : (
        <section className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-soft">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-700"><Check className="size-6" /></span>
          <h2 className="mt-4 text-lg font-bold text-foreground">Deze werkbak is leeg</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Er zijn binnen dit filter geen actuele signalen die menselijke aandacht vragen. Nieuwe brondata wordt bij het volgende bezoek direct meegenomen.
          </p>
        </section>
      )}
    </div>
  );
}

function SignalCard({ signal }: { signal: PrioritizedOperationalSignal }) {
  const meta = signalMeta(signal.type);
  const Icon = meta.icon;
  const commonFields = {
    signalKey: signal.key,
    signalType: signal.type,
    entityType: signal.entityType,
    entityId: signal.entityId ?? "",
    fingerprint: signal.fingerprint
  };

  return (
    <article className={cn(
      "flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-soft",
      signal.priority === "critical" ? "border-red-200" : signal.priority === "high" ? "border-amber-200" : "border-border"
    )}>
      <header className="flex items-start gap-3 border-b border-border bg-muted/20 p-4">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", meta.className)}><Icon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={priorityTone(signal.priority)}>{priorityLabel(signal.priority)}</StatusPill>
            <StatusPill tone="neutral">{windowLabel(signal.window)}</StatusPill>
            {signal.stateStatus === "acknowledged" ? <StatusPill tone="info">Gezien</StatusPill> : null}
            <span className="text-[11px] font-semibold text-muted-foreground">{meta.label}</span>
          </div>
          <h2 className="mt-2 text-base font-bold leading-6 text-foreground">{signal.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{signal.summary}</p>
        </div>
      </header>

      <div className="flex-1 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Waarom dit signaal</p>
        <ul className="mt-2 space-y-2">
          {signal.evidence.map((evidence) => (
            <li className="flex gap-2 text-xs leading-5 text-muted-foreground" key={evidence}>
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky-500" />
              {evidence}
            </li>
          ))}
        </ul>
        {signal.dueAt ? (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-muted/55 px-3 py-2 text-xs font-semibold text-foreground">
            <CalendarClock className="size-4 text-sky-600" />Richtmoment: {formatDateTime(signal.dueAt)}
          </p>
        ) : null}
      </div>

      <footer className="space-y-2 border-t border-border bg-muted/15 p-3">
        <div className="flex flex-wrap gap-2">
          <Link className={buttonVariants({ size: "sm" })} href={signal.href}>{signal.actionLabel}<ArrowUpRight className="ml-1 size-3.5" /></Link>
          {signal.stateStatus !== "acknowledged" ? (
            <form action={updateOperationalSignalStateAction}>
              <SignalFields fields={commonFields} />
              <input name="status" type="hidden" value="acknowledged" />
              <Button size="sm" type="submit" variant="outline">Gezien</Button>
            </form>
          ) : null}
          <form action={updateOperationalSignalStateAction} className="flex items-center gap-1">
            <SignalFields fields={commonFields} />
            <input name="status" type="hidden" value="snoozed" />
            <label className="sr-only" htmlFor={`snooze-${signal.key}`}>Snoozeduur</label>
            <select className="h-9 rounded-lg border border-border bg-background px-2 text-xs font-semibold text-foreground" defaultValue="tomorrow" id={`snooze-${signal.key}`} name="snooze">
              <option value="four_hours">4 uur</option>
              <option value="tomorrow">Morgen 09:00</option>
              <option value="one_week">1 week</option>
            </select>
            <Button size="sm" type="submit" variant="outline"><Clock3 className="mr-1 size-3.5" />Snooze</Button>
          </form>
        </div>
        <ConfirmActionForm
          action={updateOperationalSignalStateAction}
          confirmLabel="Markeer afgehandeld"
          description="Dit sluit alleen dit cockpit-signaal voor de huidige bronversie. De onderliggende les, betaling, communicatie of plaatsing wordt niet gewijzigd."
          hiddenFields={{ ...commonFields, status: "resolved" }}
          title="Is dit signaal menselijk afgehandeld?"
          triggerLabel="Afhandelen"
          triggerVariant="outline"
        />
      </footer>
    </article>
  );
}

function SignalFields({ fields }: { fields: Record<string, string> }) {
  return <>{Object.entries(fields).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}</>;
}

function matchesFilter(signal: PrioritizedOperationalSignal, filter: Filter) {
  if (filter === "all") return true;
  if (["now", "today", "this_week"].includes(filter)) return signal.window === filter;
  return category(signal.type) === filter;
}

function category(type: PrioritizedOperationalSignal["type"]): "planning" | "relations" | "finance" | "system" {
  if (["session_without_instructor", "empty_seat", "missing_attendance", "expiring_offer"].includes(type)) return "planning";
  if (["crm_follow_up", "parent_question", "retention_risk", "expiring_media"].includes(type)) return "relations";
  if (type === "failed_payment") return "finance";
  return "system";
}

function signalMeta(type: PrioritizedOperationalSignal["type"]) {
  return ({
    crm_follow_up: { label: "CRM", icon: UserRoundSearch, className: "bg-violet-500/10 text-violet-700" },
    session_without_instructor: { label: "Rooster", icon: UsersRound, className: "bg-red-500/10 text-red-700" },
    empty_seat: { label: "Capaciteit", icon: RefreshCcw, className: "bg-emerald-500/10 text-emerald-700" },
    missing_attendance: { label: "Lesregistratie", icon: PanelTop, className: "bg-amber-500/10 text-amber-800" },
    expiring_offer: { label: "Plaatsing", icon: Clock3, className: "bg-orange-500/10 text-orange-800" },
    failed_payment: { label: "Betaling", icon: CircleDollarSign, className: "bg-red-500/10 text-red-700" },
    parent_question: { label: "Oudercontact", icon: MessageCircle, className: "bg-sky-500/10 text-sky-700" },
    expiring_media: { label: "Privacy", icon: Image, className: "bg-fuchsia-500/10 text-fuchsia-700" },
    automation_failure: { label: "Automatisering", icon: ShieldAlert, className: "bg-red-500/10 text-red-700" },
    configuration_drift: { label: "Configuratie", icon: AlertTriangle, className: "bg-amber-500/10 text-amber-800" },
    retention_risk: { label: "Persoonlijke aandacht", icon: UsersRound, className: "bg-violet-500/10 text-violet-700" }
  } satisfies Record<PrioritizedOperationalSignal["type"], { label: string; icon: typeof AlertTriangle; className: string }>)[type];
}

function priorityTone(priority: PrioritizedOperationalSignal["priority"]) {
  return priority === "critical" ? "danger" as const : priority === "high" ? "warning" as const : priority === "medium" ? "info" as const : "neutral" as const;
}

function priorityLabel(priority: PrioritizedOperationalSignal["priority"]) {
  return priority === "critical" ? "Kritiek" : priority === "high" ? "Hoog" : priority === "medium" ? "Middel" : "Laag";
}

function windowLabel(window: PrioritizedOperationalSignal["window"]) {
  return window === "now" ? "Nu" : window === "today" ? "Vandaag" : "Deze week";
}

function isFilter(value: string): value is Filter {
  return ["all", "now", "today", "this_week", "planning", "relations", "finance", "system"].includes(value);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value));
}
