-- Rule-based lesson planning with immutable proposals and human approval.
-- The assistant never changes progress, placement or communication state.

create table public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null,
  group_id uuid not null,
  current_version_id uuid,
  status text not null default 'draft',
  approved_by_user_id uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  evaluation_json jsonb,
  evaluated_by_user_id uuid references auth.users (id) on delete set null,
  evaluated_at timestamptz,
  source text not null default 'rule_based',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_plans_session_fk
    foreign key (tenant_id, session_id)
    references public.sessions (tenant_id, id) on delete cascade,
  constraint lesson_plans_group_fk
    foreign key (tenant_id, group_id)
    references public.groups (tenant_id, id) on delete cascade,
  constraint lesson_plans_status_check check (status in ('draft', 'approved', 'completed', 'archived')),
  constraint lesson_plans_approval_check check (
    (status in ('approved', 'completed') and approved_by_user_id is not null and approved_at is not null)
    or status not in ('approved', 'completed')
  ),
  constraint lesson_plans_evaluation_check check (
    (status = 'completed' and evaluation_json is not null and evaluated_by_user_id is not null and evaluated_at is not null)
    or status <> 'completed'
  ),
  constraint lesson_plans_evaluation_shape_check check (
    evaluation_json is null
    or (
      jsonb_typeof(evaluation_json) = 'object'
      and octet_length(evaluation_json::text) <= 8192
    )
  ),
  constraint lesson_plans_source_check check (source in ('rule_based', 'manual', 'journey_simulation_bot')),
  constraint lesson_plans_test_marker_check check (
    (not is_test and journey_run_id is null and source <> 'journey_simulation_bot')
    or (is_test and journey_run_id is not null and source = 'journey_simulation_bot')
  ),
  constraint lesson_plans_session_unique unique (tenant_id, session_id),
  constraint lesson_plans_tenant_id_id_unique unique (tenant_id, id)
);

create table public.lesson_plan_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  lesson_plan_id uuid not null,
  session_id uuid not null,
  version_number integer not null,
  proposal_json jsonb not null,
  source_data_json jsonb not null,
  confidence text not null,
  reasons_json jsonb not null default '[]'::jsonb,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint lesson_plan_versions_plan_fk
    foreign key (tenant_id, lesson_plan_id)
    references public.lesson_plans (tenant_id, id) on delete cascade,
  constraint lesson_plan_versions_session_fk
    foreign key (tenant_id, session_id)
    references public.sessions (tenant_id, id) on delete cascade,
  constraint lesson_plan_versions_number_check check (version_number > 0),
  constraint lesson_plan_versions_proposal_check check (
    jsonb_typeof(proposal_json) = 'object'
    and jsonb_typeof(proposal_json -> 'groupGoals') = 'array'
    and jsonb_array_length(proposal_json -> 'groupGoals') between 1 and 3
    and jsonb_typeof(proposal_json -> 'personalAttention') = 'array'
    and jsonb_array_length(proposal_json -> 'personalAttention') <= 3
    and jsonb_typeof(proposal_json -> 'exercises') = 'array'
    and jsonb_array_length(proposal_json -> 'exercises') between 2 and 8
    and jsonb_typeof(proposal_json -> 'equipment') = 'array'
    and jsonb_typeof(proposal_json -> 'evaluationPrompts') = 'array'
    and octet_length(proposal_json::text) <= 65536
  ),
  constraint lesson_plan_versions_source_shape_check check (
    jsonb_typeof(source_data_json) = 'object'
    and octet_length(source_data_json::text) <= 32768
  ),
  constraint lesson_plan_versions_confidence_check check (confidence in ('laag', 'gemiddeld', 'hoog')),
  constraint lesson_plan_versions_reasons_check check (
    jsonb_typeof(reasons_json) = 'array'
    and jsonb_array_length(reasons_json) between 1 and 12
  ),
  constraint lesson_plan_versions_unique unique (tenant_id, lesson_plan_id, version_number),
  constraint lesson_plan_versions_tenant_id_id_unique unique (tenant_id, id)
);

alter table public.lesson_plans
  add constraint lesson_plans_current_version_fk
  foreign key (tenant_id, current_version_id)
  references public.lesson_plan_versions (tenant_id, id)
  on delete set null (current_version_id);

create table public.lesson_plan_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  lesson_plan_id uuid not null,
  version_id uuid,
  event_type text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  message text not null,
  occurred_at timestamptz not null default now(),
  constraint lesson_plan_events_plan_fk
    foreign key (tenant_id, lesson_plan_id)
    references public.lesson_plans (tenant_id, id) on delete cascade,
  constraint lesson_plan_events_version_fk
    foreign key (tenant_id, version_id)
    references public.lesson_plan_versions (tenant_id, id) on delete set null (version_id),
  constraint lesson_plan_events_type_check check (event_type in ('generated', 'regenerated', 'approved', 'evaluated', 'archived'))
);

create index lesson_plans_session_idx on public.lesson_plans (tenant_id, session_id, status);
create index lesson_plan_versions_timeline_idx on public.lesson_plan_versions (tenant_id, lesson_plan_id, version_number desc);
create index lesson_plan_events_timeline_idx on public.lesson_plan_events (tenant_id, lesson_plan_id, occurred_at desc);

create trigger lesson_plans_set_updated_at
  before update on public.lesson_plans
  for each row execute function app_private.set_updated_at();

