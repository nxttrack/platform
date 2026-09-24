/** JSON object order is not content. PostgreSQL jsonb may reorder every map on save. */
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered((value as Record<string, unknown>)[key])]));
  return value;
}

export function matchesThemeDocument(json: string, document: unknown): boolean {
  try { return JSON.stringify(ordered(JSON.parse(json))) === JSON.stringify(ordered(document)); }
  catch { return false; }
}
