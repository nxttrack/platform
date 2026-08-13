import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ParentSectionNav({
  items,
  label
}: {
  items: Array<{ href: string; icon?: ReactNode; label: string; active?: boolean }>;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="min-w-0 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="inline-flex min-w-full gap-1 rounded-2xl border border-border bg-card p-1 shadow-soft md:min-w-0">
        {items.map((item) => (
          <Link
            aria-current={item.active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              item.active ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            href={item.href}
            key={item.href}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
