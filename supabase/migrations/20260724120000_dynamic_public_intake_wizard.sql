-- Dynamic public intake wizard: structured guardians, experience and explainable slot choices.

alter table public.intake_submissions
  add column secondary_parent_name text,
  add column secondary_parent_email text,
  add column secondary_parent_phone text,
  add column swimming_experience text,
  add column preferred_dayparts jsonb not null default '{}'::jsonb,
  add column recommendation_snapshot jsonb not null default '[]'::jsonb,
  add column selected_group_id uuid,
  add column selected_wait_band text,
  add column recommendation_version text,
  add constraint intake_submissions_secondary_email_check
    check (secondary_parent_email is null or secondary_parent_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add constraint intake_submissions_swimming_experience_check
    check (
      swimming_experience is null
      or swimming_experience in ('none', 'water_familiar', 'lessons_no_diploma', 'diploma_a', 'diploma_b', 'diploma_c')
    ),
  add constraint intake_submissions_preferred_dayparts_object_check
    check (jsonb_typeof(preferred_dayparts) = 'object'),
  add constraint intake_submissions_recommendation_snapshot_array_check
    check (jsonb_typeof(recommendation_snapshot) = 'array'),
  add constraint intake_submissions_selected_group_fk
    foreign key (tenant_id, selected_group_id) references public.groups (tenant_id, id) on delete restrict,
  add constraint intake_submissions_selected_wait_band_check
    check (selected_wait_band is null or selected_wait_band in ('short', 'medium', 'long'));

create index intake_submissions_tenant_selected_group_idx
  on public.intake_submissions (tenant_id, selected_group_id)
  where selected_group_id is not null;
