import type { ComponentProps, HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Field({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="group" className={cn("grid gap-2", className)} {...props} />;
}

export function FieldLabel({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-semibold text-foreground", className)} {...props} />;
}

export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-xs leading-5 text-muted-foreground", className)} {...props} />;
}

export function FieldError({ children, className, ...props }: ComponentProps<"p"> & { children?: ReactNode }) {
  if (!children) return null;

  return <p role="alert" className={cn("text-xs font-medium text-danger", className)} {...props}>{children}</p>;
}

export function FieldGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid gap-4", className)} {...props} />;
}
