import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getDefaultTenantSitePages,
  normalizeTenantSitePage,
  normalizeTenantSiteSnapshot,
  tenantSitePageKeys,
  type TenantSitePageContent,
  type TenantSitePageKey
} from "./site-page-contract";

export type TenantMediaAssetView = {
  id: string;
  name: string;
  altText: string;
  kind: string;
  mimeType: string;
  width: number;
  height: number;
  consentStatus: string;
  consentExpiresAt: string | null;
  publicEnabled: boolean;
  status: string;
  url: string;
  createdAt: string;
};

export type TenantSiteCmsPage = {
  id: string | null;
  key: TenantSitePageKey;
  draft: TenantSitePageContent;
  published: TenantSitePageContent | null;
  draftVersionId: string | null;
  publishedVersionId: string | null;
  hasUnpublishedChanges: boolean;
  versions: Array<{
    id: string;
    number: number;
    status: string;
    summary: string | null;
    createdAt: string;
    publishedAt: string | null;
  }>;
};

export async function getTenantSiteCmsData(tenantId: string, tenantName: string) {
  const admin = createAdminClient();
  const [pagesResult, versionsResult, assetsResult] = await Promise.all([
    admin.from("tenant_site_pages")
      .select("id, page_key, eyebrow, title, intro, primary_cta_label, primary_cta_href, secondary_cta_label, secondary_cta_href, seo_title, seo_description, theme, status, draft_version_id, published_version_id, updated_at")
      .eq("tenant_id", tenantId)
      .order("page_key"),
    admin.from("tenant_site_page_versions")
      .select("id, page_id, version_number, status, snapshot_json, change_summary, published_at, created_at")
      .eq("tenant_id", tenantId)
      .order("version_number", { ascending: false })
      .limit(200),
    admin.from("tenant_media_assets")
      .select("id, name, alt_text, asset_kind, mime_type, width, height, consent_status, consent_expires_at, public_enabled, status, created_at")
      .eq("tenant_id", tenantId)
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .limit(200)
  ]);
  assertResult(pagesResult.error, "site pages");
  assertResult(versionsResult.error, "site versions");
  assertResult(assetsResult.error, "media library");
  const defaults = getDefaultTenantSitePages(tenantName);
  const rows = pagesResult.data ?? [];
  const versions = versionsResult.data ?? [];

  const pages = Object.fromEntries(tenantSitePageKeys.map((key): [TenantSitePageKey, TenantSiteCmsPage] => {
    const row = rows.find((item) => item.page_key === key) ?? null;
    const pageVersions = row ? versions.filter((version) => version.page_id === row.id) : [];
    const draftVersion = pageVersions.find((version) => version.id === row?.draft_version_id) ?? pageVersions.find((version) => version.status === "draft") ?? null;
    const publishedVersion = pageVersions.find((version) => version.id === row?.published_version_id) ?? pageVersions.find((version) => version.status === "published") ?? null;
    const legacy = normalizeTenantSitePage(row as Record<string, unknown> | null, defaults[key]);
    return [key, {
      id: row?.id ?? null,
      key,
      draft: draftVersion ? normalizeTenantSiteSnapshot(draftVersion.snapshot_json, legacy) : legacy,
      published: publishedVersion
        ? normalizeTenantSiteSnapshot(publishedVersion.snapshot_json, legacy)
        : row && row.status !== "draft"
          ? legacy
          : null,
      draftVersionId: draftVersion?.id ?? null,
      publishedVersionId: publishedVersion?.id ?? null,
      hasUnpublishedChanges: !!draftVersion && draftVersion.id !== publishedVersion?.id,
      versions: pageVersions.map((version) => ({
        id: version.id,
        number: version.version_number,
        status: version.status,
        summary: version.change_summary,
        createdAt: version.created_at,
        publishedAt: version.published_at
      }))
    }];
  })) as Record<TenantSitePageKey, TenantSiteCmsPage>;
  const assets: TenantMediaAssetView[] = (assetsResult.data ?? []).map((asset) => ({
    id: asset.id,
    name: asset.name,
    altText: asset.alt_text,
    kind: asset.asset_kind,
    mimeType: asset.mime_type,
    width: asset.width,
    height: asset.height,
    consentStatus: asset.consent_status,
    consentExpiresAt: asset.consent_expires_at,
    publicEnabled: asset.public_enabled,
    status: asset.status,
    url: `/api/files/tenant-media-asset/${asset.id}`,
    createdAt: asset.created_at
  }));
  return {
    pages,
    assets,
    metrics: {
      pages: tenantSitePageKeys.length,
      published: tenantSitePageKeys.filter((key) => !!pages[key].published && pages[key].published?.status === "published").length,
      drafts: tenantSitePageKeys.filter((key) => pages[key].hasUnpublishedChanges).length,
      assets: assets.filter((asset) => asset.status === "active").length,
      publishableAssets: assets.filter((asset) => asset.status === "active" && ["not_required", "granted"].includes(asset.consentStatus)).length
    }
  };
}

function assertResult(error: { message: string } | null, label: string): asserts error is null {
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
}
