import { ExternalLink, Globe2, Search, Sparkles } from "lucide-react";
import Link from "next/link";

import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { DirtyForm } from "@/components/ui/dirty-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { getDefaultTenantSitePages, normalizeTenantSitePage, tenantSitePageKeys, type TenantSitePageKey } from "@/lib/domain/site-page-contract";
import { saveTenantSitePageAction } from "@/lib/domain/site-page-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminWebsitePage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/admin/website");
  const tenant = getActiveTenant(context);
  const params = await (searchParams ?? Promise.resolve({}));
  const requested = getParam(params, "pagina");
  const selectedKey = tenantSitePageKeys.includes(requested as TenantSitePageKey) ? requested as TenantSitePageKey : "home";
  const result = await createAdminClient()
    .from("tenant_site_pages")
    .select("page_key, eyebrow, title, intro, primary_cta_label, primary_cta_href, secondary_cta_label, secondary_cta_href, seo_title, seo_description, theme, status, updated_at")
    .eq("tenant_id", tenant.id)
    .order("page_key");
  if (result.error) throw new Error(`Could not load tenant website pages: ${result.error.message}`);

  const defaults = getDefaultTenantSitePages(tenant.name);
  const pages = Object.fromEntries(tenantSitePageKeys.map((key) => [
    key,
    normalizeTenantSitePage((result.data ?? []).find((row) => row.page_key === key), defaults[key])
  ])) as Record<TenantSitePageKey, ReturnType<typeof normalizeTenantSitePage>>;
  const selected = pages[selectedKey];
  const publishedCount = tenantSitePageKeys.filter((key) => pages[key].status === "published").length;

  return (
    <div className="space-y-5">
      <PageHeader
        action={<a className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-muted" href={pageHref(selectedKey)} rel="noreferrer" target="_blank">Bekijk pagina<ExternalLink className="size-4" /></a>}
        kicker="CRM & website"
        title="Websitepagina’s"
        subtitle="Pas de publieke klantreis aan met veilige, gestructureerde copy, CTA’s, zichtbaarheid en zoekmachinevelden. Er wordt geen vrije HTML of scriptcode gepubliceerd."
      />
      <RouteFeedback error={getParam(params, "error") ? websiteError(getParam(params, "error")!) : null} success={getParam(params, "saved") ? "Websitepagina gepubliceerd." : null} />

      <div className="grid gap-3 sm:grid-cols-3">
        <AdminMetricCard icon={Globe2} label="Publieke pagina’s" value={tenantSitePageKeys.length} />
        <AdminMetricCard icon={Sparkles} label="Zichtbaar" tone="success" value={publishedCount} />
        <AdminMetricCard icon={Search} label="SEO ingevuld" tone="info" value={tenantSitePageKeys.filter((key) => pages[key].seoTitle && pages[key].seoDescription).length} />
      </div>

      <nav aria-label="Websitepagina kiezen" className="flex gap-2 overflow-x-auto rounded-xl border border-border bg-card p-2 shadow-soft">
        {tenantSitePageKeys.map((key) => (
          <Link
            aria-current={selectedKey === key ? "page" : undefined}
            className={cn("inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold", selectedKey === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
            href={`/admin/website?pagina=${key}`}
            key={key}
          >
            {pageLabel(key)}
            <StatusPill className={selectedKey === key ? "bg-white/15 text-white ring-white/20" : ""} tone={pages[key].status === "published" ? "success" : "neutral"}>{pages[key].status === "published" ? "Live" : "Verborgen"}</StatusPill>
          </Link>
        ))}
      </nav>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
        <DirtyForm action={saveTenantSitePageAction} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <input name="pageKey" type="hidden" value={selectedKey} />
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">{pageLabel(selectedKey)}</p>
            <h2 className="mt-1 text-xl font-bold">Publieke inhoud</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bovenregel" name="eyebrow" defaultValue={selected.eyebrow} maxLength={80} required />
            <SelectField defaultValue={selected.theme} label="Visuele sfeer" name="theme">
              <option value="water">Water · lichtblauw</option>
              <option value="calm">Rustig · neutraal</option>
              <option value="navy">Premium · donkerblauw</option>
            </SelectField>
            <div className="sm:col-span-2"><Field label="Paginatitel" name="title" defaultValue={selected.title} maxLength={140} required /></div>
            <div className="sm:col-span-2"><TextAreaField label="Introductie" name="intro" defaultValue={selected.intro} maxLength={600} required /></div>
          </div>
          <div className="grid gap-4 rounded-xl border border-border bg-muted/25 p-4 sm:grid-cols-2">
            <Field label="Primaire knop" name="primaryCtaLabel" defaultValue={selected.primaryCtaLabel ?? ""} maxLength={80} placeholder="Aanmelden" />
            <Field label="Interne link" name="primaryCtaHref" defaultValue={selected.primaryCtaHref ?? ""} maxLength={160} placeholder="/intake" />
            <Field label="Secundaire knop" name="secondaryCtaLabel" defaultValue={selected.secondaryCtaLabel ?? ""} maxLength={80} placeholder="Bekijk programma’s" />
            <Field label="Interne link" name="secondaryCtaHref" defaultValue={selected.secondaryCtaHref ?? ""} maxLength={160} placeholder="/programmas" />
            <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">Links blijven bewust intern en beginnen met één `/`. Zo kunnen beheerders geen onveilige scripts of onverwachte externe redirects invoegen.</p>
          </div>
          <div className="grid gap-4 rounded-xl border border-border bg-muted/25 p-4">
            <Field label="SEO-titel" name="seoTitle" defaultValue={selected.seoTitle} maxLength={70} required />
            <TextAreaField label="SEO-omschrijving" name="seoDescription" defaultValue={selected.seoDescription} maxLength={180} required />
          </div>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 text-sm font-semibold">
            <input defaultChecked={selected.status === "published"} name="visible" type="checkbox" />
            Pagina zichtbaar in de publieke website
          </label>
          <SubmitButton>Opslaan en publiceren</SubmitButton>
        </DirtyForm>

        <aside className={cn("overflow-hidden rounded-3xl border border-border shadow-card", themeClass(selected.theme))}>
          <div className="p-6 md:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{selected.eyebrow}</p>
            <h2 className="mt-4 text-3xl font-bold leading-tight">{selected.title}</h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{selected.intro}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {selected.primaryCtaLabel ? <span className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{selected.primaryCtaLabel}</span> : null}
              {selected.secondaryCtaLabel ? <span className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold">{selected.secondaryCtaLabel}</span> : null}
            </div>
          </div>
          <div className="border-t border-border bg-card/80 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Zoekresultaat</p>
            <p className="mt-3 text-base font-semibold text-primary">{selected.seoTitle}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{selected.seoDescription}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function pageHref(key: TenantSitePageKey) {
  return ({ home: "/", programs: "/programmas", agenda: "/agenda", news: "/nieuws" } satisfies Record<TenantSitePageKey, string>)[key];
}

function pageLabel(key: TenantSitePageKey) {
  return ({ home: "Home", programs: "Programma’s", agenda: "Agenda", news: "Nieuws" } satisfies Record<TenantSitePageKey, string>)[key];
}

function themeClass(theme: string) {
  if (theme === "navy") return "bg-gradient-to-br from-slate-950 to-blue-950 text-white [&_.text-muted-foreground]:text-white/70 [&_.text-primary]:text-aqua";
  if (theme === "calm") return "bg-gradient-to-br from-slate-50 to-white";
  return "bg-gradient-to-br from-aqua-soft via-white to-primary/10";
}

function websiteError(value: string) {
  return value === "cta" ? "Vul voor een knop zowel het label als een veilige interne link in." : "De websitepagina kon niet worden opgeslagen.";
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
