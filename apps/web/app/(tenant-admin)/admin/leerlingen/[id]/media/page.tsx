import Link from "next/link";
import { ArrowLeft, Eye, ImagePlus, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";

import { Field, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { DirtyForm } from "@/components/ui/dirty-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import {
  deleteParticipantMediaAction,
  publishParticipantMediaAction,
  uploadParticipantMediaAction
} from "@/lib/domain/participant-media-actions";
import { mediaStatusLabel } from "@/lib/domain/participant-media-contract";
import { getAdminParticipantMediaData } from "@/lib/domain/participant-media";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminParticipantMediaPage({ params, searchParams }: PageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams ?? Promise.resolve({})]);
  const data = await getAdminParticipantMediaData(id);
  const saved = getParam(query, "saved");
  const error = getParam(query, "error");

  return (
    <div className="space-y-5">
      <PageHeader
        action={
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold" href="/admin/leerlingen">
            <ArrowLeft className="size-4" />
            Leerlingen
          </Link>
        }
        kicker="Privacyveilige mediatijdlijn"
        subtitle="Foto's blijven privé, worden ontdaan van metadata, op malware gecontroleerd en pas na jouw visuele bevestiging gepubliceerd."
        title={`Media · ${data.participant.display_name}`}
      />
      <RouteFeedback
        success={saved ? successMessage(saved) : null}
        error={error ? errorMessage(error) : null}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-border bg-muted/30 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold">Privé tijdlijn</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Eén leerling per foto of korte webrendition. Concepten zijn alleen zichtbaar voor bevoegde medewerkers.</p>
                </div>
                <StatusPill tone={data.consent.valid ? "success" : "warning"}>
                  {data.consent.valid ? "Toestemming actief" : "Publicatie geblokkeerd"}
                </StatusPill>
              </div>
            </div>

            {data.media.length === 0 ? (
              <div className="p-8 text-center">
                <ImagePlus className="mx-auto size-8 text-primary" />
                <p className="mt-3 font-semibold">Nog geen voortgangsmomenten</p>
                <p className="mt-1 text-sm text-muted-foreground">Upload rechts de eerste foto of korte video zodra toestemming actief is.</p>
              </div>
            ) : (
              <div className="grid gap-4 p-4 md:grid-cols-2">
                {data.media.map((media) => (
                  <article className="overflow-hidden rounded-xl border border-border bg-card" key={media.id}>
                    {!["deleted", "pending_deletion"].includes(media.status) ? (
                      media.media_type === "video" ? <video
                        className="aspect-[4/3] w-full bg-muted object-cover"
                        controls
                        playsInline
                        preload="metadata"
                        src={`/api/files/participant-media/${media.id}?review=1`}
                      /> : <img
                        alt={media.caption ? `${data.participant.display_name}: ${media.caption}` : `Voortgangsfoto van ${data.participant.display_name}`}
                        className="aspect-[4/3] w-full bg-muted object-cover"
                        loading="lazy"
                        src={`/api/files/participant-media/${media.id}?review=1`}
                      />
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center bg-muted text-sm text-muted-foreground">Object verwijderd</div>
                    )}
                    <div className="space-y-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{media.caption || "Voortgangsmoment"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(media.created_at)} · verloopt {formatDate(media.expires_at)}
                          </p>
                        </div>
                        <StatusPill tone={statusTone(media.status)}>{mediaStatusLabel(media.status)}</StatusPill>
                      </div>

                      {media.status === "draft" ? (
                        <DirtyForm action={publishParticipantMediaAction} className="space-y-3">
                          <input name="mediaId" type="hidden" value={media.id} />
                          <input name="participantId" type="hidden" value={data.participant.id} />
                          <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                            <input className="mt-1" name="confirmed" required type="checkbox" />
                            Ik heb het moment, de leerlingkoppeling en het bijschrift visueel gecontroleerd en publiceer bewust.
                          </label>
                          <SubmitButton>Bevestigen en publiceren</SubmitButton>
                        </DirtyForm>
                      ) : null}

                      {!["deleted", "pending_deletion"].includes(media.status) ? (
                        <DirtyForm action={deleteParticipantMediaAction} className="border-t border-border pt-3">
                          <input name="mediaId" type="hidden" value={media.id} />
                          <input name="participantId" type="hidden" value={data.participant.id} />
                          <label className="mb-2 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                            <input className="mt-1" name="confirmed" required type="checkbox" />
                            Definitief uit privéopslag verwijderen.
                          </label>
                          <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-danger/20 px-3 text-sm font-semibold text-danger" type="submit">
                            <Trash2 className="size-4" />
                            Verwijderen
                          </button>
                        </DirtyForm>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 text-primary" />
              <div>
                <h2 className="font-bold">Beslisbewijs</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Reden: {data.consent.reason}. Confidence: {data.consent.confidence}. Bron: {data.consent.sources.join(", ")}.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="font-display text-lg font-bold">Foto of korte video uploaden</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              JPEG, PNG of vooraf gemaakte MP4-webrendition, maximaal 20 MB. Beeldmetadata wordt door hercodering verwijderd; video moet vooraf privacyveilig zijn geëxporteerd.
            </p>
            {data.participant.is_test ? (
              <p className="mt-4 rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm text-warning-foreground">
                Journey Bot- en testleerlingen kunnen bewust geen media ontvangen.
              </p>
            ) : !data.canMutate ? (
              <p className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                Alleen een tenant owner of tenant admin kan media uploaden, publiceren of verwijderen.
              </p>
            ) : !data.consent.valid ? (
              <p className="mt-4 rounded-lg border border-warning/20 bg-warning/10 p-3 text-sm text-warning-foreground">
                Upload geblokkeerd totdat een bevoegde ouder/verzorger toestemming geeft.
              </p>
            ) : (
              <DirtyForm action={uploadParticipantMediaAction} className="mt-4 space-y-4" encType="multipart/form-data">
                <input name="participantId" type="hidden" value={data.participant.id} />
                <label className="space-y-2 text-[13px] font-semibold">
                  <span>Foto of MP4-webrendition</span>
                  <input
                    accept="image/jpeg,image/png,video/mp4,.jpg,.jpeg,.png,.mp4"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-semibold file:text-primary-foreground"
                    name="file"
                    required
                    type="file"
                  />
                </label>
                <TextAreaField label="Kort voortgangsbijschrift" name="caption" placeholder="Bijvoorbeeld: voor het eerst zelfstandig door het gat." />
                <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><input className="mt-1" name="videoWebRenditionConfirmed" type="checkbox" />Voor video: ik bevestig dat dit een lage, browsergeschikte MP4-rendition zonder onnodige metadata is.</label>
                <Field defaultValue={365} description="30–730 dagen; daarna wordt ook het opslagobject verwijderd." label="Bewaartermijn in dagen" name="retentionDays" type="number" />
                <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <input className="mt-1" name="downloadAllowed" type="checkbox" />
                  Ouder/verzorger mag naast bekijken ook downloaden.
                </label>
                <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <input className="mt-1" name="privacyConfirmed" required type="checkbox" />
                  Ik bevestig dat dit moment nodig is voor voortgangscommunicatie, één leerling toont en geen onnodige omstanders bevat.
                </label>
                <SubmitButton>Veilig uploaden als concept</SubmitButton>
              </DirtyForm>
            )}
          </Card>

          <Card>
            <div className="flex items-center gap-2">
              <LockKeyhole className="size-4 text-primary" />
              <h2 className="font-bold">Laatste toegang</h2>
            </div>
            <div className="mt-3 space-y-2">
              {data.accessLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nog geen toegangsgebeurtenissen.</p>
              ) : (
                data.accessLogs.slice(0, 8).map((log) => (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-xs" key={log.id}>
                    <span className="inline-flex items-center gap-1.5 font-semibold"><Eye className="size-3.5" />{log.action}</span>
                    <time className="text-muted-foreground">{formatDateTime(log.occurred_at)}</time>
                  </div>
                ))
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function successMessage(value: string) {
  if (value === "uploaded") return "De foto is veilig verwerkt en staat als concept klaar voor visuele controle.";
  if (value === "published") return "De foto is na bevestiging gepubliceerd in het ouderportaal.";
  if (value === "deleted") return "De foto en het privé-opslagobject zijn verwijderd.";
  return "Media-actie opgeslagen.";
}

function errorMessage(value: string) {
  const messages: Record<string, string> = {
    audit: "De verplichte auditregistratie mislukte; de upload is teruggedraaid.",
    confirmation: "Bevestig de privacy- of publicatiecontrole om door te gaan.",
    consent: "Er is geen geldige mediatoestemming of een ouder/verzorger heeft bezwaar gemaakt.",
    delete: "Verwijderen kon niet worden gestart.",
    delete_storage: "Het opslagobject kon niet worden verwijderd; de hersteljob probeert dit opnieuw.",
    file: "Kies een foto.",
    file_type: "Alleen JPEG of PNG tot maximaal 20 MB is toegestaan.",
    media: "Het mediabestand is niet gevonden of heeft niet de juiste status.",
    metadata: "De beveiligde metadata kon niet worden opgeslagen; het object is teruggedraaid.",
    participant: "Deze leerling bestaat niet of is testdata. Testdata ontvangt nooit media.",
    processing: "De foto is afgekeurd bij inhouds-, malware- of beeldcontrole.",
    publish: "Publiceren is geblokkeerd. Controleer toestemming, malwarestatus en bewaartermijn.",
    upload: "Upload naar privéopslag is mislukt."
  };
  return messages[value] ?? "De media-actie is niet gelukt.";
}

function statusTone(status: string): "danger" | "info" | "neutral" | "success" | "warning" {
  if (status === "published") return "success";
  if (status === "draft") return "info";
  if (status === "consent_blocked" || status === "expired") return "warning";
  if (status === "failed") return "danger";
  return "neutral";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
