-- Atomic, idempotent tenant provisioning. The database graph and invitation
-- outbox entries commit together; Auth identity materialization is a separate,
-- retry-safe post-commit boundary because auth.admin is an external API.

alter table public.tenant_onboarding_runs
  add column if not exists idempotency_key text,
  add column if not exists request_fingerprint text,
  add column if not exists result_data jsonb not null default '{}'::jsonb,
  add column if not exists last_error_code text,
  add column if not exists last_error_step text,
  add column if not exists provisioning_attempts integer not null default 0,
  add column if not exists identity_attempts integer not null default 0,
  add constraint tenant_onboarding_runs_idempotency_key_check
    check (idempotency_key is null or idempotency_key ~ '^[a-f0-9]{64}$'),
  add constraint tenant_onboarding_runs_request_fingerprint_check
    check (request_fingerprint is null or request_fingerprint ~ '^[a-f0-9]{64}$'),
  add constraint tenant_onboarding_runs_result_data_check
    check (jsonb_typeof(result_data) = 'object' and octet_length(result_data::text) <= 65536),
  add constraint tenant_onboarding_runs_error_bounds_check
    check (
      (last_error_code is null or length(last_error_code) <= 100)
      and (last_error_step is null or length(last_error_step) <= 80)
    ),
  add constraint tenant_onboarding_runs_identity_attempts_check
    check (identity_attempts between 0 and 100),
  add constraint tenant_onboarding_runs_provisioning_attempts_check
    check (provisioning_attempts between 0 and 100);

create unique index tenant_onboarding_runs_idempotency_unique
  on public.tenant_onboarding_runs (idempotency_key)
  where idempotency_key is not null;

alter table public.auth_invitations
  add column if not exists provisioning_run_id uuid
    references public.tenant_onboarding_runs (id) on delete set null,
  add column if not exists provisioning_business_key text,
  add column if not exists invitee_name text,
  add column if not exists identity_status text,
  add column if not exists identity_error_code text,
  add constraint auth_invitations_provisioning_business_key_check
    check (
      provisioning_business_key is null
      or length(provisioning_business_key) between 8 and 200
    ),
  add constraint auth_invitations_invitee_name_check
    check (invitee_name is null or length(trim(invitee_name)) between 1 and 200),
  add constraint auth_invitations_identity_status_check
    check (identity_status is null or identity_status in ('pending', 'ready', 'attention_required')),
  add constraint auth_invitations_identity_error_code_check
    check (identity_error_code is null or length(identity_error_code) <= 100);

create unique index auth_invitations_provisioning_business_unique
  on public.auth_invitations (provisioning_run_id, provisioning_business_key)
  where provisioning_run_id is not null and provisioning_business_key is not null;

create table public.tenant_onboarding_events (
  id uuid primary key default gen_random_uuid(),
  onboarding_run_id uuid not null
    references public.tenant_onboarding_runs (id) on delete restrict,
  tenant_id uuid references public.tenants (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  event_key text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint tenant_onboarding_events_type_check
    check (event_type in ('requested', 'database_committed', 'database_attention', 'identity_materialized', 'identity_attention', 'opened')),
  constraint tenant_onboarding_events_key_check
    check (length(event_key) between 8 and 200),
  constraint tenant_onboarding_events_details_check
    check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096),
  constraint tenant_onboarding_events_unique unique (onboarding_run_id, event_key)
);

create index tenant_onboarding_events_run_idx
  on public.tenant_onboarding_events (onboarding_run_id, created_at);
create index tenant_onboarding_events_tenant_idx
  on public.tenant_onboarding_events (tenant_id, created_at desc)
  where tenant_id is not null;

create function app_private.prevent_tenant_onboarding_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'Tenant onboarding events are append-only';
end;
$$;

create trigger tenant_onboarding_events_append_only
  before update or delete on public.tenant_onboarding_events
  for each row execute function app_private.prevent_tenant_onboarding_event_mutation();

create function app_private.resolve_auth_user_id_by_email(target_email text)
returns uuid
language sql
stable
security definer
set search_path = auth, pg_temp
as $$
  select user_account.id
  from auth.users user_account
  where lower(user_account.email) = lower(trim(target_email))
  order by user_account.created_at, user_account.id
  limit 1;