create or replace function app_private.save_lesson_plan_proposal(
  p_tenant_id uuid,
  p_session_id uuid,
  p_group_id uuid,
  p_proposal_json jsonb,
  p_source_data_json jsonb,
  p_confidence text,
  p_reasons_json jsonb,
  p_actor_user_id uuid,
  p_is_test boolean,
  p_journey_run_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  plan_id uuid;
  version_id uuid;
  next_version integer;
  event_name text;
begin
  perform 1 from public.sessions
  where tenant_id = p_tenant_id and id = p_session_id and group_id = p_group_id
  for update;
  if not found then raise exception 'lesson_plan_session_invalid'; end if;

  select id into plan_id
  from public.lesson_plans
  where tenant_id = p_tenant_id and session_id = p_session_id
  for update;

  if plan_id is null then
    insert into public.lesson_plans (
      tenant_id, session_id, group_id, source, is_test, journey_run_id
    ) values (
      p_tenant_id, p_session_id, p_group_id,
      case when p_is_test then 'journey_simulation_bot' else 'rule_based' end,
      p_is_test, p_journey_run_id
    )
    returning id into plan_id;
    event_name := 'generated';
  else
    update public.lesson_plans
    set status = 'draft',
        approved_by_user_id = null,
        approved_at = null,
        evaluation_json = null,
        evaluated_by_user_id = null,
        evaluated_at = null
    where tenant_id = p_tenant_id and id = plan_id;
    event_name := 'regenerated';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.lesson_plan_versions
  where tenant_id = p_tenant_id and lesson_plan_id = plan_id;

  insert into public.lesson_plan_versions (
    tenant_id, lesson_plan_id, session_id, version_number, proposal_json,
    source_data_json, confidence, reasons_json, created_by_user_id
  ) values (
    p_tenant_id, plan_id, p_session_id, next_version, p_proposal_json,
    p_source_data_json, p_confidence, p_reasons_json, p_actor_user_id
  )
  returning id into version_id;

  update public.lesson_plans
  set current_version_id = version_id
  where tenant_id = p_tenant_id and id = plan_id;

  insert into public.lesson_plan_events (
    tenant_id, lesson_plan_id, version_id, event_type, actor_user_id, message
  ) values (
    p_tenant_id, plan_id, version_id, event_name, p_actor_user_id,
    case when event_name = 'generated'
      then 'Rule-based lesplanvoorstel aangemaakt.'
      else 'Lesplanvoorstel opnieuw berekend; eerdere versie blijft bewaard.'
    end
  );
  return plan_id;
end;
$$;

create or replace function public.save_lesson_plan_proposal(
  p_tenant_id uuid,
  p_session_id uuid,
  p_group_id uuid,
  p_proposal_json jsonb,
  p_source_data_json jsonb,
  p_confidence text,
  p_reasons_json jsonb,
  p_actor_user_id uuid,
  p_is_test boolean,
  p_journey_run_id uuid
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.save_lesson_plan_proposal(
    p_tenant_id, p_session_id, p_group_id, p_proposal_json,
    p_source_data_json, p_confidence, p_reasons_json, p_actor_user_id,
    p_is_test, p_journey_run_id
  );
$$;

revoke all on function app_private.save_lesson_plan_proposal(uuid, uuid, uuid, jsonb, jsonb, text, jsonb, uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function app_private.save_lesson_plan_proposal(uuid, uuid, uuid, jsonb, jsonb, text, jsonb, uuid, boolean, uuid) to service_role;
revoke all on function public.save_lesson_plan_proposal(uuid, uuid, uuid, jsonb, jsonb, text, jsonb, uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.save_lesson_plan_proposal(uuid, uuid, uuid, jsonb, jsonb, text, jsonb, uuid, boolean, uuid) to service_role;

grant select, insert, update, delete on public.lesson_plans to authenticated;
grant select, insert on public.lesson_plan_versions to authenticated;
grant select, insert on public.lesson_plan_events to authenticated;
grant all on public.lesson_plans to service_role;
grant all on public.lesson_plan_versions to service_role;
grant all on public.lesson_plan_events to service_role;

alter table public.lesson_plans enable row level security;
alter table public.lesson_plans force row level security;
alter table public.lesson_plan_versions enable row level security;
alter table public.lesson_plan_versions force row level security;
alter table public.lesson_plan_events enable row level security;
alter table public.lesson_plan_events force row level security;

create policy "Assigned staff manage lesson plans"
  on public.lesson_plans for all to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_is_assigned_to_session(session_id)
  )
  with check (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_is_assigned_to_session(session_id)
  );
create policy "Assigned staff read lesson plan versions"
  on public.lesson_plan_versions for select to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_is_assigned_to_session(session_id)
  );
create policy "Assigned staff create lesson plan versions"
  on public.lesson_plan_versions for insert to authenticated
  with check (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_is_assigned_to_session(session_id)
  );
create policy "Assigned staff read lesson plan events"
  on public.lesson_plan_events for select to authenticated
  using (
    exists (
      select 1 from public.lesson_plans plan
      where plan.tenant_id = lesson_plan_events.tenant_id
        and plan.id = lesson_plan_events.lesson_plan_id
        and (
          app_private.current_user_can_manage_tenant_domain(plan.tenant_id)
          or app_private.current_user_is_assigned_to_session(plan.session_id)
        )
    )
  );
create policy "Assigned staff create lesson plan events"
  on public.lesson_plan_events for insert to authenticated
  with check (
    exists (
      select 1 from public.lesson_plans plan
      where plan.tenant_id = lesson_plan_events.tenant_id
        and plan.id = lesson_plan_events.lesson_plan_id
        and (
          app_private.current_user_can_manage_tenant_domain(plan.tenant_id)
          or app_private.current_user_is_assigned_to_session(plan.session_id)
        )
    )
  );

comment on table public.lesson_plan_versions is
  'Immutable, explainable rule-based lesson proposals. Approval and all operational decisions remain human-owned.';
