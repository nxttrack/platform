export const RUNTIME_SCHEMA_CONTRACT_VERSION = 5;
export const MINIMUM_COMPATIBLE_APP_SHA = "352b38cd69958a3d59d31b39aaa798e6de70a77f";
export const MINIMUM_SCHEMA_FINGERPRINT = "686f431e1b015f6f4f597137689f4b2dcb9b0c70a070666b26428bdaaebc293e";
export const REQUIRED_MIGRATION_VERSION = "20260908111450";
const PREVIOUS_SCHEMA_CONTRACT = {
  contractVersion: 4,
  minimumCompatibleAppSha: "4e3784649767be4c197db624b33995b3d1502f65",
  minimumSchemaFingerprint: "185101b4bfc6c68a98557ae7238c6f3164c139ce910f8a6e7af3bf81b20d70ad",
  requiredMigrationVersion: "20260823005756"
} as const;

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
  const current = contract.contract_version === RUNTIME_SCHEMA_CONTRACT_VERSION
    && typeof contract.minimum_compatible_app_sha === "string"
    // Git ancestry is verified by the deploy assertion. Runtime health still
    // rejects missing/malformed floors while remaining forward-compatible with
    // the next commit that pins this bridge's now-known SHA.
    && /^[0-9a-f]{40}$/.test(contract.minimum_compatible_app_sha)
    && contract.minimum_schema_fingerprint === MINIMUM_SCHEMA_FINGERPRINT
    && contract.required_migration_version === REQUIRED_MIGRATION_VERSION;
  const previous = contract.contract_version === PREVIOUS_SCHEMA_CONTRACT.contractVersion
    && contract.minimum_compatible_app_sha === PREVIOUS_SCHEMA_CONTRACT.minimumCompatibleAppSha
    && contract.minimum_schema_fingerprint === PREVIOUS_SCHEMA_CONTRACT.minimumSchemaFingerprint
    && contract.required_migration_version === PREVIOUS_SCHEMA_CONTRACT.requiredMigrationVersion;
  return current || previous;
}
