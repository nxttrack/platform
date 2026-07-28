"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { scanUpload } from "@/lib/security/malware-scanner";
import { TENANT_MEDIA_ASSETS_BUCKET, uploadTenantMediaAssetFile } from "@/lib/storage/private-files";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import {
  createTenantSiteSnapshot,
  getDefaultTenantSitePages,
  isSafeTenantSiteHref,
  normalizeTenantSitePage,
  normalizeTenantSiteSnapshot,
  tenantSitePageKeys,
  tenantSiteSectionTypes,
  tenantSiteThemes,
  type TenantSitePageContent,
  type TenantSitePageKey,
  type TenantSiteSection
} from "./site-page-contract";

const path = "/admin/website";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveTenantSitePageAction(formData: FormData) {
  return saveTenantSitePageDraftAction(formData);
}

export async function saveTenantSitePageDraftAction(formData: FormData) {
  const context = await requireCmsAdmin();
  const pageKey = readEnum(formData, "pageKey", tenantSitePageKeys, "home");
  const current = await loadDraft(context.tenant.id, context.tenant.name, pageKey);
  const primary = readCta(formData, "primary", pageKey);
  const secondary = readCta(formData, "secondary", pageKey);
  const content: TenantSitePageContent = {
    ...current.content,
    eyebrow: readRequired(formData, "eyebrow", 80),
    heroAssetId: readOptionalUuid(formData, "heroAssetId"),
    title: readRequired(formData, "title", 140),
    intro: readRequired(formData, "intro", 600),
    primaryCtaLabel: primary.label,
    primaryCtaHref: primary.href,
    secondaryCtaLabel: secondary.label,
    secondaryCtaHref: secondary.href,
    seoTitle: readRequired(formData, "seoTitle", 70),
    seoDescription: readRequired(formData, "seoDescription", 180),
    theme: readEnum(formData, "theme", tenantSiteThemes, "water"),
    status: formData.get("visible") === "on" ? "published" : "hidden"
  };
  const result = await writeDraft({
    tenantId: context.tenant.id,
    pageId: current.pageId,
    content,
    actorUserId: context.user.id,
    parentVersionId: current.versionId,
    summary: readOptional(formData, "changeSummary", 240) ?? "Paginakop, CTA’s of SEO bijgewerkt",
    eventType: "draft_saved"
  });
  if (!result.ok) redirect(`${path}?pagina=${pageKey}&error=${result.error}`);
  refreshPublic();
  redirect(`${path}?pagina=${pageKey}&saved=draft`);
}

export async function saveTenantSiteSectionAction(formData: FormData) {
  const context = await requireCmsAdmin();
  const pageKey = readEnum(formData, "pageKey", tenantSitePageKeys, "home");
  const current = await loadDraft(context.tenant.id, context.tenant.name, pageKey);
  const requestedId = readOptionalUuid(formData, "sectionId");
  const type = readEnum(formData, "sectionType", tenantSiteSectionTypes, "usp_cards");
  const section: TenantSiteSection = {
    id: requestedId ?? randomUUID(),
    type,
    title: readRequired(formData, "sectionTitle", 120),
    intro: readOptional(formData, "sectionIntro", 500),
    style: readEnum(formData, "sectionStyle", ["cards", "editorial", "compact", "split"] as const, "cards"),
    visible: formData.get("sectionVisible") === "on",
    assetIds: formData.getAll("assetIds").flatMap((value) => typeof value === "string" && uuidPattern.test(value) ? [value] : []).slice(0, 12),
    items: Array.from({ length: 6 }, (_, index) => {
      const title = readOptional(formData, `itemTitle${index}`, 120);
      if (!title) return null;
      const ctaHref = readOptional(formData, `itemCtaHref${index}`, 160);
      if (ctaHref && !isSafeTenantSiteHref(ctaHref)) redirect(`${path}?pagina=${pageKey}&error=cta`);
      return {
        id: readOptionalUuid(formData, `itemId${index}`) ?? randomUUID(),
        title,
        text: readOptional(formData, `itemText${index}`, 700) ?? "",
        subtitle: readOptional(formData, `itemSubtitle${index}`, 120),
        assetId: readOptionalUuid(formData, `itemAssetId${index}`),
        ctaLabel: readOptional(formData, `itemCtaLabel${index}`, 80),
        ctaHref
      };
    }).filter((item): item is NonNullable<typeof item> => !!item)
  };
  const sections = [...current.content.sections];
  const existingIndex = sections.findIndex((item) => item.id === section.id);
  if (existingIndex >= 0) sections[existingIndex] = section;
  else sections.push(section);
  const result = await writeDraft({
    tenantId: context.tenant.id,
    pageId: current.pageId,
    content: { ...current.content, sections },
    actorUserId: context.user.id,
    parentVersionId: current.versionId,
    summary: `${existingIndex >= 0 ? "Sectie bijgewerkt" : "Sectie toegevoegd"}: ${section.title}`,
    eventType: existingIndex >= 0 ? "section_updated" : "section_added"
  });
  if (!result.ok) redirect(`${path}?pagina=${pageKey}&error=${result.error}`);
  revalidatePath(path);
  redirect(`${path}?pagina=${pageKey}&saved=section`);
}

