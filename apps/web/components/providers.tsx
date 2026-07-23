"use client";

import type { ReactNode } from "react";

import { PwaRegister } from "@/components/pwa-register";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  return <TooltipProvider delayDuration={350}>{children}<PwaRegister /><Toaster /></TooltipProvider>;
}
