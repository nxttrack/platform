import { Bell, Repeat2, Search, Waves } from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: number;
  section?: string;
};

type Props = {
  brand: { title: string; subtitle: string };
  nav: NavItem[];
  user: { name: string; role: string };
  children: ReactNode;
  accent?: "parent" | "instructor" | "admin" | "platform";
  tenantSwitcherHref?: string | null;
};

const accentStyles = {
  parent: "from-sky-500 to-blue-700",
  instructor: "from-cyan-500 to-blue-700",
  admin: "from-blue-700 to-indigo-900",
  platform: "from-slate-900 to-blue-800"
};

export function AppShell({ brand, nav, user, children, accent = "parent", tenantSwitcherHref }: Props) {
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  const navGroups = groupNavItems(nav);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-[260px] shrink-0 border-r border-border bg-card/80 backdrop-blur md:block">
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 px-5 py-6">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-glow ${accentStyles[accent]}`}>
              <Waves className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-bold tracking-tight text-foreground">
                NXT<span className="text-primary">TRACK</span>
              </p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{brand.subtitle}</p>
            </div>
          </div>
          <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-3">
            {navGroups.map((group, groupIndex) => (
              <div key={group.section ?? "main"} className="space-y-1">
                {group.section ? <p className="px-3 text-[11px] font-bold uppercase text-muted-foreground">{group.section}</p> : null}
                {group.items.map((item, itemIndex) => {
                  const isFirstItem = groupIndex === 0 && itemIndex === 0;

                  return (
                    <Link
                      key={item.href}
                      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                        isFirstItem ? "bg-gradient-to-r from-primary/10 to-transparent text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                      href={item.href}
                    >
                      {isFirstItem ? <span className="absolute inset-y-1 left-0 w-1 rounded-r-full bg-primary" /> : null}
                      <item.icon className="h-[18px] w-[18px]" />
                      <span className="flex-1">{item.label}</span>
                      {item.badge ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{item.badge}</span> : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="m-3 rounded-2xl border border-border bg-gradient-to-br from-muted to-card p-3">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-semibold text-white ${accentStyles[accent]}`}>{initials}</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.role}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-card/70 px-4 backdrop-blur md:px-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-aqua text-white md:hidden">
            <Waves className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{brand.title}</p>
            <p className="text-sm font-semibold">{brand.subtitle}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden h-9 w-64 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground lg:flex">
              <Search className="h-4 w-4" />
              <span>Zoeken</span>
            </div>
            {tenantSwitcherHref ? (
              <Link className="hidden h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground lg:flex" href={tenantSwitcherHref}>
                <Repeat2 className="h-4 w-4" />
                <span>Tenant wisselen</span>
              </Link>
            ) : null}
            <button className="relative rounded-xl border border-border bg-background p-2 hover:bg-muted" type="button">
              <Bell className="h-4 w-4" />
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">0</span>
            </button>
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-semibold text-white ${accentStyles[accent]}`}>{initials}</div>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function groupNavItems(nav: NavItem[]) {
  return nav.reduce<Array<{ section: string | null; items: NavItem[] }>>((groups, item) => {
    const section = item.section ?? null;
    const current = groups[groups.length - 1];

    if (!current || current.section !== section) {
      groups.push({ section, items: [item] });
      return groups;
    }

    current.items.push(item);
    return groups;
  }, []);
}
