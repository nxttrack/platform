create table public.ui_undo_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  operation_type text not null,
  payload jsonb not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ui_undo_operations_type_check check (operation_type in ('bulk_status'))
);

create index ui_undo_operations_active_idx
  on public.ui_undo_operations (tenant_id, user_id, expires_at desc)
  where consumed_at is null;

grant select on public.ui_undo_operations to authenticated;
grant all on public.ui_undo_operations to service_role;
alter table public.ui_undo_operations enable row level security;
alter table public.ui_undo_operations force row level security;

create policy "Authenticated users cannot read UI undo payloads"
  on public.ui_undo_operations
  for select
  to authenticated
  using (false);

comment on table public.ui_undo_operations is
  'Short-lived, server-only rollback payloads for explicitly reversible UI operations.';
