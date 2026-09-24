# Post-reconciliation canonical main baseline

CANONICAL_V42_BASELINE_SHA=77c22b1cb10833811c0552b3160fcef1844c6368

PR #57 was merged through GitHub's merge API with the approved-head SHA guard on
2026-09-13 at 17:32:32 UTC (19:32:32 Europe/Amsterdam).
Approved head: `d9e983b93de9d2a52ee221dcbd2fbc6dafd86c44`.
Merge commit and canonical main: `77c22b1cb10833811c0552b3160fcef1844c6368`.

The real merge commit has exactly two parents:

1. `0fa158fb0abc7fdfe781a103a4c83b016edcba45` (previous main).
2. `d9e983b93de9d2a52ee221dcbd2fbc6dafd86c44` (approved PR head).

Both the approved head and compatibility anchor
`12b4885a55c439caa2a7aa180d597e72baf9d2d5` pass `git merge-base --is-ancestor`
against canonical main (exit 0). The merge tree equals the approved PR tree.
Before merging: 20 PR commits, seven resolved review threads, zero open threads,
latest Codex review on d9e983b reported no major issues, both approved-head CI runs
successful. No squash, rebase, force push or manual code push to main occurred.

Post-merge CI, both `push` runs on the merge SHA itself:

- [Web CI 34771906412](https://github.com/nxttrack/platform/actions/runs/34771906412): SUCCESS; 464 units, 52 browser smoke checks, 31 Journey tests passed; 17 explicitly skipped scenarios. Chromium, Firefox and WebKit actually ran.
- [Android native CI 34771906328](https://github.com/nxttrack/platform/actions/runs/34771906328): SUCCESS; native quality gate, both debug/instrumentation APKs and unsigned release bundles. Instrumentation APK construction is not a claim of device execution.

Only after both runs succeeded, a clean isolated checkout on local `main` at the
merge SHA passed a new frozen install, `pnpm audit --prod --json`,
`pnpm audit --prod`, the unchanged production policy gate, typecheck, all 464 units,
production build, standalone packaging, repository truth, Lovable baseline, auth,
migration, RLS, Journey Bot and runtime-environment audits. Production advisories:
zero. Migration inventory: 147. Original user workspace changes were preserved.
The isolated main working tree was clean before and after validation.

[Recorded commands, exit codes, timings and log hashes](2026-09-13-sql-lint-pre-v42/baseline-local-results.json),
[merge proof](2026-09-13-sql-lint-pre-v42/merge-proof.json) and
[canonical migration hashes](2026-09-13-sql-lint-pre-v42/canonical-source-snapshot.json).
The SQL lint errors remain separate from these green canonical gates and are
investigated in [the phase 0.2 report](../../SQL-LINT-FASE-0.2-REPORT.md).

No deployment performed.
V4.2 has not started yet.

This record is committed only on the new SQL-lint featurebranch, never directly to main.
