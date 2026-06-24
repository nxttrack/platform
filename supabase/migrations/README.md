# Supabase Migrations

Migrations in this folder are source-of-truth SQL for the NXTTRACK staging and production databases.

Create migrations with the Supabase CLI instead of hand-writing timestamp filenames:

```txt
supabase migration new <descriptive-name>
```

Every migration that exposes `public` tables to Supabase Data API must include:

- Explicit `GRANT` statements for `anon`, `authenticated`, and/or `service_role` as appropriate.
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- Policies using `TO authenticated` plus tenant/user ownership predicates.
- `USING` and `WITH CHECK` for updates.

Current migration:

- `20260623222604_identity_boundary.sql`

Run database advisors before applying schema changes to a live Supabase project.
