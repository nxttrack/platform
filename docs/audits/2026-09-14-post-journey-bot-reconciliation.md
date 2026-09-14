# FASE 0.5 — Post-Journey-Bot reconciliation

Canonical baseline: `47347d124ae8ebec447324eb2f571977a8e91442`.
PR: [#58](https://github.com/nxttrack/platform/pull/58).
Branch: `codex/sql-lint-ambiguities-pre-v42`.

## Scope and source history

PR #59 was already merged with parents `77c22b1cb10833811c0552b3160fcef1844c6368`
and `c910a19521d8b09eaadf3d8dc0871653292a5bad`. Its main CI
[34794711888](https://github.com/nxttrack/platform/actions/runs/34794711888) passed.
This task starts from PR #58 head `c757f32748bbd463891584c616b13ff0f8805d38` and a
clean worktree. Contrary to the expected conflict status, the live preflight was
MERGEABLE and Git merged without text conflicts. Merge commit
`1036a0752e8a9336dc7f1237e6dee5337198429d` retains both lines of history and all six
original PR commits. No rebase, squash, force push or main commit was used.

The semantic reconciliation keeps every Journey Bot deletion from main, removes
the retired bot gates from current PR conclusions, and updates the artifact
assertion from the obsolete SQL-only lineage to the complete combined lineage.
No bot workflow, menu, seed, evaluator, runner test or runtime endpoint returns.
Ordinary learner Journey functionality and its browser gate remain unchanged.

## Migration ordering and exact commands

The original candidate had earlier PR timestamps `20260913175334` and
`20260913182211`, after staging had already applied `20260913232635` and
`20260913234447`. The real repository command, with `RUN_DB_MIGRATIONS=true`, a
loopback `DATABASE_URL`, `DB_MIGRATION_REPAIR_EXISTING_SCHEMA=false`, and without
include-all, returned **exit 1**:

> Found local migration files to be inserted before the last migration on remote database.

It listed the missing schema-v5 recertification and both original SQL corrections.
This was a safe refusal, not a successful upgrade. Its actual, unmodified command
output is retained in `original-out-of-order-default-actual.txt`.

The two PR-only migration files had never become canonical and had not been
applied remotely. They were replaced using CLI-generated timestamps:

| Original PR-only file | Current candidate file | Content SHA-256 (unchanged) |
| --- | --- | --- |
| `20260913175334_pre_v42_sql_identifier_ambiguities.sql` | `20260914012125_pre_v42_sql_identifier_ambiguities.sql` | `a4b8e115feb9655917a23c4be45adc7ecd6b0b01c624a7d299b0f8580ed864e8` |
| `20260913182211_bind_import_payment_enrollment.sql` | `20260914012126_bind_import_payment_enrollment.sql` | `161e756c55d5a4d88b3b8c64a842a93fac8af1494dba07d9e51bb2e336868fa2` |

All 149 canonical main migrations, including both applied PR #59 migrations,
remain byte-identical. Their hashes are in `source-proof.json`. The final count is
**151**. The old PR-only filenames remain in historical evidence and Git history;
they do not exist in the final migration directory.

The already-missing `20260908111450_production_readiness_recertification.sql` is
an independent historical main gap. Its timestamp/content cannot be rewritten.
The [supported include-all option](https://supabase.com/docs/reference/cli/supabase-db-push)
is already exposed as `DB_MIGRATE_INCLUDE_ALL` in the unchanged repository wrapper
and deploy workflow. Tested Supabase CLI: **2.117.0**; no dependency change.

All migration commands below used this existing wrapper and explicit local opt-in:

```sh
RUN_DB_MIGRATIONS=true DB_MIGRATION_REPAIR_EXISTING_SCHEMA=false DATABASE_URL='<owned loopback database URL>' pnpm run db:migrate
```

For the staging-like upgrade only, add `DB_MIGRATE_INCLUDE_ALL=true`. This is a
required condition, not an implicit default or a repair command. No migration
history rows were manually inserted, deleted, relabelled or repaired.

| Test | Initial state | Actual command/result | Final state |
| --- | --- | --- | --- |
| Fresh install | Empty Supabase DB; secure grants, auto-exposure disabled | Existing wrapper applies all files in order; exit 0 | 151, contract 5 |
| Canonical upgrade | Exact main artifact: 149 including recovery/retirement | Standard wrapper 149 → 150 → 151; both invocations exit 0 | 151, contract 5 |
| Staging-like | 146 historical migrations + two PR #59 migrations = 148; schema-v5 and both SQL corrections absent | Standard wrapper refuses the historical gap, exit 1. Existing include-all wrapper applies exactly the three missing files, exit 0 | 151, contract 5 |
| Replay | Complete upgraded lineage | Standard wrapper, exit 0, database up to date | Unchanged 151 |

Staging-like classification: **SAFE with the existing explicit include-all setting**;
**BLOCKED without that setting**. Migration repair required: **NO**. No remote
migration or staging configuration change was performed. A future deployment is
a separate user decision and must supply the tested setting; this PR does not
authorize or execute it.

## Runtime and retirement contracts

- Runtime contract version: **5**.
- Minimum application contract SHA: `541fe5fd6cee083cb809eef236382cfd2d519ed3`.
- Certified ancestry bridge: `12b4885a55c439caa2a7aa180d597e72baf9d2d5`.
- Minimum migration version: `20260908111450`.
- Minimum schema fingerprint: `2b38518a37e41adb2da11224561e44e185c28ca45a962e1f8acfd361aab38aba`.
- Final artifact migration: `20260914012126`.
- Complete artifact fingerprint: `a76d447721af7264e4aa7984fb3172727baa68f45f03c07d01eb4d6567a957ec`.

The candidate release assertion rejects the actual canonical 149- and 150-migration
DB states, then accepts 151. Additional units execute the real artifact guard
against incomplete filesystem artifacts: missing either correction pair, either
retirement pair, or any single correction/retirement migration is rejected.
The complete artifact reaches the database check. No safety threshold was relaxed.

The exact canonical application's health compatibility function and the candidate
both accept all three final databases. A real Git ancestry regression proves
canonical main remains eligible for the existing rollback ancestry guard. This is
application/contract compatibility evidence, not a performed application rollback.
The historical main release script itself still has its old 147-file local pin;
this candidate corrects the combined artifact assertion without rewriting main's
historical commit or claiming that its old release script was re-certified.

Before/after and post-suite inspections show four bot RPCs absent, no enabled bot
configuration, six retained archive tables and 18 denied write-privilege checks.
Service-role read access remains. The append-only lifecycle guard is unchanged;
PL/pgSQL variable-conflict handling remains `error`. SQL function signatures,
security mode, ACLs and search paths are unchanged by the two SQL corrections.

## Functional and operational validation

All 15 existing DB checks passed separately on each of the three profiles (45
passes): clean-room schema/roles/storage audit; upgrade preflight; runtime schema
assertion; nine swim SQL suites; planning concurrency; email outbox; tenant
provisioning; core onboarding; resumable import; production-readiness certification;
crash windows; local upgrade-fixture setup; 102 API/storage assertions across six
roles; security advisors; original SQL lint. Each command and its full output is
indexed in `validation.json`.

| Domain | Verified behavior |
| --- | --- |
| Themeplanning | create/replace/cancel, due/future activation, current/previous release, release rollback, failed-tenant isolation, competing workers and tenant binding |
| Blackout undo | exact actor/tenant, restoration, rollback under another published closure, idempotency and concurrent undo |
| Import stage | program-bound stage selection, duplicate protection, restart/replay, independent rollback, 5,000 rows |
| Payment/enrollment | selected subscription's exact enrollment; inactive linked enrollment gives controlled `needs_attention`; no fallback to another active enrollment |
| Boundaries | tenant/API/storage/role matrix, immutable history, transaction/outbox/onboarding concurrency, restart/rollback/crash contracts |

Existing limitation remains: imports that create protected enrollment lifecycle
history require human reconciliation when generic compensation returns
`needs_attention`. The test proves preservation of that graph/history; it does
not claim automatic deletion succeeds.

Local application validation: clean/frozen install, unchanged lockfile,
`pnpm audit --prod` (zero advisories), unchanged moderate production gate,
455 units (no failures/skips), typecheck, production build, standalone packaging,
repository truth, Lovable baseline, auth, runtime environment, migration/RLS audits,
Sprint 31 audit and default migration-command check all pass.

An initial forced frozen reinstall exhausted local disk while downloading unused
cross-platform binaries. It was stopped and retained as ENOSPC evidence. Only this
task's generated dependency directories and newly downloaded unused binaries were
removed. A normal frozen install from absent node_modules then passed; dependency
versions, lockfile and audit policy were not changed.

Local browser result: **52 smoke passes**. The full Journey command ran with one
worker and no retries: **12 passes, 27 failures**. The Chromium render test failed
with `page.screenshot: Target crashed` and browser SIGSEGV; the remaining 26 failures
were Firefox/WebKit launch errors for missing host libraries. These browser tests
are not labelled PASS or intentional skips. Local noninteractive sudo is unavailable;
no system libraries were changed. Raw failure output is retained. The exact-head
GitHub workflow installs browser dependencies and must complete the full browser
gate before this PR is recommended for merge.

Validated implementation: `1f8eec6` (the preceding runtime change is `c9e88e2`;
the additional commit adds the canonical-ancestor regression). The final evidence
commit changes documentation only. Its exact-head Web CI and requested Codex review
are the current gates linked from PR #58; their run IDs, final SHA and conclusions
are recorded in the PR body after completion, avoiding a self-referencing evidence
commit. Android is not manually triggered: no native workflow path changed.

The [validation index](2026-09-14-post-journey-bot-reconciliation/validation.json)
contains raw transcript hashes, results and explicit local limitations. Historical
FASE 0.2 transcripts remain untouched.

## Safety and exit boundary

Historical FASE 0.2 bot audit/tick evidence is retained unchanged. The former bot
staging blocker is superseded by owner-directed retirement and is not a current
merge gate. The PR body and report now use the post-retirement baseline.

No deployment performed. No remote database change. No provider action.
No application release. PR #58 is not merged by this task.
V4.2: **NOT STARTED**.
