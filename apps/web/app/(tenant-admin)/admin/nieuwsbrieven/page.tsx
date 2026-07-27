import { CalendarClock, MailCheck, MailWarning, Newspaper } from "lucide-react";

import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { DeliveryTable, NewsletterCampaignsTable } from "@/components/communication/communication-admin-tables";
import { NewsletterCampaignForm } from "@/components/communication/communication-forms";
import { PageHeader } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { getAdminCommunicationHub } from "@/lib/domain/communication-hub";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
export const dynamic = "force-dynamic";

export default async function NewslettersPage({ searchParams }: PageProps) {
  const [hub, params] = await Promise.all([getAdminCommunicationHub(), searchParams ?? Promise.resolve({})]);
  const scheduled = hub.campaigns.filter((item) => item.status === "scheduled").length;
  const sent = hub.recipients.filter((item) => item.status === "sent").length;
  const skipped = hub.recipients.filter((item) => item.status.startsWith("skipped")).length;

  return (
    <div className="space-y-5">
      <PageHeader
        action={<AdminActionDrawer description="Maak een concept, kies een consent-veilig segment en plan pas na menselijke controle." title="Nieuwe nieuwsbrief" triggerLabel="Nieuwsbrief maken" width="wide"><NewsletterCampaignForm groups={hub.groups} programs={hub.programs} stages={hub.stages} /></AdminActionDrawer>}
        kicker="Communicatiehub"
        title="Nieuwsbrieven"
        subtitle="TipTap-campagnes met segmenten, toestemming, planning en uitlegbare delivery-evidence."
      />
      <RouteFeedback error={param(params, "error")} success={param(params, "success")} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard detail="alle statussen" icon={Newspaper} label="Campagnes" tone="info" value={hub.campaigns.length} />
        <AdminMetricCard detail="met bevestiging" icon={CalendarClock} label="Ingepland" tone="warning" value={scheduled} />
        <AdminMetricCard detail="ontvangers" icon={MailCheck} label="Verzonden" tone="success" value={sent} />
        <AdminMetricCard detail="consent/unsubscribe" icon={MailWarning} label="Overgeslagen" tone={skipped ? "warning" : "neutral"} value={skipped} />
      </div>
      <NewsletterCampaignsTable data={hub.campaigns} />
      <section className="space-y-3">
        <div><h2 className="text-base font-bold text-foreground">Delivery logs</h2><p className="mt-1 text-sm text-muted-foreground">Kanaalneutrale auditinformatie; externe levering blijft standaard uit.</p></div>
        <DeliveryTable data={hub.deliveries} />
      </section>
    </div>
  );
}

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
