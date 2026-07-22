# Sprint 4 - Full-Journey Quality And Security

Status: increments 1-6 complete; critical-route accessibility and performance budgets implemented with staging evidence pending.

## Goal

Prove critical user-driven writes, denial/recovery behavior, accessibility, performance and P0/P1 security against staging rather than relying on seeded database end states.

## Baseline

- The application exposes 58 server actions across public, parent, instructor, tenant-admin and platform-admin domains.
- Existing browser coverage proves authentication, route protection, responsive shells, basic accessibility/performance and visibility of Phase 16 seeded outcomes.
- Phase 16 creates the complete operational dataset directly and then verifies it through the UI; it does not prove that users can create those outcomes through forms.
- Duplicate submission, expired-token, capacity-race, permission-denial and recovery paths are not yet comprehensively browser-driven.
- RLS role smoke passes, while database-owner/FORCE RLS risk remains a separate P0/P1 review item.

## Evidence Integrity Correction

Run `29879975569` exposed that the custom Sprint 4 state paths were resolved from the Playwright package directory instead of the repository root. The workflow steps were green, but the mutation specs had reported `skipped`. Earlier claims that runs in the first five evidence sections browser-proved those custom journeys are therefore retracted; their release, migration, health, advisor, RLS and general-browser evidence remains valid.

Commit `e1dbb11d2813b6cfac6e7b3d0a9f89f7ba9c18d4` switched every state path to an absolute workspace path and made all enabled suites fail closed when state is missing. The authoritative consolidated journey evidence is recorded under the sixth increment instead of inferred from a green workflow step.

## Execution Increments

1. Complete - public intake to tenant-admin waitlist and placement score through browser forms.
2. Complete - slot offer creation plus accepted, declined, expired, duplicate and full-capacity responses.
3. Complete - instructor attendance, progress, note, badge and session completion mutations.
4. Complete - parent cancellation, catch-up, profile, notification and graduation responses.
5. Complete - tenant-admin program, group, agenda, participant, billing, document and communication mutations.
6. Complete - cross-role permission-denial and cross-tenant isolation browser cases.
7. In progress - critical-route accessibility and performance budgets; implementation complete, staging proof pending.
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
- Staging deploy run `29873356009`: deploy, migrations, health, runtime smoke, Phase 16, visual capture, Supabase advisors, four-role RLS smoke and general Playwright checks passed. Its custom Sprint 4 mutation result is superseded by the evidence-integrity correction above.
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
- Staging deploy run `29874519824`: release, migrations, health/runtime smoke, Phase 16, cleanup and edge preparation passed. Its custom intake/offer result is superseded by the evidence-integrity correction above.
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
- Staging deploy run `29875252821`: release, Phase 16 and both bounded preparations passed. Its custom intake/offer and instructor results are superseded by the evidence-integrity correction above.
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
- Staging deploy run `29877128901`: release, migrations, health/runtime smoke, Phase 16 and all bounded preparations passed. Its custom mutation-journey results are superseded by the evidence-integrity correction above.
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

## Fifth Increment Evidence

- Canonical commit: `350ea24c0cc8247e684138451659274d6daed304`.
- CI run `29878694645`: repository truth, design contract, type/auth checks, production build, migration/RLS audits, standalone packaging and browser smoke all passed.
- Staging deploy run `29878847807`: release, migrations, health/runtime smoke, Phase 16 and every bounded Sprint 4 preparation passed.
- The custom journey steps were later proven to have skipped because of the state-path defect. Their browser-proof claim is superseded by the evidence-integrity correction above.
- Supabase Advisors reported no unresolved findings at error level, all four role-specific RLS checks passed and 42 general Playwright checks passed.
- Visual capture and artifact upload passed. The strict launch gate reported zero technical failures and only the two known human confirmations still open: Lovable visual comparison and managed Supabase backups/restore policy.

## Sixth Increment Contract

The negative browser suite proves the server-side authorization boundary rather than merely hiding navigation:

- a parent cannot enter the instructor or tenant-admin shells and is returned to the parent portal;
- an instructor cannot enter the parent or tenant-admin shells and is returned to the instructor shell;
- a tenant admin cannot enter the parent or platform shells, with platform access producing the explicit forbidden state;
- a stable, bounded second staging tenant publishes a uniquely named program so its hostname and data context are independently verifiable;
- the primary tenant admin can see that second tenant's public program page, but is explicitly denied after authenticating against its admin hostname;
- the same tenant admin can still open the primary tenant's program administration and never sees the second tenant's marker there;
- every case rejects browser errors, 5xx responses and broken static assets.

The isolation preparation only upserts the dedicated `sprint4-isolation` tenant, its verified staging subdomain, settings and one public marker program. It grants no membership and therefore cannot manufacture the denial result being asserted.

## Sixth Increment Evidence

- Canonical commit: `cd15b233550d06d03c7e3a51daac8ea98e709d58`.
- CI run `29881834754`: repository truth, design contract, type/auth checks, production build, migration/RLS audits, standalone packaging and browser smoke all passed.
- Staging deploy run `29881993598`: deployment, migrations, health/runtime smoke, Phase 16 and all five bounded preparations passed.
- Raw Playwright output recorded `1 passed` for intake/offer, `1 passed` for instructor, `1 passed` after retry for parent, `1 passed` for tenant admin and `4 passed` for role/tenant isolation. The parent retry exposed a redirect-target defect after an otherwise successful graduation mutation; the afzwem form now explicitly returns to `/portaal/afzwemmen` and clean rerun evidence is required with increment 7.
- The same run passed visual capture/upload, Supabase Advisors, all four role-specific RLS checks, live health and 50 general Playwright checks. The overall workflow stopped only at the strict gate's two human confirmations: Lovable visual comparison and managed Supabase backups/restore policy.

## Seventh Increment Contract

The critical-route quality suite runs against realistic Phase 16 data and enforces:

- WCAG 2.0/2.1 A and AA plus WCAG 2.2 AA automated rules through axe-core;
- zero `critical` or `serious` accessibility violations, with the complete result attached as JSON;
- a mobile public-login route, mobile parent dashboard, tablet instructor roster and desktop tenant-admin dashboard;
- TTFB at most 3 seconds, DOMContentLoaded at most 6 seconds, load completion at most 8 seconds and LCP at most 4 seconds;
- CLS at most `0.1`, no more than 140 resources and no more than 5 MiB transferred per measured route;
- JSON evidence containing both measured values and the exact budgets for every case.

The suite is staging-only, requires a readable absolute Phase 16 state path and fails closed when explicitly enabled without that state. No exception is accepted implicitly: any temporary accessibility or performance exception must be named, scoped, owned and given an expiry before it can enter this document.

The first axe run (`29882847946`) found one serious shared-token issue: the original Lovable primary blue produced only `4.0:1` contrast for normal text and white button labels. The primary and sidebar-primary tokens are darkened from OKLCH lightness `0.58` to `0.53`; this is an intentional WCAG correction to the visual canon, not an accepted accessibility exception.

## Definition Of Done

- Critical journey mutations pass against staging without direct database intervention.
- Duplicate, expired, denied and recovery paths are explicit.
- No known P0/P1 security or accessibility issue remains.
- Performance budgets and accepted exceptions are recorded.
