# Production-readiness certification — Sprint 2

Status: **PRIMARY LOCAL CERTIFICATION VERIFIED — general audit remains NO-GO**
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

All six certification migrations, beginning with
`20260822225251_production_readiness_certification.sql`, were generated with the
repository-pinned Supabase CLI and are additive.

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
| CERT-008 | High | A local `platform_admin` JWT with no Tenant B membership → permissive `current_user_can_manage_tenant_domain` branch → direct PostgREST `PATCH participants` in Tenant B. The first role-matrix run changed the synthetic row and failed red. | A compromised platform-admin browser session could directly mutate tenant-domain records outside a service-routed, audited command path. | CODE-SIDE CLOSED: a second additive migration adds a client-role mutation guard to the certification boundaries. Platform roles require an explicit active owner/admin/staff membership for direct writes; reads and `service_role` paths remain separate. The same Data API attack is now a controlled error. |
| CERT-009 | Medium | Durable outbox payload → `parseTransactionalEmailPayload` accepted `subject="Safe\r\nBcc: ..."` → SendGrid JSON received the raw subject (SMTP happened to sanitize later). The new executable parser test failed red with the injected subject returned as valid. | Provider-dependent header manipulation or malformed outbound mail. | CODE-SIDE CLOSED: payload validation is now a pure tested boundary; subject/from/organization header fields reject C0/DEL controls. Poison, malformed recipient, oversized recipient/subject/body and CRLF cases fail while bounded Unicode remains valid. |
| CERT-010 | Medium | Service-routed enqueue → byte-exact but unconstrained key → uppercase, leading/trailing whitespace and Unicode-suffix variants each inserted a new provider-effect row. The crash suite failed red on the first variant. | A malformed retry/caller could bypass intended email dedupe and cause duplicate external effects. | CODE-SIDE CLOSED: additive canonical lowercase-ASCII key constraint plus trigger; existing noncanonical rows are reported by preflight and never auto-rewritten. Exact replay dedupes; exact key/different payload and every variant fail. |
| CERT-011 | High readiness | New artifact → `/api/health` → only `tenants` count probe. Against a reachable pre-Sprint-1 schema the probe passed even though the artifact requires new transactional RPCs; there was also no global application no-write switch. | An incompatible release could be activated as healthy, while an emergency rollback had no mechanical containment for server actions, webhooks or internal POST workers. | CODE-SIDE CLOSED: additive service-only schema handshake, exact release/deploy assertion, health 503 on mismatch, app-wide unsafe-method maintenance gate, forced-off certification-preview workers/mail/newsletters and a read-only application-forward rehearsal. |
| CERT-012 | Low hardening | Legacy-default clean room → four `app_private` invoker trigger functions created without an explicit revoke → inherited direct `PUBLIC` EXECUTE. Client roles lacked `USAGE` on `app_private`, so no executable Data API attack path was confirmed. | Unnecessary latent privilege that could become reachable after an unrelated future schema grant. | CODE-SIDE CLOSED: the additive correction explicitly revokes all client/service direct execution; trigger invocation remains functional. Secure-default reports zero and legacy reports only two intended public compatibility functions. |
| CERT-013 | High integrity | Import invitation creation resolved `invited_user_id` before membership materialization → `materialize_import_guardian_invitation` treated Auth lineage alone as completed → returned `outcome=ready` with `membershipId=null`. A fresh clean-room regression failed red on the pre-existing-membership conflict. | Import could record false identity completion, skip the membership bind and leave the guardian/job in inconsistent reconciliation state. | CODE-SIDE CLOSED: completion now requires the exact invitation-owned membership; a matching Auth-only binding continues through create-only materialization, while any pre-existing tenant parent membership fails without mutation. Both grant profiles pass the adversarial and 5,000-row import suites. |
| CERT-014 | Medium readiness | Full `hardening:local` → `release:audit-sprint31` → required deleted `rollbackSignature`/`timingSafeEqual` tokens in application import code. The gate failed after all preceding suites passed. | CI/deploy hardening could not certify the stronger Sprint 1 durable database rollback implementation, encouraging accidental reintroduction of the obsolete process-local contract. | CODE-SIDE CLOSED: the audit now requires the actual claim/apply/complete and claim/rollback/complete RPC surfaces plus `import_manifest_entries`; the full hardening chain is rerun after the change. |
| CERT-015 | Medium readiness | First exact-SHA staging dispatch → read-only preflight → three naturally expired invitations still stored as `pending` were grouped with accepted invitations lacking Auth lineage. The release stopped before migration. | A safe additive migration was blocked by a normal lazy-expiry state that application and database acceptance paths already reject and atomically mark expired on use. | CODE-SIDE CLOSED: accepted-without-user/timestamp remains a hard blocker; expired pending capability rows are separately reported as PII-free operator warnings and are never repaired by preflight. A red-to-green unit plus synthetic expired-row preflight proves PASS-with-warning; the original records are untouched. |
| CERT-016 | Medium readiness | First staging dispatch → package install/preflight log → self-hosted runner used Node `24.17.0` despite the repository engine floor and certified toolchain being `24.18.0`. | Deployment evidence was produced under an unsupported runtime and could diverge from local/CI artifacts. | CODE-SIDE CLOSED: the deploy job now installs and asserts exact Node `24.18.0` and pnpm `10.24.0` before any Node audit, install or build. Static workflow regression is green. |

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
145 because all six certification corrections are additive, CLI-generated
migrations; the four pushed Sprint 1 files remain byte-for-byte unchanged.

