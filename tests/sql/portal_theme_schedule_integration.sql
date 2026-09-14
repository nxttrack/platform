begin;

-- Existing published releases only; no theme assets or catalog entries are imported.
do $$
declare
  manager uuid := gen_random_uuid();
  revoked_manager uuid := gen_random_uuid();
  tenant_a uuid := gen_random_uuid();
  tenant_b uuid := gen_random_uuid();
  tenant_c uuid := gen_random_uuid();
  first_release public.portal_theme_release%rowtype;
  next_release public.portal_theme_release%rowtype;
  first_assignment uuid;
  next_assignment uuid;
  cancelled_schedule uuid;
  due_schedule uuid;
  future_schedule uuid;
  failed_schedule uuid;
  results jsonb;
begin
  select * into strict first_release from public.portal_theme_release
  where status = 'published' and portal_contract = 'parent-portal/1.2'
    and manifest_schema_version = 3 order by theme_key, release limit 1;
  select * into strict next_release from public.portal_theme_release
  where status = 'published' and portal_contract = 'parent-portal/1.2'
    and manifest_schema_version = 3 order by theme_key, release offset 1 limit 1;
  insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
  values (manager, 'authenticated', 'authenticated', manager::text || '@example.test', '{}', '{}'),
         (revoked_manager, 'authenticated', 'authenticated', revoked_manager::text || '@example.test', '{}', '{}');
  insert into public.platform_memberships (user_id, role, status)
  values (manager, 'platform_admin', 'active'), (revoked_manager, 'platform_admin', 'active');
  insert into public.tenants (id, slug, name)
  values (tenant_a, tenant_a::text, 'SQL schedule A'),
         (tenant_b, tenant_b::text, 'SQL schedule B'),
         (tenant_c, tenant_c::text, 'SQL schedule C');

  first_assignment := public.activate_tenant_portal_theme(tenant_a, first_release.theme_key,
    first_release.release, manager, 'Initial integration assignment');
  cancelled_schedule := public.schedule_tenant_portal_theme(tenant_a, first_release.theme_key,
    first_release.release, now() + interval '2 days', manager, 'Superseded schedule');
  due_schedule := public.schedule_tenant_portal_theme(tenant_a, next_release.theme_key,
    next_release.release, now() + interval '1 day', manager, 'Scheduled integration assignment', 'SQL-01');
  future_schedule := public.schedule_tenant_portal_theme(tenant_b, first_release.theme_key,
    first_release.release, now() + interval '1 day', manager, 'Future tenant assignment');
  failed_schedule := public.schedule_tenant_portal_theme(tenant_c, first_release.theme_key,
    first_release.release, now() + interval '1 day', revoked_manager, 'Revoked actor assignment');
  if (select status from public.tenant_portal_theme_schedule where id = cancelled_schedule) <> 'cancelled' then
    raise exception 'Replacement planning must cancel the previous schedule';
  end if;
  update public.tenant_portal_theme_schedule set created_at = now() - interval '2 days',
    scheduled_for = now() - interval '1 hour' where id in (due_schedule, failed_schedule);
  update public.platform_memberships set status = 'suspended' where user_id = revoked_manager;

  select jsonb_agg(to_jsonb(r)) into results from public.execute_due_portal_theme_schedules(50) r;
  if jsonb_array_length(results) <> 2
    or not results @> jsonb_build_array(jsonb_build_object('schedule_id', due_schedule, 'status', 'executed'))
    or not results @> jsonb_build_array(jsonb_build_object('schedule_id', failed_schedule, 'status', 'failed', 'assignment_id', null)) then
    raise exception 'Due schedules must execute independently and expose their real result: %', results;
  end if;
  select id into strict next_assignment from public.tenant_portal_theme_assignment
  where tenant_id = tenant_a and deactivated_at is null and previous_assignment_id = first_assignment
    and theme_key = next_release.theme_key and theme_release = next_release.release;
  if (select count(*) from public.tenant_portal_theme_assignment where tenant_id in (tenant_b, tenant_c)) <> 0
    or (select status from public.tenant_portal_theme_schedule where id = future_schedule) <> 'scheduled'
    or (select count(*) from public.execute_due_portal_theme_schedules(50)) <> 0 then
    raise exception 'Future/failed tenants or replay crossed the scheduling boundary';
  end if;
  if (select count(*) from public.portal_theme_audit_event where tenant_id = tenant_a
      and event_type = 'activated' and request_correlation_id = due_schedule::text
      and next_theme_release = next_release.release and previous_theme_release = first_release.release) <> 1 then
    raise exception 'Scheduled activation must retain release lineage and one audit event';
  end if;
  perform public.activate_tenant_portal_theme(tenant_a, first_release.theme_key,
    first_release.release, manager, 'Integration rollback', null, null, 'rolled_back');
  if (select count(*) from public.tenant_portal_theme_assignment where tenant_id = tenant_a
      and deactivated_at is null and previous_assignment_id = next_assignment
      and theme_key = first_release.theme_key and theme_release = first_release.release) <> 1
    or (select count(*) from public.portal_theme_audit_event where tenant_id = tenant_a and event_type = 'rolled_back') <> 1 then
    raise exception 'Rollback must restore the exact prior release and retain its audit trail';
  end if;
end;
$$;

rollback;
