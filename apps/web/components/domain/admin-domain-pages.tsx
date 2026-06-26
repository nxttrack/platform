import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, CircleDollarSign, Database, MapPin, Users, Waves } from "lucide-react";

import { AdminActionForm, AdminSubmitButton } from "@/components/admin/action-form";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { AdminTableEnhancer } from "@/components/admin/table-enhancer";
import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import type {
  AdminDomainData,
  AdminDomainSnapshot,
  AchievementCardRow,
  BadgeAwardRow,
  BadgeRecommendationRow,
  BadgeRuleRow,
  BadgeRow,
  EnrollmentRow,
  FlowThroughEventRow,
  FlowThroughRecommendationRow,
  FlowThroughTargetOptionRow,
  GroupMembershipRow,
  GroupRow,
  InstructorRow,
  ParticipantRow,
  ProgramRow,
  ResourceRow,
  SessionRow,
  QuickAssessmentTemplateRow,
  StageProgressCriteriaRow,
  StageModuleProgressRow,
  StageModuleRow,
  StageTransitionProposalRow,
  StageRow,
  SubscriptionPlanRow
} from "@/lib/domain/admin-domain-read-model";
import {
  createFlowThroughRecommendationAction,
  createEnrollmentAction,
  createGroupAction,
  createGroupMembershipAction,
  createInstructorAction,
  createParticipantAction,
  createProgramAction,
  createQuickAssessmentTemplateAction,
  createResourceAction,
  createSessionAction,
  createStageModuleAction,
  createStageProgressCriteriaAction,
  createStageAction,
  createBadgeRuleAction,
  createSubscriptionPlanAction,
  reviewFlowThroughRecommendationAction,
  reviewStageTransitionProposalAction,
  transitionEnrollmentStatusAction,
  transitionGroupMembershipStatusAction,
  transitionGroupStatusAction,
  transitionInstructorStatusAction,
  transitionParticipantStatusAction,
  transitionSessionStatusAction,
  updateEnrollmentAction,
  updateGroupAction,
  updateGroupMembershipAction,
  updateInstructorAction,
  updateParticipantAction,
  updateProgramAction,
  updateResourceAction,
  updateSessionAction,
  updateStageAction,
  updateStageModuleAction,
  updateSubscriptionPlanAction
} from "@/lib/domain/admin-domain-actions";

type DomainPageProps = {
  snapshot: AdminDomainSnapshot;
};

type LookupMaps = {
  programs: Map<string, ProgramRow>;
  stages: Map<string, StageRow>;
  subscriptionPlans: Map<string, SubscriptionPlanRow>;
  resources: Map<string, ResourceRow>;
  instructors: Map<string, InstructorRow>;
  groups: Map<string, GroupRow>;
  participants: Map<string, ParticipantRow>;
  enrollments: Map<string, EnrollmentRow>;
  stageModules: Map<string, StageModuleRow>;
  badges: Map<string, BadgeRow>;
};

type Column<Row> = {
  header: string;
  render: (row: Row) => ReactNode;
  className?: string;
};

export function AdminDomainHome({ snapshot }: DomainPageProps) {
  const { data } = snapshot;
  const activeEnrollments = data.enrollments.filter((enrollment) => enrollment.status === "active").length;
  const scheduledSessions = data.sessions.filter((session) => session.status === "scheduled").length;

  return (
    <DomainFrame
      snapshot={snapshot}
      kicker="Backoffice - beheer"
      title="Basisbeheer"
      subtitle="Beperkte CRUD op de generieke NXTTRACK kern: aanbod, niveaus, groepen, lessen, resources, inschrijvingen en begeleiding."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Waves className="h-5 w-5" />} label="Programma's" value={data.programs.length.toString()} detail={`${data.stages.length} niveaus`} />
        <MetricCard icon={<Users className="h-5 w-5" />} label="Groepen" value={data.groups.length.toString()} detail={`${activeEnrollments} actieve inschrijvingen`} />
        <MetricCard icon={<CalendarDays className="h-5 w-5" />} label="Lessen" value={scheduledSessions.toString()} detail="ingepland" />
        <MetricCard icon={<MapPin className="h-5 w-5" />} label="Locaties" value={data.resources.length.toString()} detail={`${data.instructors.length} instructeurs`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Kernmodel</h2>
              <p className="text-sm text-muted-foreground">Leerprogressie en betalingen blijven bewust van elkaar gescheiden.</p>
            </div>
            <StatusPill tone="info">Beperkt beheer</StatusPill>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["Programma", "Het aangeboden product of leertraject."],
              ["Niveau", "Het actuele niveau binnen een programma, zoals Badje 1."],
              ["Groep", "De terugkerende lesgroep met tijd, locatie en instructeur."],
              ["Les", "Een concreet lesmoment op basis van een groep."],
              ["Inschrijving", "De deelname van een leerling aan een programma."],
              ["Abonnement", "Facturatie en frequentie; staat los van niveau of badje."]
            ].map(([term, description]) => (
              <div key={term} className="rounded-2xl border border-border bg-muted/40 p-4">
                <p className="text-sm font-bold">{term}</p>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <CircleDollarSign className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Abonnement blijft los</h2>
              <p className="text-sm text-muted-foreground">Een leerling kan van badje wisselen zonder facturatiewijziging.</p>
            </div>
          </div>
          <DomainTable
            columns={[
              { header: "Plan", render: (plan) => <StrongText>{plan.name}</StrongText> },
              { header: "Frequentie", render: (plan) => `${formatNumber(plan.lesson_frequency_per_week)}x p/w` },
              { header: "Prijs", render: (plan) => formatMoney(plan.price_cents, plan.currency) }
            ]}
            emptyLabel="Nog geen subscription plans gevonden."
            rows={data.subscriptionPlans}
            rowKey={(plan) => plan.id}
          />
        </Card>
      </div>
    </DomainFrame>
  );
}

export function AdminProgramsPage({ snapshot }: DomainPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <DomainFrame snapshot={snapshot} kicker="Backoffice - aanbod" title="Programma's" subtitle="Het aangeboden product of leertraject. Niveaus en abonnementen blijven los gekoppeld aan de inschrijving.">
      <AdminTabs
        tabs={[
          {
            id: "programmas",
            label: "Programma's",
            count: snapshot.data.programs.length,
            children: (
              <Card>
                <SectionHeader title="Programma's" count={snapshot.data.programs.length} />
                <CreateProgramForm />
                <DomainTable
                  columns={[
                    { header: "Naam", render: (program) => <StrongText>{program.name}</StrongText> },
                    { header: "Code", render: (program) => <CodeText>{program.code}</CodeText> },
                    { header: "Niveaus", render: (program) => countBy(snapshot.data.stages, "program_id", program.id) },
                    { header: "Status", render: (program) => <StatusPill tone={statusTone(program.status)}>{program.status}</StatusPill> },
                    { header: "Actie", className: "min-w-[320px] whitespace-normal", render: (program) => <ProgramForm mode="update" program={program} /> }
                  ]}
                  emptyLabel="Nog geen programma's gevonden voor deze tenant."
                  rows={snapshot.data.programs}
                  rowKey={(program) => program.id}
                />
              </Card>
            )
          },
          {
            id: "abonnementen",
            label: "Abonnementen",
            count: snapshot.data.subscriptionPlans.length,
            children: (
              <Card>
                <SectionHeader title="Abonnementen" count={snapshot.data.subscriptionPlans.length} />
                <CreateSubscriptionPlanForm />
                <DomainTable
                  columns={[
                    { header: "Plan", render: (plan) => <StrongText>{plan.name}</StrongText> },
                    { header: "Facturatie", render: (plan) => billingIntervalLabel(plan.billing_interval) },
                    { header: "Prijs", render: (plan) => formatMoney(plan.price_cents, plan.currency) },
                    { header: "Actie", className: "min-w-[320px] whitespace-normal", render: (plan) => <SubscriptionPlanForm mode="update" plan={plan} /> }
                  ]}
                  emptyLabel="Nog geen abonnementen gevonden."
                  rows={snapshot.data.subscriptionPlans}
                  rowKey={(plan) => plan.id}
                />
              </Card>
            )
          },
          {
            id: "niveaus",
            label: "Niveaus",
            count: snapshot.data.stages.length,
            children: (
              <Card>
                <SectionHeader title="Niveaus per programma" count={snapshot.data.stages.length} />
                <DomainTable
                  columns={[
                    { header: "Niveau", render: (stage) => <StrongText>{stage.name}</StrongText> },
                    { header: "Programma", render: (stage) => lookups.programs.get(stage.program_id)?.name ?? "Onbekend programma" },
                    { header: "Code", render: (stage) => <CodeText>{stage.code}</CodeText> },
                    { header: "Status", render: (stage) => <StatusPill tone={statusTone(stage.status)}>{stage.status}</StatusPill> }
                  ]}
                  emptyLabel="Nog geen niveaus gevonden."
                  rows={snapshot.data.stages}
                  rowKey={(stage) => stage.id}
                />
              </Card>
            )
          }
        ]}
      />
    </DomainFrame>
  );
}

