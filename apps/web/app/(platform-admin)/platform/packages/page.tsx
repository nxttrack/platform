import {
  Boxes,
  Eye,
  FlaskConical,
  Gauge,
  Layers3,
  Plus,
  ShieldCheck,
  ToggleLeft
} from "lucide-react";
import Link from "next/link";

import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { Field, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { ShadowPackageTenantsTable } from "@/components/platform/shadow-package-tenants-table";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { DirtyForm } from "@/components/ui/dirty-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import {
  createShadowPackageAction,
  saveShadowPackageConfigurationAction,
  updateTechnicalReleaseFlagAction
} from "@/lib/domain/shadow-entitlements-actions";
import {
  getShadowPackageControlCenter,
  shadowLimitDefinitions
} from "@/lib/domain/shadow-entitlements";
import { cn } from "@/lib/utils";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

export default async function PlatformPackagesPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([
    getShadowPackageControlCenter(),
    searchParams ?? Promise.resolve({})
  ]);
  const selectedId = getParam(params, "package");
  const selectedPackage = data.packages.find((item) => item.id === selectedId)
    ?? data.packages.find((item) => item.status === "draft")
    ?? data.packages[0];

  return (
    <div className="space-y-5">
      <PageHeader
        action={data.canManage ? (
          <AdminActionDrawer
            description="Maak een neutraal conceptpakket voor simulaties. Prijsstelling en handhaving vallen bewust buiten deze module."
            icon={<Plus className="size-4" />}
            title="Conceptpakket maken"
            triggerLabel="Nieuw pakket"
            width="wide"
          >
            <DirtyForm action={createShadowPackageAction}>
              <Field description="Kleine letters, cijfers en underscores; bijvoorbeeld groei_plus." label="Technische sleutel" name="key" pattern="[a-z0-9_]{3,80}" required />
              <Field label="Pakketnaam" maxLength={120} name="name" required />
              <TextAreaField label="Heldere positionering" maxLength={500} name="description" required />
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/8 p-3 text-xs leading-5 text-sky-900">
                Ieder concept is uitsluitend een simulatiemodel. Het aanmaken of koppelen verandert geen toegang.
              </div>
              <SubmitButton>Conceptpakket maken</SubmitButton>
            </DirtyForm>
          </AdminActionDrawer>
        ) : null}
        kicker="Platform governance · shadow mode"
        subtitle="Ontwerp pakketten, meet zachte limieten en vergelijk tenantgebruik zonder één functie te blokkeren. Technische releases en commerciële entitlements blijven afzonderlijke modellen."
        title="Packages & Feature Control"
      />
      <RouteFeedback
        error={getParam(params, "error") ? "De wijziging kon niet veilig worden verwerkt. Controleer de invoer en probeer opnieuw." : null}
        success={successMessage(getParam(params, "saved"))}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <AdminMetricCard icon={Boxes} label="Pakketten" value={data.packages.length} detail={`${data.summary.draftPackages} concept`} />
        <AdminMetricCard icon={Layers3} label="Features" value={data.features.length} detail="commercieel model" tone="info" />
        <AdminMetricCard icon={Gauge} label="Gemeten tenants" value={data.summary.measuredTenants} detail={`${data.summary.approaching} nabij limiet`} tone={data.summary.approaching ? "warning" : "neutral"} />
        <AdminMetricCard icon={FlaskConical} label="Zacht overschreden" value={data.summary.exceeded} detail="alleen signaal" tone={data.summary.exceeded ? "warning" : "success"} />
        <AdminMetricCard icon={ShieldCheck} label="Toegang geweigerd" value={data.summary.accessDenied} detail="databasegarantie" tone="success" />
      </div>

      <section className="relative overflow-hidden rounded-[1.75rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-card md:p-8">
        <div aria-hidden="true" className="absolute -right-12 -top-24 size-72 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-cyan-300"><Eye className="size-4" />Veilige commerciële observatie</p>
            <h2 className="mt-2 text-3xl font-bold">Meten alsof pakketten bestaan. Toegang behandelen alsof ze niet bestaan.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Iedere tenant blijft volledig operationeel. Een pakket kan tonen wat later binnen of buiten een propositie zou vallen, maar de applicatie gebruikt dit resultaat nergens voor autorisatie.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <HeroFact label="Mode" value="Shadow" />
            <HeroFact label="Autorisatie" value="Ongewijzigd" />
            <HeroFact label="Prijsdata" value="Geen" />
            <HeroFact label="Human review" value="Verplicht" />
          </div>
        </div>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,0.72fr)_minmax(520px,1.28fr)]">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Catalogus</p><h2 className="mt-1 text-xl font-bold">Neutrale pakketmodellen</h2><p className="mt-1 text-sm text-muted-foreground">Zonder prijzen en zonder afdwingbare status.</p></div>
            <StatusPill tone="success">0 blokkades</StatusPill>
          </div>
          <div className="mt-4 grid gap-3">
            {data.packages.map((item) => (
              <Link
                className={cn(
                  "rounded-xl border p-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  item.id === selectedPackage?.id ? "border-primary/35 bg-primary/5 shadow-soft" : "border-border bg-muted/20 hover:border-primary/20"
                )}
                href={`/platform/packages?package=${item.id}`}
                key={item.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-bold">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.key}</p></div>
                  <StatusPill tone={item.is_legacy_full_access ? "success" : item.status === "draft" ? "warning" : "info"}>{item.is_legacy_full_access ? "volledige toegang" : statusLabel(item.status)}</StatusPill>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-muted-foreground">
                  <span className="rounded-full bg-card px-2 py-1 ring-1 ring-border">{item.includedFeatureKeys.length}/{data.features.length} features</span>
                  <span className="rounded-full bg-card px-2 py-1 ring-1 ring-border">{Object.keys(item.limits).length} zachte limieten</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          {selectedPackage ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Package designer</p><h2 className="mt-1 text-xl font-bold">{selectedPackage.name}</h2><p className="mt-1 text-sm text-muted-foreground">Featurematrix en zachte gebruiksgrenzen met volledige brontransparantie.</p></div>
                <StatusPill tone={selectedPackage.status === "draft" ? "warning" : "success"}>{selectedPackage.is_legacy_full_access ? "vergrendelde veilige standaard" : statusLabel(selectedPackage.status)}</StatusPill>
              </div>
              <DirtyForm action={saveShadowPackageConfigurationAction} className="mt-4">
                <input name="packageId" type="hidden" value={selectedPackage.id} />
                <div>
                  <h3 className="text-sm font-bold">Commerciële featurematrix</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Een niet-aangevinkte feature krijgt alleen het label “buiten simulatiepakket”; toegang blijft actief.</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {data.features.map((feature) => (
                      <label className="flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/20 p-3 has-[:checked]:border-primary/25 has-[:checked]:bg-primary/5" key={feature.key}>
                        <input
                          className="mt-1 size-4 rounded border-border accent-primary"
                          defaultChecked={selectedPackage.includedFeatureKeys.includes(feature.key)}
                          disabled={selectedPackage.is_legacy_full_access || selectedPackage.status !== "draft"}
                          name={`feature.${feature.key}`}
                          type="checkbox"
                        />
                        <span><span className="block text-sm font-semibold">{feature.name}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{feature.description}</span></span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="border-t border-border pt-4">
                  <h3 className="text-sm font-bold">Zachte limieten</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Leeg betekent onbeperkt in de simulatie. Overschrijding geeft alleen een zichtbaar signaal.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {shadowLimitDefinitions.map((definition) => (
                      <Field
                        defaultValue={selectedPackage.limits[definition.key] ? Number(selectedPackage.limits[definition.key]) : undefined}
                        description={definition.unit === "gigabytes" ? "Gevolgde private opslag in hele GB." : "Positief geheel aantal."}
                        disabled={selectedPackage.is_legacy_full_access || selectedPackage.status !== "draft"}
                        key={definition.key}
                        label={definition.label}
                        min={1}
                        name={`limit.${definition.key}`}
                        step={1}
                        type="number"
                      />
                    ))}
                  </div>
                </div>
                {data.canManage && !selectedPackage.is_legacy_full_access && selectedPackage.status === "draft" ? <SubmitButton>Simulatiemodel opslaan</SubmitButton> : (
                  <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-3 text-xs leading-5 text-emerald-800">
                    De volledige-toegangstandaard is bewust niet bewerkbaar. Zo houden bestaande en nieuwe tenants altijd een veilige fallback.
                  </p>
                )}
              </DirtyForm>
            </>
          ) : <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nog geen pakketmodel beschikbaar.</p>}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Tenantportfolio</p><h2 className="mt-1 text-xl font-bold">Pakketsimulatie per organisatie</h2><p className="mt-1 text-sm text-muted-foreground">Zoek, filter en open een detailsheet voor brondata, redenen en een bevestigde simulatiekeuze.</p></div>
          <StatusPill tone="info">altijd toegestaan</StatusPill>
        </div>
        <ShadowPackageTenantsTable
          canManage={data.canManage}
          packages={data.packages.map((item) => ({ id: item.id, name: item.name, status: item.status }))}
          rows={data.tenants}
        />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Technische control plane</p><h2 className="mt-1 text-xl font-bold">Releaseflag-inventaris</h2><p className="mt-1 text-sm text-muted-foreground">Strikt gescheiden van commerciële entitlements. Deze inventaris is nog niet aan runtime-autorisatie gekoppeld.</p></div>
          <ToggleLeft className="size-5 text-primary" />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {data.releaseFlags.map((flag) => (
            <article className="rounded-xl border border-border bg-muted/20 p-4" key={flag.key}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-bold">{flag.name}</p><p className="mt-1 text-xs text-muted-foreground">{flag.key} · {flag.category}</p></div><StatusPill tone={flag.rollout_state === "enabled" ? "success" : flag.rollout_state === "shadow" ? "warning" : "neutral"}>{flag.rollout_state}</StatusPill></div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{flag.description}</p>
              {data.canManage ? (
                <ConfirmActionForm
                  action={updateTechnicalReleaseFlagAction}
                  className="mt-3"
                  confirmLabel="Inventaris bijwerken"
                  description="Deze wijziging actualiseert alleen de technische inventaris. Er is nog geen runtime- of pakketautorisatie aan gekoppeld."
                  hiddenFields={{ flagKey: flag.key, humanConfirmation: "update-release-inventory" }}
                  title={`${flag.name} in de inventaris bijwerken?`}
                  triggerLabel="Status wijzigen"
                  triggerVariant="outline"
                >
                  <select className="mb-3 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" defaultValue={flag.rollout_state} name="rolloutState">
                    <option value="disabled">Disabled</option>
                    <option value="shadow">Shadow</option>
                    <option value="enabled">Enabled</option>
                  </select>
                </ConfirmActionForm>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function HeroFact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-32 rounded-xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-white">{value}</p></div>;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function statusLabel(status: string) {
  return status === "draft" ? "concept" : status === "active" ? "actief" : status;
}

function successMessage(value?: string) {
  return ({
    assignment: "Het simulatiepakket is gewijzigd. Tenanttoegang is ongewijzigd gebleven.",
    configuration: "Het pakketsimulatiemodel is atomair opgeslagen.",
    package: "Het conceptpakket is aangemaakt.",
    release: "De technische release-inventaris is bijgewerkt."
  } as Record<string, string>)[value ?? ""] ?? null;
}
