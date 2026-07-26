"use client";

import { useEffect, useRef, useState, type FormHTMLAttributes, type ReactNode } from "react";

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

  useEffect(() => {
    if (formRef.current) initial.current = serializeForm(formRef.current);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = warning;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    const handleDocumentClick = (event: MouseEvent) => {
      if (!dirty || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === "_blank" || target.origin !== window.location.origin) return;
      if (!window.confirm(warning)) event.preventDefault();
    };
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [dirty, warning]);

  return (
    <form
      ref={formRef}
      className={cn("grid gap-4", className)}
      onInput={(event) => setDirty(initial.current !== serializeForm(event.currentTarget))}
      onReset={() => setDirty(false)}
      onSubmit={() => setDirty(false)}
      {...props}
    >
      {children}
      {dirty ? <p aria-live="polite" className="text-xs font-medium text-warning">Niet-opgeslagen wijzigingen</p> : null}
    </form>
  );
}
