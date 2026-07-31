import { Copy, ImageIcon, Plus, Search } from "lucide-react";
import Link from "next/link";

import { BadgeSectionNav } from "@/components/badges/badge-section-nav";
import { BadgeVisual, badgeIconOptions } from "@/components/badges/badge-visual";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { getTenantBadgeData } from "@/lib/domain/badge-system";
import {
  archiveCustomBadgeAction,
  duplicateCustomBadgeAction,
  saveCustomBadgeAction
} from "@/lib/domain/badge-system-actions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type CustomBadge = Awaited<ReturnType<typeof getTenantBadgeData>>["customBadges"][number];

export default async function AdminCustomBadgesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, params] = await Promise.all([getTenantBadgeData(), searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)]);
  const available = data.platformSettings?.tenant_custom_badges_allowed !== false && data.settings?.custom_badges_enabled === true;
  const query = (readParam(params.q) ?? "").trim().toLowerCase();
  const status = readParam(params.status) ?? "all";
  const editId = readParam(params.edit);
  const badges = data.customBadges.filter((badge) =>
    (!query || `${badge.name_default} ${badge.badge_key} ${badge.description_default}`.toLowerCase().includes(query)) &&
    (status === "all" || badge.status === status)
  );

  return (
    <div className="space-y-6">
      <PageHeader kicker="Badges" title="Eigen complimentbadges" subtitle="Maak, upload en beheer lokale specials. Eigen badges zijn altijd handmatig en hebben nooit automatisch nadelige gevolgen." />
      <BadgeSectionNav active="/admin/badges/eigen" scope="admin" />
      <Feedback error={readParam(params.error)} success={readParam(params.success)} />

      {!available ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Activeer ‘Eigen badges’ eerst bij Instellingen. De platformbeheerder moet de functie eveneens toestaan.</p>
      ) : (
        <>
          <section className="rounded-3xl border border-primary/20 bg-primary/5 p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-white"><ImageIcon className="size-5" /></span>
              <div><h2 className="font-bold">Upload de echte badge hier</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Kies bij aanmaken of bewerken een PNG/JPEG onder <strong>Badge-afbeelding</strong>. Deze wordt privé opgeslagen en gebruikt in de badgewall en deelafbeeldingen.</p></div>
            </div>
          </section>

          <section className="rounded-3xl border-2 border-primary/25 bg-card p-5 shadow-card" id="nieuwe-badge">
            <details open={readParam(params.new) === "1"}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Nieuwe lokale badge</p><h2 className="mt-1 text-xl font-bold">Eigen badge aanmaken</h2></div>
                <span className={buttonVariants({ size: "sm" })}><Plus className="size-4" /> Open formulier</span>
              </summary>
              <div className="mt-5"><CustomBadgeForm badge={null} next="/admin/badges/eigen" /></div>
            </details>
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="text-xl font-bold">Bestaande eigen badges</h2><p className="mt-1 text-sm text-muted-foreground">Open een kaart om alle velden, artwork en status aan te passen.</p></div>
              <Link className={buttonVariants({ variant: "outline" })} href="/admin/badges/eigen?new=1#nieuwe-badge"><Plus className="size-4" /> Nieuwe badge</Link>
            </div>
            <form className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-[1fr_180px_auto]" method="get">
              <label className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" /><input className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm" defaultValue={readParam(params.q)} name="q" placeholder="Zoek op naam of key" /></label>
              <select aria-label="Status" className="h-11 rounded-xl border border-border bg-background px-3 text-sm" defaultValue={status} name="status"><option value="all">Alle statussen</option><option value="active">Actief</option><option value="draft">Concept</option><option value="archived">Gearchiveerd</option></select>
              <Button type="submit" variant="outline">Filteren</Button>
            </form>
            <p className="text-sm text-muted-foreground">{badges.length} van {data.customBadges.length} badges zichtbaar</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {badges.map((badge) => (
                <details className="group scroll-mt-24" key={badge.id} open={editId === badge.id}>
                  <summary className="list-none cursor-pointer">
                    <BadgeVisual artworkUrl={badgeArtworkUrl(badge.artwork_asset_id)} category={badge.category} description={badge.description_default} iconName={badge.icon_name} name={badge.name_default} surprise={badge.is_surprise} />
                  </summary>
                  <div className="mt-2 rounded-2xl border border-border bg-card p-4 shadow-card">
                    <div className="mb-3 flex items-center justify-between gap-2"><code className="text-xs text-primary">{badge.badge_key}</code><StatusPill tone={badge.status === "active" ? "success" : badge.status === "draft" ? "warning" : "neutral"}>{badge.status}</StatusPill></div>
                    <CustomBadgeForm badge={badge} next={`/admin/badges/eigen?edit=${badge.id}`} />
                  </div>
                </details>
              ))}
            </div>
            {!badges.length ? <p className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Geen eigen badges gevonden.</p> : null}
          </section>
        </>
      )}
    </div>
  );
}

