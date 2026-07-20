# Phase 0 - Repository Truth And Release Baseline

Last updated: 2026-07-20

Status: implemented locally; canonical-branch promotion and live staging proof remain external completion gates.

## Goal

Create one trustworthy implementation and release lineage before adding product scope. Phase 0 makes branch ownership, deploy origin, environment promotion, repository status and remaining validation work explicit and enforceable.

## Decisions Locked

- Canonical implementation branch: `main`.
- `main` is also the only valid source for staging and production releases.
- Remote `staging` and `production` branches are historical deployment/reference lines, not implementation sources and not safe wholesale merge targets.
- Staging remains the first release target.
- Production is a manual promotion of the exact commit SHA already validated on staging.
- The Lovable repository remains the visual source of truth; missing screenshot baselines are an open validation item, not an implicit approval.
- Phase 15 through Phase 20 being present in code does not mean their live staging acceptance has passed.

## Audited Repository State

The audit that started this phase found:

- `main` and `origin/staging` diverged after Phase 14.
- `main` contains the Phase 15 through Phase 20 implementation line.
- `origin/staging` has a large side history with smart-flow, automation, AI, SEPA, helpdesk and UX work, but much of that work is absent from the final branch tree.
- `origin/production` diverged earlier and represents another incompatible application snapshot.
- Historical feature commits remain useful as design and recovery references, but must be audited and selectively reimplemented or cherry-picked after the canonical baseline is stable.

Run the repeatable audit with:

```bash
pnpm run release:truth
```

The audit verifies repository invariants and reports current divergence without treating the historical branches as merge sources.

## Release Contract

Deployments are manually dispatched from `.github/workflows/deploy.yml` while viewing the workflow on `main`.

Staging release:

1. Select target `staging`.
2. Deploy the current full `main` commit SHA.
3. Run migrations, advisors, RLS role smoke, authenticated Playwright and Phase 16 validation.
4. Record the deployed commit SHA and validation evidence.

Production promotion:

1. Select target `production` while dispatching the workflow from `main`.
2. Enter the full commit SHA that passed staging as `staging_release_sha`.
3. Enter `PROMOTE_PRODUCTION` as explicit confirmation.
4. The workflow refuses promotion when the current source SHA differs from the staged SHA.
5. GitHub's `production` Environment must still provide human approval and protected secrets.

The source contract can be tested independently:

```bash
RELEASE_TARGET=staging pnpm run release:assert-source
```

Production example, only after live staging acceptance:

```bash
RELEASE_TARGET=production \
STAGING_RELEASE_SHA=<full-validated-sha> \
PRODUCTION_RELEASE_CONFIRMATION=PROMOTE_PRODUCTION \
pnpm run release:assert-source
```

## CI Baseline

Pull requests and `main` now run:

- repository-truth audit;
- TypeScript;
- auth boundary audit;
- production build;
- migration audit;
- RLS coverage audit;
- migration command guard;
- standalone asset packaging;
- Chromium browser smoke tests.

Static Next.js asset failures are release failures. Browser smoke no longer treats all resource 404 responses as harmless noise.

## Current Product Truth

- Phase 3 through Phase 14: broad implementation foundation exists.
- Phase 15: strict live-staging validation runner exists; a current passing run must still be recorded.
- Phase 16: service-role seeded integration journey plus authenticated dashboard verification exists; a true UI mutation journey remains follow-up work.
- Phase 17: communication, email delivery tracking and private storage code exists; live provider/storage validation remains.
- Phase 18: planning, conflict and catch-up depth exists; operational staging validation remains.
- Phase 19: parent and instructor communication/lesson depth exists; tablet/mobile validation remains.
- Phase 20: provider boundary and billing lifecycle preparation exists; no live Mollie/iDEAL integration is claimed.
- Production readiness is not approved.

## External Completion Gates

Phase 0 can only be marked fully complete after:

- [ ] These repository-truth changes are merged into `main`.
- [ ] Branch protections identify `main` as the canonical implementation branch.
- [ ] Direct pushes to historical `staging` and `production` branches cannot deploy.
- [ ] The staging workflow is dispatched from `main` and succeeds.
- [ ] The deployed staging commit SHA is recorded.
- [ ] Phase 15 and Phase 16 evidence is retained as workflow artifacts or a release record.
- [ ] Phase 17 through Phase 20 staging checklists are executed.
- [ ] Lovable visual comparison is recorded.
- [ ] Backup/restore policy is confirmed.
- [ ] VPS rollback is rehearsed against the canonical release lineage.
- [ ] Production remains protected until the production-readiness phase is approved.

## Recovery Policy For Historical Work

Do not merge `origin/staging` or `origin/production` wholesale.

For every historical feature considered for recovery:

1. Identify its commit and dependencies.
2. Compare its schema with the Phase 20 canonical schema.
3. Re-run tenant, RLS and service-boundary review.
4. Reconcile its UX with the current route and terminology canon.
5. Add tests before promotion.
6. Prefer a clean reimplementation when cherry-picking would reintroduce an obsolete architecture.

Priority candidates for later recovery audit include Smart Flow decision records, capacity/waitlist intelligence, active shell navigation, mobile shell behavior, observability and visual regression work.

## Non-Goals

- No new business modules in Phase 0.
- No AI activation.
- No Mollie, SEPA or external communication provider activation.
- No production deployment.
- No destructive branch deletion until the historical work inventory is accepted.
