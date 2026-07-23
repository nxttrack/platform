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
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
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
