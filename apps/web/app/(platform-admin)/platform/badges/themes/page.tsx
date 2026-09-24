import { Plus } from "lucide-react";
import Link from "next/link";

import { BadgeSectionNav } from "@/components/badges/badge-section-nav";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { getPlatformBadgeData } from "@/lib/domain/badge-system";
import { archiveBadgeThemeAction, saveBadgeThemeAction } from "@/lib/domain/badge-system-actions";

export const dynamic = "force-dynamic";

type Theme = Awaited<ReturnType<typeof getPlatformBadgeData>>["themes"][number];

export default async function PlatformBadgeThemesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, params] = await Promise.all([getPlatformBadgeData(), searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)]);
  const showNew = readParam(params.new) === "1";
  const editId = readParam(params.edit);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Badge Studio" title="Badge-thema’s" subtitle="Maak en beheer visuele families. Een thema verandert de uitstraling, nooit de trigger of betekenis." />
      <BadgeSectionNav active="/platform/badges/themes" scope="platform" />
      <Feedback error={readParam(params.error)} success={readParam(params.success)} />
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Thema’s</h2><p className="mt-1 text-sm text-muted-foreground">Beheer paletten en kies één platformstandaard.</p></div>{data.canManage ? <Link className={buttonVariants()} href="/platform/badges/themes?new=1#theme-editor"><Plus className="size-4" /> Nieuw thema</Link> : null}</div>

      {showNew && data.canManage ? <section className="rounded-3xl border-2 border-primary/30 bg-card p-5 shadow-card" id="theme-editor"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Nieuwe stijl</p><h2 className="mt-1 text-xl font-bold">Thema aanmaken</h2></div><Link className={buttonVariants({ variant: "ghost", size: "sm" })} href="/platform/badges/themes">Sluiten</Link></div><ThemeForm canManage theme={null} /></section> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {data.themes.map((theme) => {
          const palette = readPalette(theme.palette_json);
          return (
            <details className="overflow-hidden rounded-3xl border border-border bg-card shadow-card" key={theme.id} open={editId === theme.id}>
              <summary className="cursor-pointer list-none">
                <div className="h-32 p-5" style={{ background: `linear-gradient(135deg, ${palette.primary}, ${palette.secondary})` }}><div className="grid size-20 place-items-center rounded-full border-4 border-white/80 bg-white/20 text-4xl text-white shadow-glow">★</div></div>
                <div className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{theme.name}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{theme.description}</p></div><div className="flex flex-col items-end gap-2">{theme.is_default ? <StatusPill tone="info">Default</StatusPill> : null}<StatusPill tone={theme.status === "active" ? "success" : theme.status === "draft" ? "warning" : "neutral"}>{theme.status}</StatusPill></div></div><div className="mt-4 flex gap-2">{Object.entries(palette).map(([key, color]) => <span aria-label={`${key}: ${color}`} className="size-9 rounded-full border-2 border-white shadow-soft" key={key} style={{ backgroundColor: color }} />)}</div></div>
              </summary>
              <div className="border-t border-border p-5"><ThemeForm canManage={data.canManage} theme={theme} /></div>
            </details>
          );
        })}
      </div>
      {!data.themes.length ? <p className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nog geen thema’s.</p> : null}
    </div>
  );
}

function ThemeForm({ canManage, theme }: { canManage: boolean; theme: Theme | null }) {
  const palette = readPalette(theme?.palette_json);
  return (
    <form action={saveBadgeThemeAction} className="grid gap-3 md:grid-cols-2">
      <input name="next" type="hidden" value={theme ? `/platform/badges/themes?edit=${theme.id}` : "/platform/badges/themes"} />
      {theme ? <input name="id" type="hidden" value={theme.id} /> : <Field disabled={!canManage} label="Stabiele key" name="themeKey" placeholder="oceaan_frisse_stijl" required />}
      {theme ? <ReadOnly label="Stabiele key" value={theme.theme_key} /> : null}
      <Select defaultValue={theme?.status ?? "draft"} disabled={!canManage} label="Status" name="status"><option value="draft">Concept</option><option value="active">Actief</option><option value="archived">Gearchiveerd</option></Select>
      <Field defaultValue={theme?.name ?? ""} disabled={!canManage} label="Naam" name="name" required />
      <label className="grid gap-1.5 text-sm font-semibold md:col-span-2">Beschrijving<textarea className="min-h-24 rounded-xl border border-border bg-background p-3 font-normal" defaultValue={theme?.description ?? ""} disabled={!canManage} name="description" /></label>
      <ColorField defaultValue={palette.primary} disabled={!canManage} label="Primair" name="primary" />
      <ColorField defaultValue={palette.secondary} disabled={!canManage} label="Secundair" name="secondary" />
      <ColorField defaultValue={palette.accent} disabled={!canManage} label="Accent" name="accent" />
      <ColorField defaultValue={palette.surface} disabled={!canManage} label="Achtergrond" name="surface" />
      <ColorField defaultValue={palette.ink} disabled={!canManage} label="Tekst" name="ink" />
      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 text-sm font-semibold"><input className="size-4 accent-primary" defaultChecked={theme?.is_default ?? false} disabled={!canManage} name="isDefault" type="checkbox" /> Platformstandaard</label>
      {canManage ? <div className="flex flex-wrap gap-2 md:col-span-2"><Button type="submit">{theme ? "Thema opslaan" : "Thema aanmaken"}</Button>{theme && theme.status !== "archived" && !theme.is_default ? <Button formAction={archiveBadgeThemeAction} formNoValidate type="submit" variant="outline">Archiveren</Button> : null}</div> : null}
    </form>
  );
}

function readPalette(value: unknown) {
  const palette = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    primary: validColor(palette.primary, "#0877d1"),
    secondary: validColor(palette.secondary, "#12b8a6"),
    accent: validColor(palette.accent, "#f59e0b"),
    surface: validColor(palette.surface, "#ffffff"),
    ink: validColor(palette.ink, "#10243e")
  };
}

function validColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function Field({ defaultValue, disabled, label, name, placeholder, required }: { defaultValue?: string; disabled?: boolean; label: string; name: string; placeholder?: string; required?: boolean }) {
  return <label className="grid gap-1.5 text-sm font-semibold">{label}<input className="h-11 rounded-xl border border-border bg-background px-3 font-normal" defaultValue={defaultValue} disabled={disabled} name={name} placeholder={placeholder} required={required} /></label>;
}

function ColorField({ defaultValue, disabled, label, name }: { defaultValue: string; disabled?: boolean; label: string; name: string }) {
  return <label className="grid gap-1.5 text-sm font-semibold">{label}<span className="flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-2"><input className="size-8 rounded border-0 bg-transparent p-0" defaultValue={defaultValue} disabled={disabled} name={name} type="color" /><code className="text-xs text-muted-foreground">{defaultValue}</code></span></label>;
}

function Select({ children, defaultValue, disabled, label, name }: { children: React.ReactNode; defaultValue: string; disabled?: boolean; label: string; name: string }) {
  return <label className="grid gap-1.5 text-sm font-semibold">{label}<select className="h-11 rounded-xl border border-border bg-background px-3 font-normal" defaultValue={defaultValue} disabled={disabled} name={name}>{children}</select></label>;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/40 px-3 py-2"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><code className="mt-1 block text-xs text-foreground">{value}</code></div>;
}

function Feedback({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return <p className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error ?? success}</p>;
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
