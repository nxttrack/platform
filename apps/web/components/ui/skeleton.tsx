import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-xl bg-muted motion-reduce:animate-none", className)} {...props} />;
}

export function PageSkeleton() {
  return <div aria-label="Pagina wordt geladen" className="grid gap-5" role="status"><Skeleton className="h-9 w-64" /><Skeleton className="h-4 w-full max-w-xl" /><div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div><Skeleton className="h-80" /></div>;
}
