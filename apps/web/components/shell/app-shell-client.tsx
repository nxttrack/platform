"use client";

import {
  Award,
  Baby,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  Calendar,
  ChevronDown,
  CreditCard,
  FileText,
  GraduationCap,
  Globe2,
  Home,
  Inbox,
  ListChecks,
  MapPin,
  Menu,
  MessageSquare,
  Newspaper,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCcw,
  Settings,
  ShieldCheck,
  TrendingUp,
  User,
  UserPlus,
  Users,
  Upload,
  Waves
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { GlobalCommandPalette, type GlobalSearchItem } from "@/components/shell/global-command-palette";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { markAllNotificationsReadAction } from "@/lib/domain/communication-hub-actions";
import { cn } from "@/lib/utils";

const shellIcons = {
  award: Award,
  baby: Baby,
  bell: Bell,
  bot: Bot,
  boxes: Boxes,
  chart: BarChart3,
  calendar: Calendar,
  card: CreditCard,
  file: FileText,
  graduation: GraduationCap,
  globe: Globe2,
  home: Home,
  inbox: Inbox,
  location: MapPin,
  message: MessageSquare,
  newspaper: Newspaper,
  palette: Palette,
  refresh: RefreshCcw,
  settings: Settings,
  shield: ShieldCheck,
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
  exact?: boolean;
  activePrefixes?: string[];
};

export type ShellNotificationCenter = {
  href: string;
  unreadCount: number;
  items: Array<{
    id: string;
    title: string;
    body: string;
    href: string | null;
    createdAt: string;
    priority: "low" | "normal" | "high" | "urgent";
    unread: boolean;
  }>;
};

type Props = {
  brand: { title: string; subtitle: string; logoUrl?: string | null };
  nav: ShellNavItem[];
  user: { name: string; role: string };
  children: ReactNode;
  accent?: ShellAccent;
  searchItems?: GlobalSearchItem[];
  notificationCenter?: ShellNotificationCenter;
  mobileBottomNav?: boolean;
  profileMenu?: ShellNavItem[];
  contextSelector?: {
    label: string;
    parameter: string;
    allLabel: string;
    options: Array<{ description?: string; label: string; value: string }>;
  };
  contextSelectorPlacement?: "header" | "profile";
};

const accentStyles: Record<ShellAccent, string> = {
  parent: "from-sky-500 to-blue-700",
  instructor: "from-cyan-500 to-blue-700",
  admin: "from-blue-700 to-indigo-900",
  platform: "from-slate-900 to-blue-800"
};

export function AppShellClient({
  brand,
  nav,
  user,
  children,
  accent = "parent",
  searchItems,
  notificationCenter,
  mobileBottomNav = false,
  profileMenu,
  contextSelector,
  contextSelectorPlacement = "header"
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const [portalTransition, setPortalTransition] = useState(false);
  const activeHref = findActiveHref(pathname, nav);
  const initials = getInitials(user.name);
  const messagesHref = nav.find((item) => item.icon === "message")?.href;
  const contextualNav = useMemo(
    () => nav.map((item) => ({ ...item, href: withContextParameter(item.href, contextSelector?.parameter, searchParams.get(contextSelector?.parameter ?? "")) })),
    [contextSelector?.parameter, nav, searchParams]
  );
  const contextualProfileMenu = useMemo(
    () => profileMenu?.map((item) => ({ ...item, href: withContextParameter(item.href, contextSelector?.parameter, searchParams.get(contextSelector?.parameter ?? "")) })),
    [contextSelector?.parameter, profileMenu, searchParams]
  );
  const contextualNotificationCenter = useMemo(
    () => notificationCenter ? {
      ...notificationCenter,
      href: withContextParameter(notificationCenter.href, contextSelector?.parameter, searchParams.get(contextSelector?.parameter ?? "")),
      items: notificationCenter.items.map((item) => ({
        ...item,
        href: item.href ? withContextParameter(item.href, contextSelector?.parameter, searchParams.get(contextSelector?.parameter ?? "")) : null
      }))
    } : undefined,
    [contextSelector?.parameter, notificationCenter, searchParams]
  );

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("nxttrack.sidebar.collapsed") === "true");
  }, []);

  useEffect(() => {
    const channel = "BroadcastChannel" in window ? new BroadcastChannel("nxttrack.portal-session") : null;
    const lock = (mode: unknown) => {
      if (mode !== "child" && mode !== "locked") return;
      document.documentElement.dataset.portalSessionTransition = "true";
      setPortalTransition(true);
      window.location.replace(mode === "child" ? "/kind" : "/login?error=child_session_locked");
    };
    const onMessage = (event: MessageEvent) => lock((event.data as { mode?: unknown } | null)?.mode);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "nxttrack.portal-session.mode" || !event.newValue) return;
      try { lock((JSON.parse(event.newValue) as { mode?: unknown }).mode); } catch { /* fail closed at the server guard */ }
    };
    channel?.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    const state = JSON.stringify({ mode: "parent", changedAt: Date.now() });
    window.localStorage.setItem("nxttrack.portal-session.mode", state);
    channel?.postMessage({ mode: "parent" });
    void navigator.serviceWorker?.ready.then((registration) => {
      registration.active?.postMessage({ type: "PORTAL_MODE", mode: "parent" });
    });
    delete document.documentElement.dataset.portalSessionTransition;
    return () => {
      channel?.removeEventListener("message", onMessage);
      channel?.close();
      window.removeEventListener("storage", onStorage);
    };
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
      nav={contextualNav}
      onToggleCollapsed={toggleCollapsed}
      reduceMotion={reduceMotion}
      user={user}
    />
  );

  if (portalTransition) return <div aria-live="assertive" className="portal-session-transition">Portaalcontext wordt veilig vergrendeld…</div>;

  return (
    <div
      className={cn(
        "flex min-h-screen",
        accent === "admin" && "admin-density",
        mobileBottomNav && "parent-portal-shell"
      )}
      data-portal-route={mobileBottomNav ? pathname : undefined}
    >
      <aside
        className={cn(
          "relative shrink-0 border-r border-sidebar-border bg-sidebar/90 backdrop-blur transition-[width] duration-200",
          mobileBottomNav
            ? "portal-parent-sidebar sidebar hidden overflow-hidden border shadow-card lg:block"
            : "hidden md:block",
          collapsed ? "w-[76px]" : mobileBottomNav ? "w-[240px]" : "w-[248px]"
        )}
      >
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={cn(
          "sticky top-0 z-40 flex min-h-14 items-center gap-2 border-b border-border bg-card/90 px-3 backdrop-blur md:gap-3 md:px-6",
          mobileBottomNav && "portal-parent-header topbar"
        )}>
          {!mobileBottomNav ? <Sheet>
            <SheetTrigger asChild>
              <button className="grid size-11 place-items-center rounded-lg text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden" type="button" aria-label="Navigatie openen">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent className="p-0" side="left">
              <SheetTitle className="sr-only">Hoofdnavigatie</SheetTitle>
              <Sidebar accent={accent} activeHref={activeHref} brand={brand} mobile nav={nav} reduceMotion={reduceMotion} user={user} />
            </SheetContent>
          </Sheet> : null}

          {mobileBottomNav ? (
            <div aria-label={`${brand.title}, ${brand.subtitle}`} className="portal-mobile-brand lg:hidden">
              <span aria-hidden="true" className="portal-mobile-brand__mark">
                {getInitials(brand.title).slice(0, 2)}
                {brand.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    className="portal-mobile-brand__logo"
                    onError={(event) => { event.currentTarget.hidden = true; }}
                    src={brand.logoUrl}
                  />
                ) : null}
              </span>
              <span className="min-w-0">
                <strong className="portal-mobile-brand__title">{brand.title}</strong>
                <span className="portal-mobile-brand__subtitle">{brand.subtitle}</span>
              </span>
            </div>
          ) : null}
          <div className={cn("min-w-0", mobileBottomNav && "hidden lg:block")}>
            <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">{brand.title}</p>
            <p className="truncate text-sm font-semibold">{brand.subtitle}</p>
          </div>
          {contextSelector && contextSelectorPlacement === "header" ? <ContextSelector selector={contextSelector} /> : null}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!mobileBottomNav ? <GlobalCommandPalette items={searchItems} nav={nav} /> : null}
            {contextualNotificationCenter ? (
              <NotificationCenter center={contextualNotificationCenter} />
            ) : messagesHref ? (
              <Link className="relative grid size-11 place-items-center rounded-xl border border-border bg-background transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={messagesHref} aria-label="Berichten en meldingen">
                <Bell className="h-4 w-4" />
              </Link>
            ) : null}
            {contextualProfileMenu?.length ? (
              <ProfileMenu accent={accent} contextSelector={contextSelectorPlacement === "profile" ? contextSelector : undefined} initials={initials} items={contextualProfileMenu} user={user} />
            ) : (
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-semibold text-white", accentStyles[accent])} aria-label={user.name} role="img">
                {initials}
              </div>
            )}
          </div>
        </header>
        <main className={cn(
          "min-w-0 flex-1",
          mobileBottomNav
            ? "portal-parent-main"
            : "p-4 md:p-6 2xl:p-8"
        )}>{children}</main>
      </div>
      {mobileBottomNav ? (
        <MobileBottomNavigation
          activeHref={activeHref}
          nav={contextualNav}
          profileMenu={contextualProfileMenu}
        />
      ) : null}
    </div>
  );
}

