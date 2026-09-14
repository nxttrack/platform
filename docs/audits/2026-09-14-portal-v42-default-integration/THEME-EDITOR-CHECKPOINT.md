# Theme editor and Journey checkpoint

Canonical baseline: afb53f6e4f72ac8fb0cba88ab98e43373fc7ed80

Implementation remains IN_PROGRESS. This certifies the bounded changes in 5fd3bc3 and d1f91ad, not the complete V4.2 integration.

## Implemented

- New draft versions copy immutable source bytes into a new release identity; the source and assignments are unchanged. Revision comparison is semantic. Restore appends a new draft revision and invalidates its old review.
- Manager-only bounded raster upload verifies actual decoding, MIME, dimensions and hash. Published releases reject uploads. EXIF rotation is rejected explicitly, preserving canvas/anchor registration.
- Guided controls edit colors, support slots, independent collectible definitions, guide poses/light effects and custom world duplication/removal. Real asset upload, persistence, review and restore are covered in a browser.
- Default publishing additionally requires verified server-side original-source provenance. A real local SQL/storage test constructs a deliberately false original-source claim, records a valid review, and proves publication is rejected. Test rows are rolled back and only its temporary uploaded bytes are removed. No Default original assets were fabricated for runtime.
- JSON object key ordering from PostgreSQL no longer causes the editor to report its own successful save as a conflict; genuine changed content is preserved.
- Current Journey assessments use the canonical observed_at/finalized_at/ID ordering. A zero-size viewport never creates scale zero or infinite guide coordinates.

## Actual validation

- Typecheck PASS. Full unit suite 488 PASS before the final assessment-order regression; the subsequent focused Journey suite has 16 PASS including the new observation-order case.
- Real local SQL/storage lifecycle, binding, concurrent editor, rollback, privacy and Default-source rejection suite PASS; no skipped checks.
- Chromium editor end-to-end PASS: copy published version, reject false image, upload raster, edit world/guide/support/collectible/color, save, reload, review, restore as revision 3, fresh browser, original published source unchanged.
- Shared Journey Chromium suite: 4 PASS, seven viewports and all supported node counts; no Infinity/NaN console warnings. Uses the existing journey configuration against the already managed isolated local server (temporary webServer override only).
- Initial shared-scene reruns crashed while the root filesystem had no free space; another attempt still crashed with browser temporary files on that filesystem. Same tests passed after moving only this task’s Next cache and browser temporary files to private /dev/shm directories. Those attempts are not relabeled PASS.
- Firefox/WebKit, full production build/packaging, complete fresh/upgrade/partial lineage and final instructor/parent/child chain remain pending.

## Lineage and boundaries

Still 153 candidate migrations. All canonical 151 are unchanged. The additional draft lifecycle migration is not canonical or remotely applied; its publication guard was strengthened before merge. Current local development DB has its function delta applied, but history remains 151: not final migration-upgrade proof. Artifact version-list fingerprint remains 07647743fdb7684bf1af810dbf08f223b7a06048964586f74da0018ccfe53b88.

B01 ORIGINAL_DEFAULT_ASSETS_MISSING remains open. No deployment, remote database mutation, provider action, branch push or PR merge performed.

## Retained logs (SHA-256)

- theme-editor-final-typecheck.log: `0de00c4791387b6713220c80c19f9992f9cb5f1597a33cf1f3f93266db5b46c4`
- theme-editor-all-units.log: `f44a99f6695c2f282d794ae9244d0d058e1e1f6a8022c807da178f92cde59913`
- theme-editor-provenance-units.log: `59897c5120a6e2c73c56107ffb3960cc4fda41d688bd8db91ee2635787544f4d`
- theme-editor-provenance-db.log: `18555e134c235b59fb842438aedff7fb2a12ea5244127e86510549977c64528b`
- theme-browser-editor-controls-fixed.log: `e25cbbf319f82a646ba1025c53cbebc37439396a3f3af1758161ea329cc6df29`
- rich-editor-finite-browser.log: `d331bd0fbb554c04bb570ee6c2d45cbdb5c559e77bc639cbcd5fab9b399f413a`
- journey-latest-finite-units.log: `b4aa9140fd5c3581eb7135af3410a03533ff7ac1f14e848d648a7484943f9e85`
