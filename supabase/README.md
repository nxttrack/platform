# Supabase Foundation

Status: Phase 3 identity-boundary migration prepared, not connected to staging yet.

This folder contains Supabase migration files and project notes. Migrations are committed as source-of-truth SQL, but deployment execution waits for the approved staging Supabase project and runner command.

Current decisions:

- Use `@supabase/ssr` and `@supabase/supabase-js`.
- Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for browser/server SSR clients.
- Keep `SUPABASE_SECRET_KEY`, service-role style credentials, and `DATABASE_URL` server-only.
- Add explicit `GRANT` statements in migrations for tables that must be reachable through the Data API.
- Enable RLS on every exposed `public` table before adding access policies.
- Do not use `raw_user_meta_data` / `user_metadata` for authorization. Role and tenant membership data belongs in database tables or app metadata controlled by trusted server code.

Current migration:

- `20260623222604_identity_boundary.sql` creates the identity boundary: profiles, tenants, tenant domains, tenant settings, tenant memberships, platform memberships, helper functions, explicit grants and RLS policies.

The `pnpm run db:migrate` command remains a safe guardrail. It skips unless `RUN_DB_MIGRATIONS=true` is set. When enabled, it requires `DATABASE_URL` and runs `supabase db push --db-url ... --yes`.
