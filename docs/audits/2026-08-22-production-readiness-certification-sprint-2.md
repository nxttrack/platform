# Production-readiness certification — Sprint 2

Status: **IN PROGRESS — general audit remains NO-GO**  
Certification target: `4e3784649767be4c197db624b33995b3d1502f65`  
Audit base: `68d4a79ccdc3ede3691bf1ec1782fb8f81c05466`  
Certification branch: `codex/production-readiness-certification-sprint-2`  
Evidence vocabulary: `VERIFIED LOCAL`, `CODE-SIDE CLOSED`, `NOT TESTED EXTERNAL`, `BLOCKED`, `FAILED`

This is an independent local certification. It does not promote the Sprint 1
claims, does not certify a live environment and does not turn the general
production-readiness audit into GO. Unless a later section explicitly records a
staging action requested after the original brief, all evidence is from synthetic,
disposable local systems.

## Immutable inputs and isolation

- The certification worktree was created at exact target SHA on the requested
  branch. The original checkout and its unrelated untracked files were left alone.
- Reviewed diff: 110 files, 6,685 insertions and 668 deletions.
- No repository `AGENTS.md` or `SECURITY.md` was present.
- The four pushed Sprint 1 migrations were not edited or renumbered. Their SHA-256
  fingerprints at audit start are:

| Migration | SHA-256 |
| --- | --- |
| `20260822002234_production_email_outbox.sql` | `a41443e10ebb53934ba6403552fbdad9174bbdd394c446caac87cfc745514b42` |
| `20260822004329_atomic_tenant_provisioning.sql` | `b6c4a1dc74ff0813c47a58ad195b86b065b7db1d13144467129b224b94925816` |
| `20260822010612_atomic_core_onboarding_writes.sql` | `352ba1dba8bc393228719959cbbbf7725d217d2b6210ca88b299b0014572a433` |
| `20260822012255_resumable_import_apply_rollback.sql` | `6997c62c3ab1f35fdb7e1c2106c292081cb05231422ca255756af0b9eb0764e2` |

The corrective migration
`20260822225251_production_readiness_certification.sql` was generated with the
repository-pinned Supabase CLI and is additive.

## Toolchain and untouched baseline

| Component | Version/result |
| --- | --- |
| Node.js | `24.18.0` |
| pnpm | `10.24.0` |
| Supabase CLI | `2.109.1` (repository-pinned) |
| Docker / Compose | `29.6.2` / `5.3.1` |
| PostgreSQL client / local Supabase server | `16.14` / `17.6` |
| Frozen install | VERIFIED LOCAL, lockfile unchanged |
| Unit suite before certification edits | 413 passed, 0 failed/skipped/todo |
| Typecheck, build, auth audit, migration audit, RLS audit | VERIFIED LOCAL |
| Dependency audit | VERIFIED LOCAL, no reported vulnerabilities |

The historical Sprint 1 validation database also passed the pre-edit email
outbox, provisioning, core onboarding and resumable-import integration suites.
That establishes a baseline only; it is not clean-room evidence.

## Checkpoint 1 — adversarial diff review

Every changed file in `68d4a79..4e378464` was inventoried. The review split SQL,
RLS/grants, Auth/mail/import runtime and CI/restore/rollback surfaces, then traced
findings back through their actual callers and policies. SECURITY INVOKER/DEFINER,
fixed `search_path`, direct grants, FORCE RLS, tenant binding, key reuse,
lock/lease behavior, PII logging, Amsterdam-date conversion and workflow source
truth were explicitly checked.

### Finding register

| ID | Severity | Source → sink and reproduction | Impact | Fix and regression proof |
| --- | --- | --- | --- | --- |
| CERT-001 | High | Authenticated tenant-admin Data API role → legacy `FOR ALL` policy and table privileges → direct `UPDATE`/`DELETE import_jobs`. A transactional reproduction forged `apply_attempts=99` and `rollback_state=completed`; deleting the job cascaded into `import_manifest_entries`. | A client could bypass the service-only lease/state machine and erase durable reconciliation evidence for its tenant. | CODE-SIDE CLOSED: additive migration revokes client mutation privileges on jobs, rows and events. Integration test proves update/delete are denied while service RPC execution remains available only to `service_role`. |
| CERT-002 | High | Tenant A guardian CSV name → `materialize_import_guardian_invitation` → `profiles ... ON CONFLICT DO UPDATE full_name`. A local reproduction changed an existing Tenant B user's global name to Tenant A input before invitation acceptance. | Cross-tenant identity-integrity violation. | CODE-SIDE CLOSED: existing profiles use `ON CONFLICT DO NOTHING`; cross-tenant fixture proves the canonical name remains unchanged. |
| CERT-003 | High | Guardian import targeting a pre-existing suspended/invited membership → membership upsert → manifest marked `created_by_import=false` and already compensated. Reproduction changed the old membership to invited and replaced its invitation while rollback had no restoration record. | Silent corruption of pre-import membership state. | CODE-SIDE CLOSED: materialization is create-only and fails into visible reconciliation if the same tenant/user/role already exists. The regression test proves status/invitation/profile remain unchanged. |
| CERT-004 | High | Tenant-admin import rollback → deletion of an import-created participant/group → repository-wide `ON DELETE CASCADE` relations. A later notification attached after import was deleted by the original rollback path. | Rollback could destroy legitimate post-import data outside its ownership manifest. | CODE-SIDE CLOSED: generated participant-guardian links are now explicitly manifested; transaction-local FK guards refuse parent deletion when any unmanifested dependent remains. Tests prove owned-child rollback succeeds and later data is preserved with `needs_attention`. |
| CERT-005 | Medium | Recipient/staff Data API update privileges → newly added `provider_accepted_at`/`accepted_at` columns on existing writable tables. | Client roles could forge provider-acceptance audit evidence. | CODE-SIDE CLOSED: client-role insert/update triggers fence the evidence columns on invitations, notifications, slot offers and delivery attempts without weakening existing business-row policies. |
| CERT-006 | High | Worker claims up to 25 messages with one shared start time → sequential provider calls (15–60 seconds each) → later leases expire before first send; another worker may reclaim and send the same message. The claim-token check occurs only after provider I/O. | Duplicate external email and misleading reconciliation. | CODE-SIDE CLOSED: claim exactly one immediately before provider I/O; lease is at least provider timeout plus a bounded completion margin. Static regression and concurrent DB claim suite are green. External providers remain at-least-once, never exactly-once. |
| CERT-007 | High readiness | Upgrade applies the new live-membership unique index directly, but no preflight existed for legacy active/trial duplicates. The duplicate fixture blocks index creation. | Uncontrolled staging migration failure after deployment begins. | Fix is assigned to Checkpoint 3: read-only fail-closed preflight before any migration mutation; customer data is never auto-repaired. |

