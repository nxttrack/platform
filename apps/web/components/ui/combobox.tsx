"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label: string; description?: string };

export function Combobox({ options, value, onValueChange, placeholder = "Selecteer…", searchPlaceholder = "Zoeken…", emptyLabel = "Geen resultaten.", ariaLabel }: { options: ComboboxOption[]; value?: string; onValueChange: (value: string) => void; placeholder?: string; searchPlaceholder?: string; emptyLabel?: string; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button aria-expanded={open} aria-label={ariaLabel} className="w-full justify-between font-medium" role="combobox" variant="outline">
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span><ChevronsUpDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command><CommandInput placeholder={searchPlaceholder} /><CommandList><CommandEmpty>{emptyLabel}</CommandEmpty><CommandGroup>{options.map((option) => <CommandItem key={option.value} value={`${option.label} ${option.description ?? ""}`} onSelect={() => { onValueChange(option.value); setOpen(false); }}><Check className={cn("size-4", value === option.value ? "opacity-100" : "opacity-0")} /><span><span className="block font-medium">{option.label}</span>{option.description ? <span className="block text-xs text-muted-foreground">{option.description}</span> : null}</span></CommandItem>)}</CommandGroup></CommandList></Command>
      </PopoverContent>
    </Popover>
  );
}
