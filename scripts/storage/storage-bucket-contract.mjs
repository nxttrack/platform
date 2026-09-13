export const storageBucketContractVersion = 1;

export const requiredStorageBuckets = Object.freeze([
  Object.freeze({ name: "tenant-documents", rehearsalContentType: "application/pdf", rehearsalExtension: "pdf" }),
  Object.freeze({ name: "diploma-vault", rehearsalContentType: "application/pdf", rehearsalExtension: "pdf" }),
  Object.freeze({ name: "participant-media", rehearsalContentType: "image/png", rehearsalExtension: "png" }),
  Object.freeze({ name: "badge-studio-assets", rehearsalContentType: "image/png", rehearsalExtension: "png" }),
  Object.freeze({ name: "tenant-media-assets", rehearsalContentType: "image/png", rehearsalExtension: "png" })
]);

export const requiredStorageBucketNames = Object.freeze(requiredStorageBuckets.map((bucket) => bucket.name));

export function storageBucketDefinition(name) {
  return requiredStorageBuckets.find((bucket) => bucket.name === name) ?? null;
}
