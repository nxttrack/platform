import { Award, Bell, Eye, Images, LockKeyhole, Mail, Sparkles } from "lucide-react";

import { BadgeVisual } from "@/components/badges/badge-visual";
import { ParentBadgeShareActions } from "@/components/badges/parent-badge-share-actions";
import { ParentSectionNav } from "@/components/parent/parent-section-nav";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Button } from "@/components/ui/button";
import { resolveGenderedCopy, normalizeBadgeGender } from "@/lib/domain/badge-system-contract";
import { generateBadgeShareAssetAction, saveParentBadgePreferencesAction } from "@/lib/domain/badge-system-actions";
import { getParentBadgeWallData } from "@/lib/domain/badge-system";
import { getSelectedParticipantId, participantContextHref, type ParentPortalSearchParams } from "@/lib/domain/parent-portal-selection";

export const dynamic = "force-dynamic";

export default async function ParentBadgesPage({ searchParams }: { searchParams?: Promise<ParentPortalSearchParams> }) {
  const [data, params] = await Promise.all([getParentBadgeWallData(), searchParams ?? Promise.resolve({} as ParentPortalSearchParams)]);
  const selectedParticipantId = getSelectedParticipantId(params, data.participants.map((participant) => participant.id));
  const visibleParticipants = selectedParticipantId ? data.participants.filter((participant) => participant.id === selectedParticipantId) : data.participants;
  const visibleParticipantIds = new Set(visibleParticipants.map((participant) => participant.id));
  const visibleAwards = data.awards.filter((award) => visibleParticipantIds.has(award.participant_id));
  const visibleShareAssets = data.shareAssets.filter((asset) => visibleAwards.some((award) => award.id === asset.award_id));
  const definitionById = new Map(data.catalog.map((definition) => [definition.id, definition]));
  const customById = new Map(data.customBadges.map((badge) => [badge.id, badge]));
  const overrideByDefinition = new Map(data.overrides.map((override) => [override.catalog_definition_id, override]));
  const awardByDefinition = new Map(visibleAwards.flatMap((award) => award.catalog_definition_id ? [[`${award.participant_id}:${award.catalog_definition_id}`, award] as const] : []));
  const assetByAward = new Map(visibleShareAssets.map((asset) => [`${asset.award_id}:${asset.format}`, asset]));
  const showUnearned = data.settings?.show_unearned_badges !== false && data.preferences?.show_unearned_badges !== false;
  const success = readParam(params.success);
  const error = readParam(params.error);

  return <div className="space-y-6">
    <PageHeader kicker="Ontwikkeling" title="Badges" subtitle="Vier behaalde momenten, ontdek collecties en maak veilig een deelafbeelding." />
    <Feedback error={error} success={success} />
    <ParentSectionNav
      items={[
        { href: participantContextHref("/portaal/ontwikkeling", selectedParticipantId), label: "Voortgang" },
        { active: true, href: participantContextHref("/portaal/ontwikkeling/badges", selectedParticipantId), label: "Badges" },
        { href: participantContextHref("/portaal/ontwikkeling/media", selectedParticipantId), label: "Media" },
        { href: participantContextHref("/portaal/ontwikkeling/diplomas", selectedParticipantId), label: "Diploma’s" }
      ]}
      label="Ontwikkeling onderdelen"
    />
    <section className="grid gap-4 md:grid-cols-3">
      <Metric icon={<Award className="size-5" />} label="Behaalde badges" value={visibleAwards.length} />
      <Metric icon={<Sparkles className="size-5" />} label="Collecties gestart" value={countStartedCollections(data.collectionItems, visibleAwards)} />
      <Metric icon={<Images className="size-5" />} label="Deelafbeeldingen" value={visibleShareAssets.length} />
    </section>

    {visibleParticipants.map((participant) => {
      const gender = normalizeBadgeGender(participant.gender);
      const participantAwards = visibleAwards.filter((award) => award.participant_id === participant.id);
      return <section className="space-y-4" key={participant.id}>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Zwemreis</p><h2 className="mt-1 text-2xl font-bold">{participant.display_name}</h2><p className="mt-1 text-sm text-muted-foreground">{participantAwards.length} mooie momenten vastgelegd</p></div><StatusPill tone="success">{participantAwards.length} behaald</StatusPill></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {participantAwards.map((award) => {
            const definition = award.catalog_definition_id ? definitionById.get(award.catalog_definition_id) : null;
            const custom = award.custom_badge_id ? customById.get(award.custom_badge_id) : null;
            const asset = assetByAward.get(`${award.id}:square`);
            const artworkAssetId = award.resolved_artwork_asset_id ?? definition?.artwork_asset_id ?? custom?.artwork_asset_id;
            const override = definition ? overrideByDefinition.get(definition.id) : null;
            const canShare = definition?.share_enabled !== false && override?.share_enabled !== false;
            return <details className="group" key={award.id}><summary className="list-none cursor-pointer"><BadgeVisual artworkUrl={badgeArtworkUrl(artworkAssetId)} category={definition?.category ?? custom?.category} description={award.resolved_description ?? award.note} earned iconName={definition?.icon_name ?? custom?.icon_name} name={award.resolved_name ?? award.title} surprise={definition?.is_surprise ?? custom?.is_surprise} /></summary><div className="mt-2 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-card"><div className="flex flex-wrap gap-2"><StatusPill tone="success">Behaald op {formatDate(award.awarded_at)}</StatusPill>{award.delivery_status === "sent" ? <StatusPill tone="info"><Bell className="size-3" /> gemeld</StatusPill> : null}</div><p className="text-sm leading-6 text-muted-foreground">{award.note || award.resolved_description}</p>{canShare && data.settings?.share_images_enabled !== false && data.preferences?.badge_sharing_enabled !== false ? asset?.status === "generated" && asset.preview_data_url ? <><img alt={`Deelafbeelding voor ${award.title}`} className="aspect-square w-full rounded-2xl border border-border object-cover" src={asset.preview_data_url} /><ParentBadgeShareActions caption={asset.caption ?? award.resolved_share_text ?? award.title} imageUrl={asset.preview_data_url} /></> : <form action={generateBadgeShareAssetAction}><input name="awardId" type="hidden" value={award.id} /><input name="format" type="hidden" value="square" /><input name="humanConfirmation" type="hidden" value="confirmed" /><input name="next" type="hidden" value={participantContextHref("/portaal/ontwikkeling/badges", selectedParticipantId)} /><Button type="submit" variant="outline"><Images className="size-4" /> Veilige deelafbeelding maken</Button><p className="mt-2 text-xs leading-5 text-muted-foreground">De gepubliceerde Badge Studio-template wordt gebruikt met alleen veilige voorbeeldvelden.</p></form> : null}</div></details>;
          })}
          {showUnearned ? data.catalog.filter((definition) => {
            const override = overrideByDefinition.get(definition.id);
            if (override?.enabled === false) return false;
            if (awardByDefinition.has(`${participant.id}:${definition.id}`)) return false;
            if (definition.audience === "boys" && gender !== "boy") return false;
            if (definition.audience === "girls" && gender !== "girl") return false;
            return true;
          }).slice(0, 12).map((definition) => {
            const override = overrideByDefinition.get(definition.id);
            const surprise = definition.is_surprise && data.settings?.show_locked_surprise_badges !== false;
            return <BadgeVisual artworkUrl={badgeArtworkUrl(definition.artwork_asset_id)} category={definition.category} description={override?.description_default ?? definition.description_default} iconName={definition.icon_name} key={definition.id} locked={surprise} name={resolveGenderedCopy({ default: override?.name_default ?? definition.name_default, boy: override?.name_boy ?? definition.name_boy, girl: override?.name_girl ?? definition.name_girl }, gender)} surprise={definition.is_surprise} />;
          }) : null}
        </div>
      </section>;
    })}

    <section className="rounded-3xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Eye className="size-5" /></span><div><h2 className="text-lg font-bold">Mijn badgevoorkeuren</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Jij houdt controle. E-mail staat standaard uit; delen gebruikt altijd alleen de voornaam.</p></div></div>
      <form action={saveParentBadgePreferencesAction} className="mt-5 grid gap-3 sm:grid-cols-2"><input name="next" type="hidden" value={participantContextHref("/portaal/ontwikkeling/badges", selectedParticipantId)} /><Preference checked={data.preferences?.badge_notifications_enabled !== false} icon={<Bell className="size-4" />} label="In-app badgemeldingen" name="badgeNotificationsEnabled" /><Preference checked={data.preferences?.badge_emails_enabled === true} icon={<Mail className="size-4" />} label="Badge-e-mails" name="badgeEmailsEnabled" /><Preference checked={data.preferences?.badge_sharing_enabled !== false} icon={<Images className="size-4" />} label="Deelafbeeldingen" name="badgeSharingEnabled" /><Preference checked={data.preferences?.show_unearned_badges !== false} icon={<LockKeyhole className="size-4" />} label="Nog te behalen badges tonen" name="showUnearnedBadges" /><div className="sm:col-span-2"><Button type="submit">Voorkeuren opslaan</Button></div></form>
    </section>
  </div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <article className="rounded-3xl border border-border bg-card p-5 shadow-soft"><span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><p className="mt-4 text-3xl font-bold">{value}</p><p className="text-sm font-semibold">{label}</p></article>; }
function Preference({ checked, icon, label, name }: { checked: boolean; icon: React.ReactNode; label: string; name: string }) { return <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-border bg-muted/20 px-4 text-sm font-semibold"><input className="size-4 accent-primary" defaultChecked={checked} name={name} type="checkbox" /><span className="text-primary">{icon}</span>{label}</label>; }
function Feedback({ error, success }: { error?: string; success?: string }) { if (!error && !success) return null; return <p className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error ?? success}</p>; }
function countStartedCollections(items: Array<{ collection_id: string; catalog_definition_id: string | null }>, awards: Array<{ catalog_definition_id: string | null }>) { const earned = new Set(awards.flatMap((award) => award.catalog_definition_id ? [award.catalog_definition_id] : [])); return new Set(items.filter((item) => item.catalog_definition_id && earned.has(item.catalog_definition_id)).map((item) => item.collection_id)).size; }
function formatDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(value)); }
function readParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function badgeArtworkUrl(assetId?: string | null) { return assetId ? `/api/files/badge-studio-asset/${assetId}` : null; }
