# Canonical Development and Journey checkpoint

Implementation commit: `5ccbe7746885218e1c7ae1f30984d4415d710085`. Full V4.2 integration remains IN_PROGRESS. No merge, push, PR, deployment, remote database mutation, provider action or real communication was performed. B01 still blocks original Default source/visual approval; current fixture screenshots are not original artwork acceptance.

Parent Development now offers Onderdelen, Historie and Mijlpalen with filters, search, school order, canonical mastery thresholds, correction/retraction history, focused dialogs and authorized world links. The unchanged legacy development implementation remains for noncanonical/non-swim data. Child Home and /kind/reis share the same scene and keep instructional videos. Child projections allowlist fields and require explicit child-visible compliments.

Journey badge moments reuse the prior eligibility/timeline contract and stay separate from curriculum nodes and goals, including a complete accessible moments list. Both parent/child server projections use authorized awards; the parent release relationship query was also checked against local PostgREST (HTTP success, zero test awards in that read). No upload or external action was used for that check.

Historical scenes resolve only their exact immutable release and saved binding, never today's substitute. New chapter captures freeze immutable curriculum metadata, public observation recency, actual mastery thresholds and existing completion sequence/date provenance. The new visibility marker prevents old snapshots without visibility provenance from exposing possibly internal ratings. Historical stored rows remain intact. Missing scores/dates remain unknown, including absent legacy visibility evidence; no values are filled from current assessments. A captured older curriculum can render its saved metadata after a version change. The existing authoritative completion sequence trigger is unchanged; absent completion provenance remains absent.

Migration count remains 153 (151 canonical migrations unchanged). Only the not-yet-deployed V4.2 forward migration 20260914104650 was extended. Runtime artifact fingerprint remains `07647743fdb7684bf1af810dbf08f223b7a06048964586f74da0018ccfe53b88`. The isolated local dev database received the function replacement; canonical migration history is still 151, so this is not final upgrade certification.

Actual validation:
- `pnpm typecheck`: PASS.
- `pnpm test:unit`: 496 PASS; one subsequently added older-curriculum snapshot regression also passes in the focused six-test Development file. Do not relabel the full run as 497.
- `pnpm test:swim-canon:db` against owned loopback port 58522: PASS all nine existing SQL suites, including new real transition assertions for newer observed time vs later entry, internal assessment exclusion, frozen metadata, actual completion sequence, carryover and retry immutability.
- `pnpm exec supabase db lint --local --workdir /tmp/nxttrack-v42-canonical --level warning`: PASS, no schema errors.
- `pnpm db:audit`: PASS 153 migrations; `pnpm db:rls-audit`: PASS 254 public tables (existing informational trigger/private-function notices retained).
- Existing Journey configuration, with webServer omitted solely to use the separately managed local server at localhost:58410: seven Chromium tests PASS (seven viewports, 200% text, search/session preferences, focus/escape, archive values, 0/1/4/5/7/12/24/48 nodes, orientation, drag/refresh, reduced motion and separate moments).
- Same command requested Firefox and WebKit: 14 launch failures from missing system libraries; browser assertions did NOT run. This aggregate run is FAIL, not a three-engine pass. Final canonical CI/browser gate is still required.
- Chromium screenshots were inspected. This exposed an active-tab background overridden by unlayered CSS and narrow 200% detail columns; both were corrected before the seven passing tests. Earlier failed overflow and ambiguous test locator runs remain as evidence, not retrospectively PASS.

Outstanding: real instructor→parent→child end-to-end chain and message drafts/context/actions; collectible persistence; additional importer lifecycle/editor edges; smooth registered route/guide motion; full fresh/upgrade/rollback/partial migration certification, build/packaging, final complete regression/CI and feature PR review. Rich binding chapter transition and historical artwork rollback need further real-DB coverage beyond the existing binding race/rollback test.

| Evidence | SHA-256 |
|---|---|
| `development-snapshot-typecheck.log` | `0de00c4791387b6713220c80c19f9992f9cb5f1597a33cf1f3f93266db5b46c4` |
| `development-snapshot-all-units.log` | `9b3e67b1c0a16f0f8d193fbbdd62b1c6109464c8c2e8de6a39b65f61509d1746` |
| `development-snapshot-final-units.log` | `0b0d55d6bc37b99a926a682e6558f290644bec2a947d46159b3db12ad26f749c` |
| `development-snapshot-swim-db.log` | `0f726f9a63589a4b3623467a86551b30335fda6bd7ac198bf365c4608266fd67` |
| `development-snapshot-sql-lint.log` | `d9c17f3f41d4c4b3d90671089f63f7f54b14dcd3b03c327ae4227d63eca6228b` |
| `development-snapshot-migration-audit.log` | `a2c19998503a5fe300144e411fd07b8826d0a5aea78d9642242dee7c4e6c31b3` |
| `development-snapshot-rls-audit.log` | `430b31bffa9727279c80ea3d50aa26a85dea9905fea58a88bca51a995822b3ce` |
| `development-three-engine-browser.log` | `6dca618ee64ca82cabff325cc6557dbf75893355000ca2fba4feb8f77acdac25` |
| `development-moments-browser.log` | `d20d2fb57134df85fc6f1091fd7e6101806d9f8d8e4f91022f7247f89c351cec` |
| `development-overflow-browser.log` | `9a4a10bca49835e71cb8b5e2d61fdb0e6773183cbb1d7b3370621f7eb7236327` |
