import { BadgeSectionNav } from "@/components/badges/badge-section-nav";
import { BadgeVisual } from "@/components/badges/badge-visual";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Button } from "@/components/ui/button";
import { getTenantBadgeData } from "@/lib/domain/badge-system";
import { saveCustomBadgeAction } from "@/lib/domain/badge-system-actions";

export const dynamic = "force-dynamic";

export default async function AdminCustomBadgesPage() {
  const data = await getTenantBadgeData();
  const available = data.platformSettings?.tenant_custom_badges_allowed !== false && data.settings?.custom_badges_enabled === true;
  return <div className="space-y-6">
    <PageHeader kicker="Badges" title="Eigen complimentbadges" subtitle="Maak lokale specials met stabiele tenantkeys. Eigen badges zijn altijd handmatig en kennen nooit automatisch nadelige gevolgen toe." />
    <BadgeSectionNav active="/admin/badges/eigen" scope="admin" />
    {!available ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Activeer ‘Eigen badges’ eerst bij Instellingen. De platformbeheerder moet de functie eveneens toestaan.</p> : <form action={saveCustomBadgeAction} className="grid gap-4 rounded-3xl border border-border bg-card p-5 shadow-card md:grid-cols-2"><input name="next" type="hidden" value="/admin/badges/eigen" /><Field label="Stabiele key" name="badgeKey" placeholder="zomer_duiker" required /><Field label="Neutrale naam" name="nameDefault" placeholder="Zomerduiker" required /><Field label="Naam jongen (optioneel)" name="nameBoy" /><Field label="Naam meisje (optioneel)" name="nameGirl" /><Area label="Neutrale beschrijving" name="descriptionDefault" required /><Area label="Deeltekst met {child_first_name}" name="shareTextDefault" /><Select label="Categorie" name="category"><option value="compliments">Compliment</option><option value="courage">Moed</option><option value="technique">Techniek</option><option value="specials">Special</option></Select><Select label="Doelgroep" name="audience"><option value="all">Iedereen</option><option value="boys">Jongens</option><option value="girls">Meisjes</option></Select><Select label="Status" name="status"><option value="draft">Concept</option><option value="active">Actief</option><option value="archived">Gearchiveerd</option></Select><label className="flex items-center gap-3 rounded-xl border border-border px-3 text-sm font-semibold"><input className="size-4 accent-primary" name="isSurprise" type="checkbox" /> Verrassingsbadge</label><div className="md:col-span-2"><Button type="submit">Eigen badge opslaan</Button></div></form>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.customBadges.map((badge) => <div key={badge.id}><BadgeVisual category={badge.category} description={badge.description_default} name={badge.name_default} surprise={badge.is_surprise} /><StatusPill tone={badge.status === "active" ? "success" : badge.status === "draft" ? "warning" : "neutral"}>{badge.status}</StatusPill></div>)}</div>
  </div>;
}

function Field(props: { label: string; name: string; placeholder?: string; required?: boolean }) { return <label className="grid gap-1.5 text-sm font-semibold">{props.label}<input className="h-11 rounded-xl border border-border px-3 font-normal" name={props.name} placeholder={props.placeholder} required={props.required} /></label>; }
function Area(props: { label: string; name: string; required?: boolean }) { return <label className="grid gap-1.5 text-sm font-semibold">{props.label}<textarea className="min-h-24 rounded-xl border border-border p-3 font-normal" name={props.name} required={props.required} /></label>; }
function Select({ children, label, name }: { children: React.ReactNode; label: string; name: string }) { return <label className="grid gap-1.5 text-sm font-semibold">{label}<select className="h-11 rounded-xl border border-border bg-background px-3 font-normal" name={name}>{children}</select></label>; }