export async function moveTenantSiteSectionAction(formData: FormData) {
  const context = await requireCmsAdmin();
  const pageKey = readEnum(formData, "pageKey", tenantSitePageKeys, "home");
  const sectionId = readUuid(formData, "sectionId");
  const direction = readEnum(formData, "direction", ["up", "down"] as const, "up");
  const current = await loadDraft(context.tenant.id, context.tenant.name, pageKey);
  const sections = [...current.content.sections];
  const index = sections.findIndex((section) => section.id === sectionId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= sections.length) redirect(`${path}?pagina=${pageKey}&error=section`);
  [sections[index], sections[target]] = [sections[target], sections[index]];
  const result = await writeDraft({
    tenantId: context.tenant.id,
    pageId: current.pageId,
    content: { ...current.content, sections },
    actorUserId: context.user.id,
    parentVersionId: current.versionId,
    summary: `Sectievolgorde gewijzigd: ${sections[target].title}`,
    eventType: "section_moved"
  });
  if (!result.ok) redirect(`${path}?pagina=${pageKey}&error=${result.error}`);
  revalidatePath(path);
  redirect(`${path}?pagina=${pageKey}&saved=moved`);
}

export async function removeTenantSiteSectionAction(formData: FormData) {
  const context = await requireCmsAdmin();
  const pageKey = readEnum(formData, "pageKey", tenantSitePageKeys, "home");
  const sectionId = readUuid(formData, "sectionId");
  if (formData.get("humanConfirmation") !== "remove") redirect(`${path}?pagina=${pageKey}&error=confirmation`);
  const current = await loadDraft(context.tenant.id, context.tenant.name, pageKey);
  const removed = current.content.sections.find((section) => section.id === sectionId);
  if (!removed) redirect(`${path}?pagina=${pageKey}&error=section`);
  const result = await writeDraft({
    tenantId: context.tenant.id,
    pageId: current.pageId,
    content: { ...current.content, sections: current.content.sections.filter((section) => section.id !== sectionId) },
    actorUserId: context.user.id,
    parentVersionId: current.versionId,
    summary: `Sectie verwijderd: ${removed.title}`,
    eventType: "section_removed"
  });
  if (!result.ok) redirect(`${path}?pagina=${pageKey}&error=${result.error}`);
  revalidatePath(path);
  redirect(`${path}?pagina=${pageKey}&saved=removed`);
}

export async function publishTenantSitePageAction(formData: FormData) {
  const context = await requireCmsAdmin();
  const pageKey = readEnum(formData, "pageKey", tenantSitePageKeys, "home");
  const versionId = readUuid(formData, "versionId");
  if (formData.get("humanConfirmation") !== "publish") redirect(`${path}?pagina=${pageKey}&error=confirmation`);
  const current = await loadDraft(context.tenant.id, context.tenant.name, pageKey);
  if (current.versionId !== versionId) redirect(`${path}?pagina=${pageKey}&error=stale`);
  const result = await createAdminClient().rpc("publish_tenant_site_version", {
    p_tenant_id: context.tenant.id,
    p_page_id: current.pageId,
    p_version_id: versionId,
    p_actor_user_id: context.user.id
  });
  if (result.error || result.data !== true) {
    redirect(`${path}?pagina=${pageKey}&error=${result.error?.message.includes("site_asset_not_publishable") ? "asset_consent" : "publish"}`);
  }
  refreshPublic();
  redirect(`${path}?pagina=${pageKey}&saved=published`);
}

