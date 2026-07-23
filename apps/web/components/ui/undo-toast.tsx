"use client";

import { toast } from "sonner";

export function showUndoToast({ description, onUndo, title = "Wijziging uitgevoerd" }: { description?: string; onUndo: () => void | Promise<void>; title?: string }) {
  toast(title, {
    description,
    duration: 8_000,
    action: { label: "Ongedaan maken", onClick: () => void onUndo() }
  });
}
