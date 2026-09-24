import { randomUUID } from "node:crypto";

import { AlertTriangle, ArrowLeft, CalendarRange, CheckCircle2, Clock3, Gauge, Waves } from "lucide-react";
import Link from "next/link";

import { AdminFilterPills, AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { CapacityForecastTable } from "@/components/admin/intelligence-tables";
import { PageHeader } from "@/components/shell/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { RouteFeedback } from "@/components/ui/route-feedback";
import {
  forecastCapacity,
  getCapacityForecastOperations
} from "@/lib/domain/capacity-forecast";
import {
  releaseCapacitySoftReservationAction,
  requestCapacitySoftReservationAction,
  reviewCapacitySoftReservationAction
} from "@/lib/domain/capacity-forecast-actions";
import { getTenantCoreData } from "@/lib/domain/core";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function CapacityForecastPage({ searchParams }: PageProps) {
  const [data, rawParams] = await Promise.all([
    getTenantCoreData(),
    searchParams ?? Promise.resolve({})
  ]);
  const horizon = parseHorizon(getParam(rawParams, "horizon"));
  const filters = {
    programId: getParam(rawParams, "program") || undefined,
    stageId: getParam(rawParams, "stage") || undefined,
    weekday: parseWeekday(getParam(rawParams, "day")),
    locationId: getParam(rawParams, "location") || undefined,
    instructorId: getParam(rawParams, "instructor") || undefined
  };
  const includeTestData = getParam(rawParams, "view") === "include-test";
  const [forecasts, operations] = await Promise.all([
    forecastCapacity({
      tenantId: data.tenant.id,
      horizonWeeks: horizon,
      filters,
      includeTestData
    }),
    getCapacityForecastOperations(data.tenant.id)
  ]);
  const programById = new Map(data.programs.map((row) => [row.id, row]));
  const stageById = new Map(data.stages.map((row) => [row.id, row]));
  const resourceById = new Map(data.resources.map((row) => [row.id, row]));
  const groupById = new Map(data.groups.map((row) => [row.id, row]));
  const waitlistById = new Map(operations.waitlistCandidates.map((row) => [row.id, row]));
  const critical = forecasts.filter((row) => row.risk_level === "critical").length;
  const bottlenecks = forecasts.filter((row) =>
    ["critical", "bottleneck"].includes(row.risk_level)
  ).length;
  const openings = forecasts.reduce((total, row) => total + row.expected_openings, 0);
  const unresolved = forecasts.reduce((total, row) => total + row.expected_bottlenecks, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        action={
          <Link className={buttonVariants({ variant: "outline" })} href="/admin/rapportages"><ArrowLeft className="size-4" />Alle rapportages</Link>
        }
        kicker="4–12 weken vooruit"
        title="Capaciteitsvoorspelling"
        subtitle="Verklaarbare druk en voorzichtige openingen per lesgroep, niveau, moment, locatie en resource."
      />
      <RouteFeedback
        error={getParam(rawParams, "error") ? "De zachte reservering kon niet veilig worden verwerkt." : null}
        success={reservationSuccess(getParam(rawParams, "saved"))}
      />

      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        <div className="grid gap-px bg-border md:grid-cols-4">
          <AdminMetricCard icon={AlertTriangle} label="Kritieke vensters" tone={critical ? "danger" : "success"} value={critical} />
          <AdminMetricCard icon={Gauge} label="Knelpunten" tone={bottlenecks ? "warning" : "success"} value={bottlenecks} />
          <AdminMetricCard icon={CheckCircle2} label="Voorzichtige openingen" tone="success" value={roundOne(openings)} />
          <AdminMetricCard icon={Waves} label="Onvervulde vraag" tone={unresolved ? "warning" : "success"} value={unresolved} />
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-[auto_1fr] xl:items-start">
        <AdminFilterPills
          current={String(horizon)}
          href={(value) => buildHref(rawParams, { horizon: value })}
          items={[
            { label: "4 weken", value: "4" },
            { label: "8 weken", value: "8" },
            { label: "12 weken", value: "12" }
          ]}
        />
        <form className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft sm:grid-cols-2 xl:grid-cols-6">
          <input name="horizon" type="hidden" value={horizon} />
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
          <FilterSelect defaultValue={filters.weekday ? String(filters.weekday) : ""} label="Dag" name="day">
            <option value="">Alle dagen</option>
            {weekdays.slice(1).map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
          </FilterSelect>
          <FilterSelect defaultValue={filters.locationId} label="Locatie" name="location">
            <option value="">Alle locaties</option>
            {data.resources.filter((resource) => resource.kind === "location" && resource.status === "active").map((resource) => (
              <option key={resource.id} value={resource.id}>{resource.name}</option>
            ))}
          </FilterSelect>
          <FilterSelect defaultValue={filters.instructorId} label="Instructeur" name="instructor">
            <option value="">Alle instructeurs</option>
            {data.instructors.map((instructor) => <option key={instructor.userId} value={instructor.userId}>{instructor.label}</option>)}
          </FilterSelect>
          <div className="flex items-end">
            <Button className="w-full" type="submit">Filters toepassen</Button>
          </div>
          {includeTestData ? <input name="view" type="hidden" value="include-test" /> : null}
        </form>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Voorspelling, geen ouderbelofte</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Alleen geplande einddata en gewogen doorstroomsignalen tellen mee. Afwezigheid of no-show creëert nooit automatisch een plek.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={buttonVariants({ variant: "outline" })} href="/admin/agenda"><CalendarRange className="size-4" />Open planbord</Link>
          <Link className={buttonVariants({ variant: "outline" })} href="/admin/automatisering/acties">Next Best Actions</Link>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Planner approval</p>
            <h2 className="mt-1 text-lg font-bold">Zachte capaciteitsreserveringen</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Een aanvraag is eerst een preview. Alleen een afzonderlijk goedgekeurde, niet-verlopen reservering verlaagt tijdelijk de planbare capaciteit; zij boekt of verplaatst nooit zelfstandig een leerling.
            </p>
          </div>
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold">
            {operations.reservations.filter((row) => row.status === "approved").length} actief
          </span>
        </div>
        <form action={requestCapacitySoftReservationAction} className="mt-5 grid gap-3 rounded-xl border border-border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-6">
          <input name="idempotencyKey" type="hidden" value={randomUUID()} />
          <FilterSelect label="Lesgroep" name="groupId">
            <option value="">Kies lesgroep</option>
            {data.groups.filter((group) => group.status === "active").map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="Wachtlijstkandidaat" name="waitlistEntryId">
            <option value="">Kies kandidaat</option>
            {operations.waitlistCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="Capaciteitsbucket" name="capacityBucket">
            <option value="regular">Regulier</option>
            <option value="flex">Flex</option>
            <option value="trial">Proefles</option>
          </FilterSelect>
          <FilterSelect label="Verloopt na" name="durationHours">
            <option value="24">24 uur</option>
            <option value="48">48 uur</option>
            <option value="72">72 uur</option>
            <option value="168">7 dagen</option>
          </FilterSelect>
          <label className="grid gap-1.5 text-xs font-semibold text-foreground xl:col-span-2">
            Reden
            <input className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal" maxLength={1000} minLength={3} name="reason" placeholder="Waarom moet de planner deze plek beoordelen?" required />
          </label>
          <div className="md:col-span-2 xl:col-span-6">
            <Button type="submit">Aanvraag ter goedkeuring klaarzetten</Button>
          </div>
        </form>
        <div className="mt-4 grid gap-3">
          {operations.reservations.length ? operations.reservations.slice(0, 20).map((reservation) => (
            <article className="rounded-xl border border-border p-4" key={reservation.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">
                    {waitlistById.get(reservation.waitlistEntryId)?.label ?? "Kandidaat"} · {groupById.get(reservation.groupId)?.name ?? "Lesgroep"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {capacityBucketLabel(reservation.capacityBucket)} · verloopt {formatDateTime(reservation.expiresAt)} · {reservation.reason}
                  </p>
                </div>
                <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold">
                  {reservationStatusLabel(reservation.status)}
                </span>
              </div>
              {reservation.status === "pending_approval" ? (
                <form action={reviewCapacitySoftReservationAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input name="reservationId" type="hidden" value={reservation.id} />
                  <label className="grid min-w-64 flex-1 gap-1 text-xs font-semibold">
                    Reviewreden
                    <input className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal" maxLength={1000} minLength={3} name="reason" placeholder="Controle en afweging" required />
                  </label>
                  <Button name="decision" type="submit" value="approve">Goedkeuren</Button>
                  <Button name="decision" type="submit" value="reject" variant="outline">Afwijzen</Button>
                </form>
              ) : null}
              {reservation.status === "approved" ? (
                <form action={releaseCapacitySoftReservationAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input name="reservationId" type="hidden" value={reservation.id} />
                  <label className="grid min-w-64 flex-1 gap-1 text-xs font-semibold">
                    Vrijgavereden
                    <input className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal" maxLength={1000} minLength={3} name="reason" placeholder="Waarom komt de plek weer vrij?" required />
                  </label>
                  <Button type="submit" variant="outline">Reservering vrijgeven</Button>
                </form>
              ) : null}
            </article>
          )) : (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nog geen zachte reserveringen.
            </p>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard icon={Gauge} label="Teruggemeten runs" tone="info" value={operations.accuracy.evaluated} />
          <AdminMetricCard icon={Clock3} label="Gemiddelde fout" tone="neutral" value={operations.accuracy.meanAbsoluteErrorDays === null ? "—" : `${operations.accuracy.meanAbsoluteErrorDays} d`} />
          <AdminMetricCard icon={CheckCircle2} label="Binnen band" tone="success" value={operations.accuracy.withinRangePercentage === null ? "—" : `${operations.accuracy.withinRangePercentage}%`} />
          <AdminMetricCard icon={AlertTriangle} label="Onvoldoende bewijs" tone={operations.accuracy.insufficientEvidence ? "warning" : "neutral"} value={operations.accuracy.insufficientEvidence} />
        </div>
      </section>

      <AdminListSurface>
        <CapacityForecastTable
          rows={forecasts.map((forecast) => ({
            id: forecast.group_id,
            group: forecast.group_name,
            program: programById.get(forecast.program_id)?.name ?? "Programma",
            stage: forecast.stage_id ? stageById.get(forecast.stage_id)?.badge_label ?? stageById.get(forecast.stage_id)?.name ?? "Niveau" : "Alle niveaus",
            day: forecast.day ? weekdays[forecast.day] ?? "Dag" : "Niet gepland",
            timeBlock: timeBlockLabels[forecast.time_block ?? ""] ?? "Geen tijdvak",
            location: forecast.location_id ? resourceById.get(forecast.location_id)?.name ?? "Locatie" : "Niet gekoppeld",
            resource: forecast.resource_id ? resourceById.get(forecast.resource_id)?.name ?? "Resource" : "Niet gekoppeld",
            capacity: forecast.current_capacity,
            occupied: forecast.current_occupied,
            activeSoftReservations: forecast.active_soft_reservations,
            expectedOpenings: forecast.expected_openings,
            expectedBottlenecks: forecast.expected_bottlenecks,
            waitlistDemand: forecast.waitlist_demand,
            risk: forecast.risk_level,
            confidence: forecast.confidence,
            reasons: forecast.reasons,
            actions: forecast.recommended_actions,
            isTest: forecast.is_test,
            modelVersion: forecast.model_version,
            confidenceScore: forecast.confidence_score,
            availabilityRange: forecast.availability_range,
            openingScenarios: forecast.opening_scenarios,
            dataQuality: forecast.data_quality
          }))}
        />
      </AdminListSurface>
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
  return `/admin/rapportages/capaciteit?${query.toString()}`;
}

function parseHorizon(value?: string): 4 | 8 | 12 {
  return value === "4" ? 4 : value === "12" ? 12 : 8;
}

function parseWeekday(value?: string) {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 7 ? day : undefined;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function reservationSuccess(value?: string) {
  return ({
    requested: "Zachte reservering staat klaar voor afzonderlijke plannergoedkeuring.",
    approved: "Zachte reservering is transactioneel goedgekeurd.",
    rejected: "Zachte reservering is afgewezen; capaciteit bleef ongewijzigd.",
    released: "Zachte reservering is vrijgegeven."
  } as Record<string, string>)[value ?? ""] ?? null;
}

function reservationStatusLabel(value: string) {
  return ({
    pending_approval: "wacht op goedkeuring",
    approved: "goedgekeurd",
    rejected: "afgewezen",
    released: "vrijgegeven",
    expired: "verlopen"
  } as Record<string, string>)[value] ?? value;
}

function capacityBucketLabel(value: string) {
  return ({ regular: "regulier", flex: "flex", trial: "proefles" } as Record<string, string>)[value] ?? value;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

const weekdays = ["", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];
const timeBlockLabels: Record<string, string> = {
  morning: "Ochtend",
  afternoon: "Middag",
  evening: "Avond"
};
