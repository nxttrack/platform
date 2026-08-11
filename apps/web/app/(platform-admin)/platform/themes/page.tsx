import { ArrowLeftRight, CalendarClock, History, Palette, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PortalThemePreview } from "@/components/platform/portal-theme-preview";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import {
  activatePortalThemeAction,
  rollbackPortalThemeAction,
  schedulePortalThemeAction,
  setPortalThemeAvailabilityAction,
  setPortalThemeLicenseAction
} from "@/lib/domain/portal-theme-control-actions";
import { getPortalThemeControlCenterData } from "@/lib/domain/portal-theme-control";
import { portalThemeCssVariables } from "@/lib/theme/portal-theme-web";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function PortalThemeControlCenterPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([
    getPortalThemeControlCenterData(),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  ]);
  if (!data.authorized) return <p className="rounded-xl border border-danger/20 bg-danger/10 p-5 text-danger">Geen toegang.</p>;
  const assignmentByTenant = new Map(data.assignments.map((row) => [row.tenant_id, row]));
  const scheduleByTenant = new Map(data.schedules.map((row) => [row.tenant_id, row]));
  const nationalLicenseByTenant = new Map(
    data.licenses
      .filter((row) => row.theme_key === "nationaal-zwem-abc")
      .map((row) => [row.tenant_id, row])
  );
  const availabilityByTenantAndRelease = new Map(
    data.availability.map((row) => [
      `${row.tenant_id}:${row.theme_key}@${row.theme_release}`,
      row
    ])
  );
  const saved = first(params.saved);
  const error = first(params.error);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Platformbeheer · immutable releases" title="Theme Control Center" subtitle="Preview, activeer, plan en rol tenantthema’s gecontroleerd terug." />
      {saved ? <p className="rounded-xl border border-success/25 bg-success/10 p-4 text-sm font-semibold text-success">Theme-operatie is transactioneel opgeslagen.</p> : null}
      {error ? <p className="rounded-xl border border-danger/25 bg-danger/10 p-4 text-sm font-semibold text-danger">Theme-operatie is veilig gestopt; de vorige actieve release bleef behouden.</p> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.catalog.map((theme) => {
          return (
            <article className="overflow-hidden border border-border bg-card shadow-card" key={`${theme.theme.key}@${theme.theme.release}`} style={{ borderRadius: theme.tokens.radius.hero }}>
              <PortalThemePreview compact manifest={theme} />
              <div className="p-4" style={portalThemeCssVariables(theme)}>
                <div className="flex items-center gap-2"><Palette className="size-4" style={{ color: theme.tokens.color.primary }} /><h2 className="font-bold">{theme.theme.displayName}</h2></div>
                <p className="mt-1 text-xs text-muted-foreground">{theme.theme.description}</p>
                <div className="mt-3 flex flex-wrap gap-1"><StatusPill tone="success">{theme.theme.release}</StatusPill><StatusPill tone={theme.badges.status === "published" ? "success" : "warning"}>badges {theme.badges.status}</StatusPill></div>
                <details className="mt-3 border-t border-border pt-3">
                  <summary className="cursor-pointer text-sm font-bold text-primary">Desktop, mobiel en states previewen</summary>
                  <div className="mt-4 min-w-[min(56rem,82vw)] max-w-full"><PortalThemePreview manifest={theme} /></div>
                </details>
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /><h2 className="text-lg font-bold">Tenantassignments</h2></div>
        <div className="mt-4 space-y-4">
          {data.tenants.map((tenant) => {
            const active = assignmentByTenant.get(tenant.id);
            const schedule = scheduleByTenant.get(tenant.id);
            const nationalLicense = nationalLicenseByTenant.get(tenant.id);
            return (
              <article className="grid gap-4 rounded-xl border border-border p-4 xl:grid-cols-[1fr_2fr]" key={tenant.id}>
                <div>
                  <p className="font-bold">{tenant.name}</p>
                  <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusPill tone={active ? "success" : "neutral"}>{active ? `${active.theme_key} ${active.theme_release}` : "Defaultfallback"}</StatusPill>
                    {schedule ? <StatusPill tone="warning">gepland {formatDate(schedule.scheduled_for)}</StatusPill> : null}
                  </div>
                </div>
                <div className="grid gap-3">
                  <div className="grid gap-2 rounded-xl border border-border bg-muted/20 p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Beschikbaar voor organisatiebeheer</p>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {data.catalog.map((theme) => {
                        const availability = availabilityByTenantAndRelease.get(
                          `${tenant.id}:${theme.theme.key}@${theme.theme.release}`
                        );
                        const enabled = availability?.is_enabled ?? false;
                        return (
                          <form action={setPortalThemeAvailabilityAction} className="rounded-lg border border-border bg-background p-2" key={`${tenant.id}:${theme.theme.key}`}>
                            <input name="tenantId" type="hidden" value={tenant.id} />
                            <input name="themeRelease" type="hidden" value={`${theme.theme.key}@${theme.theme.release}`} />
                            <input name="availability" type="hidden" value={enabled ? "disabled" : "enabled"} />
                            <input name="reason" type="hidden" value={`${enabled ? "Uitgeschakeld" : "Beschikbaar gesteld"} via Theme Control Center`} />
                            <div className="flex min-h-11 items-center justify-between gap-2">
                              <span className="min-w-0 truncate text-xs font-semibold">{theme.theme.displayName}</span>
                              <Button size="sm" type="submit" variant={enabled ? "outline" : "default"}>
                                {enabled ? "Uitschakelen" : "Inschakelen"}
                              </Button>
                            </div>
                          </form>
                        );
                      })}
                    </div>
                  </div>
                  <form action={activatePortalThemeAction} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                    <input name="tenantId" type="hidden" value={tenant.id} />
                    <ReleaseSelect catalog={data.catalog} />
                    <input className="h-11 rounded-lg border border-input bg-background px-3 text-sm" maxLength={1000} name="reason" placeholder="Reden (verplicht)" required />
                    <input className="h-11 rounded-lg border border-input bg-background px-3 text-sm" maxLength={160} name="ticketReference" placeholder="Ticket (optioneel)" />
                    <Button type="submit"><ArrowLeftRight className="size-4" />Activeer</Button>
                  </form>
                  <form action={schedulePortalThemeAction} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                    <input name="tenantId" type="hidden" value={tenant.id} />
                    <ReleaseSelect catalog={data.catalog} />
                    <input className="h-11 rounded-lg border border-input bg-background px-3 text-sm" name="scheduledFor" required type="datetime-local" />
                    <input className="h-11 rounded-lg border border-input bg-background px-3 text-sm" maxLength={1000} name="reason" placeholder="Reden (verplicht)" required />
                    <input className="h-11 rounded-lg border border-input bg-background px-3 text-sm" maxLength={160} name="ticketReference" placeholder="Ticket" />
                    <Button type="submit" variant="outline"><CalendarClock className="size-4" />Plan</Button>
                  </form>
                  {active?.previous_assignment_id ? (
                    <form action={rollbackPortalThemeAction} className="flex flex-wrap gap-2">
                      <input name="tenantId" type="hidden" value={tenant.id} />
                      <input className="h-11 min-w-56 flex-1 rounded-lg border border-input bg-background px-3 text-sm" maxLength={1000} name="reason" placeholder="Rollbackreden (verplicht)" required />
                      <input className="h-11 rounded-lg border border-input bg-background px-3 text-sm" maxLength={160} name="ticketReference" placeholder="Ticket" />
                      <Button type="submit" variant="outline"><History className="size-4" />Rol terug</Button>
                    </form>
                  ) : null}
                  <form action={setPortalThemeLicenseAction} className="grid gap-2 border-t border-border pt-3 md:grid-cols-[1fr_1fr_auto]">
                    <input name="tenantId" type="hidden" value={tenant.id} />
                    <select className="h-11 rounded-lg border border-input bg-background px-3 text-sm font-semibold" defaultValue={nationalLicense?.status === "verified" ? "verified" : "revoked"} name="licenseStatus">
                      <option value="verified">Naamlicentie geverifieerd</option>
                      <option value="revoked">Naamlicentie intrekken</option>
                    </select>
                    <input className="h-11 rounded-lg border border-input bg-background px-3 text-sm" defaultValue={nationalLicense?.evidence_reference ?? ""} maxLength={500} name="evidenceReference" placeholder="Bewijsreferentie (verplicht bij verificatie)" />
                    <input name="reason" type="hidden" value="Naamlicentie door platformbeheer ingetrokken" />
                    <Button type="submit" variant="outline"><ShieldCheck className="size-4" />Naamgate opslaan</Button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-lg font-bold">Append-only audit</h2>
        <div className="mt-4 space-y-2">
          {data.auditEvents.length ? data.auditEvents.map((event) => (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-3 text-sm" key={event.id}>
              <StatusPill tone="info">{event.event_type}</StatusPill>
              <span className="font-semibold">{event.next_theme_key ?? event.previous_theme_key} {event.next_theme_release ?? event.previous_theme_release}</span>
              <span className="text-muted-foreground">{event.reason}</span>
              <time className="ml-auto text-xs text-muted-foreground">{formatDate(event.created_at)}</time>
            </div>
          )) : <p className="text-sm text-muted-foreground">Nog geen theme-operaties.</p>}
        </div>
      </section>
    </div>
  );
}

function ReleaseSelect({ catalog }: { catalog: Awaited<ReturnType<typeof getPortalThemeControlCenterData>>["catalog"] }) {
  return (
    <select className="h-11 rounded-lg border border-input bg-background px-3 text-sm font-semibold" name="themeRelease" required>
      {catalog.map((theme) => <option key={`${theme.theme.key}@${theme.theme.release}`} value={`${theme.theme.key}@${theme.theme.release}`}>{theme.theme.displayName} · {theme.theme.release}</option>)}
    </select>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
