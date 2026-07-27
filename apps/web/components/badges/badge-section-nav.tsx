import Link from "next/link";

import { cn } from "@/lib/utils";

export function BadgeSectionNav({
  active,
  scope
}: {
  active: string;
  scope: "admin" | "platform";
}) {
  const items = scope === "platform"
    ? [
        ["/platform/badges", "Catalogus"],
        ["/platform/badges/collections", "Collecties"],
        ["/platform/badges/themes", "Thema’s"],
        ["/platform/badges/share-templates", "Share editor"],
        ["/platform/badges/analytics", "Analytics"]
      ]
    : [
        ["/admin/badges", "Overzicht"],
        ["/admin/badges/instellingen", "Instellingen"],
        ["/admin/badges/eigen", "Eigen badges"],
        ["/admin/badges/collecties", "Collecties"],
        ["/admin/badges/analytics", "Analytics"]
      ];

  return (
    <nav aria-label="Badgemodule" className="flex gap-2 overflow-x-auto rounded-2xl border border-border bg-card p-2 shadow-soft">
      {items.map(([href, label]) => (
        <Link
          aria-current={active === href ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center rounded-xl px-4 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground",
            active === href && "bg-primary text-primary-foreground shadow-soft hover:bg-primary hover:text-primary-foreground"
          )}
          href={href}
          key={href}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
