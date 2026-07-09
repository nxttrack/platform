# Phase 17 - Communication, Storage And Documents

Status: implemented in code and ready for staging validation.

Phase 17 turns communication and files from metadata-only features into production-shaped runtime flows.

## Delivered

- Transactional mail templates for invitations, password reset codes, slot offers and notifications.
- SendGrid API/SMTP delivery logging in `email_delivery_attempts`.
- Notification delivery status on `tenant_notifications`.
- Admin mail diagnostics and retry for notification mail on `/admin/berichten`.
- Private Supabase Storage buckets:
  - `tenant-documents`
  - `diploma-vault`
- Storage RLS policies aligned with tenant, parent and instructor boundaries.
- Admin document upload on `/admin/documenten`.
- Private document download route: `/api/files/tenant-document/[id]`.
- Certificate/diploma file upload on `/admin/afzwemmen`.
- Private certificate download route: `/api/files/certificate/[id]`.
- Parent document view on `/portaal/documenten`.
- Instructor document view on `/instructor/documenten`.
- Parent diploma vault download links for issued private files.

## Security Model

- Buckets are private.
- Database rows remain the source of truth for file authorization.
- Signed URLs are created server-side only after role checks.
- Parents can download parent-visible documents and issued certificates for linked children.
- Instructors can download instructor documents and certificates for assigned pupils.
- Tenant staff and platform owners/admins can manage tenant-scoped files.
- Invite, reset and slot-offer retries are not blindly reconstructed from logs because those flows can contain temporary credentials or token links.

## Staging Validation

Validate on staging after deployment:

- Upload and download an admin document as tenant admin.
- Confirm parent can see only portal/parent documents.
- Confirm instructor can see only instructor/all-tenant documents.
- Upload a diploma file and confirm parent can download it from the diploma vault.
- Confirm unrelated tenant users cannot download private file routes.
- Send a notification with provider disabled and confirm skipped diagnostics.
- Enable SendGrid API or SMTP and confirm delivery attempts become `sent`.
