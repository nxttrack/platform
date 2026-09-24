# Durable cosmetic collection — implementation evidence

Canonical source: `afb53f6e4f72ac8fb0cba88ab98e43373fc7ed80`. Full integration remains IN_PROGRESS; this is not final CI/fresh-install certification.

The parent Home and child Home/Journey expose a separate collection and an explicit discovery/save dialog outside the curriculum route. A server-selected item comes from the current published, explicitly bound theme pool. Location, score, stage ordinal and artwork do not determine its identity. An offer does not constitute ownership. Explicit save is transactional and idempotent; already owned stable theme/item identities retain their original title, asset snapshot and release.

Migration `20260914142841_portal_journey_collections.sql` adds private collection/offer storage with forced RLS and no authenticated table grant. Public service-only invokers delegate to private implementations with empty search paths. The real auth session, guardian, participant, tenant, expiry, active child context and write permission are rechecked server-side. Native context v1 retains its exact eight existing capabilities; the new web child-session wrapper grants a separate private `collectibles.write_safe` capability after the original session authority. Old native/child sessions can read but cannot perform these cosmetic writes. Read-only guardians cannot save. Existing scores, badge authority, curriculum transitions, billing, notifications and provider flows are untouched by collection commands.

Complete reads use stable bounded pagination and fail closed on incomplete results. Saved items reference immutable published releases; rollback changes neither their title nor their art. Responses to child clients contain no parent actor identifiers or raw private database rows. Maintenance blocks collection writes.

## Actual checks

- 504 units, typecheck and auth audit PASS.
- Migration audit: 156 files; RLS audit: 256 public tables, PASS. Private collection tables are intentionally outside Data API table exposure. Existing grant-discovery warnings are advisory; real permission tests deny authenticated direct access.
- Local SQL lint (app_private, extensions, public): no schema errors.
- Existing real-storage theme lifecycle suite plus collection contracts PASS: same-request concurrent random draw; no ownership before save; fault after item insertion rolls back both records; two real connections save once; duplicate ownership preserves original metadata; expired offer/auth session, revoked guardian, unrelated tenant/actor and wrong child denied; old native context still parses unchanged; theme rollback retains collection; business record snapshots unchanged.
- Seven actual Chromium tests PASS: one authenticated parent/child collection chain plus six existing rich-Journey tests. Real flow includes network failure/retry, reload, explicit save, shared parent/child durable state, duplicate, search, nested detail and focus return; collection controls fit 320/390/768/1024/1440 widths. Existing Journey fixture matrix retains 0/1/4/5/7/12/24/48 items, seven viewports, camera state, drag suppression, smooth route registration and separate badge moments.

Logs and two actual browser screenshots are in `evidence/collection-*`, `parent-collection.png` and `child-collection-controls-mobile.png`. Test-RESULTS lists log hashes. Earlier failed audit/fixture attempts remain separately under `/tmp/nxttrack-v42-evidence`: public definer/private-table placement was corrected to the repository contract, and an actor-denial test was corrected to use two different authorized actors rather than the same parent's two sessions.

The browser seed is strictly loopback-only and uses the real reference package, actual raster validation/storage and real import/review/publish/bind commands. Its two cosmetic items are explicitly fictional fixtures, not missing original Default 1.1 assets. Browser tests skip without an explicit local fixture; do not label ordinary CI as having executed this authenticated flow. Firefox/WebKit are not certified by these Chromium runs.

Candidate artifact fingerprint: `bc2f1a0dcb05e2eb73942785f685f47d08a489fb119149199552679433b242c0`; artifact maximum version `20260914142841`. Runtime contract remains 5 with its original application minimum. Development schema was applied only to the owned local database; official migration history remains 151 until final fresh/upgrade validation. No deployment, remote database or provider action. B01 original Default assets remains open.
