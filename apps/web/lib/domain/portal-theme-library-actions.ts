"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createThemeDraftFromImport, getManagedThemeRelease, publishThemeRelease, reviewThemeRelease, saveThemeDraft, saveGuidedThemeMapping } from "@/lib/theme/theme-release-repository";
import { readThemeJson } from "@/lib/theme/theme-package-archive";
import { validateThemeReleaseDocument } from "@/lib/theme/theme-release-validation";

export type ThemeLibraryActionState = { error?: string; saved?: string };

async function manager() {
  const context = await requirePrivateShellContext("/platform/themes");
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) throw new Error("Platformbeheer vereist");
  if (process.env.MAINTENANCE_NO_WRITE === "true") throw new Error("Schrijven is tijdelijk uitgeschakeld wegens onderhoud");
  return context.user.id;
}
function text(form: FormData, key: string, limit = 200) {
  const value = form.get(key); if (typeof value !== "string" || !value || value.length > limit) throw new Error("Ongeldige formulierinvoer"); return value;
}
function refresh() {
  revalidatePath("/platform/themes", "layout"); revalidatePath("/portaal", "layout"); revalidatePath("/kind", "layout"); revalidatePath("/admin/branding");
}

export async function createImportedThemeDraftAction(_: ThemeLibraryActionState, form: FormData): Promise<ThemeLibraryActionState> {
  let destination: string;
  try {
    const actor = await manager(), result = await createThemeDraftFromImport(actor, text(form, "importId", 36));
    destination = `/platform/themes/${result.key}/${result.release}`; refresh();
  } catch (error) { return { error: error instanceof Error ? error.message : "Concept opslaan mislukt" }; }
  redirect(destination);
}

export async function saveGuidedThemeMappingAction(_: ThemeLibraryActionState, form: FormData): Promise<ThemeLibraryActionState> {
  let id: string;
  try {
    const actor = await manager(); id = text(form, "importId", 36);
    await saveGuidedThemeMapping(actor, id, readThemeJson(Buffer.from(text(form, "mapping", 200_000)), "guided mapping"));
    refresh();
  } catch (error) { return { error: error instanceof Error ? error.message : "Beeldkoppeling kon niet worden opgeslagen" }; }
  redirect(`/platform/themes/import?import=${id}`);
}

export async function updateThemeLibraryAction(_: ThemeLibraryActionState, form: FormData): Promise<ThemeLibraryActionState> {
  try {
    const actor = await manager(), key = text(form, "themeKey"), release = text(form, "release"), operation = text(form, "operation");
    const record = await getManagedThemeRelease(key, release);
    if (!record) throw new Error("Concept niet gevonden");
    if (String(record.revision) !== text(form, "revision", 20) || record.digest !== text(form, "digest", 64)) throw new Error("Deze versie is inmiddels gewijzigd. Bewaar je invoer en laad de actuele versie voordat je verdergaat.");
    if (operation === "save") {
      const document = validateThemeReleaseDocument(readThemeJson(Buffer.from(text(form, "manifest", 900_000)), "native manifest"), readThemeJson(Buffer.from(text(form, "presentation", 900_000)), "presentation"));
      if (document.manifest.theme.key !== key || document.manifest.theme.release !== release) throw new Error("Identiteit van een bestaande versie kan niet worden gewijzigd");
      await saveThemeDraft(actor, document, record.revision, record.provenance, record.findings);
    } else if (operation === "review") {
      await reviewThemeRelease(actor, record, Object.fromEntries(["desktop", "mobile", "content", "warnings"].map((section) => [section, form.get(section) === "on"])));
    } else if (operation === "publish") {
      if (form.get("confirm") !== "on") throw new Error("Bevestig dat deze versie gepubliceerd mag worden");
      await publishThemeRelease(actor, record);
    } else throw new Error("Onbekende beheerhandeling");
    refresh(); return { saved: operation };
  } catch (error) { return { error: error instanceof Error ? error.message : "Handeling kon niet worden afgerond" }; }
}
