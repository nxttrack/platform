"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useState, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

import styles from "./portal-dialog.module.css";

/** Shared portal chrome. Nested discard confirmation leaves the underlying form mounted. */
export function PortalDialog({ open, onOpenChange, title, description, children, footer, dirty = false, returnFocusRef }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string;
  children: ReactNode; footer?: ReactNode; dirty?: boolean; returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  function requestOpen(next: boolean) {
    if (!next && dirty) { setConfirmDiscard(true); return; }
    onOpenChange(next);
  }
  return <>
    <Dialog.Root open={open} onOpenChange={requestOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} onCloseAutoFocus={(event) => {
          if (returnFocusRef?.current?.isConnected) { event.preventDefault(); returnFocusRef.current.focus({ preventScroll: true }); }
        }}>
          <header className={styles.header}><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div><Dialog.Close className={styles.close} aria-label="Venster sluiten"><X aria-hidden="true" /></Dialog.Close></header>
          <div className={styles.body}>{children}</div>
          {footer ? <footer className={styles.footer}>{footer}</footer> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <AlertDialog.Root open={open && confirmDiscard} onOpenChange={setConfirmDiscard}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.confirmOverlay} />
        <AlertDialog.Content className={`${styles.dialog} ${styles.confirm}`}>
          <header className={styles.header}><div><AlertDialog.Title>Wijzigingen bewaren?</AlertDialog.Title><AlertDialog.Description>Je hebt wijzigingen die nog niet zijn opgeslagen. Ga terug om verder te werken, of sluit zonder deze wijzigingen.</AlertDialog.Description></div></header>
          <footer className={styles.footer}><AlertDialog.Cancel>Verder bewerken</AlertDialog.Cancel><AlertDialog.Action onClick={() => { setConfirmDiscard(false); onOpenChange(false); }}>Wijzigingen verwerpen</AlertDialog.Action></footer>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  </>;
}
