# Sprint 1 - Release Candidate Evidence

Status: in progress.

Security-maintenance application baseline: `c8bf0a5f8c6b8930a1067f51a55deda0b62af60d`

## Sprint Outcome

Name one staging SHA as an explicitly reviewed release candidate and make the strict staging gate pass with zero warnings.

## Evidence Already Complete

- [x] Live staging exposes maintenance candidate `c8bf0a5`, which is contained in canonical `main` history.
- [x] CI passes for the candidate.
- [x] Health and database probe pass.
- [x] All 63 migrations are applied/audited.
- [x] Supabase Advisors report no issues.
- [x] Four-role RLS smoke passes.
- [x] Live Phase 15 Playwright passes: 52 checks.
- [x] Phase 16 operational seed and visibility flow passes.
- [x] All 56 Priority A screenshots are captured for the candidate.
- [x] Runtime rollback rehearsal is confirmed.
- [x] Logical backup/restore rehearsal restores 63 public tables and 65 rows with exact count parity.
- [x] Engineering visual review found no blocking responsive/layout regression after the canon parity pass.

Evidence runs:

- CI: <https://github.com/nxttrack/platform/actions/runs/29871535514>
- Staging deploy, browser evidence and strict gate: <https://github.com/nxttrack/platform/actions/runs/29871694124>
- Approved baseline CI: <https://github.com/nxttrack/platform/actions/runs/29912642269>
- Approved baseline staging deploy, 56-screen capture and browser validation: <https://github.com/nxttrack/platform/actions/runs/29912854831>
- Security maintenance CI: <https://github.com/nxttrack/platform/actions/runs/29966467895>
- Security maintenance staging deploy, 56-screen capture and expected manual-gate stop: <https://github.com/nxttrack/platform/actions/runs/29966623671>
- Logical backup/restore: <https://github.com/nxttrack/platform/actions/runs/29818495140>
- Runtime rollback rehearsal: recorded by `ROLLBACK_REHEARSAL_CONFIRMED=true` in the staging environment.

## Product-Owner Visual Review

Review the 14 routes at mobile, tablet, desktop and wide dimensions. The deployment log contains compact contact sheets while GitHub artifact quota recalculates.

Decision matrix:

| Surface | Current engineering classification | Product-owner decision |
| --- | --- | --- |
| Tenant public home/programs/intake | Canon-aligned shell and hierarchy; real data/copy differs | Approved |
| Parent home/lessons/progress | Real child-first data model; localized routes and richer progress | Approved as intentional difference |
| Instructor home/group/student | Responsive operational flow; date-sensitive data is intentional | Approved as intentional difference |
| Admin dashboard/agenda/waitlist | Richer planning and placement workflow than static reference | Approved as intentional difference |
| Marketing home/swim schools | Branded editorial panels are coherent; approved photography remains optional | Approved; photography remains a follow-up |

Approval record:

```txt
Reviewed SHA: 02fde48a197a72e80c624adee3ccddc836852807
Product owner: Danny Goldenbelt
Review date: 2026-07-23
Decision: approved

Accepted intentional differences:
- The parent and admin surfaces are richer and more data-driven than the Lovable reference.
- Marketing uses editorial graphic panels for now; final photography is a follow-up.
- Planning and waitlist contain more extensive operational workflows than the static canon.
- The quiet instructor state and staging data density are intentional.

Required fixes before release candidate:
- None; no visual blocker.

Non-blocking follow-ups:
- Final photography and marketing copy.
- More compact mobile admin workflows.
- Better use of wide desktop space.
- Production-ready demo and seed names.
```

`LOVABLE_VISUAL_CHECK_CONFIRMED=true` was set for the staging environment after this approval was recorded.
It must be reset while the Next.js security maintenance candidate is captured and may only be restored after
the new SHA is shown to be visually equivalent.

## Infrastructure Backup Review

The logical application restore is proven. The infrastructure owner must verify the managed Supabase controls that a logical `public`/`app_private` dump does not cover.

- [x] Staging project and plan are identified.
- [x] Managed backup frequency and retention are recorded.
- [x] Auth coverage/recovery behavior is understood.
- [x] Storage object and metadata recovery behavior is understood.
- [x] PITR availability and recovery window are recorded, or explicitly marked unavailable.
- [x] Restore authority and escalation contact are named.
- [x] Target recovery point/time objectives are accepted.

