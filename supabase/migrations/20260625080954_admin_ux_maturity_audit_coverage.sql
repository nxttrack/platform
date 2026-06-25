drop trigger if exists participants_audit_events on public.participants;
create trigger participants_audit_events
  after insert or update or delete on public.participants
  for each row execute function app_private.record_audit_event();

drop trigger if exists instructors_audit_events on public.instructors;
create trigger instructors_audit_events
  after insert or update or delete on public.instructors
  for each row execute function app_private.record_audit_event();

drop trigger if exists groups_audit_events on public.groups;
create trigger groups_audit_events
  after insert or update or delete on public.groups
  for each row execute function app_private.record_audit_event();

drop trigger if exists sessions_audit_events on public.sessions;
create trigger sessions_audit_events
  after insert or update or delete on public.sessions
  for each row execute function app_private.record_audit_event();

drop trigger if exists tenant_account_invitations_audit_events on public.tenant_account_invitations;
create trigger tenant_account_invitations_audit_events
  after insert or update or delete on public.tenant_account_invitations
  for each row execute function app_private.record_audit_event();

drop trigger if exists waitlist_entries_audit_events on public.waitlist_entries;
create trigger waitlist_entries_audit_events
  after insert or update or delete on public.waitlist_entries
  for each row execute function app_private.record_audit_event();

drop trigger if exists placement_suggestions_audit_events on public.placement_suggestions;
create trigger placement_suggestions_audit_events
  after insert or update or delete on public.placement_suggestions
  for each row execute function app_private.record_audit_event();

drop trigger if exists slot_offers_audit_events on public.slot_offers;
create trigger slot_offers_audit_events
  after insert or update or delete on public.slot_offers
  for each row execute function app_private.record_audit_event();
