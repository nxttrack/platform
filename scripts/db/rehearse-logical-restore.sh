#!/usr/bin/env bash

set -Eeuo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[backup:restore] DATABASE_URL is required." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "[backup:restore] Docker is required for the isolated restore target." >&2
  exit 1
fi

script_dir="$(dirname "$(realpath "${BASH_SOURCE[0]}")")"
work_dir="$(mktemp -d -t nxttrack-restore-XXXXXX)"
container_name="nxttrack-restore-${GITHUB_RUN_ID:-local}-${RANDOM}"
postgres_image="${POSTGRES_REHEARSAL_IMAGE:-postgres:17}"
restore_password="nxttrack-restore-only-${RANDOM}-${RANDOM}"
expected_public_tables="${EXPECTED_PUBLIC_TABLES:-63}"

cleanup() {
  if [[ "$container_name" == nxttrack-restore-* ]]; then
    docker rm --force "$container_name" >/dev/null 2>&1 || true
  fi

  case "$work_dir" in
    /tmp/nxttrack-restore-*) rm -rf -- "$work_dir" ;;
  esac
}

trap cleanup EXIT INT TERM

echo "[backup:restore] Pulling pinned PostgreSQL rehearsal image ${postgres_image}."
docker pull "$postgres_image" >/dev/null

echo "[backup:restore] Creating a logical dump of public and app_private."
docker run --rm --interactive --network host \
  --env SOURCE_DATABASE_URL="$DATABASE_URL" \
  "$postgres_image" \
  sh -ceu 'pg_dump --dbname="$SOURCE_DATABASE_URL" --format=custom --schema=public --schema=app_private --no-owner --no-privileges' \
  > "$work_dir/nxttrack.dump"

dump_size="$(stat --format='%s' "$work_dir/nxttrack.dump")"
dump_sha="$(sha256sum "$work_dir/nxttrack.dump" | cut -d' ' -f1)"

if [[ "$dump_size" -le 0 ]]; then
  echo "[backup:restore] The logical dump is empty." >&2
  exit 1
fi

echo "[backup:restore] Starting isolated PostgreSQL restore target."
docker run --detach \
  --name "$container_name" \
  --publish 127.0.0.1::5432 \
  --env POSTGRES_DB=nxttrack_restore \
  --env POSTGRES_PASSWORD="$restore_password" \
  "$postgres_image" >/dev/null

for attempt in $(seq 1 30); do
  if docker exec "$container_name" pg_isready --username postgres --dbname nxttrack_restore >/dev/null 2>&1; then
    break
  fi

  if [[ "$attempt" -eq 30 ]]; then
    echo "[backup:restore] Restore target did not become ready." >&2
    exit 1
  fi

  sleep 1
done

target_port="$(docker port "$container_name" 5432/tcp | awk -F: 'NR == 1 { print $NF }')"
target_database_url="postgresql://postgres:${restore_password}@127.0.0.1:${target_port}/nxttrack_restore"

echo "[backup:restore] Preparing Supabase-compatible identity stubs."
docker run --rm --interactive --network host \
  --env TARGET_DATABASE_URL="$target_database_url" \
  "$postgres_image" \
  sh -ceu 'psql "$TARGET_DATABASE_URL" --set=ON_ERROR_STOP=1 >/dev/null' \
  < "$script_dir/restore-target-bootstrap.sql"

echo "[backup:restore] Restoring schema, constraints, policies and data."
for section in pre-data post-data; do
  docker run --rm --interactive --network host \
    --env TARGET_DATABASE_URL="$target_database_url" \
    --env RESTORE_SECTION="$section" \
    "$postgres_image" \
    sh -ceu 'pg_restore --dbname="$TARGET_DATABASE_URL" --exit-on-error --no-owner --no-privileges --section="$RESTORE_SECTION"' \
    < "$work_dir/nxttrack.dump"
done

docker run --rm --interactive --network host \
  --env TARGET_DATABASE_URL="$target_database_url" \
  "$postgres_image" \
  sh -ceu 'pg_restore --dbname="$TARGET_DATABASE_URL" --exit-on-error --no-owner --no-privileges --disable-triggers --section=data' \
  < "$work_dir/nxttrack.dump"

echo "[backup:restore] Comparing every public table row count."
docker run --rm --interactive --network host \
  --env DATABASE_URL \
  "$postgres_image" \
  sh -ceu 'psql "$DATABASE_URL" --no-psqlrc --quiet' \
  < "$script_dir/table-row-counts.sql" \
  > "$work_dir/source-counts.txt"

docker run --rm --interactive --network host \
  --env TARGET_DATABASE_URL="$target_database_url" \
  "$postgres_image" \
  sh -ceu 'psql "$TARGET_DATABASE_URL" --no-psqlrc --quiet' \
  < "$script_dir/table-row-counts.sql" \
  > "$work_dir/target-counts.txt"

if ! diff --unified=3 "$work_dir/source-counts.txt" "$work_dir/target-counts.txt"; then
  echo "[backup:restore] Source and restored table counts differ." >&2
  exit 1
fi

public_table_count="$(grep -c $'\t' "$work_dir/target-counts.txt")"
restored_row_count="$(awk -F $'\t' '{ total += $2 } END { print total + 0 }' "$work_dir/target-counts.txt")"

if [[ "$public_table_count" -ne "$expected_public_tables" ]]; then
  echo "[backup:restore] Expected ${expected_public_tables} public tables, restored ${public_table_count}." >&2
  exit 1
fi

echo "[backup:restore] PASS restored ${public_table_count} public tables and ${restored_row_count} rows with exact count parity."
echo "[backup:restore] Dump bytes=${dump_size} sha256=${dump_sha} source_commit=${GITHUB_SHA:-local}."

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## Staging logical backup/restore rehearsal"
    echo
    echo "- Commit: \`${GITHUB_SHA}\`"
    echo "- Public tables restored: ${public_table_count}"
    echo "- Public rows restored: ${restored_row_count}"
    echo "- Dump size: ${dump_size} bytes"
    echo "- Dump SHA-256: \`${dump_sha}\`"
    echo "- Result: exact source/target row-count parity"
    echo
    echo "The temporary dump and restore database were destroyed at job exit. Managed Supabase backup retention and point-in-time recovery still require a separate provider-side confirmation."
  } >> "$GITHUB_STEP_SUMMARY"
fi
