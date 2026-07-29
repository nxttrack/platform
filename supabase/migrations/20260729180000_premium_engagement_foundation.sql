-- Premium engagement foundation: authenticated feedback, safe web-push consent
-- and privacy-minimised public diploma verification.

alter table public.certificate_records
  add column verification_public_id uuid not null default gen_random_uuid(),
  add column verification_status text not null default 'active',
  add column verification_created_at timestamptz not null default now();

alter table public.certificate_records
  add constraint certificate_records_verification_public_id_unique unique (verification_public_id),
  add constraint certificate_records_verification_status_check
    check (verification_status in ('active', 'revoked'));

create table public.certificate_verification_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  certificate_id uuid not null,
  result text not null,
  request_fingerprint text,
  occurred_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  constraint certificate_verification_events_certificate_fk
    foreign key (tenant_id, certificate_id)
    references public.certificate_records (tenant_id, id)
    on delete cascade,
  constraint certificate_verification_events_result_check
    check (result in ('valid', 'revoked', 'not_found')),
  constraint certificate_verification_events_metadata_check
    check (jsonb_typeof(metadata_json) = 'object' and octet_length(metadata_json::text) <= 2048)
);

create table public.tenant_feedback_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  trigger_type text not null,
  status text not null default 'draft',
  prompt text not null,
  follow_up_question text,
  active_from date,
  active_until date,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_feedback_campaigns_name_check check (length(trim(name)) between 3 and 120),
  constraint tenant_feedback_campaigns_trigger_check
    check (trigger_type in ('trial_completed', 'first_month', 'certificate_issued', 'manual')),
  constraint tenant_feedback_campaigns_status_check check (status in ('draft', 'active', 'paused', 'archived')),
  constraint tenant_feedback_campaigns_prompt_check check (length(trim(prompt)) between 3 and 240),
  constraint tenant_feedback_campaigns_follow_up_check
    check (follow_up_question is null or length(trim(follow_up_question)) between 3 and 240),
  constraint tenant_feedback_campaigns_period_check
    check (active_until is null or active_from is null or active_until >= active_from),
  constraint tenant_feedback_campaigns_tenant_id_id_unique unique (tenant_id, id)
);

create table public.feedback_survey_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  campaign_id uuid not null,
  participant_id uuid not null,
  guardian_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'open',
  source_entity_type text,
  source_entity_id uuid,
  requested_by_user_id uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_survey_requests_campaign_fk
    foreign key (tenant_id, campaign_id)
    references public.tenant_feedback_campaigns (tenant_id, id)
    on delete cascade,
  constraint feedback_survey_requests_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id)
    on delete cascade,
  constraint feedback_survey_requests_status_check
    check (status in ('open', 'completed', 'expired', 'cancelled')),
  constraint feedback_survey_requests_source_check
    check (source_entity_type is null or source_entity_type in ('trial', 'enrollment', 'certificate', 'manual')),
  constraint feedback_survey_requests_expiry_check check (expires_at > requested_at),
  constraint feedback_survey_requests_completion_check
    check ((status = 'completed' and completed_at is not null) or status <> 'completed'),
  constraint feedback_survey_requests_tenant_id_id_unique unique (tenant_id, id),
  constraint feedback_survey_requests_once_unique
    unique nulls not distinct (tenant_id, campaign_id, participant_id, source_entity_id)
);

create table public.feedback_survey_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  request_id uuid not null,
  guardian_user_id uuid not null references auth.users (id) on delete cascade,
  score smallint not null,
  comment text,
  follow_up_allowed boolean not null default false,
  content_classification text not null default 'personal',
  submitted_at timestamptz not null default now(),
  constraint feedback_survey_responses_request_fk
    foreign key (tenant_id, request_id)
    references public.feedback_survey_requests (tenant_id, id)
    on delete cascade,
  constraint feedback_survey_responses_score_check check (score between 0 and 10),
  constraint feedback_survey_responses_comment_check check (comment is null or length(comment) <= 2000),
  constraint feedback_survey_responses_classification_check
    check (content_classification in ('operational', 'personal', 'sensitive')),
  constraint feedback_survey_responses_request_unique unique (tenant_id, request_id)
);

create table public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  status text not null default 'active',
  consent_recorded_at timestamptz not null,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_push_subscriptions_endpoint_check check (length(endpoint) between 20 and 4096),
  constraint web_push_subscriptions_key_check check (length(p256dh_key) between 20 and 512 and length(auth_key) between 8 and 256),
  constraint web_push_subscriptions_status_check check (status in ('active', 'paused', 'revoked', 'invalid')),
  constraint web_push_subscriptions_failure_check check (failure_count >= 0),
  constraint web_push_subscriptions_tenant_id_id_unique unique (tenant_id, id),
  constraint web_push_subscriptions_user_endpoint_unique unique (tenant_id, user_id, endpoint)
);

create table public.web_push_preferences (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_changes boolean not null default true,
  new_messages boolean not null default true,
  reminders boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  constraint web_push_preferences_quiet_hours_check
    check ((quiet_hours_start is null) = (quiet_hours_end is null))
);

