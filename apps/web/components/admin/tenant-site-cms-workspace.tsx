import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ExternalLink,
  FileClock,
  ImagePlus,
  Layers3,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2
} from "lucide-react";
import Link from "next/link";

import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Button } from "@/components/ui/button";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { DirtyForm } from "@/components/ui/dirty-form";
import type { getTenantSiteCmsData, TenantMediaAssetView, TenantSiteCmsPage } from "@/lib/domain/site-cms";
import {
  moveTenantSiteSectionAction,
  publishTenantSitePageAction,
  removeTenantSiteSectionAction,
  restoreTenantSiteVersionAction,
  saveTenantSitePageDraftAction,
  saveTenantSiteSectionAction,
  uploadTenantMediaAssetAction
} from "@/lib/domain/site-page-actions";
import {
  tenantSitePageKeys,
  tenantSiteSectionTypes,
  type TenantSitePageKey,
  type TenantSiteSection
} from "@/lib/domain/site-page-contract";
import { cn } from "@/lib/utils";

type CmsData = Awaited<ReturnType<typeof getTenantSiteCmsData>>;

export function TenantSiteCmsWorkspace({ data, selectedKey }: { data: CmsData; selectedKey: TenantSitePageKey }) {
  const selected = data.pages[selectedKey];
  const draft = selected.draft;

  return (
    <div className="space-y-4">
      <nav aria-label="Websitepagina kiezen" className="flex gap-2 overflow-x-auto rounded-xl border border-border bg-card p-2 shadow-soft">
        {tenantSitePageKeys.map((key) => (
          <Link
            aria-current={selectedKey === key ? "page" : undefined}
            className={cn("inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold", selectedKey === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
            href={`/admin/website?pagina=${key}`}
            key={key}
          >
            {pageLabel(key)}
            <StatusPill className={selectedKey === key ? "bg-white/15 text-white ring-white/20" : ""} tone={data.pages[key].hasUnpublishedChanges ? "warning" : data.pages[key].published ? "success" : "neutral"}>
              {data.pages[key].hasUnpublishedChanges ? "Concept" : data.pages[key].published ? "Live" : "Niet live"}
            </StatusPill>
          </Link>
        ))}
      </nav>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-soft xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-foreground">{pageLabel(selectedKey)}</h2>
            <StatusPill tone={selected.hasUnpublishedChanges ? "warning" : "success"}>{selected.hasUnpublishedChanges ? "Ongepubliceerde wijzigingen" : "Gelijk aan live"}</StatusPill>
            {selected.draftVersionId ? <StatusPill tone="neutral">Versie {selected.versions.find((version) => version.id === selected.draftVersionId)?.number ?? "nieuw"}</StatusPill> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Wijzigingen worden eerst als immutable concept opgeslagen. Publiceren is een aparte, atomische bevestiging.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminActionDrawer description="JPEG/PNG, metadata verwijderd, maximaal 2400 px, ClamAV-scan en expliciete consentstatus." icon={<ImagePlus className="size-4" />} title="Afbeelding toevoegen" triggerLabel="Media uploaden" triggerVariant="outline" width="wide">
            <AssetUploadForm pageKey={selectedKey} />
          </AdminActionDrawer>
          <AdminActionDrawer description="Kies een gecontroleerd sectietype. Vrije HTML en scripts zijn niet mogelijk." icon={<Plus className="size-4" />} title="Sectie toevoegen" triggerLabel="Sectie toevoegen" width="wide">
            <SectionForm assets={data.assets} pageKey={selectedKey} />
          </AdminActionDrawer>
          {selected.draftVersionId ? (
            <ConfirmActionForm
              action={publishTenantSitePageAction}
              confirmLabel="Volledige versie publiceren"
              description="Alle secties en media worden opnieuw gecontroleerd. De publieke website schakelt daarna atomair naar deze complete versie; er ontstaat geen half gepubliceerde pagina."
              hiddenFields={{ pageKey: selectedKey, versionId: selected.draftVersionId, humanConfirmation: "publish" }}
              title={`${pageLabel(selectedKey)} publiceren?`}
              triggerLabel="Publiceren"
            />
          ) : null}
          <a className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold" href={pageHref(selectedKey)} rel="noreferrer" target="_blank">Live bekijken <ExternalLink className="size-4" /></a>
        </div>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.05fr)_minmax(440px,0.95fr)]">
        <div className="space-y-4">
          <DirtyForm action={saveTenantSitePageDraftAction} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <input name="pageKey" type="hidden" value={selectedKey} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-primary">Hero, CTA & SEO</p>
              <h2 className="mt-1 text-xl font-bold">Pagina-instellingen</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bovenregel" name="eyebrow" defaultValue={draft.eyebrow} maxLength={80} required />
              <SelectField defaultValue={draft.theme} label="Visuele sfeer" name="theme">
                <option value="water">Water · lichtblauw</option>
                <option value="calm">Rustig · neutraal</option>
                <option value="navy">Premium · donkerblauw</option>
              </SelectField>
              <div className="sm:col-span-2"><Field label="Paginatitel" name="title" defaultValue={draft.title} maxLength={140} required /></div>
              <div className="sm:col-span-2"><TextAreaField label="Introductie" name="intro" defaultValue={draft.intro} maxLength={600} required /></div>
              <div className="sm:col-span-2">
                <SelectField defaultValue={draft.heroAssetId ?? ""} label="Hero-afbeelding — optioneel" name="heroAssetId">
                  <option value="">Grafische gradient zonder afbeelding</option>
                  {publishableAssets(data.assets).map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.width}×{asset.height}</option>)}
                </SelectField>
              </div>
            </div>
            <div className="grid gap-4 rounded-xl border border-border bg-muted/25 p-4 sm:grid-cols-2">
              <Field label="Primaire knop" name="primaryCtaLabel" defaultValue={draft.primaryCtaLabel ?? ""} maxLength={80} />
              <Field label="Interne link" name="primaryCtaHref" defaultValue={draft.primaryCtaHref ?? ""} maxLength={160} placeholder="/intake" />
              <Field label="Secundaire knop" name="secondaryCtaLabel" defaultValue={draft.secondaryCtaLabel ?? ""} maxLength={80} />
              <Field label="Interne link" name="secondaryCtaHref" defaultValue={draft.secondaryCtaHref ?? ""} maxLength={160} placeholder="/programmas" />
            </div>
            <div className="grid gap-4 rounded-xl border border-border bg-muted/25 p-4">
              <Field label="SEO-titel" name="seoTitle" defaultValue={draft.seoTitle} maxLength={70} required />
              <TextAreaField label="SEO-omschrijving" name="seoDescription" defaultValue={draft.seoDescription} maxLength={180} required />
            </div>
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 text-sm font-semibold">
              <input defaultChecked={draft.status === "published"} name="visible" type="checkbox" />
              Pagina zichtbaar zodra dit concept wordt gepubliceerd
            </label>
            <Field label="Wijzigingssamenvatting — optioneel" name="changeSummary" maxLength={240} placeholder="Bijv. nieuwe zomerhero en proefles-CTA" />
            <SubmitButton>Conceptversie opslaan</SubmitButton>
          </DirtyForm>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-foreground">Sectie-opbouw</h2>
                <p className="mt-1 text-xs text-muted-foreground">Volgorde is exact gelijk aan de publieke pagina. Iedere wijziging maakt een herstelbare versie.</p>
              </div>
              <StatusPill tone="info">{draft.sections.length} secties</StatusPill>
            </div>
            <div className="mt-4 space-y-3">
              {draft.sections.map((section, index) => (
                <article className="rounded-xl border border-border bg-muted/20 p-3" key={section.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background text-xs font-bold ring-1 ring-border">{index + 1}</span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-foreground">{section.title}</p>
                          <StatusPill tone={section.visible ? "success" : "neutral"}>{sectionLabel(section.type)}</StatusPill>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{section.items.length} items · {section.assetIds.length + section.items.filter((item) => item.assetId).length} afbeeldingen · stijl {section.style}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <form action={moveTenantSiteSectionAction}>
                        <input name="pageKey" type="hidden" value={selectedKey} /><input name="sectionId" type="hidden" value={section.id} /><input name="direction" type="hidden" value="up" />
                        <Button aria-label="Sectie omhoog" disabled={index === 0} size="icon" type="submit" variant="outline"><ArrowUp className="size-4" /></Button>
                      </form>
                      <form action={moveTenantSiteSectionAction}>
                        <input name="pageKey" type="hidden" value={selectedKey} /><input name="sectionId" type="hidden" value={section.id} /><input name="direction" type="hidden" value="down" />
                        <Button aria-label="Sectie omlaag" disabled={index === draft.sections.length - 1} size="icon" type="submit" variant="outline"><ArrowDown className="size-4" /></Button>
                      </form>
                      <AdminActionDrawer description="Pas alleen gecontroleerde tekst, media, CTA’s en layoutstijl aan." title={`${section.title} bewerken`} triggerLabel="Bewerken" triggerVariant="outline" width="wide">
                        <SectionForm assets={data.assets} pageKey={selectedKey} section={section} />
                      </AdminActionDrawer>
                      <ConfirmActionForm
                        action={removeTenantSiteSectionAction}
                        confirmLabel="Herstelbaar verwijderen"
                        description="De sectie verdwijnt alleen uit het nieuwe concept. Via versiehistorie kun je dit altijd terugzetten; de live pagina verandert pas na publiceren."
                        hiddenFields={{ pageKey: selectedKey, sectionId: section.id, humanConfirmation: "remove" }}
                        title={`${section.title} verwijderen?`}
                        triggerLabel={<Trash2 className="size-4" />}
                        triggerVariant="outline"
                      />
                    </div>
                  </div>
                </article>
              ))}
              {!draft.sections.length ? <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">Voeg programma’s, USP’s, team, locaties, FAQ, reviews, nieuws, CTA of galerie toe.</p> : null}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <SitePreview assets={data.assets} page={selected} />
          <VersionHistory page={selected} pageKey={selectedKey} />
          <MediaLibrary assets={data.assets} />
        </aside>
      </div>
    </div>
  );
}

function SitePreview({ assets, page }: { assets: TenantMediaAssetView[]; page: TenantSiteCmsPage }) {
  const draft = page.draft;
  const hero = assets.find((asset) => asset.id === draft.heroAssetId);
  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Conceptpreview</p><p className="text-[11px] text-muted-foreground">Veilige structurele weergave</p></div>
        <StatusPill tone="warning">Niet live</StatusPill>
      </header>
      <div className={cn("relative overflow-hidden p-7", themeClass(draft.theme))}>
        {hero ? <img alt={hero.altText} className="absolute inset-0 size-full object-cover opacity-25" src={`${hero.url}?review=1`} /> : null}
        <div className="relative z-10">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{draft.eyebrow}</p>
          <h2 className="mt-3 text-3xl font-bold leading-tight">{draft.title}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{draft.intro}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {draft.primaryCtaLabel ? <span className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">{draft.primaryCtaLabel}</span> : null}
            {draft.secondaryCtaLabel ? <span className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold">{draft.secondaryCtaLabel}</span> : null}
          </div>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {draft.sections.filter((section) => section.visible).map((section) => (
          <div className="rounded-xl border border-border bg-muted/20 p-3" key={section.id}>
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-foreground">{section.title}</p><span className="text-[10px] font-semibold uppercase text-muted-foreground">{sectionLabel(section.type)}</span></div>
            {section.intro ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{section.intro}</p> : null}
            {section.items.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{section.items.slice(0, 4).map((item) => <div className="rounded-lg bg-background p-2 text-xs font-semibold ring-1 ring-border" key={item.id}>{item.title}</div>)}</div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function VersionHistory({ page, pageKey }: { page: TenantSiteCmsPage; pageKey: TenantSitePageKey }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-bold"><FileClock className="size-5 text-sky-600" />Versiehistorie</h2><StatusPill tone="neutral">{page.versions.length}</StatusPill></div>
      <div className="mt-3 space-y-2">
        {page.versions.slice(0, 8).map((version) => (
          <article className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2" key={version.id}>
            <div><p className="text-xs font-bold text-foreground">Versie {version.number} · {version.status}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{version.summary ?? "Geen samenvatting"} · {formatDateTime(version.createdAt)}</p></div>
            {version.id !== page.draftVersionId ? (
              <ConfirmActionForm
                action={restoreTenantSiteVersionAction}
                confirmLabel="Als nieuw concept herstellen"
                description="De historische snapshot wordt gekopieerd naar een nieuwe conceptversie. De live website blijft ongewijzigd tot je opnieuw publiceert."
                hiddenFields={{ pageKey, versionId: version.id, humanConfirmation: "restore" }}
                title={`Versie ${version.number} herstellen?`}
                triggerLabel={<RotateCcw className="size-3.5" />}
                triggerVariant="outline"
              />
            ) : <StatusPill tone="info">Huidig concept</StatusPill>}
          </article>
        ))}
      </div>
    </section>
  );
}

function MediaLibrary({ assets }: { assets: TenantMediaAssetView[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-bold"><Layers3 className="size-5 text-violet-600" />Mediabibliotheek</h2><StatusPill tone="neutral">{assets.length}</StatusPill></div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {assets.slice(0, 8).map((asset) => (
          <figure className="overflow-hidden rounded-xl border border-border bg-muted/25" key={asset.id}>
            <img alt={asset.altText} className="aspect-[4/3] w-full object-cover" src={asset.url} />
            <figcaption className="p-2"><p className="truncate text-xs font-bold text-foreground">{asset.name}</p><div className="mt-1 flex flex-wrap gap-1"><StatusPill tone={["not_required", "granted"].includes(asset.consentStatus) ? "success" : "warning"}>{consentLabel(asset.consentStatus)}</StatusPill>{asset.publicEnabled ? <StatusPill tone="info">Publiek gebruikt</StatusPill> : null}</div></figcaption>
          </figure>
        ))}
      </div>
      {!assets.length ? <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Nog geen afbeeldingen geüpload.</p> : null}
    </section>
  );
}

function AssetUploadForm({ pageKey }: { pageKey: TenantSitePageKey }) {
  return (
    <form action={uploadTenantMediaAssetAction} className="space-y-4">
      <input name="pageKey" type="hidden" value={pageKey} />
      <Field label="Interne naam" name="name" required maxLength={120} placeholder="Teamfoto instructeurs" />
      <TextAreaField label="Alt-tekst voor toegankelijkheid" name="altText" required maxLength={240} placeholder="Drie zweminstructeurs naast het instructiebad." />
      <SelectField label="Type" name="assetKind" defaultValue="photo"><option value="photo">Foto</option><option value="graphic">Graphic</option><option value="logo">Logo</option><option value="icon">Icoon</option></SelectField>
      <label className="grid gap-1.5 text-sm font-semibold text-foreground">JPEG of PNG<input accept="image/jpeg,image/png" className="rounded-lg border border-border bg-background p-2 text-sm" name="file" required type="file" /></label>
      <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 text-sm font-semibold"><input name="containsPeople" type="checkbox" />Er staan herkenbare personen op deze afbeelding</label>
      <SelectField label="Toestemming bij herkenbare personen" name="consentStatus" defaultValue="restricted"><option value="restricted">Nog niet publiek toegestaan</option><option value="granted">Aantoonbaar toegestaan</option></SelectField>
      <Field label="Toestemmingsreferentie — vereist bij toegestaan" name="consentReference" maxLength={240} placeholder="Consentformulier 2026-014" />
      <Field label="Toestemming verloopt — optioneel" name="consentExpiresAt" type="datetime-local" />
      <p className="rounded-lg bg-sky-50 p-3 text-xs leading-5 text-sky-950"><ShieldCheck className="mr-1 inline size-4" />Bestanden blijven private in Storage. Alleen een expliciet gepubliceerde versie kan een geldige afbeelding publiek ontsluiten.</p>
      <SubmitButton>Veilig uploaden</SubmitButton>
    </form>
  );
}

function SectionForm({ assets, pageKey, section }: { assets: TenantMediaAssetView[]; pageKey: TenantSitePageKey; section?: TenantSiteSection }) {
  return (
    <form action={saveTenantSiteSectionAction} className="space-y-5">
      <input name="pageKey" type="hidden" value={pageKey} />
      {section ? <input name="sectionId" type="hidden" value={section.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField defaultValue={section?.type ?? "usp_cards"} label="Sectietype" name="sectionType">
          {tenantSiteSectionTypes.map((type) => <option key={type} value={type}>{sectionLabel(type)}</option>)}
        </SelectField>
        <SelectField defaultValue={section?.style ?? "cards"} label="Layoutstijl" name="sectionStyle"><option value="cards">Kaarten</option><option value="editorial">Redactioneel</option><option value="compact">Compact</option><option value="split">Split panel</option></SelectField>
        <div className="sm:col-span-2"><Field defaultValue={section?.title ?? ""} label="Sectietitel" name="sectionTitle" required maxLength={120} /></div>
        <div className="sm:col-span-2"><TextAreaField defaultValue={section?.intro ?? ""} label="Intro — optioneel" name="sectionIntro" maxLength={500} /></div>
      </div>
      <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 text-sm font-semibold"><input defaultChecked={section?.visible ?? true} name="sectionVisible" type="checkbox" />Sectie tonen na publicatie</label>
      <label className="grid gap-1.5 text-sm font-semibold text-foreground">Galerij-/sectieafbeeldingen<select className="min-h-28 rounded-lg border border-border bg-background p-2 text-sm font-normal" defaultValue={section?.assetIds} multiple name="assetIds">{publishableAssets(assets).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><span className="text-xs font-normal text-muted-foreground">Gebruik Ctrl/Cmd om meerdere afbeeldingen te kiezen.</span></label>
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">Inhoudskaarten</h3>
        {Array.from({ length: 6 }, (_, index) => {
          const item = section?.items[index];
          return (
            <section className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-2" key={item?.id ?? index}>
              {item ? <input name={`itemId${index}`} type="hidden" value={item.id} /> : null}
              <Field defaultValue={item?.title ?? ""} label={`Item ${index + 1} titel`} name={`itemTitle${index}`} maxLength={120} />
              <Field defaultValue={item?.subtitle ?? ""} label="Subtitel — optioneel" name={`itemSubtitle${index}`} maxLength={120} />
              <div className="sm:col-span-2"><TextAreaField defaultValue={item?.text ?? ""} label="Tekst" name={`itemText${index}`} maxLength={700} /></div>
              <SelectField defaultValue={item?.assetId ?? ""} label="Afbeelding — optioneel" name={`itemAssetId${index}`}><option value="">Geen</option>{publishableAssets(assets).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</SelectField>
              <div className="grid gap-3 sm:grid-cols-2"><Field defaultValue={item?.ctaLabel ?? ""} label="CTA-label" name={`itemCtaLabel${index}`} maxLength={80} /><Field defaultValue={item?.ctaHref ?? ""} label="Interne CTA-link" name={`itemCtaHref${index}`} maxLength={160} /></div>
            </section>
          );
        })}
      </div>
      <SubmitButton>{section ? "Sectie bijwerken" : "Sectie toevoegen"}</SubmitButton>
    </form>
  );
}

function publishableAssets(assets: TenantMediaAssetView[]) {
  return assets.filter((asset) => asset.status === "active" && ["not_required", "granted"].includes(asset.consentStatus) && (!asset.consentExpiresAt || new Date(asset.consentExpiresAt) > new Date()));
}

function pageHref(key: TenantSitePageKey) {
  return ({ home: "/", programs: "/programmas", agenda: "/agenda", news: "/nieuws" } satisfies Record<TenantSitePageKey, string>)[key];
}

function pageLabel(key: TenantSitePageKey) {
  return ({ home: "Home", programs: "Programma’s", agenda: "Agenda", news: "Nieuws" } satisfies Record<TenantSitePageKey, string>)[key];
}

function sectionLabel(type: string) {
  return ({ programs: "Programma-overzicht", usp_cards: "USP-kaarten", instructor_team: "Instructeursteam", locations: "Locaties", faq: "FAQ", reviews: "Reviews", news: "Nieuws", trial_cta: "Proefles-CTA", gallery: "Galerij" } as Record<string, string>)[type] ?? type;
}

function themeClass(theme: string) {
  if (theme === "navy") return "bg-gradient-to-br from-slate-950 to-blue-950 text-white [&_.text-muted-foreground]:text-white/70 [&_.text-primary]:text-cyan-300";
  if (theme === "calm") return "bg-gradient-to-br from-slate-50 to-white";
  return "bg-gradient-to-br from-aqua-soft via-white to-primary/10";
}

function consentLabel(status: string) {
  return status === "not_required" ? "Geen consent nodig" : status === "granted" ? "Consent geldig" : status === "restricted" ? "Niet publiek" : status;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value));
}
