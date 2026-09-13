Canonical baseline:
77c22b1cb10833811c0552b3160fcef1844c6368

# FASE 0.2 — SQL lint ambiguities before V4.2

Current candidate: **149 migrations**, consisting of the 147 canonical migrations
and two forward-only corrections. The original three lint findings are FIXED.
The additional Codex P1 and its current validation are detailed below.

## Original inventory, completed before code changes

Reproduced on the canonical 147-migration database with Supabase CLI 2.117.0:

```sh
pnpm exec supabase db lint --db-url 'postgresql://postgres:postgres@127.0.0.1:56622/postgres?sslmode=disable' --level error --fail-on error
```

Exit 1, exactly three error findings. The endpoint is an owned local Docker
database (`nxttrack-phase02-legacy`), despite the CLI's generic “remote database”
connection message. No remote database was accessed.

| ID | Domain | File under `supabase/migrations/` | Line / PL/pgSQL statement | Finding | Initial classification |
| --- | --- | --- | --- | --- | --- |
| SQL-01 | themeplanning | `20260801120000_parent_portal_theme_engine_v2_1.sql` | 422 / body line 6, `FOR over SELECT rows` | `column reference "status" is ambiguous` (42702) | A: real ambiguity; D: immutable historical migration |
| SQL-02 | blackout-undo | `20260802210000_holidays_and_paid_offerings.sql` | 1367 / body line 28, `SQL statement` | `column reference "actor_user_id" is ambiguous` (42702) | A: real ambiguity; D: immutable historical migration |
| SQL-03 | import-stage | `20260822012255_resumable_import_apply_rollback.sql` | 428 and equivalent branch at 463 / body line 131, `SQL statement` | `column reference "program_id" is ambiguous` (42702) | A: real ambiguity; D: immutable historical migration |

All three emit the detail: `It could refer to either a PL/pgSQL variable or a table column.`
They are live PL/pgSQL function bodies, not obsolete SQL or an alternative lint rule.
The 147 applied migration files are recorded with SHA-256 hashes before changes.
[The repository migration rules](docs/MIGRATION_STRATEGY_DECISION.md) state that
migrations are append-only after merge. Historical files must remain byte-identical.

### SQL-01 — scheduled theme activation

Function: `app_private.execute_due_portal_theme_schedules(integer)`.
`tenant_portal_theme_schedule.status` conflicts with the `status` output variable
declared by `RETURNS TABLE`. The selection must refer to the schedule row. Other
selection columns are `scheduled_for`; the limit is the `target_limit` parameter.
The public invoker RPC wraps this private definer function; both are service-only.
The guarded internal scheduled-activation route calls the public wrapper.
Planning and manual activation/rollback use `portal-theme-control-actions.ts`.
The selection uses `FOR UPDATE SKIP LOCKED`; activation locks the tenant and active
assignment, records the previous release and appends an audit event. Each scheduled
activation has its own exception subtransaction. These contracts require runtime
regression evidence, including failure isolation and competing workers.

### SQL-02 — blackout undo

Function: `app_private.undo_season_blackout_v3(uuid,uuid,uuid)`.
The `actor_user_id` parameter conflicts with the same-named column of
`season_schedule_change_events`; `undone_by_user_id` must receive the current undo
actor, not the historical publication actor. The function checks the actor and
`holiday.manage`, locks the tenant-bound blackout, restores eligible session
statuses, reverses occurrence exceptions, marks change events undone, dismisses
proposed financial adjustments and closes the blackout. The public service-only
wrapper is called by `undoSeasonBlackoutAction` after tenant-admin authorization.
No financial provider action belongs to this transaction. The affected tables are
`sessions`, `schedule_occurrence_exceptions`, `season_schedule_change_events`,
`season_financial_adjustment_proposals` and `season_blackout_periods`.

### SQL-03 — stage lookup during resumable import

Function: `public.apply_import_chunk(uuid,uuid,uuid,uuid,jsonb)` (service-only invoker).
The local `program_id` selected from `programs.id` conflicts with
`program_stages.program_id`. Both the group and enrollment branches must match the
selected tenant/program and imported `stage_code`; they must not match every stage
with that code. `stage_id` receives `program_stages.id`. The RPC is called by the
existing import action after validation/claim, holds job/row locks, records manifest
entries and catches chunk errors for durable retry. Groups receive `stage_id`;
enrollments receive `current_stage_id`. Existing curriculum/version rules and
duplicate handling must remain unchanged. No theme data is part of this flow.

## Resolution and validation

The original inventory was completed and committed in `f830346` before any SQL
change. The implementation and runtime regressions are committed in `8b4f4c6`.
All three findings are **FIXED**; none was suppressed or classified as a false positive.
The [validation index](docs/audits/2026-09-13-sql-lint-pre-v42/validation.json)
records commands, outcomes and evidence hashes. Earlier failed attempts remain
separate evidence; their results were not rewritten as successful runs.

