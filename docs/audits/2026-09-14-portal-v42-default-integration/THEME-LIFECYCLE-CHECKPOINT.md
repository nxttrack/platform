# Theme lifecycle implementation checkpoint

Canonical baseline: `afb53f6e4f72ac8fb0cba88ab98e43373fc7ed80` (refetched and unchanged). Work remains IN_PROGRESS on `codex/portal-v42-default-integration`; this is not final V4.2 acceptance or merge approval.

## Implemented and exercised

The existing theme release/asset authority now stores a separate rich presentation, append-only draft revisions, review of an exact content digest, and immutable publication. Native numeric schema 3 stays unchanged. Private storage holds quarantined source packages and content-addressed raster assets. Publication does not assign any tenant or change curriculum data.

The platform library imports the two supplied Package 1.0 references, supported Studio JSON and portable presentation exports. Truly manifestless image archives require explicit world/layer selection and separate portrait/landscape route points. Recognized corrupt packages cannot take this route. The manager can preview an analyzed import before saving a concept. Reload resumes analyzed imports; a lost concept-save response can reopen the already committed concept. Failed mappings and concept edits preserve the form input.

Concept editing includes names, registered layers, draggable/keyboard anchors, preview, review and publication. Advanced presentation/native configuration remains validated server-side. The preview uses the shared scene renderer with fictional DTOs. Only this authenticated preview route allows a same-origin iframe; all other page framing remains denied. Anonymous reads of draft/import assets are denied, including attempts to use their eventual public delivery URL. Export contains presentation and validated images only.

Published releases join the built-in catalog at server boundaries. Parent/child Home resolve worlds by the exact tenant/program/curriculum-version/stage binding. An unbound stage retains a native fallback rather than guessing that a curriculum stage means `badje-01`.

Platform management is explicit opt-in. Existing tenant and child selection RPCs preserve their previous behavior for legacy tenants and reject overrides in platform mode, including the historical already-current-release shortcut. Tenant settings cannot change this authority through authenticated direct updates. Binding changes serialize under the tenant lock, check the expected current binding, validate actual curriculum identity and published world, and retain immutable history. Rollback restores the complete prior release, world and artwork mapping. New chapter snapshots pin the bound presentation; historical chapter rows are untouched.

## Migration impact

151 canonical migrations remain unchanged. Two new forward migrations currently produce 153:

- `20260914101412_portal_theme_import_release_lifecycle.sql`
- `20260914104650_portal_theme_world_bindings.sql`

Current candidate artifact fingerprint: `07647743fdb7684bf1af810dbf08f223b7a06048964586f74da0018ccfe53b88`. Runtime minimum contract 5 and its previous application/schema floor remain intact; this application artifact independently requires all 153 versions. Additional V4.2 persistence work may add further migrations before final certification.

The current isolated development database began with official application of the canonical 151. New schema was then applied locally for development, including a transaction/rollback compile check. Its history still has 151 entries: it is **not** claimed as a final official upgrade or fresh-install result. Both final paths, partial-lineage rejection and rollback application compatibility still require certification after all migrations are complete.

## Evidence and corrections

- Full unit suite: 485 passed; typecheck passed.
- Actual local storage/SQL contracts: publication, stale review, concurrent edit, immutable history, anonymous/authenticated denial and reconnect passed. World bindings additionally covered legacy opt-in, tenant/stage isolation, unchanged curriculum, concurrent revisions, complete rollback and child/tenant/direct API enforcement.
- Three Chromium flows passed together: known-package import→pre-concept preview→edit→review→publish→export→new browser context; guided mapping→reload→preview→concept; explicit world binding→replacement→rollback→reload.
- Static migration audit, RLS audit and auth audit passed. RLS audit retains informational warnings for private functions without authenticated execute grants; these functions intentionally remain private.
- SQL lint and Supabase advisors (all categories, existing error threshold) passed on the local development schema. CLI output says “remote database” generically; the explicit connection was `127.0.0.1:58522` only. An initial invocation without `sslmode=disable` could not connect to this non-TLS local database; no lint was claimed for that attempt.

Initial failures were retained in `/tmp/nxttrack-v42-evidence`: iframe preview was blocked by the original global framing header; a guided-browser locator picked an unrelated `role=img`; automatic form reset cleared the visible selected stage. Each was corrected and rerun. The migration audit also incorrectly matched a later private function's `SECURITY DEFINER` against an earlier public function. It now uses the existing function-block parser, with a regression test that also rejects public `CREATE OR REPLACE ... SECURITY DEFINER` and missing search paths. No threshold or allowlist changed.

Portable copies of passing logs and their hashes are in `evidence/` and `TEST-RESULTS.json`. These are checkpoint results; final evidence must identify the final complete code/build and CI head. Firefox/WebKit, final build/packaging, both complete DB profiles, all functional suites and CI are not claimed here.

## Remaining implementation

Complete library ergonomics for asset replacement, guide/pose controls, world lifecycle, new concept versions and revision diffs/restoration. Complete shared child Journey/history, Development, instructor review/save/explicit communication, portal action dialogs, persistent scoped message drafts and collectible history. Verify parent/child/native consumption of real assigned data and chapter transitions. Complete camera/accessibility/visual acceptance and the full final suite.

B01 remains: original Default 1.1 JSON, anchors and original art are missing. The expected 96 semantic assets comprise 36 scene layers, 52 support slots, two previews and six collectibles. Reference-package art and explicitly labelled fixtures are not Default approval. No guessed source parser, generated substitute or PDF crop has been installed as original artwork.

No deployment performed. No remote database mutation, provider action, real message/payment or main merge. Journey Bot remains retired.
