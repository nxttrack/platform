"use client";

import { CheckCircle2, Info, LoaderCircle, TriangleAlert, XCircle } from "lucide-react";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return <Sonner closeButton icons={{ success: <CheckCircle2 className="size-4" />, info: <Info className="size-4" />, warning: <TriangleAlert className="size-4" />, error: <XCircle className="size-4" />, loading: <LoaderCircle className="size-4 animate-spin" /> }} position="bottom-right" richColors toastOptions={{ classNames: { toast: "rounded-2xl border-border bg-card text-foreground shadow-card", title: "font-semibold", description: "text-muted-foreground", actionButton: "bg-primary text-primary-foreground", cancelButton: "bg-muted text-foreground" } }} />;
}