| Profile | Empty-stack start | Migration application | Result |
| --- | --- | --- | --- |
| Legacy auto-grants (`api.auto_expose_new_tables=true`) | 2026-08-23 00:24:11 UTC | 2026-08-23 00:24:11–00:31:17 UTC | 145/145 exact, no repair/error |
| Secure default (`auto_expose_new_tables` absent/false plus PostgreSQL default-privilege revocation) | 2026-08-23 00:23:01 UTC | 2026-08-23 00:23:51–00:31:17 UTC | 145/145 exact, no repair/error |

The secure fixture explicitly revokes the PostgreSQL default `PUBLIC EXECUTE` as
well as Data API table/sequence/function defaults before application migrations.
That global function revocation is required because a schema-specific default is
additive and cannot remove PostgreSQL's built-in `PUBLIC EXECUTE` default.

Both profiles have the same application inventory: 251 `public` tables, all with
RLS and FORCE RLS; 268 `public`/`app_private` functions; 264 user triggers; 926
public indexes; 2,621 public constraints; and five exact private buckets
(`badge-studio-assets`, `diploma-vault`, `participant-media`, `tenant-documents`,
`tenant-media-assets`). Storage has only the two clean scoped read policies and the
restrictive child-session policy. Eleven critical mail/provision/import/runtime RPC signatures
are explicitly denied to `anon`/`authenticated` and executable by `service_role`.

A transaction-rolled-back post-migration sentinel proves the intended difference:

| New object privilege | Legacy | Secure default |
| --- | --- | --- |
| `anon` table SELECT | allowed | denied |
| `authenticated` table INSERT | allowed | denied |
| `anon` function EXECUTE | allowed | denied |
| Any installed `public`/`app_private` function executable by `PUBLIC` or `anon` | 2 compatibility functions | 0 |

All six focused DB integrations (email outbox, atomic provisioning, core
onboarding, 5,000-row resumable import, certification adversarial and crash-window cases) pass on
both builds. A production app artifact started against each stack and `/api/health`
reported `ok=true`, database and schema-compatibility pass, and the expected
certification source. This is local compatibility evidence, not a live claim.

Final clean-room re-certification gate: 428/428 unit tests, typecheck, production build, Auth
audit, 145-file migration audit, 251-table RLS audit, production dependency audit,
both clean-room grant audits and `git diff --check` are VERIFIED LOCAL.

## Checkpoint 3 — base-to-head upgrade rehearsal and preflight

VERIFIED LOCAL with a reproducible fixture and read-only fail-closed preflight.
The base project was built from migration files obtained directly from Git object
`68d4a79ccdc3ede3691bf1ec1782fb8f81c05466`; its history contained exactly 135
rows ending at `20260812120000`. The fixture then added two tenants and twelve Auth
identities covering owner/admin/staff/instructor/parent/child, plus profiles,
memberships, participants, guardians, enrollments, active/trial group membership,
queued invitations, incomplete onboarding, legacy import rollback data, queued and
failed mail evidence, five buckets and representative import audit events.

