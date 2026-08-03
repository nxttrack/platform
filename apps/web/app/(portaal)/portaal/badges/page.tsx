import { Award, Bell, Eye, Images, LockKeyhole, Mail, Sparkles } from "lucide-react";

import { BadgeVisual } from "@/components/badges/badge-visual";
import { MultiBadgeCelebration, type MultiBadgeCelebrationItem } from "@/components/badges/multi-badge-celebration";
import { ParentBadgeShareActions } from "@/components/badges/parent-badge-share-actions";
import { ParentSectionNav } from "@/components/parent/parent-section-nav";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Button } from "@/components/ui/button";
import { resolveGenderedCopy, normalizeBadgeGender } from "@/lib/domain/badge-system-contract";
import { generateBadgeShareAssetAction, saveParentBadgePreferencesAction } from "@/lib/domain/badge-system-actions";
import { safeBadgeShareFileName } from "@/lib/domain/badge-share-capabilities";
import { getParentBadgeWallData } from "@/lib/domain/badge-system";
import { getSelectedParticipantId, participantContextHref, type ParentPortalSearchParams } from "@/lib/domain/parent-portal-selection";
import { portalBadgeArtworkUrl } from "@/lib/theme/portal-badge-family";
import { resolveTenantPortalTheme } from "@/lib/theme/portal-theme-server";

export const dynamic = "force-dynamic";