| Finding | Root cause and correction | Runtime evidence |
| --- | --- | --- |
| themeplanning — FIXED | Qualify the schedule projection, status filter and ordering with the schedule table alias. Preserve output fields, tenant locks, worker limit and per-row exception handling. | Planning replacement/cancellation; due versus future tenants; current/previous exact releases; failed activation isolated to its tenant; audit correlation; release rollback; replay; a locked row is skipped; two workers execute once. |
| blackout-undo — FIXED | Qualify the undo actor with the function's parameter scope. A normal publish/undo regression also exposed the existing booking trigger rejecting restoration while the same blackout remained published. Move the existing close operation immediately after the blackout lock, inside the same transaction. | A different undo actor is recorded without changing the publisher; exact affected session restored; history reversed rather than deleted; final invoices unchanged; cross-tenant refusal; overlapping closure causes full rollback; concurrent undo restores once; manually changed session status preserved; replay returns zero. |
| import-stage — FIXED | Label the existing PL/pgSQL block and qualify both group/enrollment stage lookups with its selected program ID. Re-running lint then exposed the same hidden identifier conflict for `participant_id` in the payment branch's subscription/enrollment queries; qualify those two references in the same function. | Same stage code in another program/tenant stays independent; group/enrollment use the selected stage; wrong-program stage is rejected; crash/restart and replay keep one graph/manifest; independent group rollback preserves the existing stage; payment references bind the selected participant; existing 5,000-row and compensation contracts rerun. |

The extra import diagnostic was `column reference "participant_id" is ambiguous`,
SQLSTATE 42702, body line 187 after the first edit; the original source references
are at lines 483 and 486 of the same import migration. It is the same source/scope
problem within SQL-03, previously hidden behind lint's first error in that function.
No new curriculum rule, stage/version selection rule, stable identifier or theme
mapping was introduced. This existing import resolves `program_stages` using the
tenant, selected program and imported code; versioned curriculum publication and
mapping stay under the existing canonical curriculum contracts.

### Initial 148-migration implementation and rollback impact

One CLI-generated forward-only migration:
`supabase/migrations/20260913175334_pre_v42_sql_identifier_ambiguities.sql`.
Total: **148 migrations**. All 147 canonical migration hashes remain identical.
The migration replaces three existing function bodies, preserves their signatures,
return shapes, invoker/definer mode, search paths and service-only grants, and
contains no table/column changes, data backfill, theme asset import or dependency update.
No applied historical migration was modified or removed.

The unchanged version-5 runtime handshake describes the existing 147-migration
minimum compatible schema. Keeping it unchanged permits rollback to the canonical
application. The release assertion separately pins the new artifact's complete
148-migration lineage to fingerprint
`9606805fdf875ef27b76986532a5e226c49e5e90d30358a5f3a58f921bd33417`,
while also validating the unchanged minimum-lineage fingerprint and all applied
migration versions. This does not relax the gate: a database with only 147 recorded
migrations is rejected even if its functions were corrected during local iteration.
Both the canonical main application and this candidate accept the upgraded
handshake. The canonical release assertion also passes against the upgraded schema.
The historical app floor and real compatibility anchor `12b4885` remain unchanged.

### Initial local validation at `8b4f4c6`

- Frozen dependency install; unchanged production policy and `pnpm audit --prod`: PASS, zero advisories. No package manifest or lockfile change.
- Typecheck, 464 unit contracts (zero failures/skips), production build and standalone packaging: PASS.
- Repository truth, Lovable baseline, auth, migration, RLS, Journey Bot, runtime environment, Sprint 31 and default migration-command checks: PASS.
- Legacy profile: reset to the canonical 147 migrations; actual live definitions and handshake compared with main; existing `db:migrate` applied only migration 148; all thirteen existing database checks passed.
- Secure-default profile: fresh install of all 148 migrations with automatic API exposure disabled and secure default grants; the same thirteen database checks passed.
- Each profile ran the nine SQL integration suites, planning/theme/undo concurrency, 20-way outbox deduplication/claims, provisioning transaction boundaries, 20/100-way onboarding contention, resumable import including 5,000 rows, certification/crash-window contracts and 102 API/storage assertions across six roles.
- The unchanged SQL lint command: PASS on both profiles with zero errors. Security advisors: PASS on both profiles. `plpgsql.variable_conflict` remains `error`; no lint directive, allowlist or global suppression was added.
- Live function ACLs, security mode, search paths and the full compatibility-handshake definition equal the canonical pre-change values on both profiles.

The first theme-test fixture selected an obsolete v2 release; the existing v3
activation trigger correctly rejected it. The fixture was corrected to select
existing published v3 releases before the baseline test reproduced SQLSTATE 42702.
The blackout baseline runtime test failed on the booking trigger before reaching
its separately reproduced identifier error. Both normal paths now pass.