function ContextSelector({ selector }: { selector: NonNullable<Props["contextSelector"]> }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = searchParams.get(selector.parameter) ?? "";
  const selected = selector.options.find((option) => option.value === value);

  function selectContext(nextValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextValue) params.set(selector.parameter, nextValue);
    else params.delete(selector.parameter);
    const query = params.toString();
    const hash = window.location.hash;
    router.replace(`${query ? `${pathname}?${query}` : pathname}${hash}`, { scroll: false });
  }

  return (
    <Popover>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                aria-label={`${selector.label}: ${selected?.label ?? selector.allLabel}`}
                className="grid size-11 shrink-0 place-items-center rounded-full border border-border bg-background text-sm font-black text-primary shadow-soft outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring md:size-12"
                type="button"
              >
                {selected ? getInitials(selected.label).slice(0, 2) : <Users aria-hidden="true" className="size-5" />}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{selected?.label ?? selector.allLabel}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent align="start" className="w-[min(92vw,320px)] overflow-hidden p-1.5">
        <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{selector.label}</p>
        <ContextOption
          description="Bekijk het complete gezinsoverzicht"
          label={selector.allLabel}
          onSelect={() => selectContext("")}
          selected={!value}
        />
        {selector.options.map((option) => (
          <ContextOption
            description={option.description ?? "Geen actief programma"}
            key={option.value}
            label={option.label}
            onSelect={() => selectContext(option.value)}
            selected={option.value === value}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ContextOption({
  description,
  label,
  onSelect,
  selected
}: {
  description: string;
  label: string;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-xl px-2.5 text-left outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        selected && "bg-primary/10"
      )}
      onClick={onSelect}
      type="button"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-black text-primary">
        {getInitials(label).slice(0, 2)}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm text-foreground">{label}</strong>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      {selected ? <span className="text-xs font-bold text-primary">Gekozen</span> : null}
    </button>
  );
}

function ProfileMenu({
  accent,
  contextSelector,
  initials,
  items,
  user
}: {
  accent: ShellAccent;
  contextSelector?: NonNullable<Props["contextSelector"]>;
  initials: string;
  items: ShellNavItem[];
  user: Props["user"];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const groups = groupNavigation(items);
  const selectedContextValue = contextSelector ? searchParams.get(contextSelector.parameter) : null;
  const selectedContext = contextSelector?.options.find((option) => option.value === selectedContextValue)
    ?? contextSelector?.options[0]
    ?? null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="Profiel en meer"
          className={cn("grid size-11 place-items-center rounded-xl bg-gradient-to-br text-xs font-bold text-white shadow-soft outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring", accentStyles[accent])}
          type="button"
        >
          {initials}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,320px)] overflow-hidden p-0">
        <div className="border-b border-border bg-muted/30 px-4 py-4">
          <p className="truncate font-bold text-foreground">{user.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.role}</p>
        </div>
        {contextSelector && selectedContext ? <div className="border-b border-border p-2">
          <div className="rounded-xl bg-primary/5 px-3 py-2.5"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Actief kind</p><p className="mt-1 truncate text-sm font-bold text-foreground">{selectedContext.label}</p></div>
          <Link className="mt-1 flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-foreground hover:bg-muted" href={withContextParameter("/portaal/kinderen", contextSelector.parameter, selectedContext.value)}><Users className="size-4 text-primary" />Ander kind…</Link>
          <Link className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-foreground hover:bg-muted" href={`${withContextParameter("/portaal/kinderen", contextSelector.parameter, selectedContext.value)}#kindmodus`}><Baby className="size-4 text-primary" />Open kinderportaal</Link>
        </div> : null}
        <div className="max-h-[min(70vh,520px)] overflow-y-auto p-2">
          {groups.map((group, index) => (
            <section className={cn(index > 0 && "mt-2 border-t border-border pt-2")} key={group.label}>
              {group.label ? <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{group.label}</p> : null}
              {group.items.map((item) => {
                const Icon = shellIcons[item.icon];
                const active = !item.href.includes("#") && isNavigationItemActive(pathname, item);
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-primary/10 text-primary" : "text-foreground")}
                    href={item.href}
                    key={item.href}
                  >
                    <Icon className="size-[18px] shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MobileBottomNavigation({
  activeHref,
  nav,
  profileMenu
}: {
  activeHref?: string;
  nav: ShellNavItem[];
  profileMenu?: ShellNavItem[];
}) {
  const primaryItems = nav.filter((item) => item.icon !== "card").slice(0, 4);
  const paymentItem = nav.find((item) => item.icon === "card");
  const moreItems = [...(paymentItem ? [paymentItem] : []), ...(profileMenu ?? [])];
  const moreActive = moreItems.some((item) => activeHref === stripContextParameter(item.href));

  return (
    <nav
      aria-label="Mobiele hoofdnavigatie"
      className="portal-mobile-navigation mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-18px_rgb(11_47_107_/_35%)] backdrop-blur lg:hidden"
    >
      {primaryItems.map((item) => {
        const Icon = shellIcons[item.icon];
        const active = activeHref === stripContextParameter(item.href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn("mobile-nav-item relative flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[9px] font-semibold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "text-primary" : "text-muted-foreground")}
            href={item.href}
            key={item.href}
          >
            {active ? <span aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" /> : null}
            <Icon className={cn("size-5", active && "stroke-[2.5]")} />
            <span className="w-full whitespace-nowrap text-center">{item.label}</span>
          </Link>
        );
      })}
      <Popover>
        <PopoverTrigger asChild>
          <button
            aria-label="Meer"
            aria-pressed={moreActive}
            className={cn(
              "mobile-nav-item relative flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[9px] font-semibold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              moreActive ? "text-primary" : "text-muted-foreground"
            )}
            type="button"
          >
            {moreActive ? <span aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" /> : null}
            <User className={cn("size-5", moreActive && "stroke-[2.5]")} />
            <span>Meer</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="mb-2 w-[min(92vw,340px)] overflow-hidden p-2">
          <p className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Profiel en meer</p>
          {moreItems.map((item) => {
            const Icon = shellIcons[item.icon];
            return (
              <Link
                className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-foreground outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                href={item.href}
                key={item.href}
              >
                <Icon className="size-[18px] text-primary" />
                {item.label}
              </Link>
            );
          })}
        </PopoverContent>
      </Popover>
    </nav>
  );
}

function NotificationCenter({ center }: { center: ShellNotificationCenter }) {
  const badge = center.unreadCount > 99 ? "99+" : String(center.unreadCount);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={center.unreadCount ? `Notificaties, ${center.unreadCount} ongelezen` : "Notificaties, niets ongelezen"}
          className="relative grid size-11 place-items-center rounded-xl border border-border bg-background transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="button"
        >
          <Bell className="h-4 w-4" />
          {center.unreadCount ? (
            <span aria-hidden="true" className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-card bg-danger px-1 text-[10px] font-bold text-white">
              {badge}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Recente notificaties" className="w-[min(92vw,390px)] p-0">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="font-bold text-foreground">Notificaties</p>
            <p className="text-xs text-muted-foreground">{center.unreadCount} ongelezen</p>
          </div>
          {center.unreadCount ? (
            <form action={markAllNotificationsReadAction}>
              <input name="next" type="hidden" value={center.href} />
              <Button size="sm" type="submit" variant="ghost">Alles gelezen</Button>
            </form>
          ) : null}
        </header>
        <div className="max-h-[420px] overflow-y-auto">
          {center.items.length ? center.items.map((item) => (
            <Link className="block border-b border-border px-4 py-3 transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" href={item.href ?? center.href} key={item.id}>
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.unread ? item.priority === "urgent" ? "bg-danger" : "bg-primary" : "bg-muted-foreground/30")} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-foreground">{item.title}</p>
                    {item.unread ? <span className="sr-only">Ongelezen</span> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.body}</p>
                  <time className="mt-1 block text-[11px] text-muted-foreground" dateTime={item.createdAt}>{formatNotificationDate(item.createdAt)}</time>
                </div>
              </div>
            </Link>
          )) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nog geen notificaties.</p>
          )}
        </div>
        <Link className="flex min-h-11 items-center justify-center border-t border-border px-4 text-sm font-semibold text-primary hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" href={center.href}>
          Alles bekijken
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
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
            const hasActiveItem = group.items.some((item) => activeHref === stripContextParameter(item.href));
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
                      <NavigationItem active={activeHref === stripContextParameter(item.href)} collapsed={collapsed && !mobile} item={item} key={item.href} mobile={mobile} reduceMotion={reduceMotion} />
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
    .filter((item) => isNavigationItemActive(pathname, item))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;
}

function isNavigationItemActive(pathname: string, item: ShellNavItem) {
  const href = stripContextParameter(item.href).split("#")[0] ?? item.href;
  if (pathname === href) return true;
  if (!item.exact && pathname.startsWith(`${href}/`)) return true;
  return item.activePrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ?? false;
}

function withContextParameter(href: string, parameter: string | undefined, value: string | null) {
  if (!parameter || !value) return href;
  const [pathAndQuery, hash] = href.split("#");
  const [path, query = ""] = pathAndQuery.split("?");
  const params = new URLSearchParams(query);
  params.set(parameter, value);
  return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
}

function stripContextParameter(href: string) {
  return href.split("?")[0] ?? href;
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
