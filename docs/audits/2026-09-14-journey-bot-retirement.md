# Journey Bot retirement

Canonical source: `77c22b1cb10833811c0552b3160fcef1844c6368`.

The owner cancelled recovery and requested removal: “Verwijder aub die hele bot en workflow. Niet meer nodig. We testen voortaan zelf.” This supersedes the earlier requirement to recover two successful automatic ticks. It does not turn any failed tick into a success.

## Immediate staging retirement

- Disabled GitHub workflows: Journey Bot staging tick **319324277**, smoke **319324897**, and window **319758199**. No bot runs were active at retirement.
- Temporarily disabled shared Staging demo tenant seed **319281251**, because its current main revision still runs the bot seed. The PR removes that step. Re-enable the shared workflow only after the removal has been reviewed and merged; bot workflows stay disabled.
- Applied retirement migration **20260913234447** only to staging project `laajebtwbcxzjqvtimks` at **2026-09-13 23:44:47 UTC**. It disables/pauses the config, clears schedules, removes four public/private claim/purge functions, and revokes writes on six bot tables from public/anon/authenticated/service_role. Existing RLS still controls historical reads.
- Restored the original unconditional append-only lifecycle guard, removing the now-obsolete purge exception from the preceding recovery migration.
- Readback at **23:45:09 UTC**: all four procedures absent; all 18 role/table combinations deny writes; config disabled/paused with no next run or run window. Retained row counts are identical: 1 config, 50 runs, 264 child journeys, 10,747 events, 58 issues, 1 purge receipt.
- Live DB now has **148 migrations / unchanged contract 4**. GET health passes on unchanged app SHA **7b55a80cbd44e2153a5e690e34ab1c62f755b1c0**. No application deployment, restart or provider mail/payment action.

## Application removal

Removed the runner, server actions, platform bot page/navigation, internal tick route, bot seed/evaluator, dedicated bot tests, three workflows, bot-only package/release checks and environment keys. Removed the bot seed from the shared demo workflow. General test labels replace the retired feature name in normal admin views. The ordinary learner Journey engine, timeline, themes and browser gates remain.

Legacy `is_test`, `journey_run_id` and `journey_simulation_bot` lineage/exclusion checks remain deliberately intact. Existing test records must not become live pupils, revenue, notifications or payment candidates. Historical migrations and reports remain evidence. No staging database wipe or forced purge completion was performed. The pending receipt stays historically pending and is read-only after retirement.

The old live app menu/route can remain visible until a separately reviewed application release. Its bot procedures and write privileges are already retired. This PR does not deploy the new UI, merge main or modify PR #58.

## Migration history and audit correction

Migration **20260913232635** records the earlier staging purge repair, which was applied before the owner changed the task. The next manual tick **34789818566** still failed at **23:29:06 UTC**; its raw HTTP response was not retained by the existing workflow. Recovery was then cancelled rather than reported successful. The applied repair is preserved byte-for-byte as history; the retirement migration removes its active purge implementation and exception.

Canonical main plus these two migrations has **149 migrations**. Staging has **148**, because canonical schema-5 migration `20260908111450` is still pending there. PR #58 remains separate; do not silently apply its migrations or the pending schema upgrade. A later authorized full upgrade must include older pending migrations explicitly; the existing `DB_MIGRATE_INCLUDE_ALL=true` path was verified locally after the earlier hotfix.

The static RLS auditor previously recognized only `$$` and `SET search_path =`. Recording the already-applied `pg_get_functiondef` SQL exposed its incorrect handling of named dollar quotes and `SET search_path TO`. The parser now matches the actual closing delimiter and checks privilege/search-path clauses only in the function header. Four regression tests cover named quotes, neighbouring functions, misleading body text and nested quotes. No threshold, allowlist, ignore, RLS policy or safety check was removed to obtain a pass.

## Validation

- Frozen install, typecheck, production build, standalone packaging, production dependency audit (zero known vulnerabilities), repository truth, auth, runtime environment, Lovable baseline and migration/RLS audits: PASS.
- Units: **451 PASS**, zero failed/skipped. Seventeen obsolete bot tests were removed and four SQL-audit regressions added; historical 464-test results are unchanged.
- Retirement transaction tests against canonical and exact staging schema: active-run refusal rolls back before mutation; rows/receipt retained; config stopped; four functions removed; all 18 write-privilege combinations denied; actual service re-enable UPDATE refused; unconditional lifecycle immutability restored. Fixtures were rolled back.
- Exact staging forward upgrade to 148 and fresh canonical installation of 149 migrations: PASS. Canonical clean-room audit passed with the actual **legacy** grant profile, including service-only RPC boundaries, 251 RLS tables, storage/role checks and the new retirement assertions. An earlier attempt labelled the local profile secure and failed on its two existing public/anon executable functions; it is not recorded as secure-profile certification.
- Existing swim-canon, outbox concurrency/immutability and onboarding rollback/concurrency contracts pass after retirement. The 5,000-row import/restart/rollback suite passed when rerun without competing browser processes. All 52 Chromium desktop/mobile smoke checks passed with two workers and unchanged assertions. The initial full Journey browser run was not green (host resource failures plus Firefox/WebKit launch/library failures); serial Chromium and GitHub CI evidence are recorded on the PR. Local failures are not represented as passes.

Evidence: [before/after database and workflow records](2026-09-14-journey-bot-retirement/).

PR #58 stays open, unchanged and unmerged. V4.2 has not started. No application deployment performed.