$$;

create function public.resolve_auth_user_id_by_email(target_email text)
returns uuid
language sql
stable
security invoker
set search_path = public, app_private, pg_temp
as $$
  select app_private.resolve_auth_user_id_by_email(target_email);
$$;

create function public.provision_tenant_atomic(
  target_actor_user_id uuid,
  target_idempotency_key text,
  target_request_fingerprint text,
  target_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  existing_run public.tenant_onboarding_runs%rowtype;
  target_run_id uuid;
  target_tenant_id uuid;
  target_program_id uuid;
  target_first_stage_id uuid;
  target_location_id uuid;
  target_pool_id uuid;
  target_group_id uuid;
  target_payment_plan_id uuid;
  target_invitation_id uuid;
  target_slug text := lower(trim(target_payload ->> 'slug'));
  target_name text := trim(target_payload ->> 'name');
  target_hostname text := lower(trim(target_payload ->> 'hostname'));
  target_custom_domain text := nullif(lower(trim(target_payload ->> 'customDomain')), '');
  target_program_name text := trim(target_payload ->> 'programName');
  target_location_name text := trim(target_payload ->> 'locationName');
  target_pool_name text := trim(target_payload ->> 'poolName');
  target_group_name text := trim(target_payload ->> 'groupName');
  target_theme_key text := trim(target_payload ->> 'portalThemeKey');
  target_theme_release text := trim(target_payload ->> 'portalThemeRelease');
  target_product_name text := trim(target_payload ->> 'productName');
  target_primary_color text := lower(trim(target_payload ->> 'primaryColor'));
  target_accent_color text := lower(trim(target_payload ->> 'accentColor'));
  target_group_capacity integer;
  target_weekday integer;
  target_amount_cents integer;
  target_start_time time;
  target_end_time time;
  provisioning_step text := 'organization';
  failure_code text;
  invitation jsonb;
  invitation_message jsonb;
  result_invitations jsonb := '[]'::jsonb;
  result_payload jsonb;
  stage_count integer;
  invitation_count integer;
  owner_count integer;
  attempt_number integer;
  retrying boolean := false;
begin
  if target_payload is null or jsonb_typeof(target_payload) <> 'object' then
    raise exception 'Invalid tenant provisioning payload';
  end if;
  if target_idempotency_key !~ '^[a-f0-9]{64}$'
    or target_request_fingerprint !~ '^[a-f0-9]{64}$'
  then
    raise exception 'Invalid tenant provisioning idempotency contract';
  end if;
  if not exists (
    select 1
    from public.platform_memberships membership
    where membership.user_id = target_actor_user_id
      and membership.status = 'active'
      and membership.role in ('platform_owner', 'platform_admin')
  ) then
    raise exception 'Platform administrator required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_idempotency_key, 0));
  select * into existing_run
  from public.tenant_onboarding_runs onboarding_run
  where onboarding_run.idempotency_key = target_idempotency_key
  for update;

  if existing_run.id is not null then
    if existing_run.request_fingerprint is distinct from target_request_fingerprint then
      raise exception 'Tenant provisioning idempotency key reused with different input';
    end if;
    if existing_run.tenant_id is not null then
      return existing_run.result_data || jsonb_build_object(
        'outcome', existing_run.status,
        'idempotentReplay', true
      );
    end if;
    target_run_id := existing_run.id;
    retrying := true;
    update public.tenant_onboarding_runs
    set status = 'provisioning',
        current_step = 'organization',
        checklist = '{}'::jsonb,
        provisioning_attempts = least(provisioning_attempts + 1, 100),
        last_error_code = null,
        last_error_step = null
    where id = target_run_id
    returning provisioning_attempts into attempt_number;
  else
    insert into public.tenant_onboarding_runs (
      status,
      current_step,
      draft_data,
      created_by_user_id,
      idempotency_key,
      request_fingerprint,
      provisioning_attempts
    ) values (
      'provisioning',
      'organization',
      jsonb_build_object(
        'name', target_name,
        'slug', target_slug,
        'hostname', target_hostname,
        'programName', target_program_name,
        'locationName', target_location_name,
        'poolName', target_pool_name,
        'groupName', target_group_name,
        'staffCount', jsonb_array_length(coalesce(target_payload -> 'invitations', '[]'::jsonb)) - 1
      ),
      target_actor_user_id,
      target_idempotency_key,
      target_request_fingerprint,
      1
    ) returning id into target_run_id;
    attempt_number := 1;
  end if;

  insert into public.tenant_onboarding_events (
    onboarding_run_id, actor_user_id, event_type, event_key, details
  ) values (
    target_run_id,
    target_actor_user_id,
    'requested',
    'requested:' || attempt_number::text,
    jsonb_build_object('attempt', attempt_number, 'retry', retrying)
  ) on conflict (onboarding_run_id, event_key) do nothing;

  begin
    stage_count := jsonb_array_length(coalesce(target_payload -> 'stageNames', '[]'::jsonb));
    invitation_count := jsonb_array_length(coalesce(target_payload -> 'invitations', '[]'::jsonb));
    target_group_capacity := (target_payload ->> 'groupCapacity')::integer;
    target_weekday := (target_payload ->> 'weekday')::integer;
    target_amount_cents := (target_payload ->> 'amountCents')::integer;
    target_start_time := (target_payload ->> 'startTime')::time;
    target_end_time := (target_payload ->> 'endTime')::time;

    if length(target_name) not between 2 and 200
      or target_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or target_hostname !~ '^[a-z0-9.-]+\.nxttrack\.nl$'
      or target_hostname <> (target_slug || '.nxttrack.nl')
      or (target_custom_domain is not null and target_custom_domain !~ '^[a-z0-9.-]+\.[a-z]{2,}$')
      or length(target_program_name) not between 2 and 200
      or length(target_location_name) not between 2 and 200
      or length(target_pool_name) not between 2 and 200
      or length(target_group_name) not between 2 and 200
      or length(target_product_name) not between 1 and 200
      or target_primary_color !~ '^#[0-9a-f]{6}$'
      or target_accent_color !~ '^#[0-9a-f]{6}$'
      or target_group_capacity not between 1 and 1000
      or target_weekday not between 1 and 7
      or target_start_time >= target_end_time
      or target_amount_cents not between 1 and 100000000
      or stage_count not between 1 and 20
      or invitation_count not between 2 and 51
    then
      raise exception 'Invalid bounded tenant provisioning input';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(target_payload -> 'stageNames') stage(stage_name)
      where length(trim(stage.stage_name)) not between 1 and 200
    ) then
      raise exception 'Invalid tenant provisioning stage';
    end if;

    select count(*)::integer into owner_count
    from jsonb_array_elements(target_payload -> 'invitations') candidate
    where candidate ->> 'role' = 'tenant_owner';
    if owner_count <> 1 or exists (
      select 1
      from jsonb_array_elements(target_payload -> 'invitations') candidate
      where lower(trim(candidate ->> 'email')) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
        or candidate ->> 'role' not in ('tenant_owner', 'instructor')
        or candidate ->> 'codeHash' !~ '^[a-f0-9]{64}$'
        or length(trim(candidate ->> 'businessKey')) not between 8 and 200
        or length(trim(candidate ->> 'fullName')) not between 1 and 200
        or jsonb_typeof(candidate -> 'message') <> 'object'
    ) then
      raise exception 'Invalid tenant provisioning invitation';
    end if;
    if (
      select count(*)
      from (
        select lower(trim(candidate ->> 'email')), candidate ->> 'role'
        from jsonb_array_elements(target_payload -> 'invitations') candidate
        group by lower(trim(candidate ->> 'email')), candidate ->> 'role'
      ) distinct_invitation
    ) <> invitation_count then
      raise exception 'Duplicate tenant provisioning invitation';
    end if;

    insert into public.tenants (name, slug, sector, status)
    values (target_name, target_slug, 'swim_school', 'inactive')
    returning id into target_tenant_id;
    update public.tenant_onboarding_runs
    set tenant_id = target_tenant_id, current_step = 'identity'
    where id = target_run_id;
    provisioning_step := 'organization';
    if current_setting('nxttrack.test_failure_step', true) = provisioning_step then
      raise exception 'Injected tenant provisioning failure';
    end if;

    provisioning_step := 'identity';
    insert into public.tenant_settings (
      tenant_id, terminology_sector, locale, timezone, assessment_rating_display
    ) values (
      target_tenant_id, 'swim_school', 'nl-NL', 'Europe/Amsterdam', 'smileys'
    );
    insert into public.tenant_portal_theme_availability (
      tenant_id, theme_key, theme_release, is_enabled, reason, enabled_by_platform_admin_id
    )
    select
      target_tenant_id,
      release.theme_key,
      release.release,
      true,
      'Beschikbaar gesteld tijdens tenantonboarding',
      target_actor_user_id
    from public.portal_theme_release release
    where release.status = 'published'
      and release.manifest_schema_version = 3
      and release.portal_contract = 'parent-portal/1.2'
    on conflict (tenant_id, theme_key, theme_release) do nothing;
    perform public.activate_tenant_portal_theme(
      target_tenant_id,
      target_theme_key,
      target_theme_release,
      target_actor_user_id,
      'Expliciete keuze tijdens tenantonboarding',
      'onboarding:' || target_run_id::text,
      target_run_id::text,
      'activated'
    );
    insert into public.tenant_domains (tenant_id, hostname, kind, status, is_primary)
    values (target_tenant_id, target_hostname, 'subdomain', 'verified', true);
    if target_custom_domain is not null and target_custom_domain <> target_hostname then
      insert into public.tenant_domains (tenant_id, hostname, kind, status, is_primary)
      values (target_tenant_id, target_custom_domain, 'custom_domain', 'pending', false);
    end if;
    insert into public.tenant_branding (
      tenant_id, product_name, primary_color, accent_color, portal_welcome, status, pwa_enabled
    ) values (
      target_tenant_id,
      target_product_name,
      target_primary_color,
      target_accent_color,
      'Welkom bij ' || target_name || '. Hier volgt u lessen, voortgang en betalingen.',
      'active',
      true
    );
    if current_setting('nxttrack.test_failure_step', true) = provisioning_step then
      raise exception 'Injected tenant provisioning failure';
    end if;

    provisioning_step := 'program';
    update public.tenant_onboarding_runs set current_step = 'program' where id = target_run_id;
    insert into public.programs (
      tenant_id, name, code, description, status, sort_order
    ) values (
      target_tenant_id,
      target_program_name,
      'ZWEM-ABC',
      'Doorlopende leerlijn met heldere voortgang per niveau.',
      'active',
      10
    ) returning id into target_program_id;
    insert into public.program_stages (
      tenant_id, program_id, name, code, badge_label, color_hex, status, sort_order
    )
    select
      target_tenant_id,
      target_program_id,
      trim(stage.stage_name),
      'NIVEAU-' || stage.ordinality::text,
      trim(stage.stage_name),
      (array['#0ea5e9', '#06b6d4', '#14b8a6', '#22c55e'])[((stage.ordinality - 1) % 4) + 1],
      'active',
      stage.ordinality * 10
    from jsonb_array_elements_text(target_payload -> 'stageNames') with ordinality as stage(stage_name, ordinality);
    select id into target_first_stage_id
    from public.program_stages
    where tenant_id = target_tenant_id and program_id = target_program_id
    order by sort_order, id
    limit 1;
    if current_setting('nxttrack.test_failure_step', true) = provisioning_step then
      raise exception 'Injected tenant provisioning failure';
    end if;

    provisioning_step := 'operations';
    update public.tenant_onboarding_runs set current_step = 'operations' where id = target_run_id;
    insert into public.resources (tenant_id, kind, name, code, status)
    values (target_tenant_id, 'location', target_location_name, 'LOC-01', 'active')
    returning id into target_location_id;
    insert into public.resources (
      tenant_id, parent_resource_id, kind, name, code, capacity, safety_capacity, status
    ) values (
      target_tenant_id, target_location_id, 'pool', target_pool_name, 'BAD-01', 24, 24, 'active'
    ) returning id into target_pool_id;
    insert into public.groups (
      tenant_id, program_id, stage_id, default_resource_id, name, code, status,
      capacity, regular_capacity, flex_capacity, trial_capacity, hard_capacity,
      default_weekday, default_start_time, default_end_time, starts_on
    ) values (
      target_tenant_id, target_program_id, target_first_stage_id, target_pool_id,
      target_group_name, 'GRP-01', 'active', target_group_capacity,
      target_group_capacity, 0, 0, target_group_capacity,
      target_weekday, target_start_time, target_end_time, current_date
    ) returning id into target_group_id;
    if current_setting('nxttrack.test_failure_step', true) = provisioning_step then
      raise exception 'Injected tenant provisioning failure';
    end if;

    provisioning_step := 'billing';
    update public.tenant_onboarding_runs set current_step = 'billing' where id = target_run_id;
    insert into public.payment_plans (
      tenant_id, program_id, code, name, description, amount_cents, currency,
      billing_interval, billing_day, payment_terms_days, status
    ) values (
      target_tenant_id, target_program_id, 'MAAND', 'Maandabonnement',
      'Doorlopend maandabonnement voor zwemlessen.', target_amount_cents,
      'EUR', 'monthly', 1, 14, 'active'
    ) returning id into target_payment_plan_id;
    if current_setting('nxttrack.test_failure_step', true) = provisioning_step then
      raise exception 'Injected tenant provisioning failure';
    end if;

    provisioning_step := 'invitations';
    update public.tenant_onboarding_runs set current_step = 'owner' where id = target_run_id;
    for invitation in
      select candidate.value
      from jsonb_array_elements(target_payload -> 'invitations') candidate(value)
      order by case when candidate.value ->> 'role' = 'tenant_owner' then 0 else 1 end,
        lower(candidate.value ->> 'email')
    loop
      insert into public.auth_invitations (
        email, tenant_id, role, invited_by_user_id, status, delivery_status,
        expires_at, code_hash, requires_password_setup, provisioning_run_id,
        provisioning_business_key, invitee_name, identity_status
      ) values (
        lower(trim(invitation ->> 'email')),
        target_tenant_id,
        invitation ->> 'role',
        target_actor_user_id,
        'pending',
        'pending',
        (invitation ->> 'expiresAt')::timestamptz,
        invitation ->> 'codeHash',
        true,
        target_run_id,
        invitation ->> 'businessKey',
        trim(invitation ->> 'fullName'),
        'pending'
      ) returning id into target_invitation_id;

      invitation_message := (invitation -> 'message') || jsonb_build_object(
        'recipientUserId', null,
        'relatedId', target_invitation_id,
        'relatedType', 'auth_invitation',
        'tenantId', target_tenant_id,
        'to', lower(trim(invitation ->> 'email'))
      );
      perform public.enqueue_email_outbox(
        target_tenant_id,
        'auth.invitation',
        'onboarding:' || target_run_id::text || ':' || (invitation ->> 'businessKey'),
        invitation_message,
        'auth_invitation',
        target_invitation_id,
        5
      );
      -- Do not deliver an invitation before its external Auth identity and
      -- tenant membership exist. The finalizer releases every row together.
      update public.email_outbox
      set next_attempt_at = now() + interval '100 years'
      where tenant_id = target_tenant_id
        and payload_reference_type = 'auth_invitation'
        and payload_reference_id = target_invitation_id;
      result_invitations := result_invitations || jsonb_build_array(jsonb_build_object(
        'id', target_invitation_id,
        'email', lower(trim(invitation ->> 'email')),
        'role', invitation ->> 'role'
      ));
    end loop;
    if current_setting('nxttrack.test_failure_step', true) = provisioning_step then
      raise exception 'Injected tenant provisioning failure';
    end if;

    provisioning_step := 'opening';
    result_payload := jsonb_build_object(
      'runId', target_run_id,
      'tenantId', target_tenant_id,
      'programId', target_program_id,
      'groupId', target_group_id,
      'paymentPlanId', target_payment_plan_id,
      'invitationIds', result_invitations,
      'outcome', 'ready',
      'idempotentReplay', false
    );
    if current_setting('nxttrack.test_failure_step', true) = provisioning_step then
      raise exception 'Injected tenant provisioning failure';
    end if;
    update public.tenant_onboarding_runs
    set status = 'ready',
        current_step = 'identity',
        result_data = result_payload - 'outcome' - 'idempotentReplay',
        checklist = jsonb_build_object(
          'branding', true,
          'customDomainPending', target_custom_domain is not null,
          'domain', true,
          'group', true,
          'location', true,
          'ownerInvitationQueued', true,
          'paymentPlan', true,
          'programAndStages', true,
          'portalTheme', target_theme_key || '@' || target_theme_release,
          'staffInvitationsQueued', true
        ),
        last_error_code = null,
        last_error_step = null
    where id = target_run_id;
    insert into public.tenant_onboarding_events (
      onboarding_run_id, tenant_id, actor_user_id, event_type, event_key, details
    ) values (
      target_run_id,
      target_tenant_id,
      target_actor_user_id,
      'database_committed',
      'database_committed:v1',
      jsonb_build_object('invitationCount', invitation_count)
    ) on conflict (onboarding_run_id, event_key) do nothing;
    return result_payload;
  exception when others then
    failure_code := 'provisioning_' || regexp_replace(provisioning_step, '[^a-z0-9_]+', '_', 'g') || '_failed';
    update public.tenant_onboarding_runs
    set tenant_id = null,
        status = 'attention_required',
        current_step = case
          when provisioning_step in ('organization', 'identity', 'program', 'operations', 'billing', 'opening') then provisioning_step
          else 'staff'
        end,
        checklist = jsonb_build_object('errorCode', failure_code, 'errorStep', provisioning_step),
        result_data = '{}'::jsonb,
        last_error_code = failure_code,
        last_error_step = provisioning_step
    where id = target_run_id;
    insert into public.tenant_onboarding_events (
      onboarding_run_id, actor_user_id, event_type, event_key, details
    ) values (
      target_run_id,
      target_actor_user_id,
      'database_attention',
      'database_attention:' || attempt_number::text || ':' || provisioning_step,
      jsonb_build_object('attempt', attempt_number, 'errorCode', failure_code, 'step', provisioning_step)
    ) on conflict (onboarding_run_id, event_key) do nothing;
    return jsonb_build_object(
      'runId', target_run_id,
      'tenantId', null,
      'outcome', 'attention_required',
      'errorCode', failure_code,
      'errorStep', provisioning_step,
      'idempotentReplay', retrying
    );
  end;
