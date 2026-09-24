# Private message drafts and reviewed delivery

Implementation checkpoint: `e691cecc5cadd48042d41667cd80e34554017955`, based on canonical main `afb53f6e4f72ac8fb0cba88ab98e43373fc7ed80`. Full V4.2 integration remains IN_PROGRESS. This is not final fresh/upgrade/build/CI certification.

The parent inbox now resumes a private server draft per actor, tenant, thread and participant. Development links carry real curriculum-item IDs. Lesson references validate the child's group membership on the tenant's calendar date. A saved draft keeps its original reference when another URL requests a different reference for the same child. Child, actor and tenant identities are validated again at the server boundary; another tab's changed revision produces a deliberate choice. A stale initial load cannot replace text already typed. No sensitive draft text goes into localStorage.

The shared reply composer is connected to parent, instructor and administrative conversations. It preserves existing team management and the full administrative new-thread form. Internal visibility remains separate from public replies. Explicit review shows the recipient, child, reference and content; confirming is required to send. Rechecking the guardian prevents sending to a changed recipient. A transaction creates the message, consumes the draft, records the command receipt and preserves the existing native outbox contract. In-app notifications are created in that transaction, once, with email delivery skipped. An ordinary insertion error rolls back any new conversation and leaves the private draft intact. Replaying a successful operation acknowledges the same message.

The native reply function is still the canonical authority. Its direct RPC entry now shares the explicit active-role, guardian, instructor and restricted-child checks; nullable guardian/assignee comparisons cannot bypass them. Signatures, canonical writes, receipts and outbox behavior are retained. Public RPCs are SECURITY INVOKER wrappers; actor-bound SECURITY DEFINER implementations live in `app_private` with an empty search path.

Archiving is a personal `message_thread_participants.archived_at` preference. It does not close or delete the shared conversation, change anyone's permissions or notify other users. Existing read controls remain available. Revoked child links do not expose message-reference labels in the parent hub. Invalid child selection fails with not-found.

## Migration and limits

New forward migration: `20260914124643_portal_message_composer_drafts.sql`. Candidate total: **154**. Original 151 baseline migrations are unchanged. Artifact version `20260914124643`, fingerprint `06a9642917a6c7c85ac7b0f54af8cdf409d2bd63252c22b6b51ee2b5c871d908`. Runtime floor remains schema contract 5.

Only the owned loopback development DB was changed. It has the development schema, while official migration history remains the canonical 151; final official fresh/upgrade/partial-schema proof is still required. Drafts expire after 30 days and reads hide expired rows; the author's next save prunes expired rows. This does not claim physical deletion on day 30 for an actor who never returns. Browser link navigation, context changes, dialog close and personal archive flush drafts; beforeunload protects unsaved hard-navigation state. Immediate browser back during a failed save still needs dedicated coverage before full acceptance.

## Executed checks

All commands used the feature workspace and fictional loopback DB/API. Tests ran on the working source then committed as the implementation SHA above.

| Check | Result | Evidence |
| --- | --- | --- |
| `pnpm typecheck` | PASS | `evidence/message-final-typecheck.log` |
| `pnpm test:unit` | 502 PASS, 0 failed/skipped | `evidence/message-composer-all-units-fixed.log` |
| `pnpm auth:audit` | PASS | `evidence/message-auth-audit.log` |
| `pnpm db:audit` | 154 migrations PASS | `evidence/message-migration-audit-fixed.log` |
| `pnpm db:rls-audit` | 255 public tables / 154 migrations checked | `evidence/message-rls-audit.log` |
| `pnpm exec supabase db lint --db-url LOCAL_LOOPBACK_WITH_SSLMODE_DISABLE --level warning` | no schema errors | `evidence/message-sql-lint-local-tls-fixed.log` |
| `PORTAL_MESSAGE_TEST_DATABASE_URL=LOCAL_LOOPBACK pnpm test:portal-messages:db` | 2 broad database contracts PASS | `evidence/message-reference-db.log` |
| `SWIM_CANON_TEST_DATABASE_URL=LOCAL_LOOPBACK pnpm test:swim-canon:db` | all 9 existing suites PASS | `evidence/message-canonical-regression-db.log` |
| Existing Journey Playwright config with local server, `journey-message-composer --project=journey-chromium --workers=1` | 1 real authenticated parent flow PASS | `evidence/message-browser-final.log`, `evidence/parent-confirm-message.png` |

Database contracts cover author-only drafts including denial to another tenant admin, actor/tenant/child/thread isolation, view-only guardians, child session restrictions, instructor settings and internal/public separation, invalid and real curriculum/lesson references, local-date membership boundaries, concurrent draft edits and concurrent send, error rollback, retry, recipient change, personal archive, expiry and revision-bound discard. Browser coverage includes reload, a second authenticated context, conflict choice, failed network action retaining text, explicit recipient review, one sent message, exact item reference, archive/restore and another child with no leaked draft.

Reproduction: `scripts/db/seed-portal-message-browser.mjs` requires explicit loopback DB/API/service key and a new `PORTAL_MESSAGE_BROWSER_FIXTURE` output path. It creates random fictional accounts and curriculum data, confirms local Auth without sending email, and writes mode-0600 credentials. The browser test receives only the private fixture path. Without this configured local fixture the authenticated browser test is SKIPPED, never claimed PASS. The temporary local config only reuses the managed dev server; remove it before final handoff.

Historical failures are retained: initial browser load race (fixed with per-load generation), audit rejection of public SECURITY DEFINER RPCs (moved to private implementations), source-contract unit expecting the old inline button (now checks the connected dialog and its same accessible label), and first lint invocation omitting local `sslmode=disable`. No threshold/allowlist was changed. RLS audit's grant-discovery notes are advisory: actual authenticated execution of every new public wrapper was tested against DB permissions.

Firefox/WebKit for this authenticated flow, full production build/packaging, final migration profiles and GitHub CI are not yet executed at this checkpoint. Previously documented host-library failures still apply. Instructor review/explicit compliment chain, collectible ownership and the remaining whole-product gates are still pending. B01 original Default source/assets remains open.

No deployment, remote database write, provider action or real communication was performed.