create index certificate_verification_events_certificate_idx
  on public.certificate_verification_events (tenant_id, certificate_id, occurred_at desc);
create index tenant_feedback_campaigns_status_idx
  on public.tenant_feedback_campaigns (tenant_id, status, trigger_type);
create index feedback_survey_requests_guardian_idx
  on public.feedback_survey_requests (tenant_id, guardian_user_id, status, requested_at desc);
create index feedback_survey_responses_campaign_analysis_idx
  on public.feedback_survey_responses (tenant_id, submitted_at desc, score);
create index web_push_subscriptions_delivery_idx
  on public.web_push_subscriptions (tenant_id, status, user_id);

create trigger tenant_feedback_campaigns_set_updated_at
  before update on public.tenant_feedback_campaigns
  for each row execute function app_private.set_updated_at();
create trigger feedback_survey_requests_set_updated_at
  before update on public.feedback_survey_requests
  for each row execute function app_private.set_updated_at();
create trigger web_push_subscriptions_set_updated_at
  before update on public.web_push_subscriptions
  for each row execute function app_private.set_updated_at();
create trigger web_push_preferences_set_updated_at
  before update on public.web_push_preferences
  for each row execute function app_private.set_updated_at();

grant select on public.certificate_verification_events to authenticated;
grant select, insert, update, delete on public.tenant_feedback_campaigns to authenticated;
grant select, insert, update on public.feedback_survey_requests to authenticated;
grant select, insert on public.feedback_survey_responses to authenticated;
grant select, insert, update, delete on public.web_push_subscriptions to authenticated;
grant select, insert, update, delete on public.web_push_preferences to authenticated;
grant all on public.certificate_verification_events to service_role;
grant all on public.tenant_feedback_campaigns to service_role;
grant all on public.feedback_survey_requests to service_role;
grant all on public.feedback_survey_responses to service_role;
grant all on public.web_push_subscriptions to service_role;
grant all on public.web_push_preferences to service_role;

alter table public.certificate_verification_events enable row level security;
alter table public.certificate_verification_events force row level security;
alter table public.tenant_feedback_campaigns enable row level security;
alter table public.tenant_feedback_campaigns force row level security;
alter table public.feedback_survey_requests enable row level security;
alter table public.feedback_survey_requests force row level security;
alter table public.feedback_survey_responses enable row level security;
alter table public.feedback_survey_responses force row level security;
alter table public.web_push_subscriptions enable row level security;
alter table public.web_push_subscriptions force row level security;
alter table public.web_push_preferences enable row level security;
alter table public.web_push_preferences force row level security;

create policy "Tenant administrators view certificate verification audit"
  on public.certificate_verification_events for select to authenticated
  using (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin']));

create policy "Tenant members view active feedback campaigns"
  on public.tenant_feedback_campaigns for select to authenticated
  using (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'parent']));
create policy "Tenant administrators manage feedback campaigns"
  on public.tenant_feedback_campaigns for all to authenticated
  using (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin']))
  with check (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin']));

create policy "Guardians and tenant administrators view feedback requests"
  on public.feedback_survey_requests for select to authenticated
  using (
    guardian_user_id = auth.uid()
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
  );
create policy "Tenant administrators manage feedback requests"
  on public.feedback_survey_requests for all to authenticated
  using (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin']))
  with check (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin']));

create policy "Guardians and tenant administrators view feedback responses"
  on public.feedback_survey_responses for select to authenticated
  using (
    guardian_user_id = auth.uid()
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
  );
create policy "Guardians submit own requested feedback"
  on public.feedback_survey_responses for insert to authenticated
  with check (
    guardian_user_id = auth.uid()
    and app_private.current_user_has_tenant_role(tenant_id, array['parent'])
    and exists (
      select 1 from public.feedback_survey_requests request
      where request.tenant_id = feedback_survey_responses.tenant_id
        and request.id = feedback_survey_responses.request_id
        and request.guardian_user_id = auth.uid()
        and request.status = 'open'
        and request.expires_at > now()
    )
  );

create policy "Users manage own push subscriptions"
  on public.web_push_subscriptions for all to authenticated
  using (user_id = auth.uid() and app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'instructor', 'parent']))
  with check (user_id = auth.uid() and app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'instructor', 'parent']));
create policy "Users manage own push preferences"
  on public.web_push_preferences for all to authenticated
  using (user_id = auth.uid() and app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'instructor', 'parent']))
  with check (user_id = auth.uid() and app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'instructor', 'parent']));

comment on table public.certificate_verification_events is
  'Service-only privacy-minimised evidence that a public verification code was checked.';
comment on table public.feedback_survey_responses is
  'Authenticated guardian feedback. Free text is classified as personal and never published automatically.';
comment on table public.web_push_subscriptions is
  'Explicit-consent push endpoints. Delivery remains disabled until VAPID configuration and legal approval exist.';