No credible SQL injection, unsafe SECURITY DEFINER search path, cross-tenant
idempotency-key bypass, PII-bearing error log, Amsterdam date regression or
workflow source-SHA substitution was confirmed in the reviewed change set.

### Red → green evidence for confirmed fixes

Before implementation, `tests/unit/production-readiness-certification.test.ts`
ran 5 tests and failed all 5. After the additive migration and worker change it
passes 5/5. The focused database integration additionally proves:

- client import-state update/delete denial;
- immutable provider evidence with ordinary notification read updates still allowed;
- existing same-tenant membership conflict without mutation;
- cross-tenant global-profile preservation;
- explicit ownership/compensation of generated guardian links;
- fail-closed preservation of later dependent data.

The existing email outbox, tenant provisioning, core onboarding and resumable
import integrations all remain green against a disposable clone with the
corrective migration applied. The resumable import suite includes 5,000 rows in
20 chunks; core capacity includes a 20-way one-seat race; provisioning and outbox
each retain their 20-way contention proofs.

Checkpoint regression gate: 418/418 unit tests, typecheck, production build (17
static pages), Auth audit, 140-file migration audit, 251-table RLS audit,
production dependency audit and `git diff --check` are VERIFIED LOCAL. No skip or
test weakening was introduced.

## Checkpoint 2 — clean-room migration builds

VERIFIED LOCAL for both required grant profiles. Each project started as an empty
full local Supabase stack before repository migrations were introduced or applied.
No dump, repair command, pre-existing schema or hand-created application object was
used. The repository now includes `db:audit-clean-room`, which compares every
`version`/`name` row in `supabase_migrations.schema_migrations` with the sorted SQL
files and performs the remaining assertions below without retaining sentinel data.

The target originally contained 139 migrations. Both final clean-room builds apply
140 because the certification fix is an additive, CLI-generated migration; the
four pushed Sprint 1 files remain byte-for-byte unchanged.

| Profile | Empty-stack start | Migration application | Result |
| --- | --- | --- | --- |
| Legacy auto-grants (`api.auto_expose_new_tables=true`) | 2026-08-23 23:04:59–23:05:38 CEST | 2026-08-23 23:06:08–23:06:15 CEST | 140/140 exact, no repair/error |
| Secure default (`auto_expose_new_tables` absent/false plus PostgreSQL default-privilege revocation) | 2026-08-23 23:08:35–23:09:13 CEST | 2026-08-23 23:10:27–23:10:34 CEST | 140/140 exact, no repair/error |

The secure fixture explicitly revokes the PostgreSQL default `PUBLIC EXECUTE` as
well as Data API table/sequence/function defaults before application migrations.
That global function revocation is required because a schema-specific default is
additive and cannot remove PostgreSQL's built-in `PUBLIC EXECUTE` default.

Both profiles have the same application inventory: 251 `public` tables, all with
RLS and FORCE RLS; 265 `public`/`app_private` functions; 245 user triggers; 926
public indexes; 2,620 public constraints; and five exact private buckets
(`badge-studio-assets`, `diploma-vault`, `participant-media`, `tenant-documents`,
`tenant-media-assets`). Storage has only the two clean scoped read policies and the
restrictive child-session policy. Ten critical mail/provision/import RPC signatures
are explicitly denied to `anon`/`authenticated` and executable by `service_role`.

A transaction-rolled-back post-migration sentinel proves the intended difference:

| New object privilege | Legacy | Secure default |
| --- | --- | --- |
| `anon` table SELECT | allowed | denied |
| `authenticated` table INSERT | allowed | denied |
| `anon` function EXECUTE | allowed | denied |
| Any installed `public`/`app_private` function executable by `PUBLIC` or `anon` | 6 compatibility functions | 0 |

All five focused DB integrations (email outbox, atomic provisioning, core
onboarding, 5,000-row resumable import and certification adversarial cases) pass on
both builds. A production app artifact started against each stack and `/api/health`
reported `ok=true`, database pass (34 ms legacy, 32 ms secure) and the expected
certification source. This is local compatibility evidence, not a live claim.

Checkpoint regression gate: 418/418 unit tests, typecheck, production build, Auth
audit, 140-file migration audit, 251-table RLS audit, production dependency audit,
both clean-room grant audits and `git diff --check` are VERIFIED LOCAL.

## Checkpoint 3 — base-to-head upgrade rehearsal and preflight

Pending.

## Checkpoint 4 — local Data API tenant/role attack matrix

Pending.

## Checkpoint 5 — failure and crash windows

Pending.

## Checkpoint 6 — rollback and compatibility

Pending.

## Full regression and external boundaries

Pending.
