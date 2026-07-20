import { Award, Sparkles, Star } from "lucide-react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { getParentPortalData } from "@/lib/domain/parent-portal";

export const dynamic = "force-dynamic";

export default async function ParentBadgesPage() {
  const data = await getParentPortalData();
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const definitionById = new Map(data.badgeDefinitions.map((definition) => [definition.id, definition]));

  return (
    <div className="space-y-6">
      <PageHeader kicker="Badges" title="Momenten om trots op te zijn" subtitle="Alle zichtbare badges en complimenten van je kinderen op één plek." />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-blue-50 to-white">
          <Summary icon={<Award className="h-5 w-5" />} label="Behaalde badges" value={data.badgeAwards.length} />
        </Card>
        <Card className="bg-gradient-to-br from-emerald-50 to-white">
          <Summary icon={<Star className="h-5 w-5" />} label="Kinderen met badge" value={new Set(data.badgeAwards.map((badge) => badge.participant_id)).size} />
        </Card>
        <Card className="bg-gradient-to-br from-amber-50 to-white">
          <Summary icon={<Sparkles className="h-5 w-5" />} label="Beschikbare badge-types" value={data.badgeDefinitions.length} />
        </Card>
      </div>

      {data.badgeAwards.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">Nog geen badges zichtbaar. Nieuwe mijlpalen verschijnen hier automatisch.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.badgeAwards.map((badge) => {
            const participant = participantById.get(badge.participant_id);
            const definition = badge.badge_definition_id ? definitionById.get(badge.badge_definition_id) : null;

            return (
              <article className="rounded-3xl border bg-card p-5 shadow-soft" key={badge.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-glow">
                    <Award className="h-6 w-6" />
                  </div>
                  <StatusPill tone="success">
                    <Star className="h-3.5 w-3.5" /> behaald
                  </StatusPill>
                </div>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Kind"}</p>
                <h2 className="mt-1 text-xl font-bold text-foreground">{badge.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{badge.note || definition?.description || "Een mooie stap in de zwemreis."}</p>
                <p className="mt-4 text-xs font-medium text-muted-foreground">Toegekend op {formatDate(badge.awarded_at)}</p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-primary shadow-soft">{icon}</span>
      <div>
        <p className="text-3xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(value));
}