export function AdminStagesPage({ snapshot }: DomainPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <DomainFrame snapshot={snapshot} kicker="Backoffice - voortgang" title="Niveaus" subtitle="Niveaus beschrijven alleen leerprogressie binnen een programma. Ze bevatten geen prijs, facturatie of abonnement.">
      <Card>
        <SectionHeader title="Niveaus" count={snapshot.data.stages.length} />
        <CreateStageForm programs={snapshot.data.programs} />
        <DomainTable
          columns={[
            { header: "Niveau", render: (stage) => <StrongText>{stage.name}</StrongText> },
            { header: "Programma", render: (stage) => lookups.programs.get(stage.program_id)?.name ?? "Onbekend programma" },
            { header: "Code", render: (stage) => <CodeText>{stage.code}</CodeText> },
            { header: "Volgorde", render: (stage) => stage.sort_order },
            { header: "Status", render: (stage) => <StatusPill tone={statusTone(stage.status)}>{stage.status}</StatusPill> },
            { header: "Actie", className: "min-w-[320px] whitespace-normal", render: (stage) => <StageForm mode="update" programs={snapshot.data.programs} stage={stage} /> }
          ]}
          emptyLabel="Nog geen niveaus gevonden voor deze tenant."
          rows={snapshot.data.stages}
          rowKey={(stage) => stage.id}
        />
      </Card>
    </DomainFrame>
  );
}

