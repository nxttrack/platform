import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { BADGE_STUDIO_ASSETS_BUCKET, DIPLOMA_VAULT_BUCKET, PARTICIPANT_MEDIA_BUCKET, TENANT_DOCUMENTS_BUCKET } from "./private-files";

export const tenantPrivateBuckets = [TENANT_DOCUMENTS_BUCKET, DIPLOMA_VAULT_BUCKET, PARTICIPANT_MEDIA_BUCKET, BADGE_STUDIO_ASSETS_BUCKET] as const;

export async function listTenantStorageObjects(tenantId: string) {
  const inventory: Record<string, string[]> = {};

  for (const bucket of tenantPrivateBuckets) {
    inventory[bucket] = await listFilesRecursively(bucket, tenantId);
  }

  return inventory;
}

export async function eraseTenantStorageObjects(tenantId: string) {
  const admin = createAdminClient();
  const before = await listTenantStorageObjects(tenantId);

  for (const bucket of tenantPrivateBuckets) {
    const paths = before[bucket] ?? [];

    for (let offset = 0; offset < paths.length; offset += 1_000) {
      const batch = paths.slice(offset, offset + 1_000);
      const { error } = await admin.storage.from(bucket).remove(batch);

      if (error) {
        throw new Error(`Storage cleanup failed for ${bucket}: ${error.message}`);
      }
    }
  }

  const after = await listTenantStorageObjects(tenantId);
  const remaining = Object.values(after).flat();

  if (remaining.length > 0) {
    throw new Error(`Storage cleanup verification found ${remaining.length} remaining object(s).`);
  }

  return {
    buckets: tenantPrivateBuckets,
    deletedObjects: Object.values(before).flat().length,
    verifiedRemainingObjects: 0
  };
}

async function listFilesRecursively(bucket: string, prefix: string): Promise<string[]> {
  const admin = createAdminClient();
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: 1_000,
      offset,
      sortBy: { column: "name", order: "asc" }
    });

    if (error) {
      throw new Error(`Storage inventory failed for ${bucket}/${prefix}: ${error.message}`);
    }

    const entries = data ?? [];

    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;

      if (entry.id) {
        paths.push(path);
      } else {
        paths.push(...(await listFilesRecursively(bucket, path)));
      }
    }

    if (entries.length < 1_000) {
      break;
    }

    offset += entries.length;
  }

  return paths;
}
