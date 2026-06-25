create table public.helpdesk_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  guardian_id uuid not null references public.participant_guardians (id) on delete cascade,
  participant_id uuid references public.participants (id) on delete set null,
  category text not null,
  subject text not null,
  status text not null default 'new',
  priority text not null default 'normal',
  assigned_to uuid references public.profiles (id) on delete set null,
  context_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint helpdesk_tickets_category_check check (
    category in (
      'lesson_planning',
      'catch_up_lessons',
      'payments',
      'progress',
      'afzwemmen',
      'account_login',
      'documents',
      'complaint',
      'general_question'
    )
  ),
  constraint helpdesk_tickets_status_check check (
    status in ('new', 'open', 'waiting_for_parent', 'waiting_internal', 'resolved', 'closed')
  ),
  constraint helpdesk_tickets_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint helpdesk_tickets_subject_check check (char_length(subject) between 3 and 180),
  constraint helpdesk_tickets_context_json_check check (jsonb_typeof(context_json) = 'object'),
  constraint helpdesk_tickets_id_tenant_unique unique (id, tenant_id),
  constraint helpdesk_tickets_guardian_tenant_fk foreign key (guardian_id, tenant_id) references public.participant_guardians (id, tenant_id) on delete cascade
);

create table public.helpdesk_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  ticket_id uuid not null references public.helpdesk_tickets (id) on delete cascade,
  author_profile_id uuid references public.profiles (id) on delete set null,
  author_type text not null,
  message text not null,
  visibility text not null default 'public_to_parent',
  created_at timestamptz not null default now(),
  constraint helpdesk_ticket_messages_author_type_check check (author_type in ('parent', 'admin', 'system')),
  constraint helpdesk_ticket_messages_visibility_check check (visibility in ('public_to_parent', 'internal')),
  constraint helpdesk_ticket_messages_message_check check (char_length(message) between 2 and 6000),
  constraint helpdesk_ticket_messages_id_tenant_unique unique (id, tenant_id),
  constraint helpdesk_ticket_messages_ticket_tenant_fk foreign key (ticket_id, tenant_id) references public.helpdesk_tickets (id, tenant_id) on delete cascade
);

create index helpdesk_tickets_tenant_status_idx
  on public.helpdesk_tickets (tenant_id, status, priority, updated_at desc);

create index helpdesk_tickets_tenant_category_idx
  on public.helpdesk_tickets (tenant_id, category, updated_at desc);

create index helpdesk_tickets_guardian_idx
  on public.helpdesk_tickets (tenant_id, guardian_id, updated_at desc);

create index helpdesk_tickets_participant_idx
  on public.helpdesk_tickets (tenant_id, participant_id, updated_at desc);

create index helpdesk_tickets_assigned_to_idx
  on public.helpdesk_tickets (tenant_id, assigned_to, status);

create index helpdesk_ticket_messages_ticket_idx
  on public.helpdesk_ticket_messages (tenant_id, ticket_id, created_at);

create trigger helpdesk_tickets_set_updated_at
  before update on public.helpdesk_tickets
  for each row execute function app_private.set_updated_at();

create or replace function app_private.touch_helpdesk_ticket_on_message()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  update public.helpdesk_tickets
  set updated_at = now()
  where tenant_id = new.tenant_id
    and id = new.ticket_id;

  return new;
end $$;

revoke all on function app_private.touch_helpdesk_ticket_on_message() from public;
grant execute on function app_private.touch_helpdesk_ticket_on_message() to service_role;

create trigger helpdesk_ticket_messages_touch_ticket
  after insert on public.helpdesk_ticket_messages
  for each row execute function app_private.touch_helpdesk_ticket_on_message();

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
    when tg_table_name in ('invoices', 'payment_records', 'tenant_document_records', 'message_outbox', 'participant_guardians', 'helpdesk_tickets', 'helpdesk_ticket_messages') then 'sensitive'
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

create trigger helpdesk_tickets_audit_events
  after insert or update or delete on public.helpdesk_tickets
  for each row execute function app_private.record_audit_event();

create trigger helpdesk_ticket_messages_audit_events
  after insert or update or delete on public.helpdesk_ticket_messages
  for each row execute function app_private.record_audit_event();

grant select, insert, update on public.helpdesk_tickets to authenticated;
grant select, insert on public.helpdesk_ticket_messages to authenticated;
grant all on public.helpdesk_tickets to service_role;
grant all on public.helpdesk_ticket_messages to service_role;

alter table public.helpdesk_tickets enable row level security;
alter table public.helpdesk_ticket_messages enable row level security;

create policy "Tenant staff can view helpdesk tickets"
  on public.helpdesk_tickets
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert helpdesk tickets"
  on public.helpdesk_tickets
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update helpdesk tickets"
  on public.helpdesk_tickets
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Parents can view own helpdesk tickets"
  on public.helpdesk_tickets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.participant_guardians guardian
      where guardian.tenant_id = helpdesk_tickets.tenant_id
        and guardian.id = helpdesk_tickets.guardian_id
        and guardian.profile_id = (select auth.uid())
        and guardian.status = 'active'
    )
  );

create policy "Parents can create own helpdesk tickets"
  on public.helpdesk_tickets
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.participant_guardians guardian
      where guardian.tenant_id = helpdesk_tickets.tenant_id
        and guardian.id = helpdesk_tickets.guardian_id
        and guardian.profile_id = (select auth.uid())
        and guardian.status = 'active'
        and (
          helpdesk_tickets.participant_id is null
          or guardian.participant_id = helpdesk_tickets.participant_id
        )
    )
  );

create policy "Tenant staff can view helpdesk messages"
  on public.helpdesk_ticket_messages
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Parents can view public helpdesk messages"
  on public.helpdesk_ticket_messages
  for select
  to authenticated
  using (
    visibility = 'public_to_parent'
    and exists (
      select 1
      from public.helpdesk_tickets ticket
      join public.participant_guardians guardian
        on guardian.id = ticket.guardian_id
       and guardian.tenant_id = ticket.tenant_id
      where ticket.tenant_id = helpdesk_ticket_messages.tenant_id
        and ticket.id = helpdesk_ticket_messages.ticket_id
        and guardian.profile_id = (select auth.uid())
        and guardian.status = 'active'
    )
  );

create policy "Tenant staff can insert helpdesk messages"
  on public.helpdesk_ticket_messages
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Parents can insert public helpdesk messages"
  on public.helpdesk_ticket_messages
  for insert
  to authenticated
  with check (
    visibility = 'public_to_parent'
    and author_type = 'parent'
    and author_profile_id = (select auth.uid())
    and exists (
      select 1
      from public.helpdesk_tickets ticket
      join public.participant_guardians guardian
        on guardian.id = ticket.guardian_id
       and guardian.tenant_id = ticket.tenant_id
      where ticket.tenant_id = helpdesk_ticket_messages.tenant_id
        and ticket.id = helpdesk_ticket_messages.ticket_id
        and guardian.profile_id = (select auth.uid())
        and guardian.status = 'active'
    )
  );