export default async function ParentBadgesPage({ searchParams }: { searchParams?: Promise<ParentPortalSearchParams> }) {
  const [data, params] = await Promise.all([getParentBadgeWallData(), searchParams ?? Promise.resolve({} as ParentPortalSearchParams)]);
  const resolvedTheme = await resolveTenantPortalTheme(data.tenant.id);
  const theme = resolvedTheme.manifest;
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
      const nextPath = participantContextHref("/portaal/ontwikkeling/badges", selectedParticipantId);
      const multiBadgeBatches = [...participantAwards.reduce((batches, award) => {
        if (!award.award_batch_id) return batches;
        const batch = batches.get(award.award_batch_id) ?? [];
        batch.push(award);
        batches.set(award.award_batch_id, batch);
        return batches;
      }, new Map<string, typeof participantAwards>()).values()].filter((batch) => batch.length > 1);
      const eligibleUnearned = showUnearned ? data.catalog.filter((definition) => {
        const override = overrideByDefinition.get(definition.id);
        if (definition.is_surprise || override?.enabled === false) return false;
        if (awardByDefinition.has(`${participant.id}:${definition.id}`)) return false;
        if (definition.audience === "boys" && gender !== "boy") return false;
        if (definition.audience === "girls" && gender !== "girl") return false;
        return true;
      }) : [];
      const categories = [...new Set([
        ...participantAwards.map((award) => {
          const definition = award.catalog_definition_id ? definitionById.get(award.catalog_definition_id) : null;
          const custom = award.custom_badge_id ? customById.get(award.custom_badge_id) : null;
          return definition?.category ?? custom?.category ?? "specials";
        }),
        ...eligibleUnearned.map((definition) => definition.category)
      ])].sort((left, right) => badgeCategoryRank(left) - badgeCategoryRank(right));

      return <section className="space-y-4" key={participant.id}>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Zwemreis</p><h2 className="mt-1 text-2xl font-bold">{participant.display_name}</h2><p className="mt-1 text-sm text-muted-foreground">{participantAwards.length} mooie momenten vastgelegd</p></div><StatusPill tone="success">{participantAwards.length} behaald</StatusPill></div>
        {multiBadgeBatches.map((batch) =>
          <MultiBadgeCelebration
            items={batch.map((award: (typeof participantAwards)[number]): MultiBadgeCelebrationItem => {
              const definition = award.catalog_definition_id ? definitionById.get(award.catalog_definition_id) : null;
              const custom = award.custom_badge_id ? customById.get(award.custom_badge_id) : null;
              const asset = assetByAward.get(`${award.id}:square`);
              const artworkAssetId = award.resolved_artwork_asset_id ?? definition?.artwork_asset_id ?? custom?.artwork_asset_id;
              const badgeName = award.resolved_name ?? award.title;
              return {
                awardId: award.id,
                badgeName,
                description: award.note || award.resolved_description,
                imageUrl: portalBadgeArtworkUrl(theme, definition?.badge_key, badgeName) ?? badgeArtworkUrl(artworkAssetId),
                shareAsset: asset?.status === "generated" && asset.preview_data_url
                  ? {
                      caption: asset.caption ?? award.resolved_share_text ?? badgeName,
                      id: asset.id,
                      previewDataUrl: asset.preview_data_url
                    }
                  : null
              };
            })}
            key={batch[0]?.award_batch_id}
            nextPath={nextPath}
          />
        )}
        <div className="space-y-5">
          {categories.map((category) => <section className="rounded-3xl border border-border bg-card/70 p-4 shadow-soft sm:p-5" key={category}>
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Categorie</p>
              <h3 className="mt-1 text-lg font-bold">{badgeCategoryLabel(category)}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {participantAwards.filter((award) => {
                const definition = award.catalog_definition_id ? definitionById.get(award.catalog_definition_id) : null;
                const custom = award.custom_badge_id ? customById.get(award.custom_badge_id) : null;
                return (definition?.category ?? custom?.category ?? "specials") === category;
              }).map((award) => {
                const definition = award.catalog_definition_id ? definitionById.get(award.catalog_definition_id) : null;
                const custom = award.custom_badge_id ? customById.get(award.custom_badge_id) : null;
                const squareAsset = assetByAward.get(`${award.id}:square`);
                const storyAsset = assetByAward.get(`${award.id}:story`);
                const artworkAssetId = award.resolved_artwork_asset_id ?? definition?.artwork_asset_id ?? custom?.artwork_asset_id;
                const override = definition ? overrideByDefinition.get(definition.id) : null;
                const canShare = definition?.share_enabled !== false && override?.share_enabled !== false;
                const badgeName = award.resolved_name ?? award.title;
                return <details className="group min-w-0" key={award.id}><summary className="cursor-pointer list-none"><BadgeVisual artworkUrl={badgeArtworkUrl(artworkAssetId)} category={definition?.category ?? custom?.category} description={award.resolved_description ?? award.note} earned iconName={definition?.icon_name ?? custom?.icon_name} name={badgeName} surprise={definition?.is_surprise ?? custom?.is_surprise} themeArtworkUrl={portalBadgeArtworkUrl(theme, definition?.badge_key, badgeName)} themeFamilyKey={theme.badges.familyKey} /></summary><div className="mt-2 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-card"><div className="flex flex-wrap gap-2"><StatusPill tone="success">Behaald op {formatDate(award.awarded_at)}</StatusPill>{award.delivery_status === "sent" ? <StatusPill tone="info"><Bell className="size-3" /> gemeld</StatusPill> : null}</div><p className="text-sm leading-6 text-muted-foreground">{award.note || award.resolved_description}</p>{canShare && data.settings?.share_images_enabled !== false && data.preferences?.badge_sharing_enabled !== false ? <div className="space-y-4"><ShareAssetCard asset={squareAsset} awardId={award.id} badgeName={badgeName} fallbackCaption={award.resolved_share_text ?? award.title} format="square" nextPath={nextPath} /><ShareAssetCard asset={storyAsset} awardId={award.id} badgeName={badgeName} fallbackCaption={award.resolved_share_text ?? award.title} format="story" nextPath={nextPath} /></div> : null}</div></details>;
              })}
              {eligibleUnearned.filter((definition) => definition.category === category).map((definition) => {
                const override = overrideByDefinition.get(definition.id);
                const badgeName = resolveGenderedCopy({ default: override?.name_default ?? definition.name_default, boy: override?.name_boy ?? definition.name_boy, girl: override?.name_girl ?? definition.name_girl }, gender);
                return <BadgeVisual artworkUrl={badgeArtworkUrl(definition.artwork_asset_id)} category={definition.category} description={override?.description_default ?? definition.description_default} iconName={definition.icon_name} key={definition.id} name={badgeName} themeArtworkUrl={portalBadgeArtworkUrl(theme, definition.badge_key, badgeName)} themeFamilyKey={theme.badges.familyKey} />;
              })}
            </div>
          </section>)}
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
function ShareAssetCard({
  asset,
  awardId,
  badgeName,
  fallbackCaption,
  format,
  nextPath
}: {
  asset?: {
    caption: string | null;
    id: string;
    preview_data_url: string | null;
    status: string;
  };
  awardId: string;
  badgeName: string;
  fallbackCaption: string;
  format: "square" | "story";
  nextPath: string;
}) {
  const label = format === "square" ? "Vierkante post" : "Story";
  if (asset?.status === "generated" && asset.preview_data_url) {
    return <section className="space-y-3 rounded-2xl border border-border bg-muted/10 p-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{label}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          PNG uit een immutable gepubliceerde template, zonder rooster-, locatie- of geboortedata.
        </p>
      </div>
      <img
        alt={`${label} voor badge ${badgeName}`}
        className={`${format === "square" ? "aspect-square" : "aspect-[9/16] max-h-[32rem]"} w-full rounded-2xl border border-border object-cover`}
        src={asset.preview_data_url}
      />
      <ParentBadgeShareActions
        assetId={asset.id}
        caption={asset.caption ?? fallbackCaption}
        fileName={safeBadgeShareFileName(badgeName, format)}
        imageUrl={asset.preview_data_url}
      />
    </section>;
  }
  return <form action={generateBadgeShareAssetAction} className="rounded-2xl border border-dashed border-border p-3">
    <input name="awardId" type="hidden" value={awardId} />
    <input name="format" type="hidden" value={format} />
    <input name="humanConfirmation" type="hidden" value="confirmed" />
    <input name="next" type="hidden" value={nextPath} />
    <Button type="submit" variant="outline"><Images className="size-4" /> Veilige {label.toLowerCase()} maken</Button>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">
      De gepubliceerde Badge Studio-template gebruikt alleen privacyveilige velden en de gekozen badge.
    </p>
  </form>;
}
function countStartedCollections(items: Array<{ collection_id: string; catalog_definition_id: string | null }>, awards: Array<{ catalog_definition_id: string | null }>) { const earned = new Set(awards.flatMap((award) => award.catalog_definition_id ? [award.catalog_definition_id] : [])); return new Set(items.filter((item) => item.catalog_definition_id && earned.has(item.catalog_definition_id)).map((item) => item.collection_id)).size; }
function formatDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(value)); }
function readParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function badgeArtworkUrl(assetId?: string | null) { return assetId ? `/api/files/badge-studio-asset/${assetId}` : null; }
const badgeCategories = ["start", "attendance", "skills", "stages", "diplomas", "makeup", "compliments", "courage", "technique", "specials"] as const;
function badgeCategoryRank(category: string) { const index = badgeCategories.indexOf(category as (typeof badgeCategories)[number]); return index === -1 ? badgeCategories.length : index; }
function badgeCategoryLabel(category: string) {
  return ({
    attendance: "Aanwezigheid",
    compliments: "Complimenten",
    courage: "Moed",
    diplomas: "Diploma’s",
    makeup: "Inhalen",
    skills: "Vaardigheden",
    specials: "Bijzonder",
    stages: "Badjes",
    start: "Start",
    technique: "Techniek"
  } as Record<string, string>)[category] ?? category;
}
