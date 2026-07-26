"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

export function RouteFeedback({ error, success }: { error?: string | null; success?: string | null }) {
  const announced = useRef<string | null>(null);
  const message = error || success;

  useEffect(() => {
    if (!message || announced.current === message) return;
    announced.current = message;
    if (error) toast.error(error);
    else toast.success(success);
  }, [error, message, success]);

  if (!message) return null;
  return <p aria-live={error ? "assertive" : "polite"} className={`rounded-xl border px-3 py-2 text-sm font-medium ${error ? "border-danger/20 bg-danger/10 text-danger" : "border-success/20 bg-success/10 text-success"}`} role={error ? "alert" : "status"}>{message}</p>;
}
