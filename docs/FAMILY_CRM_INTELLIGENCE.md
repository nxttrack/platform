# Family, marketplace and CRM intelligence

This increment adds five connected, tenant-scoped capabilities without an external AI dependency:

- multi-child family planning;
- a controlled make-up marketplace;
- explainable lead scoring;
- first-party campaign-to-revenue attribution;
- a rule-based CRM follow-up assistant.

All suggestions are decision support. NXTTRACK does not automatically place, reject, unsubscribe, charge, or message a family.

## Product routes

| Capability | Route | Human control |
| --- | --- | --- |
| Family overview | `/admin/gezinnen` | Read-only family aggregation |
| Family planning | `/admin/gezinnen/[guardianId]` | Separate confirmed offer or placement per child |
| Make-up marketplace | `/admin/inhaalmarkt?sessie=[sessionId]` | Invite, direct booking, and ignore each require a deliberate action |
| Parent make-up booking | `/portaal/lessen` | Parent explicitly confirms a valid option |
| Parent communication preferences | `/portaal/profiel` | Parent controls in-app, email, and future recipe opt-in |
| Lead score | `/admin/intake` | Score, confidence, evidence, blockers, and follow-up actions are visible |
| CRM follow-up | `/admin/opvolging` and dashboard widget | Drafts are editable; nothing is sent automatically |
| Campaign attribution | `/admin/rapportages/campagnes` | Read-only, cohort-based report |

## Important decisions

### Family planning

- Existing placed children are fixed schedule candidates; waiting children use the current Smart Placement engine.
- Same day, same location, and minimal non-overlapping waiting time improve the family score.
- Capacity, stage, resource, instructor, preferences, and FIFO evidence remain visible per child.
- A FIFO position other than first is a blocker. The family score never silently overrides FIFO.
- Placement and offer creation are separate per child and require human confirmation.

### Make-up marketplace

- A match requires an active credit, exact program and stage, a future scheduled session, and session-level capacity.
- Effective usage is active membership capacity minus cancellations from those same active members, plus open make-up holds.
- Booking is idempotent and transactionally locks the credit, request, and session.
- Parent requests and direct staff bookings both require explicit confirmation.
- Approval and rejection are transactionally revalidated.
- A credit remains `reserved` until attendance evidence (`present`, `late`, or `trial`) marks it `used`.
- External email delivery respects the guardian's make-up communication preference.
- Automatic invitations are not implemented. The opt-in flag only prepares a later, explicitly configured automation recipe.

### Lead scoring

- Version `lead-score-v1` is deterministic and explainable.
- It uses completeness, operational minimum age, planning availability, recorded preferences, measured offer response, trial attendance, linked payment state, and wait-time context.
- It does not use UTM data, campaign source, names, nationality, gender, health data, free text, or inferred socioeconomic attributes.
- A lead score prioritizes manual review; it is never an automatic acceptance or rejection decision.

### Attribution

- The immutable `lead_sources` row captures the privacy-safe first-touch snapshot already stored with a submitted intake.
- Raw click IDs, complete referrers, querystrings, and personal values are not stored.
- Placement and revenue count only when relational conversion lineage exists.
- Net received revenue subtracts recorded refunds and chargebacks and never combines currencies.
- Visitor counts are deliberately shown as unavailable until a consent-aware first-party aggregate exists.
- Withdrawing analytics consent clears the browser attribution session data.

### CRM follow-up

- Signals are rule-based and contain reason, evidence, suggested action, and an editable draft.
- Drafts are classified as personal content and always require human review.
- “Done” requires confirmation and records the human contact moment.
- The assistant has no send action and uses no external AI.
- Journey Bot records are excluded from live generation, storage, tasks, dashboard widgets, and reports.

## Data and security

Migrations:

- `20260727090000_family_crm_intelligence.sql`
- `20260727091000_makeup_marketplace_booking.sql`
- `20260727092000_makeup_decision_and_attendance.sql`

All new domain tables contain `tenant_id`, use RLS with `FORCE ROW LEVEL SECURITY`, and expose mutation only through trusted server paths. Critical booking and decision functions are service-role only. Journey-derived records require consistent `is_test`, `journey_run_id`, source, and metadata markers.

No new environment variable or secret is required.

## Operational validation

Run:

```bash
pnpm run test:family-crm
pnpm run typecheck
pnpm run db:audit
pnpm run db:rls-audit
pnpm run auth:audit
pnpm run build
```

Before staging acceptance:

1. apply all three migrations;
2. verify one live and one Journey-marked intake;
3. verify family suggestions never expose another tenant;
4. cancel an occupied session place and confirm only matching credits appear;
5. request, approve, attend, and verify the credit transitions `available → reserved → used`;
6. create an offer and direct placement and verify conversion lineage;
7. confirm Journey records contribute to none of the live campaign, CRM, NBA, or task totals;
8. confirm no message leaves the system without the final human action.
