export const RUNTIME_SCHEMA_CONTRACT_VERSION = 5;
export const MINIMUM_COMPATIBLE_APP_SHA = "352b38cd69958a3d59d31b39aaa798e6de70a77f";
export const MINIMUM_SCHEMA_FINGERPRINT = "686f431e1b015f6f4f597137689f4b2dcb9b0c70a070666b26428bdaaebc293e";
export const REQUIRED_MIGRATION_VERSION = "20260908111450";

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