end;
$$;

create function public.materialize_tenant_onboarding_invitation(
  target_actor_user_id uuid,
  target_run_id uuid,
  target_invitation_id uuid,
  target_user_id uuid,
  target_is_new_account boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  onboarding_run public.tenant_onboarding_runs%rowtype;
  invitation public.auth_invitations%rowtype;
  already_materialized boolean := false;
begin
  if not exists (
    select 1 from public.platform_memberships membership
    where membership.user_id = target_actor_user_id
      and membership.status = 'active'
      and membership.role in ('platform_owner', 'platform_admin')
  ) then
    raise exception 'Platform administrator required';
  end if;
  select * into onboarding_run
  from public.tenant_onboarding_runs candidate
  where candidate.id = target_run_id
  for update;
  if onboarding_run.id is null or onboarding_run.tenant_id is null
    or onboarding_run.status not in ('ready', 'attention_required', 'opened')
  then
    raise exception 'Tenant onboarding run is not ready for identity materialization';
  end if;

  select * into invitation
  from public.auth_invitations candidate
  where candidate.id = target_invitation_id
    and candidate.provisioning_run_id = target_run_id
    and candidate.tenant_id = onboarding_run.tenant_id
  for update;
  if invitation.id is null or invitation.status <> 'pending' then
    raise exception 'Provisioning invitation is not pending';
  end if;
  if invitation.invited_user_id is not null then
    if invitation.invited_user_id <> target_user_id then
      raise exception 'Provisioning invitation is bound to another Auth user';
    end if;
    already_materialized := true;
  end if;

  if not already_materialized then
    insert into public.profiles (id, email, full_name)
    values (target_user_id, lower(invitation.email), invitation.invitee_name)
    on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name);

    insert into public.user_security (
      user_id, email, must_change_password, last_invited_at
    ) values (
      target_user_id, lower(invitation.email), target_is_new_account, now()
    )
    on conflict (user_id) do update
    set email = excluded.email,
        must_change_password = public.user_security.must_change_password or excluded.must_change_password,
        last_invited_at = excluded.last_invited_at;

    insert into public.tenant_memberships (
      tenant_id, user_id, role, status, invited_email, invitation_id, invitation_expires_at
    ) values (
      onboarding_run.tenant_id,
      target_user_id,
      invitation.role,
      'invited',
      lower(invitation.email),
      invitation.id,
      invitation.expires_at
    )
    on conflict (tenant_id, user_id, role) do update
    set status = case
          when public.tenant_memberships.status = 'active' then 'active'
          else 'invited'
        end,
        invited_email = excluded.invited_email,
        invitation_id = case
          when public.tenant_memberships.status = 'active' then public.tenant_memberships.invitation_id
          else excluded.invitation_id
        end,
        invitation_expires_at = case
          when public.tenant_memberships.status = 'active' then public.tenant_memberships.invitation_expires_at
          else excluded.invitation_expires_at
        end;

    update public.auth_invitations
    set invited_user_id = target_user_id,
        requires_password_setup = target_is_new_account,
        identity_status = 'ready',
        identity_error_code = null
    where id = invitation.id;

    insert into public.tenant_onboarding_events (
      onboarding_run_id, tenant_id, actor_user_id, event_type, event_key, details
    ) values (
      target_run_id,
      onboarding_run.tenant_id,
      target_actor_user_id,
      'identity_materialized',
      'identity:' || invitation.id::text,
      jsonb_build_object('invitationId', invitation.id, 'role', invitation.role)
    ) on conflict (onboarding_run_id, event_key) do nothing;
  end if;

  update public.tenant_onboarding_runs
  set status = case when status = 'attention_required' then 'ready' else status end,
      current_step = case when status = 'opened' then current_step else 'identity' end,
      last_error_code = null,
      last_error_step = null
  where id = target_run_id;

  return jsonb_build_object(
    'invitationId', invitation.id,
    'userId', target_user_id,
    'alreadyMaterialized', already_materialized
  );
