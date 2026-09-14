import assert from "node:assert/strict";
import { test } from "node:test";
import { readJourneyIdBatches,readJourneyPages } from "../../apps/web/lib/domain/journey-query-pages";

test("complete Journey history crosses the PostgREST response cap, including a correction at the old page boundary", async () => {
  const data = Array.from({ length: 1_213 }, (_, index) => ({ id: `observation-${index}`, corrects: index === 1_010 ? "observation-1210" : null }));
  const result = await readJourneyPages({ range: async (from, to) => ({ data: data.slice(from, to + 1), error: null }) });
  assert.equal(result.data?.length, 1_213);
  assert.ok(result.data?.some((row) => row.corrects === "observation-1210"));
  assert.ok(result.data?.some((row) => row.id === "observation-1210"));
  assert.deepEqual(result.data, data);
});

test('related badge releases remain complete beyond a long URL and a later batch failure rejects partial earned state',async()=>{
  const ids=Array.from({length:1213},(_,index)=>`release-${index}`),batches:string[][]=[];
  const result=await readJourneyIdBatches([...ids,...ids.slice(0,20)],batch=>{
    batches.push(batch);return {range:async(from,to)=>({data:batch.slice(from,to+1).map(id=>({id})),error:null})};
  });
  assert.deepEqual(result.data?.map(row=>row.id),ids);assert.ok(batches.every(batch=>batch.length<=100));
  const failure={message:'Later release metadata failed'};
  const rejected=await readJourneyIdBatches(ids,batch=>({range:async()=>batch.includes('release-1200')?{data:null,error:failure}:{data:batch.map(id=>({id})),error:null}}));
  assert.equal(rejected.data,null);assert.equal(rejected.error,failure);
});

test("a failed later Journey page returns no partial history or resurrected score", async () => {
  const error = { message: "Read failed" };
  const result = await readJourneyPages({ range: async (from) => from ? { data: null, error } : { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null } });
  assert.equal(result.data, null); assert.equal(result.error, error);
});
