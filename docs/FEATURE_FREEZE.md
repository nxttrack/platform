# NXTTRACK feature freeze

Status: active once an annotated `feature-freeze-*` tag is pushed after the exact-SHA staging release is fully green.

## Freeze contract

After the tag is created:

- no new product feature, schema expansion, dependency upgrade or visual redesign enters the release candidate;
- only a reproducible release blocker, security defect, data-integrity defect or failed acceptance gate may change code;
- every accepted repair is a small, reviewed hotfix and creates a new candidate SHA;
- CI, exact-SHA staging deployment, premium browser validation, screenshots and release evidence must be repeated after every hotfix;
- production foundation, migration and Storage restore rehearsals bind only to the final unchanged candidate SHA;
- the product owner records visual approval and production authorization separately.

## Frozen functional scope

The release candidate includes the existing public intake, role-based portals, planning, progression, badges, Communicationhub, CRM pipeline, Empty Seat Recovery, daily cockpit, retention signals, instructor replacement, lesson plans, seasonal planning, website CMS, platform support, tenant health and shadow package control.

Mollie live validation, external WhatsApp/SMS, external AI and web-push activation remain outside the release unless their separate provider, legal and acceptance gates are explicitly completed.

## Required browser evidence

The staging release must pass:

- existing Sprint 4 role, mutation, isolation, accessibility and performance journeys;
- Communicationhub and Badge Studio validation;
- premium commercial and retention workflows;
- workforce, lesson-plan and seasonal-planning boundaries;
- platform support and non-enforcing package controls;
- parent web-push configured or safely-disabled state;
- Priority A visual capture and release-evidence upload.

The exact freeze SHA is recorded in the annotated Git tag and the successful staging deployment, not copied into this mutable document.