end;
$$;

create function public.complete_tenant_provisioning(
  target_actor_user_id uuid,
  target_run_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  onboarding_run public.tenant_onboarding_runs%rowtype;
  expected_invitations integer;
  ready_invitations integer;
  queued_invitations integer;
begin
  if not exists (
    select 1 from public.platform_memberships membership
    where membership.user_id = target_actor_user_id
      and membership.status = 'active'
      and membership.role in ('platform_owner', 'platform_admin')
  ) then
    raise exception 'Platform administrator required';
  end if;

  select * into onboarding_run
  from public.tenant_onboarding_runs candidate
  where candidate.id = target_run_id
  for update;
  if onboarding_run.id is null or onboarding_run.tenant_id is null then
    raise exception 'Tenant onboarding run not found';
  end if;
  if onboarding_run.status = 'opened' then
    return onboarding_run.result_data || jsonb_build_object('outcome', 'opened', 'idempotentReplay', true);
  end if;
  if onboarding_run.status <> 'ready' then
    raise exception 'Tenant onboarding run is not ready to open';
  end if;

  select
    count(*)::integer,
    count(*) filter (where identity_status = 'ready' and invited_user_id is not null)::integer
  into expected_invitations, ready_invitations
  from public.auth_invitations invitation
  where invitation.provisioning_run_id = target_run_id
    and invitation.tenant_id = onboarding_run.tenant_id;

  select count(distinct invitation.id)::integer into queued_invitations
  from public.email_outbox outbox
  join public.auth_invitations invitation
    on invitation.id = outbox.payload_reference_id
   and outbox.payload_reference_type = 'auth_invitation'
  where invitation.provisioning_run_id = target_run_id
    and outbox.tenant_id = onboarding_run.tenant_id;

  if expected_invitations < 2
    or ready_invitations <> expected_invitations
    or queued_invitations <> expected_invitations
  then
    raise exception 'Tenant onboarding identities or outbox entries are incomplete';
  end if;
  if not exists (
    select 1 from public.tenants tenant
    where tenant.id = onboarding_run.tenant_id and tenant.status in ('inactive', 'active')
  ) then
    raise exception 'Tenant onboarding database graph is unavailable';
  end if;

  update public.tenants
  set status = 'active'
  where id = onboarding_run.tenant_id;

  update public.email_outbox outbox
  set next_attempt_at = now()
  from public.auth_invitations invitation
  where invitation.provisioning_run_id = target_run_id
    and invitation.tenant_id = onboarding_run.tenant_id
    and outbox.tenant_id = onboarding_run.tenant_id
    and outbox.payload_reference_type = 'auth_invitation'
    and outbox.payload_reference_id = invitation.id
    and outbox.status in ('queued', 'retry');

  update public.tenant_onboarding_runs
  set status = 'opened',
      current_step = 'opening',
      checklist = checklist || jsonb_build_object(
        'identityMaterialized', true,
        'outboxQueued', true
      ),
      completed_by_user_id = target_actor_user_id,
      completed_at = now(),
      last_error_code = null,
      last_error_step = null
  where id = target_run_id;

  insert into public.tenant_onboarding_events (
    onboarding_run_id, tenant_id, actor_user_id, event_type, event_key, details
  ) values (
    target_run_id,
    onboarding_run.tenant_id,
    target_actor_user_id,
    'opened',
    'opened:v1',
    jsonb_build_object('invitationCount', expected_invitations)
  ) on conflict (onboarding_run_id, event_key) do nothing;

  return onboarding_run.result_data || jsonb_build_object('outcome', 'opened', 'idempotentReplay', false);
end;
$$;

create function public.mark_tenant_provisioning_identity_attention(
  target_actor_user_id uuid,
  target_run_id uuid,
  target_error_code text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target_tenant_id uuid;
  bounded_code text := left(regexp_replace(lower(coalesce(target_error_code, 'identity_failed')), '[^a-z0-9_]+', '_', 'g'), 100);
begin
  if not exists (
    select 1 from public.platform_memberships membership
    where membership.user_id = target_actor_user_id
      and membership.status = 'active'
      and membership.role in ('platform_owner', 'platform_admin')
  ) then
    raise exception 'Platform administrator required';
  end if;
  select tenant_id into target_tenant_id
  from public.tenant_onboarding_runs
  where id = target_run_id and status <> 'opened'
  for update;
  if not found then return false; end if;

  update public.tenant_onboarding_runs
  set status = 'attention_required',
      current_step = 'identity',
      identity_attempts = least(identity_attempts + 1, 100),
      last_error_code = bounded_code,
      last_error_step = 'identity',
      checklist = checklist || jsonb_build_object('identityErrorCode', bounded_code)
  where id = target_run_id;
  insert into public.tenant_onboarding_events (
    onboarding_run_id, tenant_id, actor_user_id, event_type, event_key, details
  ) values (
    target_run_id,
    target_tenant_id,
    target_actor_user_id,
    'identity_attention',
    'identity_attention:' || (select identity_attempts::text from public.tenant_onboarding_runs where id = target_run_id),
    jsonb_build_object('errorCode', bounded_code)
  ) on conflict (onboarding_run_id, event_key) do nothing;
  return true;
end;
$$;

grant select on table public.tenant_onboarding_events to authenticated;
grant select, insert on table public.tenant_onboarding_events to service_role;

alter table public.tenant_onboarding_events enable row level security;
alter table public.tenant_onboarding_events force row level security;

create policy tenant_onboarding_events_platform_read
  on public.tenant_onboarding_events
  for select
  to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));

revoke all on function app_private.prevent_tenant_onboarding_event_mutation() from public, anon, authenticated;
revoke all on function app_private.resolve_auth_user_id_by_email(text) from public, anon, authenticated;
revoke all on function public.resolve_auth_user_id_by_email(text) from public, anon, authenticated;
revoke all on function public.provision_tenant_atomic(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.materialize_tenant_onboarding_invitation(uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.complete_tenant_provisioning(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_tenant_provisioning_identity_attention(uuid, uuid, text) from public, anon, authenticated;

grant execute on function app_private.prevent_tenant_onboarding_event_mutation() to service_role;
grant execute on function app_private.resolve_auth_user_id_by_email(text) to service_role;
grant execute on function public.resolve_auth_user_id_by_email(text) to service_role;
grant execute on function public.provision_tenant_atomic(uuid, text, text, jsonb) to service_role;
grant execute on function public.materialize_tenant_onboarding_invitation(uuid, uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.complete_tenant_provisioning(uuid, uuid) to service_role;
grant execute on function public.mark_tenant_provisioning_identity_attention(uuid, uuid, text) to service_role;
