alter table public.group_memberships
  add constraint group_memberships_tenant_id_id_unique unique (tenant_id, id);

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  intake_submission_id uuid,
  program_id uuid not null,
  recommended_stage_id uuid,
  parent_name text not null,
  parent_email text not null,
  parent_phone text,
  participant_name text not null,
  participant_birth_date date,
  selected_option text not null default 'waitlist',
  status text not null default 'waiting',
  priority_date date not null default current_date,
  source text not null default 'intake',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waitlist_entries_intake_submission_fk foreign key (tenant_id, intake_submission_id) references public.intake_submissions (tenant_id, id) on delete restrict,
  constraint waitlist_entries_program_fk foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete restrict,
  constraint waitlist_entries_stage_fk foreign key (tenant_id, recommended_stage_id) references public.program_stages (tenant_id, id) on delete restrict,
  constraint waitlist_entries_selected_option_check check (selected_option in ('enrollment', 'trial', 'waitlist', 'information_request')),
  constraint waitlist_entries_status_check check (status in ('waiting', 'reviewing', 'offered', 'placed', 'declined', 'closed')),
  constraint waitlist_entries_source_check check (source in ('intake', 'manual', 'import')),
  constraint waitlist_entries_email_check check (parent_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint waitlist_entries_tenant_id_id_unique unique (tenant_id, id),
  constraint waitlist_entries_unique_intake unique (tenant_id, intake_submission_id)
);

create table public.waitlist_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  waitlist_entry_id uuid not null,
  weekday integer not null,
  starts_after time,
  ends_before time,
  preference_weight integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  constraint waitlist_preferences_entry_fk foreign key (tenant_id, waitlist_entry_id) references public.waitlist_entries (tenant_id, id) on delete cascade,
  constraint waitlist_preferences_weekday_check check (weekday between 1 and 7),
  constraint waitlist_preferences_time_check check (starts_after is null or ends_before is null or starts_after < ends_before),
  constraint waitlist_preferences_weight_check check (preference_weight between 1 and 5)
);

create table public.placement_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  waitlist_entry_id uuid not null,
  recommended_stage_id uuid,
  score numeric(6, 2) not null default 0,
  reasons jsonb not null default '[]'::jsonb,
  status text not null default 'suggested',
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint placement_recommendations_entry_fk foreign key (tenant_id, waitlist_entry_id) references public.waitlist_entries (tenant_id, id) on delete cascade,
  constraint placement_recommendations_stage_fk foreign key (tenant_id, recommended_stage_id) references public.program_stages (tenant_id, id) on delete restrict,
  constraint placement_recommendations_status_check check (status in ('suggested', 'accepted', 'rejected')),
  constraint placement_recommendations_score_check check (score >= 0)
);

create table public.placement_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  waitlist_entry_id uuid not null,
  group_id uuid not null,
  score numeric(6, 2) not null default 0,
  capacity_available numeric(6, 2) not null default 0,
  stage_match boolean not null default false,
  preferred_day_match boolean not null default false,
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint placement_scores_entry_fk foreign key (tenant_id, waitlist_entry_id) references public.waitlist_entries (tenant_id, id) on delete cascade,
  constraint placement_scores_group_fk foreign key (tenant_id, group_id) references public.groups (tenant_id, id) on delete cascade,
  constraint placement_scores_score_check check (score >= 0),
  constraint placement_scores_capacity_available_check check (capacity_available >= 0),
  constraint placement_scores_unique unique (tenant_id, waitlist_entry_id, group_id)
);

