# Additive migration and rollback certification

Canonical baseline: afb53f6e4f72ac8fb0cba88ab98e43373fc7ed80 (151 migrations).
Candidate: 157 migrations. Only six new forward migrations, original151 unchanged. Runtime contract5, required artifact20260914145431, SHA-256 of complete version lineage ec8535f2f83642e679a309bb3a4992af96581cf420e055abb2001069495157cd. Existing minimum application/schema anchors remain unchanged.

All commands used owned loopback Supabase instances. No remote database, migration repair, deployment, mail or provider action.

- Canonical upgrade: a newly initialized legacy-grants profile first received the exact151 canonical migration files through `pnpm db:migrate` with explicit local opt-in and repair=false. Candidate schema assertion correctly rejected6 missing migrations. Official command applied the six additions; history157 and candidate runtime assertion PASS.
- Fresh secure grants: empty local database, secure default privilege bootstrap, official command applied all157. Full clean-room and runtime checks PASS.
- Fresh legacy grants: separate empty profile applied all157; clean-room PASS. Exact detached canonical checkout's schema assertion and its nine original SQL suites PASS against this new schema, proving the retained rollback contract without pretending to have deployed an older app.
- Partial lineage: on the owned third profile, each of six new history records was omitted separately; every156-record state failed the unchanged required-artifact assertion with exactly1 missing migration. Exact saved records were restored in finally blocks; complete157 passed again. This is a local negative test, not migration repair or a production recovery procedure.

Both upgrade and secure profiles pass the complete existing database suites: clean-room, production-readiness preflight, schema compatibility, nine swim suites, planning concurrency, outbox, provisioning, onboarding, resumable import/5k/restart/rollback, production-readiness/crash windows, tenant/API/storage matrix and security advisors. New theme-library/collection/recovery, message and instructor contracts pass. SQL lint covers public, app_private and extensions at the unchanged error threshold. Raw commands, exitcodes, timings and hashes are in the two db-results JSON files. Authentication keys/fixtures are excluded.

The existing inventory gates initially expected251 public tables and5 private buckets. Candidate requires256 forced-RLS public tables and7 private buckets; audit now checks these exact values, the3 new private forced-RLS ledgers and12 additional service-only commands. Preflight expects the two new private buckets only when migration20260914101412 is recorded, so the original151 baseline remains valid before upgrade. Historical failure logs are retained, with no threshold reduction or allowlist.

The first attempt to run the original canonical SQL suite after the production-readiness fixture hit its fixed program-ID collision. It is retained as a failed fixture ordering. The dedicated third fresh profile then ran the exact original suite successfully before unrelated fixed-ID seeds; no SQL contract was modified to bypass the collision.

An additional actual rich-theme transition reuses the canonical reviewed transition/carryover SQL contract with an imported, reviewed and published raster release. It verifies exact binding/release/asset and public assessment provenance, later binding revisions/whole-unit rollback/unbinding, unchanged historical snapshot after carryover retry and transactional fixture rollback. It passes on dev, upgraded and fresh-secure databases. An initial attempt reused a DB connection with a previous outsider JWT; the regression now uses a clean independent connection, retaining the failed log as fixture evidence.

Application build, browser and PR/review gates remain tracked separately. This report alone does not certify the whole V4.2 integration or original Default artwork.
