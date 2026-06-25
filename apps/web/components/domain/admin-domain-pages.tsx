import type { ReactNode } from "react";
import { CalendarDays, CircleDollarSign, Database, MapPin, Users, Waves } from "lucide-react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import type {
  AdminDomainData,
  AdminDomainSnapshot,
  AchievementCardRow,
  BadgeAwardRow,
  BadgeRow,
  EnrollmentRow,
  GroupMembershipRow,
  GroupRow,
  InstructorRow,
  ParticipantRow,
  ProgramRow,
  ResourceRow,
  SessionRow,
  StageModuleProgressRow,
  StageModuleRow,
  StageTransitionProposalRow,
  StageRow,
  SubscriptionPlanRow
} from "@/lib/domain/admin-domain-read-model";
import {
  createEnrollmentAction,
  createGroupAction,
  createGroupMembershipAction,
  createInstructorAction,
  createParticipantAction,
  createProgramAction,
  createResourceAction,
  createSessionAction,
  createStageAction,
  createSubscriptionPlanAction,
  reviewStageTransitionProposalAction,
  updateEnrollmentAction,
  updateGroupAction,
  updateGroupMembershipAction,
  updateInstructorAction,
  updateParticipantAction,
  updateProgramAction,
  updateResourceAction,
  updateSessionAction,
  updateStageAction,
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
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
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
      </div>

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
        <MetricCard icon={<Users className="h-5 w-5" />} label="Achievement cards" value={snapshot.data.achievementCards.length.toString()} detail="ouder/kind zichtbaar" />
        <MetricCard icon={<CalendarDays className="h-5 w-5" />} label="Doorstroom" value={openTransitions.length.toString()} detail="open voorstellen" />
      </div>

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
            { header: "Besluit", className: "min-w-[360px] whitespace-normal", render: (proposal) => <StageTransitionReviewForm proposal={proposal} /> }
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

function StageTransitionReviewForm({ proposal }: { proposal: StageTransitionProposalRow }) {
  return (
    <form action={reviewStageTransitionProposalAction} className="flex flex-wrap gap-2">
      <input name="id" type="hidden" value={proposal.id} />
      <button className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted" name="decision" type="submit" value="approved">
        Goedkeuren
      </button>
      <button className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" name="decision" type="submit" value="applied">
        Toepassen
      </button>
      <button className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100" name="decision" type="submit" value="rejected">
        Afwijzen
      </button>
    </form>
  );
}

export function AdminGroupsPage({ snapshot }: DomainPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <DomainFrame snapshot={snapshot} kicker="Backoffice - planning" title="Groepen" subtitle="Terugkerende lesgroepen met programma, niveau, locatie, instructeur, tijdslot en capaciteit.">
      <Card>
        <SectionHeader title="Groepen" count={snapshot.data.groups.length} />
        <CreateGroupForm data={snapshot.data} />
        <DomainTable
          columns={[
            { header: "Groep", render: (group) => <StrongText>{group.name}</StrongText> },
            { header: "Programma", render: (group) => lookups.programs.get(group.program_id)?.name ?? "Onbekend" },
            { header: "Niveau", render: (group) => lookups.stages.get(group.stage_id)?.name ?? "Onbekend" },
            { header: "Moment", render: (group) => `${weekdayLabel(group.weekday)} ${formatTime(group.starts_at)}-${formatTime(group.ends_at)}` },
            { header: "Locatie", render: (group) => nullableText(lookups.resources.get(group.resource_id ?? "")?.name) },
            { header: "Instructeur", render: (group) => nullableText(lookups.instructors.get(group.instructor_id ?? "")?.display_name) },
            { header: "Cap.", render: (group) => group.capacity },
            { header: "Status", render: (group) => <StatusPill tone={statusTone(group.status)}>{group.status}</StatusPill> },
            { header: "Actie", className: "min-w-[360px] whitespace-normal", render: (group) => <GroupForm data={snapshot.data} group={group} mode="update" /> }
          ]}
          emptyLabel="Nog geen groepen gevonden voor deze tenant."
          rows={snapshot.data.groups}
          rowKey={(group) => group.id}
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
        <DomainTable
          columns={[
            { header: "Datum", render: (session) => formatDateTime(session.starts_at) },
            { header: "Tijd", render: (session) => `${formatDateTimeTime(session.starts_at)}-${formatDateTimeTime(session.ends_at)}` },
            { header: "Groep", render: (session) => lookups.groups.get(session.group_id)?.name ?? "Onbekende groep" },
            { header: "Locatie", render: (session) => nullableText(lookups.resources.get(session.resource_id ?? "")?.name) },
            { header: "Instructeur", render: (session) => nullableText(lookups.instructors.get(session.instructor_id ?? "")?.display_name) },
            { header: "Status", render: (session) => <StatusPill tone={statusTone(session.status)}>{session.status}</StatusPill> },
            { header: "Actie", className: "min-w-[360px] whitespace-normal", render: (session) => <SessionForm data={snapshot.data} mode="update" session={session} /> }
          ]}
          emptyLabel="Nog geen lessen gevonden voor deze tenant."
          rows={snapshot.data.sessions}
          rowKey={(session) => session.id}
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
        <DomainTable
          columns={[
            { header: "Locatie", render: (resource) => <StrongText>{resource.name}</StrongText> },
            { header: "Type", render: (resource) => resource.resource_type },
            { header: "Locatie", render: (resource) => nullableText(resource.location_name) },
            { header: "Capaciteit", render: (resource) => resource.capacity },
            { header: "Code", render: (resource) => <CodeText>{resource.code}</CodeText> },
            { header: "Status", render: (resource) => <StatusPill tone={statusTone(resource.status)}>{resource.status}</StatusPill> },
            { header: "Actie", className: "min-w-[320px] whitespace-normal", render: (resource) => <ResourceForm mode="update" resource={resource} /> }
          ]}
          emptyLabel="Nog geen locaties of banen gevonden voor deze tenant."
          rows={snapshot.data.resources}
          rowKey={(resource) => resource.id}
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
        <DomainTable
          columns={[
            { header: "Leerling", render: (enrollment) => lookups.participants.get(enrollment.participant_id)?.display_name ?? "Onbekende participant" },
            { header: "Programma", render: (enrollment) => lookups.programs.get(enrollment.program_id)?.name ?? "Onbekend" },
            { header: "Huidig niveau", render: (enrollment) => nullableText(lookups.stages.get(enrollment.current_stage_id ?? "")?.name) },
            { header: "Abonnement", render: (enrollment) => nullableText(lookups.subscriptionPlans.get(enrollment.subscription_plan_id ?? "")?.name) },
            { header: "Start", render: (enrollment) => formatDate(enrollment.started_on) },
            { header: "Status", render: (enrollment) => <StatusPill tone={statusTone(enrollment.status)}>{enrollment.status}</StatusPill> },
            { header: "Actie", className: "min-w-[360px] whitespace-normal", render: (enrollment) => <EnrollmentForm data={snapshot.data} enrollment={enrollment} mode="update" /> }
          ]}
          emptyLabel="Nog geen inschrijvingen gevonden voor deze tenant."
          rows={snapshot.data.enrollments}
          rowKey={(enrollment) => enrollment.id}
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader title="Leerlingen" count={snapshot.data.participants.length} />
          <CreateParticipantForm />
          <DomainTable
            columns={[
              { header: "Naam", render: (participant) => <StrongText>{participant.display_name}</StrongText> },
              { header: "Geboortedatum", render: (participant) => nullableText(participant.birthdate ? formatDate(participant.birthdate) : null) },
              { header: "Referentie", render: (participant) => nullableText(participant.external_reference) },
              { header: "Status", render: (participant) => <StatusPill tone={statusTone(participant.status)}>{participant.status}</StatusPill> },
              { header: "Actie", className: "min-w-[320px] whitespace-normal", render: (participant) => <ParticipantForm mode="update" participant={participant} /> }
            ]}
            emptyLabel="Nog geen leerlingen gevonden."
            rows={snapshot.data.participants}
            rowKey={(participant) => participant.id}
          />
        </Card>

        <Card>
          <SectionHeader title="Groepsplaatsingen" count={snapshot.data.groupMemberships.length} />
          <CreateGroupMembershipForm data={snapshot.data} />
          <DomainTable
            columns={[
              { header: "Leerling", render: (membership) => enrollmentParticipantName(lookups, membership.enrollment_id) },
              { header: "Groep", render: (membership) => lookups.groups.get(membership.group_id)?.name ?? "Onbekend" },
              { header: "Vanaf", render: (membership) => formatDate(membership.starts_on) },
              { header: "Status", render: (membership) => <StatusPill tone={statusTone(membership.status)}>{membership.status}</StatusPill> },
              { header: "Actie", className: "min-w-[340px] whitespace-normal", render: (membership) => <GroupMembershipForm data={snapshot.data} membership={membership} mode="update" /> }
            ]}
            emptyLabel="Nog geen groepsplaatsingen gevonden."
            rows={snapshot.data.groupMemberships}
            rowKey={(membership) => membership.id}
          />
        </Card>
      </div>
    </DomainFrame>
  );
}