Confirmation record:

```txt
Supabase project: nxttrack-staging (reference laajebtwbcxzjqvtimks), eu-central-1
Plan: Free
Infrastructure owner: Danny Goldenbelt; sole project access holder
Review date: 2026-07-23

Backup frequency/retention:
- The Free plan has no retained Supabase-managed database backup or recovery window.
- The isolated application-level rehearsal has already proven restoration of public and app_private,
  but deliberately destroys its temporary dump and is not a retained provider restore point.

Auth coverage/recovery behavior:
- The application-level logical rehearsal does not back up Supabase Auth.
- Current staging role accounts are controlled test accounts and the environment can be rebuilt through
  migrations, bootstrap and the Phase 16 seed/reset procedure.
- Production remains blocked until the production project is on Pro and provider backup coverage has been rechecked.

Storage coverage/recovery behavior:
- Buckets tenant-documents and diploma-vault exist and currently contain no documents.
- Database backups only preserve Storage metadata, not future bucket objects.
- A separate object-backup and restore procedure is required before non-reproducible production documents are accepted.

PITR window: unavailable on the current Free staging plan
Accepted staging target: database/storage RPO 24 hours; RTO 8 hours
Current Free-plan limitation: mutable staging data is rebuild-only until retained backup automation or Pro is enabled

Decision: confirmed for staging with the explicit rebuild-only limitation accepted. This confirmation does not
authorize production. Production requires Pro, verified retention/restore controls and a separate Storage-object policy.
```

`SUPABASE_BACKUPS_CONFIRMED=true` may be set for staging after this review. It confirms that the current policy,
coverage and limitations were checked and accepted; it does not claim that the Free plan supplies managed backups.

## Security Maintenance Revalidation

The final strict rerun for `02fde48a197a72e80c624adee3ccddc836852807` was blocked on 2026-07-23 by newly
published high-severity Next.js advisories. The release gate correctly rejected Next.js `16.2.9` before build,
migration or activation. The maintenance candidate upgrades only Next.js and its generated lockfile entries to
the patched Active LTS release `16.2.11`.

Local revalidation on 2026-07-23 completed successfully:

- frozen-lockfile install;
- Lovable contract audit;
- TypeScript and auth-boundary audits;
- production dependency audit with no high or critical findings;
- 63-migration and 63-table RLS coverage audits;
- optimized standalone production build;
- 36 applicable local browser checks (40 staging-only checks skipped by their explicit guards).

The existing product-owner decision remains the visual baseline, but the manual visual gate is intentionally
reopened for SHA-bound equivalence review after the framework patch is deployed to staging.

Equivalence review on 2026-07-23:

```txt
Approved visual baseline: 02fde48a197a72e80c624adee3ccddc836852807
Maintenance application SHA: c8bf0a5f8c6b8930a1067f51a55deda0b62af60d
Reviewer: Codex engineering review under the existing Danny Goldenbelt product decision
Evidence: 56 SHA-bound screenshots and 14 reconstructed contact sheets
Functional result: Phase 16, all Sprint 4 browser flows, quality budgets and 52 Phase 15 checks passed
Pixel comparison: 3 contact sheets exact; remaining sheets have at most 0.124% strong pixel difference
Difference classification: regenerated seed identifiers/rows only; no layout, styling or responsive regression
Decision: visually equivalent; manual visual gate may be restored for the final exact-SHA run
```

GitHub artifact storage still reported delayed quota recalculation. The log fallback completed for all 14 routes
and was reconstructed successfully, so the review evidence is usable even though a retained Actions artifact is
still unavailable.

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

- [x] Complete and record product-owner visual decision.
- [x] Complete and record Supabase managed-backup decision.
- [x] Reconstruct and review all 14 compact contact sheets from the artifact-quota fallback.
- [ ] Recheck GitHub artifact quota after recalculation; this is a non-blocking platform follow-up.
- [x] Reconfirm the visual environment gate for the security maintenance SHA.
- [x] Record the Supabase environment confirmation truthfully.
- [ ] Rerun staging and record a 0-warning strict gate.
