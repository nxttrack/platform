create table public.participant_guardians (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  relationship text not null default 'parent',
  display_name text,
  email text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_guardians_relationship_check check (relationship in ('parent', 'guardian', 'athlete_self')),
  constraint participant_guardians_status_check check (status in ('active', 'inactive', 'revoked')),
  constraint participant_guardians_id_tenant_unique unique (id, tenant_id),
  constraint participant_guardians_unique_profile unique (tenant_id, participant_id, profile_id, relationship),
  constraint participant_guardians_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade
);

create table public.parent_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles (id) on delete cascade,
  participant_id uuid references public.participants (id) on delete cascade,
  enrollment_id uuid references public.enrollments (id) on delete set null,
  title text not null,
  body text,
  notification_type text not null default 'general',
  status text not null default 'unread',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parent_notifications_type_check check (notification_type in ('general', 'lesson', 'progress', 'document', 'catch_up', 'payment')),
  constraint parent_notifications_status_check check (status in ('unread', 'read', 'archived')),
  constraint parent_notifications_id_tenant_unique unique (id, tenant_id),
  constraint parent_notifications_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint parent_notifications_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id)
);

create table public.lesson_catch_up_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  missed_session_id uuid not null references public.sessions (id) on delete cascade,
  requested_by_profile_id uuid not null references public.profiles (id) on delete cascade,
  preferred_time_windows text[] not null default '{}'::text[],
  reason text,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_catch_up_requests_status_check check (status in ('requested', 'approved', 'rejected', 'cancelled', 'used')),
  constraint lesson_catch_up_requests_preferred_time_windows_check check (preferred_time_windows <@ array['morning', 'afternoon', 'evening', 'weekend']::text[]),
  constraint lesson_catch_up_requests_id_tenant_unique unique (id, tenant_id),
  constraint lesson_catch_up_requests_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint lesson_catch_up_requests_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint lesson_catch_up_requests_session_tenant_fk foreign key (missed_session_id, tenant_id) references public.sessions (id, tenant_id) on delete cascade
);

create table public.parent_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  enrollment_id uuid references public.enrollments (id) on delete set null,
  certificate_id uuid references public.certificates (id) on delete set null,
  title text not null,
  document_type text not null default 'document',
  status text not null default 'available',
  file_path text,
  available_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parent_documents_type_check check (document_type in ('document', 'diploma', 'certificate', 'policy', 'invoice_notice')),
  constraint parent_documents_status_check check (status in ('draft', 'available', 'archived')),
  constraint parent_documents_id_tenant_unique unique (id, tenant_id),
  constraint parent_documents_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint parent_documents_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id),
  constraint parent_documents_certificate_tenant_fk foreign key (certificate_id, tenant_id) references public.certificates (id, tenant_id)
);

create index participant_guardians_tenant_id_idx on public.participant_guardians (tenant_id);
create index participant_guardians_profile_id_idx on public.participant_guardians (profile_id);
create index participant_guardians_participant_id_idx on public.participant_guardians (participant_id);
create index parent_notifications_recipient_idx on public.parent_notifications (tenant_id, recipient_profile_id, status, created_at desc);
create index parent_notifications_participant_id_idx on public.parent_notifications (participant_id);
create index lesson_catch_up_requests_participant_id_idx on public.lesson_catch_up_requests (participant_id);
create index lesson_catch_up_requests_enrollment_id_idx on public.lesson_catch_up_requests (enrollment_id);
create index lesson_catch_up_requests_status_idx on public.lesson_catch_up_requests (tenant_id, status);
create index parent_documents_participant_id_idx on public.parent_documents (participant_id);
create index parent_documents_certificate_id_idx on public.parent_documents (certificate_id);

create trigger participant_guardians_set_updated_at
  before update on public.participant_guardians
  for each row execute function app_private.set_updated_at();

create trigger parent_notifications_set_updated_at
  before update on public.parent_notifications
  for each row execute function app_private.set_updated_at();

create trigger lesson_catch_up_requests_set_updated_at
  before update on public.lesson_catch_up_requests
  for each row execute function app_private.set_updated_at();

create trigger parent_documents_set_updated_at
  before update on public.parent_documents
  for each row execute function app_private.set_updated_at();

