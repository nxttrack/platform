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

check "base-directory" "${base_dir} exists." test -d "$base_dir"
check "release-directory" "${base_dir}/releases exists." test -d "$base_dir/releases"
check "shared-directory" "${base_dir}/shared exists." test -d "$base_dir/shared"
check "service-unit" "systemd knows ${service_name}." systemctl cat "$service_name"
check "service-enabled" "${service_name} is enabled." systemctl is-enabled --quiet "$service_name"
check "caddy-unit" "Caddy is active." systemctl is-active --quiet caddy
check "caddy-config" "The active Caddy configuration validates." sudo caddy validate --config /etc/caddy/Caddyfile

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
