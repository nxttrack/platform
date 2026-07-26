"use client";

import { Plus } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function AdminActionDrawer({
  children,
  description,
  icon,
  title,
  triggerLabel,
  triggerVariant = "default",
  width = "default"
}: {
  children: ReactNode;
  description?: string;
  icon?: ReactNode;
  title: string;
  triggerLabel: string;
  triggerVariant?: "default" | "outline";
  width?: "default" | "wide";
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant={triggerVariant}>
          {icon ?? <Plus className="size-4" aria-hidden="true" />}
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent
        className={cn(
          "w-screen max-w-none overflow-y-auto p-0 sm:w-[min(94vw,560px)]",
          "!w-screen sm:!w-[min(94vw,560px)]",
          width === "wide" && "sm:!w-[min(94vw,720px)]"
        )}
        side="right"
      >
        <header className="sticky top-0 z-10 border-b border-border bg-card/95 px-5 py-4 pr-14 backdrop-blur sm:px-6">
          <SheetTitle className="text-base font-bold text-foreground">{title}</SheetTitle>
          {description ? <SheetDescription className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</SheetDescription> : null}
        </header>
        <div className="p-5 sm:p-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