On the clean fixture the new `db:preflight-production-readiness-upgrade` command
returned PASS before mutation. It reported the two intentionally incomplete draft
onboarding runs and two legacy mail attempts as operator warnings, but found no
index blocker, manifestless active import, conflicting legacy key, broken Auth
lineage, expired lease, grant anomaly, bucket anomaly or fingerprint mismatch.

Only the four byte-frozen Sprint 1 migrations were then applied, in timestamp order:
the history advanced 135→139 with no error. Both tenants, all twelve memberships,
both participants and both group memberships remained. The original outbox,
provisioning, core-write and 5,000-row import DB integrations all passed on this
upgraded database. The additive certification migration was applied separately
(139→140); its adversarial integration and the preflight then also passed. A
production application artifact started against this upgraded fixture and strict
`/api/health` returned `ok=true`, database pass in 35 ms and the expected local
certification SHA.

The blocked fixture deliberately contains one duplicate active/trial membership,
one applying import without a durable manifest, two legacy runs sharing an
idempotency key with different payloads, one accepted invitation without an Auth
user and one expired outbox worker lease. To make the last condition representable,
only the first (outbox) migration was present in that fixture; the dangerous group
unique-index migration had not run. Preflight returned BLOCKED/exit 2 and emitted
only UUIDs, states, counts and fingerprints—no email, name or payload. A readback
afterward proved history remained exactly 136, all three later Sprint 1 migrations
and the corrective migration remained unapplied, the three membership rows remained
and the import was still `applying`. No customer data was repaired or deleted.

The preflight uses `BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ`, rolls back on
exit, fingerprints all four immutable migrations, tolerates objects that do not yet
exist at base, and conditionally tightens its grant/lease checks as migrations become
present. Static regressions enforce every blocker class and prohibit a customer-data
delete path in the preflight.

Checkpoint regression gate: 420/420 unit tests, typecheck, production build, Auth
audit, 140-file migration audit, 251-table RLS audit, production dependency audit,
the clean/blocked rehearsals and `git diff --check` are VERIFIED LOCAL.

## Checkpoint 4 — local Data API tenant/role attack matrix

VERIFIED LOCAL against the secure-default full Supabase stack, using HTTP calls to
PostgREST/Storage rather than relying on direct PostgreSQL role simulation. JWTs
were locally signed for synthetic users only. The matrix covers Tenant A and B
owner, admin, staff, instructor, parent and child (`athlete`), plus anon, a stale
subject, a suspended membership, platform admin/support and the service role.

The first matrix run exposed CERT-008: a platform admin without any tenant
membership successfully changed the Tenant B participant through PostgREST. After
the red reproduction, CLI migration
`20260822233930_restrict_platform_only_tenant_mutations.sql` added one fixed-path
client-role trigger boundary across onboarding, invitations/memberships, participant
graph, intake, groups, imports, outbox/operation ledgers and Storage metadata. It
does not run for `service_role`; a platform identity can write directly only when it
also has an explicit active tenant owner/admin/staff membership. Historical
migrations and the broad platform read model were not rewritten.

The green matrix executed 102 Tenant A→B table or Storage-prefix attacks across all
six Tenant A roles. It covered onboarding runs/events, invitations/memberships,
outbox/events, participants/guardians/enrollments, intake submissions/answers,
group memberships, import jobs/rows/manifest, Storage object paths and platform
audit events. No Tenant B row or object was returned or changed. Modified
`x-tenant-id` and `x-forwarded-host` headers did not alter the JWT-bound result.

Additional green cases prove:

- anon, missing, stale and suspended contexts return controlled empty/deny results;
- authenticated outbox SELECT is RLS-denied while direct UPDATE is independently
  grant-denied; import state and operation-ledger mutations are also grant-denied;
- platform admin/support cannot directly mutate tenant participants without tenant
  membership;
- a mixed-Tenant A/B group membership fails explicitly at the RLS/FK boundary;
- anon and all six authenticated roles cannot invoke the service-only outbox claim;
- client calls to participant-graph, intake and group-placement RPCs with Tenant B
  targets fail explicitly;
- the service-routed Data API can read the exact Tenant B fixture and execute the
  claim RPC;
- reuse of one outbox idempotency key with a different payload fails explicitly.

No request body, email address, JWT, secret or personal field is logged by the test.

