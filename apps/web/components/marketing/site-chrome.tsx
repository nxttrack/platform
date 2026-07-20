"use client";

import { ArrowRight, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const logoPath = "/lovable/nxttrack-logo.svg";

const navigation = [
  { href: "/nxttrack/zwemscholen", label: "Zwemscholen" },
  { href: "/nxttrack/ouderportaal", label: "Ouderportaal" },
  { href: "/nxttrack/trainer-app", label: "Trainer app" },
  { href: "/nxttrack/backoffice", label: "Backoffice" },
  { href: "/nxttrack/prijzen", label: "Prijzen" }
];

const footerColumns = [
  {
    title: "Platform",
    links: [
      { href: "/nxttrack/zwemscholen", label: "Voor zwemscholen" },
      { href: "/nxttrack/ouderportaal", label: "Ouderportaal" },
      { href: "/nxttrack/trainer-app", label: "Trainer app" },
      { href: "/nxttrack/backoffice", label: "Backoffice" },
      { href: "/nxttrack/wachtrij-planning", label: "Wachtrij & planning" },
      { href: "/nxttrack/badges-diplomas", label: "Badges & diploma's" }
    ]
  },
  {
    title: "Bedrijf",
    links: [
      { href: "/nxttrack/prijzen", label: "Prijzen" },
      { href: "/nxttrack/demo", label: "Plan demo" },
      { href: "/nxttrack/contact", label: "Contact" },
      { href: "/nxttrack/privacy", label: "Privacy & AVG" }
    ]
  },
  {
    title: "Demo omgevingen",
    links: [
      { href: "/", label: "Organisatiesite" },
      { href: "/portaal", label: "Ouderomgeving" },
      { href: "/instructor", label: "Traineromgeving" },
      { href: "/admin", label: "Backoffice" }
    ]
  }
];

export function MarketingSiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:h-18 md:px-8">
        <Link href="/nxttrack" className="flex items-center" aria-label="NXTTRACK homepage">
          <Image src={logoPath} alt="NXTTRACK" width={169} height={36} className="h-7 w-auto" priority />
        </Link>

        <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="NXTTRACK hoofdnavigatie">
          {navigation.map((item) => (
            <MarketingNavLink key={item.href} {...item} active={isActivePath(pathname, item.href)} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/nxttrack/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 md:inline-flex">
            Inloggen
          </Link>
          <Link href="/nxttrack/demo" className="hidden items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 md:inline-flex">
            Plan demo <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          <Sheet>
            <SheetTrigger asChild>
              <button type="button" className="rounded-lg p-2 text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden" aria-label="Navigatie openen">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(88vw,22rem)] p-0">
              <SheetTitle className="sr-only">NXTTRACK navigatie</SheetTitle>
              <div className="flex h-full flex-col bg-white px-5 pb-6 pt-16">
                <nav className="flex flex-col gap-1" aria-label="Mobiele NXTTRACK navigatie">
                  {navigation.map((item) => (
                    <SheetClose asChild key={item.href}>
                      <MarketingNavLink {...item} active={isActivePath(pathname, item.href)} mobile />
                    </SheetClose>
                  ))}
                </nav>
                <div className="mt-auto grid gap-2 border-t border-slate-200 pt-5">
                  <SheetClose asChild>
                    <Link href="/nxttrack/login" className="rounded-lg border border-slate-300 px-4 py-2.5 text-center text-sm font-semibold text-slate-800">
                      Inloggen
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link href="/nxttrack/demo" className="rounded-lg bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-white">
                      Plan demo
                    </Link>
                  </SheetClose>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export function MarketingSiteFooter() {
  return (
    <footer className="mt-24 border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-14 md:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Image src={logoPath} alt="NXTTRACK" width={169} height={36} className="h-7 w-auto" />
            <p className="mt-4 max-w-sm text-sm text-slate-600">Het next-gen platform voor moderne zwemscholen. Ouderportaal, trainer app, backoffice, planning en diploma kluis in één platform.</p>
            <p className="mt-4 text-xs text-slate-500">Gebouwd in Nederland · AVG-bewust</p>
          </div>
          {footerColumns.map((column) => (
            <div key={column.title}>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{column.title}</p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={`${link.href}-${link.label}`}>
                    <Link href={link.href} className="text-sm text-slate-700 transition-colors hover:text-slate-950">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-slate-200 pt-6 text-xs text-slate-500 md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} NXTTRACK. Alle rechten voorbehouden.</p>
          <p>Eerst gebouwd voor zwemscholen. Klaar voor andere sporten.</p>
        </div>
      </div>
    </footer>
  );
}

function MarketingNavLink({ href, label, active, mobile = false }: { href: string; label: string; active: boolean; mobile?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        mobile ? "px-3 py-3" : "px-3 py-2",
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      )}
    >
      {label}
    </Link>
  );
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
