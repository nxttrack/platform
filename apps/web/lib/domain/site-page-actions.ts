"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { isSafeTenantSiteHref, tenantSitePageKeys, tenantSiteThemes } from "./site-page-contract";

export async function saveTenantSitePageAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/website");
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) {
    redirect("/admin?error=forbidden");
  }
  const pageKey = readEnum(formData, "pageKey", tenantSitePageKeys, "home");
  const primary = readCta(formData, "primary");
  const secondary = readCta(formData, "secondary");
  const admin = createAdminClient();
  const { error } = await admin.from("tenant_site_pages").upsert({
    tenant_id: tenant.id,
    page_key: pageKey,
    eyebrow: readRequired(formData, "eyebrow", 80),
    title: readRequired(formData, "title", 140),
    intro: readRequired(formData, "intro", 600),
    primary_cta_label: primary.label,
    primary_cta_href: primary.href,
    secondary_cta_label: secondary.label,
    secondary_cta_href: secondary.href,
    seo_title: readRequired(formData, "seoTitle", 70),
    seo_description: readRequired(formData, "seoDescription", 180),
    theme: readEnum(formData, "theme", tenantSiteThemes, "water"),
    status: formData.get("visible") === "on" ? "published" : "hidden",
    updated_by_user_id: context.user.id
  }, { onConflict: "tenant_id,page_key" });

  if (error) redirect(`/admin/website?pagina=${pageKey}&error=save`);
  for (const path of ["/", "/programmas", "/agenda", "/nieuws", "/admin/website"]) revalidatePath(path);
  redirect(`/admin/website?pagina=${pageKey}&saved=1`);
}

function readCta(formData: FormData, prefix: "primary" | "secondary") {
  const label = readOptional(formData, `${prefix}CtaLabel`, 80);
  const href = readOptional(formData, `${prefix}CtaHref`, 160);
  if (!label && !href) return { href: null, label: null };
  if (!label || !href || !isSafeTenantSiteHref(href)) {
    redirect(`/admin/website?pagina=${readEnum(formData, "pageKey", tenantSitePageKeys, "home")}&error=cta`);
  }
  return { href, label };
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
