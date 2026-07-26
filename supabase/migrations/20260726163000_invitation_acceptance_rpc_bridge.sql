-- PostgREST exposes public RPCs. Keep the state-changing implementation in the
-- private schema and expose only a service-role bridge for the server action.
create or replace function public.accept_auth_invitation(target_invitation_id uuid)
returns boolean
language sql
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select app_private.accept_auth_invitation(target_invitation_id);
$$;

revoke all on function public.accept_auth_invitation(uuid) from public;
revoke all on function public.accept_auth_invitation(uuid) from anon;
revoke all on function public.accept_auth_invitation(uuid) from authenticated;
grant execute on function public.accept_auth_invitation(uuid) to service_role;

comment on function public.accept_auth_invitation(uuid) is
  'Service-role-only PostgREST bridge to the private, atomic invitation activation function.';