create or replace function app_private.current_user_can_access_participant(target_tenant_id uuid, target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(target_tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
    or exists (
      select 1
      from public.participant_guardians guardian
      where guardian.tenant_id = target_tenant_id
        and guardian.participant_id = target_participant_id
        and guardian.profile_id = (select auth.uid())
        and guardian.status = 'active'
    );
$$;

create or replace function app_private.current_user_can_access_enrollment(target_tenant_id uuid, target_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.enrollments enrollment
    where enrollment.tenant_id = target_tenant_id
      and enrollment.id = target_enrollment_id
      and app_private.current_user_can_access_participant(enrollment.tenant_id, enrollment.participant_id)
  );
$$;

create or replace function app_private.current_user_can_request_catch_up(
  target_tenant_id uuid,
  target_participant_id uuid,
  target_enrollment_id uuid,
  target_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_user_can_access_participant(target_tenant_id, target_participant_id)
    and exists (
      select 1
      from public.enrollments enrollment
      join public.group_memberships membership
        on membership.enrollment_id = enrollment.id
       and membership.tenant_id = enrollment.tenant_id
      join public.sessions session
        on session.group_id = membership.group_id
       and session.tenant_id = enrollment.tenant_id
      where enrollment.tenant_id = target_tenant_id
        and enrollment.id = target_enrollment_id
        and enrollment.participant_id = target_participant_id
        and session.id = target_session_id
    );
$$;

revoke all on function app_private.current_user_can_access_participant(uuid, uuid) from public;
revoke all on function app_private.current_user_can_access_enrollment(uuid, uuid) from public;
revoke all on function app_private.current_user_can_request_catch_up(uuid, uuid, uuid, uuid) from public;

grant execute on function app_private.current_user_can_access_participant(uuid, uuid) to authenticated;
grant execute on function app_private.current_user_can_access_enrollment(uuid, uuid) to authenticated;
grant execute on function app_private.current_user_can_request_catch_up(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function app_private.current_user_can_access_participant(uuid, uuid) to service_role;
grant execute on function app_private.current_user_can_access_enrollment(uuid, uuid) to service_role;
grant execute on function app_private.current_user_can_request_catch_up(uuid, uuid, uuid, uuid) to service_role;

grant select, insert, update on public.participant_guardians to authenticated;
grant select, insert on public.parent_notifications to authenticated;
grant update (status, read_at) on public.parent_notifications to authenticated;
grant select, insert, update on public.lesson_catch_up_requests to authenticated;
grant select, insert, update on public.parent_documents to authenticated;

grant all on public.participant_guardians to service_role;
grant all on public.parent_notifications to service_role;
grant all on public.lesson_catch_up_requests to service_role;
grant all on public.parent_documents to service_role;

alter table public.participant_guardians enable row level security;
alter table public.parent_notifications enable row level security;
alter table public.lesson_catch_up_requests enable row level security;
alter table public.parent_documents enable row level security;

create policy "Participant guardians can view own guardian links"
  on public.participant_guardians
  for select
  to authenticated
  using (
    profile_id = (select auth.uid())
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert guardian links"
  on public.participant_guardians
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update guardian links"
  on public.participant_guardians
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

create policy "Parents can view own notifications"
  on public.parent_notifications
  for select
  to authenticated
  using (
    recipient_profile_id = (select auth.uid())
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert parent notifications"
  on public.parent_notifications
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Parents can update notification read state"
  on public.parent_notifications
  for update
  to authenticated
  using (
    recipient_profile_id = (select auth.uid())
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    recipient_profile_id = (select auth.uid())
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Parents can view own catch-up requests"
  on public.lesson_catch_up_requests
  for select
  to authenticated
  using (
    requested_by_profile_id = (select auth.uid())
    or app_private.current_user_can_access_participant(tenant_id, participant_id)
  );

create policy "Parents can insert catch-up requests"
  on public.lesson_catch_up_requests
  for insert
  to authenticated
  with check (
    requested_by_profile_id = (select auth.uid())
    and app_private.current_user_can_request_catch_up(tenant_id, participant_id, enrollment_id, missed_session_id)
  );

create policy "Tenant staff can update catch-up requests"
  on public.lesson_catch_up_requests
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

create policy "Parents can view available documents"
  on public.parent_documents
  for select
  to authenticated
  using (
    status = 'available'
    and app_private.current_user_can_access_participant(tenant_id, participant_id)
  );

create policy "Tenant staff can insert parent documents"
  on public.parent_documents
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update parent documents"
  on public.parent_documents
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

create policy "Participant guardians can view linked participants"
  on public.participants
  for select
  to authenticated
  using (app_private.current_user_can_access_participant(tenant_id, id));

create policy "Participant guardians can view linked enrollments"
  on public.enrollments
  for select
  to authenticated
  using (app_private.current_user_can_access_participant(tenant_id, participant_id));

create policy "Participant guardians can view linked group memberships"
  on public.group_memberships
  for select
  to authenticated
  using (app_private.current_user_can_access_enrollment(tenant_id, enrollment_id));

create policy "Participant guardians can view linked progress"
  on public.progress
  for select
  to authenticated
  using (app_private.current_user_can_access_enrollment(tenant_id, enrollment_id));

create policy "Participant guardians can view linked certificates"
  on public.certificates
  for select
  to authenticated
  using (app_private.current_user_can_access_participant(tenant_id, participant_id));

do $$
declare
  demo_tenant_id uuid;
  demo_parent record;
  demo_participant record;
  demo_enrollment_id uuid;
  demo_enrollment_participant_id uuid;
  demo_certificate_id uuid;
  demo_session_id uuid;
begin
  select id into demo_tenant_id
  from public.tenants
  where slug = 'aquaswim-demo';

  if demo_tenant_id is null then
    return;
  end if;

  for demo_participant in
    select id, display_name
    from public.participants
    where tenant_id = demo_tenant_id
      and external_reference in ('child-emma-devries', 'child-noah-bakker')
  loop
    demo_enrollment_id := null;
    demo_certificate_id := null;

    select id into demo_enrollment_id
    from public.enrollments
    where tenant_id = demo_tenant_id
      and participant_id = demo_participant.id
    order by started_on desc
    limit 1;

    select id into demo_certificate_id
    from public.certificates
    where tenant_id = demo_tenant_id
      and participant_id = demo_participant.id
    order by created_at desc
    limit 1;

    insert into public.parent_documents (
      tenant_id,
      participant_id,
      enrollment_id,
      certificate_id,
      title,
      document_type,
      status,
      file_path,
      available_on
    )
    values (
      demo_tenant_id,
      demo_participant.id,
      demo_enrollment_id,
      demo_certificate_id,
      case when demo_certificate_id is null then 'Lesinformatie ' || demo_participant.display_name else 'Diploma voorbereiding ' || demo_participant.display_name end,
      case when demo_certificate_id is null then 'document' else 'diploma' end,
      'available',
      null,
      current_date
    );
  end loop;

  for demo_parent in
    select membership.user_id, profile.full_name
    from public.tenant_memberships membership
    left join public.profiles profile
      on profile.id = membership.user_id
    where membership.tenant_id = demo_tenant_id
      and membership.role in ('parent', 'athlete')
      and membership.status = 'active'
  loop
    for demo_participant in
      select id, display_name
      from public.participants
      where tenant_id = demo_tenant_id
        and external_reference in ('child-emma-devries', 'child-noah-bakker')
    loop
      insert into public.participant_guardians (
        tenant_id,
        participant_id,
        profile_id,
        relationship,
        display_name,
        status
      )
      values (
        demo_tenant_id,
        demo_participant.id,
        demo_parent.user_id,
        'parent',
        demo_parent.full_name,
        'active'
      )
      on conflict (tenant_id, participant_id, profile_id, relationship) do update
        set display_name = excluded.display_name,
            status = excluded.status;

      insert into public.parent_notifications (
        tenant_id,
        recipient_profile_id,
        participant_id,
        title,
        body,
        notification_type,
        status
      )
      values (
        demo_tenant_id,
        demo_parent.user_id,
        demo_participant.id,
        'Nieuwe lesinformatie voor ' || demo_participant.display_name,
        'De komende lessen staan klaar in Mijn lessen.',
        'lesson',
        'unread'
      );
    end loop;

    select session.id
      into demo_session_id
    from public.sessions session
    where session.tenant_id = demo_tenant_id
    order by session.starts_at asc
    limit 1;

    if demo_session_id is not null then
      demo_enrollment_id := null;
      demo_enrollment_participant_id := null;

      select enrollment.id, enrollment.participant_id
        into demo_enrollment_id, demo_enrollment_participant_id
      from public.enrollments enrollment
      where enrollment.tenant_id = demo_tenant_id
      order by enrollment.started_on desc
      limit 1;

      if demo_enrollment_id is not null and demo_enrollment_participant_id is not null then
        insert into public.lesson_catch_up_requests (
          tenant_id,
          participant_id,
          enrollment_id,
          missed_session_id,
          requested_by_profile_id,
          preferred_time_windows,
          reason,
          status
        )
        values (
          demo_tenant_id,
          demo_enrollment_participant_id,
          demo_enrollment_id,
          demo_session_id,
          demo_parent.user_id,
          array['afternoon']::text[],
          'Demo-aanvraag voor Phase 6.',
          'requested'
        );
      end if;
    end if;
  end loop;
end $$;
