"use client";

import {
  Award,
  Baby,
  BarChart3,
  Bell,
  Bot,
  Calendar,
  ChevronDown,
  CreditCard,
  FileText,
  GraduationCap,
  Home,
  Inbox,
  ListChecks,
  MapPin,
  Menu,
  MessageSquare,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  TrendingUp,
  User,
  UserPlus,
  Users,
  Upload,
  Waves
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { GlobalCommandPalette, type GlobalSearchItem } from "@/components/shell/global-command-palette";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const shellIcons = {
  award: Award,
  baby: Baby,
  bot: Bot,
  chart: BarChart3,
  calendar: Calendar,
  card: CreditCard,
  file: FileText,
  graduation: GraduationCap,
  home: Home,
  inbox: Inbox,
  location: MapPin,
  message: MessageSquare,
  palette: Palette,
  settings: Settings,
  tasks: ListChecks,
  trending: TrendingUp,
  user: User,
  userPlus: UserPlus,
  users: Users,
  upload: Upload,
  waves: Waves
} as const;

export type ShellIconName = keyof typeof shellIcons;
export type ShellAccent = "parent" | "instructor" | "admin" | "platform";
export type ShellNavItem = {
  href: string;
  label: string;
  icon: ShellIconName;
  badge?: number;
  section?: string;
};

type Props = {
  brand: { title: string; subtitle: string };
  nav: ShellNavItem[];
  user: { name: string; role: string };
  children: ReactNode;
  accent?: ShellAccent;
  searchItems?: GlobalSearchItem[];
};

const accentStyles: Record<ShellAccent, string> = {
  parent: "from-sky-500 to-blue-700",
  instructor: "from-cyan-500 to-blue-700",
  admin: "from-blue-700 to-indigo-900",
  platform: "from-slate-900 to-blue-800"
};

export function AppShellClient({ brand, nav, user, children, accent = "parent", searchItems }: Props) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const activeHref = findActiveHref(pathname, nav);
  const initials = getInitials(user.name);
  const messagesHref = nav.find((item) => item.icon === "message")?.href;

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("nxttrack.sidebar.collapsed") === "true");
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("nxttrack.sidebar.collapsed", String(next));
      return next;
    });
  }

  const sidebar = (
    <Sidebar
      accent={accent}
      activeHref={activeHref}
      brand={brand}
      collapsed={collapsed}
      nav={nav}
      onToggleCollapsed={toggleCollapsed}
      reduceMotion={reduceMotion}
      user={user}
    />
  );

  return (
    <div className={cn("flex min-h-screen", accent === "admin" && "admin-density")}>
      <aside className={cn("relative hidden shrink-0 border-r border-sidebar-border bg-sidebar/90 backdrop-blur transition-[width] duration-200 md:block", collapsed ? "w-[76px]" : "w-[248px]")}>{sidebar}</aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-card/85 px-4 backdrop-blur md:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <button className="grid size-11 place-items-center rounded-lg text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden" type="button" aria-label="Navigatie openen">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent className="p-0" side="left">
              <SheetTitle className="sr-only">Hoofdnavigatie</SheetTitle>
              <Sidebar accent={accent} activeHref={activeHref} brand={brand} mobile nav={nav} reduceMotion={reduceMotion} user={user} />
            </SheetContent>
          </Sheet>

          <div className="min-w-0">
            <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">{brand.title}</p>
            <p className="truncate text-sm font-semibold">{brand.subtitle}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <GlobalCommandPalette items={searchItems} nav={nav} />
            {messagesHref ? (
              <Link className="relative grid size-11 place-items-center rounded-xl border border-border bg-background transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={messagesHref} aria-label="Berichten en meldingen">
                <Bell className="h-4 w-4" />
              </Link>
            ) : null}
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-semibold text-white", accentStyles[accent])} aria-label={user.name} role="img">
              {initials}
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6 2xl:p-8">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({
  brand,
  nav,
  user,
  accent,
  activeHref,
  collapsed = false,
  mobile = false,
  onToggleCollapsed,
  reduceMotion
}: {
  brand: Props["brand"];
  nav: ShellNavItem[];
  user: Props["user"];
  accent: ShellAccent;
  activeHref?: string;
  collapsed?: boolean;
  mobile?: boolean;
  onToggleCollapsed?: () => void;
  reduceMotion: boolean | null;
}) {
  const groups = useMemo(() => groupNavigation(nav), [nav]);
  const [closedSections, setClosedSections] = useState<Set<string>>(new Set());

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex min-h-16 items-center gap-3 border-b border-sidebar-border px-3", collapsed && !mobile ? "justify-center" : "px-4")}>
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-glow", accentStyles[accent])}>
          <Waves className="h-5 w-5" />
        </div>
        <div className={cn("min-w-0 flex-1", collapsed && !mobile && "hidden")}>
          <p className="text-base font-bold tracking-tight text-foreground">
            NXT<span className="text-primary">TRACK</span>
          </p>
          <p className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">{brand.subtitle}</p>
        </div>
        {!mobile && onToggleCollapsed ? (
          <button
            aria-label={collapsed ? "Navigatie uitklappen" : "Navigatie inklappen"}
            className={cn("grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", collapsed && "absolute left-[58px] top-4 translate-x-1/2 border border-border bg-card shadow-soft")}
            onClick={onToggleCollapsed}
            type="button"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        ) : null}
      </div>
      <nav aria-label="Hoofdnavigatie" className={cn("flex-1 overflow-y-auto py-3", collapsed && !mobile ? "px-2" : "px-3")}>
        <TooltipProvider delayDuration={250}>
          {groups.map((group, index) => {
            const isClosed = closedSections.has(group.label);
            const hasActiveItem = group.items.some((item) => activeHref === item.href);
            return (
              <section className={cn(index > 0 && "mt-3 border-t border-sidebar-border pt-3")} key={group.label}>
                {!collapsed || mobile ? (
                  group.label ? (
                    <button
                      aria-expanded={!isClosed}
                      className="mb-1 flex min-h-8 w-full items-center justify-between rounded-lg px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setClosedSections((current) => toggleSetValue(current, group.label))}
                      type="button"
                    >
                      {group.label}
                      <ChevronDown className={cn("size-3.5 transition", isClosed && "-rotate-90", hasActiveItem && "text-primary")} />
                    </button>
                  ) : null
                ) : null}
                {!isClosed || collapsed ? (
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavigationItem active={activeHref === item.href} collapsed={collapsed && !mobile} item={item} key={item.href} mobile={mobile} reduceMotion={reduceMotion} />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </TooltipProvider>
      </nav>
      <div className={cn("m-3 rounded-xl border border-border bg-gradient-to-br from-muted to-card p-2.5", collapsed && !mobile && "mx-2")}>
        <div className={cn("flex items-center gap-3", collapsed && !mobile && "justify-center")}>
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-semibold text-white", accentStyles[accent])}>{getInitials(user.name)}</div>
          <div className={cn("min-w-0", collapsed && !mobile && "hidden")}>
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavigationItem({ item, active, collapsed, mobile, reduceMotion }: { item: ShellNavItem; active: boolean; collapsed: boolean; mobile: boolean; reduceMotion: boolean | null }) {
  const Icon = shellIcons[item.icon];
  const link = (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex min-h-10 items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed && "justify-center px-0",
        active ? "bg-gradient-to-r from-primary/10 to-transparent text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      href={item.href}
    >
      {active ? (
        <motion.span
          className="absolute inset-y-1 left-0 w-1 rounded-r-full bg-primary"
          layoutId={reduceMotion ? undefined : `shell-active-${mobile ? "mobile" : "desktop"}`}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      ) : null}
      <Icon className={cn("size-[17px] shrink-0", active && "text-primary")} />
      <span className={cn("flex-1", collapsed && "sr-only")}>{item.label}</span>
      {item.badge ? <span className={cn("rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary", collapsed && "absolute right-0 top-0 min-w-4 px-1 text-center")}>{item.badge}</span> : null}
    </Link>
  );

  if (mobile) return <SheetClose asChild>{link}</SheetClose>;
  if (!collapsed) return link;
  return <Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{item.label}</TooltipContent></Tooltip>;
}

function findActiveHref(pathname: string, nav: ShellNavItem[]) {
  return nav
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function groupNavigation(nav: ShellNavItem[]) {
  const groups = new Map<string, ShellNavItem[]>();
  for (const item of nav) {
    const section = item.section ?? "";
    groups.set(section, [...(groups.get(section) ?? []), item]);
  }
  return Array.from(groups, ([label, items]) => ({ items, label }));
}

function toggleSetValue(current: Set<string>, value: string) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
