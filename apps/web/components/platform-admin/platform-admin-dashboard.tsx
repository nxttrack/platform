import { KeyRound, Mail, RotateCcw, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { createTenantSuperAdminAction, resetTenantSuperAdminPasswordAction, updateTenantSuperAdminAction } from "@/lib/platform-admin/super-admin-actions";
import type { PlatformAdminSnapshot, PlatformTenantWithAdmins } from "@/lib/platform-admin/platform-admin-read-model";

type PlatformAdminDashboardProps = {
  snapshot: PlatformAdminSnapshot;
  notice?: string | null;
  error?: string | null;
};

export function PlatformAdminDashboard({ snapshot, notice, error }: PlatformAdminDashboardProps) {
  const superAdminCount = snapshot.tenants.reduce((count, tenant) => count + tenant.superAdmins.length, 0);
  const pendingInvitations = snapshot.tenants.reduce((count, tenant) => count + tenant.invitations.filter((invite) => invite.status === "created" || invite.status === "sent").length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Platform admin"
        title="Tenant super admins"
        subtitle="Beheer tenant owners, tijdelijke wachtwoorden en eerste-login wachtwoordwissels vanuit NXTTRACK."
        action={<StatusPill tone={snapshot.status === "ready" ? "success" : "warning"}>{snapshot.status}</StatusPill>}
      />

      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div> : null}
      {snapshot.errors.length > 0 ? (
        <Card>
          <h2 className="text-sm font-semibold">Aandacht nodig</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {snapshot.errors.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<Users className="h-5 w-5" />} label="Tenants" value={snapshot.tenants.length.toString()} detail="platform scope" />
        <MetricCard icon={<ShieldCheck className="h-5 w-5" />} label="Super admins" value={superAdminCount.toString()} detail="tenant_owner rollen" />
        <MetricCard icon={<Mail className="h-5 w-5" />} label="Uitnodigingen" value={pendingInvitations.toString()} detail="open of recent verstuurd" />
      </div>

      <Card>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Super admin toevoegen</h2>
            <p className="mt-1 text-sm text-muted-foreground">De gebruiker ontvangt een tijdelijk wachtwoord per mail en moet na eerste login direct een eigen wachtwoord kiezen.</p>
          </div>
          <KeyRound className="h-5 w-5 text-primary" />
        </div>
        <form action={createTenantSuperAdminAction} className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_auto]">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tenant</span>
            <select className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary/20 focus:ring-4" name="tenant_id" required>
              {snapshot.tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Naam</span>
            <input className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary/20 focus:ring-4" name="full_name" placeholder="Naam" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">E-mail</span>
            <input className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary/20 focus:ring-4" name="email" placeholder="admin@example.nl" type="email" required />
          </label>
          <button className="mt-5 h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-glow" type="submit">
            Toevoegen
          </button>
        </form>
      </Card>

      <div className="space-y-4">
        {snapshot.tenants.map((tenant) => (
          <TenantAdminCard key={tenant.id} tenant={tenant} />
        ))}
      </div>
    </div>
  );
}

function TenantAdminCard({ tenant }: { tenant: PlatformTenantWithAdmins }) {
  const primaryDomain = tenant.domains.find((domain) => domain.is_primary) ?? tenant.domains[0] ?? null;

  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold">{tenant.name}</h2>
            <StatusPill tone={tenant.status === "active" ? "success" : "warning"}>{tenant.status}</StatusPill>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {tenant.slug} · {tenant.sector}
            {primaryDomain ? ` · ${primaryDomain.hostname}` : ""}
          </p>
        </div>
        <StatusPill tone="info">{tenant.superAdmins.length} super admin{tenant.superAdmins.length === 1 ? "" : "s"}</StatusPill>
      </div>

      {tenant.superAdmins.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">Nog geen tenant super admins voor deze tenant.</div>
      ) : (
        <div className="space-y-3">
          {tenant.superAdmins.map((admin) => (
            <div key={admin.id} className="rounded-2xl border border-border bg-background p-4">
              <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_auto_auto] lg:items-end">
                <form action={updateTenantSuperAdminAction} className="contents">
                  <input name="membership_id" type="hidden" value={admin.id} />
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Naam</span>
                    <input
                      className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none ring-primary/20 focus:ring-4"
                      defaultValue={admin.profile?.full_name ?? admin.latestInvitation?.full_name ?? ""}
                      name="full_name"
                      placeholder="Naam"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
                    <select className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none ring-primary/20 focus:ring-4" defaultValue={admin.status} name="status">
                      <option value="active">Actief</option>
                      <option value="suspended">Geschorst</option>
                    </select>
                  </label>
                  <button className="h-10 rounded-xl border border-border bg-card px-4 text-sm font-semibold hover:bg-muted" type="submit">
                    Bijwerken
                  </button>
                </form>

                <form action={resetTenantSuperAdminPasswordAction}>
                  <input name="membership_id" type="hidden" value={admin.id} />
                  <input name="full_name" type="hidden" value={admin.profile?.full_name ?? admin.latestInvitation?.full_name ?? ""} />
                  <button className="flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800" type="submit">
                    <RotateCcw className="h-4 w-4" />
                    Tijdelijk wachtwoord
                  </button>
                </form>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{admin.invited_email ?? admin.latestInvitation?.email ?? "Geen e-mail bekend"}</span>
                <span>Rol: tenant_owner</span>
                {admin.latestInvitation ? <span>Laatste mail: {admin.latestInvitation.status} · {formatDate(admin.latestInvitation.created_at)}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {tenant.invitations.length > 0 ? (
        <details className="mt-4 rounded-2xl border border-border bg-muted/40 p-4">
          <summary className="cursor-pointer text-sm font-semibold">Uitnodiging audit</summary>
          <div className="mt-3 space-y-2">
            {tenant.invitations.slice(0, 6).map((invite) => (
              <div key={invite.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-3 py-2 text-xs text-muted-foreground">
                <span>{invite.email}</span>
                <span>{invite.status}</span>
                <span>{invite.delivery_provider ?? "geen provider"}</span>
                <span>{formatDate(invite.created_at)}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </Card>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-bold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      </div>
    </Card>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
