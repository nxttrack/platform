"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { useRef, useState, type ComponentProps } from "react";
import { flushDraftWriters, hasPendingDraftWrites } from "@/components/portal/draft-navigation";

import { cn } from "@/lib/utils";

export function Tabs({ className, value, defaultValue, onValueChange, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  const [local, setLocal] = useState(defaultValue);
  const attempt = useRef(0);
  function change(next: string) {
    const request = ++attempt.current;
    const apply = () => { if (request === attempt.current) { setLocal(next); onValueChange?.(next); } };
    if (!hasPendingDraftWrites()) apply();
    else void flushDraftWriters().then(saved => { if (saved && !hasPendingDraftWrites()) apply(); });
  }
  return <TabsPrimitive.Root className={cn("w-full", className)} value={value ?? local} onValueChange={change} {...props} />;
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex w-full gap-1 overflow-x-auto rounded-xl border border-border bg-muted/60 p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex h-10 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-soft",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("mt-5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background", className)}
      {...props}
    />
  );
}
