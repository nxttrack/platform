export const RUNTIME_SCHEMA_CONTRACT_VERSION = 1;
export const MINIMUM_COMPATIBLE_APP_SHA = "4e3784649767be4c197db624b33995b3d1502f65";
export const MINIMUM_SCHEMA_FINGERPRINT = "c21d353eed62463814087c3edc7bdf63a11522141131052641b8d9972ef02ab7";
export const REQUIRED_MIGRATION_VERSION = "20260823000225";

export type RuntimeSchemaCompatibility = {
  contract_version: number;
  minimum_compatible_app_sha: string;
  minimum_schema_fingerprint: string;
  required_migration_version: string;
};

export function isRuntimeSchemaCompatible(value: unknown): value is RuntimeSchemaCompatibility {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return false;
  const contract = row as Partial<RuntimeSchemaCompatibility>;
  return contract.contract_version === RUNTIME_SCHEMA_CONTRACT_VERSION
    && contract.minimum_compatible_app_sha === MINIMUM_COMPATIBLE_APP_SHA
    && contract.minimum_schema_fingerprint === MINIMUM_SCHEMA_FINGERPRINT
    && contract.required_migration_version === REQUIRED_MIGRATION_VERSION;
}
