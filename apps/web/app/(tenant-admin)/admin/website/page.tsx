import { Eye, FileClock, Images, Layers3, Search } from "lucide-react";

import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { TenantSiteCmsWorkspace } from "@/components/admin/tenant-site-cms-workspace";
import { PageHeader } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { getTenantSiteCmsData } from "@/lib/domain/site-cms";
import { tenantSitePageKeys, type TenantSitePageKey } from "@/lib/domain/site-page-contract";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminWebsitePage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/admin/website");
  const tenant = getActiveTenant(context);
  const params = (await searchParams) ?? {};
  const requested = getParam(params, "pagina");
  const selectedKey = tenantSitePageKeys.includes(requested as TenantSitePageKey) ? requested as TenantSitePageKey : "home";
  const data = await getTenantSiteCmsData(tenant.id, tenant.name);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const seoComplete = tenantSitePageKeys.filter((key) => data.pages[key].draft.seoTitle && data.pages[key].draft.seoDescription).length;

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Website CMS 2.0"
        title="Website studio"
        subtitle="Bouw een premium zwemschoolwebsite met gecontroleerde secties, veilige media, concepten, publicatiepreview, versiehistorie en herstelbare wijzigingen."
      />
      <RouteFeedback error={error ? errorMessage(error) : null} success={saved ? successMessage(saved) : null} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <AdminMetricCard icon={Layers3} label="Pagina’s" value={data.metrics.pages} />
        <AdminMetricCard icon={Eye} label="Gepubliceerd" tone="success" value={data.metrics.published} />
        <AdminMetricCard icon={FileClock} label="Open concepten" tone={data.metrics.drafts ? "warning" : "success"} value={data.metrics.drafts} />
        <AdminMetricCard icon={Images} label="Mediabibliotheek" tone="info" value={data.metrics.assets} />
        <AdminMetricCard icon={Search} label="SEO compleet" tone="success" value={`${seoComplete}/${data.metrics.pages}`} />
      </div>
      <TenantSiteCmsWorkspace data={data} selectedKey={selectedKey} />
    </div>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function successMessage(code: string) {
  return ({
    draft: "Concept opgeslagen. De publieke website is nog niet gewijzigd.",
    section: "Sectie opgeslagen in een nieuwe conceptversie.",
    moved: "Sectievolgorde opgeslagen in een nieuwe conceptversie.",
    removed: "Sectie herstelbaar verwijderd uit het concept.",
    published: "De volledige websiteversie is atomair gepubliceerd.",
    restored: "Historische versie als nieuw concept hersteld; nog niet gepubliceerd.",
    asset: "Afbeelding veilig verwerkt en toegevoegd aan de mediabibliotheek."
  } as Record<string, string>)[code] ?? "CMS-wijziging opgeslagen.";
}

function errorMessage(code: string) {
  return ({
    cta: "CTA-links moeten veilige interne paden zijn en altijd een label hebben.",
    confirmation: "De vereiste menselijke bevestiging ontbreekt.",
    stale: "Er is inmiddels een nieuwere conceptversie. Ververs de pagina.",
    asset: "Een gebruikte afbeelding bestaat niet meer of is niet actief.",
    asset_file: "Upload een JPEG- of PNG-afbeelding van maximaal 10 MB.",
    asset_processing: "De afbeelding kon niet veilig worden gescand en genormaliseerd.",
    asset_upload: "De afbeelding kon niet in de private mediabucket worden opgeslagen.",
    asset_metadata: "De afbeeldingsmetadata kon niet veilig worden vastgelegd.",
    asset_consent: "Een gebruikte afbeelding heeft geen geldige toestemming voor publieke publicatie.",
    publish: "De versie kon niet atomair worden gepubliceerd.",
    version: "De concept- of historische versie kon niet worden verwerkt.",
    section: "De gekozen sectie bestaat niet meer.",
    save: "Het concept kon niet worden opgeslagen."
  } as Record<string, string>)[code] ?? `CMS-actie niet uitgevoerd: ${code}.`;
}
