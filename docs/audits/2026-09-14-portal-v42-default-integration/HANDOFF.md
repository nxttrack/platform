# Review handoff

Baseline: `afb53f6e4f72ac8fb0cba88ab98e43373fc7ed80`. Branch: `codex/portal-v42-default-integration`.
Runtime source: `feee0c0a1d3bbdc2787c0f0dfe336edf5637d18f`. This review implementation is not an authentic Default 1.1 asset delivery; B01 remains.

Routes: `/portaal`, `/portaal/ontwikkeling`, `/portaal/inbox`, `/portaal/planning`, `/portaal/kinderen`, `/kind`, `/kind/reis`, `/instructor/student/[id]`, `/platform/themes`. These require the existing authorized sessions/roles. New platform concepts use the same renderer in private previews. Existing unmigrated tenant policy remains intact; no automatic activation occurs.

Local toolchain: Node 24.18.0, pnpm 10.24.0; `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm deploy:package-standalone-assets`, `pnpm start`. The packaging script only copies local runtime assets; it does not deploy. Set APP_ENV=test and explicitly loopback app/Supabase endpoints for local fictional verification, with email/newsletter/internal jobs disabled. Never copy remote credentials into these examples.

Owned development API/DB: localhost:58521/58522. Private local connection information is stored outside Git at `/tmp/nxttrack-v42-evidence/canonical-local-env.json`, mode0600. Final independent certification projects are under `/tmp/nxttrack-v42-final-{fresh,upgrade,rollback}`; see DATABASE-CERTIFICATION.md for commands/profiles. No secrets are committed. Current owned standalone verification uses port58410 and `/dev/shm/nxttrack-v42-build`; the build checkout is disposable, not another product branch.

Fictional fixture helpers: `scripts/db/seed-portal-message-browser.mjs`, `seed-portal-assessment-browser.mjs`, `seed-portal-collection-browser.ts`, `seed-portal-practical-browser.mjs`, `seed-portal-private-files-browser.mjs`, `seed-portal-import-recovery-browser.mjs`. They require explicit loopback addresses and a new private fixture output path. Each creates a fresh fictional family or isolated manager import state; never reuse a consumed fresh-state fixture for assertions that require an empty collection/inbox. Passwords stay in the private file, not this handoff.

Original assets needed: original Default manifest, assets-manifest, six named anchor maps and 96 individual raster assets. No new authentic Default runtime version is assigned until source validation and review can actually run. Parelroute/Ocean test/reference versions are not Default releases.

Migrations: apply only the existing official repository command in an authorized local environment; 151 canonical + six forward-only =157. No historical file edits and no down migration. Candidate exact artifact assertion rejects any missing new migration. Canonical application rollback schema compatibility and original SQL commands on157 were tested; this is not a remote rollback deployment rehearsal. Preserve DB/assets on app rollback and use existing presentation binding/revision restore commands; do not delete published referenced files.

No main merge, application/staging/production deployment, remote migration, provider action or real message/payment was performed. Feature PR remains for user review. Historical checkpoint documents describe their original runs; FINAL-VALIDATION.md/TEST-RESULTS.json are the current conclusions.

Local payment rehearsal: the standalone process was explicitly started with `node --require <repo>/tests/fixtures/portal-v42/local-provider/preload.cjs server.js`, APP_ENV=test, PORTAL_LOCAL_PAYMENT_FIXTURE=true and a127.0.0.1 HTTP stub. The preload refuses unexpected provider operations and all other external fetches. It is never imported by the product. The fake key and isolated session fixtures are not real provider credentials. `journey-local-payment.spec.ts` verifies actual webhook/DB/UI behavior; the normal CI run skips this explicit fixture scenario.
