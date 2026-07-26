#!/usr/bin/env bash

set -euo pipefail

rollback_base_dir="${ROLLBACK_BASE_DIR:-/var/www/nxttrack/staging}"
rollback_service_name="${ROLLBACK_SERVICE_NAME:-nxttrack-staging}"
rollback_health_url="${ROLLBACK_HEALTH_URL:-https://staging.nxttrack.nl/api/health}"
rollback_release_root="$rollback_base_dir/releases"
rollback_current_link="$rollback_base_dir/current"
rollback_restore_required=false

require_release_path() {
  local candidate="$1"

  case "$candidate" in
    "$rollback_release_root"/*) ;;
    *)
      echo "[rollback:rehearsal] Refusing release outside $rollback_release_root: $candidate" >&2
      return 1
      ;;
  esac

  if [[ ! -d "$candidate" ]]; then
    echo "[rollback:rehearsal] Release directory does not exist: $candidate" >&2
    return 1
  fi

  if [[ ! -f "$candidate/apps/web/.next/standalone/apps/web/server.js" ]]; then
    echo "[rollback:rehearsal] Release is missing the packaged web server: $candidate" >&2
    return 1
  fi
}

switch_release() {
  local target="$1"

  require_release_path "$target"
  ln -sfn "$target" "$rollback_base_dir/current.new"
  mv -Tf "$rollback_base_dir/current.new" "$rollback_current_link"
  sudo systemctl restart "$rollback_service_name"
}

read_healthy_commit() {
  local health_payload=""
  local health_commit=""

  for _ in {1..20}; do
    if health_payload=$(curl --fail --silent --show-error --max-time 10 "$rollback_health_url"); then
      if health_commit=$(printf '%s' "$health_payload" | node -e '
        let input = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => { input += chunk; });
        process.stdin.on("end", () => {
          const body = JSON.parse(input);
          if (body.ok !== true || body.app !== "nxttrack-platform") process.exit(2);
          if (body.checks?.database?.status !== "pass") process.exit(3);
          process.stdout.write(body.commitSha ?? "");
        });
      '); then
        if [[ -n "$health_commit" ]]; then
          printf '%s\n' "$health_commit"
          return 0
        fi

        echo "[rollback:rehearsal] Health is up but does not expose a release commit; retrying." >&2
      fi
    fi

    sleep 3
  done

  echo "[rollback:rehearsal] Database-aware health did not pass within 60 seconds." >&2
  return 1
}

assert_service_release() {
  local expected_release="$1"
  local service_pid=""
  local service_state=""
  local active_release=""

  service_pid=$(systemctl show --property MainPID --value "$rollback_service_name")
  if [[ ! "$service_pid" =~ ^[1-9][0-9]*$ ]]; then
    echo "[rollback:rehearsal] Service has no active MainPID: $rollback_service_name" >&2
    return 1
  fi

  service_state=$(systemctl show --property ActiveState --value "$rollback_service_name")
  if [[ "$service_state" != "active" ]]; then
    echo "[rollback:rehearsal] Service state is '$service_state', expected 'active'." >&2
    return 1
  fi

  active_release=$(readlink -f "$rollback_current_link")
  if [[ "$active_release" != "$expected_release" ]]; then
    echo "[rollback:rehearsal] Current symlink targets '$active_release', expected '$expected_release'." >&2
    return 1
  fi

  echo "[rollback:rehearsal] Service PID $service_pid is active with $(basename "$active_release")."
}

read_service_pid() {
  systemctl show --property MainPID --value "$rollback_service_name"
}

require_new_service_pid() {
  local previous_pid="$1"
  local current_pid=""

  current_pid=$(read_service_pid)
  if [[ "$current_pid" == "$previous_pid" ]]; then
    echo "[rollback:rehearsal] Service PID did not change after restart: $current_pid" >&2
    return 1
  fi
}

restore_original_release() {
  local exit_code=$?
  trap - EXIT INT TERM

  if [[ "$rollback_restore_required" == true ]]; then
    echo "[rollback:rehearsal] Cleanup: restoring $rollback_original_release."
    if switch_release "$rollback_original_release"; then
      assert_service_release "$rollback_original_release" || exit_code=1
      read_healthy_commit >/dev/null || exit_code=1
    else
      exit_code=1
    fi
  fi

  exit "$exit_code"
}

trap restore_original_release EXIT INT TERM

if [[ ! -L "$rollback_current_link" ]]; then
  echo "[rollback:rehearsal] Current release is not a symlink: $rollback_current_link" >&2
  exit 1
fi

rollback_original_release=$(readlink -f "$rollback_current_link")
require_release_path "$rollback_original_release"
rollback_original_name=$(basename "$rollback_original_release")

rollback_previous_release=""
while IFS= read -r rollback_candidate; do
  rollback_candidate=$(readlink -f "$rollback_candidate")
  if [[ "$rollback_candidate" != "$rollback_original_release" ]]; then
    rollback_previous_release="$rollback_candidate"
    break
  fi
done < <(find "$rollback_release_root" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)

if [[ -z "$rollback_previous_release" ]]; then
  echo "[rollback:rehearsal] No previous release is available." >&2
  exit 1
fi

require_release_path "$rollback_previous_release"
rollback_previous_name=$(basename "$rollback_previous_release")

echo "[rollback:rehearsal] Current release: $rollback_original_name"
echo "[rollback:rehearsal] Previous release: $rollback_previous_name"

assert_service_release "$rollback_original_release"
read_healthy_commit >/dev/null
rollback_original_pid=$(read_service_pid)

rollback_restore_required=true
switch_release "$rollback_previous_release"
assert_service_release "$rollback_previous_release"
require_new_service_pid "$rollback_original_pid"
rollback_previous_pid=$(read_service_pid)
rollback_previous_health_commit=$(read_healthy_commit)
echo "[rollback:rehearsal] PASS previous release is active and healthy."

switch_release "$rollback_original_release"
assert_service_release "$rollback_original_release"
require_new_service_pid "$rollback_previous_pid"
rollback_original_health_commit=$(read_healthy_commit)
rollback_restore_required=false
echo "[rollback:rehearsal] PASS original release restored and healthy."

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## Staging rollback rehearsal"
    echo
    echo "- Previous runtime verified: \`$rollback_previous_name\`"
    echo "- Original runtime restored: \`$rollback_original_name\`"
    echo "- Shared health metadata reported: \`$rollback_previous_health_commit\` → \`$rollback_original_health_commit\`"
    echo "- Database migrations were not rolled back."
  } >> "$GITHUB_STEP_SUMMARY"
fi
