"use client";

import { useEffect, useRef, useState, type FormHTMLAttributes, type ReactNode } from "react";

import { registerDraftWriter } from "@/components/portal/draft-navigation";

import { cn } from "@/lib/utils";

function serializeForm(form: HTMLFormElement) {
  const params = new URLSearchParams();
  for (const [key, value] of new FormData(form).entries()) {
    params.append(key, typeof value === "string" ? value : value.name);
  }
  return params.toString();
}

export function DirtyForm({ children, className, warning = "Je hebt niet-opgeslagen wijzigingen. Weet je zeker dat je deze pagina wilt verlaten?", ...props }: FormHTMLAttributes<HTMLFormElement> & { children: ReactNode; warning?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const initial = useRef("");
  const [dirty, setDirty] = useState(false);
  const pending = useRef(false), warningRef = useRef(warning);
  warningRef.current = warning;
  function markDirty(value: boolean) { pending.current = value; setDirty(value); }
  function confirmLeave() {
    if (!pending.current) return true;
    if (!window.confirm(warningRef.current)) return false;
    markDirty(false); return true;
  }
  useEffect(() => registerDraftWriter(async () => confirmLeave(), () => pending.current), []);

  useEffect(() => {
    if (formRef.current) initial.current = serializeForm(formRef.current);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!pending.current) return;
      event.preventDefault();
      event.returnValue = warning;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    const handleDocumentClick = (event: MouseEvent) => {
      if (!pending.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === "_blank" || target.origin !== window.location.origin) return;
      if (target.pathname === location.pathname && target.search === location.search) return;
      if (!confirmLeave()) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [dirty, warning]);

  return (
    <form
      {...props}
      ref={formRef}
      className={cn("grid gap-4", className)}
      onInput={(event) => { props.onInput?.(event); markDirty(initial.current !== serializeForm(event.currentTarget)); }}
      onReset={(event) => { props.onReset?.(event); if (!event.defaultPrevented) markDirty(false); }}
    >
      {children}
      {dirty ? <p aria-live="polite" className="text-xs font-medium text-warning">Niet-opgeslagen wijzigingen</p> : null}
    </form>
  );
}
