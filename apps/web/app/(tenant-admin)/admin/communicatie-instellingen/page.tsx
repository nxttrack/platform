import { Mail, MessageSquareLock, RadioTower, ShieldCheck } from "lucide-react";

import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { AdminSection } from "@/components/admin/domain-ui";
import { CommunicationSettingsForm } from "@/components/communication/communication-forms";
import { PageHeader } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { getAdminCommunicationHub } from "@/lib/domain/communication-hub";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
export const dynamic = "force-dynamic";

export default async function CommunicationSettingsPage({ searchParams }: PageProps) {
  const [hub, params] = await Promise.all([getAdminCommunicationHub(), searchParams ?? Promise.resolve({})]);
  const emailEnabled = process.env.EMAIL_SENDING_ENABLED === "true";

  return (
    <div className="space-y-5">
      <PageHeader kicker="Communicatiehub" title="Instellingen" subtitle="Beheer de veilige grenzen voor instructeurs en externe communicatie binnen deze organisatie." />
      <RouteFeedback error={param(params, "error")} success={param(params, "success")} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard detail="persoonlijk en tenant-aware" icon={MessageSquareLock} label="In-app" tone="success" value="Actief" />
        <AdminMetricCard detail="runtime release gate" icon={Mail} label="E-mail" tone={emailEnabled ? "success" : "warning"} value={emailEnabled ? "Aan" : "Uit"} />
        <AdminMetricCard detail="geen provider/consent" icon={RadioTower} label="WhatsApp/SMS" tone="neutral" value="Uit" />
        <AdminMetricCard detail="standaard assigned-only" icon={ShieldCheck} label="Instructeurs" tone="info" value={hub.settings.instructors_can_reply_to_parents ? "Reply aan" : "Reply uit"} />
      </div>
      <AdminSection title="Toegang en kanalen" description="Wijzigingen gelden alleen voor deze tenant. Ouderinterne notities blijven altijd door RLS afgeschermd.">
        <CommunicationSettingsForm settings={hub.settings} />
      </AdminSection>
    </div>
  );
}

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
