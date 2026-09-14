"use client";

/** Flush all mounted draft editors before an action removes or changes their context. */
const writers = new Set<{flush:()=>Promise<boolean>;pending:()=>boolean}>();
export function registerDraftWriter(flush: () => Promise<boolean>,pending:()=>boolean=()=>true) {
  const writer={flush,pending};writers.add(writer); return () => { writers.delete(writer); };
}
export function hasPendingDraftWrites() {return [...writers].some(writer=>{try{return writer.pending();}catch{return true;}});}
export async function flushDraftWriters() {
  return (await Promise.all([...writers].map(async (writer) => { try { return !writer.pending() || await writer.flush(); } catch { return false; } }))).every(Boolean);
}
