"use client";

/** Flush all mounted composers before an action removes or changes their context. */
const writers = new Set<() => Promise<boolean>>();
export function registerMessageComposer(flush: () => Promise<boolean>) {
  writers.add(flush); return () => { writers.delete(flush); };
}
export async function flushMessageComposers() {
  return (await Promise.all([...writers].map(async (flush) => { try { return await flush(); } catch { return false; } }))).every(Boolean);
}
