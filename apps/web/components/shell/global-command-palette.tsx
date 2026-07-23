"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, CornerDownLeft, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import type { ShellNavItem } from "@/components/shell/app-shell-client";

export type GlobalSearchItem = { href: string; label: string; description?: string; group?: string; keywords?: string[] };

export function GlobalCommandPalette({ nav, items = [] }: { nav: ShellNavItem[]; items?: GlobalSearchItem[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return <><button aria-label="Globaal zoeken" className="flex h-10 min-w-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground transition hover:border-primary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-72" onClick={() => setOpen(true)} type="button"><Search className="size-4 shrink-0" /><span className="hidden truncate lg:inline">Zoek pagina, leerling of actie…</span><kbd className="ml-auto hidden rounded-md border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-semibold lg:inline">⌘K</kbd></button><DialogPrimitive.Root open={open} onOpenChange={setOpen}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" /><DialogPrimitive.Content aria-describedby="global-search-description" className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-3xl border border-border bg-popover shadow-card outline-none data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95"><DialogPrimitive.Title className="sr-only">Globaal zoeken</DialogPrimitive.Title><DialogPrimitive.Description className="sr-only" id="global-search-description">Zoek door navigatie, leerlingen en snelle acties.</DialogPrimitive.Description><DialogPrimitive.Close aria-label="Zoeken sluiten" className="absolute right-3 top-3 z-10 rounded-lg p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></DialogPrimitive.Close><Command><CommandInput autoFocus placeholder="Typ om te zoeken…" /><CommandList><CommandEmpty>Geen resultaat. Probeer een naam, route of actie.</CommandEmpty><CommandGroup heading="Navigatie">{nav.map((item) => <CommandItem key={item.href} onSelect={() => navigate(item.href)} value={`${item.label} ${item.href}`}><Search className="size-4 text-primary" /><span>{item.label}</span><CommandShortcut><CornerDownLeft className="size-3" /></CommandShortcut></CommandItem>)}</CommandGroup>{items.length ? <CommandGroup heading="Snel vinden">{items.map((item) => <CommandItem key={`${item.href}-${item.label}`} onSelect={() => navigate(item.href)} value={`${item.label} ${item.description ?? ""} ${(item.keywords ?? []).join(" ")}`}><ArrowRight className="size-4 text-primary" /><span className="min-w-0"><span className="block truncate font-medium">{item.label}</span>{item.description ? <span className="block truncate text-xs text-muted-foreground">{item.description}</span> : null}</span><span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">{item.group}</span></CommandItem>)}</CommandGroup> : null}</CommandList></Command></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root></>;
}