create table public.slot_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  waitlist_entry_id uuid not null,
  group_id uuid not null,
  session_id uuid,
  token_hash text not null unique,
  parent_email text not null,
  status text not null default 'draft',
  delivery_status text not null default 'pending',
  delivery_error text,
  offered_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  responded_at timestamptz,
  accepted_participant_id uuid,
  accepted_enrollment_id uuid,
  accepted_group_membership_id uuid,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slot_offers_entry_fk foreign key (tenant_id, waitlist_entry_id) references public.waitlist_entries (tenant_id, id) on delete cascade,
  constraint slot_offers_group_fk foreign key (tenant_id, group_id) references public.groups (tenant_id, id) on delete restrict,
  constraint slot_offers_session_fk foreign key (tenant_id, session_id) references public.sessions (tenant_id, id) on delete restrict,
  constraint slot_offers_participant_fk foreign key (tenant_id, accepted_participant_id) references public.participants (tenant_id, id) on delete restrict,
  constraint slot_offers_enrollment_fk foreign key (tenant_id, accepted_enrollment_id) references public.enrollments (tenant_id, id) on delete restrict,
  constraint slot_offers_group_membership_fk foreign key (tenant_id, accepted_group_membership_id) references public.group_memberships (tenant_id, id) on delete restrict,
  constraint slot_offers_status_check check (status in ('draft', 'sent', 'accepted', 'declined', 'expired', 'revoked')),
  constraint slot_offers_delivery_status_check check (delivery_status in ('pending', 'sent', 'failed', 'skipped')),
  constraint slot_offers_email_check check (parent_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create table public.placement_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  waitlist_entry_id uuid,
  slot_offer_id uuid,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint placement_audit_events_entry_fk foreign key (tenant_id, waitlist_entry_id) references public.waitlist_entries (tenant_id, id) on delete cascade,
  constraint placement_audit_events_offer_fk foreign key (tenant_id, slot_offer_id) references public.slot_offers (tenant_id, id) on delete cascade,
  constraint placement_audit_events_event_type_check check (
    event_type in ('waitlist.created', 'stage.recommended', 'placement.scored', 'slot_offer.created', 'slot_offer.sent', 'slot_offer.accepted', 'slot_offer.declined', 'slot_offer.expired')
  )
);

create index waitlist_entries_tenant_status_idx on public.waitlist_entries (tenant_id, status, priority_date);
create index waitlist_entries_tenant_program_idx on public.waitlist_entries (tenant_id, program_id, recommended_stage_id);
create index waitlist_preferences_entry_idx on public.waitlist_preferences (tenant_id, waitlist_entry_id);
create index placement_recommendations_entry_idx on public.placement_recommendations (tenant_id, waitlist_entry_id, created_at desc);
create index placement_scores_entry_score_idx on public.placement_scores (tenant_id, waitlist_entry_id, score desc);
create index slot_offers_entry_status_idx on public.slot_offers (tenant_id, waitlist_entry_id, status);
create index placement_audit_events_entry_idx on public.placement_audit_events (tenant_id, waitlist_entry_id, created_at desc);

create trigger waitlist_entries_set_updated_at
  before update on public.waitlist_entries
  for each row execute function app_private.set_updated_at();

create trigger placement_recommendations_set_updated_at
  before update on public.placement_recommendations
  for each row execute function app_private.set_updated_at();

create trigger slot_offers_set_updated_at
  before update on public.slot_offers
  for each row execute function app_private.set_updated_at();

grant select, insert, update, delete on public.waitlist_entries to authenticated;
grant select, insert, update, delete on public.waitlist_preferences to authenticated;
grant select, insert, update, delete on public.placement_recommendations to authenticated;
grant select, insert, update, delete on public.placement_scores to authenticated;
grant select, insert, update, delete on public.slot_offers to authenticated;
grant select, insert, update, delete on public.placement_audit_events to authenticated;

grant all on public.waitlist_entries to service_role;
grant all on public.waitlist_preferences to service_role;
grant all on public.placement_recommendations to service_role;
grant all on public.placement_scores to service_role;
grant all on public.slot_offers to service_role;
grant all on public.placement_audit_events to service_role;

alter table public.waitlist_entries enable row level security;
alter table public.waitlist_preferences enable row level security;
alter table public.placement_recommendations enable row level security;
alter table public.placement_scores enable row level security;
alter table public.slot_offers enable row level security;
alter table public.placement_audit_events enable row level security;

create policy "Tenant staff can manage waitlist entries"
  on public.waitlist_entries
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can manage waitlist preferences"
  on public.waitlist_preferences
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can manage placement recommendations"
  on public.placement_recommendations
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can manage placement scores"
  on public.placement_scores
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can manage slot offers"
  on public.slot_offers
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can manage placement audit events"
  on public.placement_audit_events
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
