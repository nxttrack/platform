"use client";

/** Flush all mounted draft editors before an action removes or changes their context. */
const writers = new Set<() => Promise<boolean>>();
export function registerDraftWriter(flush: () => Promise<boolean>) {
  writers.add(flush); return () => { writers.delete(flush); };
}
export async function flushDraftWriters() {
  return (await Promise.all([...writers].map(async (flush) => { try { return await flush(); } catch { return false; } }))).every(Boolean);
}