function CustomBadgeForm({ badge, next }: { badge: CustomBadge | null; next: `/${string}` }) {
  return (
    <form action={saveCustomBadgeAction} className="grid gap-3 md:grid-cols-2">
      <input name="next" type="hidden" value={next} />
      {badge ? <><input name="id" type="hidden" value={badge.id} /><input name="artworkAssetId" type="hidden" value={badge.artwork_asset_id ?? ""} /></> : null}
      {!badge ? <Field label="Stabiele key" name="badgeKey" placeholder="zomer_duiker" required /> : <ReadOnly label="Stabiele key" value={badge.badge_key} />}
      <Select defaultValue={badge?.status ?? "draft"} label="Status" name="status"><option value="draft">Concept</option><option value="active">Actief</option><option value="archived">Gearchiveerd</option></Select>
      <Field defaultValue={badge?.name_default ?? ""} label="Neutrale naam" name="nameDefault" placeholder="Zomerduiker" required />
      <Select defaultValue={badge?.icon_name ?? "sparkles"} label="Icoon (fallback)" name="iconName">{badgeIconOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <Select defaultValue={badge?.category ?? "specials"} label="Categorie" name="category"><option value="compliments">Compliment</option><option value="courage">Moed</option><option value="technique">Techniek</option><option value="specials">Special</option></Select>
      <Select defaultValue={badge?.audience ?? "all"} label="Doelgroep" name="audience"><option value="all">Iedereen</option><option value="boys">Jongens</option><option value="girls">Meisjes</option></Select>
      <Area className="md:col-span-2" defaultValue={badge?.description_default ?? ""} label="Neutrale beschrijving" name="descriptionDefault" required />
      <Area className="md:col-span-2" defaultValue={badge?.share_text_default ?? ""} label="Neutrale deeltekst" name="shareTextDefault" placeholder="{child_first_name} behaalde {badge_name_gendered}!" />

      <details className="rounded-2xl border border-border p-3 md:col-span-2">
        <summary className="cursor-pointer text-sm font-bold">Gendervarianten</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field defaultValue={badge?.name_boy ?? ""} label="Naam jongen" name="nameBoy" />
          <Field defaultValue={badge?.name_girl ?? ""} label="Naam meisje" name="nameGirl" />
          <Area defaultValue={badge?.description_boy ?? ""} label="Beschrijving jongen" name="descriptionBoy" />
          <Area defaultValue={badge?.description_girl ?? ""} label="Beschrijving meisje" name="descriptionGirl" />
          <Area defaultValue={badge?.share_text_boy ?? ""} label="Deeltekst jongen" name="shareTextBoy" />
          <Area defaultValue={badge?.share_text_girl ?? ""} label="Deeltekst meisje" name="shareTextGirl" />
        </div>
      </details>

      <label className="grid gap-1.5 text-sm font-semibold md:col-span-2">Badge-afbeelding<input accept="image/jpeg,image/png" className="rounded-xl border border-border bg-background p-2 text-xs font-normal file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:font-semibold" name="artwork" type="file" /><span className="text-xs font-normal text-muted-foreground">PNG of JPEG, maximaal 5 MB.</span></label>
      {badge?.artwork_asset_id ? <Check label="Huidige badge-afbeelding verwijderen" name="removeArtwork" /> : null}
      <Check defaultChecked={badge?.is_surprise ?? false} label="Verrassingsbadge" name="isSurprise" />

      <div className="flex flex-wrap gap-2 md:col-span-2">
        <Button type="submit">{badge ? "Wijzigingen opslaan" : "Eigen badge aanmaken"}</Button>
        {badge ? <Button formAction={duplicateCustomBadgeAction} formNoValidate type="submit" variant="outline"><Copy className="size-4" /> Dupliceren</Button> : null}
        {badge && badge.status !== "archived" ? <Button formAction={archiveCustomBadgeAction} formNoValidate type="submit" variant="outline">Archiveren</Button> : null}
      </div>
    </form>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/40 px-3 py-2"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><code className="mt-1 block text-xs text-foreground">{value}</code></div>;
}

function Field({ defaultValue, label, name, placeholder, required }: { defaultValue?: string; label: string; name: string; placeholder?: string; required?: boolean }) {
  return <label className="grid gap-1.5 text-sm font-semibold">{label}<input className="h-11 rounded-xl border border-border bg-background px-3 font-normal" defaultValue={defaultValue} name={name} placeholder={placeholder} required={required} /></label>;
}

function Area({ className, defaultValue, label, name, placeholder, required }: { className?: string; defaultValue?: string; label: string; name: string; placeholder?: string; required?: boolean }) {
  return <label className={cn("grid gap-1.5 text-sm font-semibold", className)}>{label}<textarea className="min-h-24 rounded-xl border border-border bg-background p-3 font-normal" defaultValue={defaultValue} name={name} placeholder={placeholder} required={required} /></label>;
}

function Select({ children, defaultValue, label, name }: { children: React.ReactNode; defaultValue: string; label: string; name: string }) {
  return <label className="grid gap-1.5 text-sm font-semibold">{label}<select className="h-11 rounded-xl border border-border bg-background px-3 font-normal" defaultValue={defaultValue} name={name}>{children}</select></label>;
}

function Check({ defaultChecked = false, label, name }: { defaultChecked?: boolean; label: string; name: string }) {
  return <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 text-sm font-semibold"><input className="size-4 accent-primary" defaultChecked={defaultChecked} name={name} type="checkbox" /> {label}</label>;
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
