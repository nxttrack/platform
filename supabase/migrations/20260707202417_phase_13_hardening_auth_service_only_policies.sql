create policy "Authenticated users cannot view auth invitations"
  on public.auth_invitations
  for select
  to authenticated
  using (false);

create policy "Authenticated users cannot view password reset challenges"
  on public.password_reset_challenges
  for select
  to authenticated
  using (false);
