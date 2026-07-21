# Sprint 1 - Release Candidate Evidence

Status: in progress.

Candidate baseline: `892da450a1f475944e4bc610fe12d572630bdbc1`

## Sprint Outcome

Name one staging SHA as an explicitly reviewed release candidate and make the strict staging gate pass with zero warnings.

## Evidence Already Complete

- [x] Canonical `main` and live staging expose candidate `892da45`.
- [x] CI passes for the candidate.
- [x] Health and database probe pass.
- [x] All 62 migrations are applied/audited.
- [x] Supabase Advisors report no issues.
- [x] Four-role RLS smoke passes.
- [x] Live Playwright passes: 42 checks.
- [x] Phase 16 operational seed and visibility flow passes.
- [x] All 56 Priority A screenshots are captured for the candidate.
- [x] Runtime rollback rehearsal is confirmed.
- [x] Logical backup/restore rehearsal restores 63 public tables and 65 rows with exact count parity.
- [x] Engineering visual review found no blocking responsive/layout regression after the canon parity pass.

Evidence runs:

- CI: <https://github.com/nxttrack/platform/actions/runs/29818488559>
- Staging deploy and strict gate: <https://github.com/nxttrack/platform/actions/runs/29818633729>
- Logical backup/restore: <https://github.com/nxttrack/platform/actions/runs/29818495140>
- Runtime rollback rehearsal: recorded by `ROLLBACK_REHEARSAL_CONFIRMED=true` in the staging environment.

## Product-Owner Visual Review

Review the 14 routes at mobile, tablet, desktop and wide dimensions. The deployment log contains compact contact sheets while GitHub artifact quota recalculates.

Decision matrix:

| Surface | Current engineering classification | Product-owner decision |
| --- | --- | --- |
| Tenant public home/programs/intake | Canon-aligned shell and hierarchy; real data/copy differs | Pending |
| Parent home/lessons/progress | Real child-first data model; localized routes and richer progress | Pending |
| Instructor home/group/student | Responsive operational flow; date-sensitive data is intentional | Pending |
| Admin dashboard/agenda/waitlist | Richer planning and placement workflow than static reference | Pending |
| Marketing home/swim schools | Branded editorial panels are coherent; approved photography remains optional | Pending |

Approval record:

```txt
Reviewed SHA: 892da450a1f475944e4bc610fe12d572630bdbc1
Product owner:
Review date:
Decision: approved / changes required
Accepted intentional differences:
Required fixes:
```

Do not set `LOVABLE_VISUAL_CHECK_CONFIRMED=true` until this record is completed with an approval decision.

## Infrastructure Backup Review

The logical application restore is proven. The infrastructure owner must verify the managed Supabase controls that a logical `public`/`app_private` dump does not cover.

- [ ] Staging project and plan are identified.
- [ ] Managed backup frequency and retention are recorded.
- [ ] Auth coverage/recovery behavior is understood.
- [ ] Storage object and metadata recovery behavior is understood.
- [ ] PITR availability and recovery window are recorded, or explicitly marked unavailable.
- [ ] Restore authority and escalation contact are named.
- [ ] Target recovery point/time objectives are accepted.

Confirmation record:

```txt
Supabase project:
Infrastructure owner:
Review date:
Backup frequency/retention:
Auth/Storage coverage:
PITR window:
RPO/RTO:
Decision: confirmed / changes required
```

Do not set `SUPABASE_BACKUPS_CONFIRMED=true` until this record is completed with a confirmation decision.

## Gate Closure

After both records are approved:

```bash
gh variable set LOVABLE_VISUAL_CHECK_CONFIRMED --env staging --body true
gh variable set SUPABASE_BACKUPS_CONFIRMED --env staging --body true
gh workflow run deploy.yml --ref main -f target=staging
```

Acceptance evidence:

```txt
Final candidate SHA:
Strict gate run:
Gate result: 0 failures, 0 warnings
Sprint accepted by:
Acceptance date:
```

## Remaining Sprint Tasks

- [ ] Complete and record product-owner visual decision.
- [ ] Complete and record Supabase managed-backup decision.
- [ ] Resolve or wait out GitHub artifact quota recalculation and verify a compact artifact can upload.
- [ ] Set the two environment confirmations truthfully.
- [ ] Rerun staging and record a 0-warning strict gate.

