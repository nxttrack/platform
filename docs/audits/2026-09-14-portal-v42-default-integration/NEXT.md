# Continue full V4.2 implementation

IN_PROGRESS. The user authorized the complete integration. Do not stop at this checkpoint, plan or documentation.

Branch codex/portal-v42-default-integration. Canonical baseline afb53f6e4f72ac8fb0cba88ab98e43373fc7ed80, refetched and unchanged. Separate worktree /home/codex/repos/nxttrack-portal-v42-default-integration. Preserve unrelated original worktree. No merge/deploy/remote DB/provider actions/real messaging. Feature push + PR authorized but not done yet. No subagents authorized.

See THEME-LIFECYCLE-CHECKPOINT.md and TEST-RESULTS.json for new actual evidence. 485 units, typecheck, static migration/RLS/auth, local SQL lint/advisors pass. Three real Chromium library/guided/worldbinding flows pass together. Earlier shared-scene four Chromium tests and seven screenshots also pass. Original Default artwork approval remains blocked B01.

Completed: strict presentation/import/ZIP/raster adapters; shared safe parent/child canonical scene/Home; durable import quarantine, revision digest review, immutable release/assets, portable export/import; pre-concept guarded preview; guided mapping; library/editor; explicit worldbinding, opt-in management mode, full binding rollback. Async release repository wired at server/control/child/tenant lifecycle boundaries. Exact native numeric schema remains 3. Existing tenant/child preferences are rejected at RPC in platform-managed mode. No guessed stage/world associations.

Current migrations 153 (151 unchanged + 20260914101412 + 20260914104650). Artifact pin updated to 07647743fdb7684bf1af810dbf08f223b7a06048964586f74da0018ccfe53b88; runtime minimum contract 5 stays. The local development DB includes both new schemas but still only 151 canonical history entries. This is not official upgrade proof. Final fresh + canonical upgrade + partial/rollback tests still required after ALL V4.2 migrations are final. New chapter binding snapshots need actual transition coverage and historical DTO/renderer integration.

Next implementation:
1. Library: validated asset replacement/upload, guide pose controls, world duplicate/add/remove, new concept versions, stored revision diff/restore, failed upload/retry/quarantine lifecycle. Editor advanced JSON exists but is not the full requested guided UI. Explicit approval/source Default remains missing.
2. Child /kind/reis still old map; integrate same scene with historical chapters/events/collectibles and true completion order. Parent Development needs distinct Onderdelen/Historie/Mijlpalen, search/filter/sort/details, deep-link focus. Shared camera state across actual nav, pointer/touch, 200% text/7 viewports/three engines need full certification.
3. Portal dialogs/actions feature parity; instructor draft -> review -> save concurrency and separate internal note/parent message/explicit child compliment; durable message drafts scoped user/tenant/thread/child, reference validation, failure retention; real local instructor-to-parent-to-child chain tests. No real communications.
4. Collectible persistence independent of curriculum, idempotent ownership and immutable historical release/assets. Requires additive migration and safe child-capability extension if needed; avoid authority bypass. No procedural Default assets.
5. Full test/build/packaging/local DB profiles+all suites/CI/docs/push PR + review. Do not mark final PASS from current partial implementation.

Read remaining prototype v3-ui.js tail and v4.js, relevant dialogs/messages/development and all visual references. Source root /tmp/nxttrack-v42-handoff-v3/NXTTRACK-V4.2-Codex-Overdracht-v3. Text of both PDFs and selected reference PNGs in /tmp/nxttrack-v42-evidence; PyMuPDF tools /tmp/nxttrack-v42-pdf-tools. Original Default expected 96 slots = 36 scenes +52 support +2 previews +6 collectibles; do not call all eight collectible slots.

Owned local DB: /tmp/nxttrack-v42-canonical, Docker supabase_db_nxttrack-v42-canonical, API58521/DB58522, tmpfs1GB, fictional data only. Local keys /tmp/nxttrack-v42-evidence/canonical-local-env.json (0600), never print. Browser test manager /tmp/nxttrack-v42-evidence/theme-browser-user.json. Reusable whitelisted-env helpers start-theme-server.py (port58410), run-theme-checkpoint-browser.py. Server stopped after tests; dev cache cleaned to recover disk. Starting dev changes own next-env.d.ts; restore to Git content before commits.

Disk is severely constrained (<0.5GB). Do not delete unrelated worktrees or Docker caches. Own disposable Next cache can be removed after stopping server. Consider a dedicated Docker tmpfs build volume with existing Node image for full build if necessary; use existing scripts, never lighter gates. Existing other projects/processes must remain untouched.

Fresh/upgrade helpers from /tmp/nxttrack-phase05-evidence can be adapted to new owned isolated projects. Official migration wrapper: RUN_DB_MIGRATIONS=true DATABASE_URL=loopback?sslmode=disable DB_MIGRATION_REPAIR_EXISTING_SCHEMA=false pnpm db:migrate. All remote actions prohibited.
