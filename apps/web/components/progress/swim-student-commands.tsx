import { ArrowRight, CheckCircle2, ClipboardCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  approveSwimTransitionAction,
  completePreviousStageItemsAction,
  executeSwimTransitionAction,
  previewSwimTransitionAction,
  reviewSwimTransitionAction
} from "@/lib/domain/swim-operations-actions";
import type {
  PreviousStageItemPreview,
  SwimTransitionCaseRow
} from "@/lib/domain/swim-operations";

export function SwimTransitionControls({
  canApprove,
  enrollmentId,
  nextPath,
  participantId,
  stageNameById,
  transitionCase
}: {
  canApprove: boolean;
  enrollmentId: string;
  nextPath: `/${string}`;
  participantId: string;
  stageNameById: Map<string, string>;
  transitionCase: SwimTransitionCaseRow | null;
}) {
  const openCount = numberFrom(transitionCase?.eligibility_json.openCount);
  const masteredCount = numberFrom(transitionCase?.eligibility_json.masteredCount);
  const requiredCount = numberFrom(transitionCase?.eligibility_json.requiredCount);

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <ArrowRight className="size-4" />
            Doorstroom
          </p>
          <h2 className="mt-1 text-lg font-bold text-foreground">Begeleide doorstroomreview</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Geschiktheid, review, goedkeuring en uitvoering zijn vier afzonderlijke stappen. Geen percentage verplaatst een leerling.
          </p>
        </div>
        {transitionCase ? (
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${transitionCase.execution_status === "executed" ? "bg-success/10 text-success" : transitionCase.eligibility_status === "eligible" ? "bg-primary/10 text-primary" : "bg-warning/15 text-warning-foreground"}`}>
            {transitionCase.execution_status === "executed"
              ? "uitgevoerd"
              : transitionCase.eligibility_status === "eligible"
                ? "geschikt"
                : "menselijke afweging nodig"}
          </span>
        ) : null}
      </div>

      {!transitionCase ? (
        <form action={previewSwimTransitionAction} className="mt-4">
          <input name="enrollmentId" type="hidden" value={enrollmentId} />
          <input name="next" type="hidden" value={nextPath} />
          <Button type="submit" variant="outline">
            <ClipboardCheck className="size-4" />
            Doorstroomimpact bekijken
          </Button>
        </form>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Beheerst" value={`${masteredCount} / ${requiredCount}`} />
            <Metric label="Openstaand" value={String(openCount)} />
            <Metric
              label="Route"
              value={`${stageNameById.get(transitionCase.from_stage_id) ?? "Huidig"} → ${transitionCase.to_stage_id ? stageNameById.get(transitionCase.to_stage_id) ?? "Volgend" : "Diplomareview"}`}
            />
          </div>

          {!transitionCase.to_stage_id ? (
            <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Dit is het laatste badje in deze curriculumversie. Gebruik de afzonderlijke afzwemcontrole; deze doorstroomcase kan geen diploma uitgeven.
            </p>
          ) : null}

          {transitionCase.to_stage_id && transitionCase.review_status === "pending" ? (
            <form action={reviewSwimTransitionAction} className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4">
              <input name="caseId" type="hidden" value={transitionCase.id} />
              <input name="next" type="hidden" value={nextPath} />
              <label className="text-sm font-bold text-foreground" htmlFor={`transition-review-${participantId}`}>Reviewreden</label>
              <Textarea id={`transition-review-${participantId}`} name="reason" required />
              <Button className="w-fit" type="submit">
                <ClipboardCheck className="size-4" />
                Review vastleggen
              </Button>
            </form>
          ) : null}

          {transitionCase.to_stage_id && transitionCase.review_status === "reviewed" && transitionCase.approval_status === "pending" ? (
            canApprove ? (
              <form action={approveSwimTransitionAction} className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4">
                <input name="caseId" type="hidden" value={transitionCase.id} />
                <input name="next" type="hidden" value={nextPath} />
                <label className="text-sm font-bold text-foreground" htmlFor={`transition-approval-${participantId}`}>Goedkeuringsreden</label>
                <Textarea id={`transition-approval-${participantId}`} name="reason" required />
                <div className="flex flex-wrap gap-2">
                  <Button name="decision" type="submit" value="approve">
                    <ShieldCheck className="size-4" />
                    Doorstroom goedkeuren
                  </Button>
                  <Button name="decision" type="submit" value="reject" variant="outline">Afwijzen</Button>
                </div>
              </form>
            ) : (
              <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                Review voltooid. Een bevoegde beheerder moet de doorstroom afzonderlijk goedkeuren.
              </p>
            )
          ) : null}

          {transitionCase.approval_status === "approved" && transitionCase.execution_status === "pending" ? (
            canApprove ? (
              <form action={executeSwimTransitionAction} className="grid gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <input name="caseId" type="hidden" value={transitionCase.id} />
                <input name="operationId" type="hidden" value={crypto.randomUUID()} />
                <input name="next" type="hidden" value={nextPath} />
                <label className="text-sm font-bold text-foreground" htmlFor={`transition-execute-${participantId}`}>Uitvoeringsreden</label>
                <Textarea id={`transition-execute-${participantId}`} name="reason" required />
                <Button className="w-fit" type="submit">
                  <ArrowRight className="size-4" />
                  Goedgekeurde doorstroom uitvoeren
                </Button>
              </form>
            ) : (
              <p className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                Doorstroom goedgekeurd. Uitvoering wacht op een bevoegde beheerder.
              </p>
            )
          ) : null}

          {transitionCase.execution_status === "executed" ? (
            <p className="flex items-center gap-2 rounded-xl border border-success/20 bg-success/10 p-4 text-sm font-semibold text-success">
              <CheckCircle2 className="size-5" />
              Doorstroom uitgevoerd. Eventuele open onderdelen zijn als verwijzingen naar het vorige badje bewaard.
            </p>
          ) : null}
        </div>
      )}
    </article>
  );
}

export function CompletePreviousStageItems({
  enrollmentId,
  items,
  nextPath,
  participantId
}: {
  enrollmentId: string;
  items: PreviousStageItemPreview[];
  nextPath: `/${string}`;
  participantId: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <p className="text-xs font-bold uppercase tracking-wider text-primary">Carryover</p>
      <h2 className="mt-1 text-lg font-bold text-foreground">Voltooi onderdelen vorig badje</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Ieder onderdeel blijft gekoppeld aan de originele curriculumidentiteit. Selecteer en beoordeel alleen wat in deze sessie aantoonbaar is afgerond.
      </p>
      <form action={completePreviousStageItemsAction} className="mt-4 space-y-3">
        <input name="enrollmentId" type="hidden" value={enrollmentId} />
        <input name="participantId" type="hidden" value={participantId} />
        <input name="operationId" type="hidden" value={crypto.randomUUID()} />
        <input name="next" type="hidden" value={nextPath} />
        {items.map((item) => (
          <section className="grid gap-3 rounded-xl border border-border bg-muted/25 p-4 lg:grid-cols-[auto_1fr_10rem_11rem]" key={item.carryover_id}>
            <input
              aria-label={`Selecteer ${item.item_name}`}
              className="mt-1 size-5 accent-primary"
              name="carryoverId"
              type="checkbox"
              value={item.carryover_id}
            />
            <div>
              <p className="font-bold text-foreground">{item.item_name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.from_stage_name} · laatste score {item.latest_rating ?? "nog niet beoordeeld"} · minimaal {item.mastery_threshold}
              </p>
              <Textarea
                aria-label={`Notitie bij ${item.item_name}`}
                className="mt-3"
                name={`note:${item.carryover_id}`}
                placeholder="Korte context bij afronding"
              />
            </div>
            <label className="grid content-start gap-1 text-xs font-bold text-muted-foreground">
              Beoordeling
              <NativeSelect defaultValue={String(item.mastery_threshold)} name={`rating:${item.carryover_id}`}>
                {[4, 5].filter((rating) => rating >= item.mastery_threshold).map((rating) => (
                  <option key={rating} value={rating}>{rating} / 5</option>
                ))}
              </NativeSelect>
            </label>
            <label className="grid content-start gap-1 text-xs font-bold text-muted-foreground">
              Zichtbaarheid
              <NativeSelect defaultValue="parent_visible" name={`visibility:${item.carryover_id}`}>
                <option value="parent_visible">Ouder zichtbaar</option>
                <option value="internal">Alleen intern</option>
              </NativeSelect>
            </label>
          </section>
        ))}
        <label className="grid gap-1 text-sm font-bold text-foreground" htmlFor={`carryover-reason-${participantId}`}>
          Reden voor bulkactie
          <Textarea id={`carryover-reason-${participantId}`} name="reason" required />
        </label>
        <Button type="submit">
          <CheckCircle2 className="size-4" />
          Geselecteerde onderdelen afronden
        </Button>
      </form>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function numberFrom(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
