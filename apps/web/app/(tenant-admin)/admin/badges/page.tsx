import { Award, CheckCircle2, Clock3, Sparkles } from "lucide-react";

import { BadgeSectionNav } from "@/components/badges/badge-section-nav";
import { BadgeVisual } from "@/components/badges/badge-visual";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Button } from "@/components/ui/button";
import { getTenantBadgeData } from "@/lib/domain/badge-system";
import { reviewBadgeAwardAction, saveTenantBadgeOverrideAction } from "@/lib/domain/badge-system-actions";

export const dynamic = "force-dynamic";

export default async function AdminBadgesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, params] = await Promise.all([getTenantBadgeData(), searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)]);
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const overrideByDefinition = new Map(data.overrides.map((override) => [override.catalog_definition_id, override]));
  const pending = data.awards.filter((award) => award.status === "pending");
  const earned = data.awards.filter((award) => award.status === "awarded");
  const success = readParam(params.success);
  const error = readParam(params.error);

  return <div className="space-y-6">
    <PageHeader kicker="Lesproces" title="Badges & complimenten" subtitle="Activeer de canon, beoordeel instructeurvoorstellen en maak teksten herkenbaar voor jouw zwemschool." />
    <BadgeSectionNav active="/admin/badges" scope="admin" />
    <Feedback error={error} success={success} />
    <div className="grid gap-4 md:grid-cols-3">
      <Metric icon={<Award className="size-5" />} label="Behaald" value={earned.length} detail="auditvast, nooit hard verwijderd" />
      <Metric icon={<Clock3 className="size-5" />} label="Wacht op review" value={pending.length} detail="altijd menselijke controle" />
      <Metric icon={<Sparkles className="size-5" />} label="Actieve badges" value={data.definitions.filter((badge) => overrideByDefinition.get(badge.id)?.enabled !== false).length} detail={`${data.customBadges.filter((badge) => badge.status === "active").length} eigen badges`} />
    </div>

    {pending.length ? <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5 shadow-soft">
      <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-800"><Clock3 className="size-5" /></span><div><h2 className="text-lg font-bold">Menselijke goedkeuring nodig</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Controleer boodschap en context. Goedkeuren maakt de badge zichtbaar en activeert de toegestane communicatie.</p></div></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {pending.map((award) => <article className="rounded-2xl border border-amber-200 bg-white p-4" key={award.id}><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{award.title}</p><p className="text-sm text-muted-foreground">{participantById.get(award.participant_id)?.display_name ?? "Leerling"} · {award.note}</p></div><StatusPill tone="warning">Review</StatusPill></div><form action={reviewBadgeAwardAction} className="mt-4 flex flex-wrap gap-2"><input name="awardId" type="hidden" value={award.id} /><input name="humanConfirmation" type="hidden" value="confirmed" /><input name="next" type="hidden" value="/admin/badges" /><Button name="decision" type="submit" value="approved"><CheckCircle2 className="size-4" /> Goedkeuren</Button><Button name="decision" type="submit" value="rejected" variant="outline">Afwijzen</Button></form></article>)}
      </div>
    </section> : null}

    <section>
      <div className="mb-4"><h2 className="text-xl font-bold">Canon voor {data.tenant.name}</h2><p className="mt-1 text-sm text-muted-foreground">Open een badge om tenantcopy en kanalen te beheren. De key en trigger blijven platformvast.</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.definitions.map((badge) => {
          const override = overrideByDefinition.get(badge.id);
          return <details key={badge.id}><summary className="list-none cursor-pointer"><BadgeVisual category={badge.category} description={override?.description_default ?? badge.description_default} name={override?.name_default ?? badge.name_default} surprise={badge.is_surprise} /></summary><form action={saveTenantBadgeOverrideAction} className="mt-2 grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-card"><input name="catalogDefinitionId" type="hidden" value={badge.id} /><input name="next" type="hidden" value="/admin/badges" /><p className="rounded-xl bg-muted/40 px-3 py-2 text-xs"><strong>Trigger:</strong> {badge.trigger_type ?? "Handmatig"} · <code>{badge.badge_key}</code></p><Check defaultChecked={override?.enabled !== false} label="Actief voor deze tenant" name="enabled" /><TextField defaultValue={override?.name_default ?? ""} label={`Eigen naam (standaard: ${badge.name_default})`} name="nameDefault" /><TextField defaultValue={override?.name_boy ?? ""} label="Naam jongen (optioneel)" name="nameBoy" /><TextField defaultValue={override?.name_girl ?? ""} label="Naam meisje (optioneel)" name="nameGirl" /><TextArea defaultValue={override?.description_default ?? ""} label="Eigen beschrijving" name="descriptionDefault" /><TextArea defaultValue={override?.share_text_default ?? ""} label="Eigen deeltekst" name="shareTextDefault" /><TriState checked={override?.notifications_enabled} label="In-app notificatie" name="notificationsEnabled" /><TriState checked={override?.emails_enabled} label="E-mail" name="emailsEnabled" /><TriState checked={override?.share_enabled} label="Delen" name="shareEnabled" /><Button type="submit">Tenantvariant opslaan</Button></form></details>;
        })}
      </div>
    </section>
  </div>;
}

function Metric({ detail, icon, label, value }: { detail: string; icon: React.ReactNode; label: string; value: number }) { return <article className="rounded-3xl border border-border bg-card p-5 shadow-soft"><span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><p className="mt-4 text-3xl font-bold">{value}</p><p className="font-semibold">{label}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></article>; }
function Check({ defaultChecked, label, name }: { defaultChecked: boolean; label: string; name: string }) { return <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 text-sm font-semibold"><input className="size-4 accent-primary" defaultChecked={defaultChecked} name={name} type="checkbox" />{label}</label>; }
function TextField({ defaultValue, label, name }: { defaultValue: string; label: string; name: string }) { return <label className="grid gap-1 text-xs font-bold">{label}<input className="h-10 rounded-xl border border-border px-3 text-sm font-normal" defaultValue={defaultValue} name={name} /></label>; }
function TextArea({ defaultValue, label, name }: { defaultValue: string; label: string; name: string }) { return <label className="grid gap-1 text-xs font-bold">{label}<textarea className="min-h-20 rounded-xl border border-border p-3 text-sm font-normal" defaultValue={defaultValue} name={name} /></label>; }
function TriState({ checked, label, name }: { checked: boolean | null | undefined; label: string; name: string }) { const mode = checked === null || checked === undefined ? "inherit" : "override"; return <fieldset className="grid grid-cols-[1fr_auto] items-end gap-2"><label className="grid gap-1 text-xs font-bold">{label}<select className="h-10 rounded-xl border border-border px-2 text-sm font-normal" defaultValue={mode} name={`${name}Mode`}><option value="inherit">Platform/badge volgen</option><option value="override">Tenant bepaalt</option></select></label><input aria-label={`${label} actief`} className="mb-3 size-4 accent-primary" defaultChecked={checked ?? true} name={name} type="checkbox" /></fieldset>; }
function Feedback({ error, success }: { error?: string; success?: string }) { if (!error && !success) return null; return <p className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error ?? success}</p>; }
function readParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
