import Link from "next/link";
import { Download, FileBadge, QrCode } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { ParentSectionNav } from "@/components/parent/parent-section-nav";
import { getParentPortalData } from "@/lib/domain/parent-portal";
import { getSelectedParticipantId, participantContextHref, type ParentPortalSearchParams } from "@/lib/domain/parent-portal-selection";
import { getPortalTerminology } from "@/lib/theme/portal-terminology";

type PageProps = { searchParams?: Promise<ParentPortalSearchParams> };

export const dynamic = "force-dynamic";

export default async function ParentDiplomasPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getParentPortalData(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const selectedParticipantId = getSelectedParticipantId(params, data.participants.map((participant) => participant.id));
  const visibleParticipantIds = new Set(selectedParticipantId ? [selectedParticipantId] : data.participants.map((participant) => participant.id));
  const participantById = new Map(data.participants.filter((participant) => visibleParticipantIds.has(participant.id)).map((participant) => [participant.id, participant]));
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const certificates = data.certificates.filter((certificate) => visibleParticipantIds.has(certificate.participant_id));
  const terminology = getPortalTerminology(data.portalTheme.manifest, data.tenant.sector);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Ontwikkeling" title={titleCase(terminology.finalCredentials)} subtitle="Een veilige plek voor alle behaalde resultaten." />
      <Feedback saved={saved} error={error} finalMoment={terminology.finalMoment} />
      <ParentSectionNav
        items={[
          { href: participantContextHref("/portaal/ontwikkeling", selectedParticipantId), label: "Voortgang" },
          { href: participantContextHref("/portaal/ontwikkeling/badges", selectedParticipantId), label: "Badges" },
          { href: participantContextHref("/portaal/ontwikkeling/media", selectedParticipantId), label: "Media" },
          { active: true, href: participantContextHref("/portaal/ontwikkeling/diplomas", selectedParticipantId), label: titleCase(terminology.finalCredentials) }
        ]}
        label="Ontwikkeling onderdelen"
      />

      <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <FileBadge className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Beveiligde {terminology.finalCredential}kluis</h2>
        </div>
        {certificates.length === 0 ? (
          <EmptyState>Nog geen {terminology.finalCredentials} beschikbaar.</EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {certificates.map((certificate) => {
              const participant = participantById.get(certificate.participant_id);
              const program = programById.get(certificate.program_id);
              const stage = stageById.get(certificate.stage_id);

              return (
                <article className="rounded-lg border border-border bg-white p-4" key={certificate.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Kind"}</p>
                      <h3 className="mt-1 text-lg font-bold text-foreground">{certificate.title}</h3>
                    </div>
                    <StatusPill tone="success">uitgegeven</StatusPill>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Detail label="Programma" value={program?.name ?? "Programma"} />
                    <Detail label={titleCase(terminology.stage)} value={stage?.badge_label ?? stage?.name ?? titleCase(terminology.stage)} />
                    <Detail label="Uitgegeven" value={formatDate(certificate.issued_on)} />
                    <Detail label="Nummer" value={certificate.certificate_number ?? "Niet gezet"} />
                  </div>
                  {certificate.notes ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{certificate.notes}</p> : null}
                  {certificate.file_path ? (
                    <Link className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" href={`/api/files/certificate/${certificate.id}`}>
                      <Download className="h-4 w-4" />
                      {titleCase(terminology.finalCredential)} downloaden
                    </Link>
                  ) : null}
                  {certificate.verification_status === "active" ? (
                    <details className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-foreground">
                        <QrCode className="size-4 text-primary" />
                        Digitale echtheidscontrole
                      </summary>
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <img alt={`QR-code voor verificatie van ${certificate.title}`} className="size-28 rounded-xl border border-border bg-white p-2" src={`/api/public/diplomas/${certificate.verification_public_id}/qr`} />
                        <div><p className="text-sm leading-6 text-muted-foreground">Laat deze QR-code scannen om de geldigheid te controleren, zonder het private bestand te delen.</p><Link className="mt-2 inline-flex text-sm font-bold text-primary underline-offset-4 hover:underline" href={`/diploma-verificatie/${certificate.verification_public_id}`}>Verificatiepagina openen</Link></div>
                      </div>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-4 text-sm text-muted-foreground">{children}</p>;
}

function Feedback({ saved, error, finalMoment }: { saved?: string; error?: string; finalMoment: string }) {
  if (saved === "confirmed") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Uitnodiging voor {finalMoment} bevestigd.</p>;
  }

  if (saved === "declined") {
    return <p className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm font-semibold text-warning">Uitnodiging voor {finalMoment} afgewezen.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">Actie is niet gelukt: {error}.</p>;
  }

  return null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
