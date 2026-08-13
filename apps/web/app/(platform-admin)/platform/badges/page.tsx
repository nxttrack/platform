import { Award, Copy, ImageIcon, Layers3, Plus, Search, Settings2, Sparkles } from "lucide-react";
import Link from "next/link";

import { BadgeSectionNav } from "@/components/badges/badge-section-nav";
import { BadgeVisual, badgeIconOptions } from "@/components/badges/badge-visual";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  archiveCatalogBadgeAction,
  duplicateCatalogBadgeAction,
  saveCatalogBadgeAction,
  savePlatformBadgeSettingsAction
} from "@/lib/domain/badge-system-actions";
import { getPlatformBadgeData } from "@/lib/domain/badge-system";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PlatformBadge = Awaited<ReturnType<typeof getPlatformBadgeData>>["definitions"][number];

export default async function PlatformBadgesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, params] = await Promise.all([getPlatformBadgeData(), searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)]);
  const success = readParam(params.success);
  const error = readParam(params.error);
  const query = (readParam(params.q) ?? "").trim().toLowerCase();
  const status = readParam(params.status) ?? "all";
  const category = readParam(params.category) ?? "all";
  const badgeType = readParam(params.type) ?? "all";
  const editingId = readParam(params.edit);
  const showNew = readParam(params.new) === "1";
  const editingBadge = editingId ? data.definitions.find((badge) => badge.id === editingId) : null;
  const definitions = data.definitions.filter((badge) =>
    (!query || `${badge.name_default} ${badge.badge_key} ${badge.description_default}`.toLowerCase().includes(query)) &&
    (status === "all" || badge.status === status) &&
    (category === "all" || badge.category === category) &&
    (badgeType === "all" || badge.badge_type === badgeType)
  );

  return (
    <div className="space-y-6">
      <PageHeader kicker="Platform control plane" title="Badge Studio" subtitle="Maak, upload en beheer de stabiele NXTTRACK-canon vanuit één werkruimte." />
      <BadgeSectionNav active="/platform/badges" scope="platform" />
      <Feedback error={error} success={success} />

      <section className="grid gap-4 md:grid-cols-3">
        <Metric icon={<Award className="size-5" />} label="Canonieke badges" value={data.definitions.length} detail={`${data.definitions.filter((badge) => badge.status === "active").length} actief`} />
        <Metric icon={<Layers3 className="size-5" />} label="Collecties" value={data.collections.length} detail="platformbreed beschikbaar" />
        <Metric icon={<Sparkles className="size-5" />} label="Varianten" value={data.definitions.filter((badge) => badge.name_boy || badge.name_girl).length} detail="gendergerichte copy, met neutrale fallback" />
      </section>

      <section className="rounded-3xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-white"><ImageIcon className="size-5" /></span>
          <div>
            <h2 className="font-bold">Hier upload je de echte badge-afbeelding</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Open een badge of kies ‘Nieuwe badge’ en upload bij <strong>Badge-afbeelding</strong> een PNG of JPEG. De upload wordt privé opgeslagen en verschijnt in de badgewall én in gepubliceerde deeltemplates. Afbeeldingen die alleen als decoratie in een sharetemplate dienen upload je in de template-editor.</p>
          </div>
        </div>
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
                <input className="mt-1 size-4 accent-primary" defaultChecked={data.settings?.[name] !== false} disabled={!data.canManage} name={name} type="checkbox" />
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

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Badgecanon</h2>
            <p className="mt-1 text-sm text-muted-foreground">Zoek, filter, maak, dupliceer en archiveer badges zonder de stabiele betekenis te verliezen.</p>
          </div>
          {data.canManage ? <Link className={buttonVariants()} href="/platform/badges?new=1#badge-editor"><Plus className="size-4" /> Nieuwe badge</Link> : <StatusPill tone="info">Alleen inzage</StatusPill>}
        </div>

        <form className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft md:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(130px,auto))_auto]" method="get">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
            <input className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm" defaultValue={readParam(params.q)} name="q" placeholder="Zoek op naam, key of beschrijving" />
          </label>
          <FilterSelect defaultValue={status} name="status"><option value="all">Alle statussen</option><option value="active">Actief</option><option value="draft">Concept</option><option value="archived">Gearchiveerd</option></FilterSelect>
          <FilterSelect defaultValue={category} name="category"><option value="all">Alle categorieën</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</FilterSelect>
          <FilterSelect defaultValue={badgeType} name="type"><option value="all">Alle types</option><option value="automatic">Automatisch</option><option value="manual">Handmatig</option></FilterSelect>
          <Button type="submit" variant="outline">Filteren</Button>
        </form>

        {showNew && data.canManage ? (
          <section className="rounded-3xl border-2 border-primary/30 bg-card p-5 shadow-card" id="badge-editor">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Nieuwe definitie</p><h3 className="mt-1 text-xl font-bold">Nieuwe badge aanmaken</h3></div>
              <Link className={buttonVariants({ variant: "ghost", size: "sm" })} href="/platform/badges">Sluiten</Link>
            </div>
            <CatalogBadgeForm canManage badge={null} next="/platform/badges" />
          </section>
        ) : null}

        {editingBadge ? (
          <section className="scroll-mt-24 rounded-3xl border-2 border-primary/30 bg-card p-5 shadow-card" id="badge-editor">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Badge bewerken</p><h3 className="mt-1 text-xl font-bold">{editingBadge.name_default}</h3></div>
              <Link className={buttonVariants({ variant: "ghost", size: "sm" })} href="/platform/badges">Sluiten</Link>
            </div>
            <CatalogBadgeForm badge={editingBadge} canManage={data.canManage} next={`/platform/badges?edit=${editingBadge.id}`} />
          </section>
        ) : null}

        <p className="text-sm text-muted-foreground">{definitions.length} van {data.definitions.length} badges zichtbaar</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {definitions.map((badge) => (
            <Link className="block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/platform/badges?edit=${badge.id}#badge-editor`} key={badge.id}>
              <div className="relative">
                <BadgeVisual artworkUrl={badgeArtworkUrl(badge.artwork_asset_id)} category={badge.category} className="pb-16" description={badge.description_default} iconName={badge.icon_name} name={badge.name_default} surprise={badge.is_surprise} />
                <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between gap-2 rounded-xl bg-card/95 px-2.5 py-1.5 shadow-soft backdrop-blur">
                  <code className="truncate text-[10px] text-primary">{badge.badge_key}</code>
                  <StatusPill tone={badge.status === "active" ? "success" : badge.status === "draft" ? "warning" : "neutral"}>{badge.status}</StatusPill>
                </div>
              </div>
            </Link>
          ))}
        </div>
        {!definitions.length ? <p className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Geen badges voldoen aan deze filters.</p> : null}
      </section>
    </div>
  );
}

