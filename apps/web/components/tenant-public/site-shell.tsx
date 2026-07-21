"use client";

import { ArrowRight, CalendarDays, Home, LogIn, Menu, Newspaper, Sparkles, Waves } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/programmas", label: "Programma's", icon: Waves },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/nieuws", label: "Nieuws", icon: Newspaper }
];

export function TenantPublicShell({ tenantName, children }: { tenantName: string; children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/80 bg-card/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/">
            <TenantMark name={tenantName} />
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-bold text-foreground sm:text-base">{tenantName}</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Zwemschool</span>
            </span>
          </Link>

          <nav aria-label="Publieke navigatie" className="ml-auto hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <PublicNavLink active={isActive(pathname, item.href)} href={item.href} key={item.href} label={item.label} />
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Link className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground" href="/login">
              <LogIn className="h-4 w-4" />
              Inloggen
            </Link>
            <Link className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-105" href="/intake">
              Aanmelden
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <button aria-label="Navigatie openen" className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-foreground md:hidden" type="button">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent className="flex w-[min(88vw,360px)] flex-col p-0" side="right">
              <SheetTitle className="sr-only">Publieke navigatie</SheetTitle>
              <div className="border-b border-border p-5">
                <div className="flex items-center gap-3">
                  <TenantMark name={tenantName} />
                  <div className="min-w-0">
                    <p className="truncate font-display font-bold">{tenantName}</p>
                    <p className="text-xs text-muted-foreground">Vind je zwemroute</p>
                  </div>
                </div>
              </div>
              <nav aria-label="Mobiele publieke navigatie" className="grid gap-1 p-4">
                {navItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <SheetClose asChild key={item.href}>
                      <Link
                        aria-current={isActive(pathname, item.href) ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition",
                          isActive(pathname, item.href) ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                        )}
                        href={item.href}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </SheetClose>
                  );
                })}
              </nav>
              <div className="mt-auto grid gap-2 border-t border-border p-4">
                <SheetClose asChild>
                  <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold" href="/login">
                    <LogIn className="h-4 w-4" /> Inloggen
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground" href="/intake">
                    Aanmelden <ArrowRight className="h-4 w-4" />
                  </Link>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {children}

      <footer className="border-t border-border bg-navy text-navy-foreground">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.3fr_0.7fr_0.7fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-aqua"><Waves className="h-5 w-5" /></span>
              <div>
                <p className="font-display font-bold">{tenantName}</p>
                <p className="text-xs text-white/60">Persoonlijke zwemontwikkeling</p>
              </div>
            </div>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/65">Van kennismaking en intake tot lessen, voortgang en diploma: één duidelijke route voor ieder kind.</p>
          </div>
          <FooterLinks title="Ontdek" links={navItems.slice(1).map(({ href, label }) => ({ href, label }))} />
          <FooterLinks title="Direct regelen" links={[{ href: "/intake", label: "Aanmelden" }, { href: "/login", label: "Inloggen" }]} />
        </div>
        <div className="border-t border-white/10 px-4 py-4 text-center text-xs text-white/50">
          Powered by NXTTRACK · veilig en AVG-bewust
        </div>
      </footer>
    </div>
  );
}

function TenantMark({ name }: { name: string }) {
  return (
    <span aria-label={`${name} logo`} className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-aqua to-primary text-white shadow-glow" role="img">
      <Waves className="h-5 w-5" />
      <Sparkles className="absolute right-1 top-1 h-2.5 w-2.5 text-white/75" />
    </span>
  );
}

function PublicNavLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn("rounded-xl px-3 py-2 text-sm font-semibold transition", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
      href={href}
    >
      {label}
    </Link>
  );
}

function FooterLinks({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aqua">{title}</p>
      <div className="mt-3 grid gap-2">
        {links.map((link) => <Link className="text-sm text-white/70 transition hover:text-white" href={link.href} key={link.href}>{link.label}</Link>)}
      </div>
    </div>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
