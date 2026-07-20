"use client";

import {
  Award,
  Baby,
  BarChart3,
  Bell,
  Calendar,
  CreditCard,
  FileText,
  GraduationCap,
  Home,
  Inbox,
  ListChecks,
  MapPin,
  Menu,
  MessageSquare,
  Search,
  Settings,
  TrendingUp,
  User,
  UserPlus,
  Users,
  Waves
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const shellIcons = {
  award: Award,
  baby: Baby,
  chart: BarChart3,
  calendar: Calendar,
  card: CreditCard,
  file: FileText,
  graduation: GraduationCap,
  home: Home,
  inbox: Inbox,
  location: MapPin,
  message: MessageSquare,
  settings: Settings,
  tasks: ListChecks,
  trending: TrendingUp,
  user: User,
  userPlus: UserPlus,
  users: Users,
  waves: Waves
} as const;

export type ShellIconName = keyof typeof shellIcons;
export type ShellAccent = "parent" | "instructor" | "admin" | "platform";
export type ShellNavItem = {
  href: string;
  label: string;
  icon: ShellIconName;
  badge?: number;
};

type Props = {
  brand: { title: string; subtitle: string };
  nav: ShellNavItem[];
  user: { name: string; role: string };
  children: ReactNode;
  accent?: ShellAccent;
};

const accentStyles: Record<ShellAccent, string> = {
  parent: "from-sky-500 to-blue-700",
  instructor: "from-cyan-500 to-blue-700",
  admin: "from-blue-700 to-indigo-900",
  platform: "from-slate-900 to-blue-800"
};

export function AppShellClient({ brand, nav, user, children, accent = "parent" }: Props) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const activeHref = findActiveHref(pathname, nav);
  const initials = getInitials(user.name);
  const messagesHref = nav.find((item) => item.icon === "message")?.href;
  const sidebar = <Sidebar brand={brand} nav={nav} user={user} accent={accent} activeHref={activeHref} reduceMotion={reduceMotion} />;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-[260px] shrink-0 border-r border-sidebar-border bg-sidebar/85 backdrop-blur md:block">{sidebar}</aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-card/75 px-4 backdrop-blur md:px-8">
          <Sheet>
            <SheetTrigger asChild>
              <button className="rounded-lg p-2 text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden" type="button" aria-label="Navigatie openen">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent className="p-0" side="left">
              <SheetTitle className="sr-only">Hoofdnavigatie</SheetTitle>
              <Sidebar brand={brand} nav={nav} user={user} accent={accent} activeHref={activeHref} mobile reduceMotion={reduceMotion} />
            </SheetContent>
          </Sheet>

          <div className="min-w-0">
            <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">{brand.title}</p>
            <p className="truncate text-sm font-semibold">{brand.subtitle}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden h-9 w-64 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground lg:flex">
              <Search className="h-4 w-4" />
              <span>Zoeken…</span>
            </div>
            {messagesHref ? (
              <Link className="relative rounded-xl border border-border bg-background p-2 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={messagesHref} aria-label="Berichten en meldingen">
                <Bell className="h-4 w-4" />
              </Link>
            ) : null}
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-semibold text-white", accentStyles[accent])} aria-label={user.name} role="img">
              {initials}
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ brand, nav, user, accent, activeHref, mobile = false, reduceMotion }: { brand: Props["brand"]; nav: ShellNavItem[]; user: Props["user"]; accent: ShellAccent; activeHref?: string; mobile?: boolean; reduceMotion: boolean | null }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-glow", accentStyles[accent])}>
          <Waves className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold tracking-tight text-foreground">
            NXT<span className="text-primary">TRACK</span>
          </p>
          <p className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">{brand.subtitle}</p>
        </div>
      </div>
      <nav aria-label="Hoofdnavigatie" className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {nav.map((item) => (
          <NavigationItem active={activeHref === item.href} item={item} key={item.href} mobile={mobile} reduceMotion={reduceMotion} />
        ))}
      </nav>
      <div className="m-3 rounded-2xl border border-border bg-gradient-to-br from-muted to-card p-3">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-semibold text-white", accentStyles[accent])}>{getInitials(user.name)}</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavigationItem({ item, active, mobile, reduceMotion }: { item: ShellNavItem; active: boolean; mobile: boolean; reduceMotion: boolean | null }) {
  const Icon = shellIcons[item.icon];
  const link = (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
      <Icon className={cn("h-[18px] w-[18px]", active && "text-primary")} />
      <span className="flex-1">{item.label}</span>
      {item.badge ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{item.badge}</span> : null}
    </Link>
  );

  return mobile ? <SheetClose asChild>{link}</SheetClose> : link;
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
