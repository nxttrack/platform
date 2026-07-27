import { Award, Layers3, Settings2, Sparkles } from "lucide-react";

import { BadgeSectionNav } from "@/components/badges/badge-section-nav";
import { BadgeVisual } from "@/components/badges/badge-visual";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Button } from "@/components/ui/button";
import { saveCatalogBadgeAction, savePlatformBadgeSettingsAction } from "@/lib/domain/badge-system-actions";
import { getPlatformBadgeData } from "@/lib/domain/badge-system";

export const dynamic = "force-dynamic";

export default async function PlatformBadgesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, params] = await Promise.all([getPlatformBadgeData(), searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)]);
  const success = readParam(params.success);
  const error = readParam(params.error);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Platform control plane" title="Badge Studio" subtitle="Beheer de stabiele NXTTRACK-canon, veilige defaults en tenantmogelijkheden vanuit één premium werkruimte." />
      <BadgeSectionNav active="/platform/badges" scope="platform" />
      <Feedback error={error} success={success} />

      <section className="grid gap-4 md:grid-cols-3">
        <Metric icon={<Award className="size-5" />} label="Canonieke badges" value={data.definitions.length} detail={`${data.definitions.filter((badge) => badge.status === "active").length} actief`} />
        <Metric icon={<Layers3 className="size-5" />} label="Collecties" value={data.collections.length} detail="platformbreed beschikbaar" />
        <Metric icon={<Sparkles className="size-5" />} label="Varianten" value={data.definitions.filter((badge) => badge.name_boy || badge.name_girl).length} detail="gendergerichte copy, met neutrale fallback" />
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Platformgrenzen</p>
            <h2 className="mt-1 text-xl font-bold">Beschikbaarheid en veilige defaults</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Tenantkeuzes kunnen nooit meer activeren dan hier is toegestaan.</p>
          </div>
          <Settings2 className="size-5 text-primary" />
        </div>
        <form action={savePlatformBadgeSettingsAction} className="mt-5">
          <input name="next" type="hidden" value="/platform/badges" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {platformFlags.map(([name, label, detail]) => (
              <label className="flex min-h-20 cursor-pointer items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4 transition hover:border-primary/30" key={name}>
                <input className="mt-1 size-4 accent-primary" defaultChecked={data.settings?.[name] !== false} name={name} type="checkbox" />
                <span>
                  <span className="block text-sm font-bold text-foreground">{label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
                </span>
              </label>
            ))}
          </div>
          {data.canManage ? <Button className="mt-5" type="submit">Platforminstellingen opslaan</Button> : <p className="mt-4 text-sm text-muted-foreground">Platform Support heeft alleen inzage.</p>}
        </form>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Badgecanon</h2>
            <p className="mt-1 text-sm text-muted-foreground">Stabiele keys, uitlegbare triggers en presentatieteksten per variant.</p>
          </div>
          <StatusPill tone="info">Geen invloed op plaatsing of beoordeling</StatusPill>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.definitions.map((badge) => (
            <details className="group" key={badge.id}>
              <summary className="list-none cursor-pointer">
                <BadgeVisual category={badge.category} description={badge.description_default} name={badge.name_default} surprise={badge.is_surprise} />
              </summary>
              <form action={saveCatalogBadgeAction} className="mt-2 grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
                <input name="id" type="hidden" value={badge.id} />
                <input name="next" type="hidden" value="/platform/badges" />
                <ReadOnly label="Key" value={badge.badge_key} />
                <ReadOnly label="Trigger" value={badge.trigger_type ?? "Handmatig"} />
                <TextField defaultValue={badge.name_default} label="Neutrale naam" name="nameDefault" required />
                <TextField defaultValue={badge.name_boy ?? ""} label="Naam jongen (optioneel)" name="nameBoy" />
                <TextField defaultValue={badge.name_girl ?? ""} label="Naam meisje (optioneel)" name="nameGirl" />
                <TextArea defaultValue={badge.description_default} label="Neutrale beschrijving" name="descriptionDefault" required />
                <TextArea defaultValue={badge.share_text_default ?? ""} label="Deeltekst" name="shareTextDefault" />
                <label className="grid gap-1.5 text-sm font-semibold">Status<select className="h-11 rounded-xl border border-border bg-background px-3 font-normal" defaultValue={badge.status} name="status"><option value="draft">Concept</option><option value="active">Actief</option><option value="archived">Gearchiveerd</option></select></label>
                {data.canManage ? <Button type="submit">Wijzigingen opslaan</Button> : null}
              </form>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

const platformFlags = [
  ["badges_module_available", "Badgemodule", "Hoofdschakelaar voor alle badgefunctionaliteit."],
  ["automatic_badges_available", "Automatische badges", "Uitlegbare events kunnen badges voorstellen/toekennen."],
  ["manual_badges_available", "Handmatige badges", "Instructeurs kunnen positieve badges voorstellen."],
  ["tenant_custom_badges_allowed", "Eigen tenantbadges", "Tenantadmins kunnen eigen complimentbadges ontwerpen."],
  ["badge_collections_available", "Collecties", "Badgepaden en voortgangsverzamelingen."],
  ["surprise_badges_available", "Verrassingsbadges", "Vergrendelde verrassingen zonder negatieve boodschap."],
  ["share_images_available", "Deelafbeeldingen", "Privacyveilige afbeeldingen met alleen voornaam."],
  ["badge_email_available", "Badge-e-mail", "Alleen met tenant- én oudervoorkeur en mailconfiguratie."],
  ["badge_notifications_available", "In-app notificaties", "Notificaties via de Communicatiehub."],
  ["tenant_badge_rename_allowed", "Tenantnamen", "Tenant mag presentatietekst aanpassen, nooit de trigger."],
  ["tenant_message_suggestions_allowed", "Berichtsuggesties", "Drie positieve, bewerkbare suggesties per badge."],
  ["tenant_template_override_allowed", "Tenanttemplates", "Volledige layoutoverride is standaard uitgeschakeld."],
  ["badge_analytics_available", "Analytics", "Geaggregeerde badge-events zonder nadelige besluitvorming."]
] as const;

function Metric({ detail, icon, label, value }: { detail: string; icon: React.ReactNode; label: string; value: number }) {
  return <article className="rounded-3xl border border-border bg-card p-5 shadow-soft"><span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><p className="mt-4 text-3xl font-bold">{value}</p><p className="mt-1 font-semibold">{label}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/40 px-3 py-2"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><code className="mt-1 block text-xs text-foreground">{value}</code></div>;
}

function TextField({ defaultValue, label, name, required }: { defaultValue: string; label: string; name: string; required?: boolean }) {
  return <label className="grid gap-1.5 text-sm font-semibold">{label}<input className="h-11 rounded-xl border border-border bg-background px-3 font-normal" defaultValue={defaultValue} name={name} required={required} /></label>;
}

function TextArea({ defaultValue, label, name, required }: { defaultValue: string; label: string; name: string; required?: boolean }) {
  return <label className="grid gap-1.5 text-sm font-semibold">{label}<textarea className="min-h-24 rounded-xl border border-border bg-background p-3 font-normal" defaultValue={defaultValue} name={name} required={required} /></label>;
}

function Feedback({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return <p className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error ?? success}</p>;
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
