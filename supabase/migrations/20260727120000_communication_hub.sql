-- Central communication hub.
--
-- Existing tenant_notifications remain the canonical in-app notification
-- records. Existing tenant_messages remain tenant-wide announcements. This
-- migration adds private conversations, reusable templates, newsletters and
-- channel-neutral delivery evidence without enabling external delivery.

alter table public.tenant_settings
  add column if not exists instructors_can_reply_to_parents boolean not null default false,
  add column if not exists instructors_can_view_parent_threads text not null default 'assigned_only',
  add column if not exists whatsapp_urgent_enabled boolean not null default false,
  add column if not exists sms_fallback_enabled boolean not null default false;

alter table public.tenant_settings
  drop constraint if exists tenant_settings_instructor_parent_thread_visibility_check,
  add constraint tenant_settings_instructor_parent_thread_visibility_check
    check (instructors_can_view_parent_threads in ('disabled', 'assigned_only', 'own_groups'));

alter table public.guardian_communication_preferences
  add column if not exists in_app_enabled boolean not null default true,
  add column if not exists transactional_email_enabled boolean not null default true,
  add column if not exists newsletter_email_enabled boolean not null default false,
  add column if not exists whatsapp_urgent_enabled boolean not null default false,
  add column if not exists sms_fallback_enabled boolean not null default false,
  add column if not exists marketing_consent_status text not null default 'unknown',
  add column if not exists marketing_consent_recorded_at timestamptz,
  add column if not exists marketing_unsubscribed_at timestamptz;

alter table public.guardian_communication_preferences
  drop constraint if exists guardian_communication_preferences_marketing_consent_check,
  add constraint guardian_communication_preferences_marketing_consent_check
    check (marketing_consent_status in ('unknown', 'granted', 'denied', 'withdrawn')),
  add constraint guardian_communication_preferences_marketing_consent_time_check
    check (
      (marketing_consent_status = 'unknown' and marketing_consent_recorded_at is null)
      or (marketing_consent_status <> 'unknown' and marketing_consent_recorded_at is not null)
    ),
  add constraint guardian_communication_preferences_newsletter_consent_check
    check (
      not newsletter_email_enabled
      or (
        marketing_consent_status = 'granted'
        and marketing_unsubscribed_at is null
      )
    );

alter table public.tenant_notifications
  add column if not exists priority text not null default 'normal',
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists action_href text;

alter table public.tenant_notifications
  drop constraint if exists tenant_notifications_type_check,
  add constraint tenant_notifications_type_check check (
    type in (
      'progress_score',
      'badge_award',
      'graduation_invite',
      'certificate_issued',
      'payment_due',
      'payment_overdue',
      'payment_received',
      'admin_message',
      'task_assigned',
      'document_published',
      'report_ready',
      'makeup_invitation',
      'message_received',
      'newsletter_status',
      'system'
    )
  ),
  add constraint tenant_notifications_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent')),
  add constraint tenant_notifications_entity_check
    check (
      (entity_type is null and entity_id is null)
      or (
        entity_type in (
          'intake',
          'waitlist_entry',
          'participant',
          'group',
          'session',
          'payment',
          'message_thread',
          'graduation_event',
          'certificate',
          'task'
        )
        and entity_id is not null
      )
    ),
  add constraint tenant_notifications_action_href_check
    check (
      action_href is null
      or (
        action_href ~ '^/[A-Za-z0-9/_?=&%.-]*$'
        and action_href !~ '^//'
      )
    );

create index if not exists tenant_notifications_tenant_recipient_status_idx
  on public.tenant_notifications (tenant_id, recipient_user_id, status, created_at desc);
create index if not exists tenant_notifications_entity_idx
  on public.tenant_notifications (tenant_id, entity_type, entity_id, created_at desc)
  where entity_type is not null;

alter table public.tenant_messages
  add column if not exists content_json jsonb,
  add column if not exists content_html text,
  add column if not exists message_kind text not null default 'announcement';