Checkpoint regression gate: 421/421 unit tests, all five focused DB integrations,
the 141-migration secure grant audit, typecheck, production build (17 static pages),
Auth audit, migration/RLS audits, production dependency audit and `git diff --check`
are VERIFIED LOCAL.

## Checkpoint 5 — failure and crash windows

VERIFIED LOCAL with synthetic database/provider-boundary evidence. The new crash
suite and strengthened existing integrations prove:

- 100 concurrent workers claim 100 due outbox rows exactly once each; the existing
  20-worker/single-row race also remains green;
- an external-acceptance marker followed by a worker crash leaves the row visibly
  `processing`; after forced lease expiry a second claim records `lease_recovered`,
  increments the attempt and fences the old completion token;
- future work is not claimed early, retry delay rejects 86,401 seconds and accepts
  the 86,400-second maximum, while limit/lease bounds fail explicitly;
- advisory-lock contention obeys a 150 ms statement timeout and becomes usable
  after release; a real two-row reverse-lock deadlock aborts exactly one transaction
  with PostgreSQL `40P01`, after which both rows remain unmodified;
- an exact outbox key replays one row and conflicts on different payload; uppercase,
  leading/trailing whitespace and Unicode variants are rejected by migration
  `20260822235045_canonical_email_outbox_idempotency_keys.sql`;
- the payload parser rejects non-objects, arrays, invalid/oversized recipients,
  501-character subjects, 65,537-character bodies and CRLF header injection while
  preserving a safe bounded Unicode subject;
- all seven provisioning failure steps leave zero partial graphs; 20 duplicate
  submits produce one graph. The explicit post-commit fixture has two existing Auth
  users, zero memberships, two pending identities and two blocked outbox rows, then
  resumes idempotently through materialization/opening;
- duplicate intake remains 20-way idempotent; one-seat capacity is now proven under
  both 20 and 100 concurrent commands (one placement, respectively 19 and 99 durable
  controlled results, one audit);
- import double-apply is idempotent, an injected middle-chunk crash preserves the
  prior committed manifest and retries the failed chunk without duplicates, and a
  5,000-row import remains exactly 20 bounded RPC chunks;
- import rollback refuses both `processing` and `accepted` invitation mail, retains
  all manifest evidence, keeps the failure atomic and preserves the shared Auth user
  plus its active membership in another tenant.

Provider exactly-once is **not claimed**. If a provider accepts and the worker dies
before the database completion, no transactional protocol can prove from the local
database whether resending is safe. The supported contract is at-least-once with a
bounded lease, token fencing, attempt/event history and a visible reconciliation
window. `accepted_at` means provider acceptance only; `delivered_at` remains null
until separate evidence exists. No real provider was contacted.

The canonical-key migration adds its check as `NOT VALID`, enforces it immediately
for new writes and validates it automatically only when no legacy violations exist.
Otherwise the read-only preflight blocks with UUID/count evidence; it never trims,
lowercases or deletes existing data.

Checkpoint regression gate: 422/422 unit tests; the focused outbox,
provisioning, onboarding, resumable-import, certification, crash-window and
102-case tenant-matrix database integrations; typecheck; Auth audit; all 142
migration files; 251-table RLS audit; production dependency audit; production
build (17 static pages); and `git diff --check` are VERIFIED LOCAL.

## Checkpoint 6 — rollback and compatibility

VERIFIED LOCAL. The previous allowed application is the exact Sprint 1 target
`4e3784649767be4c197db624b33995b3d1502f65`; the older audit basis
`68d4a79ccdc3ede3691bf1ec1782fb8f81c05466` is intentionally not an allowed
rollback artifact because it still contains the replaced non-transactional import
and onboarding write paths.

Migration `20260823000225_runtime_schema_compatibility_contract.sql`, rolled forward
by the later additive corrections, publishes one immutable, service-only contract
with version 3, minimum compatible app SHA
`4e3784649767be4c197db624b33995b3d1502f65`, required migration
`20260823002720`, and minimum-schema fingerprint
`761d27a977c53c6037c4408b2064557b80b1c301107195c9065f748ef730fff3` (SHA-256
over the ordered 145-migration minimum lineage). `anon` and `authenticated` are
grant-denied through the local Data API; `service_role` receives the one expected
row.

The three executable artifact/schema combinations produced:

