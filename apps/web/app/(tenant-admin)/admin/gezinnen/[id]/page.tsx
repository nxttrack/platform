import { ArrowLeft, CheckCircle2, Clock3, ListTodo, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { EmptyState } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { createFamilyPlanningTaskAction } from "@/lib/domain/family-placement-actions";
import { findFamilyPlacementOptions } from "@/lib/domain/family-placement";
import { confirmDirectPlacementAction, createSlotOfferAction } from "@/lib/domain/placement-actions";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminFamilyDetailPage({ params, searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/admin/gezinnen");
  const tenant = getActiveTenant(context);
  const { id } = await params;
  const query = (await searchParams) ?? {};
  let data;
  try {
    data = await findFamilyPlacementOptions({ tenantId: tenant.id, guardianId: id, participantIds: [] });
  } catch {
    notFound();
  }
  const saved = getParam(query, "saved");
  const error = getParam(query, "error");
  const best = data.options[0] ?? null;

  return (
    <div className="space-y-5">
      <Link className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary hover:underline" href="/admin/gezinnen"><ArrowLeft className="size-4" />Alle gezinnen</Link>
      <PageHeader kicker="Ouderdossier" title={data.guardian.name} subtitle={`${data.guardian.email} · ${data.children.length} gekoppelde of wachtende kinderen`} />
      {saved ? <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Gezinsactie opgeslagen: {saved}.</p> : null}
      {error ? <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">Actie niet uitgevoerd: {error}.</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={Users} label="Kinderen" value={data.children.length} />
        <AdminMetricCard icon={CheckCircle2} label="Geplaatst" tone="success" value={data.children.filter((child) => child.state === "placed").length} />
        <AdminMetricCard icon={Clock3} label="Wachtend" tone="warning" value={data.children.filter((child) => child.state === "waiting").length} />
        <AdminMetricCard icon={MapPin} label="Beste gezinsmatch" tone={best?.blockers.length ? "warning" : best ? "success" : "neutral"} value={best ? best.total_score : "—"} />
      </div>

      <AdminListSurface>
        <Tabs defaultValue="family-planning">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overzicht</TabsTrigger>
            <TabsTrigger value="family-planning">Gezinsplanning</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <div className="grid gap-3 md:grid-cols-2">
              {data.children.map((child) => (
                <article className="rounded-xl border border-border bg-muted/30 p-4" key={child.key}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold">{child.name}</p>
                    <StatusPill tone={child.state === "placed" ? "success" : "warning"}>{child.state === "placed" ? "Geplaatst" : "Wachtlijst"}</StatusPill>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{child.participantId ? "Relationeel gekoppeld participant" : "Nog te converteren wachtlijstkandidaat"}</p>
                </article>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="family-planning">
            {data.options.length === 0 ? (
              <EmptyState>Er zijn minimaal twee kinderen met bevestigde les- of plaatsingsopties nodig. Controleer niveau, wachtlijstkoppeling, tijden en capaciteit.</EmptyState>
            ) : (
              <div className="grid gap-4">
                {data.options.map((option, optionIndex) => (
                  <article className="rounded-2xl border border-border bg-card p-4 shadow-soft" key={option.family_option_id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-bold">Optie {optionIndex + 1}</h2>
                          {optionIndex === 0 ? <StatusPill tone="success">Beste combinatie</StatusPill> : null}
                          <StatusPill tone={option.blockers.length ? "warning" : "success"}>{option.blockers.length ? `${option.blockers.length} controlepunt(en)` : "Blocker-vrij"}</StatusPill>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">Score {option.total_score}/100 · {Math.round(option.confidence * 100)}% confidence</p>
                      </div>
                      <form action={createFamilyPlanningTaskAction}>
                        <input name="guardianId" type="hidden" value={data.guardian.id} />
                        <input name="optionId" type="hidden" value={option.family_option_id} />
                        <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted" disabled={option.children_options.some((child) => child.isTest)} type="submit"><ListTodo className="size-4" />Taak maken</button>
                      </form>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {option.children_options.map((child) => {
                        const childBlocked = child.blockers.length > 0 || child.fifoOverrideRequired;
                        return (
                          <section className="rounded-xl border border-border bg-muted/20 p-4" key={`${child.participantName}:${child.groupId}`}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-bold">{child.participantName}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{child.groupName} · dag {child.weekday} · {child.startsAt.slice(0, 5)}–{child.endsAt.slice(0, 5)}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{child.locationName} · {child.capacityAvailable} actueel vrij</p>
                              </div>
                              <StatusPill tone={childBlocked ? "warning" : "success"}>{child.waitlistEntryId ? childBlocked ? "Beoordelen" : "Plaatsbaar" : "Bestaande les"}</StatusPill>
                            </div>
                            {child.fifoRank ? <p className="mt-3 text-xs font-semibold text-muted-foreground">FIFO-positie {child.fifoRank} van {child.fifoCohortSize}. Buiten positie 1 volgt nooit een automatische actie.</p> : null}
                            {child.waitlistEntryId && !childBlocked && !child.isTest ? (
                              <div className="mt-4 flex flex-wrap gap-2">
                                <ConfirmActionForm
                                  action={createSlotOfferAction}
                                  confirmLabel="Aanbod aanmaken"
                                  description="Dit maakt voor dit kind een afzonderlijk, geverifieerd plaatsingsaanbod. De ouder beslist daarna zelf."
                                  hiddenFields={{ waitlistEntryId: child.waitlistEntryId, groupId: child.groupId, humanConfirmation: "confirmed" }}
                                  title={`Aanbod voor ${child.participantName}?`}
                                  triggerLabel="Maak aanbod"
                                />
                                <ConfirmActionForm
                                  action={confirmDirectPlacementAction}
                                  confirmLabel="Kind afzonderlijk plaatsen"
                                  description="Gebruik dit alleen wanneer oudertoestemming buiten NXTTRACK aantoonbaar is verkregen. Capaciteit, niveau en conflicten worden opnieuw transactioneel gecontroleerd."
                                  hiddenFields={{ waitlistEntryId: child.waitlistEntryId, groupId: child.groupId, humanConfirmation: "confirmed" }}
                                  title={`${child.participantName} direct plaatsen?`}
                                  triggerLabel="Plaats afzonderlijk"
                                  triggerVariant="destructive"
                                />
                              </div>
                            ) : child.waitlistEntryId ? (
                              <Link className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline" href={`/admin/wachtlijst?q=${encodeURIComponent(child.participantName)}`}>Controleer in plaatsingscockpit</Link>
                            ) : null}
                          </section>
                        );
                      })}
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <section className="rounded-xl bg-success/5 p-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-success">Waarom deze combinatie</h3>
                        <ul className="mt-3 grid gap-2 text-sm">{option.reasons.map((reason) => <li key={`${reason.label}:${reason.evidence}`}><span className="font-semibold">{reason.label}</span> — {reason.explanation}<span className="block text-xs text-muted-foreground">{reason.evidence} · gewicht {reason.weight}</span></li>)}</ul>
                      </section>
                      <section className={`rounded-xl p-4 ${option.blockers.length ? "bg-warning/10" : "bg-muted/40"}`}>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Controlepunten</h3>
                        {option.blockers.length ? <ul className="mt-3 grid gap-2 text-sm">{option.blockers.map((blocker) => <li key={`${blocker.code}:${blocker.evidence}`}><span className="font-semibold">{blocker.label}</span> — {blocker.explanation}<span className="block text-xs text-muted-foreground">{blocker.evidence}</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Geen harde blocker. De admin blijft ieder kind afzonderlijk bevestigen.</p>}
                      </section>
                    </div>
                    <p className="mt-4 text-xs font-semibold text-muted-foreground">{option.same_day ? "Dezelfde dag" : "Meerdere dagen"} · {option.same_location ? "dezelfde locatie" : "locaties verschillen"} · {option.waiting_time_between_lessons === null ? "geen gezamenlijke tussenruimte" : `${option.waiting_time_between_lessons} minuten tussen de lessen`}</p>
                  </article>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </AdminListSurface>
    </div>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