alter table public.tenant_messages
  drop constraint if exists tenant_messages_kind_check,
  add constraint tenant_messages_kind_check
    check (message_kind in ('announcement', 'news_update', 'service_notice')),
  add constraint tenant_messages_content_json_check
    check (content_json is null or jsonb_typeof(content_json) = 'object');

create table public.communication_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  template_key text not null,
  name text not null,
  channel text not null,
  subject text,
  content_json jsonb not null default '{}'::jsonb,
  content_html text,
  plain_text text not null default '',
  variables_json jsonb not null default '[]'::jsonb,
  status text not null default 'inactive',
  content_classification text not null default 'operational',
  classification_reasons jsonb not null default '[]'::jsonb,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_templates_key_format_check
    check (template_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint communication_templates_channel_check
    check (channel in ('in_app', 'email', 'newsletter', 'whatsapp_urgent', 'sms_fallback')),
  constraint communication_templates_status_check
    check (status in ('active', 'inactive', 'archived')),
  constraint communication_templates_content_json_check
    check (jsonb_typeof(content_json) = 'object'),
  constraint communication_templates_variables_json_check
    check (jsonb_typeof(variables_json) = 'array'),
  constraint communication_templates_classification_check
    check (content_classification in ('operational', 'personal', 'sensitive', 'restricted')),
  constraint communication_templates_tenant_key_unique unique (tenant_id, template_key),
  constraint communication_templates_tenant_id_id_unique unique (tenant_id, id)
);

create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  subject text not null,
  thread_type text not null default 'general',
  status text not null default 'open',
  participant_id uuid,
  guardian_user_id uuid references auth.users (id) on delete set null,
  group_id uuid,
  session_id uuid,
  intake_submission_id uuid,
  waitlist_entry_id uuid,
  manual_payment_id uuid,
  graduation_event_id uuid,
  assigned_staff_user_id uuid references auth.users (id) on delete set null,
  assigned_instructor_user_id uuid references auth.users (id) on delete set null,
  last_message_at timestamptz,
  closed_at timestamptz,
  closed_by_user_id uuid references auth.users (id) on delete set null,
  source text not null default 'manual',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  test_metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_threads_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete set null (participant_id),
  constraint message_threads_group_fk
    foreign key (tenant_id, group_id)
    references public.groups (tenant_id, id) on delete set null (group_id),
  constraint message_threads_session_fk
    foreign key (tenant_id, session_id)
    references public.sessions (tenant_id, id) on delete set null (session_id),
  constraint message_threads_intake_fk
    foreign key (tenant_id, intake_submission_id)
    references public.intake_submissions (tenant_id, id) on delete set null (intake_submission_id),
  constraint message_threads_waitlist_fk
    foreign key (tenant_id, waitlist_entry_id)
    references public.waitlist_entries (tenant_id, id) on delete set null (waitlist_entry_id),
  constraint message_threads_payment_fk
    foreign key (tenant_id, manual_payment_id)
    references public.manual_payments (tenant_id, id) on delete set null (manual_payment_id),
  constraint message_threads_graduation_event_fk
    foreign key (tenant_id, graduation_event_id)
    references public.graduation_events (tenant_id, id) on delete set null (graduation_event_id),
  constraint message_threads_type_check check (
    thread_type in ('general', 'planning', 'payment', 'progress', 'graduation', 'intake', 'waitlist', 'support', 'internal')
  ),
  constraint message_threads_status_check check (
    status in ('open', 'waiting_for_parent', 'waiting_for_school', 'assigned', 'closed', 'archived')
  ),
  constraint message_threads_closed_check check (
    (status = 'closed' and closed_at is not null)
    or status <> 'closed'
  ),
  constraint message_threads_source_check
    check (source in ('manual', 'import', 'automation_recipe', 'journey_simulation_bot')),
  constraint message_threads_test_marker_check check (
    (
      source = 'journey_simulation_bot'
      and is_test
      and journey_run_id is not null
    )
    or (
      source <> 'journey_simulation_bot'
      and not is_test
      and journey_run_id is null
    )
  ),
  constraint message_threads_test_metadata_check
    check (jsonb_typeof(test_metadata_json) = 'object'),
  constraint message_threads_tenant_id_id_unique unique (tenant_id, id)
);

