# Supabase Foundation

Status: Phase 3, Phase 4, Phase 5, Phase 6, Phase 7, Phase 8, Phase 9, Phase 10 and Phase 11 migrations prepared, not connected to staging yet.

This folder contains Supabase migration files and project notes. Migrations are committed as source-of-truth SQL, but deployment execution waits for the approved staging Supabase project and runner command.

Current decisions:

- Use `@supabase/ssr` and `@supabase/supabase-js`.
- Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for browser/server SSR clients when available.
- The current GitHub Environments may still provide `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the app and deploy workflow accept it as the publishable client key.
- Keep `SUPABASE_SECRET_KEY`, service-role style credentials such as `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL` server-only.
- Add explicit `GRANT` statements in migrations for tables that must be reachable through the Data API.
- Enable RLS on every exposed `public` table before adding access policies.
- Do not use `raw_user_meta_data` / `user_metadata` for authorization. Role and tenant membership data belongs in database tables or app metadata controlled by trusted server code.

Current migrations:

- `20260623222604_identity_boundary.sql` creates the identity boundary: profiles, tenants, tenant domains, tenant settings, tenant memberships, platform memberships, helper functions, explicit grants and RLS policies.
- `20260707152802_phase_3_auth_flows.sql` adds auth invitations, user security state, password reset challenges, explicit grants and RLS policies.
- `20260707160455_phase_4_core_domain_model.sql` adds programs, stages, resources, groups, sessions, instructor assignments, participants, enrollments, group memberships, capacity fields, explicit grants and RLS policies.
- `20260707162139_phase_5_public_tenant_site_intake.sql` adds intake forms, dynamic questions, submissions, answers, tenant events, explicit grants and RLS policies.
- `20260707163627_phase_6_waitlist_placement_slot_offers.sql` adds waitlist entries, placement recommendations, placement scores, slot offers, placement audit events, explicit grants and RLS policies.
- `20260707165845_phase_7_parent_portal_self_service.sql` adds parent-mediated participant links, lesson cancellations, catch-up credits, cancellation policy settings, profile phone support, explicit grants and RLS policies.
- `20260707171704_phase_8_instructor_shell_attendance_progress.sql` adds session attendance, progress notes, badge definitions, participant badge awards, instructor-scoped helper functions, explicit grants and RLS policies.
- `20260707173644_phase_9_progress_badges_notifications.sql` adds progress modules/items, participant progress scores, tenant notifications, badge catalog metadata, explicit grants and RLS policies.
- `20260707180102_phase_10_graduation_diploma_vault.sql` adds graduation readiness, graduation events, event participants, certificate records, diploma-vault access policies, notification types, explicit grants and RLS policies.
- `20260707181731_phase_11_manual_payments_subscriptions.sql` adds payment plans, subscriptions, manual payments, billing events, payment notification types, explicit grants and RLS policies.
- `20260720232500_reload_postgrest_schema.sql` explicitly reloads the PostgREST schema cache after a restored or newly migrated environment before bootstrap begins.

The `pnpm run db:migrate` command remains a safe guardrail. It skips unless `RUN_DB_MIGRATIONS=true` is set. When enabled, it requires `DATABASE_URL` and runs `supabase db push --db-url ... --yes`.
