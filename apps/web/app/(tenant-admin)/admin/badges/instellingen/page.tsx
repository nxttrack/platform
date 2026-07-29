import { BadgeSectionNav } from "@/components/badges/badge-section-nav";
import { PageHeader } from "@/components/shell/ui";
import { Button } from "@/components/ui/button";
import { getTenantBadgeData } from "@/lib/domain/badge-system";
import { saveTenantBadgeSettingsAction } from "@/lib/domain/badge-system-actions";

export const dynamic = "force-dynamic";

export default async function AdminBadgeSettingsPage() {
  const data = await getTenantBadgeData();
  return <div className="space-y-6">
    <PageHeader kicker="Badges" title="Module-instellingen" subtitle="Bepaal hoe badges binnen de zwemschool werken. Veilige communicatielagen en menselijke goedkeuring blijven zichtbaar." />
    <BadgeSectionNav active="/admin/badges/instellingen" scope="admin" />
    <form action={saveTenantBadgeSettingsAction} className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6">
      <input name="next" type="hidden" value="/admin/badges/instellingen" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tenantFlags.map(([name, label, detail, safeDefault]) => <label className="flex min-h-24 cursor-pointer items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4" key={name}><input className="mt-1 size-4 accent-primary" defaultChecked={data.settings?.[name] ?? safeDefault} name={name} type="checkbox" /><span><span className="block text-sm font-bold">{label}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span></span></label>)}
      </div>
      <label className="mt-5 grid max-w-lg gap-1.5 text-sm font-semibold">Actief thema<select className="h-11 rounded-xl border border-border bg-background px-3 font-normal" defaultValue={data.settings?.active_theme_id ?? ""} name="activeThemeId"><option value="">NXTTRACK Default</option>{data.themes.filter((theme) => theme.tenant_id !== null).map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>
      <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6"><strong>Veilig standaardgedrag:</strong> handmatige badges vragen goedkeuring, e-mail staat uit en delen gebruikt alleen de voornaam. Platforminstellingen blijven altijd leidend.</div>
      <Button className="mt-5" type="submit">Instellingen opslaan</Button>
    </form>
  </div>;
}

const tenantFlags = [
  ["badges_enabled", "Badgemodule actief", "Toon en beheer badges binnen deze tenant.", true],
  ["automatic_badges_enabled", "Automatische badges", "Uitlegbare events mogen idempotente badges toekennen.", true],
  ["manual_badges_enabled", "Handmatige complimenten", "Instructeurs kunnen positieve momenten vastleggen.", true],
  ["custom_badges_enabled", "Eigen badges", "Tenantadmins kunnen eigen badges maken.", false],
  ["collections_enabled", "Collecties", "Toon thematische badgepaden.", true],
  ["surprise_badges_enabled", "Verrassingsbadges", "Toon veilig vergrendelde verrassingen.", true],
  ["show_unearned_badges", "Nog te behalen badges", "Laat positieve doelen zien zonder vergelijking.", true],
  ["show_locked_surprise_badges", "Vergrendelde surprises", "Toon alleen dat er een verrassing bestaat.", true],
  ["share_images_enabled", "Deelafbeeldingen", "Ouders kunnen na bevestiging een veilige afbeelding maken.", true],
  ["badge_notifications_enabled", "In-app notificaties", "Gebruik de Communicatiehub voor meldingen.", true],
  ["badge_emails_enabled", "Badge-e-mails", "Alleen met oudervoorkeur en geconfigureerde mailprovider.", false],
  ["instructor_can_award_directly", "Direct toekennen", "Sla adminreview over voor bevoegde instructeurs.", false],
  ["manual_badge_requires_admin_approval", "Adminreview verplicht", "Aanbevolen veilige instelling voor handmatige badges.", true]
] as const;