export function AdminBadgesPage({ snapshot }: DomainPageProps) {
  const lookups = buildLookups(snapshot.data);
  const flowByProposal = new Map(snapshot.data.flowThroughRecommendations.map((recommendation) => [recommendation.stage_transition_proposal_id, recommendation]));
  const flowOptionsByRecommendation = groupBy(snapshot.data.flowThroughTargetOptions, "recommendation_id");
  const flowEventsByRecommendation = groupBy(snapshot.data.flowThroughEvents, "recommendation_id");
  const openTransitions = snapshot.data.stageTransitionProposals.filter((proposal) => ["proposed", "approved"].includes(proposal.status));
  const completedModules = snapshot.data.stageModuleProgress.filter((progress) => progress.status === "passed").length;

  return (
    <DomainFrame
      snapshot={snapshot}
      kicker="Backoffice - prestaties"
      title="Prestaties en doorstroom"
      subtitle="Badge-definities, module-progress, achievement cards en stage-overgangen. Doorstroom wijzigt alleen het niveau, niet het abonnement of betaalplan."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Database className="h-5 w-5" />} label="Modules" value={snapshot.data.stageModules.length.toString()} detail={`${completedModules} behaald`} />
        <MetricCard icon={<Waves className="h-5 w-5" />} label="Badges" value={snapshot.data.badgeAwards.length.toString()} detail={`${snapshot.data.badges.length} definities`} />
        <MetricCard icon={<Users className="h-5 w-5" />} label="Aanbevelingen" value={snapshot.data.badgeRecommendations.length.toString()} detail="smart badge advies" />
        <MetricCard icon={<CalendarDays className="h-5 w-5" />} label="Doorstroom" value={openTransitions.length.toString()} detail={`${snapshot.data.flowThroughRecommendations.length} smart adviezen`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <SectionHeader title="Modules en rubrics" count={snapshot.data.stageModules.length} />
          <CreateStageModuleForm data={snapshot.data} />
          <DomainTable<StageModuleRow>
            columns={[
              { header: "Module", render: (module) => <StrongText>{module.name}</StrongText> },
              { header: "Niveau", render: (module) => lookups.stages.get(module.stage_id)?.name ?? "-" },
              { header: "Schaal", render: (module) => module.assessment_scale },
              { header: "Evidence", render: (module) => <StatusPill tone={module.evidence_required ? "warning" : "neutral"}>{module.evidence_required ? "verplicht" : "optioneel"}</StatusPill> },
              { header: "Actie", className: "min-w-[340px] whitespace-normal", render: (module) => <StageModuleForm data={snapshot.data} mode="update" module={module} /> }
            ]}
            emptyLabel="Nog geen stage modules gevonden."
            rows={snapshot.data.stageModules}
            rowKey={(module) => module.id}
          />
        </Card>

        <Card>
          <SectionHeader title="Doorstroomcriteria" count={snapshot.data.stageProgressCriteria.length} />
          <CreateStageProgressCriteriaForm data={snapshot.data} />
          <DomainTable<StageProgressCriteriaRow>
            columns={[
              { header: "Criteria", render: (criteria) => <StrongText>{criteria.name}</StrongText> },
              { header: "Niveau", render: (criteria) => lookups.stages.get(criteria.stage_id)?.name ?? "-" },
              { header: "Modules", render: (criteria) => criteria.required_modules },
              { header: "Score", render: (criteria) => (criteria.required_score === null ? "-" : `${criteria.required_score}%`) },
              { header: "Status", render: (criteria) => <StatusPill tone={statusTone(criteria.status)}>{criteria.status}</StatusPill> }
            ]}
            emptyLabel="Nog geen criteria gevonden."
            rows={snapshot.data.stageProgressCriteria}
            rowKey={(criteria) => criteria.id}
          />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <SectionHeader title="Quick assessment templates" count={snapshot.data.quickAssessmentTemplates.length} />
          <CreateQuickAssessmentTemplateForm data={snapshot.data} />
          <DomainTable<QuickAssessmentTemplateRow>
            columns={[
              { header: "Template", render: (template) => <StrongText>{template.name}</StrongText> },
              { header: "Module", render: (template) => (template.stage_module_id ? (lookups.stageModules.get(template.stage_module_id)?.name ?? "-") : "-") },
              { header: "Default", render: (template) => `${template.default_status}${template.default_score === null ? "" : ` ${template.default_score}%`}` },
              { header: "Prompt", className: "min-w-[240px] whitespace-normal", render: (template) => nullableText(template.instructor_prompt) }
            ]}
            emptyLabel="Nog geen quick templates gevonden."
            rows={snapshot.data.quickAssessmentTemplates}
            rowKey={(template) => template.id}
          />
        </Card>

        <Card>
          <SectionHeader title="Badge rules" count={snapshot.data.badgeRules.length} />
          <CreateBadgeRuleForm data={snapshot.data} />
          <DomainTable<BadgeRuleRow>
            columns={[
              { header: "Rule", render: (rule) => <StrongText>{rule.name}</StrongText> },
              { header: "Badge", render: (rule) => lookups.badges.get(rule.badge_id)?.name ?? "-" },
              { header: "Trigger", render: (rule) => rule.trigger_type },
              { header: "Drempel", render: (rule) => (rule.min_score === null ? "-" : `${rule.min_score}%`) },
              { header: "Approval", render: (rule) => rule.approval_role },
              { header: "Status", render: (rule) => <StatusPill tone={statusTone(rule.status)}>{rule.status}</StatusPill> }
            ]}
            emptyLabel="Nog geen badge rules gevonden."
            rows={snapshot.data.badgeRules}
            rowKey={(rule) => rule.id}
          />
        </Card>
      </div>

      <Card>
        <SectionHeader title="Badge-aanbevelingen" count={snapshot.data.badgeRecommendations.length} />
        <DomainTable<BadgeRecommendationRow>
          columns={[
            { header: "Leerling", render: (recommendation) => lookups.participants.get(recommendation.participant_id)?.display_name ?? "Onbekend" },
            { header: "Badge", render: (recommendation) => lookups.badges.get(recommendation.badge_id)?.name ?? "Badge" },
            { header: "Score", render: (recommendation) => (recommendation.score === null ? "-" : `${recommendation.score}%`) },
            { header: "Confidence", render: (recommendation) => recommendation.confidence },
            { header: "Redenen", className: "min-w-[260px] whitespace-normal", render: (recommendation) => recommendation.reasons.map((reason) => String(reason.label ?? reason.code ?? "reden")).join(", ") || "-" },
            { header: "Status", render: (recommendation) => <StatusPill tone={statusTone(recommendation.status)}>{recommendation.status}</StatusPill> }
          ]}
          emptyLabel="Nog geen smart badge-aanbevelingen gevonden."
          rows={snapshot.data.badgeRecommendations}
          rowKey={(recommendation) => recommendation.id}
        />
      </Card>

      <Card>
        <SectionHeader title="Doorstroomvoorstellen" count={snapshot.data.stageTransitionProposals.length} />
        <DomainTable<StageTransitionProposalRow>
          columns={[
            { header: "Leerling", render: (proposal) => lookups.participants.get(proposal.participant_id)?.display_name ?? "Onbekend" },
            {
              header: "Van naar",
              className: "min-w-[240px] whitespace-normal",
              render: (proposal) =>
                `${proposal.from_stage_id ? (lookups.stages.get(proposal.from_stage_id)?.name ?? "Huidige stage") : "Geen stage"} -> ${lookups.stages.get(proposal.to_stage_id)?.name ?? "Nieuwe stage"}`
            },
            { header: "Reden", className: "min-w-[280px] whitespace-normal", render: (proposal) => nullableText(proposal.reason) },
            { header: "Status", render: (proposal) => <StatusPill tone={statusTone(proposal.status)}>{proposal.status}</StatusPill> },
            { header: "Voorgesteld", render: (proposal) => formatDateTime(proposal.proposed_at) },
            {
              header: "Besluit",
              className: "min-w-[420px] whitespace-normal",
              render: (proposal) => <StageTransitionReviewForm proposal={proposal} recommendation={flowByProposal.get(proposal.id) ?? null} />
            }
          ]}
          emptyLabel="Geen doorstroomvoorstellen gevonden."
          rows={snapshot.data.stageTransitionProposals}
          rowKey={(proposal) => proposal.id}
        />
        <div className="mt-4 rounded-2xl border border-border bg-muted/35 p-4 text-sm leading-6 text-muted-foreground">
          Toepassen zet alleen de huidige stage op de enrollment om. Subscription plan, facturatie en betaalstatus blijven bewust los van badje/niveau.
        </div>
      </Card>

      <Card>
        <SectionHeader title="Flow-through engine" count={snapshot.data.flowThroughRecommendations.length} />
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
          Doorstroomadvies kan een targetgroep vasthouden, de oude plek vrijgeven en de wachtlijst opnieuw laten matchen. Het abonnement blijft hier altijd ongewijzigd.
        </div>
        {snapshot.data.flowThroughRecommendations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
            Nog geen flow-through adviezen. Maak er een vanuit een doorstroomvoorstel hierboven.
          </div>
        ) : (
          <div className="grid gap-4">
            {snapshot.data.flowThroughRecommendations.map((recommendation) => (
              <FlowThroughRecommendationPanel
                key={recommendation.id}
                events={flowEventsByRecommendation.get(recommendation.id) ?? []}
                lookups={lookups}
                options={flowOptionsByRecommendation.get(recommendation.id) ?? []}
                recommendation={recommendation}
              />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader title="Module-progress" count={snapshot.data.stageModuleProgress.length} />
        <DomainTable<StageModuleProgressRow>
          columns={[
            { header: "Leerling", render: (progress) => lookups.participants.get(progress.participant_id)?.display_name ?? "Onbekend" },
            { header: "Module", render: (progress) => lookups.stageModules.get(progress.stage_module_id)?.name ?? "Module" },
            { header: "Niveau", render: (progress) => lookups.stages.get(progress.stage_id)?.name ?? "-" },
            { header: "Score", render: (progress) => (progress.score === null ? "-" : `${progress.score}%`) },
            { header: "Status", render: (progress) => <StatusPill tone={statusTone(progress.status)}>{progress.status}</StatusPill> },
            { header: "Notitie", className: "min-w-[260px] whitespace-normal", render: (progress) => nullableText(progress.note) },
            { header: "Datum", render: (progress) => formatDateTime(progress.assessed_at) }
          ]}
          emptyLabel="Nog geen module-progress geregistreerd."
          rows={snapshot.data.stageModuleProgress}
          rowKey={(progress) => progress.id}
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <SectionHeader title="Achievement cards" count={snapshot.data.achievementCards.length} />
          <DomainTable<AchievementCardRow>
            columns={[
              { header: "Titel", className: "min-w-[220px] whitespace-normal", render: (card) => <StrongText>{card.title}</StrongText> },
              { header: "Leerling", render: (card) => lookups.participants.get(card.participant_id)?.display_name ?? "Onbekend" },
              { header: "Type", render: (card) => <StatusPill tone={card.card_type === "badge" ? "success" : "info"}>{card.card_type}</StatusPill> },
              { header: "Zichtbaarheid", render: (card) => card.visibility },
              { header: "Status", render: (card) => <StatusPill tone={statusTone(card.status)}>{card.status}</StatusPill> },
              { header: "Gepubliceerd", render: (card) => formatDateTime(card.published_at) }
            ]}
            emptyLabel="Nog geen achievement cards gepubliceerd."
            rows={snapshot.data.achievementCards}
            rowKey={(card) => card.id}
          />
        </Card>

        <Card>
          <SectionHeader title="Badge-toekenningen" count={snapshot.data.badgeAwards.length} />
          <DomainTable<BadgeAwardRow>
            columns={[
              { header: "Badge", render: (award) => lookups.badges.get(award.badge_id)?.name ?? "Badge" },
              { header: "Leerling", render: (award) => lookups.participants.get(award.participant_id)?.display_name ?? "Onbekend" },
              { header: "Bron", render: (award) => award.source },
              { header: "Notitie", className: "min-w-[220px] whitespace-normal", render: (award) => nullableText(award.note) },
              { header: "Status", render: (award) => <StatusPill tone={statusTone(award.status)}>{award.status}</StatusPill> },
              { header: "Datum", render: (award) => formatDateTime(award.awarded_at) }
            ]}
            emptyLabel="Nog geen badges toegekend."
            rows={snapshot.data.badgeAwards}
            rowKey={(award) => award.id}
          />
        </Card>
      </div>

      <Card>
        <SectionHeader title="Badge-definities" count={snapshot.data.badges.length} />
        <DomainTable<BadgeRow>
          columns={[
            { header: "Badge", render: (badge) => <StrongText>{badge.name}</StrongText> },
            { header: "Code", render: (badge) => <CodeText>{badge.code}</CodeText> },
            { header: "Programma", render: (badge) => nullableText(lookups.programs.get(badge.program_id ?? "")?.name) },
            { header: "Niveau", render: (badge) => nullableText(lookups.stages.get(badge.stage_id ?? "")?.name) },
            { header: "Beschrijving", className: "min-w-[260px] whitespace-normal", render: (badge) => nullableText(badge.description) },
            { header: "Status", render: (badge) => <StatusPill tone={statusTone(badge.status)}>{badge.status}</StatusPill> }
          ]}
          emptyLabel="Nog geen badge-definities gevonden."
          rows={snapshot.data.badges}
          rowKey={(badge) => badge.id}
        />
      </Card>
    </DomainFrame>
  );
}

function StageTransitionReviewForm({ proposal, recommendation }: { proposal: StageTransitionProposalRow; recommendation: FlowThroughRecommendationRow | null }) {
  return (
    <div className="grid gap-2">
      {recommendation ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">
          Smart advies: {recommendation.score === null ? "-" : `${formatNumber(recommendation.score)}%`} · {recommendation.confidence} · {recommendation.status}
        </div>
      ) : (
        <AdminActionForm action={createFlowThroughRecommendationAction} className="grid gap-2" successMessage="Slim doorstroomadvies aangemaakt.">
          <input name="stage_transition_proposal_id" type="hidden" value={proposal.id} />
          <AdminSubmitButton className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90">
            Maak slim advies
          </AdminSubmitButton>
        </AdminActionForm>
      )}
      <AdminActionForm action={reviewStageTransitionProposalAction} className="flex flex-wrap gap-2" successMessage="Doorstroomstatus bijgewerkt.">
        <input name="id" type="hidden" value={proposal.id} />
        <button className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-60" name="decision" type="submit" value="approved">
          Alleen voorstel goedkeuren
        </button>
        <button className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60" name="decision" type="submit" value="rejected">
          Afwijzen
        </button>
      </AdminActionForm>
    </div>
  );
}

function FlowThroughRecommendationPanel({
  events,
  lookups,
  options,
  recommendation
}: {
  events: FlowThroughEventRow[];
  lookups: LookupMaps;
  options: FlowThroughTargetOptionRow[];
  recommendation: FlowThroughRecommendationRow;
}) {
  const participant = lookups.participants.get(recommendation.participant_id);
  const fromStage = recommendation.from_stage_id ? lookups.stages.get(recommendation.from_stage_id) : null;
  const toStage = lookups.stages.get(recommendation.to_stage_id);
  const targetGroup = recommendation.target_group_id ? lookups.groups.get(recommendation.target_group_id) : null;
  const targetOptions = options.map((option) => {
    const group = lookups.groups.get(option.group_id);
    const label = `${group?.name ?? "Groep"} · ${option.score === null ? "-" : `${formatNumber(option.score)}%`} · ${capacityValue(option.capacity_snapshot, "open_spots")}/${capacityValue(option.capacity_snapshot, "capacity_limit")} vrij`;

    return { label, value: option.group_id };
  });

  return (
    <div className="rounded-3xl border border-border bg-muted/20 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">{participant?.display_name ?? "Onbekende leerling"}</h3>
          <p className="text-sm text-muted-foreground">
            {fromStage?.name ?? "Huidige stage"} → {toStage?.name ?? "Volgende stage"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={statusTone(recommendation.status)}>{recommendation.status}</StatusPill>
          <StatusPill tone={recommendation.confidence === "high" ? "success" : recommendation.confidence === "medium" ? "info" : "warning"}>
            {recommendation.score === null ? "-" : `${formatNumber(recommendation.score)}%`} · {recommendation.confidence}
          </StatusPill>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="grid gap-3">
          <div className="rounded-2xl border border-border bg-card p-3">
            <p className="text-xs font-bold uppercase text-muted-foreground">Advies</p>
            <p className="mt-2 text-sm font-semibold">{targetGroup ? targetGroup.name : "Nog geen doelgroep gekozen"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Start {recommendation.target_start_on ? formatDate(recommendation.target_start_on) : "-"} · oude plek vrij {recommendation.old_spot_release_on ? formatDate(recommendation.old_spot_release_on) : "-"}
            </p>
            <p className="mt-2 text-sm font-semibold text-emerald-700">Abonnement/betaling blijft ongewijzigd.</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <p className="text-xs font-bold uppercase text-muted-foreground">Waarom</p>
            <JsonList items={recommendation.reasons} />
            {recommendation.blockers.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-bold uppercase text-red-600">Blokkades</p>
                <JsonList items={recommendation.blockers} tone="danger" />
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="grid gap-2">
            {options.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">Geen doelgroepopties gevonden.</div>
            ) : (
              options.map((option) => {
                const group = lookups.groups.get(option.group_id);

                return (
                  <div key={option.id} className="rounded-2xl border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{group?.name ?? "Groep"}</p>
                        <p className="text-xs text-muted-foreground">
                          {group ? `${weekdayLabel(group.weekday)} ${formatTime(group.starts_at)}-${formatTime(group.ends_at)}` : "Moment onbekend"} · {capacityValue(option.capacity_snapshot, "open_spots")}/{capacityValue(option.capacity_snapshot, "capacity_limit")} vrij
                        </p>
                      </div>
                      <StatusPill tone={option.status === "candidate" ? "success" : "warning"}>{option.status}</StatusPill>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{jsonSummary(option.reasons)}</p>
                  </div>
                );
              })
            )}
          </div>

          <AdminActionForm action={reviewFlowThroughRecommendationAction} className="grid gap-3 rounded-2xl border border-border bg-card p-3" successMessage="Doorstroombesluit verwerkt.">
            <input name="id" type="hidden" value={recommendation.id} />
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField defaultValue={recommendation.target_group_id} includeEmpty label="Targetgroep" name="target_group_id" options={targetOptions} />
              <TextField defaultValue={recommendation.old_spot_release_on ?? todayInput()} label="Oude plek vrij op" name="old_spot_release_on" type="date" />
              <TextField defaultValue={recommendation.target_start_on ?? todayInput()} label="Nieuwe startdatum" name="target_start_on" type="date" />
              <TextField label="Reden / override" name="decision_note" placeholder="Verplicht bij afwijzen, uitstellen of andere doelgroep" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-60" name="decision" type="submit" value="approve_transition">
                Alleen niveau toepassen
              </button>
              <button className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90 disabled:opacity-60" name="decision" type="submit" value="approve_with_group">
                Niveau + groep toepassen
              </button>
              <button className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-60" name="decision" type="submit" value="postpone">
                Uitstellen
              </button>
              <button className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60" name="decision" type="submit" value="reject">
                Afwijzen
              </button>
            </div>
          </AdminActionForm>
        </div>
      </div>

      {events.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {events.slice(0, 6).map((event) => (
            <span key={event.id} className="rounded-full border border-border bg-card px-3 py-1">
              {event.event_type} · {formatDateTime(event.created_at)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AdminGroupsPage({ snapshot }: DomainPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <DomainFrame snapshot={snapshot} kicker="Backoffice - planning" title="Groepen" subtitle="Terugkerende lesgroepen met programma, niveau, locatie, instructeur, tijdslot en capaciteit.">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHeader title="Groepen" count={snapshot.data.groups.length} />
          <ExportLink href="/api/admin-exports/groups/download">Groepen CSV</ExportLink>
        </div>
        <CreateGroupForm data={snapshot.data} />
        <DomainCompactList
          details={(group) => (
            <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <ActionPanel title="Status wijzigen">
                <StatusTransitionButtons action={transitionGroupStatusAction} id={group.id} statuses={["draft", "active", "paused", "archived"]} />
              </ActionPanel>
              <ActionPanel title="Groep bewerken">
                <GroupForm data={snapshot.data} group={group} mode="update" />
              </ActionPanel>
            </div>
          )}
          emptyLabel="Nog geen groepen gevonden voor deze tenant."
          headers={["Groep", "Planning", "Bezetting", "Status"]}
          rows={snapshot.data.groups}
          rowKey={(group) => group.id}
          summary={(group) => [
            <div key="group">
              <DetailLink href={`/admin/groups/${group.id}`}>{group.name}</DetailLink>
              <p className="text-xs text-muted-foreground">{lookups.programs.get(group.program_id)?.name ?? "Onbekend"} · {lookups.stages.get(group.stage_id)?.name ?? "Onbekend"}</p>
            </div>,
            <div key="planning">
              <StrongText>{weekdayLabel(group.weekday)} {formatTime(group.starts_at)}-{formatTime(group.ends_at)}</StrongText>
              <p className="text-xs text-muted-foreground">{nullableText(lookups.resources.get(group.resource_id ?? "")?.name)} · {nullableText(lookups.instructors.get(group.instructor_id ?? "")?.display_name)}</p>
            </div>,
            <div key="capacity">
              <StrongText>{group.capacity}</StrongText>
              <p className="text-xs text-muted-foreground">{group.reserved_spots} reserve / {group.trial_spots} proef / {group.makeup_spots} inhaal</p>
            </div>,
            <StatusPill key="status" tone={statusTone(group.status)}>{group.status}</StatusPill>
          ]}
        />
      </Card>
    </DomainFrame>
  );
}

export function AdminSessionsPage({ snapshot }: DomainPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <DomainFrame snapshot={snapshot} kicker="Backoffice - lessen" title="Lessen" subtitle="Concrete lesmomenten die uit groepen voortkomen. De lijst blijft beperkt tot de eerste 25 records.">
      <Card>
        <SectionHeader title="Lessen" count={snapshot.data.sessions.length} />
        <CreateSessionForm data={snapshot.data} />
        <DomainCompactList
          details={(session) => (
            <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <ActionPanel title="Status wijzigen">
                <StatusTransitionButtons action={transitionSessionStatusAction} id={session.id} statuses={["scheduled", "completed", "cancelled"]} />
              </ActionPanel>
              <ActionPanel title="Les bewerken">
                <SessionForm data={snapshot.data} mode="update" session={session} />
              </ActionPanel>
            </div>
          )}
          emptyLabel="Nog geen lessen gevonden voor deze tenant."
          headers={["Datum", "Groep", "Locatie", "Status"]}
          rows={snapshot.data.sessions}
          rowKey={(session) => session.id}
          summary={(session) => [
            <div key="date">
              <DetailLink href={`/admin/sessions/${session.id}`}>{formatDateTime(session.starts_at)}</DetailLink>
              <p className="text-xs text-muted-foreground">{formatDateTimeTime(session.starts_at)}-{formatDateTimeTime(session.ends_at)}</p>
            </div>,
            <StrongText key="group">{lookups.groups.get(session.group_id)?.name ?? "Onbekende groep"}</StrongText>,
            <div key="location">
              <StrongText>{nullableText(lookups.resources.get(session.resource_id ?? "")?.name)}</StrongText>
              <p className="text-xs text-muted-foreground">{nullableText(lookups.instructors.get(session.instructor_id ?? "")?.display_name)}</p>
            </div>,
            <StatusPill key="status" tone={statusTone(session.status)}>{session.status}</StatusPill>
          ]}
        />
      </Card>
    </DomainFrame>
  );
}

export function AdminResourcesPage({ snapshot }: DomainPageProps) {
  return (
    <DomainFrame snapshot={snapshot} kicker="Backoffice - capaciteit" title="Locaties en banen" subtitle="Plaatsen, baden, banen, ruimtes of velden waarop groepen en lessen gepland worden.">
      <Card>
        <SectionHeader title="Locaties en banen" count={snapshot.data.resources.length} />
        <CreateResourceForm />
        <DomainCompactList
          details={(resource) => (
            <ActionPanel title="Locatie bewerken">
              <ResourceForm mode="update" resource={resource} />
            </ActionPanel>
          )}
          emptyLabel="Nog geen locaties of banen gevonden voor deze tenant."
          headers={["Locatie", "Type", "Capaciteit", "Status"]}
          rows={snapshot.data.resources}
          rowKey={(resource) => resource.id}
          summary={(resource) => [
            <div key="resource">
              <StrongText>{resource.name}</StrongText>
              <p className="text-xs text-muted-foreground">{nullableText(resource.location_name)} · <CodeText>{resource.code}</CodeText></p>
            </div>,
            <span key="type">{resource.resource_type}</span>,
            <StrongText key="capacity">{resource.capacity}</StrongText>,
            <StatusPill key="status" tone={statusTone(resource.status)}>{resource.status}</StatusPill>
          ]}
        />
      </Card>
    </DomainFrame>
  );
}

export function AdminEnrollmentsPage({ snapshot }: DomainPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <DomainFrame snapshot={snapshot} kicker="Backoffice - inschrijvingen" title="Inschrijvingen" subtitle="Deelname aan een programma met aparte kolommen voor huidig niveau en abonnement.">
      <Card>
        <SectionHeader title="Inschrijvingen" count={snapshot.data.enrollments.length} />
        <CreateEnrollmentForm data={snapshot.data} />
        <DomainCompactList
          details={(enrollment) => (
            <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <ActionPanel title="Status wijzigen">
                <StatusTransitionButtons action={transitionEnrollmentStatusAction} id={enrollment.id} statuses={["pending", "active", "paused", "completed", "cancelled"]} />
              </ActionPanel>
              <ActionPanel title="Inschrijving bewerken">
                <EnrollmentForm data={snapshot.data} enrollment={enrollment} mode="update" />
              </ActionPanel>
            </div>
          )}
          emptyLabel="Nog geen inschrijvingen gevonden voor deze tenant."
          headers={["Leerling", "Programma", "Start", "Status"]}
          rows={snapshot.data.enrollments}
          rowKey={(enrollment) => enrollment.id}
          summary={(enrollment) => [
            <ParticipantDetailLink key="learner" participantId={enrollment.participant_id}>{lookups.participants.get(enrollment.participant_id)?.display_name ?? "Onbekende participant"}</ParticipantDetailLink>,
            <div key="program">
              <StrongText>{lookups.programs.get(enrollment.program_id)?.name ?? "Onbekend"}</StrongText>
              <p className="text-xs text-muted-foreground">{nullableText(lookups.stages.get(enrollment.current_stage_id ?? "")?.name)} · {nullableText(lookups.subscriptionPlans.get(enrollment.subscription_plan_id ?? "")?.name)}</p>
            </div>,
            <span key="start">{formatDate(enrollment.started_on)}</span>,
            <StatusPill key="status" tone={statusTone(enrollment.status)}>{enrollment.status}</StatusPill>
          ]}
        />
      </Card>

    </DomainFrame>
  );
}

export function AdminInstructorsPage({ snapshot }: DomainPageProps) {
  return (
    <DomainFrame snapshot={snapshot} kicker="Backoffice - team" title="Instructeurs" subtitle="Begeleiders die aan groepen en lessen gekoppeld kunnen worden.">
      <Card>
        <SectionHeader title="Instructeurs" count={snapshot.data.instructors.length} />
        <CreateInstructorForm />
        <DomainCompactList
          details={(instructor) => (
            <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
              <ActionPanel title="Status wijzigen">
                <StatusTransitionButtons action={transitionInstructorStatusAction} id={instructor.id} statuses={["active", "inactive"]} />
              </ActionPanel>
              <ActionPanel title="Instructeur bewerken">
                <InstructorForm instructor={instructor} mode="update" />
              </ActionPanel>
            </div>
          )}
          emptyLabel="Nog geen instructeurs gevonden voor deze tenant."
          headers={["Naam", "E-mail", "Planning", "Status"]}
          rows={snapshot.data.instructors}
          rowKey={(instructor) => instructor.id}
          summary={(instructor) => [
            <DetailLink key="name" href={`/admin/instructors/${instructor.id}`}>{instructor.display_name}</DetailLink>,
            <span key="email">{nullableText(instructor.email)}</span>,
            <span key="planning">{countBy(snapshot.data.groups, "instructor_id", instructor.id)} groepen / {countBy(snapshot.data.sessions, "instructor_id", instructor.id)} lessen</span>,
            <StatusPill key="status" tone={statusTone(instructor.status)}>{instructor.status}</StatusPill>
          ]}
        />
      </Card>
    </DomainFrame>
  );
}

function DomainFrame({ snapshot, kicker, title, subtitle, children }: DomainPageProps & { kicker: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader kicker={kicker} title={title} subtitle={subtitle} action={<StatusPill tone="info">Beheer actief</StatusPill>} />
      <SnapshotStatus snapshot={snapshot} />
      {children}
    </div>
  );
}

function SnapshotStatus({ snapshot }: DomainPageProps) {
  if (snapshot.status === "ready") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-soft">
        <Database className="h-4 w-4 text-primary" />
        <span>
          Verbonden met <strong className="text-foreground">{snapshot.tenant?.name ?? "actieve tenant"}</strong>. Aanmaken, bewerken en status wijzigen is actief; harde deletes blijven uit.
        </span>
      </div>
    );
  }

  return (
    <Card className="border-amber-200 bg-amber-50 text-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{snapshot.status === "query_error" ? "Domeinquery nog niet groen" : "Domeindata nog niet beschikbaar"}</h2>
          <p className="mt-1 text-sm text-amber-800">Controleer Supabase env, migraties en tenanttoegang voordat beheer beschikbaar is.</p>
        </div>
        <StatusPill tone="warning">{snapshot.status}</StatusPill>
      </div>
      {snapshot.errors.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm">
          {snapshot.errors.map((error) => (
            <li key={error} className="rounded-xl bg-white/70 px-3 py-2">
              {error}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function CreateProgramForm() {
  return (
    <CreatePanel title="Nieuw programma">
      <ProgramForm mode="create" />
    </CreatePanel>
  );
}

function ProgramForm({ mode, program }: { mode: "create"; program?: never } | { mode: "update"; program: ProgramRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createProgramAction : updateProgramAction} submitLabel={mode === "create" ? "Programma opslaan" : "Wijzigingen opslaan"}>
      {program ? <input name="id" type="hidden" value={program.id} /> : null}
      <TextField defaultValue={program?.name} label="Naam" name="name" required />
      <TextField defaultValue={program?.code} label="Code" name="code" />
      <TextAreaField defaultValue={program?.description} label="Beschrijving" name="description" />
      <SelectField defaultValue={program?.status ?? "active"} label="Status" name="status" options={programStatusOptions} />
      <TextField defaultValue={program?.sort_order ?? 0} label="Volgorde" name="sort_order" type="number" />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateSubscriptionPlanForm() {
  return (
    <CreatePanel title="Nieuw abonnement">
      <SubscriptionPlanForm mode="create" />
    </CreatePanel>
  );
}

function SubscriptionPlanForm({ mode, plan }: { mode: "create"; plan?: never } | { mode: "update"; plan: SubscriptionPlanRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createSubscriptionPlanAction : updateSubscriptionPlanAction} submitLabel={mode === "create" ? "Plan opslaan" : "Wijzigingen opslaan"}>
      {plan ? <input name="id" type="hidden" value={plan.id} /> : null}
      <TextField defaultValue={plan?.name} label="Naam" name="name" required />
      <TextField defaultValue={plan?.code} label="Code" name="code" />
      <TextAreaField defaultValue={plan?.description} label="Beschrijving" name="description" />
      <SelectField defaultValue={plan?.billing_interval ?? "monthly"} label="Facturatie" name="billing_interval" options={billingIntervalOptions} />
      <TextField defaultValue={plan ? formatPriceInput(plan.price_cents) : "0"} label="Prijs" name="price" step="0.01" type="number" />
      <TextField defaultValue={plan?.currency ?? "EUR"} label="Valuta" name="currency" required />
      <TextField defaultValue={plan?.lesson_frequency_per_week ?? 1} label="Lessen p/w" name="lesson_frequency_per_week" step="0.25" type="number" />
      <SelectField defaultValue={plan?.status ?? "active"} label="Status" name="status" options={programStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateStageForm({ programs }: { programs: ProgramRow[] }) {
  return (
    <CreatePanel title="Nieuw niveau">
      <StageForm mode="create" programs={programs} />
    </CreatePanel>
  );
}

function StageForm({ mode, programs, stage }: { mode: "create"; programs: ProgramRow[]; stage?: never } | { mode: "update"; programs: ProgramRow[]; stage: StageRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createStageAction : updateStageAction} submitLabel={mode === "create" ? "Niveau opslaan" : "Wijzigingen opslaan"}>
      {stage ? <input name="id" type="hidden" value={stage.id} /> : null}
      <SelectField defaultValue={stage?.program_id} label="Programma" name="program_id" options={programs.map(optionFromName)} required />
      <TextField defaultValue={stage?.name} label="Naam" name="name" required />
      <TextField defaultValue={stage?.code} label="Code" name="code" />
      <TextAreaField defaultValue={stage?.description} label="Beschrijving" name="description" />
      <TextField defaultValue={stage?.sort_order ?? 0} label="Volgorde" name="sort_order" type="number" />
      <SelectField defaultValue={stage?.status ?? "active"} label="Status" name="status" options={programStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateStageModuleForm({ data }: { data: AdminDomainData }) {
  return (
    <CreatePanel title="Nieuwe module/rubric">
      <StageModuleForm data={data} mode="create" />
    </CreatePanel>
  );
}

function StageModuleForm({ mode, data, module }: { mode: "create"; data: AdminDomainData; module?: never } | { mode: "update"; data: AdminDomainData; module: StageModuleRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createStageModuleAction : updateStageModuleAction} submitLabel={mode === "create" ? "Module opslaan" : "Wijzigingen opslaan"}>
      {module ? <input name="id" type="hidden" value={module.id} /> : null}
      <SelectField defaultValue={module?.program_id} label="Programma" name="program_id" options={data.programs.map(optionFromName)} required />
      <SelectField defaultValue={module?.stage_id} label="Niveau" name="stage_id" options={data.stages.map(optionFromName)} required />
      <TextField defaultValue={module?.name} label="Naam" name="name" required />
      <TextField defaultValue={module?.code} label="Code" name="code" />
      <TextAreaField defaultValue={module?.description} label="Beschrijving" name="description" />
      <SelectField defaultValue={module?.assessment_scale ?? "four_step"} label="Beoordelingsschaal" name="assessment_scale" options={assessmentScaleOptions} />
      <TextAreaField defaultValue={JSON.stringify(module?.rubric ?? {}, null, 2)} label="Rubric JSON" name="rubric" />
      <TextAreaField defaultValue={module?.parent_copy} label="Oudertekst" name="parent_copy" />
      <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground">
        <input defaultChecked={module?.evidence_required ?? false} name="evidence_required" type="checkbox" />
        Evidence verplicht
      </label>
      <TextField defaultValue={module?.sort_order ?? 0} label="Volgorde" name="sort_order" type="number" />
      <SelectField defaultValue={module?.status ?? "active"} label="Status" name="status" options={programStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateStageProgressCriteriaForm({ data }: { data: AdminDomainData }) {
  return (
    <CreatePanel title="Nieuwe criteria">
      <DomainForm action={createStageProgressCriteriaAction} submitLabel="Criteria opslaan">
        <SelectField label="Programma" name="program_id" options={data.programs.map(optionFromName)} required />
        <SelectField label="Niveau" name="stage_id" options={data.stages.map(optionFromName)} required />
        <TextField label="Naam" name="name" required />
        <TextField label="Code" name="code" />
        <TextAreaField label="Beschrijving" name="description" />
        <TextField defaultValue={1} label="Vereiste modules" min={0} name="required_modules" type="number" />
        <TextField defaultValue={80} label="Vereiste score" max={100} min={0} name="required_score" type="number" />
        <TextField defaultValue="passed" label="Vereiste statussen" name="required_statuses" />
        <TextAreaField label="Oudertekst" name="parent_copy" />
        <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground">
          <input name="evidence_required" type="checkbox" />
          Evidence verplicht
        </label>
        <SelectField defaultValue="active" label="Status" name="status" options={programStatusOptions} />
      </DomainForm>
    </CreatePanel>
  );
}

function CreateQuickAssessmentTemplateForm({ data }: { data: AdminDomainData }) {
  return (
    <CreatePanel title="Nieuwe quick template">
      <DomainForm action={createQuickAssessmentTemplateAction} submitLabel="Template opslaan">
        <SelectField label="Programma" name="program_id" options={data.programs.map(optionFromName)} required />
        <SelectField includeEmpty label="Niveau" name="stage_id" options={data.stages.map(optionFromName)} />
        <SelectField includeEmpty label="Module" name="stage_module_id" options={data.stageModules.map(optionFromName)} />
        <TextField label="Naam" name="name" required />
        <TextField label="Code" name="code" />
        <TextAreaField label="Beschrijving" name="description" />
        <SelectField defaultValue="in_progress" label="Default status" name="default_status" options={progressStatusOptions} />
        <TextField defaultValue={60} label="Default score" max={100} min={0} name="default_score" type="number" />
        <TextAreaField label="Prompt voor instructeur" name="instructor_prompt" />
        <TextAreaField label="Oudertekst" name="parent_friendly_copy" />
        <TextField defaultValue={0} label="Volgorde" name="sort_order" type="number" />
        <SelectField defaultValue="active" label="Status" name="status" options={programStatusOptions} />
      </DomainForm>
    </CreatePanel>
  );
}

function CreateBadgeRuleForm({ data }: { data: AdminDomainData }) {
  return (
    <CreatePanel title="Nieuwe badge rule">
      <DomainForm action={createBadgeRuleAction} submitLabel="Rule opslaan">
        <SelectField label="Badge" name="badge_id" options={data.badges.map(optionFromName)} required />
        <SelectField includeEmpty label="Programma" name="program_id" options={data.programs.map(optionFromName)} />
        <SelectField includeEmpty label="Niveau" name="stage_id" options={data.stages.map(optionFromName)} />
        <TextField label="Naam" name="name" required />
        <TextField label="Code" name="code" />
        <SelectField defaultValue="progress_recommendation" label="Trigger" name="trigger_type" options={badgeRuleTriggerOptions} />
        <TextField defaultValue={80} label="Min score" max={100} min={0} name="min_score" type="number" />
        <TextField label="Vereiste module IDs" name="required_module_ids" placeholder="uuid, uuid" />
        <SelectField defaultValue="passed" label="Vereiste status" name="required_status" options={progressStatusOptions} />
        <SelectField defaultValue="either" label="Approval" name="approval_role" options={approvalRoleOptions} />
        <TextAreaField label="Aanbevelingstekst" name="recommendation_copy" />
        <SelectField defaultValue="active" label="Status" name="status" options={programStatusOptions} />
      </DomainForm>
    </CreatePanel>
  );
}

function CreateResourceForm() {
  return (
    <CreatePanel title="Nieuwe locatie of baan">
      <ResourceForm mode="create" />
    </CreatePanel>
  );
}

function ResourceForm({ mode, resource }: { mode: "create"; resource?: never } | { mode: "update"; resource: ResourceRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createResourceAction : updateResourceAction} submitLabel={mode === "create" ? "Locatie opslaan" : "Wijzigingen opslaan"}>
      {resource ? <input name="id" type="hidden" value={resource.id} /> : null}
      <TextField defaultValue={resource?.name} label="Naam" name="name" required />
      <TextField defaultValue={resource?.code} label="Code" name="code" />
      <SelectField defaultValue={resource?.resource_type ?? "space"} label="Type" name="resource_type" options={resourceTypeOptions} />
      <TextField defaultValue={resource?.location_name} label="Locatie" name="location_name" />
      <TextField defaultValue={resource?.capacity ?? 1} label="Capaciteit" min={1} name="capacity" type="number" />
      <SelectField defaultValue={resource?.status ?? "active"} label="Status" name="status" options={resourceStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateInstructorForm() {
  return (
    <CreatePanel title="Nieuwe instructeur">
      <InstructorForm mode="create" />
    </CreatePanel>
  );
}

function InstructorForm({ mode, instructor }: { mode: "create"; instructor?: never } | { mode: "update"; instructor: InstructorRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createInstructorAction : updateInstructorAction} submitLabel={mode === "create" ? "Instructeur opslaan" : "Wijzigingen opslaan"}>
      {instructor ? <input name="id" type="hidden" value={instructor.id} /> : null}
      <TextField defaultValue={instructor?.display_name} label="Naam" name="display_name" required />
      <TextField defaultValue={instructor?.email} label="E-mail" name="email" type="email" />
      <SelectField defaultValue={instructor?.status ?? "active"} label="Status" name="status" options={activeInactiveOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateGroupForm({ data }: { data: AdminDomainData }) {
  return (
    <CreatePanel title="Nieuwe groep">
      <GroupForm data={data} mode="create" />
    </CreatePanel>
  );
}

function GroupForm({ mode, data, group }: { mode: "create"; data: AdminDomainData; group?: never } | { mode: "update"; data: AdminDomainData; group: GroupRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createGroupAction : updateGroupAction} submitLabel={mode === "create" ? "Groep opslaan" : "Wijzigingen opslaan"}>
      {group ? <input name="id" type="hidden" value={group.id} /> : null}
      <TextField defaultValue={group?.name} label="Naam" name="name" required />
      <TextField defaultValue={group?.code} label="Code" name="code" />
      <SelectField defaultValue={group?.program_id} label="Programma" name="program_id" options={data.programs.map(optionFromName)} required />
      <SelectField defaultValue={group?.stage_id} label="Niveau" name="stage_id" options={data.stages.map(optionFromName)} required />
      <SelectField defaultValue={group?.resource_id ?? ""} includeEmpty label="Locatie" name="resource_id" options={data.resources.map(optionFromName)} />
      <SelectField defaultValue={group?.instructor_id ?? ""} includeEmpty label="Instructeur" name="instructor_id" options={data.instructors.map((instructor) => ({ label: instructor.display_name, value: instructor.id }))} />
      <SelectField defaultValue={String(group?.weekday ?? 1)} label="Weekdag" name="weekday" options={weekdayOptions} />
      <TextField defaultValue={group?.starts_at ? formatTime(group.starts_at) : ""} label="Start" name="starts_at" required type="time" />
      <TextField defaultValue={group?.ends_at ? formatTime(group.ends_at) : ""} label="Einde" name="ends_at" required type="time" />
      <TextField defaultValue={group?.capacity ?? 1} label="Capaciteit" min={1} name="capacity" type="number" />
      <TextField defaultValue={group?.reserved_spots ?? 0} label="Reserve plekken" min={0} name="reserved_spots" type="number" />
      <TextField defaultValue={group?.trial_spots ?? 0} label="Proefles plekken" min={0} name="trial_spots" type="number" />
      <TextField defaultValue={group?.makeup_spots ?? 0} label="Inhaal plekken" min={0} name="makeup_spots" type="number" />
      <SelectField defaultValue={group?.overbooking_policy ?? "blocked"} label="Overboeking" name="overbooking_policy" options={overbookingPolicyOptions} />
      <TextAreaField defaultValue={JSON.stringify(group?.capacity_policy ?? {}, null, 2)} label="Capacity policy JSON" name="capacity_policy" />
      <SelectField defaultValue={group?.status ?? "active"} label="Status" name="status" options={groupStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateSessionForm({ data }: { data: AdminDomainData }) {
  return (
    <CreatePanel title="Nieuwe les">
      <SessionForm data={data} mode="create" />
    </CreatePanel>
  );
}

function SessionForm({ mode, data, session }: { mode: "create"; data: AdminDomainData; session?: never } | { mode: "update"; data: AdminDomainData; session: SessionRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createSessionAction : updateSessionAction} submitLabel={mode === "create" ? "Les opslaan" : "Wijzigingen opslaan"}>
      {session ? <input name="id" type="hidden" value={session.id} /> : null}
      <SelectField defaultValue={session?.group_id} label="Groep" name="group_id" options={data.groups.map(optionFromName)} required />
      <SelectField defaultValue={session?.resource_id ?? ""} includeEmpty label="Locatie" name="resource_id" options={data.resources.map(optionFromName)} />
      <SelectField defaultValue={session?.instructor_id ?? ""} includeEmpty label="Instructeur" name="instructor_id" options={data.instructors.map((instructor) => ({ label: instructor.display_name, value: instructor.id }))} />
      <TextField defaultValue={session ? formatDateTimeInput(session.starts_at) : ""} label="Start" name="starts_at" required type="datetime-local" />
      <TextField defaultValue={session ? formatDateTimeInput(session.ends_at) : ""} label="Einde" name="ends_at" required type="datetime-local" />
      <SelectField defaultValue={session?.status ?? "scheduled"} label="Status" name="status" options={sessionStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateParticipantForm() {
  return (
    <CreatePanel title="Nieuwe leerling">
      <ParticipantForm mode="create" />
    </CreatePanel>
  );
}

function ParticipantForm({ mode, participant }: { mode: "create"; participant?: never } | { mode: "update"; participant: ParticipantRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createParticipantAction : updateParticipantAction} submitLabel={mode === "create" ? "Leerling opslaan" : "Wijzigingen opslaan"}>
      {participant ? <input name="id" type="hidden" value={participant.id} /> : null}
      <TextField defaultValue={participant?.display_name} label="Naam" name="display_name" required />
      <TextField defaultValue={participant?.birthdate ?? ""} label="Geboortedatum" name="birthdate" type="date" />
      <TextField defaultValue={participant?.external_reference} label="Referentie" name="external_reference" />
      <SelectField defaultValue={participant?.status ?? "active"} label="Status" name="status" options={participantStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateEnrollmentForm({ data }: { data: AdminDomainData }) {
  return (
    <CreatePanel title="Nieuwe inschrijving">
      <EnrollmentForm data={data} mode="create" />
    </CreatePanel>
  );
}

function EnrollmentForm({ mode, data, enrollment }: { mode: "create"; data: AdminDomainData; enrollment?: never } | { mode: "update"; data: AdminDomainData; enrollment: EnrollmentRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createEnrollmentAction : updateEnrollmentAction} submitLabel={mode === "create" ? "Inschrijving opslaan" : "Wijzigingen opslaan"}>
      {enrollment ? <input name="id" type="hidden" value={enrollment.id} /> : null}
      <TextField defaultValue={enrollment?.external_reference} label="Referentie" name="external_reference" />
      <SelectField defaultValue={enrollment?.participant_id} label="Leerling" name="participant_id" options={data.participants.map((participant) => ({ label: participant.display_name, value: participant.id }))} required />
      <SelectField defaultValue={enrollment?.program_id} label="Programma" name="program_id" options={data.programs.map(optionFromName)} required />
      <SelectField defaultValue={enrollment?.current_stage_id ?? ""} includeEmpty label="Huidig niveau" name="current_stage_id" options={data.stages.map(optionFromName)} />
      <SelectField defaultValue={enrollment?.subscription_plan_id ?? ""} includeEmpty label="Abonnement" name="subscription_plan_id" options={data.subscriptionPlans.map(optionFromName)} />
      <TextField defaultValue={enrollment?.started_on ?? todayInput()} label="Startdatum" name="started_on" required type="date" />
      <TextField defaultValue={enrollment?.ended_on ?? ""} label="Einddatum" name="ended_on" type="date" />
      <SelectField defaultValue={enrollment?.status ?? "active"} label="Status" name="status" options={enrollmentStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateGroupMembershipForm({ data }: { data: AdminDomainData }) {
  return (
    <CreatePanel title="Nieuwe groepsplaatsing">
      <GroupMembershipForm data={data} mode="create" />
    </CreatePanel>
  );
}

function GroupMembershipForm({ mode, data, membership }: { mode: "create"; data: AdminDomainData; membership?: never } | { mode: "update"; data: AdminDomainData; membership: GroupMembershipRow }) {
  const lookups = buildLookups(data);
  const enrollmentOptions = data.enrollments.map((enrollment) => ({
    label: enrollmentParticipantName(lookups, enrollment.id),
    value: enrollment.id
  }));
  const form = (
    <DomainForm action={mode === "create" ? createGroupMembershipAction : updateGroupMembershipAction} submitLabel={mode === "create" ? "Plaatsing opslaan" : "Wijzigingen opslaan"}>
      {membership ? <input name="id" type="hidden" value={membership.id} /> : null}
      <SelectField defaultValue={membership?.enrollment_id} label="Inschrijving" name="enrollment_id" options={enrollmentOptions} required />
      <SelectField defaultValue={membership?.group_id} label="Groep" name="group_id" options={data.groups.map(optionFromName)} required />
      <TextField defaultValue={membership?.starts_on ?? todayInput()} label="Startdatum" name="starts_on" required type="date" />
      <TextField defaultValue={membership?.ends_on ?? ""} label="Einddatum" name="ends_on" type="date" />
      <SelectField defaultValue={membership?.status ?? "active"} label="Status" name="status" options={membershipStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreatePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="mb-4 rounded-2xl border border-border bg-muted/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-primary">{title}</summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function EditPanel({ children }: { children: ReactNode }) {
  return (
    <details className="rounded-2xl border border-border bg-muted/30 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-primary">Bewerken</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function ActionStack({ children }: { children: ReactNode }) {
  return <div className="grid gap-3">{children}</div>;
}

function StatusTransitionButtons({ action, id, statuses }: { action: (formData: FormData) => Promise<void>; id: string; statuses: string[] }) {
  return (
    <AdminActionForm action={action} className="flex flex-wrap gap-2" successMessage="Status bijgewerkt.">
      <input name="id" type="hidden" value={id} />
      {statuses.map((status) => (
        <button className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-60" key={status} name="status" type="submit" value={status}>
          {status}
        </button>
      ))}
    </AdminActionForm>
  );
}

function DomainForm({ action, submitLabel, children }: { action: (formData: FormData) => Promise<void>; submitLabel: string; children: ReactNode }) {
  return (
    <AdminActionForm action={action} className="grid gap-3" successMessage="Wijziging opgeslagen.">
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
      <div>
        <AdminSubmitButton className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90">
          {submitLabel}
        </AdminSubmitButton>
      </div>
    </AdminActionForm>
  );
}

function TextField({
  defaultValue,
  label,
  max,
  min,
  name,
  placeholder,
  required,
  step,
  type = "text"
}: {
  defaultValue?: string | number | null;
  label: string;
  max?: number;
  min?: number;
  name: string;
  placeholder?: string;
  required?: boolean;
  step?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <input
        className="min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2"
        defaultValue={defaultValue ?? ""}
        max={max}
        min={min}
        name={name}
        placeholder={placeholder}
        required={required}
        step={step}
        type={type}
      />
    </label>
  );
}

function TextAreaField({ defaultValue, label, name }: { defaultValue?: string | null; label: string; name: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground md:col-span-2">
      <span>{label}</span>
      <textarea className="min-h-20 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2" defaultValue={defaultValue ?? ""} name={name} />
    </label>
  );
}

function SelectField({
  defaultValue,
  includeEmpty,
  label,
  name,
  options,
  required
}: {
  defaultValue?: string | number | null;
  includeEmpty?: boolean;
  label: string;
  name: string;
  options: { label: string; value: string | number }[];
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <select
        className="min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2"
        defaultValue={defaultValue ?? ""}
        name={name}
        required={required}
      >
        {includeEmpty || required ? <option value="">{required ? "Selecteer" : "-"}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
    </Card>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <StatusPill tone="neutral">{count}</StatusPill>
    </div>
  );
}

function DomainTable<Row>({ columns, rows, rowKey, emptyLabel }: { columns: Column<Row>[]; rows: Row[]; rowKey: (row: Row) => string; emptyLabel: string }) {
  if (rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">{emptyLabel}</div>;
  }

  return (
    <AdminTableEnhancer rowCount={rows.length}>
      <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
        <table className="w-max min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-muted-foreground">
              {columns.map((column) => (
                <th key={column.header} className={`whitespace-nowrap px-3 py-3 font-semibold ${column.className ?? ""}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="align-top" data-admin-row data-search-text={rowSearchText(row)} data-sort-text={rowSortText(row)} data-status={rowStatus(row)}>
                {columns.map((column) => (
                  <td key={column.header} className={`whitespace-nowrap px-3 py-3 ${column.className ?? ""}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminTableEnhancer>
  );
}

function DomainCompactList<Row>({ details, emptyLabel, headers, rows, rowKey, summary }: { details: (row: Row) => ReactNode; emptyLabel: string; headers: string[]; rows: Row[]; rowKey: (row: Row) => string; summary: (row: Row) => ReactNode[] }) {
  if (rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">{emptyLabel}</div>;
  }

  return (
    <AdminTableEnhancer rowCount={rows.length}>
      <div className="grid gap-2">
        <div className="hidden rounded-xl bg-muted/40 px-4 py-2 text-[11px] font-bold uppercase text-muted-foreground lg:grid lg:grid-cols-[repeat(4,minmax(0,1fr))_52px]">
          {headers.map((header) => (
            <span key={header}>{header}</span>
          ))}
          <span />
        </div>
        {rows.map((row) => (
          <details key={rowKey(row)} className="group rounded-2xl border border-border bg-card shadow-sm transition open:border-primary/25 open:bg-white" data-admin-row data-search-text={rowSearchText(row)} data-sort-text={rowSortText(row)} data-status={rowStatus(row)}>
            <summary className="grid cursor-pointer list-none gap-3 px-4 py-3 text-sm outline-none ring-primary/20 hover:bg-muted/30 focus-visible:ring-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_52px] [&::-webkit-details-marker]:hidden">
              {summary(row).slice(0, 4).map((cell, index) => (
                <div key={`${rowKey(row)}-${headers[index] ?? index}`} className="min-w-0">
                  {cell}
                </div>
              ))}
              <div className="flex items-center justify-end">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground transition group-open:rotate-180 group-open:bg-primary group-open:text-primary-foreground">
                  <ChevronDown className="h-4 w-4" />
                </span>
              </div>
            </summary>
            <div className="border-t border-border bg-muted/20 p-4">{details(row)}</div>
          </details>
        ))}
      </div>
    </AdminTableEnhancer>
  );
}

function ActionPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      {children}
    </div>
  );
}

function rowSearchText(row: unknown) {
  return JSON.stringify(row);
}

function rowSortText(row: unknown) {
  if (row && typeof row === "object" && "name" in row && typeof row.name === "string") {
    return row.name;
  }

  if (row && typeof row === "object" && "display_name" in row && typeof row.display_name === "string") {
    return row.display_name;
  }

  return rowSearchText(row);
}

function rowStatus(row: unknown) {
  return row && typeof row === "object" && "status" in row && typeof row.status === "string" ? row.status : "";
}

function StrongText({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground">{children}</span>;
}

function DetailLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link className="font-semibold text-primary hover:underline" href={href}>
      {children}
    </Link>
  );
}

function ParticipantDetailLink({ children, participantId }: { children: ReactNode; participantId: string }) {
  return <DetailLink href={`/admin/leerlingen/${participantId}`}>{children}</DetailLink>;
}

function ExportLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted" href={href}>
      {children}
    </Link>
  );
}

function CodeText({ children }: { children: ReactNode }) {
  return <span className="rounded-lg bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{children}</span>;
}

function buildLookups(data: AdminDomainData): LookupMaps {
  return {
    programs: byId(data.programs),
    stages: byId(data.stages),
    subscriptionPlans: byId(data.subscriptionPlans),
    resources: byId(data.resources),
    instructors: byId(data.instructors),
    groups: byId(data.groups),
    participants: byId(data.participants),
    enrollments: byId(data.enrollments),
    stageModules: byId(data.stageModules),
    badges: byId(data.badges)
  };
}

function byId<Row extends { id: string }>(rows: Row[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function enrollmentParticipantName(lookups: LookupMaps, enrollmentId: string) {
  const enrollment = lookups.enrollments.get(enrollmentId);

  return enrollment ? (lookups.participants.get(enrollment.participant_id)?.display_name ?? "Onbekende participant") : "Onbekende enrollment";
}

function countBy<Row>(rows: Row[], key: keyof Row, value: string) {
  return rows.filter((row) => row[key] === value).length;
}

function groupBy<Row extends Record<Key, string>, Key extends keyof Row>(rows: Row[], key: Key) {
  const grouped = new Map<string, Row[]>();

  for (const row of rows) {
    const value = row[key];
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }

  return grouped;
}

function JsonList({ items, tone = "neutral" }: { items: Array<Record<string, unknown>>; tone?: "neutral" | "danger" }) {
  if (items.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">Geen redenen vastgelegd.</p>;
  }

  return (
    <ul className={`mt-2 grid gap-1 text-sm ${tone === "danger" ? "text-red-700" : "text-muted-foreground"}`}>
      {items.slice(0, 5).map((item, index) => (
        <li key={`${String(item.code ?? item.label ?? index)}-${index}`}>• {String(item.label ?? item.code ?? "Reden")}</li>
      ))}
    </ul>
  );
}

function jsonSummary(items: Array<Record<string, unknown>>) {
  return items
    .slice(0, 3)
    .map((item) => String(item.label ?? item.code ?? "reden"))
    .join(" · ");
}

function capacityValue(snapshot: Record<string, unknown>, key: string) {
  const value = snapshot[key];

  return typeof value === "number" || typeof value === "string" ? value : "-";
}

function nullableText(value: string | null | undefined) {
  return value && value.trim() !== "" ? value : <span className="text-muted-foreground">-</span>;
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["active", "scheduled", "issued", "passed", "completed", "awarded"].includes(status)) {
    return "success";
  }

  if (["draft", "pending", "planned", "paused", "maintenance", "in_progress", "needs_attention", "recommended"].includes(status)) {
    return "warning";
  }

  if (["cancelled", "revoked", "inactive", "suspended", "rejected", "expired"].includes(status)) {
    return "danger";
  }

  if (["observed"].includes(status)) {
    return "info";
  }

  return "neutral";
}

function formatMoney(priceCents: number, currency: string) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(priceCents / 100);
}

function formatNumber(value: number | string) {
  const numericValue = Number(value);

  return Number.isInteger(numericValue) ? numericValue.toString() : numericValue.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatTime(value: string) {
  return value.slice(0, 5);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTimeTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDateTimeInput(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 16);
}

function formatPriceInput(priceCents: number) {
  return (priceCents / 100).toFixed(2);
}

function billingIntervalLabel(value: string) {
  return billingIntervalOptions.find((option) => option.value === value)?.label ?? value;
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function weekdayLabel(weekday: number) {
  const labels = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

  return labels[weekday - 1] ?? `Dag ${weekday}`;
}

function optionFromName(row: { id: string; name: string }) {
  return {
    label: row.name,
    value: row.id
  };
}

const programStatusOptions = [
  { label: "Concept", value: "draft" },
  { label: "Actief", value: "active" },
  { label: "Gearchiveerd", value: "archived" }
];

const assessmentScaleOptions = [
  { label: "Vier stappen", value: "four_step" },
  { label: "Percentage", value: "percentage" },
  { label: "Ja/Nee", value: "binary" },
  { label: "Custom rubric", value: "custom" }
];

const progressStatusOptions = [
  { label: "Geobserveerd", value: "observed" },
  { label: "In ontwikkeling", value: "in_progress" },
  { label: "Behaald", value: "passed" },
  { label: "Aandacht nodig", value: "needs_attention" }
];

const badgeRuleTriggerOptions = [
  { label: "Handmatig", value: "manual" },
  { label: "Progress-aanbeveling", value: "progress_recommendation" }
];

const approvalRoleOptions = [
  { label: "Instructeur", value: "instructor" },
  { label: "Tenant admin", value: "tenant_admin" },
  { label: "Beide", value: "either" }
];

const billingIntervalOptions = [
  { label: "Wekelijks", value: "weekly" },
  { label: "Maandelijks", value: "monthly" },
  { label: "Per kwartaal", value: "quarterly" },
  { label: "Jaarlijks", value: "yearly" },
  { label: "Handmatig", value: "manual" }
];

const resourceTypeOptions = [
  { label: "Baan", value: "lane" },
  { label: "Bad", value: "pool" },
  { label: "Ruimte", value: "room" },
  { label: "Veld", value: "field" },
  { label: "Plek", value: "space" }
];

const resourceStatusOptions = [
  { label: "Actief", value: "active" },
  { label: "Inactief", value: "inactive" },
  { label: "Onderhoud", value: "maintenance" }
];

const activeInactiveOptions = [
  { label: "Actief", value: "active" },
  { label: "Inactief", value: "inactive" }
];

const groupStatusOptions = [
  { label: "Concept", value: "draft" },
  { label: "Actief", value: "active" },
  { label: "Gepauzeerd", value: "paused" },
  { label: "Gearchiveerd", value: "archived" }
];

const overbookingPolicyOptions = [
  { label: "Blokkeren", value: "blocked" },
  { label: "Waarschuwen", value: "warn" },
  { label: "Toestaan", value: "allow" }
];

const sessionStatusOptions = [
  { label: "Gepland", value: "scheduled" },
  { label: "Afgerond", value: "completed" },
  { label: "Geannuleerd", value: "cancelled" }
];

const participantStatusOptions = [
  { label: "Actief", value: "active" },
  { label: "Inactief", value: "inactive" },
  { label: "Gearchiveerd", value: "archived" }
];

const enrollmentStatusOptions = [
  { label: "In afwachting", value: "pending" },
  { label: "Actief", value: "active" },
  { label: "Gepauzeerd", value: "paused" },
  { label: "Afgerond", value: "completed" },
  { label: "Geannuleerd", value: "cancelled" }
];

const membershipStatusOptions = [
  { label: "Gepland", value: "planned" },
  { label: "Actief", value: "active" },
  { label: "Beeindigd", value: "ended" },
  { label: "Geannuleerd", value: "cancelled" }
];

const weekdayOptions = [
  { label: "Maandag", value: 1 },
  { label: "Dinsdag", value: 2 },
  { label: "Woensdag", value: 3 },
  { label: "Donderdag", value: 4 },
  { label: "Vrijdag", value: 5 },
  { label: "Zaterdag", value: 6 },
  { label: "Zondag", value: 7 }
];