alter table public.tenant_tasks
  add column if not exists related_message_thread_id uuid;

alter table public.tenant_tasks
  drop constraint if exists tenant_tasks_message_thread_fk,
  add constraint tenant_tasks_message_thread_fk
    foreign key (tenant_id, related_message_thread_id)
    references public.message_threads (tenant_id, id) on delete set null (related_message_thread_id);

create table public.message_thread_participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  thread_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  can_reply boolean not null default false,
  can_view_internal boolean not null default false,
  last_read_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_thread_participants_thread_fk
    foreign key (tenant_id, thread_id)
    references public.message_threads (tenant_id, id) on delete cascade,
  constraint message_thread_participants_role_check
    check (role in ('parent', 'staff', 'instructor', 'observer')),
  constraint message_thread_participants_status_check
    check (status in ('active', 'removed')),
  constraint message_thread_participants_parent_internal_check
    check (role <> 'parent' or not can_view_internal),
  constraint message_thread_participants_unique unique (tenant_id, thread_id, user_id),
  constraint message_thread_participants_tenant_id_id_unique unique (tenant_id, id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  thread_id uuid not null,
  sender_user_id uuid references auth.users (id) on delete set null,
  sender_type text not null,
  body_json jsonb not null default '{}'::jsonb,
  body_html text,
  plain_text text not null,
  visibility text not null default 'public_to_thread',
  status text not null default 'draft',
  content_classification text not null default 'personal',
  classification_reasons jsonb not null default '[]'::jsonb,
  human_confirmed_at timestamptz,
  sent_at timestamptz,
  source text not null default 'manual',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  test_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_thread_fk
    foreign key (tenant_id, thread_id)
    references public.message_threads (tenant_id, id) on delete cascade,
  constraint messages_sender_type_check
    check (sender_type in ('parent', 'staff', 'instructor', 'system')),
  constraint messages_visibility_check
    check (visibility in ('public_to_thread', 'internal_note', 'staff_only')),
  constraint messages_status_check
    check (status in ('draft', 'sent', 'deleted')),
  constraint messages_content_json_check
    check (jsonb_typeof(body_json) = 'object'),
  constraint messages_content_classification_check
    check (content_classification in ('operational', 'personal', 'sensitive', 'restricted')),
  constraint messages_sent_confirmation_check check (
    status <> 'sent'
    or (
      human_confirmed_at is not null
      and sent_at is not null
    )
  ),
  constraint messages_source_check
    check (source in ('manual', 'automation_recipe', 'journey_simulation_bot')),
  constraint messages_test_marker_check check (
    (
      source = 'journey_simulation_bot'
      and is_test
      and journey_run_id is not null
    )
    or (
      source <> 'journey_simulation_bot'
      and not is_test
      and journey_run_id is null
    )
  ),
  constraint messages_test_metadata_check
    check (jsonb_typeof(test_metadata_json) = 'object'),
  constraint messages_tenant_id_id_unique unique (tenant_id, id)
);

