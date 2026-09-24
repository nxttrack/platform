-- Keep badge collection surprise filtering out of mutually recursive RLS policies.
-- The collection policy needs to inspect collection items for an earned surprise
-- badge, while the item policy needs to inspect its parent collection.  Security
-- definer helpers perform those cross-table checks without re-entering the
-- authenticated-table policies.

create or replace function app_private.current_user_can_view_badge_collection(target_collection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.badge_collections collection
    where collection.id = target_collection_id
      and (
        app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
        or (collection.tenant_id is not null and app_private.current_user_can_manage_tenant_domain(collection.tenant_id))
        or (collection.tenant_id is not null and app_private.current_user_has_tenant_role(collection.tenant_id, array['instructor']))
        or (
          not collection.is_surprise
          and (
            collection.tenant_id is null
            or app_private.current_user_has_tenant_role(collection.tenant_id, array['parent', 'athlete'])
          )
        )
        or exists (
          select 1
          from public.badge_collection_items collection_item
          join public.participant_badge_awards award
            on (
              award.catalog_definition_id = collection_item.catalog_definition_id
              or award.custom_badge_id = collection_item.custom_badge_id
            )
          where collection_item.collection_id = collection.id
            and award.status = 'awarded'
            and award.visibility = 'parent_visible'
            and app_private.current_user_can_view_participant(award.participant_id)
        )
      )
  );
$$;

create or replace function app_private.current_user_can_view_badge_collection_item(
  target_collection_id uuid,
  target_catalog_definition_id uuid,
  target_custom_badge_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.badge_collections collection
    where collection.id = target_collection_id
      and (
        app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
        or (collection.tenant_id is not null and app_private.current_user_can_manage_tenant_domain(collection.tenant_id))
        or (collection.tenant_id is not null and app_private.current_user_has_tenant_role(collection.tenant_id, array['instructor']))
        or not collection.is_surprise
        or exists (
          select 1
          from public.participant_badge_awards award
          where (
              award.catalog_definition_id = target_catalog_definition_id
              or award.custom_badge_id = target_custom_badge_id
            )
            and award.status = 'awarded'
            and award.visibility = 'parent_visible'
            and app_private.current_user_can_view_participant(award.participant_id)
        )
      )
  );
$$;

revoke all on function app_private.current_user_can_view_badge_collection(uuid) from public;
revoke all on function app_private.current_user_can_view_badge_collection_item(uuid, uuid, uuid) from public;
grant execute on function app_private.current_user_can_view_badge_collection(uuid) to authenticated;
grant execute on function app_private.current_user_can_view_badge_collection(uuid) to service_role;
grant execute on function app_private.current_user_can_view_badge_collection_item(uuid, uuid, uuid) to authenticated;
grant execute on function app_private.current_user_can_view_badge_collection_item(uuid, uuid, uuid) to service_role;

drop policy if exists badge_collections_surprise_safe_read
  on public.badge_collections;
create policy badge_collections_surprise_safe_read
  on public.badge_collections for select to authenticated
  using (app_private.current_user_can_view_badge_collection(id));

drop policy if exists badge_collection_items_surprise_safe_read
  on public.badge_collection_items;
create policy badge_collection_items_surprise_safe_read
  on public.badge_collection_items for select to authenticated
  using (
    app_private.current_user_can_view_badge_collection_item(
      collection_id,
      catalog_definition_id,
      custom_badge_id
    )
  );