export async function restoreTenantSiteVersionAction(formData: FormData) {
  const context = await requireCmsAdmin();
  const pageKey = readEnum(formData, "pageKey", tenantSitePageKeys, "home");
  const versionId = readUuid(formData, "versionId");
  if (formData.get("humanConfirmation") !== "restore") redirect(`${path}?pagina=${pageKey}&error=confirmation`);
  const admin = createAdminClient();
  const current = await loadDraft(context.tenant.id, context.tenant.name, pageKey);
  const version = await admin.from("tenant_site_page_versions").select("snapshot_json, version_number").eq("tenant_id", context.tenant.id).eq("page_id", current.pageId).eq("id", versionId).maybeSingle();
  if (version.error || !version.data) redirect(`${path}?pagina=${pageKey}&error=version`);
  const content = normalizeTenantSiteSnapshot(version.data.snapshot_json, getDefaultTenantSitePages(context.tenant.name)[pageKey]);
  const result = await writeDraft({
    tenantId: context.tenant.id,
    pageId: current.pageId,
    content,
    actorUserId: context.user.id,
    parentVersionId: versionId,
    summary: `Versie ${version.data.version_number} hersteld als nieuw concept`,
    eventType: "restored"
  });
  if (!result.ok) redirect(`${path}?pagina=${pageKey}&error=${result.error}`);
  revalidatePath(path);
  redirect(`${path}?pagina=${pageKey}&saved=restored`);
}

export async function uploadTenantMediaAssetAction(formData: FormData) {
  const context = await requireCmsAdmin();
  const pageKey = readEnum(formData, "pageKey", tenantSitePageKeys, "home");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png"].includes(file.type)) {
    redirect(`${path}?pagina=${pageKey}&error=asset_file`);
  }
  const name = readRequired(formData, "name", 120);
  const altText = readRequired(formData, "altText", 240);
  const containsPeople = formData.get("containsPeople") === "on";
  const consentStatus = containsPeople ? readEnum(formData, "consentStatus", ["granted", "restricted"] as const, "restricted") : "not_required";
  const consentReference = readOptional(formData, "consentReference", 240);
  if (containsPeople && consentStatus === "granted" && !consentReference) redirect(`${path}?pagina=${pageKey}&error=asset_consent`);
  let processed: File;
  try {
    await scanUpload(file, "site_media");
    processed = await normalizeSiteImage(file);
  } catch {
    redirect(`${path}?pagina=${pageKey}&error=asset_processing`);
  }
  const metadata = await sharp(Buffer.from(await processed.arrayBuffer())).metadata();
  if (!metadata.width || !metadata.height) redirect(`${path}?pagina=${pageKey}&error=asset_processing`);
  const assetId = randomUUID();
  let uploaded: Awaited<ReturnType<typeof uploadTenantMediaAssetFile>>;
  try {
    uploaded = await uploadTenantMediaAssetFile({ assetId, file: processed, tenantId: context.tenant.id });
  } catch {
    redirect(`${path}?pagina=${pageKey}&error=asset_upload`);
  }
  const admin = createAdminClient();
  const insert = await admin.from("tenant_media_assets").insert({
    id: assetId,
    tenant_id: context.tenant.id,
    name,
    alt_text: altText,
    asset_kind: readEnum(formData, "assetKind", ["photo", "graphic", "logo", "icon"] as const, "photo"),
    storage_bucket: uploaded.storageBucket,
    storage_path: uploaded.filePath,
    mime_type: uploaded.mimeType,
    size_bytes: uploaded.sizeBytes,
    width: metadata.width,
    height: metadata.height,
    file_sha256: uploaded.scan.sha256,
    malware_scan_engine: uploaded.scan.engine,
    malware_scan_status: uploaded.scan.status,
    malware_scanned_at: uploaded.scan.scannedAt,
    consent_status: consentStatus,
    consent_reference: consentReference,
    consent_expires_at: readOptionalDateTime(formData, "consentExpiresAt"),
    public_enabled: false,
    status: "active",
    uploaded_by_user_id: context.user.id
  });
  if (insert.error) {
    await admin.storage.from(TENANT_MEDIA_ASSETS_BUCKET).remove([uploaded.filePath]);
    redirect(`${path}?pagina=${pageKey}&error=asset_metadata`);
  }
  revalidatePath(path);
  redirect(`${path}?pagina=${pageKey}&saved=asset`);
}

