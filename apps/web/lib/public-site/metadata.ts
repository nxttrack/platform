import type { Metadata } from "next";

import type { PublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export function buildTenantPublicMetadata(snapshot: PublicTenantSiteSnapshot, fallbackTitle: string): Metadata {
  const title = snapshot.profile?.seoTitle || snapshot.profile?.heroTitle || fallbackTitle;
  const description = snapshot.profile?.seoDescription || snapshot.profile?.heroSubtitle || "NXTTRACK tenantwebsite";
  const imageUrl = snapshot.profile?.socialImageUrl || snapshot.profile?.heroImageUrl || null;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: imageUrl ? [{ url: imageUrl }] : undefined,
      siteName: snapshot.tenant?.name ?? "NXTTRACK",
      type: "website"
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined
    }
  };
}
