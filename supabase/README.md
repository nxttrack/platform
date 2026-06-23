# Supabase Foundation

Status: Phase 3 foundation only.

This folder is reserved for Supabase project configuration and migrations once the staging project is confirmed.

Current decisions:

- Use `@supabase/ssr` and `@supabase/supabase-js`.
- Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for browser/server SSR clients.
- Keep `SUPABASE_SECRET_KEY`, service-role style credentials, and `DATABASE_URL` server-only.
- Add explicit `GRANT` statements in migrations for tables that must be reachable through the Data API.
- Enable RLS on every exposed `public` table before adding access policies.
- Do not use `raw_user_meta_data` / `user_metadata` for authorization. Role and tenant membership data belongs in trusted database records and, where needed later, app metadata maintained by server-side code.

No migration has been committed in this phase because the Supabase staging project, connection string, and migration runner are not approved yet.
