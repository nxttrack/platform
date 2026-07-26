"use client";

import {
  AlertTriangle,
  Check,
  Info,
  LockKeyhole,
  Send,
  Sparkles
} from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { DirtyForm } from "@/components/ui/dirty-form";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle
} from "@/components/ui/sheet";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import {
  coachCommunication,
  reviewCommunicationProposal,
  type CommunicationCoachGoal,
  type CommunicationCoachInput
} from "@/lib/domain/communication-coach-contract";
import { createAdminMessageAction } from "@/lib/domain/admin-operations-actions";
import { cn } from "@/lib/utils";

const goals: Array<{
  description: string;
  label: string;
  value: CommunicationCoachGoal;
}> = [
  {
    value: "shorter",
    label: "Korter",
    description: "Verwijdert alleen veilige formele aanlopen."
  },
  {
    value: "clearer",
    label: "Duidelijker",
    description: "Verdeelt bestaande zinnen rustiger over alinea's."
  },
  {
    value: "warmer",
    label: "Warmer",
    description: "Voegt een passende begroeting en afsluiting toe."
  },
  {
    value: "simpler",
    label: "Eenvoudiger",
    description: "Vervangt een beperkte lijst formele woorden."
  },
  {
    value: "neutral",
    label: "Neutraler",
    description: "Past alleen bekende beschuldigende standaardzinnen aan."
  }
];

