# Phase 4 - Public Tenant Site And Intake

Last updated: 2026-06-24

Status: implemented foundation. This phase follows the approved working sprint order where Phase 3 is the core domain foundation.

## Goal

Turn the public tenant website skeleton into real data-backed pages and create the first structured intake lifecycle.

This phase covers:

- tenant marketing page from tenant data;
- program overview from published program data;
- program detail from published program settings;
- configurable intake form per program;
- trial, registration and waitlist as intake options;
- preferred days and time windows stored on intake submissions;
- initial intake submission lifecycle.

## Implemented Tables

The migration `20260624123000_phase4_public_tenant_intake.sql` adds:

- `tenant_public_profiles`
- `program_public_settings`
- `intake_form_configs`
- `intake_submissions`
- `intake_submission_events`

The public profile/settings/config tables are tenant-scoped and safe for public read through RLS when published or active.

The submission tables are tenant-scoped and allow public insert only. They do not grant public select.

## Public Pages

The public tenant site now has data-backed pages:

- `/`
- `/programmas`
- `/programmas/[slug]`
- `/intake?program=...`

Tenant resolution uses the Phase 2 host headers:

- tenant subdomain via `x-nxttrack-tenant-slug`;
- verified custom domain via `tenant_domains`;
- fallback via `DEFAULT_TENANT_SLUG`, defaulting to `aquaswim-demo`.

## Intake Contract

An intake submission stores:

- selected program;
- intake type: `trial`, `registration`, or `waitlist`;
- parent contact details;
- participant details;
- preferred days;
- preferred time windows;
- free-form notes;
- answers from the active program-specific form config;
- lifecycle status.

Initial status is `new`.

The first event is written to `intake_submission_events` with status `new`.

## Important Product Decision

Trial lesson, registration and waitlist are one intake engine with different options.

They are not separate duplicated product flows.

This keeps the later placement assistant, slot offer flow and waitlist matching focused on one submission lifecycle.

## RLS Strategy

Public read:

- active tenants;
- active tenant settings;
- verified tenant domains;
- active programs;
- active stages;
- published tenant public profiles;
- published program public settings;
- active intake form configs.

Public insert:

- `intake_submissions`;
- `intake_submission_events`.

Staff read/write:

- platform roles;
- tenant owner/admin/staff.

Public visitors cannot read intake submissions or events after insert.

## Demo Seed

The AquaSwim demo tenant gets:

- published tenant public profile;
- published public settings for Zwemdiploma A and B;
- active intake config for Zwemdiploma A with trial, registration and waitlist;
- active intake config for Zwemdiploma B with registration and waitlist.

## Explicit Non-Goals

- No placement assistant.
- No automatic stage recommendation.
- No slot offer accept/decline token flow.
- No payment or subscription creation from intake.
- No SendGrid/email notification yet.
- No public submission lookup page.
- No spam protection or rate limiting yet.
- No admin intake management page beyond the existing skeleton.

## Next Step

Phase 5 should turn intake submissions into operational intake/waitlist work:

- tenant admin intake list;
- waitlist entry creation;
- placement assistant;
- slot offer lifecycle;
- capacity matching;
- notifications.
