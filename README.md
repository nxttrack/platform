# NXTTRACK Platform

This repository is the final rebuild of NXTTRACK.

Current working mode: staging-first rebuild. Product modules through Phase 12 exist on staging; Phase 13 focuses on hardening, release checks and production-promotion readiness.

## Source of truth

- Final rebuild repository: `nxttrack/platform`
- Lovable UI reference repository: `nxttrack/swim-school-pro`
- Legacy/reference workspace: `nxtdev` or earlier local prototypes, reference only
- First deployment target: staging environment

## Current phase

Phase 13 is active:

- Security review and release-readiness audit.
- RLS/migration contract checks.
- Staging smoke tests.
- VPS/Caddy/systemd/GitHub runner deployment checks.
- Staging release and production promotion checklist.

Production remains gated by explicit approval.

## Canon and planning docs

- [NXTTRACK Canon](docs/NXTTRACK_CANON.md)
- [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md)
- [Implementation Roadmap](docs/IMPLEMENTATION_ROADMAP.md)

## Phase docs

- [Phase 0 - Repo and Infra](docs/PHASE_0_REPO_INFRA.md)
- [Phase 1 - Lovable UI Audit](docs/PHASE_1_LOVABLE_UI_AUDIT.md)
- [Phase 13 - Hardening and Production Launch](docs/PHASE_13_HARDENING_PRODUCTION_LAUNCH.md)

## Operational prep docs

- [Staging Setup Checklist](docs/STAGING_SETUP_CHECKLIST.md)
- [VPS Deployment Runbook](docs/VPS_DEPLOY_RUNBOOK.md)
- [Migration Strategy Decision](docs/MIGRATION_STRATEGY_DECISION.md)
- [Lovable Screenshot Baseline](docs/LOVABLE_SCREENSHOT_BASELINE.md)

## Deployment baseline

The repository already contains `.github/workflows/deploy.yml`. It targets `staging` and `production` branches using a self-hosted GitHub runner, Caddy, systemd, shared `.env` files, release directories, and symlink activation.

The staging environment is the only first target. Production remains a future target and should not be treated as launch-ready until explicitly approved.

## Release checks

```bash
pnpm run release:gate
pnpm run smoke:staging
```
