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

/** Keep related-ID queries below URL limits without silently dropping older releases. */
export async function readJourneyIdBatches<T,E>(ids:readonly string[],query:(batch:string[])=>{range(from:number,to:number):PromiseLike<{data:T[]|null;error:E|null}>}):Promise<{data:T[]|null;error:E|null}> {
  const unique=[...new Set(ids)],rows:T[]=[];
  if(unique.length>100_000) throw new Error('Journey relation set is too large to read safely');
  for(let offset=0;offset<unique.length;offset+=100) {
    const result=await readJourneyPages(query(unique.slice(offset,offset+100)));
    if(result.error) return {data:null,error:result.error};
    rows.push(...result.data??[]);
    if(rows.length>100_000) throw new Error('Journey relation history is too large to read safely');
  }
  return {data:rows,error:null};
}
