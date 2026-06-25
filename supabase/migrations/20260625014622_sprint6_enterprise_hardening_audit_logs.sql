create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  source_table text not null,
  source_record_id uuid,
  action text not null,
  risk_level text not null default 'normal',
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_action_check check (action in ('insert', 'update', 'delete')),
  constraint audit_events_risk_check check (risk_level in ('normal', 'sensitive', 'critical')),
  constraint audit_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index audit_events_tenant_created_idx
  on public.audit_events (tenant_id, created_at desc);

create index audit_events_source_idx
  on public.audit_events (source_table, source_record_id, created_at desc);

grant select on public.audit_events to authenticated;
grant all on public.audit_events to service_role;

alter table public.audit_events enable row level security;

create policy "Tenant staff and platform staff can view tenant audit events"
  on public.audit_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or (
      tenant_id is not null
      and app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
    )
  );

create or replace function app_private.record_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  row_tenant_id uuid;
  row_record_id uuid;
  current_actor uuid;
  risk text;
begin
  row_tenant_id := coalesce(
    (to_jsonb(new)->>'tenant_id')::uuid,
    (to_jsonb(old)->>'tenant_id')::uuid
  );

  row_record_id := coalesce(
    (to_jsonb(new)->>'id')::uuid,
    (to_jsonb(old)->>'id')::uuid
  );

  current_actor := (select auth.uid());
  risk := case
    when tg_table_name in ('tenant_memberships', 'platform_memberships', 'platform_smtp_settings') then 'critical'
    when tg_table_name in ('invoices', 'payment_records', 'tenant_document_records', 'message_outbox', 'participant_guardians') then 'sensitive'
    else 'normal'
  end;

  insert into public.audit_events (
    tenant_id,
    actor_profile_id,
    source_table,
    source_record_id,
    action,
    risk_level,
    before_data,
    after_data,
    metadata
  )
  values (
    row_tenant_id,
    current_actor,
    tg_table_name,
    row_record_id,
    lower(tg_op),
    risk,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    jsonb_build_object('schema', tg_table_schema, 'trigger', tg_name)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end $$;

revoke all on function app_private.record_audit_event() from public;
grant execute on function app_private.record_audit_event() to service_role;

create trigger tenant_memberships_audit_events
  after insert or update or delete on public.tenant_memberships
  for each row execute function app_private.record_audit_event();

create trigger participant_guardians_audit_events
  after insert or update or delete on public.participant_guardians
  for each row execute function app_private.record_audit_event();

create trigger enrollments_audit_events
  after insert or update or delete on public.enrollments
  for each row execute function app_private.record_audit_event();

create trigger group_memberships_audit_events
  after insert or update or delete on public.group_memberships
  for each row execute function app_private.record_audit_event();

create trigger invoices_audit_events
  after insert or update or delete on public.invoices
  for each row execute function app_private.record_audit_event();

create trigger payment_records_audit_events
  after insert or update or delete on public.payment_records
  for each row execute function app_private.record_audit_event();

create trigger message_outbox_audit_events
  after insert or update or delete on public.message_outbox
  for each row execute function app_private.record_audit_event();

create trigger tenant_document_records_audit_events
  after insert or update or delete on public.tenant_document_records
  for each row execute function app_private.record_audit_event();

create trigger report_export_requests_audit_events
  after insert or update or delete on public.report_export_requests
  for each row execute function app_private.record_audit_event();

create trigger platform_smtp_settings_audit_events
  after insert or update or delete on public.platform_smtp_settings
  for each row execute function app_private.record_audit_event();