create table public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null,
  subject text not null,
  preheader text,
  content_json jsonb not null default '{}'::jsonb,
  content_html text,
  plain_text text not null default '',
  status text not null default 'draft',
  segment_filters_json jsonb not null default '{}'::jsonb,
  content_classification text not null default 'operational',
  classification_reasons jsonb not null default '[]'::jsonb,
  scheduled_at timestamptz,
  sent_at timestamptz,
  human_confirmed_at timestamptz,
  confirmed_by_user_id uuid references auth.users (id) on delete set null,
  created_by_user_id uuid references auth.users (id) on delete set null,
  source text not null default 'manual',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  test_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_campaigns_status_check
    check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'archived')),
  constraint newsletter_campaigns_content_json_check
    check (jsonb_typeof(content_json) = 'object'),
  constraint newsletter_campaigns_segment_filters_check
    check (jsonb_typeof(segment_filters_json) = 'object'),
  constraint newsletter_campaigns_content_classification_check
    check (content_classification in ('operational', 'personal', 'sensitive', 'restricted')),
  constraint newsletter_campaigns_schedule_check check (
    status not in ('scheduled', 'sending', 'sent')
    or (
      scheduled_at is not null
      and human_confirmed_at is not null
      and confirmed_by_user_id is not null
    )
  ),
  constraint newsletter_campaigns_sent_check
    check (status <> 'sent' or sent_at is not null),
  constraint newsletter_campaigns_source_check
    check (source in ('manual', 'import', 'journey_simulation_bot')),
  constraint newsletter_campaigns_test_marker_check check (
    (
      source = 'journey_simulation_bot'
      and is_test
      and journey_run_id is not null
    )
    or (
      source <> 'journey_simulation_bot'
      and not is_test
      and journey_run_id is null
    )
  ),
  constraint newsletter_campaigns_test_metadata_check
    check (jsonb_typeof(test_metadata_json) = 'object'),
  constraint newsletter_campaigns_tenant_id_id_unique unique (tenant_id, id)
);

create table public.newsletter_recipients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  campaign_id uuid not null,
  guardian_user_id uuid references auth.users (id) on delete set null,
  recipient_user_id uuid references auth.users (id) on delete set null,
  email text not null,
  status text not null default 'pending',
  consent_snapshot_json jsonb not null default '{}'::jsonb,
  unsubscribe_token_hash text,
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  error_message text,
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  test_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_recipients_campaign_fk
    foreign key (tenant_id, campaign_id)
    references public.newsletter_campaigns (tenant_id, id) on delete cascade,
  constraint newsletter_recipients_status_check check (
    status in ('pending', 'sent', 'failed', 'skipped_unsubscribed', 'skipped_no_consent')
  ),
  constraint newsletter_recipients_email_check
    check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint newsletter_recipients_consent_snapshot_check
    check (jsonb_typeof(consent_snapshot_json) = 'object'),
  constraint newsletter_recipients_unsubscribe_hash_check
    check (unsubscribe_token_hash is null or unsubscribe_token_hash ~ '^[a-f0-9]{64}$'),
  constraint newsletter_recipients_test_marker_check check (
    (is_test and journey_run_id is not null)
    or (not is_test and journey_run_id is null)
  ),
  constraint newsletter_recipients_test_metadata_check
    check (jsonb_typeof(test_metadata_json) = 'object'),
  constraint newsletter_recipients_campaign_email_unique unique (tenant_id, campaign_id, email),
  constraint newsletter_recipients_tenant_id_id_unique unique (tenant_id, id)
);

create table public.communication_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  channel text not null,
  recipient_user_id uuid references auth.users (id) on delete set null,
  recipient text not null,
  related_type text not null,
  related_id uuid not null,
  status text not null default 'pending',
  provider text not null default 'not_configured',
  provider_message_id text,
  email_delivery_attempt_id uuid references public.email_delivery_attempts (id) on delete set null,
  error_message text,
  consent_snapshot_json jsonb not null default '{}'::jsonb,
  human_confirmed_at timestamptz,
  sent_at timestamptz,
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  test_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_deliveries_channel_check
    check (channel in ('in_app', 'email', 'newsletter', 'whatsapp_urgent', 'sms_fallback')),
  constraint communication_deliveries_related_type_check
    check (related_type in ('tenant_notification', 'message', 'newsletter_campaign', 'communication_template')),
  constraint communication_deliveries_status_check
    check (status in ('pending', 'sent', 'failed', 'skipped', 'cancelled')),
  constraint communication_deliveries_provider_check
    check (provider in ('not_configured', 'in_app', 'sendgrid_api', 'smtp', 'manual')),
  constraint communication_deliveries_consent_snapshot_check
    check (jsonb_typeof(consent_snapshot_json) = 'object'),
  constraint communication_deliveries_external_confirmation_check check (
    channel = 'in_app'
    or status in ('pending', 'skipped', 'cancelled')
    or human_confirmed_at is not null
  ),
  constraint communication_deliveries_sent_check
    check (status <> 'sent' or sent_at is not null),
  constraint communication_deliveries_test_marker_check check (
    (is_test and journey_run_id is not null)
    or (not is_test and journey_run_id is null)
  ),
  constraint communication_deliveries_test_metadata_check
    check (jsonb_typeof(test_metadata_json) = 'object'),
  constraint communication_deliveries_tenant_id_id_unique unique (tenant_id, id)
);

