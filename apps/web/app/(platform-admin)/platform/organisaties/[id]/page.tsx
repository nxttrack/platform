import { ArrowLeft, Building2, ExternalLink, MailPlus, ShieldCheck, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminSection, EmptyState, Field, SelectField, SubmitButton } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { DirtyForm } from "@/components/ui/dirty-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { roleLabels, tenantRoles, type TenantRole } from "@/lib/auth/roles";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import {
  createTenantAccountAction,
  removeTenantDomainAction,
  removeTenantMemberAction,
  resendTenantInvitationAction,
  revokeTenantInvitationAction,
  saveTenantDomainAction,
  updatePlatformTenantAction,
  updateTenantMemberAction
} from "@/lib/domain/platform-tenant-actions";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type MemberView = {
  email: string;
  fullName: string;
  id: string;
  invitedEmail: string;
  role: TenantRole;
  status: string;
  userId: string;
};

type PersonView = Pick<MemberView, "email" | "fullName" | "userId">;

export const dynamic = "force-dynamic";

export default async function PlatformOrganizationDetailPage({ params, searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/platform");
  const { id: tenantId } = await params;
  if (!isUuid(tenantId)) notFound();
  const query = (await searchParams) ?? {};
  const data = await getOrganizationDetail(tenantId);
  if (!data) notFound();
  const canManage = context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin") ?? false;
  const saved = getParam(query, "saved");
  const error = getParam(query, "error");
  const members = await enrichMembers(data.memberships);
  const profileByUser = new Map(members.map((member) => [member.userId, member]));
  const auditActors = await enrichPeople(data.auditEvents.flatMap((event) => event.actor_user_id ? [event.actor_user_id] : []));
  const peopleByUser = new Map<string, PersonView>([
    ...members.map((member) => [member.userId, member] as const),
    ...auditActors.map((person) => [person.userId, person] as const)
  ]);
  const activeAdmins = members.filter((member) => member.status === "active" && (member.role === "tenant_owner" || member.role === "tenant_admin"));
  const primaryDomain = data.domains.find((domain) => domain.is_primary);

  return (
    <div className="space-y-6">
      <Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline" href="/platform">
        <ArrowLeft className="size-4" />
        Terug naar organisaties
      </Link>

      <PageHeader
        action={primaryDomain ? <a className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-muted" href={`https://${primaryDomain.hostname}`} rel="noreferrer" target="_blank">Open website<ExternalLink className="size-4" /></a> : null}
        kicker="Platform · Organisatiedetail"
        subtitle={`${primaryDomain?.hostname ?? `${data.tenant.slug}.nxttrack.nl`} · ${sectorLabel(data.tenant.sector)}`}
        title={data.tenant.name}
      />

      <RouteFeedback success={saved ? successMessage(saved) : null} error={error ? errorMessage(error) : null} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Users} label="Actieve gebruikers" value={members.filter((member) => member.status === "active").length} />
        <Metric icon={ShieldCheck} label="Owners en admins" value={activeAdmins.length} />
        <Metric icon={MailPlus} label="Open uitnodigingen" value={data.invitations.filter((invitation) => invitation.status === "pending" && new Date(invitation.expires_at).getTime() > Date.now()).length} />
        <Metric icon={Building2} label="Domeinen" value={data.domains.length} />
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.55fr)]">
        <AdminSection title="Organisatie-instellingen" description="Naam, slug, sector en operationele status van deze tenant.">
          {canManage ? (
            <DirtyForm action={updatePlatformTenantAction}>
              <input name="tenantId" type="hidden" value={tenantId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field defaultValue={data.tenant.name} label="Naam" name="name" required />
                <Field defaultValue={data.tenant.slug} label="Slug" name="slug" required />
                <SelectField defaultValue={data.tenant.sector} label="Sector" name="sector">
                  <option value="swim_school">Zwemschool</option>
                  <option value="football_school">Voetbalschool</option>
                  <option value="sports_club">Sportclub</option>
                  <option value="martial_arts_school">Vechtsportschool</option>
                  <option value="dance_school">Dansschool</option>
                  <option value="generic_lessons">Lessenorganisatie</option>
                </SelectField>
                <SelectField defaultValue={data.tenant.status} label="Status" name="status">
                  <option value="active">Actief</option>
                  <option value="inactive">Inactief</option>
                  <option value="suspended">Geblokkeerd</option>
                </SelectField>
              </div>
              <SubmitButton>Organisatie opslaan</SubmitButton>
            </DirtyForm>
          ) : <ReadOnlyNotice />}
          <p className="mt-4 text-xs text-muted-foreground">
            Regio-instellingen: {data.settings?.locale ?? "nl-NL"} · {data.settings?.timezone ?? "Europe/Amsterdam"}
          </p>
        </AdminSection>

        <AdminSection title="Organisatiebeheerders" description="Tenant owners en tenant admins, weergegeven op naam en e-mailadres.">
          {activeAdmins.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {activeAdmins.map((member) => (
                <article className="rounded-2xl border border-primary/15 bg-primary/5 p-4" key={member.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate font-bold text-foreground">{member.fullName}</p><p className="mt-1 truncate text-sm text-muted-foreground">{member.email}</p></div>
                    <StatusPill tone={member.role === "tenant_owner" ? "info" : "success"}>{roleLabels[member.role]}</StatusPill>
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyState>Deze organisatie heeft geen actieve owner of beheerder. Herstel dit vóór verdere mutaties.</EmptyState>}
        </AdminSection>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(320px,0.7fr)_minmax(0,1.8fr)]">
        <AdminSection title="Account aanmaken" description="Maakt zo nodig het Auth-account aan en verstuurt een veilige uitnodigingscode. Er wordt geen wachtwoord per e-mail verzonden.">
          {canManage ? (
            <DirtyForm action={createTenantAccountAction}>
              <input name="tenantId" type="hidden" value={tenantId} />
              <Field autoComplete="name" label="Naam" name="fullName" required />
              <Field autoComplete="email" label="E-mail" name="email" required type="email" />
              <SelectField defaultValue="tenant_admin" label="Rol" name="role">
                {tenantRoles.filter((role) => role !== "athlete").map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
              </SelectField>
              <SubmitButton>Account aanmaken en uitnodigen</SubmitButton>
            </DirtyForm>
          ) : <ReadOnlyNotice />}
        </AdminSection>

        <AdminSection title="Gebruikers en rollen" description="Wijzig profiel, e-mailadres, tenantrol en toegang. Een gebruiker kan meerdere rollen hebben; een e-mailadres is accountbreed en kan hier alleen worden gewijzigd als het account exclusief bij deze organisatie hoort.">
          {members.length ? (
            <div className="grid gap-3">
              {members.map((member) => (
                <details className="group rounded-2xl border border-border bg-card open:shadow-soft" key={member.id}>
                  <summary className="flex min-h-16 cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <UserCog className="size-5 text-primary" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-bold">{member.fullName}</span><span className="block truncate text-sm text-muted-foreground">{member.email}</span></span>
                    <StatusPill tone={member.status === "active" ? "success" : member.status === "invited" ? "warning" : "neutral"}>{member.status}</StatusPill>
                    <StatusPill tone={member.role === "tenant_owner" || member.role === "tenant_admin" ? "info" : "neutral"}>{roleLabels[member.role]}</StatusPill>
                  </summary>
                  <div className="border-t border-border p-4">
                    {canManage ? (
                      <div className="grid gap-5 xl:grid-cols-[1fr_auto]">
                        <DirtyForm action={updateTenantMemberAction}>
                          <input name="tenantId" type="hidden" value={tenantId} />
                          <input name="membershipId" type="hidden" value={member.id} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field defaultValue={member.fullName} label="Naam" name="fullName" required />
                            <Field defaultValue={member.email} label="E-mail" name="email" required type="email" />
                            <SelectField defaultValue={member.role} label="Rol" name="role">
                              {tenantRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                            </SelectField>
                            <SelectField defaultValue={member.status} label="Toegang" name="status">
                              <option value="invited">Uitgenodigd</option>
                              <option value="active">Actief</option>
                              <option value="suspended">Geblokkeerd</option>
                            </SelectField>
                          </div>
                          <SubmitButton>Gebruiker bijwerken</SubmitButton>
                        </DirtyForm>
                        <div className="flex items-end">
                          <ConfirmActionForm
                            action={removeTenantMemberAction}
                            confirmLabel="Toegang verwijderen"
                            description={`Verwijder de rol ${roleLabels[member.role]} van ${member.fullName}. Een Auth-account wordt alleen gewist wanneer je dit aanvinkt én het account nergens anders gebruikt wordt.`}
                            hiddenFields={{ tenantId, membershipId: member.id }}
                            title="Organisatietoegang verwijderen?"
                            triggerLabel="Verwijderen"
                            triggerVariant="destructive"
                          >
                            <label className="mb-3 flex max-w-xs items-start gap-2 rounded-xl border border-danger/20 bg-danger/5 p-3 text-xs leading-5 text-muted-foreground">
                              <input className="mt-1 size-4 accent-danger" name="removeAuthAccount" type="checkbox" />
                              Verwijder ook het Auth-account als het exclusief is en geen dossierkoppelingen heeft.
                            </label>
                          </ConfirmActionForm>
                        </div>
                      </div>
                    ) : <ReadOnlyNotice />}
                  </div>
                </details>
              ))}
            </div>
          ) : <EmptyState>Nog geen gebruikers of rollen voor deze organisatie.</EmptyState>}
        </AdminSection>
      </div>

      <AdminSection title="Uitnodigingen" description="Bekijk ontvanger, bezorgstatus en vervaldatum. Oude codes worden bij opnieuw versturen direct ingetrokken.">
        {data.invitations.length ? (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-muted/70 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Naam en e-mail</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">Bezorging</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Verloopt</th><th className="px-4 py-3 text-right">Acties</th></tr></thead>
              <tbody className="divide-y divide-border">
                {data.invitations.map((invitation) => {
                  const profile = invitation.invited_user_id ? profileByUser.get(invitation.invited_user_id) : null;
                  const expired = new Date(invitation.expires_at).getTime() <= Date.now();
                  return (
                    <tr key={invitation.id}>
                      <td className="px-4 py-3"><p className="font-semibold">{profile?.fullName ?? "Naam niet ingevuld"}</p><p className="text-xs text-muted-foreground">{invitation.email}</p></td>
                      <td className="px-4 py-3">{isTenantRoleValue(invitation.role) ? roleLabels[invitation.role] : invitation.role}</td>
                      <td className="px-4 py-3"><StatusPill tone={invitation.delivery_status === "sent" ? "success" : invitation.delivery_status === "failed" ? "danger" : "neutral"}>{invitation.delivery_status}</StatusPill></td>
                      <td className="px-4 py-3"><StatusPill tone={invitation.status === "accepted" ? "success" : invitation.status === "pending" && !expired ? "warning" : "neutral"}>{invitation.status === "pending" && expired ? "verlopen" : invitation.status}</StatusPill></td>
                      <td className="px-4 py-3">{formatDateTime(invitation.expires_at)}</td>
                      <td className="px-4 py-3">
                        {canManage && invitation.status !== "accepted" ? <div className="flex justify-end gap-2"><ConfirmActionForm action={resendTenantInvitationAction} confirmLabel="Opnieuw versturen" description="De oude uitnodigingscode wordt ingetrokken en er wordt een nieuwe code met een nieuwe vervaldatum verzonden." hiddenFields={{ tenantId, invitationId: invitation.id }} title="Nieuwe uitnodiging versturen?" triggerLabel="Opnieuw sturen" triggerVariant="outline" />{invitation.status === "pending" ? <ConfirmActionForm action={revokeTenantInvitationAction} confirmLabel="Intrekken" description="De uitnodigingscode werkt daarna niet meer en de uitgenodigde rol wordt geblokkeerd." hiddenFields={{ tenantId, invitationId: invitation.id }} title="Uitnodiging intrekken?" triggerLabel="Intrekken" triggerVariant="destructive" /> : null}</div> : <span className="block text-right text-xs text-muted-foreground">Geen actie</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState>Voor deze organisatie zijn nog geen uitnodigingen geregistreerd.</EmptyState>}
      </AdminSection>

      <div className="grid gap-5 xl:grid-cols-2">
        <AdminSection title="Domeinen" description="Beheer subdomeinen, custom domains, verificatiestatus en het primaire domein.">
          <div className="grid gap-3">
            {data.domains.map((domain) => (
              <details className="rounded-2xl border border-border" key={domain.id}>
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3"><span className="min-w-0 flex-1 truncate font-semibold">{domain.hostname}</span>{domain.is_primary ? <StatusPill tone="info">primair</StatusPill> : null}<StatusPill tone={domain.status === "verified" ? "success" : domain.status === "disabled" ? "danger" : "warning"}>{domain.status}</StatusPill></summary>
                {canManage ? (
                  <div className="grid gap-3 border-t border-border p-4">
                    <DirtyForm action={saveTenantDomainAction}>
                      <input name="tenantId" type="hidden" value={tenantId} />
                      <input name="domainId" type="hidden" value={domain.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field defaultValue={domain.hostname} label="Hostname" name="hostname" required />
                        <SelectField defaultValue={domain.kind} label="Type" name="kind">
                          <option value="subdomain">Subdomein</option>
                          <option value="custom_domain">Eigen domein</option>
                        </SelectField>
                        <SelectField defaultValue={domain.status} label="Status" name="status">
                          <option value="pending">In afwachting</option>
                          <option value="verified">Geverifieerd</option>
                          <option value="disabled">Uitgeschakeld</option>
                        </SelectField>
                        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                          <input defaultChecked={domain.is_primary} name="isPrimary" type="checkbox" />
                          Primair domein
                        </label>
                      </div>
                      <SubmitButton>Domein opslaan</SubmitButton>
                    </DirtyForm>
                    {!domain.is_primary ? (
                      <ConfirmActionForm
                        action={removeTenantDomainAction}
                        confirmLabel="Domein verwijderen"
                        description="Dit verwijdert alleen de domeinregistratie uit NXTTRACK. DNS-records bij de provider blijven bestaan."
                        hiddenFields={{ tenantId, domainId: domain.id }}
                        title="Domein verwijderen?"
                        triggerLabel="Verwijderen"
                        triggerVariant="destructive"
                      />
                    ) : null}
                  </div>
                ) : null}
              </details>
            ))}
            {canManage ? <details className="rounded-2xl border border-dashed border-border"><summary className="flex min-h-14 cursor-pointer list-none items-center px-4 font-semibold text-primary">Nieuw domein toevoegen</summary><div className="border-t border-border p-4"><DirtyForm action={saveTenantDomainAction}><input name="tenantId" type="hidden" value={tenantId} /><Field label="Hostname" name="hostname" placeholder="portal.zwemschool.nl" required /><div className="grid gap-3 sm:grid-cols-2"><SelectField defaultValue="custom_domain" label="Type" name="kind"><option value="subdomain">Subdomein</option><option value="custom_domain">Eigen domein</option></SelectField><SelectField defaultValue="pending" label="Status" name="status"><option value="pending">In afwachting</option><option value="verified">Geverifieerd</option><option value="disabled">Uitgeschakeld</option></SelectField></div><label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input name="isPrimary" type="checkbox" />Primair domein</label><SubmitButton>Domein toevoegen</SubmitButton></DirtyForm></div></details> : null}
          </div>
        </AdminSection>

        <AdminSection title="Recente platformacties" description="Audittrail van wijzigingen aan organisatie, accounts, rollen, uitnodigingen en domeinen.">
          {data.auditEvents.length ? <div className="grid gap-2">{data.auditEvents.map((event) => { const actor = event.actor_user_id ? peopleByUser.get(event.actor_user_id) : null; return <article className="rounded-xl border border-border px-3 py-3" key={event.id}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{auditLabel(event.event_type)}</p><p className="mt-1 text-xs text-muted-foreground">Door {actor ? `${actor.fullName} · ${actor.email}` : "Platformbeheerder"}</p></div><time className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</time></div></article>; })}</div> : <EmptyState>Nog geen platformbeheeracties voor deze organisatie.</EmptyState>}
          <Link className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline" href="/platform/offboarding">Offboarding en definitieve verwijdering beheren</Link>
        </AdminSection>
      </div>
    </div>
  );
}

async function getOrganizationDetail(tenantId: string) {
  const admin = createAdminClient();
  const [tenant, settings, domains, memberships, invitations, audits] = await Promise.all([
    admin.from("tenants").select("id, name, slug, sector, status, created_at, updated_at").eq("id", tenantId).maybeSingle(),
    admin.from("tenant_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
    admin.from("tenant_domains").select("id, hostname, kind, status, is_primary, created_at").eq("tenant_id", tenantId).order("is_primary", { ascending: false }).order("hostname"),
    admin.from("tenant_memberships").select("id, user_id, role, status, invited_email, created_at, updated_at").eq("tenant_id", tenantId).order("created_at"),
    admin.from("auth_invitations").select("id, invited_user_id, email, role, status, delivery_status, delivery_error, expires_at, accepted_at, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    admin.from("platform_admin_audit_events").select("id, actor_user_id, event_type, subject_type, subject_id, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(30)
  ]);
  if (tenant.error || !tenant.data) return null;
  if (settings.error || domains.error || memberships.error || invitations.error || audits.error) throw new Error("Organisatiedetails konden niet volledig worden geladen.");
  return { tenant: tenant.data, settings: settings.data, domains: domains.data ?? [], memberships: memberships.data ?? [], invitations: invitations.data ?? [], auditEvents: audits.data ?? [] };
}

async function enrichMembers(rows: Array<{ id: string; invited_email: string | null; role: string; status: string; user_id: string }>): Promise<MemberView[]> {
  const admin = createAdminClient();
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const profiles = userIds.length ? await admin.from("profiles").select("id, full_name, email").in("id", userIds) : { data: [] };
  const profileById = new Map((profiles.data ?? []).map((profile) => [profile.id, profile]));
  const missingIds = userIds.filter((id) => !profileById.get(id)?.email);
  const authUsers = await Promise.all(missingIds.map(async (id) => {
    const result = await admin.auth.admin.getUserById(id);
    return [id, result.data.user] as const;
  }));
  const authById = new Map(authUsers);
  return rows.filter((row): row is typeof row & { role: TenantRole } => isTenantRoleValue(row.role)).map((row) => {
    const profile = profileById.get(row.user_id);
    const auth = authById.get(row.user_id);
    const email = profile?.email ?? auth?.email ?? row.invited_email ?? "E-mail onbekend";
    return { email, fullName: profile?.full_name?.trim() || email.split("@")[0], id: row.id, invitedEmail: row.invited_email ?? "", role: row.role, status: row.status, userId: row.user_id };
  });
}

async function enrichPeople(userIds: string[]): Promise<PersonView[]> {
  const admin = createAdminClient();
  const uniqueIds = [...new Set(userIds)];
  if (!uniqueIds.length) return [];
  const profiles = await admin.from("profiles").select("id, full_name, email").in("id", uniqueIds);
  const profileById = new Map((profiles.data ?? []).map((profile) => [profile.id, profile]));
  return Promise.all(uniqueIds.map(async (userId) => {
    const profile = profileById.get(userId);
    if (profile?.email) {
      return { email: profile.email, fullName: profile.full_name?.trim() || profile.email.split("@")[0], userId };
    }
    const auth = await admin.auth.admin.getUserById(userId);
    const email = auth.data.user?.email ?? "E-mail onbekend";
    return { email, fullName: email.split("@")[0], userId };
  }));
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return <section className="rounded-2xl border border-border bg-card p-4 shadow-soft"><Icon className="size-5 text-primary" /><p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p></section>;
}
function ReadOnlyNotice() { return <p className="rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">Platform support heeft alleen-lezen toegang. Een platform owner of admin kan deze gegevens wijzigen.</p>; }
function isTenantRoleValue(value: string): value is TenantRole { return tenantRoles.includes(value as TenantRole); }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function getParam(params: Record<string, string | string[] | undefined>, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] : value; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function sectorLabel(value: string) { return ({ swim_school: "Zwemschool", football_school: "Voetbalschool", sports_club: "Sportclub", martial_arts_school: "Vechtsportschool", dance_school: "Dansschool", generic_lessons: "Lessenorganisatie" } as Record<string, string>)[value] ?? value; }
function auditLabel(value: string) { return ({ "platform.tenant_updated": "Organisatie bijgewerkt", "platform.account_invited": "Account aangemaakt en uitgenodigd", "platform.membership_updated": "Gebruiker of rol bijgewerkt", "platform.membership_removed": "Organisatietoegang verwijderd", "platform.invitation_resent": "Uitnodiging opnieuw verstuurd", "platform.invitation_revoked": "Uitnodiging ingetrokken", "platform.domain_created": "Domein toegevoegd", "platform.domain_updated": "Domein bijgewerkt", "platform.domain_removed": "Domein verwijderd" } as Record<string, string>)[value] ?? value; }
function successMessage(value: string) { return ({ tenant: "Organisatie-instellingen zijn opgeslagen.", account_invited: "Het account is aangemaakt en de uitnodiging is verstuurd.", member: "Gebruiker en rol zijn bijgewerkt.", member_removed: "De organisatietoegang is verwijderd; het Auth-account is behouden.", member_and_auth_removed: "Organisatietoegang en het exclusieve Auth-account zijn verwijderd.", member_removed_auth_retained: "De toegang is verwijderd. Het Auth-account is behouden omdat het gedeeld is of nog dossierkoppelingen heeft.", invite_resent: "Een nieuwe uitnodigingscode is verstuurd; oude codes zijn ingetrokken.", invite_revoked: "De uitnodiging is ingetrokken.", domain: "Domeininstellingen zijn opgeslagen.", domain_removed: "Het domein is verwijderd." } as Record<string, string>)[value] ?? "Wijziging opgeslagen."; }
function errorMessage(value: string) { return ({ tenant_update: "De organisatie kon niet worden bijgewerkt. Controleer of de slug uniek is.", account_create: "Het account kon niet worden aangemaakt of uitgenodigd.", member_missing: "Deze gebruiker of rol bestaat niet meer.", last_owner: "De laatste actieve organisatie-eigenaar kan niet worden verwijderd, geblokkeerd of gedegradeerd.", role_duplicate: "Deze gebruiker heeft de gekozen rol al.", auth_missing: "Het gekoppelde Auth-account bestaat niet.", shared_email_change: "Dit account wordt ook buiten deze organisatie gebruikt. Wijzig het e-mailadres daarom niet vanuit één organisatie.", email_conflict: "Dit e-mailadres is al in gebruik of kon niet worden bijgewerkt.", profile_update: "Naam en e-mailadres konden niet worden opgeslagen.", member_update: "De rol of toegang kon niet worden bijgewerkt.", member_updated_invite_failed: "Het profiel is bijgewerkt, maar de nieuwe uitnodiging kon niet worden verstuurd.", member_remove: "De organisatietoegang kon niet worden verwijderd.", auth_remove: "De toegang is verwijderd, maar het exclusieve Auth-account kon niet worden gewist.", invite_state: "Deze uitnodiging kan in de huidige status niet worden aangepast.", invite_resend: "De nieuwe uitnodiging kon niet worden verstuurd.", invite_revoke: "De uitnodiging kon niet worden ingetrokken.", domain_validation: "Vul een geldige volledige hostname in.", domain_save: "Het domein kon niet worden opgeslagen. Controleer of het uniek is.", primary_domain_remove: "Maak eerst een ander domein primair voordat je dit domein verwijdert.", domain_remove: "Het domein kon niet worden verwijderd." } as Record<string, string>)[value] ?? "De beheeractie is niet gelukt."; }
