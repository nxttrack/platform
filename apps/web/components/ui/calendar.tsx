"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";

import { cn } from "@/lib/utils";

export function Calendar({ className, showOutsideDays = true, ...props }: DayPickerProps) {
  return (
    <DayPicker
      className={cn("p-2 text-sm [--rdp-accent-color:var(--color-primary)] [--rdp-accent-background-color:var(--color-accent)]", className)}
      components={{ Chevron: ({ orientation, ...iconProps }) => orientation === "left" ? <ChevronLeft className="size-4" {...iconProps} /> : <ChevronRight className="size-4" {...iconProps} /> }}
      showOutsideDays={showOutsideDays}
      {...props}
    />
  );
}
