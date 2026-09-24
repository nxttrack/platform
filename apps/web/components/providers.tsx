"use client";

import type { ReactNode } from "react";

import { PwaRegister } from "@/components/pwa-register";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DraftHistoryBoundary } from "@/components/portal/draft-history-boundary";

export function Providers({ children }: { children: ReactNode }) {
  return <TooltipProvider delayDuration={350}><DraftHistoryBoundary />{children}<PwaRegister /><Toaster /></TooltipProvider>;
}
