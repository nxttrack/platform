# Sprint 4 - Full-Journey Quality And Security

Status: intake, offer, instructor and parent self-service increments complete; tenant-admin mutations implemented with staging evidence pending.

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
2. Complete - slot offer creation plus accepted, declined, expired, duplicate and full-capacity responses.
3. Complete - instructor attendance, progress, note, badge and session completion mutations.
4. Complete - parent cancellation, catch-up, profile, notification and graduation responses.
5. In progress - tenant-admin program, group, agenda, participant, billing, document and communication mutations; implementation complete, staging proof pending.
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

## Second Increment Contract

The next browser journey extends the first intake mutation and must prove:

- offer creation by a signed-in tenant admin through the rendered group selector;
- public acceptance and the resulting confirmation;
- safe sequential reuse of an already accepted token without a second placement;
- public refusal of a separate browser-created offer;
- an expired offer rendered without response controls;
- an open offer rejected at response time when its group has become full;
- no real e-mail is sent: browser-created offers record the configured staging skip, while edge fixtures are inserted directly with `delivery_status=skipped`.

The expired/full preconditions use a dedicated one-seat group, participant and offer records. They are exact-marker staging fixtures; the response behavior itself remains browser-driven and cleanup removes prior accepted participants, mail attempts and offer dependencies before reseeding.

## Second Increment Evidence

- Canonical commit: `22eb733c6f86318ea2d1a3a56fe152af68766b27`.
- CI run `29874352901`: all repository, build, migration and browser-smoke checks passed.
- Staging deploy run `29874519824`: release, migrations, health/runtime smoke, Phase 16, cleanup, edge preparation and the expanded intake/offer browser journey passed.
- The same run completed visual capture, Supabase advisors, four-role RLS smoke and 42 general Playwright checks; the strict gate again ended with zero failures and only the two known human warnings.

## Third Increment Contract

The instructor journey uses the normal instructor account and Phase 16 roster to:

- change the exact participant's attendance through the rendered quick action;
- update the seeded progress item to level 5 with an internal marker note;
- create an internal progress note and a custom internal badge;
- complete the selected scheduled session as the last mutation;
- reject browser errors, 5xx responses and broken static assets throughout.

Internal visibility deliberately avoids parent-notification side effects. Exact `sprint4-instructor:` note markers are removed before the next staging run; Phase 16 restores its canonical attendance, progress score and scheduled-session state before this journey runs again.

## Third Increment Evidence

- Canonical commit: `68667928c535c5878bdb699ad90beb087a9cdeaa`.
- CI run `29875047273`: all repository, build, migration and browser-smoke checks passed.
- Staging deploy run `29875252821`: release, Phase 16, both bounded preparations, intake/offer mutations and all instructor mutations passed.
- Visual capture, Supabase advisors, four-role RLS smoke and 42 general Playwright checks also passed; the strict gate ended with zero failures and the same two known human warnings.

## Fourth Increment Contract

The parent journey uses the normal parent account and a bounded staging fixture to:

- update name and phone through the rendered profile form;
- cancel one exact future lesson within policy and receive the automatic inhaalcredit;
- select a compatible, capacity-safe inhaalles and submit the request through the portal;
- mark one exact unread notification as read;
- confirm one exact afzwemuitnodiging;
- reject browser errors, 5xx responses and broken static assets throughout.

The preparation restores the canonical parent profile and replaces only records carrying exact `sprint4-parent:` markers, the dedicated catch-up group code or notification title. It validates rather than changes tenant policy settings. All asserted self-service outcomes remain browser-driven, and conditional final-state assertions make the journey safe under Playwright retry.

## Fourth Increment Evidence

- Canonical commit: `2249d004e79605a2fa31e3fe298b854d2d41d489`.
- CI run `29876987337`: repository truth, design contract, type/auth checks, production build, migration/RLS audits, standalone packaging and browser smoke all passed.
- Staging deploy run `29877128901`: release, migrations, health/runtime smoke, Phase 16, all bounded preparations and the intake/offer, instructor and parent mutation journeys passed.
- The same staging run passed Supabase advisors, four-role RLS smoke, live health and 42 general Playwright checks. The strict gate reported zero failures and the same two known human warnings: Lovable visual comparison and managed Supabase backups/restore policy.
- Visual evidence capture passed, but GitHub could not persist its artifact because the repository artifact-storage quota was full; this did not affect the browser assertions or live staging release.

## Fifth Increment Contract

The tenant-admin journey uses the normal organization-admin account to create a linked operational chain through rendered forms:

- an active program and stage;
- a capacity-bound lesson group plus instructor assignment;
- a participant enrollment plus active group placement;
- a concrete future session in the planboard;
- a payment plan, subscription, manual payment and paid-status transition;
- an internal metadata-only document and internal draft message, so no file upload or real e-mail is triggered;
- browser/runtime failure rejection throughout.

Every retry uses a unique `sprint4-admin` suffix. The staging-only preparation removes older records through exact title/code/note prefixes and their bounded dependencies; it never creates the outcomes asserted by the browser journey.

## Definition Of Done

- Critical journey mutations pass against staging without direct database intervention.
- Duplicate, expired, denied and recovery paths are explicit.
- No known P0/P1 security or accessibility issue remains.
- Performance budgets and accepted exceptions are recorded.
