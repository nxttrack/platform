#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "Usage: $0 <staging|production> <absolute-release-directory> [--check-only]" >&2
  exit 2
}

[[ $# -eq 2 || $# -eq 3 ]] || usage
rollback_environment="$1"
case "$rollback_environment" in staging|production) ;; *) usage ;; esac
[[ "$2" == /* && "$2" != *$'\n'* ]] || usage
[[ $# -eq 2 || "$3" == --check-only ]] || usage
rollback_check_only="${3:-}"
rollback_base_dir="${ROLLBACK_BASE_DIR:-/var/www/nxttrack/$rollback_environment}"
rollback_base_dir=$(realpath "$rollback_base_dir")
[[ "$(basename "$rollback_base_dir")" == "$rollback_environment" ]] || {
  echo "[rollback:rehearsal] Deployment directory does not match the explicit environment." >&2
  exit 1
}
rollback_service_name="${ROLLBACK_SERVICE_NAME:-nxttrack-$rollback_environment}"
[[ "$rollback_service_name" == "nxttrack-$rollback_environment" ]] || {
  echo "[rollback:rehearsal] Service does not match the explicit environment." >&2
  exit 1
}
if [[ "$rollback_environment" == production ]]; then
  rollback_default_health_url=https://nxttrack.nl/api/health
else
  rollback_default_health_url=https://staging.nxttrack.nl/api/health
fi
rollback_health_url="${ROLLBACK_HEALTH_URL:-$rollback_default_health_url}"
rollback_script_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
rollback_source_checkout="${GITHUB_WORKSPACE:-$(dirname "$(dirname "$rollback_script_root")")}"
rollback_shared_env="$rollback_base_dir/shared/.env"
rollback_current_link="$rollback_base_dir/current"
rollback_restore_required=false
rollback_snapshot_directory=""

[[ -L "$rollback_current_link" && -f "$rollback_shared_env" && ! -L "$rollback_shared_env" ]] || {
  echo "[rollback:rehearsal] Expected current symlink and regular shared/.env are required." >&2
  exit 1
}
# Workflow concurrency serializes deploys. This additional lock prevents two
# manually started rehearsals from restoring each other's shared environment.
exec {rollback_lock_fd}>"$rollback_base_dir/shared/.runtime-rollback.lock"
flock --nonblock "$rollback_lock_fd" || {
  echo "[rollback:rehearsal] Another rollback rehearsal holds the deployment lock." >&2
  exit 1
}

# No runtime mutation precedes these checks. Deliberately allow only an
# application rollback within an identical database migration/compatibility
# contract. A schema-changing rollback needs its separate restore procedure.
rollback_state=$(node --input-type=module - "$rollback_script_root" "$rollback_base_dir" "$2" "$rollback_source_checkout" "$rollback_environment" "$rollback_health_url" <<'NODE'
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
const [scripts, baseDirectory, candidateDirectory, sourceCheckout, environment, healthUrl] = process.argv.slice(2);
const { assertRollbackRelease } = await import(pathToFileURL(join(scripts, 'assert-rollback-release.mjs')));
const sharedEnvironmentPath = join(baseDirectory, 'shared', '.env');
const current = assertRollbackRelease({ baseDirectory, releaseDirectory: realpathSync(join(baseDirectory, 'current')), sourceCheckout });
const candidate = assertRollbackRelease({ baseDirectory, releaseDirectory: candidateDirectory, sourceCheckout, sharedEnvironmentPath });
assert.notEqual(candidate.releaseDirectory, current.releaseDirectory, 'Rollback target is already current.');
const runtime = parseEnv(readFileSync(sharedEnvironmentPath, 'utf8'));
assert.equal(runtime.APP_ENV, environment, 'Shared runtime environment does not match the requested target.');
assert.equal(new URL(healthUrl).href, new URL('/api/health', runtime.APP_URL).href, 'Health URL does not match the shared runtime APP_URL.');
const git = (...args) => execFileSync('git', args, { cwd: sourceCheckout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
git('merge-base', '--is-ancestor', candidate.commitSha, current.commitSha);
const contractPath = 'apps/web/lib/release/schema-compatibility.ts';
const expectedContract = git('show', `${current.commitSha}:${contractPath}`);
assert.equal(git('show', `${candidate.commitSha}:${contractPath}`), expectedContract, 'Rollback candidate has a different runtime schema contract.');
assert.equal(git('rev-parse', `${candidate.commitSha}:supabase/migrations`), git('rev-parse', `${current.commitSha}:supabase/migrations`), 'Rollback candidate has different migrations; use a separately verified schema recovery.');
for (const release of [current, candidate]) {
  assert.ok(existsSync(join(release.releaseDirectory, 'artifacts', 'exact-source-sha.json')), 'Immutable release artifact is required.');
  const evidence = JSON.parse(readFileSync(join(release.releaseDirectory, 'artifacts', 'release-evidence.json'), 'utf8'));
  assert.equal(evidence.application, 'nxttrack-platform', 'Unexpected release application.');
  assert.equal(evidence.target, environment, 'Release evidence belongs to a different environment.');
  assert.equal(evidence.source?.commitSha, release.commitSha, 'Release evidence and immutable artifact disagree.');
  assert.equal(readFileSync(join(release.releaseDirectory, contractPath), 'utf8').trim(), expectedContract, 'Packaged schema contract differs from immutable source.');
  for (const name of ['.env', '.env.production']) {
    const path = join(release.releaseDirectory, name);
    assert.ok(lstatSync(path).isSymbolicLink(), 'Rehearsal requires the canonical shared environment links.');
    assert.equal(realpathSync(path), realpathSync(sharedEnvironmentPath), 'Release environment link points outside this deployment.');
  }
}
for (const value of [current.releaseDirectory, current.commitSha, candidate.releaseDirectory, candidate.commitSha]) console.log(value);
NODE
)
mapfile -t rollback_state_values <<< "$rollback_state"
rollback_original_release="${rollback_state_values[0]}"
rollback_original_commit="${rollback_state_values[1]}"
rollback_previous_release="${rollback_state_values[2]}"
rollback_previous_commit="${rollback_state_values[3]}"

read_healthy_commit() {
  local expected_commit="$1"
  local health_payload=""
  for _ in {1..20}; do
    if health_payload=$(curl --fail --silent --show-error --max-time 10 "$rollback_health_url"); then
      if printf '%s' "$health_payload" | node -e '
        let input = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", chunk => { input += chunk; });
        process.stdin.on("end", () => {
          try {
            const body = JSON.parse(input);
            if (body.ok !== true || body.app !== "nxttrack-platform"
              || body.env !== process.argv[2] || body.commitSha !== process.argv[1]
              || body.checks?.database?.status !== "pass"
              || body.checks?.schemaCompatibility?.status !== "pass") process.exit(1);
          } catch { process.exit(1); }
        });
      ' "$expected_commit" "$rollback_environment"; then
        return 0
      fi
    fi
    sleep 3
  done
  echo "[rollback:rehearsal] Exact-SHA, environment, database and schema health did not pass after 20 attempts." >&2
  return 1
}

read_service_pid() {
  systemctl show --property MainPID --value "$rollback_service_name"
}

assert_service_release() {
  local expected_release="$1"
  local service_pid
  service_pid=$(read_service_pid)
  [[ "$service_pid" =~ ^[1-9][0-9]*$ ]] &&
    [[ "$(systemctl show --property ActiveState --value "$rollback_service_name")" == active ]] &&
    [[ "$(readlink -f "$rollback_current_link")" == "$expected_release" ]] || {
      echo "[rollback:rehearsal] Active service or current symlink does not match the validated release." >&2
      return 1
    }
}

require_new_service_pid() {
  [[ "$(read_service_pid)" != "$1" ]] || {
    echo "[rollback:rehearsal] Service PID did not change after restart." >&2
    return 1
  }
}

switch_release() {
  local target="$1" snapshot="$2" next_environment
  next_environment=$(mktemp "$rollback_base_dir/shared/.env.rollback.XXXXXX") || return 1
  cp "$snapshot" "$next_environment" &&
    chmod --reference="$rollback_shared_env" "$next_environment" &&
    chgrp --reference="$rollback_shared_env" "$next_environment" &&
    mv -f "$next_environment" "$rollback_shared_env" || {
      rm -f "$next_environment"
      return 1
    }
  ln -sfn "$target" "$rollback_base_dir/current.new" &&
    mv -Tf "$rollback_base_dir/current.new" "$rollback_current_link" &&
    sudo systemctl restart "$rollback_service_name"
}

restore_original_release() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ "$rollback_restore_required" == true ]]; then
    echo "[rollback:rehearsal] Cleanup: restoring the original runtime and exact environment."
    if switch_release "$rollback_original_release" "$rollback_snapshot_directory/original.env" &&
      assert_service_release "$rollback_original_release" &&
      read_healthy_commit "$rollback_original_commit"; then
      rollback_restore_required=false
    else
      echo "[rollback:rehearsal] Restore failed; preserved environment snapshot at $rollback_snapshot_directory/original.env" >&2
      exit_code=1
    fi
  fi
  if [[ "$rollback_restore_required" == false && -n "$rollback_snapshot_directory" ]]; then
    rm -rf -- "$rollback_snapshot_directory"
  fi
  exit "$exit_code"
}
trap restore_original_release EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

assert_service_release "$rollback_original_release"
read_healthy_commit "$rollback_original_commit"
echo "[rollback:rehearsal] Preflight PASS environment=$rollback_environment current=$rollback_original_commit candidate=$rollback_previous_commit."
if [[ "$rollback_check_only" == --check-only ]]; then
  echo "[rollback:rehearsal] Check-only complete; runtime and environment were not changed."
  exit 0
fi

rollback_snapshot_directory=$(mktemp -d "$rollback_base_dir/shared/.rollback-rehearsal.XXXXXX")
chmod 700 "$rollback_snapshot_directory"
cp --preserve=mode "$rollback_shared_env" "$rollback_snapshot_directory/original.env"
node --input-type=module - "$rollback_snapshot_directory" "$rollback_previous_commit" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [directory, commit] = process.argv.slice(2);
const changes = new Map(Object.entries({
  RELEASE_COMMIT_SHA: commit,
  // Shared metadata cannot recover an inactive artifact's original build time.
  RELEASE_BUILD_TIME: '', BUILD_TIMESTAMP: '',
  MAINTENANCE_NO_WRITE: 'true', EMAIL_SENDING_ENABLED: 'false',
  NEWSLETTER_DELIVERY_ENABLED: 'false', INTERNAL_JOBS_ENABLED: 'false'
}));
let snapshot = readFileSync(join(directory, 'original.env'), 'utf8').split(/\r?\n/)
  .filter(line => !changes.has(line.match(/^([A-Z_]+)=/)?.[1])).join('\n');
for (const [key, value] of changes) snapshot += `\n${key}=${value}`;
writeFileSync(join(directory, 'candidate.env'), `${snapshot}\n`, { mode: 0o600 });
NODE
rollback_original_pid=$(read_service_pid)
rollback_restore_required=true
switch_release "$rollback_previous_release" "$rollback_snapshot_directory/candidate.env"
assert_service_release "$rollback_previous_release"
require_new_service_pid "$rollback_original_pid"
read_healthy_commit "$rollback_previous_commit"
rollback_previous_pid=$(read_service_pid)
echo "[rollback:rehearsal] PASS validated candidate is active with maintenance containment."

switch_release "$rollback_original_release" "$rollback_snapshot_directory/original.env"
assert_service_release "$rollback_original_release"
require_new_service_pid "$rollback_previous_pid"
read_healthy_commit "$rollback_original_commit"
rollback_restore_required=false
echo "[rollback:rehearsal] PASS original release and exact shared environment restored."

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## $rollback_environment runtime rollback rehearsal"
    echo
    echo "- Validated candidate: \`$rollback_previous_commit\`"
    echo "- Original runtime and environment restored: \`$rollback_original_commit\`"
    echo "- Both identities, environment, database and schema health verified."
    echo "- Candidate served in maintenance mode; database migrations were not changed."
  } >> "$GITHUB_STEP_SUMMARY"
fi
