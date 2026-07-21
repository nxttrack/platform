#!/usr/bin/env bash
set -euo pipefail

base_dir="${PRODUCTION_BASE_DIR:-/var/www/nxttrack/production}"
service_name="${SERVICE_NAME:-nxttrack-production}"
port="${PORT:-3800}"
failures=0

check() {
  local id="$1"
  local message="$2"
  shift 2

  if "$@" >/dev/null 2>&1; then
    echo "[production:host] PASS ${id}: ${message}"
  else
    echo "[production:host] FAIL ${id}: ${message}" >&2
    failures=$((failures + 1))
  fi
}

check_caddy_config() {
  local unprivileged_output=""
  local elevated_output=""

  if unprivileged_output=$(caddy validate --config /etc/caddy/Caddyfile 2>&1); then
    echo "[production:host] PASS caddy-config: The active Caddy configuration validates without elevation."
    return
  fi

  if elevated_output=$(sudo -n caddy validate --config /etc/caddy/Caddyfile 2>&1); then
    echo "[production:host] PASS caddy-config: The active Caddy configuration validates with read-only elevation."
    return
  fi

  echo "[production:host] FAIL caddy-config: The active Caddy configuration could not be validated." >&2
  printf '%s\n' "$unprivileged_output" | tail -n 6 | sed 's/^/[production:host] DETAIL caddy-unprivileged: /' >&2
  printf '%s\n' "$elevated_output" | tail -n 3 | sed 's/^/[production:host] DETAIL caddy-elevated: /' >&2
  failures=$((failures + 1))
}

check "base-directory" "${base_dir} exists." test -d "$base_dir"
check "release-directory" "${base_dir}/releases exists." test -d "$base_dir/releases"
check "shared-directory" "${base_dir}/shared exists." test -d "$base_dir/shared"
check "service-unit" "systemd knows ${service_name}." systemctl cat "$service_name"
check "service-enabled" "${service_name} is enabled." systemctl is-enabled --quiet "$service_name"
check "caddy-unit" "Caddy is active." systemctl is-active --quiet caddy
check_caddy_config

if ss -ltnH "sport = :${port}" | grep -q .; then
  echo "[production:host] PASS port: Port ${port} has a listening socket."
else
  echo "[production:host] INFO port: Port ${port} is reserved but not listening before the first production deploy."
fi

if (( failures > 0 )); then
  echo "[production:host] Audit blocked by ${failures} failure(s)." >&2
  exit 1
fi

echo "[production:host] PASS production host foundation is present."
