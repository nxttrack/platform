# Phase 2 - App Scaffold

Last updated: 2026-06-23

Status: implementation scaffold, no product features.

## Scope

This phase creates the minimum deployable Next.js app foundation:

- pnpm workspace root.
- `apps/web` Next.js App Router app.
- Lovable-derived global token layer.
- Core route skeletons for marketing, tenant public, parent, instructor, tenant admin, and platform admin.
- Shared shell primitives based on the Lovable audit.
- `/api/health` endpoint for staging smoke checks.
- `pnpm run db:migrate` safe no-op placeholder until the Supabase migration runner is approved.

## Explicit Non-Goals

- No Supabase connection.
- No database schema.
- No auth.
- No tenant resolution.
- No payments.
- No email sending.
- No Lovable UI port beyond shell/token skeletons.
- No production deployment changes.

## Commands

```txt
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm run db:migrate
```

## Phase 3 Gate

Before Phase 3 starts:

- Supabase staging project must be confirmed.
- Migration runner command must be finalized.
- Auth/tenant/RLS design must be reviewed against `docs/TECHNICAL_ARCHITECTURE.md`.
