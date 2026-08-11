import { Award, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { awardRemainingBadgesAction } from "@/lib/domain/swim-operations-actions";
import type { RemainingBadgePreview } from "@/lib/domain/swim-operations";

export function RemainingBadgesCommand({
  badges,
  enrollmentId,
  nextPath,
  participantId
}: {
  badges: RemainingBadgePreview[];
  enrollmentId: string;
  nextPath: `/${string}`;
  participantId: string;
}) {
  if (badges.length === 0) {
    return null;
  }

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <p className="text-xs font-bold uppercase tracking-wider text-primary">Beheerderscommand</p>
      <h2 className="mt-1 text-lg font-bold text-foreground">Ken resterende badges toe</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Deze preview verandert geen voortgang. Alle geselecteerde badges worden in één idempotente batch verwerkt en leveren per ontvanger exact één verzamelnotificatie.
      </p>
      <form action={awardRemainingBadgesAction} className="mt-4 space-y-3">
        <input name="enrollmentId" type="hidden" value={enrollmentId} />
        <input name="participantId" type="hidden" value={participantId} />
        <input name="operationId" type="hidden" value={crypto.randomUUID()} />
        <input name="next" type="hidden" value={nextPath} />
        <div className="grid gap-2 sm:grid-cols-2">
          {badges.map((badge) => (
            <label className="flex min-h-16 items-start gap-3 rounded-xl border border-border bg-muted/25 p-3" key={badge.badge_release_id}>
              <input
                className="mt-1 size-5 accent-primary"
                disabled={badge.eligibility_status !== "eligible"}
                name="badgeReleaseId"
                type="checkbox"
                value={badge.badge_release_id}
              />
              <span>
                <span className="flex items-center gap-2 font-bold text-foreground">
                  {badge.is_surprise ? <Sparkles className="size-4 text-primary" /> : <Award className="size-4 text-primary" />}
                  {badge.resolved_name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {badge.eligibility_status === "eligible" ? "Beschikbaar voor toekenning" : badge.eligibility_reason}
                </span>
              </span>
            </label>
          ))}
        </div>
        <label className="grid gap-1 text-sm font-bold text-foreground" htmlFor={`remaining-badges-reason-${participantId}`}>
          Reden voor toekenning
          <Textarea id={`remaining-badges-reason-${participantId}`} name="reason" required />
        </label>
        <Button type="submit">
          <Award className="size-4" />
          Geselecteerde badges in één batch toekennen
        </Button>
      </form>
    </article>
  );
}
