"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PortalDialog } from "@/components/portal/portal-dialog";
import { MessageComposer, type MessageComposerHandle } from "./message-composer";
import type { MessageComposerContext } from "@/lib/domain/message-composer-contract";

export function NewMessageDialog({ scopeKey, returnPath, participants, initialParticipantId, initialOpen = false, itemId = null, sessionId = null }: {
  scopeKey: string; returnPath: string; participants: Array<{ id: string; label: string }>;
  initialParticipantId: string | null; initialOpen?: boolean; itemId?: string | null; sessionId?: string | null;
}) {
  const [open, setOpen] = useState(initialOpen), [participantId, setParticipantId] = useState(initialParticipantId);
  const [reference, setReference] = useState({ curriculumItemId: itemId, sessionId });
  const [busy, setBusy] = useState(false);
  const composer = useRef<MessageComposerHandle>(null), trigger = useRef<HTMLButtonElement>(null), router = useRouter();
  const context: MessageComposerContext = { actorId: scopeKey.split(":")[0], tenantId: scopeKey.split(":")[1], returnPath, threadId: null, participantId, ...reference };
  async function changeContext(next: string | null) {
    setBusy(true);
    try { if (!composer.current || await composer.current.flush()) { setParticipantId(next); setReference({ curriculumItemId: null, sessionId: null }); } }
    finally { setBusy(false); }
  }
  async function close() {
    setBusy(true);
    try { if (!composer.current || await composer.current.flush()) { setOpen(false); if (initialOpen) router.replace(returnPath, { scroll: false }); } }
    finally { setBusy(false); }
  }
  return <>
    <button ref={trigger} aria-label="Nieuw bericht" title="Nieuw bericht" type="button" className="grid size-11 place-items-center rounded-full border border-border bg-background text-primary shadow-soft focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setOpen(true)}><Plus aria-hidden="true" className="size-5" /></button>
    <PortalDialog open={open} onOpenChange={(next) => { if (next) setOpen(true); else if (!busy) void close(); }} title="Nieuw bericht" description="Kies over wie je schrijft. Controleer je bericht voordat je het verstuurt." returnFocusRef={trigger}>
      <div className="space-y-5">
        <label className="grid gap-2 font-semibold">Over wie gaat je bericht?<select className="min-h-11 rounded-xl border bg-background p-3" aria-label="Kind bij bericht" value={participantId ?? ""} disabled={busy} onChange={(event) => void changeContext(event.target.value || null)}><option value="">Algemene vraag</option>{participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.label}</option>)}</select></label>
        <MessageComposer scopeKey={scopeKey} ref={composer} context={context} onSent={() => setOpen(false)} />
      </div>
    </PortalDialog>
  </>;
}
