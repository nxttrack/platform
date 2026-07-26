# Production database and Storage restore runbook

Status: prepared. Any real restore is destructive, can cause downtime and requires explicit incident-commander approval for the exact project and recovery point.

The object-level implementation passed its controlled staging rehearsal in
[run 30012250717](https://github.com/nxttrack/platform/actions/runs/30012250717) on
`70db98592f5dcda1f85ef121efef4b0ce1638a38`.

## Recovery contract

- Target RPO: record the accepted value at go/no-go; daily Pro backups can still imply up to roughly one day of database loss.
- Target RTO: record the operational target and owner before launch.
- Supabase Pro daily backups retain seven days. PITR is a separate paid add-on and must be enabled before an incident if second-level recovery is required.
- Supabase database backups cover database schemas and data, including Auth database records, but not the actual objects stored through the Storage API.
- `tenant-documents`, `diploma-vault` and `participant-media` therefore require their own versioned off-platform object copy plus an inventory that can be reconciled with `storage.objects`.

## Before production launch

1. Upgrade production Supabase to Pro.
2. Open Database > Backups and record the earliest/latest available restore point and retention.
3. Decide whether daily backups meet the RPO; enable PITR only if the added cost and lower RPO are approved.
4. Configure and test the encrypted off-platform Storage export defined in
   [Private Storage Backup And Restore](STORAGE_BACKUP_RUNBOOK.md).
5. Perform a restore-to-new-project rehearsal. Verify public/app-private schema, Auth users, RLS, migrations, bucket configuration and actual object downloads.
6. Store Supabase project ownership, recovery authority and emergency contacts in the controlled operations record, not in the repository.

## Incident decision

Before starting a restore, record:

- incident ID, UTC start and incident commander;
- affected production project and current application SHA;
- last known-good transaction/time;
- chosen restore type: same-project daily backup, PITR, or restore to a new project;
- expected data-loss window and downtime;
- independent Storage object recovery point;
- approval by product owner and technical operator.

Stop application writes before choosing a recovery point. Preserve logs and, where possible, take a fresh logical dump for forensic use; never overwrite the only recoverable copy.

## Database restore

1. Put the application into an agreed no-write/maintenance state and stop release activity.
2. Select the closest valid backup strictly before the corrupting event.
3. Prefer restore-to-new-project for a rehearsal or when preserving the damaged source is important. A same-project restore is the higher-impact path.
4. Start the restore from the Supabase dashboard and record its operation/time. The project may be unavailable during the restore.
5. For a new project, reconfigure API keys, Auth settings, redirect URLs, SMTP, Realtime, extensions, network restrictions and GitHub production secrets. Never copy staging credentials.
6. Do not activate application traffic until the verification section passes.

## Storage object restore

1. Recreate/verify the private `tenant-documents`, `diploma-vault` and `participant-media` buckets and their policies through reviewed migrations/configuration.
2. Decrypt and locally verify the selected manifest as defined in
   [Private Storage Backup And Restore](STORAGE_BACKUP_RUNBOOK.md).
3. Restore object bytes through `pnpm run storage:restore`, which uses the Storage API with overwrite disabled;
   never write directly to the `storage` schema.
4. Re-download and checksum every restored object through `pnpm run storage:verify-remote`.
5. Reconcile every restored object with bucket, path, size/checksum, tenant ownership and database metadata.
6. Test signed/private download authorization for a tenant admin, instructor and parent; verify cross-tenant denial.

## Verification and return to service

- Read-only production inventory completes and expected migration versions are present.
- All public tables have expected RLS/FORCE RLS status.
- Auth user counts and a controlled owner login match the recovery record.
- Storage bucket/object counts and sampled checksums match the object inventory.
- `/api/health`, apex/admin/tenant routing and exact application SHA pass.
- A controlled transactional email succeeds.
- Incident commander records the accepted data-loss boundary before writes resume.

After service is restored, rotate any credentials exposed during recovery, re-enable monitoring, preserve the incident timeline and schedule a corrective restore rehearsal.
