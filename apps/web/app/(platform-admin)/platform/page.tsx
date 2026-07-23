import { Activity, AlertTriangle, CheckCircle2, Database, Globe2, Mail } from "lucide-react";
import Link from "next/link";
import { AdminSection, DataList, DataListRow, EmptyState } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getPlatformEmailSettingsView } from "@/lib/email/platform-settings";
import { createAdminClient } from "@/lib/supabase/admin";

type OrganizationRow = {
  created_at: string;
  id: string;
  name: string;
  sector: string;
  slug: string;
  status: string;
};

type DomainRow = {
  hostname: string;
  is_primary: boolean;
  kind: string;
  status: string;
  tenant_id: string;
};

type MembershipRow = {
  role: string;
  status: string;
  tenant_id: string;
  user_id: string;
};

type PlatformMembershipRow = {
  role: string;
  status: string;
  user_id: string;
};

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const context = await requirePrivateShellContext("/platform");
  const data = await getPlatformOverviewData();
  const activeOrganizations = data.organizations.filter((organization) => organization.status === "active");
  const verifiedDomains = data.domains.filter((domain) => domain.status === "verified");
  const activeMembers = data.memberships.filter((membership) => membership.status === "active");
  const platformOwners = data.platformMemberships.filter((membership) => membership.status === "active" && membership.role === "platform_owner");
  const tenantsWithoutVerifiedDomain = activeOrganizations.filter((organization) => !data.domains.some((domain) => domain.tenant_id === organization.id && domain.status === "verified"));
  const healthSignals = [
    { detail: `${activeOrganizations.length} actieve tenants leesbaar`, icon: Database, label: "Tenant registry", ok: true },
    { detail: data.email.enabled && data.email.hasSendGridApiKey ? data.email.providerLabel : "Providerconfiguratie controleren", icon: Mail, label: "Mail delivery", ok: data.email.enabled && data.email.hasSendGridApiKey },
    { detail: tenantsWithoutVerifiedDomain.length ? `${tenantsWithoutVerifiedDomain.length} tenant(s) zonder verified domein` : "Alle actieve tenants hebben een verified domein", icon: Globe2, label: "Configuratiedrift", ok: tenantsWithoutVerifiedDomain.length === 0 },
    { detail: platformOwners.length === 1 ? "Één actieve platform owner" : `${platformOwners.length} actieve platform owners`, icon: Activity, label: "Owner governance", ok: platformOwners.length === 1 }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        action={
          <Link className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90" href="/platform/uitnodigingen">
            Uitnodiging sturen
          </Link>
        }
        kicker="Platformbeheer"
        subtitle={`Ingelogd als ${context.user.displayName ?? context.user.email ?? "platformgebruiker"}. Beheer en controleer de globale NXTTRACK-laag.`}
        title="Overzicht"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Organisaties" value={data.organizations.length.toString()} />
        <Metric label="Actief" tone="success" value={activeOrganizations.length.toString()} />
        <Metric label="Domeinen verified" value={verifiedDomains.length.toString()} />
        <Metric label="Platform owners" value={platformOwners.length.toString()} />
      </div>

      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-gradient-to-r from-slate-950 to-blue-950 px-5 py-4 text-white">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-aqua">Control plane</p><h2 className="mt-1 text-xl font-bold">Platform health & configuratiedrift</h2></div>
          <StatusPill tone={healthSignals.every((signal) => signal.ok) ? "success" : "warning"}>{healthSignals.filter((signal) => signal.ok).length}/{healthSignals.length} gezond</StatusPill>
        </div>
        <div className="grid gap-px bg-border md:grid-cols-2 xl:grid-cols-4">
          {healthSignals.map((signal) => { const Icon = signal.icon; return <div className="bg-card p-4" key={signal.label}><div className="flex items-center justify-between gap-3"><span className={`grid size-9 place-items-center rounded-xl ${signal.ok ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}><Icon className="size-5" /></span>{signal.ok ? <CheckCircle2 className="size-5 text-success" /> : <AlertTriangle className="size-5 text-warning" />}</div><p className="mt-4 font-bold text-foreground">{signal.label}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{signal.detail}</p></div>; })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        <AdminSection description="Staging gebruikt deze lijst als operationele bron voor subdomeinen, status en organisatiebeheer." title="Organisaties">
          {data.organizations.length === 0 ? (
            <EmptyState>Nog geen organisaties gevonden.</EmptyState>
          ) : (
            <DataList>
              {data.organizations.map((organization) => {
                const primaryDomain = data.domains.find((domain) => domain.tenant_id === organization.id && domain.is_primary);
                const memberCount = activeMembers.filter((membership) => membership.tenant_id === organization.id).length;

                return (
                  <DataListRow
                    aside={<StatusPill tone={organization.status === "active" ? "success" : organization.status === "suspended" ? "danger" : "warning"}>{organization.status}</StatusPill>}
                    key={organization.id}
                    meta={`${primaryDomain?.hostname ?? `${organization.slug}.nxttrack.nl`} - ${memberCount} actieve gebruiker(s) - ${sectorLabel(organization.sector)}`}
                    title={organization.name}
                  />
                );
              })}
            </DataList>
          )}
        </AdminSection>

        <AdminSection description="Deze signalen bepalen of invites, resets en notificaties betrouwbaar uit de stagingomgeving komen." title="Mailprovider">
          <div className="space-y-3 text-sm">
            <StatusLine label="Database migration" ok={data.email.settingsAvailable} value={data.email.settingsAvailable ? "beschikbaar" : "niet toegepast"} />
            <StatusLine label="Provider actief" ok={data.email.enabled} value={data.email.enabled ? data.email.providerLabel : "niet actief"} />
            <StatusLine label="Afzender" ok={Boolean(data.email.fromEmail)} value={data.email.fromEmail || "niet ingesteld"} />
            <StatusLine label="SendGrid API key" ok={data.email.hasSendGridApiKey} value={data.email.hasSendGridApiKey ? "ingesteld" : "niet ingesteld"} />
          </div>
          <Link className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline" href="/platform/instellingen">
            Mailinstellingen beheren
          </Link>
        </AdminSection>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <AdminSection title="Domeinen">
          {data.domains.length === 0 ? (
            <EmptyState>Nog geen domeinen geregistreerd.</EmptyState>
          ) : (
            <DataList>
              {data.domains.map((domain) => {
                const organization = data.organizations.find((item) => item.id === domain.tenant_id);

                return (
                  <DataListRow
                    aside={<StatusPill tone={domain.status === "verified" ? "success" : domain.status === "disabled" ? "danger" : "warning"}>{domain.status}</StatusPill>}
                    key={domain.hostname}
                    meta={`${organization?.name ?? "Onbekende organisatie"} - ${domain.kind}${domain.is_primary ? " - primair" : ""}`}
                    title={domain.hostname}
                  />
                );
              })}
            </DataList>
          )}
        </AdminSection>

        <AdminSection title="Platformrollen">
          {data.platformMemberships.length === 0 ? (
            <EmptyState>Nog geen platformrollen gevonden.</EmptyState>
          ) : (
            <DataList>
              {data.platformMemberships.map((membership) => (
                <DataListRow
                  aside={<StatusPill tone={membership.status === "active" ? "success" : "warning"}>{membership.status}</StatusPill>}
                  key={`${membership.user_id}-${membership.role}`}
                  meta={membership.user_id}
                  title={platformRoleLabel(membership.role)}
                />
              ))}
            </DataList>
          )}
        </AdminSection>
      </div>
    </div>
  );
}

async function getPlatformOverviewData() {
  const admin = createAdminClient();
  const [organizationsResult, domainsResult, membershipsResult, platformMembershipsResult, emailSettings] = await Promise.all([
    admin.from("tenants").select("id, slug, name, sector, status, created_at").order("created_at", { ascending: false }),
    admin.from("tenant_domains").select("tenant_id, hostname, kind, status, is_primary").order("hostname"),
    admin.from("tenant_memberships").select("tenant_id, user_id, role, status"),
    admin.from("platform_memberships").select("user_id, role, status"),
    getPlatformEmailSettingsView()
  ]);

  assertResult(organizationsResult.error, "organizations");
  assertResult(domainsResult.error, "domains");
  assertResult(membershipsResult.error, "organization memberships");
  assertResult(platformMembershipsResult.error, "platform memberships");

  return {
    organizations: (organizationsResult.data ?? []) as OrganizationRow[],
    domains: (domainsResult.data ?? []) as DomainRow[],
    memberships: (membershipsResult.data ?? []) as MembershipRow[],
    platformMemberships: (platformMembershipsResult.data ?? []) as PlatformMembershipRow[],
    email: {
      enabled: emailSettings.enabled,
      fromEmail: emailSettings.fromEmail,
      hasSendGridApiKey: emailSettings.hasSendGridApiKey,
      providerLabel: emailSettings.provider === "smtp" ? "SMTP" : "SendGrid API",
      settingsAvailable: emailSettings.settingsAvailable
    }
  };
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "success" | "neutral" }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${tone === "success" ? "text-success" : "text-foreground"}`}>{value}</p>
    </section>
  );
}

function StatusLine({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2">
      <span className="font-semibold text-foreground">{label}</span>
      <StatusPill tone={ok ? "success" : "warning"}>{value}</StatusPill>
    </div>
  );
}

function sectorLabel(sector: string) {
  const labels: Record<string, string> = {
    dance_school: "Dansschool",
    football_school: "Voetbalschool",
    generic_lessons: "Lessenorganisatie",
    martial_arts_school: "Vechtsportschool",
    sports_club: "Sportclub",
    swim_school: "Zwemschool"
  };

  return labels[sector] ?? sector;
}

function platformRoleLabel(role: string) {
  const labels: Record<string, string> = {
    platform_admin: "Platform admin",
    platform_owner: "Platform owner",
    platform_support: "Platform support"
  };

  return labels[role] ?? role;
}

function assertResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load platform ${label}: ${error.message}`);
  }
}
