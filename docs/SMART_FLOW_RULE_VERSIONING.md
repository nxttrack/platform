# Smart Flow Rule Versioning

Reviewed on: 2026-06-25

Status: Phase S0 implementation policy.

## Purpose

Smart recommendations must be explainable and repeatable. A placement score, stage recommendation, waitlist rank, flow-through suggestion, or diploma readiness signal is only useful when the system can later explain which rules created it.

## Decision Storage

Phase S0 introduces a generic `smart_decisions` model instead of adding unrelated JSON columns to every module.

Each smart decision stores:

- `engine_key`
- `tenant_id`
- `subject_type`
- `subject_id`
- `input_snapshot`
- `rule_version`
- `score`
- `confidence`
- `reasons_json`
- `blockers_json`
- `recommendation`
- `decision_status`
- `human_decision`
- `override_reason`
- `result`
- audit trail through `audit_events`

Module tables may still keep their operational fields, such as placement suggestion status or intake status. The smart decision is the explainable recommendation layer.

## Engine Settings

Phase S0 introduces `tenant_smart_engine_settings`.

Per tenant and engine, this stores:

- mode: `manual`, `semi_automatic`, or `automatic`
- active rule version
- weights
- thresholds
- expiry settings
- hold settings
- notification settings
- metadata

The default mode is `semi_automatic`.

## Rule Version Naming

Rule versions use stable, readable keys:

```txt
<engine>-v<number>
```

Examples:

- `intake-recommendation-v1`
- `placement-v1`
- `waitlist-v1`
- `flow-through-v1`
- `diploma-readiness-v1`

Do not silently change the meaning of an existing rule version. If the logic changes in a way that changes scores, reasons, blockers, recommendation output, or acceptance thresholds, create a new version.

## Input Snapshot Policy

`input_snapshot` must store enough information to explain the recommendation later.

It should include:

- IDs of relevant domain records.
- Counts and derived facts used by scoring.
- Non-sensitive rule inputs.
- Capacity or preference facts used by the engine.

It should avoid:

- Parent email.
- Phone numbers.
- Full free-text medical notes.
- Passwords or secrets.
- Raw message bodies.

When sensitive context is needed, store the source record ID and read the source record through normal permission checks.

## Reasons And Blockers

`reasons_json` is an ordered array of explainable positive or neutral reasons.

`blockers_json` is an ordered array of warnings or blocking conditions.

Reason shape:

```json
{
  "code": "preferred_day_match",
  "label": "Voorkeursdag matcht",
  "detail": "De groep valt op een opgegeven voorkeursdag.",
  "weight": 20,
  "evidence": {
    "preferred_weekday": "wednesday"
  }
}
```

Blocker shape:

```json
{
  "code": "no_capacity",
  "label": "Geen capaciteit",
  "detail": "De groep heeft geen vrije plekken.",
  "severity": "blocking"
}
```

## Human Decision Policy

Admins can approve, reject, apply, cancel, or override a smart decision.

Overrides require a non-empty `override_reason`.

This is enforced in both:

- Database constraint on `smart_decisions`.
- Shared TypeScript helper `updateSmartDecisionLifecycle`.

## Parent Visibility

Parents should not see internal scores, weights, or blockers.

Parent-facing UI and messages should use `recommendation.parent_summary` or a dedicated parent-safe copy field.

## Audit Policy

`smart_decisions` and `tenant_smart_engine_settings` are audited with the existing `audit_events` trigger.

Every important lifecycle change should update the decision record, so the audit log captures:

- recommendation creation
- approval
- rejection
- override
- application
- cancellation
- expiry

## Phase S0 Scope

Phase S0 wires the shared decision shape to:

- public intake recommendation
- admin placement recommendation

Future phases will reuse this same pattern for:

- waitlist ranking
- capacity holds
- flow-through
- diploma readiness
- badge recommendations
- makeup matching
- smart dashboard signals
