import { Eye, ImagePlus, ShieldCheck, TimerReset } from "lucide-react";
import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { MediaLibraryTable } from "@/components/admin/media-library-table";
import { PageHeader } from "@/components/shell/ui";
import { getTenantMediaLibrary } from "@/lib/domain/media-library";

export const dynamic = "force-dynamic";

export default async function TenantMediaLibraryPage() {
  const rows = await getTenantMediaLibrary();
  const expiringSoon = rows.filter((row) => row.consentStatus !== "expired" && new Date(row.expiresAt).getTime() <= Date.now() + 30 * 86_400_000).length;
  return <div className="space-y-5"><PageHeader kicker="Privacyveilige beeldbank" title="Media & graphics" subtitle="Eén tenantbrede bibliotheek met leerlingkoppeling, toestemming, bewaartermijn, malwarestatus en volledige inzagehistorie." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><AdminMetricCard icon={ImagePlus} label="Media-items" tone="info" value={rows.length} /><AdminMetricCard icon={ShieldCheck} label="Toestemming actief" tone="success" value={rows.filter((row) => row.consentStatus === "active").length} /><AdminMetricCard icon={TimerReset} label="Verloopt binnen 30 dagen" tone={expiringSoon ? "warning" : "success"} value={expiringSoon} /><AdminMetricCard icon={Eye} label="Inzagemomenten" tone="neutral" value={rows.reduce((sum, row) => sum + row.accessCount, 0)} /></div><section className="rounded-2xl border border-border bg-card p-4 shadow-soft"><MediaLibraryTable rows={rows} /></section></div>;
}
