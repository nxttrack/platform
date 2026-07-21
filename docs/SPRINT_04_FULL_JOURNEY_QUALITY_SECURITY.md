# Sprint 4 - Full-Journey Quality And Security

Status: first browser-driven mutation increment complete; slot-offer edge cases next.

## Goal

Prove critical user-driven writes, denial/recovery behavior, accessibility, performance and P0/P1 security against staging rather than relying on seeded database end states.

## Baseline

- The application exposes 58 server actions across public, parent, instructor, tenant-admin and platform-admin domains.
- Existing browser coverage proves authentication, route protection, responsive shells, basic accessibility/performance and visibility of Phase 16 seeded outcomes.
- Phase 16 creates the complete operational dataset directly and then verifies it through the UI; it does not prove that users can create those outcomes through forms.
- Duplicate submission, expired-token, capacity-race, permission-denial and recovery paths are not yet comprehensively browser-driven.
- RLS role smoke passes, while database-owner/FORCE RLS risk remains a separate P0/P1 review item.

## Execution Increments

1. Complete - public intake to tenant-admin waitlist and placement score through browser forms.
2. Slot offer creation plus accepted, declined, expired, duplicate and full-capacity responses.
3. Instructor attendance, progress, note, badge and session completion mutations.
4. Parent cancellation, catch-up, profile, notification and graduation responses.
5. Tenant-admin program, group, agenda, participant, billing, document and communication mutations.
6. Cross-role permission-denial and cross-tenant isolation browser cases.
7. Critical-route accessibility and performance budgets with recorded exceptions.
8. P0/P1 application/database security review and remediation.

## First Increment Contract

The first mutation test:

- submits a unique, consented intake through the tenant public site;
- signs in through the normal tenant-admin login;
- finds that exact intake in the admin UI;
- converts it to a waitlist entry through the rendered form;
- recomputes placement scores through the rendered form;
- confirms the waiting state and matching group in the UI;
- rejects browser errors, 5xx responses and broken static assets;
- sends no mail and uses no direct database write to produce the tested business outcome.

Before each run, a staging-only cleanup removes older records carrying the exact `sprint4-browser:` marker. Cleanup is test-fixture hygiene; every asserted business mutation in the journey itself remains browser-driven.

## First Increment Evidence

- Canonical commit: `2d6b2c4ff665e5517264da24904ce717f906890b`.
- CI run `29873176135`: all repository, build, migration and browser-smoke checks passed.
- Staging deploy run `29873356009`: deploy, migrations, health, runtime smoke, Phase 16, bounded fixture cleanup, the Sprint 4 browser mutation, visual capture, Supabase advisors, four-role RLS smoke and 42 general Playwright checks passed.
- The strict launch gate reported zero failures and exactly two already-known human warnings: Lovable visual comparison and managed Supabase backups/restore policy.

## Definition Of Done

- Critical journey mutations pass against staging without direct database intervention.
- Duplicate, expired, denied and recovery paths are explicit.
- No known P0/P1 security or accessibility issue remains.
- Performance budgets and accepted exceptions are recorded.
