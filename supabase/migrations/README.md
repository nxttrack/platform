# Migrations

No migrations yet.

When the staging Supabase project exists, create migrations with the Supabase CLI instead of hand-writing timestamp filenames:

```txt
supabase migration new <descriptive-name>
```

Every migration that exposes `public` tables to Supabase Data API must include:

- Explicit `GRANT` statements for `anon`, `authenticated`, and/or `service_role` as appropriate.
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
- Policies using `TO authenticated` plus tenant/user ownership predicates.
- `USING` and `WITH CHECK` for updates.

Run database advisors before merging schema changes.
