# Private Storage Backup And Restore

Status: implementation and full staging backup/delete/restore/verification rehearsal passed. Production use
requires an independently retained production encryption passphrase and explicit backup/restore authorization.

## Scope And Safety

The route covers the three private Supabase buckets:

- `tenant-documents`;
- `diploma-vault`;
- `participant-media`.

Database backups retain Storage metadata but not object bytes. NXTTRACK therefore exports bytes through the
Storage API, records bucket/path/size/SHA-256 in a versioned manifest and encrypts the complete package before
GitHub retains it. Object paths are mapped to hash-based local filenames, so remote names can never escape the
backup directory.

Restore is fail-closed:

- only the three canonical buckets are accepted;
- local bytes and manifest checksums must pass first;
- `STORAGE_RESTORE_CONFIRMATION=RESTORE_STORAGE_OBJECTS` is mandatory;
- uploads use `upsert=false`, so an existing remote object is never silently overwritten;
- remote bytes are re-downloaded and verified after restore.

## Staging Restore Rehearsal

Dispatch `Staging Storage restore rehearsal` from `main` with:

```txt
confirmation=REHEARSE_STAGING_STORAGE_RESTORE
```

The workflow creates one synthetic object per private bucket under the exact rehearsal prefix: a minimal PDF
for `tenant-documents` and `diploma-vault`, and a one-pixel PNG for `participant-media`. It then:

1. exports all three objects and generates the checksum manifest;
2. verifies all local bytes;
3. encrypts and decrypts the archive with a one-time rehearsal passphrase;
4. deletes only the three controlled source objects;
5. restores them without overwrite;
6. downloads and verifies all three restored byte sets;
7. removes the controlled objects again;
8. retains only the encrypted synthetic archive and non-sensitive summary for 30 days.

The cleanup step is bounded to the exact rehearsal prefix and runs even after a later failure. The workflow
never lists, downloads, changes or deletes objects outside that run-specific prefix.

Historical passing evidence before `participant-media` was introduced:

- [Staging Storage restore rehearsal 30012250717](https://github.com/nxttrack/platform/actions/runs/30012250717)
  on exact SHA `70db98592f5dcda1f85ef121efef4b0ce1638a38`;
- both private bucket probes exported with SHA-256, encrypted, decrypted and locally verified;
- both source probes deleted, restored without overwrite and re-downloaded with matching checksums;
- final cleanup verified zero remaining objects under the exact rehearsal prefix;
- encrypted archive and non-sensitive two-object summary retained as a downloadable 30-day artifact.

## Create A Real Backup

Before first production use:

1. Generate a high-entropy passphrase outside GitHub.
2. Store one recovery copy in the approved organizational password manager.
3. Add the same value as environment secret `STORAGE_BACKUP_PASSPHRASE` in the intended GitHub environment.
4. Restrict access to repository Actions and the password-manager record to recovery operators.

Dispatch `Storage object backup` from `main` with:

```txt
target=staging
confirmation=BACKUP_STAGING_STORAGE
```

or, only for the production environment:

```txt
target=production
confirmation=BACKUP_PRODUCTION_STORAGE
```

The job is read-only against Supabase. It exports all objects in all three buckets, verifies every checksum,
encrypts the archive with GnuPG AES-256 and uploads only the encrypted archive plus a non-sensitive aggregate
summary. GitHub retains the artifact for 30 days. Download and verify the artifact before treating the backup
as a recovery point.

For a verified empty production project before its first migration, dispatch may additionally set
`first_install_empty_project=true`. This records all three required buckets as absent in a versioned, encrypted
manifest. It is production-only, refuses a mixed state where only one bucket exists, and defaults to `false`.
After the first migration creates the buckets, immediately create a normal strict backup with this input left
`false`.

Thirty-day GitHub retention is the initial off-platform route, not an indefinite archive. Before production
volume grows, copy encrypted artifacts into an approved immutable long-retention destination and define the
schedule/RPO in the go/no-go record.

## Decrypt And Inspect A Recovery Point

Use a dedicated protected recovery workstation. Never decrypt private documents in a shared workspace:

```bash
umask 077
gpg --batch --pinentry-mode loopback \
  --passphrase-file /protected/path/storage-backup-passphrase \
  --decrypt storage-backup.tar.gz.gpg |
  tar -xzf - -C /protected/path/recovered-storage
```

Then verify locally from the repository checkout:

```bash
APP_ENV=production \
NEXT_PUBLIC_SUPABASE_URL='https://target-project.supabase.co' \
SUPABASE_SECRET_KEY='target-project-secret' \
STORAGE_BACKUP_DIR='/protected/path/recovered-storage' \
pnpm run storage:verify-local
```

Do not place secrets in shell history in a real recovery; the example names the required inputs only. Supply
them through the approved secret runner.

## Restore

A real restore is destructive operational work even though overwrite is disabled. It requires the incident
commander to name the exact target project and recovery point.

After migrations have recreated the private buckets and policies:

```bash
APP_ENV=production \
NEXT_PUBLIC_SUPABASE_URL='https://target-project.supabase.co' \
SUPABASE_SECRET_KEY='target-project-secret' \
STORAGE_BACKUP_DIR='/protected/path/recovered-storage' \
STORAGE_RESTORE_CONFIRMATION=RESTORE_STORAGE_OBJECTS \
pnpm run storage:restore
```

Then run:

```bash
APP_ENV=production \
NEXT_PUBLIC_SUPABASE_URL='https://target-project.supabase.co' \
SUPABASE_SECRET_KEY='target-project-secret' \
STORAGE_BACKUP_DIR='/protected/path/recovered-storage' \
pnpm run storage:verify-remote
```

Reconcile the manifest with application document/certificate metadata and test signed downloads plus
cross-tenant denial before application writes resume.
