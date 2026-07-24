import type { NavItem } from "@/components/shell/app-shell";

export const parentNav: NavItem[] = [
  { href: "/portaal", label: "Home", icon: "home" },
  { href: "/portaal/kinderen", label: "Kinderen", icon: "baby" },
  { href: "/portaal/lessen", label: "Mijn lessen", icon: "waves" },
  { href: "/portaal/voortgang", label: "Voortgang", icon: "trending" },
  { href: "/portaal/badges", label: "Badges", icon: "award" },
  { href: "/portaal/afzwemmen", label: "Afzwemmen", icon: "calendar" },
  { href: "/portaal/berichten", label: "Berichten", icon: "message" },
  { href: "/portaal/diplomas", label: "Diploma's", icon: "graduation" },
  { href: "/portaal/documenten", label: "Documenten", icon: "file" },
  { href: "/portaal/betalingen", label: "Betalingen", icon: "card" },
  { href: "/portaal/profiel", label: "Profiel", icon: "user" }
];

export const instructorNav: NavItem[] = [
  { href: "/instructor", label: "Vandaag", icon: "home" },
  { href: "/instructor/agenda", label: "Agenda", icon: "calendar" },
  { href: "/instructor/berichten", label: "Berichten", icon: "message" },
  { href: "/instructor/taken", label: "Taken", icon: "tasks" },
  { href: "/instructor/groepen", label: "Mijn groepen", icon: "users" },
  { href: "/instructor/leerlingen", label: "Leerlingen", icon: "users" },
  { href: "/instructor/documenten", label: "Documenten", icon: "file" }
];

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "home" },
  { href: "/admin/agenda", label: "Planboard", icon: "calendar" },
  { href: "/admin/resources", label: "Resources", icon: "location" },
  { href: "/admin/leerlingen", label: "Leerlingen", icon: "users" },
  { href: "/admin/afzwemmen", label: "Afzwemmen", icon: "award" },
  { href: "/admin/betalingen", label: "Betalingen", icon: "card" },
  { href: "/admin/rapportages", label: "Rapportages", icon: "chart" },
  { href: "/admin/automatisering", label: "Automatisering", icon: "bot" },
  { href: "/admin/berichten", label: "Berichten", icon: "message" },
  { href: "/admin/taken", label: "Taken", icon: "tasks" },
  { href: "/admin/uitnodigingen", label: "Uitnodigingen", icon: "userPlus" },
  { href: "/admin/groepen", label: "Groepen", icon: "users" },
  { href: "/admin/documenten", label: "Documenten", icon: "file" },
  { href: "/admin/programma", label: "Programma's", icon: "waves" },
  { href: "/admin/intake", label: "Intake", icon: "inbox" },
  { href: "/admin/importeren", label: "Importeren", icon: "upload" },
  { href: "/admin/wachtlijst", label: "Wachtlijst", icon: "tasks" },
  { href: "/admin/branding", label: "Branding", icon: "palette" },
  { href: "/admin/instellingen", label: "Instellingen", icon: "settings" }
];

export const platformNav: NavItem[] = [
  { href: "/platform", label: "Overzicht", icon: "home" },
  { href: "/platform/onboarding", label: "Onboarding", icon: "waves" },
  { href: "/platform/offboarding", label: "Offboarding", icon: "settings" },
  { href: "/platform/uitnodigingen", label: "Uitnodigingen", icon: "userPlus" },
  { href: "/platform/instellingen", label: "Instellingen", icon: "settings" }
];
