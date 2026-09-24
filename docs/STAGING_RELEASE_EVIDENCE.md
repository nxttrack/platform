# Preserve verified staging evidence beside the deployed release

The staging browser gate runs on a hosted runner; the application runs on the
VPS. Its original release-evidence JSON used to remain only in the GitHub
artifact. Runtime rollback requires that evidence beside the immutable source
identity in each eligible server release. A successful application activation
alone does not make a release a validated rollback target.

The canonical deployment now has a final staging evidence job after both the
application and full browser jobs pass. It downloads their existing GitHub
artifact, verifies its SHA-256 archive digest and content, and preserves the
original `release-evidence.json` bytes beside the matching VPS release. It does
not manufacture a new result, replace the server's immutable source artifact,
change configuration, switch the active release, restart services or rerun tests.
Artifact retention is required; an upload failure fails the staging release.
Maintenance deployments that intentionally skip the full browser gate do not
create a validated staging release artifact and skip the persistence job.

The helper verifies repository, canonical branch, workflow, exact commit, run
and attempt, successful jobs and all mandatory gates, artifact provenance,
archive digest, JSON content, timing and the server release's immutable identity.
Only the two expected bounded JSON ZIP members are accepted. The destination
must be a packaged release directly inside the staging deployment root. Existing
byte-identical evidence is accepted; conflicting evidence is never overwritten.
Python 3's standard ZIP reader is required and checked before activation.

For a previously validated release whose original GitHub artifact is retained,
the same helper can restore only the missing evidence:

```sh
GITHUB_REPOSITORY=nxttrack/platform \
STAGING_EVIDENCE_SOURCE_SHA=<full-validated-sha> \
STAGING_EVIDENCE_RUN_ID=<successful-deploy-run-id> \
STAGING_EVIDENCE_RELEASE_DIRECTORY=/var/www/nxttrack/staging/releases/<exact-directory> \
node scripts/release/preserve-staging-release-evidence.mjs
```

`GITHUB_TOKEN` must be supplied through the workflow environment with Actions read
access. Never put it on the command line. Omit the directory override only when
restoring evidence for the active staging release. Coordinate this operation
with the staging deployment concurrency group. The helper also requires the
canonical `verify-production-evidence.mjs` beside it, which supplies the required
browser gate names. A failed browser run, including the interrupted 4248c35
release, cannot provide this evidence.

Validation: six behavior tests cover immutable identity and exact bytes,
wrong/failed/skipped source evidence, run-attempt timing, destination boundaries,
conflicting files, real ZIP checks and credential separation on blob downloads.
The fetch/validation path was additionally exercised read-only against genuine
successful historical run `35474984786` and artifact `10594980153` for
`6b3c9abb686be198830f417e663ac94124d7066f`; no VPS file was read or written by that
local validation. Whether an existing VPS release already has its evidence must
be checked on the host; source inspection alone does not establish file absence.
