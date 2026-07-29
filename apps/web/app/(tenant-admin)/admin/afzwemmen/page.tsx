import Link from "next/link";
import { Award, CalendarCheck, ClipboardPlus, Download, FileBadge, Send, Sparkles, UploadCloud } from "lucide-react";
import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminSection, DataList, EmptyState, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { DirtyForm } from "@/components/ui/dirty-form";
import { createGraduationEventAction, inviteGraduationParticipantAction, markGraduationReadinessAction, registerGraduationResultAction, uploadCertificateFileAction } from "@/lib/domain/graduation-actions";
import { getGraduationAdminData } from "@/lib/domain/graduation";
import { createReadinessPracticeTaskAction } from "@/lib/domain/learning-intelligence-actions";
import { calculateDiplomaReadiness } from "@/lib/domain/learning-intelligence";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminGraduationPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getGraduationAdminData(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const resourceById = new Map(data.resources.map((resource) => [resource.id, resource]));
  const readinessById = new Map(data.readiness.map((readiness) => [readiness.id, readiness]));
  const certificatesByEventParticipantId = new Map(data.certificates.flatMap((certificate) => (certificate.event_participant_id ? [[certificate.event_participant_id, certificate] as const] : [])));
  const inviteableReadiness = data.readiness.filter((readiness) => readiness.status === "ready" || readiness.status === "nearly_ready" || readiness.status === "invited");
  const openEvents = data.graduationEvents.filter((event) => event.status === "planned" || event.status === "published");
  const assistantRows = await Promise.all(
    data.readiness.filter((readiness) => !readiness.is_test).slice(0, 40).map(async (readiness) => ({
      readiness,
      assistant: await calculateDiplomaReadiness({
        tenantId: data.tenant.id,
        participantId: readiness.participant_id,
        programId: readiness.program_id
      })
    }))
  );

  return (
    <div className="space-y-5">
      <PageHeader action={<><AdminActionDrawer description="Markeer een leerling als bijna klaar, klaar, geblokkeerd of nog niet klaar." title="Readiness beoordelen" triggerLabel="Readiness beoordelen"><ReadinessForm data={data} /></AdminActionDrawer><AdminActionDrawer description="Plan een afzwemmoment voor programma, niveau en locatie." title="Afzwemevent plannen" triggerLabel="Event plannen" triggerVariant="outline" width="wide"><GraduationEventForm data={data} /></AdminActionDrawer></>} kicker="Lesproces" title="Afzwemmen en diploma's" subtitle="Beoordeel readiness, plan afzwemmomenten, nodig ouders uit en registreer resultaten." />
      <Feedback saved={saved} error={error} />

      <AdminSection title="Afzwemgereedheidsassistent" description="Uitlegbare ondersteuning op basis van vaardigheden, stabiliteit, aanwezigheid en de menselijke aanbeveling. De assistent neemt geen afzwembesluit.">
        {assistantRows.length === 0 ? (
          <EmptyState>Leg eerst een menselijke readiness-review vast om de assistent naast die beoordeling te tonen.</EmptyState>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {assistantRows.map(({ assistant, readiness }) => {
              const participant = participantById.get(readiness.participant_id);
              const stage = stageById.get(readiness.stage_id);
              return (
                <article className="rounded-2xl border border-border bg-card p-4 shadow-soft" key={readiness.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary"><Sparkles className="size-4" />Adviserend</p>
                      <h3 className="mt-1 text-lg font-bold text-foreground">{participant?.display_name ?? "Leerling"}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{stage?.badge_label ?? stage?.name ?? "Niveau"}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <StatusPill tone={readinessBandTone(assistant.readiness_band)}>{readinessBandLabel(assistant.readiness_band)}</StatusPill>
                      <StatusPill tone="info">{assistant.confidence} vertrouwen</StatusPill>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <ReadinessDetail label="Vaardigheden" value={`${assistant.required_skills_completed.length} stabiel op niveau`} />
                    <ReadinessDetail label="Aanwezigheidscontext" value={assistant.attendance_summary} />
                    <ReadinessDetail label="Stabiliteit" value={assistant.recent_score_stability} />
                    <ReadinessDetail label="Menselijke review" value={assistant.instructor_recommendation?.replaceAll("_", " ") ?? "Nog niet vastgelegd"} />
                  </div>
                  <div className="mt-4 space-y-2">
                    {assistant.blockers.slice(0, 3).map((blocker) => <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs leading-5 text-muted-foreground" key={blocker}>{blocker}</p>)}
                    <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm font-medium leading-6 text-foreground">{assistant.suggested_next_step}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={createReadinessPracticeTaskAction}>
                      <input name="participantId" type="hidden" value={readiness.participant_id} />
                      <input name="programId" type="hidden" value={readiness.program_id} />
                      <input name="next" type="hidden" value="/admin/afzwemmen" />
                      <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold hover:bg-muted" type="submit">
                        <ClipboardPlus className="size-4" />Oefentaak maken
                      </button>
                    </form>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">Markeren als ready en toevoegen aan een afzwemevent blijven aparte, menselijke stappen.</p>
                </article>
              );
            })}
          </div>
        )}
      </AdminSection>

      <AdminSection title="Uitnodigen" description="Stuur een parent-visible afzwemuitnodiging naar leerlingen met readiness.">
        {inviteableReadiness.length === 0 || openEvents.length === 0 ? (
          <EmptyState>Er zijn nog geen ready leerlingen of open afzwemevents.</EmptyState>
        ) : (
          <DataList>
            {inviteableReadiness.map((readiness) => {
              const participant = participantById.get(readiness.participant_id);
              const stage = stageById.get(readiness.stage_id);

              return (
                <div className="grid gap-3 px-3 py-3 md:grid-cols-[1fr_auto] md:items-end" key={readiness.id}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-foreground">{participant?.display_name ?? "Leerling"}</p>
                      <StatusPill tone={readiness.status === "ready" ? "success" : readiness.status === "invited" ? "info" : "warning"}>{readiness.status}</StatusPill>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {stage?.badge_label ?? stage?.name ?? "Badje"} · menselijk beoordeeld
                    </p>
                    {readiness.checklist_summary ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{readiness.checklist_summary}</p> : null}
                  </div>
                  <form action={inviteGraduationParticipantAction} className="flex flex-wrap items-end gap-2">
                    <input name="readinessId" type="hidden" value={readiness.id} />
                    <label className="space-y-2 text-sm font-semibold text-foreground">
                      <span>Afzwemevent</span>
                      <select className="h-10 min-w-64 rounded-lg border border-border bg-white px-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" name="eventId" required>
                        <option value="">Kies event</option>
                        {openEvents.map((event) => (
                          <option key={event.id} value={event.id}>
                            {event.title} - {formatDateTime(event.starts_at)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
                      <Send className="h-4 w-4" />
                      Uitnodigen
                    </button>
                  </form>
                </div>
              );
            })}
          </DataList>
        )}
      </AdminSection>

      <AdminSection title="Events en resultaten">
        {data.graduationEvents.length === 0 ? (
          <EmptyState>Nog geen afzwemevents.</EmptyState>
        ) : (
          <div className="space-y-4">
            {data.graduationEvents.map((event) => {
              const eventParticipants = data.graduationParticipants.filter((participant) => participant.event_id === event.id);
              const resource = event.resource_id ? resourceById.get(event.resource_id) : null;

              return (
                <article className="rounded-lg border border-border bg-white p-4" key={event.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <CalendarCheck className="h-5 w-5 text-primary" />
                        <h2 className="font-bold text-foreground">{event.title}</h2>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDateTime(event.starts_at)} - {resource?.name ?? "locatie volgt"} - capaciteit {event.capacity ?? "open"}
                      </p>
                    </div>
                    <StatusPill tone={event.status === "published" ? "success" : event.status === "cancelled" ? "danger" : "neutral"}>{event.status}</StatusPill>
                  </div>

                  <div className="mt-4 space-y-3">
                    {eventParticipants.length === 0 ? <EmptyState>Nog geen uitgenodigde leerlingen.</EmptyState> : null}
                    {eventParticipants.map((eventParticipant) => {
                      const participant = participantById.get(eventParticipant.participant_id);
                      const readiness = eventParticipant.readiness_id ? readinessById.get(eventParticipant.readiness_id) : null;
                      const certificate = certificatesByEventParticipantId.get(eventParticipant.id);

                      return (
                        <div className="rounded-lg border border-border bg-muted/30 p-3" key={eventParticipant.id}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-semibold text-foreground">{participant?.display_name ?? "Leerling"}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                uitnodiging {eventParticipant.invite_status} - resultaat {eventParticipant.result}
                                {readiness ? ` - readiness ${readiness.status}` : ""}
                              </p>
                            </div>
                            {certificate ? (
                              <StatusPill tone="success">
                                <FileBadge className="h-3.5 w-3.5" />
                                certificaat
                              </StatusPill>
                            ) : (
                              <StatusPill tone={eventParticipant.result === "passed" ? "success" : eventParticipant.result === "failed" ? "danger" : "neutral"}>{eventParticipant.status}</StatusPill>
                            )}
                          </div>
                          <form action={registerGraduationResultAction} className="mt-3 grid gap-3 md:grid-cols-3">
                            <input name="eventParticipantId" type="hidden" value={eventParticipant.id} />
                            <SelectField label="Resultaat" name="result">
                              <option value="passed">Geslaagd</option>
                              <option value="failed">Niet gehaald</option>
                              <option value="deferred">Uitgesteld</option>
                            </SelectField>
                            <Field label="Diplomanummer" name="certificateNumber" placeholder="Optioneel" />
                            <Field label="Uitgiftedatum" name="issuedOn" type="date" />
                            <div className="md:col-span-3">
                              <Field label="Certificaattitel" name="certificateTitle" placeholder="Bijvoorbeeld: Zwemdiploma A" />
                            </div>
                            <div className="md:col-span-3">
                              <TextAreaField label="Resultaatnotitie" name="resultNotes" />
                            </div>
                            <div className="md:col-span-3">
                              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
                                <Award className="h-4 w-4" />
                                Resultaat opslaan
                              </button>
                            </div>
                          </form>
                          {certificate ? (
                            <div className="mt-3 rounded-lg border border-border bg-white p-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">{certificate.title}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {certificate.certificate_number ?? "Zonder diplomanummer"} - uitgegeven {formatDate(certificate.issued_on)}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Diplomabestand: {certificate.file_name ?? "nog niet toegevoegd"} - {certificate.storage_status}
                                  </p>
                                </div>
                                {certificate.file_path ? (
                                  <Link className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-foreground hover:bg-muted" href={`/api/files/certificate/${certificate.id}`}>
                                    <Download className="h-4 w-4" />
                                    Download
                                  </Link>
                                ) : null}
                              </div>
                              <form action={uploadCertificateFileAction} className="mt-3 flex flex-wrap items-end gap-2" encType="multipart/form-data">
                                <input name="certificateId" type="hidden" value={certificate.id} />
                                <label className="space-y-2 text-sm font-semibold text-foreground">
                                  <span>Bestand</span>
                                  <input accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-normal file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground" name="file" required type="file" />
                                </label>
                                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
                                  <UploadCloud className="h-4 w-4" />
                                  Bestand opslaan
                                </button>
                              </form>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </AdminSection>
    </div>
  );
}

function ReadinessForm({ data }: { data: Awaited<ReturnType<typeof getGraduationAdminData>> }) {
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const activeEnrollments = data.enrollments.filter((enrollment) => enrollment.status === "active" && enrollment.current_stage_id);
  return <DirtyForm action={markGraduationReadinessAction} className="grid gap-4 sm:grid-cols-2"><SelectField label="Inschrijving" name="enrollmentId" required><option value="">Kies leerling</option>{activeEnrollments.map((enrollment) => <option key={enrollment.id} value={enrollment.id}>{participantById.get(enrollment.participant_id)?.display_name ?? "Leerling"} · {programById.get(enrollment.program_id)?.name ?? "Programma"} · {enrollment.current_stage_id ? stageById.get(enrollment.current_stage_id)?.badge_label ?? stageById.get(enrollment.current_stage_id)?.name ?? "Niveau" : "Niveau"}</option>)}</SelectField><SelectField label="Menselijke aanbeveling" name="status"><option value="nearly_ready">Bijna klaar</option><option value="ready">Klaar voor admin-review</option><option value="not_ready">Verder ontwikkelen</option><option value="blocked">Eerst blokkade oplossen</option></SelectField><Field label="Volgende review" name="nextReviewOn" type="date" /><div className="sm:col-span-2"><TextAreaField label="Checklist samenvatting" name="checklistSummary" placeholder="Bijvoorbeeld: techniek stabiel, nog rustig oefenen op uithoudingsvermogen." /></div><div className="sm:col-span-2"><SubmitButton>Menselijke review opslaan</SubmitButton></div></DirtyForm>;
}

function GraduationEventForm({ data }: { data: Awaited<ReturnType<typeof getGraduationAdminData>> }) {
  return <DirtyForm action={createGraduationEventAction} className="grid gap-4 sm:grid-cols-2"><Field label="Titel" name="title" required placeholder="Afzwemmen diploma A" /><SelectField label="Status" name="status"><option value="planned">Gepland</option><option value="published">Gepubliceerd</option><option value="completed">Afgerond</option><option value="cancelled">Geannuleerd</option></SelectField><SelectField label="Programma" name="programId"><option value="">Alle programma's</option>{data.programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</SelectField><SelectField label="Niveau" name="stageId"><option value="">Alle niveaus</option>{data.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.badge_label ?? stage.name}</option>)}</SelectField><SelectField label="Locatie / resource" name="resourceId"><option value="">Nog niet gezet</option>{data.resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</SelectField><Field label="Capaciteit" name="capacity" type="number" /><Field label="Start" name="startsAt" required type="datetime-local" /><Field label="Einde" name="endsAt" required type="datetime-local" /><div className="sm:col-span-2"><TextAreaField label="Notities" name="notes" /></div><div className="sm:col-span-2"><SubmitButton>Event opslaan</SubmitButton></div></DirtyForm>;
}

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Opgeslagen: {saved}.</p>;
  }

  if (error === "capacity") {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Dit afzwemevent zit vol.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Actie is niet gelukt: {error}.</p>;
  }

  return null;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value)) : "datum onbekend";
}

function ReadinessDetail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-muted/35 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-xs font-semibold leading-5 text-foreground">{value}</p></div>;
}

function readinessBandLabel(value: string) {
  return ({
    laag: "Verder ontwikkelen",
    in_ontwikkeling: "In ontwikkeling",
    bijna_klaar: "Bijna klaar",
    hoog_vertrouwen: "Hoog vertrouwen",
    klaar_voor_admin_review: "Klaar voor admin-review"
  } as Record<string, string>)[value] ?? value;
}

function readinessBandTone(value: string): "neutral" | "info" | "warning" | "success" {
  if (value === "klaar_voor_admin_review" || value === "hoog_vertrouwen") return "success";
  if (value === "bijna_klaar") return "warning";
  if (value === "in_ontwikkeling") return "info";
  return "neutral";
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