export function AdminInstructorsPage({ snapshot }: DomainPageProps) {
  return (
    <DomainFrame snapshot={snapshot} kicker="Backoffice - team" title="Instructeurs" subtitle="Begeleiders die aan groepen en lessen gekoppeld kunnen worden.">
      <Card>
        <SectionHeader title="Instructeurs" count={snapshot.data.instructors.length} />
        <CreateInstructorForm />
        <DomainTable
          columns={[
            { header: "Naam", render: (instructor) => <StrongText>{instructor.display_name}</StrongText> },
            { header: "E-mail", render: (instructor) => nullableText(instructor.email) },
            { header: "Groepen", render: (instructor) => countBy(snapshot.data.groups, "instructor_id", instructor.id) },
            { header: "Lessen", render: (instructor) => countBy(snapshot.data.sessions, "instructor_id", instructor.id) },
            { header: "Status", render: (instructor) => <StatusPill tone={statusTone(instructor.status)}>{instructor.status}</StatusPill> },
            { header: "Actie", className: "min-w-[320px] whitespace-normal", render: (instructor) => <InstructorForm instructor={instructor} mode="update" /> }
          ]}
          emptyLabel="Nog geen instructeurs gevonden voor deze tenant."
          rows={snapshot.data.instructors}
          rowKey={(instructor) => instructor.id}
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

function DomainForm({ action, submitLabel, children }: { action: (formData: FormData) => Promise<void>; submitLabel: string; children: ReactNode }) {
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
      <div>
        <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function TextField({
  defaultValue,
  label,
  min,
  name,
  required,
  step,
  type = "text"
}: {
  defaultValue?: string | number | null;
  label: string;
  min?: number;
  name: string;
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
        min={min}
        name={name}
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
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
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
            <tr key={rowKey(row)} className="align-top">
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
  );
}

function StrongText({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground">{children}</span>;
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

function nullableText(value: string | null | undefined) {
  return value && value.trim() !== "" ? value : <span className="text-muted-foreground">-</span>;
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["active", "scheduled", "issued", "passed", "completed"].includes(status)) {
    return "success";
  }

  if (["draft", "pending", "planned", "paused", "maintenance", "in_progress", "needs_attention"].includes(status)) {
    return "warning";
  }

  if (["cancelled", "revoked", "inactive", "suspended"].includes(status)) {
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