export function MessageComposer() {
  const formId = useId();
  const titleId = useId();
  const bodyId = useId();
  const audienceId = useId();
  const visibilityId = useId();
  const statusId = useId();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] =
    useState<CommunicationCoachInput["audience"]>("tenant_staff");
  const [visibility, setVisibility] =
    useState<CommunicationCoachInput["visibility"]>("internal");
  const [status, setStatus] =
    useState<CommunicationCoachInput["status"]>("draft");
  const [goal, setGoal] = useState<CommunicationCoachGoal>("clearer");
  const [coachOpen, setCoachOpen] = useState(false);
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalBody, setProposalBody] = useState("");
  const [coachReasons, setCoachReasons] = useState<string[]>([]);

  const coachInput = useMemo(
    () => ({ audience, body, goal, status, title, visibility }),
    [audience, body, goal, status, title, visibility]
  );
  const proposalReview = useMemo(
    () =>
      reviewCommunicationProposal(
        coachInput,
        { title: proposalTitle, body: proposalBody },
        coachReasons
      ),
    [coachInput, coachReasons, proposalBody, proposalTitle]
  );

  function generateProposal(nextGoal = goal) {
    const result = coachCommunication({ ...coachInput, goal: nextGoal });
    setGoal(nextGoal);
    setProposalTitle(result.proposal.title);
    setProposalBody(result.proposal.body);
    setCoachReasons(result.reasons);
  }

  function openCoach() {
    generateProposal();
    setCoachOpen(true);
  }

  function useProposal() {
    if (proposalReview.blocked || !proposalReview.changed) return;
    setTitle(proposalReview.proposal.title);
    setBody(proposalReview.proposal.body);
    setCoachOpen(false);
    requestAnimationFrame(() => {
      document
        .getElementById(formId)
        ?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  const deliverySummary =
    visibility === "internal"
      ? audience === "all_tenant"
        ? "Het bericht wordt intern gepubliceerd. Ouders worden uitgesloten van notificaties en e-mail."
        : audience === "parents"
          ? "Ouders kunnen een intern bericht niet openen. Ga terug en kies Portaal."
          : "Het bericht wordt intern gepubliceerd en kan de gekozen teamdoelgroep direct notificeren."
      : "Het bericht wordt gepubliceerd en kan de gekozen doelgroep direct een in-appnotificatie en e-mail sturen.";

  return (
    <>
      <DirtyForm
        action={createAdminMessageAction}
        className="grid gap-4"
        id={formId}
      >
        <Field>
          <FieldLabel htmlFor={titleId}>Titel</FieldLabel>
          <Input
            id={titleId}
            maxLength={180}
            name="title"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Nieuwe lesserie start maandag"
            required
            value={title}
          />
        </Field>
        <Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldLabel htmlFor={bodyId}>Bericht</FieldLabel>
            <Button
              aria-describedby={`${bodyId}-coach-help`}
              disabled={!body.trim()}
              onClick={openCoach}
              size="sm"
              type="button"
              variant="outline"
            >
              <Sparkles aria-hidden="true" className="size-4" />
              Communicatiecoach
            </Button>
          </div>
          <Textarea
            className="min-h-40 leading-6"
            id={bodyId}
            maxLength={4_000}
            name="body"
            onChange={(event) => setBody(event.target.value)}
            placeholder="Schrijf een kort en duidelijk bericht voor de gekozen doelgroep."
            required
            value={body}
          />
          <FieldDescription id={`${bodyId}-coach-help`}>
            De coach werkt lokaal met vaste taalregels. Tekst wordt niet naar
            een AI-dienst gestuurd.
          </FieldDescription>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={audienceId}>Doelgroep</FieldLabel>
            <NativeSelect
              id={audienceId}
              name="audience"
              onChange={(event) =>
                setAudience(
                  event.target.value as CommunicationCoachInput["audience"]
                )
              }
              value={audience}
            >
              <option value="tenant_staff">Team</option>
              <option value="instructors">Instructeurs</option>
              <option value="parents">Ouders</option>
              <option value="all_tenant">Iedereen</option>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor={visibilityId}>Zichtbaarheid</FieldLabel>
            <NativeSelect
              id={visibilityId}
              name="visibility"
              onChange={(event) =>
                setVisibility(
                  event.target.value as CommunicationCoachInput["visibility"]
                )
              }
              value={visibility}
            >
              <option value="internal">Intern</option>
              <option value="portal">Portaal</option>
            </NativeSelect>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={statusId}>Status</FieldLabel>
            <NativeSelect
              id={statusId}
              name="status"
              onChange={(event) =>
                setStatus(
                  event.target.value as CommunicationCoachInput["status"]
                )
              }
              value={status}
            >
              <option value="draft">Concept</option>
              <option value="published">Publiceren</option>
              <option value="archived">Archief</option>
            </NativeSelect>
          </Field>
        </div>

        {status === "published" ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button">
                <Send aria-hidden="true" className="size-4" />
                Publiceren controleren
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Bericht nu publiceren?</AlertDialogTitle>
                <AlertDialogDescription>
                  {deliverySummary} Controleer titel, inhoud, doelgroep en
                  zichtbaarheid voordat je doorgaat.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {audience === "parents" && visibility === "internal" ? (
                <p
                  className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning"
                  role="alert"
                >
                  Publiceren is niet zinvol: ouders kunnen dit interne bericht
                  niet openen.
                </p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button type="button" variant="outline">
                    Terug
                  </Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <button
                    className={buttonVariants()}
                    disabled={
                      audience === "parents" && visibility === "internal"
                    }
                    form={formId}
                    name="humanConfirmation"
                    type="submit"
                    value="confirmed"
                  >
                    Nu publiceren
                  </button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <SubmitButton>
            <span className="inline-flex items-center gap-2">
              <Send aria-hidden="true" className="size-4" />
              Bericht opslaan
            </span>
          </SubmitButton>
        )}
      </DirtyForm>

      <Sheet onOpenChange={setCoachOpen} open={coachOpen}>
        <SheetContent
          className="!w-screen max-w-none overflow-y-auto p-0 sm:!w-[min(94vw,700px)]"
          side="right"
        >
          <header className="sticky top-0 z-10 border-b border-border bg-card/95 px-5 py-4 pr-14 backdrop-blur sm:px-6">
            <SheetTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Sparkles aria-hidden="true" className="size-5 text-primary" />
              Communicatiecoach
            </SheetTitle>
            <SheetDescription className="mt-1 text-[13px] leading-5 text-muted-foreground">
              Regelgebaseerd en lokaal. Er wordt niets opgeslagen of
              verzonden.
            </SheetDescription>
          </header>

          <div className="grid gap-5 p-5 sm:p-6">
            <section
              aria-label="Coachstatus"
              className="grid gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:grid-cols-3"
            >
              <CoachMetric
                label="Classificatie"
                value={classificationLabel(
                  proposalReview.effectiveClassification
                )}
              />
              <CoachMetric
                label="Zekerheid"
                value={confidenceLabel(proposalReview.confidence)}
              />
              <CoachMetric
                label="Beschermde feiten"
                value={String(proposalReview.protectedFacts.length)}
              />
            </section>

            <section>
              <h3 className="text-sm font-bold text-foreground">
                Wat wil je verbeteren?
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {goals.map((option) => (
                  <button
                    aria-pressed={goal === option.value}
                    className={cn(
                      "rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      goal === option.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/60"
                    )}
                    key={option.value}
                    onClick={() => generateProposal(option.value)}
                    type="button"
                  >
                    <span className="flex items-center gap-2 text-sm font-bold">
                      {goal === option.value ? (
                        <Check
                          aria-hidden="true"
                          className="size-4 text-primary"
                        />
                      ) : null}
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {proposalReview.warnings.length > 0 ? (
              <section aria-label="Aandachtspunten" className="grid gap-2">
                <h3 className="text-sm font-bold text-foreground">
                  Aandachtspunten
                </h3>
                {proposalReview.warnings.map((warning) => (
                  <div
                    className={cn(
                      "flex gap-3 rounded-xl border px-3 py-2.5 text-sm",
                      warning.tone === "critical"
                        ? "border-danger/25 bg-danger/10 text-danger"
                        : warning.tone === "warning"
                          ? "border-warning/25 bg-warning/10 text-warning"
                          : "border-primary/20 bg-primary/5 text-foreground"
                    )}
                    key={warning.code}
                    role={warning.blocksUse ? "alert" : "status"}
                  >
                    {warning.tone === "info" ? (
                      <Info
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0"
                      />
                    ) : (
                      <AlertTriangle
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0"
                      />
                    )}
                    <p className="leading-5">{warning.message}</p>
                  </div>
                ))}
              </section>
            ) : null}

            <section className="grid gap-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Bewerkbaar voorstel
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Handmatige wijzigingen worden opnieuw gecontroleerd voordat
                  je ze op het concept toepast.
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor={`${titleId}-proposal`}>
                  Voorgestelde titel
                </FieldLabel>
                <Input
                  id={`${titleId}-proposal`}
                  maxLength={180}
                  onChange={(event) => setProposalTitle(event.target.value)}
                  value={proposalTitle}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${bodyId}-proposal`}>
                  Voorgesteld bericht
                </FieldLabel>
                <Textarea
                  className="min-h-52 leading-6"
                  id={`${bodyId}-proposal`}
                  maxLength={4_000}
                  onChange={(event) => setProposalBody(event.target.value)}
                  value={proposalBody}
                />
              </Field>
            </section>

            {coachReasons.length > 0 ? (
              <section className="rounded-xl border border-border p-4">
                <h3 className="text-sm font-bold text-foreground">
                  Waarom dit voorstel?
                </h3>
                <ul className="mt-2 grid gap-1.5 text-sm leading-5 text-muted-foreground">
                  {coachReasons.map((reason) => (
                    <li className="flex gap-2" key={reason}>
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-success"
                      />
                      {reason}
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <p
                className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground"
                role="status"
              >
                Voor deze keuze is geen veilige automatische verbetering
                gevonden. Je oorspronkelijke tekst blijft behouden.
              </p>
            )}

            {proposalReview.protectedFacts.length > 0 ? (
              <details className="rounded-xl border border-border p-4">
                <summary className="cursor-pointer text-sm font-bold text-foreground">
                  Beschermde feiten bekijken
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {proposalReview.protectedFacts.map((fact) => (
                    <code
                      className="rounded-md bg-muted px-2 py-1 text-xs text-foreground"
                      key={fact}
                    >
                      {fact}
                    </code>
                  ))}
                </div>
              </details>
            ) : null}

            <footer className="sticky bottom-0 -mx-5 -mb-5 flex flex-col-reverse gap-2 border-t border-border bg-card/95 p-4 backdrop-blur sm:-mx-6 sm:-mb-6 sm:flex-row sm:justify-end">
              <SheetClose asChild>
                <Button type="button" variant="outline">
                  Terug zonder wijzigen
                </Button>
              </SheetClose>
              <Button
                disabled={proposalReview.blocked || !proposalReview.changed}
                onClick={useProposal}
                type="button"
              >
                {proposalReview.blocked ? (
                  <LockKeyhole aria-hidden="true" className="size-4" />
                ) : (
                  <Check aria-hidden="true" className="size-4" />
                )}
                Toepassen op concept
              </Button>
            </footer>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function CoachMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function classificationLabel(value: string) {
  return (
    {
      operational: "Operationeel",
      personal: "Persoonlijk",
      sensitive: "Gevoelig",
      restricted: "Beperkt"
    }[value] ?? value
  );
}

function confidenceLabel(value: string) {
  return (
    {
      high: "Hoog",
      medium: "Gemiddeld",
      low: "Laag"
    }[value] ?? value
  );
}