create index communication_templates_tenant_status_idx
  on public.communication_templates (tenant_id, status, channel, name);
create index message_threads_tenant_inbox_idx
  on public.message_threads (tenant_id, status, last_message_at desc nulls last, created_at desc);
create index message_threads_guardian_idx
  on public.message_threads (tenant_id, guardian_user_id, status, last_message_at desc nulls last);
create index message_threads_staff_idx
  on public.message_threads (tenant_id, assigned_staff_user_id, status, last_message_at desc nulls last);
create index message_threads_instructor_idx
  on public.message_threads (tenant_id, assigned_instructor_user_id, status, last_message_at desc nulls last);
create index message_thread_participants_user_idx
  on public.message_thread_participants (tenant_id, user_id, status, last_read_at);
create index messages_thread_timeline_idx
  on public.messages (tenant_id, thread_id, created_at);
create index newsletter_campaigns_tenant_status_idx
  on public.newsletter_campaigns (tenant_id, status, scheduled_at, created_at desc);
create index newsletter_recipients_campaign_status_idx
  on public.newsletter_recipients (tenant_id, campaign_id, status, created_at);
create index communication_deliveries_related_idx
  on public.communication_deliveries (tenant_id, related_type, related_id, created_at desc);
create index communication_deliveries_status_idx
  on public.communication_deliveries (tenant_id, channel, status, created_at desc);
create index tenant_tasks_message_thread_idx
  on public.tenant_tasks (tenant_id, related_message_thread_id, status)
  where related_message_thread_id is not null;

create trigger communication_templates_set_updated_at
  before update on public.communication_templates
  for each row execute function app_private.set_updated_at();
create trigger message_threads_set_updated_at
  before update on public.message_threads
  for each row execute function app_private.set_updated_at();
create trigger message_thread_participants_set_updated_at
  before update on public.message_thread_participants
  for each row execute function app_private.set_updated_at();
create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function app_private.set_updated_at();
create trigger newsletter_campaigns_set_updated_at
  before update on public.newsletter_campaigns
  for each row execute function app_private.set_updated_at();
create trigger newsletter_recipients_set_updated_at
  before update on public.newsletter_recipients
  for each row execute function app_private.set_updated_at();
create trigger communication_deliveries_set_updated_at
  before update on public.communication_deliveries
  for each row execute function app_private.set_updated_at();

