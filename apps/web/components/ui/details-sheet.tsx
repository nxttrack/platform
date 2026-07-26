"use client";

import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

export function DetailsSheet({ children, description, onOpenChange, open, title }: { children: ReactNode; description?: string; onOpenChange: (open: boolean) => void; open: boolean; title: string }) {
  const [width, setWidth] = useState(620);
  const dragStart = useRef<{ pointerX: number; width: number } | null>(null);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem("nxttrack.details.width"));
    if (Number.isFinite(stored)) setWidth(clampWidth(stored));
  }, []);

  function resizeTo(nextWidth: number) {
    const resolved = clampWidth(nextWidth);
    setWidth(resolved);
    window.localStorage.setItem("nxttrack.details.width", String(resolved));
  }

  function startResize(event: PointerEvent<HTMLButtonElement>) {
    dragStart.current = { pointerX: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveResize(event: PointerEvent<HTMLButtonElement>) {
    if (!dragStart.current) return;
    resizeTo(dragStart.current.width + dragStart.current.pointerX - event.clientX);
  }

  function keyboardResize(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    resizeTo(width + (event.key === "ArrowLeft" ? 40 : -40));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!w-screen max-w-none overflow-y-auto p-0 md:!w-[var(--details-width)]" side="right" style={{ "--details-width": `${width}px` } as CSSProperties}>
        <button
          aria-label="Breedte detailpaneel aanpassen"
          className="absolute inset-y-0 left-0 z-20 hidden w-6 -translate-x-1/2 cursor-col-resize items-center justify-center text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex"
          onKeyDown={keyboardResize}
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={() => { dragStart.current = null; }}
          type="button"
        >
          <GripVertical className="size-4 rounded bg-card shadow-sm" />
        </button>
        <header className="sticky top-0 z-10 border-b border-border bg-card/95 px-6 py-5 pr-14 backdrop-blur">
          <SheetTitle className="text-lg font-bold text-foreground">{title}</SheetTitle>
          {description ? <SheetDescription className="mt-1 text-sm text-muted-foreground">{description}</SheetDescription> : null}
        </header>
        <div className="p-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

function clampWidth(value: number) {
  const viewportMaximum = typeof window === "undefined" ? 960 : Math.max(420, window.innerWidth - 280);
  return Math.min(Math.max(value, 420), Math.min(960, viewportMaximum));
}