### Existing import rollback limitation retained

An enrollment import automatically appends immutable swim lifecycle evidence.
The existing generic compensation path cannot delete that enrollment without
violating the append-only trigger, and returns `needs_attention`. The regression
proves this refusal is atomic and retains the imported graph, manifest, stage and
lifecycle evidence. Independent group and unprocessed payment compensation pass.
The failed initial expectation of automatic enrollment deletion is retained as
failed test evidence. Automatic removal of protected enrollment history was not
implemented; such imports still require explicit human reconciliation. This is an
existing domain safeguard/limitation, not a lint suppression or a claimed automatic
rollback success.

### Files and review scope

Runtime changes are limited to the two forward-only migrations and
`scripts/release/assert-runtime-schema-compatibility.mjs`. Regression coverage is
in `tests/sql/portal_theme_schedule_integration.sql`, the existing holiday SQL
suite, and the existing swim-canon, planning-concurrency and resumable-import runners.
All remaining changes are audit evidence. No V4.2 product code, importer, Default
integration, theme assets, portal redesign or dependency upgrade is included.

Post-merge main CI is certified in
[the baseline record](docs/audits/2026-09-13-post-reconciliation-main-baseline.md).
The featurebranch is published as [PR #58](https://github.com/nxttrack/platform/pull/58).
Web CI 34773973289 passed on `d8f523d`; its Codex review found the P1 below.
The exact final-head checks and review result are retained in the PR handoff. Native paths/package graph are unchanged; the existing Android
workflow's path filter does not require a new run for this SQL-only PR.

Technical references: [PostgreSQL variable substitution](https://www.postgresql.org/docs/current/plpgsql-implementation.html)
and [Supabase database lint](https://supabase.com/docs/reference/cli/supabase-db-lint).
The installed CLI help and Supabase changelog were checked; no dependency or
Postgres engine upgrade is part of this correction.

No deployment performed.
V4.2 has not started yet.

Evidence transcripts are normalized to LF with trailing whitespace removed for Git;
raw and normalized SHA-256 hashes are retained in the validation index. Test results
and failed-attempt history are unchanged.

## Codex P1 closure — subscription/enrollment identity

[Review thread](https://github.com/nxttrack/platform/pull/58#discussion_r4000448989),
reviewed head `d8f523d722740f5ecebc7814249a4c99679a1aee`.
The review found that the selected participant could have multiple active
enrollments, with an older enrollment's subscription cancelled. Independent
subscription/enrollment ordering could then create an internally inconsistent
imported payment. The strengthened regression reproduced the incorrect UUID.

Correction in `2ecf785`: read the enrollment ID from the selected subscription and
require that exact tenant/participant-bound enrollment to be active. An inactive
linked enrollment yields controlled `needs_attention`; it never falls back to
another active enrollment. Existing selection order, claim boundaries, accounting
fields and compensation semantics otherwise remain unchanged.

The already applied and committed migration 148 remains byte-identical. A second
CLI-generated forward-only migration,
`20260913182211_bind_import_payment_enrollment.sql`, replaces only the existing
import function with this correction. Total: **149 migrations**. The complete
artifact lineage is now pinned to
`6200db9c908722a4419071a5765f88134188d18a7879f5ecfd4dfe98af71034e`.
The canonical runtime handshake and ancestry anchor remain unchanged.

[Review closure evidence](docs/audits/2026-09-13-sql-lint-pre-v42/review-closure-validation.json)
records the complete rerun on code head `2ecf785`:

- Frozen install, production audit/policy (zero advisories), typecheck, all 464
  units, build, packaging and all repository/auth/migration/RLS/runtime audits: PASS.
- Legacy database: canonical 147 migrations; an actual import failed at the old
  stage lookup after committing its prior participant. Existing `db:migrate`
  upgraded it to 149, leaving that job and manifest unchanged. A normal claim and
  apply resumed the same import, skipped the existing participant, and completed
  exactly one group/enrollment graph with the correct stage and three manifest rows.
- Secure defaults: independent fresh install of all 149 migrations: PASS.
- Both profiles: all thirteen existing DB checks repeated, including the extended
  subscription/enrollment regression, nine SQL suites, concurrency, outbox,
  onboarding, 5,000-row import/restart/compensation, crash contracts and 102
  API/storage assertions per profile across six roles: PASS.
- Original SQL lint and security advisors repeated on both profiles: zero errors.
- Both current and canonical application health contracts accept the 149 schema;
  original ACLs/security settings and `variable_conflict=error` remain intact.
  The canonical application's release assertion also passes against 149.

The initial 148-migration runs above remain historical evidence of what they
actually executed. They are not substituted for these 149-migration runs.
Thread resolution is based on the failing-before/passing-after regression and
these complete reruns. Final-head Web CI and the fresh Codex review must also be
read from PR #58 before user merge. This task does not merge PR #58.
