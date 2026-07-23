"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Progress({ className, value = 0, ...props }: ComponentProps<typeof ProgressPrimitive.Root>) {
  const normalized = Math.max(0, Math.min(100, value ?? 0));
  return (
    <ProgressPrimitive.Root className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)} value={normalized} {...props}>
      <ProgressPrimitive.Indicator className="h-full w-full rounded-full bg-gradient-to-r from-aqua to-primary transition-transform duration-500 motion-reduce:transition-none" style={{ transform: `translateX(-${100 - normalized}%)` }} />
    </ProgressPrimitive.Root>
  );
}