function CatalogBadgeForm({ badge, canManage, next }: { badge: PlatformBadge | null; canManage: boolean; next: `/${string}` }) {
  const isNew = !badge;
  return (
    <form action={saveCatalogBadgeAction} className="grid gap-3 md:grid-cols-2">
      {badge ? <><input name="id" type="hidden" value={badge.id} /><input name="artworkAssetId" type="hidden" value={badge.artwork_asset_id ?? ""} /></> : null}
      <input name="next" type="hidden" value={next} />
      {isNew ? <TextField disabled={!canManage} label="Stabiele key" name="badgeKey" placeholder="eerste_duik" required /> : <ReadOnly label="Stabiele key" value={badge.badge_key} />}
      <SelectField defaultValue={badge?.status ?? "draft"} disabled={!canManage} label="Status" name="status"><option value="draft">Concept</option><option value="active">Actief</option><option value="archived">Gearchiveerd</option></SelectField>
      <TextField defaultValue={badge?.name_default ?? ""} disabled={!canManage} label="Neutrale naam" name="nameDefault" required />
      <SelectField defaultValue={badge?.icon_name ?? "award"} disabled={!canManage} label="Icoon (fallback)" name="iconName">{badgeIconOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
      <SelectField defaultValue={badge?.category ?? "specials"} disabled={!canManage} label="Categorie" name="category">{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
      <SelectField defaultValue={badge?.audience ?? "all"} disabled={!canManage} label="Doelgroep" name="audience"><option value="all">Iedereen</option><option value="boys">Jongens</option><option value="girls">Meisjes</option></SelectField>
      <SelectField defaultValue={badge?.badge_type ?? "manual"} disabled={!canManage} label="Toekenning" name="badgeType"><option value="manual">Handmatig</option><option value="automatic">Automatisch</option></SelectField>
      <TextField defaultValue={badge?.trigger_type ?? ""} disabled={!canManage} label="Triggertype (verplicht bij automatisch)" name="triggerType" placeholder="attendance_milestone" />
      <TextArea className="md:col-span-2" defaultValue={JSON.stringify(badge?.trigger_config_json ?? {}, null, 2)} disabled={!canManage} label="Triggerconfiguratie (JSON)" name="triggerConfigJson" />
      <TextArea className="md:col-span-2" defaultValue={badge?.description_default ?? ""} disabled={!canManage} label="Neutrale beschrijving" name="descriptionDefault" required />
      <TextArea className="md:col-span-2" defaultValue={badge?.share_text_default ?? ""} disabled={!canManage} label="Neutrale deeltekst" name="shareTextDefault" placeholder="{child_first_name} behaalde {badge_name_gendered}!" />

      <details className="rounded-2xl border border-border p-3 md:col-span-2">
        <summary className="cursor-pointer text-sm font-bold">Gendervarianten en extra copy</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <TextField defaultValue={badge?.name_boy ?? ""} disabled={!canManage} label="Naam jongen" name="nameBoy" />
          <TextField defaultValue={badge?.name_girl ?? ""} disabled={!canManage} label="Naam meisje" name="nameGirl" />
          <TextArea defaultValue={badge?.description_boy ?? ""} disabled={!canManage} label="Beschrijving jongen" name="descriptionBoy" />
          <TextArea defaultValue={badge?.description_girl ?? ""} disabled={!canManage} label="Beschrijving meisje" name="descriptionGirl" />
          <TextArea defaultValue={badge?.share_text_boy ?? ""} disabled={!canManage} label="Deeltekst jongen" name="shareTextBoy" />
          <TextArea defaultValue={badge?.share_text_girl ?? ""} disabled={!canManage} label="Deeltekst meisje" name="shareTextGirl" />
        </div>
      </details>

      <label className="grid gap-1.5 text-sm font-semibold md:col-span-2">
        Badge-afbeelding
        <input accept="image/jpeg,image/png" className="rounded-xl border border-border bg-background p-2 text-xs font-normal file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:font-semibold" disabled={!canManage} name="artwork" type="file" />
        <span className="text-xs font-normal leading-5 text-muted-foreground">PNG of JPEG, maximaal 5 MB. Deze upload is de badge zelf; template-decoraties upload je in de share editor.</span>
      </label>
      {badge?.artwork_asset_id ? <Checkbox defaultChecked={false} disabled={!canManage} label="Huidige badge-afbeelding verwijderen" name="removeArtwork" /> : null}
      <NumberField defaultValue={badge?.sort_order ?? 0} disabled={!canManage} label="Sorteervolgorde" name="sortOrder" />

      <div className="grid gap-2 sm:grid-cols-2 md:col-span-2">
        <Checkbox defaultChecked={badge?.is_surprise ?? false} disabled={!canManage} label="Verrassingsbadge" name="isSurprise" />
        <Checkbox defaultChecked={badge?.allow_custom_message ?? true} disabled={!canManage} label="Eigen bericht toestaan" name="allowCustomMessage" />
        <Checkbox defaultChecked={badge?.notifications_enabled ?? true} disabled={!canManage} label="Notificaties toestaan" name="notificationsEnabled" />
        <Checkbox defaultChecked={badge?.emails_enabled ?? true} disabled={!canManage} label="E-mail toestaan" name="emailsEnabled" />
        <Checkbox defaultChecked={badge?.share_enabled ?? true} disabled={!canManage} label="Delen toestaan" name="shareEnabled" />
      </div>

      {canManage ? (
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button type="submit">{isNew ? "Badge aanmaken" : "Wijzigingen opslaan"}</Button>
          {badge ? <Button formAction={duplicateCatalogBadgeAction} formNoValidate type="submit" variant="outline"><Copy className="size-4" /> Dupliceren</Button> : null}
          {badge && badge.status !== "archived" ? <Button formAction={archiveCatalogBadgeAction} formNoValidate type="submit" variant="outline">Archiveren</Button> : null}
        </div>
      ) : null}
    </form>
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

const categories = [
  ["start", "Start"],
  ["attendance", "Aanwezigheid"],
  ["skills", "Vaardigheden"],
  ["stages", "Fases"],
  ["diplomas", "Diploma’s"],
  ["makeup", "Inhalen"],
  ["compliments", "Compliment"],
  ["courage", "Moed"],
  ["technique", "Techniek"],
  ["specials", "Special"]
] as const;

function Metric({ detail, icon, label, value }: { detail: string; icon: React.ReactNode; label: string; value: number }) {
  return <article className="rounded-3xl border border-border bg-card p-5 shadow-soft"><span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><p className="mt-4 text-3xl font-bold">{value}</p><p className="mt-1 font-semibold">{label}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/40 px-3 py-2"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><code className="mt-1 block text-xs text-foreground">{value}</code></div>;
}

function TextField({ className, defaultValue, disabled, label, name, placeholder, required }: { className?: string; defaultValue?: string; disabled?: boolean; label: string; name: string; placeholder?: string; required?: boolean }) {
  return <label className={cn("grid gap-1.5 text-sm font-semibold", className)}>{label}<input className="h-11 rounded-xl border border-border bg-background px-3 font-normal" defaultValue={defaultValue} disabled={disabled} name={name} placeholder={placeholder} required={required} /></label>;
}

function NumberField({ defaultValue, disabled, label, name }: { defaultValue: number; disabled?: boolean; label: string; name: string }) {
  return <label className="grid gap-1.5 text-sm font-semibold">{label}<input className="h-11 rounded-xl border border-border bg-background px-3 font-normal" defaultValue={defaultValue} disabled={disabled} min={0} name={name} type="number" /></label>;
}

function TextArea({ className, defaultValue, disabled, label, name, placeholder, required }: { className?: string; defaultValue?: string; disabled?: boolean; label: string; name: string; placeholder?: string; required?: boolean }) {
  return <label className={cn("grid gap-1.5 text-sm font-semibold", className)}>{label}<textarea className="min-h-24 rounded-xl border border-border bg-background p-3 font-normal" defaultValue={defaultValue} disabled={disabled} name={name} placeholder={placeholder} required={required} /></label>;
}

function SelectField({ children, defaultValue, disabled, label, name }: { children: React.ReactNode; defaultValue: string; disabled?: boolean; label: string; name: string }) {
  return <label className="grid gap-1.5 text-sm font-semibold">{label}<select className="h-11 rounded-xl border border-border bg-background px-3 font-normal" defaultValue={defaultValue} disabled={disabled} name={name}>{children}</select></label>;
}

function FilterSelect({ children, defaultValue, name }: { children: React.ReactNode; defaultValue: string; name: string }) {
  return <select aria-label={name} className="h-11 rounded-xl border border-border bg-background px-3 text-sm" defaultValue={defaultValue} name={name}>{children}</select>;
}

function Checkbox({ defaultChecked, disabled, label, name }: { defaultChecked: boolean; disabled?: boolean; label: string; name: string }) {
  return <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 text-sm font-semibold"><input className="size-4 accent-primary" defaultChecked={defaultChecked} disabled={disabled} name={name} type="checkbox" /> {label}</label>;
}

function Feedback({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return <p className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error ?? success}</p>;
}

function badgeArtworkUrl(assetId?: string | null) {
  return assetId ? `/api/files/badge-studio-asset/${assetId}` : null;
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