async function loadDraft(tenantId: string, tenantName: string, pageKey: TenantSitePageKey) {
  const admin = createAdminClient();
  const defaults = getDefaultTenantSitePages(tenantName);
  let page = await admin.from("tenant_site_pages")
    .select("id, page_key, eyebrow, title, intro, primary_cta_label, primary_cta_href, secondary_cta_label, secondary_cta_href, seo_title, seo_description, theme, status, draft_version_id")
    .eq("tenant_id", tenantId)
    .eq("page_key", pageKey)
    .maybeSingle();
  if (page.error) throw new Error(`Could not load site page: ${page.error.message}`);
  if (!page.data) {
    const fallback = defaults[pageKey];
    page = await admin.from("tenant_site_pages").insert({
      tenant_id: tenantId,
      page_key: pageKey,
      eyebrow: fallback.eyebrow,
      title: fallback.title,
      intro: fallback.intro,
      primary_cta_label: fallback.primaryCtaLabel,
      primary_cta_href: fallback.primaryCtaHref,
      secondary_cta_label: fallback.secondaryCtaLabel,
      secondary_cta_href: fallback.secondaryCtaHref,
      seo_title: fallback.seoTitle,
      seo_description: fallback.seoDescription,
      theme: fallback.theme,
      status: "draft"
    }).select("id, page_key, eyebrow, title, intro, primary_cta_label, primary_cta_href, secondary_cta_label, secondary_cta_href, seo_title, seo_description, theme, status, draft_version_id").single();
    if (page.error || !page.data) throw new Error("Could not create site page.");
  }
  const version = page.data.draft_version_id
    ? await admin.from("tenant_site_page_versions").select("id, snapshot_json").eq("tenant_id", tenantId).eq("id", page.data.draft_version_id).maybeSingle()
    : { data: null, error: null };
  if (version.error) throw new Error(`Could not load site draft: ${version.error.message}`);
  const legacy = normalizeTenantSitePage(page.data as Record<string, unknown>, defaults[pageKey]);
  return {
    pageId: page.data.id,
    versionId: version.data?.id ?? null,
    content: version.data ? normalizeTenantSiteSnapshot(version.data.snapshot_json, legacy) : legacy
  };
}

async function writeDraft(input: {
  tenantId: string;
  pageId: string;
  content: TenantSitePageContent;
  actorUserId: string;
  parentVersionId: string | null;
  summary: string;
  eventType: "draft_saved" | "section_added" | "section_updated" | "section_removed" | "section_moved" | "restored";
}): Promise<{ ok: true; versionId: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const snapshot = createTenantSiteSnapshot(input.content);
  const assets = collectSnapshotAssets(input.content);
  const result = await admin.rpc("save_tenant_site_draft", {
    p_tenant_id: input.tenantId,
    p_page_id: input.pageId,
    p_snapshot_json: snapshot,
    p_change_summary: input.summary,
    p_parent_version_id: input.parentVersionId,
    p_actor_user_id: input.actorUserId,
    p_event_type: input.eventType,
    p_asset_ids: assets,
    p_hero_asset_id: input.content.heroAssetId
  });
  if (result.error || typeof result.data !== "string") {
    return { ok: false, error: result.error?.message.includes("site_asset_invalid") ? "asset" : "version" };
  }
  return { ok: true, versionId: result.data };
}

function collectSnapshotAssets(content: TenantSitePageContent) {
  return [...new Set([
    ...(content.heroAssetId ? [content.heroAssetId] : []),
    ...content.sections.flatMap((section) => [
      ...section.assetIds,
      ...section.items.flatMap((item) => item.assetId ? [item.assetId] : [])
    ])
  ])];
}

async function requireCmsAdmin() {
  const context = await requirePrivateShellContext(path);
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) redirect("/admin?error=forbidden");
  return { ...context, tenant };
}

function readCta(formData: FormData, prefix: "primary" | "secondary", pageKey: TenantSitePageKey) {
  const label = readOptional(formData, `${prefix}CtaLabel`, 80);
  const href = readOptional(formData, `${prefix}CtaHref`, 160);
  if (!label && !href) return { href: null, label: null };
  if (!label || !href || !isSafeTenantSiteHref(href)) redirect(`${path}?pagina=${pageKey}&error=cta`);
  return { href, label };
}

async function normalizeSiteImage(file: File) {
  const input = Buffer.from(await file.arrayBuffer());
  const pipeline = sharp(input).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true });
  const buffer = file.type === "image/png"
    ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
    : await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  return new File([new Uint8Array(buffer)], file.type === "image/png" ? "website-afbeelding.png" : "website-afbeelding.jpg", { type: file.type });
}

function refreshPublic() {
  for (const target of ["/", "/programmas", "/agenda", "/nieuws", path]) revalidatePath(target);
}

function readUuid(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function readOptionalUuid(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value) return null;
  if (!uuidPattern.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function readEnum<T extends string>(formData: FormData, name: string, values: readonly T[], fallback: T): T {
  const value = String(formData.get(name) ?? "");
  return values.includes(value as T) ? value as T : fallback;
}

function readRequired(formData: FormData, name: string, maxLength: number) {
  const value = readOptional(formData, name, maxLength);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readOptional(formData: FormData, name: string, maxLength: number) {
  const value = String(formData.get(name) ?? "").trim();
  return value ? value.slice(0, maxLength) : null;
}

function readOptionalDateTime(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} is invalid.`);
  return parsed.toISOString();
}
