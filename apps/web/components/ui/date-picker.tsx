"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function DatePicker({ value, onChange, placeholder = "Kies een datum", ariaLabel }: { value?: Date; onChange: (date: Date | undefined) => void; placeholder?: string; ariaLabel: string }) {
  const [timeZone, setTimeZone] = useState<string>();
  useEffect(() => setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  return <Popover><PopoverTrigger asChild><Button aria-label={ariaLabel} className={cn("w-full justify-start text-left font-medium", !value && "text-muted-foreground")} variant="outline"><CalendarDays className="size-4" />{value ? new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(value) : placeholder}</Button></PopoverTrigger><PopoverContent align="start" className="w-auto p-1"><Calendar mode="single" selected={value} onSelect={onChange} timeZone={timeZone} /></PopoverContent></Popover>;
}
