# Instructor review and explicit publication — implementation checkpoint

Canonical baseline: `afb53f6e4f72ac8fb0cba88ab98e43373fc7ed80`.
Full V4.2 integration remains **IN_PROGRESS**. This checkpoint is not final certification.

The canonical instructor assessment tab now uses the existing private `swim_assessment_drafts` and finalization authority. Score clicks save a scoped, revision-checked private draft; a separate review displays the old/new score and visibility before explicit confirmation. Corrections append immutable observations. Concurrent observations invalidate the review without discarding the losing draft. Historical/native drafts are not silently adopted. The original legacy scoring adapter remains available outside the canonical curriculum flow, with automatic score email removed; public badge counts exclude internal scores.

Parent messages and child compliments are separate explicit publications. The new compliment record retains its immutable observation/context and text; it does not change the original assessment, notes, completion order, notification or score. Parent/child adapters expose only allowed fields. Historical, explicitly curated child labels remain compatible. Automatic badges reuse the existing batch authority and actual mastery thresholds; an unconfirmed post-save badge evaluation is reported separately from the successful assessment. The retry notice currently survives refresh within the mounted editor, but is not a new durable badge worker.

Real browser testing found a recipient fallback bug: a bound guardian with no optional profile row disappeared from message review. Migration155 corrects the projection while retaining exact guardian confirmation on send. Development question/deep-link navigation now uses actual item UUIDs and accepts the authorized stable-key/UUID distinction. Shared draft flushing covers mounted message and assessment editors. Immediate browser Back during a failed unsaved request remains a required follow-up test.

## Schema and local evidence

- New migration: `20260914134016_reviewed_instructor_assessments.sql`.
- Candidate migration count: **155**; contract **5** remains unchanged.
- Artifact version: `20260914134016`; fingerprint: `a4aa824fa1e611ac0217354b6f999e372fd686462f7ad278c7c2d4a1868d9b03`.
- Only the owned loopback Supabase development database was changed. Its official migration history remains151; these development applies do not substitute for the final fresh/upgrade certification.
- All151 canonical historical migration files remain unchanged. The already committed154 migration remains unchanged; the recipient correction is forward-only in155.

| Command/evidence | Result |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm test:unit` | 504 PASS, 0 failed, 0 skipped |
| `pnpm db:audit` | PASS, 155 files |
| `pnpm db:rls-audit` | PASS, 256 public tables; parser reports grant-discovery advisories for private functions whose authenticated wrappers/grants are exercised by real DB tests |
| `pnpm auth:audit` | PASS |
| `INSTRUCTOR_REVIEW_TEST_DATABASE_URL=<owned loopback> pnpm test:instructor-review:db` | 1 broad DB contract PASS: actor isolation, no early publication, replay, simultaneous competing connections, fault rollback/retry, retained drafts, revoked assignment, foreign-client draft, explicit immutable compliment |
| `PORTAL_MESSAGE_TEST_DATABASE_URL=<owned loopback> pnpm test:portal-messages:db` | 2 broad DB contracts PASS, including missing-profile recipient projection |
| `SWIM_CANON_TEST_DATABASE_URL=<owned loopback> pnpm test:swim-canon:db` | All9 existing SQL suites PASS |
| Existing Supabase CLI `db lint --db-url <owned loopback> --level warning` | PASS, no schema errors |
| `journey-instructor-review.spec.ts`, real local Chromium | PASS, 34.4s test: three separately authenticated sessions; private draft/reload; failed save/retry; parent score; true child-session activation; explicit compliment; private note absent from parent/child HTML; separately sent instructor message; parent question and exact item backlink; sibling isolation; child cannot reach instructor/inbox |
| `journey-message-composer.spec.ts`, repeated after shared changes | PASS, 22.7s test |

Fixtures are created only through explicit loopback DB/API arguments by `scripts/db/seed-portal-assessment-browser.mjs` (reusing the fictional family seed). The credential file remains0600 outside Git. The browser tests require this fixture and intentionally skip without it; ordinary CI is not claimed to have run these authenticated cases. No real mail, provider operation, remote mutation or deployment occurred.

Initial browser failures remain separate evidence: hidden native radio target corrected to its visible label; test fixture missing child-session TTL corrected without bypass; explicit new-thread subject added to test; actual missing-profile projection fixed. None of those earlier runs is relabeled PASS. Firefox/WebKit and final fresh/upgrade/build/packaging/complete browser gates remain pending for the complete integration.

Screenshots: `evidence/instructor-review-retry.png`, `evidence/child-explicit-compliment.png`. These are fictional data, with legacy artwork; authentic Default acceptance remains blocked by B01.
