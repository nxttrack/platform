# NXTTRACK Platform

This repository is the final rebuild of NXTTRACK.

Current working mode: documentation and foundation only. Do not build product features until the product owner approves the canon, infrastructure plan, Lovable UI audit, and implementation roadmap.

## Source of truth

- Final rebuild repository: `nxttrack/platform`
- Lovable UI reference repository: `nxttrack/swim-school-pro`
- Legacy/reference workspace: `nxtdev` or earlier local prototypes, reference only
- First deployment target: staging environment

## Current phase

Phase 0 and Phase 1 are active:

- Phase 0: lock repo structure, environment/secrets strategy, migration approach, and staging deploy flow.
- Phase 1: audit Lovable UI before any UI transfer or consolidation.

No product features, database schema changes, Supabase integration work, auth implementation, payment implementation, or UI rewrites should happen in this phase.

## Canon and planning docs

- [NXTTRACK Canon](docs/NXTTRACK_CANON.md)
- [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md)
- [Implementation Roadmap](docs/IMPLEMENTATION_ROADMAP.md)

## Phase docs

- [Phase 0 - Repo and Infra](docs/PHASE_0_REPO_INFRA.md)
- [Phase 1 - Lovable UI Audit](docs/PHASE_1_LOVABLE_UI_AUDIT.md)

## Operational prep docs

- [Staging Setup Checklist](docs/STAGING_SETUP_CHECKLIST.md)
- [VPS Deployment Runbook](docs/VPS_DEPLOY_RUNBOOK.md)
- [Migration Strategy Decision](docs/MIGRATION_STRATEGY_DECISION.md)
- [Lovable Screenshot Baseline](docs/LOVABLE_SCREENSHOT_BASELINE.md)

## Deployment baseline

The repository already contains `.github/workflows/deploy.yml`. It targets `staging` and `production` branches using a self-hosted GitHub runner, Caddy, systemd, shared `.env` files, release directories, and symlink activation.

The staging environment is the only first target. Production remains a future target and should not be treated as launch-ready until explicitly approved.
