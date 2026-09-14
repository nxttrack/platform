# Final integration validation

Canonical base: `afb53f6e4f72ac8fb0cba88ab98e43373fc7ed80`.
Latest application source: `feee0c0a1d3bbdc2787c0f0dfe336edf5637d18f`.
Later evidence/test-only commits are identified separately. No source history was rewritten.

## Local checks

| Check | Actual result |
|---|---|
| Clean frozen dependency install | PASS, both feature workspace and independent real tmpfs build checkout; `pnpm install --frozen-lockfile` |
| Production dependency policy | PASS, zero advisories; `pnpm security:audit-dependencies`, unchanged moderate threshold/lockfile |
| Typecheck | PASS on final source, `pnpm typecheck` |
| All units | PASS 505, 0 failed, 0 skipped; `pnpm test:unit` |
| Repository truth / Lovable baseline | PASS, `pnpm release:truth`, `pnpm design:audit` |
| Auth / runtime environment | PASS, `pnpm auth:audit`, `pnpm release:audit-runtime-env` |
| Production build / standalone packaging | PASS onfeee0c0, `pnpm build`, `pnpm deploy:package-standalone-assets`; actual standalone server exercised on loopback |
| Migration static / RLS / command | PASS, `pnpm db:audit`, `pnpm db:rls-audit`, `pnpm db:migrate` command opt-out check |
| Fresh / exact canonical upgrade / rollback compatibility | PASS; see DATABASE-CERTIFICATION.md and hashed DATABASE-EVIDENCE.json |
| SQL lint / security advisors | PASS under unchanged existing policy on both profiles, public/app_private/extensions lint; no global suppressions |
| General browser smoke | PASS52 desktop/mobile Chromium; existing `pnpm test:smoke:e2e --workers=1` |
| Existing complete Chromium Journey gate | PASS26 / SKIP7 explicit local-fixture cases on8d44ff2; includes630 DOM collision end states,86 screenshots and actual legacy performance budgets. Authenticated cases separately executed, not counted as passed skips. |
| Latest rich renderer/development/draft navigation | PASS14, exact latest source; see measured-scene-browser-regressions.log |
| Actual parent/child/instructor/theme/browser persistence | Separate local seeded sessions on real standalone, DB and storage. PASS12 in orientation-authenticated-browser.log; no in-memory service substitute. |
| Private file endpoints | Actual stored document/certificate/image hashes and canonical invoice PDF, private/no-store headers, scan/withdrawn/expired/unauthorized/child-approval boundaries. |
| Local payment provider rehearsal | PASS, actual standalone webhook calls a strictly loopback HTTP snapshot stub. Paid/failed, incorrect amount, duplicate webhook and parent page reload checked. No live/sandbox provider contacted. |
| Local Firefox/WebKit | NOT EXECUTED successfully: launcher lacks GTK/Cairo/GStreamer dependencies. Initial all-engine command exited1:64 launch failures plus one repaired streamed-loading race. Final keyboard test also waits for explicitly measured scene readiness before dispatching End. Final CI installs all engines independently. |
| Physical Android/iOS | NOT TESTED. Native contract/SQL suites pass; Android workflow follows existing path filters, not manually triggered. |

## Database artifact

157 SQL migrations =151 immutable canonical SQL files +6 additive migrations, maximum20260914145431.
Fingerprint `ec8535f2f83642e679a309bb3a4992af96581cf420e055abb2001069495157cd`.
Runtime schema contract5 retains its original compatibility floor/anchor. Candidate assertion requires all157 exact artifact members. Each missing-new-migration state is rejected. Canonical151 checkout's original commands/schema compatibility pass on157. See DATABASE-CERTIFICATION.md for scope and isolated DB profiles.

Full relevant existing database suites ran: swim canon, native commands, billing/offerings/holidays, theme planning, blackout/import fixes, planning concurrency, outbox, provisioning, onboarding, resumable5k import/restart/rollback, production readiness/crash windows and tenant/API/storage/role matrix. New theme lifecycle, real rich historical transitions, messages, reviewed assessments and collections ran against fresh secure grants and canonical-upgrade legacy grants. A third clean legacy DB verified all157 and the canonical rollback command set.

## Repairs and retained failed evidence

- Production streaming exposed two test races: measuring a scene before its loading boundary completed, and checking a final landmark while old/loading content coexisted. Tests now wait for actual final content; layout requirements were retained.
- Actual200% text inspection exposed scrolling away of dialog controls. The shared dialog now scrolls its content independently and keeps close/footer reachable; the real message review passes390x450 keyboard-area emulation. This is not a physical keyboard claim.
- Actual mobile image measurement exposed initial landscape downloads before viewport measurement. Image layers now wait for ResizeObserver; a real published-reference browser test forbids opposite-orientation requests until rotation.
- New private-file fixture initially mixed curriculum-stage and legacy certificate-stage IDs; its setup transaction failed. It now uses a distinct valid legacy stage without changing either production contract. New payment test's missing driver types/CommonJS import were corrected; initial failed logs remain evidence, not PASS.
- Earlier development build-cache/sharp path failures, SQL fixture collisions and tightened candidate inventory failures remain in their checkpoint logs. They are not retrospectively reclassified.

## Evidence and limits

FINAL-EVIDENCE.json hashes retained raw final logs, measurements and screenshots. Database/checkpoint artifacts retain their own hashes/source dates. TEST-RESULTS.json maps all83 supplied acceptance cases with explicit blocked/partial scope. Authentic Default1.1 manifest/anchors/96 assets remain B01; no complete Default visual gate is asserted. Reference artwork and labelled fallback fixtures are distinguishable in every relevant report.

Only local owned fixtures/DB/storage and the feature branch/PR are affected. No main merge, application deployment, remote DB migration, real provider action, email or payment occurred. Journey Bot remains retired.

GitHub PR/CI/review results are recorded in GITHUB-REVIEW.md after the feature push; previous baseline runs do not certify this branch.
