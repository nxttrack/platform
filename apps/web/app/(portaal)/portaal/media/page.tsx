import Link from "next/link";
import { CalendarClock, Download, Images, LockKeyhole, ShieldCheck } from "lucide-react";

import { SubmitButton } from "@/components/admin/domain-ui";
import { ParentSectionNav } from "@/components/parent/parent-section-nav";
import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { DirtyForm } from "@/components/ui/dirty-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { recordParticipantMediaConsentAction } from "@/lib/domain/participant-media-actions";
import { PARTICIPANT_MEDIA_POLICY_VERSION } from "@/lib/domain/participant-media-contract";
import { getParentParticipantMediaData } from "@/lib/domain/participant-media";
import { getSelectedParticipantId, participantContextHref, type ParentPortalSearchParams } from "@/lib/domain/parent-portal-selection";

type PageProps = {
  searchParams?: Promise<ParentPortalSearchParams>;
};

export const dynamic = "force-dynamic";

export default async function ParentMediaPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([
    getParentParticipantMediaData(),
    searchParams ?? Promise.resolve({})
  ]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const selectedParticipantId = getSelectedParticipantId(params, data.participants.map((participant) => participant.id));
  const visibleParticipants = selectedParticipantId ? data.participants.filter((participant) => participant.id === selectedParticipantId) : data.participants;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Ontwikkeling"
        subtitle="Alleen jij en het bevoegde zwemschoolteam kunnen gepubliceerde momenten bekijken. Toestemming kan hier altijd worden ingetrokken."
        title="Besloten media"
      />
      <RouteFeedback
        success={saved ? consentSuccess(saved) : null}
        error={error ? consentError(error) : null}
      />
      <ParentSectionNav
        items={[
          { href: participantContextHref("/portaal/ontwikkeling", selectedParticipantId), label: "Voortgang" },
          { href: participantContextHref("/portaal/ontwikkeling/badges", selectedParticipantId), label: "Badges" },
          { active: true, href: participantContextHref("/portaal/ontwikkeling/media", selectedParticipantId), label: "Media" },
          { href: participantContextHref("/portaal/ontwikkeling/diplomas", selectedParticipantId), label: "Diploma’s" }
        ]}
        label="Ontwikkeling onderdelen"
      />

      <section className="grid gap-3 md:grid-cols-3">
        <TrustCard icon={LockKeyhole} label="Privé opgeslagen" text="Geen openbare links of deelbare Storage-URL's." />
        <TrustCard icon={ShieldCheck} label="Actieve toestemming" text="Elke weergave controleert toestemming en gezinskoppeling opnieuw." />
        <TrustCard icon={CalendarClock} label="Automatisch verwijderd" text="Na de bewaartermijn verdwijnt ook het opslagobject." />
      </section>

      {visibleParticipants.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">Er is nog geen leerling aan dit ouderaccount gekoppeld.</p>
        </Card>
      ) : (
        visibleParticipants.map((participant, index) => {
          const consent = data.consents.find((item) => item.participant_id === participant.id);
          const overallConsent = data.consentStates[participant.id];
          const media = data.media.filter((item) => item.participant_id === participant.id);
          const mayDecide = participant.accessLevel !== "view_only";

          return (
            <section className="scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-card shadow-soft" id={index === 0 ? "toestemming" : undefined} key={participant.id}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/25 px-5 py-4">
                <div>
                  <h2 className="font-display text-xl font-bold">{participant.display_name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {media.length} gepubliceerd(e) voortgangsmoment(en)
                  </p>
                </div>
                <StatusPill tone={overallConsent?.valid ? "success" : "warning"}>
                  {overallConsent?.valid ? "Toestemming actief" : "Publicatie geblokkeerd"}
                </StatusPill>
              </div>

              <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div>
                  {media.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
                      <Images className="mx-auto size-8 text-primary" />
                      <p className="mt-3 font-semibold">Nog geen gepubliceerde foto's</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Het team publiceert alleen relevante voortgangsmomenten na een handmatige controle.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {media.map((item) => (
                        <article className="overflow-hidden rounded-xl border border-border bg-background" key={item.id}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            alt={item.caption ? `${participant.display_name}: ${item.caption}` : `Voortgangsfoto van ${participant.display_name}`}
                            className="aspect-[4/3] w-full bg-muted object-cover"
                            loading="lazy"
                            src={`/api/files/participant-media/${item.id}`}
                          />
                          <div className="p-4">
                            <p className="font-semibold">{item.caption || "Voortgangsmoment"}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Gepubliceerd {formatDate(item.published_at ?? item.created_at)} · beschikbaar tot {formatDate(item.expires_at)}
                            </p>
                            {item.download_allowed ? (
                              <Link
                                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold"
                                href={`/api/files/participant-media/${item.id}?download=1`}
                              >
                                <Download className="size-4" />
                                Downloaden
                              </Link>
                            ) : (
                              <p className="mt-3 text-xs text-muted-foreground">Bekijken toegestaan; downloaden staat uit.</p>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <aside className="rounded-xl border border-border bg-muted/20 p-4">
                  <h3 className="font-bold">Jouw mediatoestemming</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Doel: besloten voortgangscommunicatie binnen NXTTRACK. Geen marketing, openbare publicatie of automatische beoordeling.
                    Beleidsversie {PARTICIPANT_MEDIA_POLICY_VERSION}.
                  </p>
                  {consent ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Laatst gekozen: {consentLabel(consent.status)} · {formatDate(consent.updated_at)}
                    </p>
                  ) : null}
                  {consent?.status === "granted" && !overallConsent?.valid ? (
                    <p className="mt-3 rounded-lg border border-warning/20 bg-warning/10 p-3 text-xs leading-5 text-warning-foreground">
                      Jouw toestemming is actief, maar een keuze van een andere gekoppelde ouder/verzorger blokkeert publicatie. De zwemschool ziet alleen de status, niet meer bewijs dan nodig.
                    </p>
                  ) : null}

                  {!mayDecide ? (
                    <p className="mt-4 rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm text-warning-foreground">
                      Je hebt alleen-lezen toegang. Een primair of secundair gekoppelde ouder/verzorger beheert toestemming.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {consent?.status !== "granted" ? (
                        <ConsentForm decision="granted" label="Toestemming geven" participantId={participant.id} />
                      ) : (
                        <ConsentForm decision="withdrawn" label="Toestemming intrekken" participantId={participant.id} tone="danger" />
                      )}
                      {consent?.status !== "denied" && consent?.status !== "granted" ? (
                        <ConsentForm decision="denied" label="Geen toestemming geven" participantId={participant.id} tone="secondary" />
                      ) : null}
                    </div>
                  )}
                </aside>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function ConsentForm({
  decision,
  label,
  participantId,
  tone = "primary"
}: {
  decision: "denied" | "granted" | "withdrawn";
  label: string;
  participantId: string;
  tone?: "danger" | "primary" | "secondary";
}) {
  return (
    <DirtyForm action={recordParticipantMediaConsentAction} className="space-y-3">
      <input name="decision" type="hidden" value={decision} />
      <input name="participantId" type="hidden" value={participantId} />
      <label className="block space-y-1.5 text-xs font-semibold">
        <span>Mijn bevoegdheid</span>
        <select className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal" defaultValue="guardian" name="authority">
          <option value="guardian">Ouder/verzorger</option>
          <option value="legal_representative">Wettelijk vertegenwoordiger</option>
        </select>
      </label>
      <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <input className="mt-1" name="confirmed" required type="checkbox" />
        Ik begrijp het doel en bevestig deze keuze bewust. Intrekken verbergt gepubliceerde media direct.
      </label>
      {tone === "primary" ? (
        <SubmitButton>{label}</SubmitButton>
      ) : (
        <button
          className={tone === "danger"
            ? "min-h-11 w-full rounded-lg border border-danger/20 bg-danger/5 px-4 text-sm font-semibold text-danger"
            : "min-h-11 w-full rounded-lg border border-border bg-background px-4 text-sm font-semibold"}
          type="submit"
        >
          {label}
        </button>
      )}
    </DirtyForm>
  );
}

function TrustCard({
  icon: Icon,
  label,
  text
}: {
  icon: typeof LockKeyhole;
  label: string;
  text: string;
}) {
  return (
    <Card>
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
        <div><p className="font-semibold">{label}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{text}</p></div>
      </div>
    </Card>
  );
}

function consentLabel(status: string) {
  const labels: Record<string, string> = {
    denied: "Geen toestemming",
    expired: "Toestemming verlopen",
    granted: "Toestemming actief",
    pending: "Keuze open",
    withdrawn: "Toestemming ingetrokken"
  };
  return labels[status] ?? status;
}

function consentSuccess(value: string) {
  if (value === "granted") return "Toestemming is vastgelegd. De zwemschool kan nu gecontroleerde voortgangsfoto's publiceren.";
  if (value === "withdrawn") return "Toestemming is ingetrokken. Eerder gepubliceerde media is direct verborgen.";
  if (value === "denied") return "Je keuze om geen toestemming te geven is vastgelegd.";
  return "Toestemmingskeuze opgeslagen.";
}

function consentError(value: string) {
  if (value === "confirmation") return "Bevestig dat je de keuze bewust maakt.";
  if (value === "readonly") return "Je gezinskoppeling heeft alleen-lezen toegang en mag toestemming niet wijzigen.";
  return "De toestemmingskeuze kon niet veilig worden vastgelegd.";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
