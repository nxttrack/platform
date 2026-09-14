"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MessageComposerContext } from "@/lib/domain/message-composer-contract";
import { archiveMessageThreadAction } from "@/lib/domain/message-composer-actions";
import { flushDraftWriters } from "@/components/portal/draft-navigation";

export function ThreadPersonalArchive({ context, archived }: { context: MessageComposerContext; archived: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), router = useRouter();
  async function change() {
    setBusy(true); setError(null);
    try {
      if (!await flushDraftWriters()) { setError("Bewaar eerst je gewijzigde concept. Het gesprek is niet verplaatst."); return; }
      const result = await archiveMessageThreadAction(context, !archived);
      if (!result.ok) { setError(result.message); return; }
      const target = new URL(context.returnPath, "https://portal.invalid"); target.searchParams.delete("thread");
      router.replace(`${target.pathname}${target.search}`, { scroll: false }); router.refresh();
    } catch { setError("Het gesprek is niet verplaatst. Probeer opnieuw."); }
    finally { setBusy(false); }
  }
  return <div><button className="min-h-10 rounded-lg border bg-background px-3 text-sm font-semibold" type="button" disabled={busy} onClick={() => void change()}>{busy ? "Verplaatsen…" : archived ? "Herstel naar mijn inbox" : "Archiveer voor mij"}</button>{error ? <p role="alert" className="max-w-xs text-sm text-danger">{error}</p> : null}</div>;
}
