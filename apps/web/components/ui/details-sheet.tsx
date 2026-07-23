"use client";

import type { ReactNode } from "react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

export function DetailsSheet({ children, description, onOpenChange, open, title }: { children: ReactNode; description?: string; onOpenChange: (open: boolean) => void; open: boolean; title: string }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(94vw,560px)] overflow-y-auto p-0" side="right">
        <header className="sticky top-0 z-10 border-b border-border bg-card/95 px-6 py-5 pr-14 backdrop-blur">
          <SheetTitle className="text-lg font-bold text-foreground">{title}</SheetTitle>
          {description ? <SheetDescription className="mt-1 text-sm text-muted-foreground">{description}</SheetDescription> : null}
        </header>
        <div className="p-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
