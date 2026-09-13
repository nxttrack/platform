Canonical baseline:
77c22b1cb10833811c0552b3160fcef1844c6368

# FASE 0.2 — SQL lint ambiguities before V4.2

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

Investigation in progress. No SQL change or new migration existed when the above
inventory was completed. No finding is marked PASS/FIXED before regression proof.

No deployment performed.
V4.2 has not started yet.
