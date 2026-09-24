"use client";

import type { PortalThemeManifestV3 } from "@/lib/theme/portal-theme-contract";

const field = "w-full rounded-lg border bg-background p-2 text-sm";
const names: Record<string, string> = { canvas: "Pagina", surface: "Kaart", surfaceAlt: "Tweede oppervlak", text: "Tekst", textMuted: "Ondersteunende tekst", primary: "Primaire kleur", primaryStrong: "Sterke primaire kleur", secondary: "Secundaire kleur", reward: "Beloning", rail: "Navigatie", info: "Informatie", success: "Geslaagd", warning: "Aandacht", danger: "Foutmelding" };

export function ThemeTokenEditor({ manifest, disabled, onChange }: { manifest: PortalThemeManifestV3; disabled: boolean; onChange: (value: PortalThemeManifestV3) => void }) {
  function colorInput(label: string, value: string, update: (next: string) => void, fixed = false) {
    return <label className="space-y-1" key={label}><span>{label}</span><span className="flex gap-2">{/^#[a-f\d]{6}$/i.test(value) ? <input type="color" aria-label={`${label} kiezen`} disabled={fixed} value={value} onChange={(event) => update(event.target.value)} className="h-10 w-12 shrink-0 rounded border" /> : null}<input className={field} aria-label={label} disabled={fixed} value={value} maxLength={80} onChange={(event) => update(event.target.value)} /></span></label>;
  }
  return <fieldset disabled={disabled} className="space-y-4 rounded-xl border p-4"><legend className="px-2 font-bold">Kleuren en opmaak</legend><p className="text-sm">Controleer tekstcontrast en beide schermoriëntaties in de portaalpreview voordat je deze versie beoordeelt.</p>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(manifest.tokens.color).map(([key, value]) => colorInput(names[key] ?? key, value, (next) => onChange({ ...manifest, tokens: { ...manifest.tokens, color: { ...manifest.tokens.color, [key]: next } } }), manifest.theme.key === "nxttrack-default" && ["primary", "secondary", "reward", "danger", "text"].includes(key)))}</div>
    {(["page", "sidebar"] as const).map((group) => <div className="grid gap-3 sm:grid-cols-3" key={group}>{manifest.tokens.gradient[group].map((value, index) => colorInput(`${group === "page" ? "Pagina" : "Zijbalk"} verloop ${index + 1}`, value, (next) => { const values = [...manifest.tokens.gradient[group]] as [string, string, string]; values[index] = next; onChange({ ...manifest, tokens: { ...manifest.tokens, gradient: { ...manifest.tokens.gradient, [group]: values } } }); }))}</div>)}
    <div className="grid gap-3 sm:grid-cols-2">{(["card", "hero"] as const).map((key) => <label key={key}>{key === "card" ? "Afronding kaarten" : "Afronding hoofdvlak"}<input className={field} value={manifest.tokens.radius[key]} maxLength={12} onChange={(event) => onChange({ ...manifest, tokens: { ...manifest.tokens, radius: { ...manifest.tokens.radius, [key]: event.target.value } } })} /></label>)}</div>
    <p className="text-sm">Het bestaande portaallettertype blijft behouden. De voorkeur voor minder beweging van de gebruiker blijft voorrang houden.</p>
  </fieldset>;
}
