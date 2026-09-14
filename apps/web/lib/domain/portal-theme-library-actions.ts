"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { copyThemeReleaseToNewDraft, createThemeDraftFromImport, getManagedThemeRelease, publishThemeRelease, reviewThemeRelease, restoreThemeDraftRevision, saveThemeDraft, saveGuidedThemeMapping } from "@/lib/theme/theme-release-repository";
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
  } catch (error) { unstable_rethrow(error); return { error: error instanceof Error ? error.message : "Concept opslaan mislukt" }; }
  redirect(destination);
}

export async function saveGuidedThemeMappingAction(_: ThemeLibraryActionState, form: FormData): Promise<ThemeLibraryActionState> {
  let id: string;
  try {
    const actor = await manager(); id = text(form, "importId", 36);
    await saveGuidedThemeMapping(actor, id, readThemeJson(Buffer.from(text(form, "mapping", 200_000)), "guided mapping"));
    refresh();
  } catch (error) { unstable_rethrow(error); return { error: error instanceof Error ? error.message : "Beeldkoppeling kon niet worden opgeslagen" }; }
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
    } else if (operation === "restore") {
      if (form.get("confirmRestore") !== "on") throw new Error("Bevestig het herstel als nieuwe conceptrevisie");
      await restoreThemeDraftRevision(actor, record, Number(text(form, "restoreRevision", 10)));
    } else throw new Error("Onbekende beheerhandeling");
    refresh(); return { saved: operation };
  } catch (error) { unstable_rethrow(error); return { error: error instanceof Error ? error.message : "Handeling kon niet worden afgerond" }; }
}

export async function copyThemeVersionAction(_: ThemeLibraryActionState, form: FormData): Promise<ThemeLibraryActionState> {
  let destination: string;
  try {
    const actor = await manager(), stored = await getManagedThemeRelease(text(form, "themeKey"), text(form, "release"));
    if (!stored || stored.digest !== text(form, "digest", 64) || String(stored.revision) !== text(form, "revision", 20)) throw new Error("Laad de actuele bronversie voordat je een nieuw concept maakt");
    const result = await copyThemeReleaseToNewDraft(actor, stored, text(form, "newVersion", 40));
    refresh(); destination = `/platform/themes/${result.key}/${result.release}`;
  } catch (error) { unstable_rethrow(error); return { error: error instanceof Error ? error.message : "Nieuwe versie kon niet worden gemaakt" }; }
  redirect(destination);
}
