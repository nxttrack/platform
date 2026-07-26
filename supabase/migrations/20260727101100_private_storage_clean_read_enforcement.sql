-- Close the direct Storage bypass for existing private document buckets.
-- Application uploads already use the server-side service client, so browser
-- mutation policies are removed as well: otherwise a clean object's bytes
-- could be overwritten without updating its malware evidence.

drop policy if exists "Tenant document files are scoped to organization roles" on storage.objects;
drop policy if exists "Tenant staff can upload tenant document files" on storage.objects;
drop policy if exists "Tenant staff can update tenant document files" on storage.objects;
drop policy if exists "Tenant staff can delete tenant document files" on storage.objects;

create policy "Clean tenant document files are scoped to organization roles"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'tenant-documents'
    and exists (
      select 1
      from public.tenant_documents document
      where document.tenant_id = app_private.uuid_path_segment(storage.objects.name, 1)
        and document.id = app_private.uuid_path_segment(storage.objects.name, 3)
        and document.storage_bucket = storage.objects.bucket_id
        and document.file_path = storage.objects.name
        and document.storage_status = 'stored'
        and document.malware_scan_status = 'clean'
        and (
          app_private.current_user_can_manage_tenant_domain(document.tenant_id)
          or (
            document.status = 'active'
            and document.audience in ('instructors', 'all_tenant')
            and app_private.current_user_has_tenant_role(document.tenant_id, array['instructor'])
          )
          or (
            document.status = 'active'
            and document.visibility = 'portal'
            and document.audience in ('parents', 'all_tenant')
            and app_private.current_user_has_tenant_role(document.tenant_id, array['parent'])
          )
        )
    )
  );

drop policy if exists "Diploma vault files are scoped to certificate access" on storage.objects;
drop policy if exists "Tenant staff can upload diploma vault files" on storage.objects;
drop policy if exists "Tenant staff can update diploma vault files" on storage.objects;
drop policy if exists "Tenant staff can delete diploma vault files" on storage.objects;

create policy "Clean diploma files are scoped to certificate access"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'diploma-vault'
    and exists (
      select 1
      from public.certificate_records certificate
      where certificate.tenant_id = app_private.uuid_path_segment(storage.objects.name, 1)
        and certificate.id = app_private.uuid_path_segment(storage.objects.name, 3)
        and certificate.storage_bucket = storage.objects.bucket_id
        and certificate.file_path = storage.objects.name
        and certificate.storage_status = 'stored'
        and certificate.malware_scan_status = 'clean'
        and (
          app_private.current_user_can_manage_tenant_domain(certificate.tenant_id)
          or app_private.current_user_can_instruct_participant(certificate.participant_id)
          or (
            certificate.status = 'issued'
            and app_private.current_user_can_view_participant(certificate.participant_id)
          )
        )
    )
  );