create function app_private.current_user_can_view_message_thread(
  target_tenant_id uuid,
  target_thread_id uuid,
  include_internal boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    app_private.current_user_can_manage_tenant_domain(target_tenant_id)
    or exists (
      select 1
      from public.message_threads thread
      join public.tenant_memberships membership
        on membership.tenant_id = thread.tenant_id
       and membership.user_id = (select auth.uid())
       and membership.status = 'active'
      where thread.tenant_id = target_tenant_id
        and thread.id = target_thread_id
        and (
          (
            not include_internal
            and membership.role = 'parent'
            and thread.guardian_user_id = (select auth.uid())
          )
          or (
            membership.role in ('tenant_owner', 'tenant_admin', 'tenant_staff')
            and thread.assigned_staff_user_id = (select auth.uid())
          )
          or (
            membership.role = 'instructor'
            and thread.assigned_instructor_user_id = (select auth.uid())
            and (
              not include_internal
              or exists (
                select 1
                from public.message_thread_participants participant
                where participant.tenant_id = thread.tenant_id
                  and participant.thread_id = thread.id
                  and participant.user_id = (select auth.uid())
                  and participant.role = 'instructor'
                  and participant.status = 'active'
                  and participant.can_view_internal
              )
            )
          )
          or (
            not include_internal
            and membership.role = 'instructor'
            and exists (
              select 1
              from public.tenant_settings setting
              join public.group_instructor_assignments assignment
                on assignment.tenant_id = setting.tenant_id
               and assignment.group_id = thread.group_id
               and assignment.instructor_user_id = (select auth.uid())
               and assignment.status = 'active'
              where setting.tenant_id = thread.tenant_id
                and setting.instructors_can_view_parent_threads = 'own_groups'
            )
          )
        )
    );
$$;

revoke all on function app_private.current_user_can_view_message_thread(uuid, uuid, boolean) from public;
grant execute on function app_private.current_user_can_view_message_thread(uuid, uuid, boolean) to authenticated;
grant execute on function app_private.current_user_can_view_message_thread(uuid, uuid, boolean) to service_role;

grant select on public.communication_templates to authenticated;
grant select on public.message_threads to authenticated;
grant select on public.message_thread_participants to authenticated;
grant select on public.messages to authenticated;
grant select on public.newsletter_campaigns to authenticated;
grant select on public.newsletter_recipients to authenticated;
grant select on public.communication_deliveries to authenticated;

grant all on public.communication_templates to service_role;
grant all on public.message_threads to service_role;
grant all on public.message_thread_participants to service_role;
grant all on public.messages to service_role;
grant all on public.newsletter_campaigns to service_role;
grant all on public.newsletter_recipients to service_role;
grant all on public.communication_deliveries to service_role;

alter table public.communication_templates enable row level security;
alter table public.message_threads enable row level security;
alter table public.message_thread_participants enable row level security;
alter table public.messages enable row level security;
alter table public.newsletter_campaigns enable row level security;
alter table public.newsletter_recipients enable row level security;
alter table public.communication_deliveries enable row level security;

alter table public.communication_templates force row level security;
alter table public.message_threads force row level security;
alter table public.message_thread_participants force row level security;
alter table public.messages force row level security;
alter table public.newsletter_campaigns force row level security;
alter table public.newsletter_recipients force row level security;
alter table public.communication_deliveries force row level security;

create policy "Tenant admins view communication templates"
  on public.communication_templates for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Thread participants and tenant admins view threads"
  on public.message_threads for select to authenticated
  using (app_private.current_user_can_view_message_thread(tenant_id, id, false));

create policy "Users and tenant admins view thread participation"
  on public.message_thread_participants for select to authenticated
  using (
    user_id = (select auth.uid())
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
  );

create policy "Thread participants view allowed messages"
  on public.messages for select to authenticated
  using (
    (
      visibility = 'public_to_thread'
      and app_private.current_user_can_view_message_thread(tenant_id, thread_id, false)
    )
    or (
      visibility in ('internal_note', 'staff_only')
      and app_private.current_user_can_view_message_thread(tenant_id, thread_id, true)
    )
  );

create policy "Tenant admins view newsletter campaigns"
  on public.newsletter_campaigns for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant admins view newsletter recipients"
  on public.newsletter_recipients for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant admins view communication deliveries"
  on public.communication_deliveries for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

comment on table public.tenant_messages is
  'Tenant-wide announcements and portal news. Private conversations belong in message_threads/messages.';
comment on table public.communication_deliveries is
  'Channel-neutral delivery evidence. External sending remains disabled unless application configuration and human confirmation allow it.';
comment on column public.message_thread_participants.can_view_internal is
  'Parents are prohibited by a database check. Instructor access is opt-in per assignment and tenant setting.';
comment on column public.newsletter_recipients.unsubscribe_token_hash is
  'SHA-256 hash only; never store a bearer unsubscribe token in plaintext.';
