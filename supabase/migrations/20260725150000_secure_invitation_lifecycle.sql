-- Security hardening: invitations are pending capabilities until a one-time
-- code is consumed. No invited role may become active merely because an Auth
-- user exists or signs in.

alter table public.auth_invitations
  add column if not exists code_hash text,
  add column if not exists attempts integer not null default 0,
  add column if not exists consumed_at timestamptz,
  add column if not exists requires_password_setup boolean not null default false;

alter table public.auth_invitations
  add constraint auth_invitations_attempts_check
    check (attempts between 0 and 5);

alter table public.tenant_memberships
  add column if not exists invitation_id uuid references public.auth_invitations (id) on delete set null,
  add column if not exists invitation_expires_at timestamptz;

alter table public.platform_memberships
  drop constraint if exists platform_memberships_status_check;

alter table public.platform_memberships
  add constraint platform_memberships_status_check
    check (status in ('invited', 'active', 'suspended')),
  add column if not exists invitation_id uuid references public.auth_invitations (id) on delete set null,
  add column if not exists invitation_expires_at timestamptz;

create index if not exists tenant_memberships_invitation_idx
  on public.tenant_memberships (invitation_id)
  where invitation_id is not null;

create index if not exists platform_memberships_invitation_idx
  on public.platform_memberships (invitation_id)
  where invitation_id is not null;

-- Existing pending invitations from the former implementation already had an
-- active membership. Move those exact capabilities back to invited, and expire
-- stale invitations, so deploying this migration closes the legacy gap too.
update public.auth_invitations
set status = 'expired'
where status = 'pending'
  and expires_at <= now();

update public.tenant_memberships membership
set
  status = 'invited',
  invitation_id = invitation.id,
  invitation_expires_at = invitation.expires_at
from public.auth_invitations invitation
where invitation.invited_user_id = membership.user_id
  and invitation.tenant_id = membership.tenant_id
  and invitation.role = membership.role
  and invitation.status in ('pending', 'expired');

update public.platform_memberships membership
set
  status = 'invited',
  invitation_id = invitation.id,
  invitation_expires_at = invitation.expires_at
from public.auth_invitations invitation
where invitation.invited_user_id = membership.user_id
  and invitation.tenant_id is null
  and invitation.role = membership.role
  and invitation.status in ('pending', 'expired');

create or replace function app_private.accept_auth_invitation(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invitation public.auth_invitations%rowtype;
begin
  select *
  into invitation
  from public.auth_invitations
  where id = target_invitation_id
  for update;

  if invitation.id is null
    or invitation.status <> 'pending'
    or invitation.expires_at <= now()
    or invitation.attempts >= 5
    or invitation.invited_user_id is null
  then
    if invitation.id is not null and invitation.status = 'pending' then
      update public.auth_invitations
      set status = 'expired'
      where id = invitation.id;
    end if;

    return false;
  end if;

  if invitation.tenant_id is null then
    update public.platform_memberships
    set
      status = 'active',
      invitation_id = null,
      invitation_expires_at = null
    where user_id = invitation.invited_user_id
      and role = invitation.role
      and status = 'invited'
      and invitation_id = invitation.id;
  else
    update public.tenant_memberships
    set
      status = 'active',
      invitation_id = null,
      invitation_expires_at = null
    where tenant_id = invitation.tenant_id
      and user_id = invitation.invited_user_id
      and role = invitation.role
      and status = 'invited'
      and invitation_id = invitation.id;
  end if;

  if not found then
    return false;
  end if;

  update public.auth_invitations
  set
    status = 'accepted',
    accepted_at = now(),
    consumed_at = now(),
    code_hash = null
  where id = invitation.id;

  return true;
end;
$$;

revoke all on function app_private.accept_auth_invitation(uuid) from public, anon, authenticated;
grant execute on function app_private.accept_auth_invitation(uuid) to service_role;
