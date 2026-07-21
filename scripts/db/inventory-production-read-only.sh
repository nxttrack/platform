#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[production:db-inventory] DATABASE_URL is required." >&2
  exit 1
fi

export PGDATABASE="$DATABASE_URL"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"
export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=15000"
unset DATABASE_URL

psql_command=(psql)

if ! command -v psql >/dev/null 2>&1; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "[production:db-inventory] psql or Docker is required on the audit runner." >&2
    exit 1
  fi

  postgres_image="${PRODUCTION_INVENTORY_POSTGRES_IMAGE:-postgres:17-alpine}"
  echo "[production:db-inventory] Local psql is unavailable; using ${postgres_image}."
  docker pull "$postgres_image" >/dev/null
  psql_command=(docker run --rm --network host -e PGDATABASE -e PGCONNECT_TIMEOUT -e PGOPTIONS "$postgres_image" psql)
fi

query() {
  "${psql_command[@]}" --dbname="$PGDATABASE" --no-psqlrc --no-align --tuples-only --set ON_ERROR_STOP=1 --command "$1"
}

read_only=$(query "show default_transaction_read_only;")

if [[ "$read_only" != "on" ]]; then
  echo "[production:db-inventory] The connection is not forced read-only." >&2
  exit 1
fi

server_version=$(query "select current_setting('server_version');")
schema_counts=$(query "select n.nspname || '=' || count(c.oid) from pg_namespace n left join pg_class c on c.relnamespace = n.oid and c.relkind in ('r','p') where n.nspname in ('public','app_private','auth','storage','supabase_migrations') group by n.nspname order by n.nspname;")
rls_counts=$(query "select count(*) || '|' || count(*) filter (where c.relrowsecurity) || '|' || count(*) filter (where c.relforcerowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p');")
extension_count=$(query "select count(*) from pg_extension;")
auth_user_count=-1
storage_object_count=-1

if [[ "$(query "select to_regclass('auth.users') is not null;")" == "t" ]]; then
  auth_user_count=$(query "select count(*) from auth.users;")
fi

if [[ "$(query "select to_regclass('storage.objects') is not null;")" == "t" ]]; then
  storage_object_count=$(query "select count(*) from storage.objects;")
fi

if [[ "$(query "select to_regclass('supabase_migrations.schema_migrations') is not null;")" != "t" ]]; then
  echo "[production:db-inventory] supabase_migrations.schema_migrations is missing." >&2
  exit 1
fi

if command -v rg >/dev/null 2>&1; then
  mapfile -t local_versions < <(rg --files supabase/migrations | sed -n 's#supabase/migrations/\([0-9][0-9]*\)_.*#\1#p' | sort -u)
else
  mapfile -t local_versions < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sed -n 's#\([0-9][0-9]*\)_.*#\1#p' | sort -u)
fi
mapfile -t remote_versions < <(query "select version::text from supabase_migrations.schema_migrations order by version;")

declare -A local_set=()
declare -A remote_set=()

for version in "${local_versions[@]}"; do
  local_set["$version"]=1
done

for version in "${remote_versions[@]}"; do
  remote_set["$version"]=1
done

missing_remote=0
unexpected_remote=0

for version in "${local_versions[@]}"; do
  if [[ -z "${remote_set[$version]:-}" ]]; then
    missing_remote=$((missing_remote + 1))
  fi
done

for version in "${remote_versions[@]}"; do
  if [[ -z "${local_set[$version]:-}" ]]; then
    unexpected_remote=$((unexpected_remote + 1))
  fi
done

IFS='|' read -r public_table_count rls_enabled_count force_rls_count <<< "$rls_counts"

echo "[production:db-inventory] PASS connection is transaction-read-only."
echo "[production:db-inventory] PostgreSQL ${server_version}; extensions=${extension_count}."

while IFS= read -r schema_count; do
  [[ -n "$schema_count" ]] && echo "[production:db-inventory] schema ${schema_count}."
done <<< "$schema_counts"

echo "[production:db-inventory] public tables=${public_table_count}; RLS enabled=${rls_enabled_count}; FORCE RLS=${force_rls_count}."
echo "[production:db-inventory] auth users=${auth_user_count}; storage objects=${storage_object_count}."
echo "[production:db-inventory] migrations repo=${#local_versions[@]}; remote=${#remote_versions[@]}; missing_remote=${missing_remote}; unexpected_remote=${unexpected_remote}."

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## Read-only production database inventory"
    echo
    echo "- Transaction read-only: on"
    echo "- PostgreSQL: ${server_version}"
    echo "- Public tables: ${public_table_count}"
    echo "- RLS enabled: ${rls_enabled_count}"
    echo "- FORCE RLS: ${force_rls_count}"
    echo "- Auth users: ${auth_user_count}"
    echo "- Storage objects: ${storage_object_count}"
    echo "- Repository migrations: ${#local_versions[@]}"
    echo "- Remote migrations: ${#remote_versions[@]}"
    echo "- Missing remotely: ${missing_remote}"
    echo "- Unexpected remotely: ${unexpected_remote}"
  } >> "$GITHUB_STEP_SUMMARY"
fi

echo "[production:db-inventory] PASS inventory completed without database writes."
