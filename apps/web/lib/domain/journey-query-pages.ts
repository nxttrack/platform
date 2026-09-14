/** Read an explicitly scoped, stably ordered query beyond PostgREST's response cap.
 * A failed later page must fail the view, never silently revive a retracted score.
 */
export async function readJourneyPages<T, E>(query: { range(from: number, to: number): PromiseLike<{ data: T[] | null; error: E | null }> }): Promise<{ data: T[] | null; error: E | null }> {
  const rows: T[] = [], size = 500;
  for (let offset = 0; offset < 100_000; offset += size) {
    const result = await query.range(offset, offset + size - 1);
    if (result.error) return { data: null, error: result.error };
    rows.push(...result.data ?? []);
    if ((result.data?.length ?? 0) < size) return { data: rows, error: null };
  }
  throw new Error("Journey data is too large to read safely in one request");
}
