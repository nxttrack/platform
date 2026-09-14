import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PortalJourneyView } from "@/lib/domain/portal-journey-view";
import { legacyJourneyVisual, type ResolvedJourneyVisual } from "./legacy-journey-presentation";
import { defaultPortalTheme } from "./portal-theme-registry";
import type { PortalThemeManifestV3 } from "./portal-theme-contract";
import { getPublishedThemeRelease } from "./theme-release-repository";
import { parseJourneyPresentation } from "./portal-journey-presentation";
import { matchesThemeDocument } from "./theme-document-equality";
import type { CanonicalJourneyChapterSnapshot } from "@/lib/domain/swim-progress";

/** Called after participant access is established. No stage-name or ordinal inference. */
export async function resolvePortalJourneyVisual(tenantId: string, model: Pick<PortalJourneyView, "programId" | "curriculumVersionId" | "stageId"> | null, nativeTheme: PortalThemeManifestV3): Promise<ResolvedJourneyVisual> {
  if (model?.stageId) {
    const result = await createAdminClient().from("portal_theme_world_binding")
      .select("theme_key, theme_release, world_id, criterion_artwork_json")
      .eq("tenant_id", tenantId).eq("program_id", model.programId).eq("curriculum_version_id", model.curriculumVersionId)
      .eq("curriculum_stage_id", model.stageId).is("deactivated_at", null).maybeSingle();
    if (result.error) throw new Error("Journey world binding could not be loaded");
    if (result.data) {
      const row = result.data, stored = await getPublishedThemeRelease(row.theme_key, row.theme_release);
      if (!stored?.presentation || !Object.hasOwn(stored.presentation.worlds, row.world_id)) throw new Error("Published Journey world is unavailable");
      const presentation = parseJourneyPresentation({ ...stored.presentation,
        pearlArtwork: { ...stored.presentation.pearlArtwork, byCriterionIdentity: row.criterion_artwork_json }
      });
      return { presentation, worldId: row.world_id, source: "published" };
    }
  }
  // A newly published multi-world release never guesses which curriculum stage means 'badje-01'.
  // Existing native illustration remains until a manager explicitly binds this stage.
  return legacyJourneyVisual(nativeTheme.assets["progress.journey.desktop"] ? nativeTheme : defaultPortalTheme);
}

/** The caller has authorized the chapter's participant. Never substitute today's assignment. */
export async function resolveHistoricalJourneyVisual(snapshot: CanonicalJourneyChapterSnapshot): Promise<ResolvedJourneyVisual | null> {
  const release = await getPublishedThemeRelease(snapshot.theme_key, snapshot.theme_release);
  if (!release) return null;
  if (!snapshot.presentation_snapshot_json) {
    if (release.manifest.assets["progress.journey.desktop"]?.path !== snapshot.artwork_id) return null;
    return legacyJourneyVisual(release.manifest);
  }
  try {
    const saved = snapshot.presentation_snapshot_json as { worldId?: unknown; presentation?: unknown; criterionArtwork?: unknown };
    if (!release.presentation || typeof saved.worldId !== "string" || !Object.hasOwn(release.presentation.worlds, saved.worldId)
      || !matchesThemeDocument(JSON.stringify(saved.presentation), release.presentation)) return null;
    const presentation = parseJourneyPresentation({ ...release.presentation, pearlArtwork: { ...release.presentation.pearlArtwork, byCriterionIdentity: saved.criterionArtwork } });
    const back = presentation.worlds[saved.worldId].landscape.layers.back;
    if (!back || `/portal-themes/${presentation.assets[back].objectKey}` !== snapshot.artwork_id) return null;
    return { presentation, worldId: saved.worldId, source: "published" };
  } catch { return null; } // Incomplete historical data is an explicit empty state, never current artwork.
}