| Combination | Result |
| --- | --- |
| New 145-migration schema + newly built certification artifact | HTTP 200; database `pass`; schema compatibility `pass` |
| New schema + freshly frozen-installed/built `4e378…` artifact | HTTP 200; database `pass`; all 17 Sprint 1 transactional RPC names retained |
| Newly built certification artifact + old 140-migration schema | HTTP 503; database connectivity still `pass`; schema compatibility explicitly `fail` |

The local `release:rehearse-application-forward-rollback` command opens both
databases in repeatable-read, read-only transactions. It proved in 95 ms that all
3,751 old public column/type contracts and the 17 previous-app transactional RPCs
remain available, the old schema lacks the new handshake, and pending work remains
unchanged (`email=15`, `import=3`, `identity=2`). No schema migration, schema drop,
history repair or job mutation occurs in the rehearsal.

Containment requires and checks exact values
`MAINTENANCE_NO_WRITE=true`, `EMAIL_SENDING_ENABLED=false`,
`NEWSLETTER_DELIVERY_ENABLED=false`, and `INTERNAL_JOBS_ENABLED=false`. With the
new production build, GET `/api/health` remained available while POST was rejected
as `503 maintenance_no_write` before session/database work. This application gate
does not replace Data API grants/RLS; those remain independently covered by the
102-case matrix.

The deployment workflow now blocks certification-preview activation unless the
full 40-character input SHA equals the selected branch HEAD, the target is staging,
the read-only customer-data preflight passes, every pending migration belongs to
the ten-entry Sprint 1/certification allowlist, and the post-migration schema
contract matches. Migration-history repair is explicitly forced off. For this
preview it mechanically forces maintenance, mail,
newsletter and internal workers to their safe values. Production promotion remains
outside this certification path.

Checkpoint regression gate: 428/428 units including 6/6 dedicated red-to-green compatibility tests,
application-forward rehearsal, three built-artifact HTTP probes, 102-case Data API
matrix including the new RPC grants, typecheck, production build (17 static pages),
runtime-environment audit, all 145 migration files, 251-table RLS audit and
`git diff --check` are VERIFIED LOCAL.

## Full regression and external boundaries

The primary local Definition of Done is complete. The final repository-wide gate
used a frozen install and passed the complete `hardening:local` chain after
CERT-014 was fixed. Its component evidence includes 429/429 unit tests with zero
failed, skipped or todo; TypeScript typecheck; Auth contract audit; runtime
environment audit; 145-file migration-history audit; 251-table RLS/FORCE-RLS
audit; all release/hardening audits; production build with 17 static pages;
standalone packaging; and the staging-gate audit. The staging gate reported zero
failures and nine explicitly external confirmations. `release:truth`, the design
audit, 53 swim-canon tests, 27 parent/child portal tests, the migration no-op path,
and `git diff --check` also pass after the final deployment-workflow hardening.

As stretch evidence, the public/auth-boundary Playwright smoke runs locally against
the synthetic secure-default stack on desktop and mobile: 40/40 passed. All three
repository shell scripts pass `bash -n`. Actionlint parsed every workflow and found
no YAML/expression error in the certification change; it reports only established
custom-runner-label warnings and pre-existing shellcheck notices.

The local database evidence comprises two 145-migration clean rooms, the clean and
blocked base-to-head rehearsals, six focused integrations under both grant
profiles, the 102-case Data API matrix, failure/crash-window integrations and the
read-only rollback rehearsal. No test was removed, weakened or converted to a
skip. No customer data or real provider was used.

The certification deployment path is restricted to staging and an exact
40-character branch-HEAD SHA. It forces migrations on, repair off, global
maintenance/no-write on and all effect workers off; runs the read-only preflight
before migration; allows only the ten expected Sprint 1/certification migration
versions; asserts the runtime/schema handshake before activation; and skips the
legacy Phase 16 mutating fixture. Production is not reachable through this branch
exception.

The following remain **NOT TESTED EXTERNAL** unless a later deployment record says
otherwise: real Auth-user creation and recovery, real SendGrid delivery and
provider webhooks, billing/payment providers, live Supabase backup/restore and
five-bucket object checksum reconciliation, the full 64-case hosted Playwright
matrix, GitHub artifact retention/readback, and any production environment. These
external gates keep the general production-readiness audit at **NO-GO**.
