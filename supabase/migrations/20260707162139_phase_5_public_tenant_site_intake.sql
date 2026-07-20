create table public.intake_forms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid,
  name text not null,
  intro text,
  status text not null default 'active',
  allowed_options text[] not null default array['enrollment', 'trial', 'waitlist', 'information_request'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_forms_program_fk foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete cascade,
  constraint intake_forms_status_check check (status in ('active', 'inactive', 'archived')),
  constraint intake_forms_allowed_options_check check (
    allowed_options <@ array['enrollment', 'trial', 'waitlist', 'information_request']::text[]
  ),
  constraint intake_forms_tenant_id_id_unique unique (tenant_id, id)
);

create table public.intake_questions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  form_id uuid not null,
  field_key text not null,
  label text not null,
  help_text text,
  field_type text not null default 'text',
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  applies_to_options text[] not null default array['enrollment', 'trial', 'waitlist', 'information_request'],
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_questions_form_fk foreign key (tenant_id, form_id) references public.intake_forms (tenant_id, id) on delete cascade,
  constraint intake_questions_field_key_format check (field_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint intake_questions_field_type_check check (field_type in ('text', 'textarea', 'select', 'checkbox', 'date')),
  constraint intake_questions_applies_to_options_check check (
    applies_to_options <@ array['enrollment', 'trial', 'waitlist', 'information_request']::text[]
  ),
  constraint intake_questions_tenant_id_id_unique unique (tenant_id, id),
  constraint intake_questions_tenant_form_key_unique unique (tenant_id, form_id, field_key)
);

create table public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  form_id uuid,
  program_id uuid,
  selected_option text not null,
  parent_name text not null,
  parent_email text not null,
  parent_phone text,
  participant_name text not null,
  participant_birth_date date,
  preferred_days text[] not null default '{}',
  preferred_notes text,
  message text,
  consent_given boolean not null default false,
  source_hostname text,
  status text not null default 'received',
  received_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_submissions_form_fk foreign key (tenant_id, form_id) references public.intake_forms (tenant_id, id) on delete restrict,
  constraint intake_submissions_program_fk foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete restrict,
  constraint intake_submissions_selected_option_check check (selected_option in ('enrollment', 'trial', 'waitlist', 'information_request')),
  constraint intake_submissions_status_check check (status in ('received', 'reviewing', 'converted', 'closed')),
  constraint intake_submissions_email_check check (parent_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint intake_submissions_tenant_id_id_unique unique (tenant_id, id)
);

create table public.intake_answers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  submission_id uuid not null,
  question_id uuid,
  field_key text not null,
  answer_text text,
  answer_json jsonb,
  created_at timestamptz not null default now(),
  constraint intake_answers_submission_fk foreign key (tenant_id, submission_id) references public.intake_submissions (tenant_id, id) on delete cascade,
  constraint intake_answers_question_fk foreign key (tenant_id, question_id) references public.intake_questions (tenant_id, id) on delete restrict,
  constraint intake_answers_field_key_format check (field_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);

create table public.tenant_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  event_type text not null,
  subject_type text not null,
  subject_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint tenant_events_status_check check (status in ('pending', 'processed', 'failed')),
  constraint tenant_events_event_type_check check (event_type in ('intake.received'))
);

create index intake_forms_tenant_program_idx on public.intake_forms (tenant_id, program_id, status);
create index intake_questions_tenant_form_idx on public.intake_questions (tenant_id, form_id, sort_order);
create index intake_submissions_tenant_status_received_idx on public.intake_submissions (tenant_id, status, received_at desc);
create index intake_submissions_tenant_program_idx on public.intake_submissions (tenant_id, program_id, received_at desc);
create index intake_answers_tenant_submission_idx on public.intake_answers (tenant_id, submission_id);
create index tenant_events_tenant_status_idx on public.tenant_events (tenant_id, status, created_at desc);

create trigger intake_forms_set_updated_at
  before update on public.intake_forms
  for each row execute function app_private.set_updated_at();

create trigger intake_questions_set_updated_at
  before update on public.intake_questions
  for each row execute function app_private.set_updated_at();

create trigger intake_submissions_set_updated_at
  before update on public.intake_submissions
  for each row execute function app_private.set_updated_at();

grant select, insert, update, delete on public.intake_forms to authenticated;
grant select, insert, update, delete on public.intake_questions to authenticated;
grant select, insert, update, delete on public.intake_submissions to authenticated;
grant select, insert, update, delete on public.intake_answers to authenticated;
grant select, insert, update, delete on public.tenant_events to authenticated;

grant all on public.intake_forms to service_role;
grant all on public.intake_questions to service_role;
grant all on public.intake_submissions to service_role;
grant all on public.intake_answers to service_role;
grant all on public.tenant_events to service_role;

alter table public.intake_forms enable row level security;
alter table public.intake_questions enable row level security;
alter table public.intake_submissions enable row level security;
alter table public.intake_answers enable row level security;
alter table public.tenant_events enable row level security;

create policy "Tenant staff can manage intake forms"
  on public.intake_forms
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can manage intake questions"
  on public.intake_questions
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can manage intake submissions"
  on public.intake_submissions
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can manage intake answers"
  on public.intake_answers
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can view tenant events"
  on public.tenant_events
  for select
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can manage tenant events"
  on public.tenant_events
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
