import type { NavItem } from "@/components/shell/app-shell";

export const parentNav: NavItem[] = [
  { href: "/portaal", label: "Home", icon: "home" },
  { href: "/portaal/kinderen", label: "Kinderen", icon: "baby" },
  { href: "/portaal/lessen", label: "Mijn lessen", icon: "waves" },
  { href: "/portaal/voortgang", label: "Voortgang", icon: "trending" },
  { href: "/portaal/media", label: "Media", icon: "file" },
  { href: "/portaal/badges", label: "Badges", icon: "award" },
  { href: "/portaal/afzwemmen", label: "Afzwemmen", icon: "calendar" },
  { href: "/portaal/berichten", label: "Berichten", icon: "message" },
  { href: "/portaal/feedback", label: "Feedback", icon: "chart" },
  { href: "/portaal/diplomas", label: "Diploma's", icon: "graduation" },
  { href: "/portaal/documenten", label: "Documenten", icon: "file" },
  { href: "/portaal/betalingen", label: "Betalingen", icon: "card" },
  { href: "/portaal/profiel", label: "Profiel", icon: "user" }
];

export const instructorNav: NavItem[] = [
  { href: "/instructor", label: "Vandaag", icon: "home" },
  { href: "/instructor/agenda", label: "Agenda", icon: "calendar" },
  { href: "/instructor/lesplannen", label: "Lesplannen", icon: "tasks" },
  { href: "/instructor/berichten", label: "Berichten", icon: "message" },
  { href: "/instructor/taken", label: "Taken", icon: "tasks" },
  { href: "/instructor/groepen", label: "Mijn groepen", icon: "users" },
  { href: "/instructor/leerlingen", label: "Leerlingen", icon: "users" },
  { href: "/instructor/documenten", label: "Documenten", icon: "file" }
];

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Vandaag belangrijk", icon: "home" },
  { href: "/admin/agenda", label: "Planbord", icon: "calendar", section: "Planning" },
  { href: "/admin/seizoenen", label: "Seizoenen", icon: "calendar", section: "Planning" },
  { href: "/admin/inhaalmarkt", label: "Inhaalmarkt", icon: "refresh", section: "Planning" },
  { href: "/admin/plekherstel", label: "Vrije plekken", icon: "trending", section: "Planning" },
  { href: "/admin/vervanging", label: "Vervanging", icon: "userPlus", section: "Planning" },
  { href: "/admin/groepen", label: "Groepen", icon: "users", section: "Planning" },
  { href: "/admin/resources", label: "Resources", icon: "location", section: "Planning" },
  { href: "/admin/intake", label: "Intake", icon: "inbox", section: "Leerlingen" },
  { href: "/admin/wachtlijst", label: "Wachtlijst", icon: "tasks", section: "Leerlingen" },
  { href: "/admin/leerlingen", label: "Leerlingen", icon: "users", section: "Leerlingen" },
  { href: "/admin/gezinnen", label: "Gezinnen", icon: "users", section: "Leerlingen" },
  { href: "/admin/uitnodigingen", label: "Uitnodigingen", icon: "userPlus", section: "Leerlingen" },
  { href: "/admin/programma", label: "Programma's", icon: "waves", section: "Lesproces" },
  { href: "/admin/lesplannen", label: "Lesplannen", icon: "tasks", section: "Lesproces" },
  { href: "/admin/afzwemmen", label: "Afzwemmen", icon: "award", section: "Lesproces" },
  { href: "/admin/badges", label: "Badges", icon: "award", section: "Lesproces" },
  { href: "/admin/documenten", label: "Documenten", icon: "file", section: "Lesproces" },
  { href: "/admin/media", label: "Media & graphics", icon: "file", section: "Lesproces" },
  { href: "/admin/berichten", label: "Berichten", icon: "message", section: "Communicatie" },
  { href: "/admin/notificaties", label: "Notificaties", icon: "bell", section: "Communicatie" },
  { href: "/admin/nieuwsbrieven", label: "Nieuwsbrieven", icon: "newspaper", section: "Communicatie" },
  { href: "/admin/templates", label: "Templates", icon: "file", section: "Communicatie" },
  { href: "/admin/communicatie-instellingen", label: "Instellingen", icon: "settings", section: "Communicatie" },
  { href: "/admin/taken", label: "Taken", icon: "tasks", section: "Communicatie" },
  { href: "/admin/crm", label: "CRM-pipeline", icon: "userPlus", section: "Relaties" },
  { href: "/admin/aandacht", label: "Persoonlijke aandacht", icon: "trending", section: "Relaties" },
  { href: "/admin/feedback", label: "Feedback & NPS", icon: "chart", section: "Relaties" },
  { href: "/admin/opvolging", label: "Opvolgen", icon: "userPlus", section: "Communicatie" },
  { href: "/admin/website", label: "Website", icon: "globe", section: "Communicatie" },
  { href: "/admin/betalingen", label: "Betalingen", icon: "card", section: "Financieel" },
  { href: "/admin/rapportages", label: "Rapportages", icon: "chart", section: "Inzichten" },
  { href: "/admin/rapportages/capaciteit", label: "Capaciteitsforecast", icon: "trending", section: "Inzichten" },
  { href: "/admin/rapportages/leskwaliteit", label: "Group Health", icon: "shield", section: "Inzichten" },
  { href: "/admin/rapportages/campagnes", label: "Campagnes", icon: "chart", section: "Inzichten" },
  { href: "/admin/automatisering", label: "Recipe gallery", icon: "bot", section: "Automatisering" },
  { href: "/admin/automatisering/regels", label: "Eigen regels", icon: "settings", section: "Automatisering" },
  { href: "/admin/automatisering/acties", label: "Vandaag belangrijk", icon: "tasks", section: "Automatisering" },
  { href: "/admin/automatisering/datakwaliteit", label: "Datakwaliteit", icon: "shield", section: "Automatisering" },
  { href: "/admin/branding", label: "Branding", icon: "palette", section: "Beheer" },
  { href: "/admin/instellingen", label: "Instellingen", icon: "settings", section: "Beheer" },
  { href: "/admin/importeren", label: "Importeren", icon: "upload", section: "Beheer" },
  { href: "/admin/audit", label: "Audit Explorer", icon: "shield", section: "Beheer" },
  { href: "/admin/support", label: "Supporttoegang", icon: "userPlus", section: "Beheer" }
];

export const platformNav: NavItem[] = [
  { href: "/platform", label: "Overzicht", icon: "home" },
  { href: "/platform/onboarding", label: "Onboarding", icon: "waves" },
  { href: "/platform/offboarding", label: "Offboarding", icon: "settings" },
  { href: "/platform/test-tools/journey-bot", label: "Journey Bot", icon: "bot" },
  { href: "/platform/uitnodigingen", label: "Uitnodigingen", icon: "userPlus" },
  { href: "/platform/badges", label: "Badge Studio", icon: "award" },
  { href: "/platform/audit", label: "Audit Explorer", icon: "shield" },
  { href: "/platform/support", label: "Supporttoegang", icon: "userPlus" },
  { href: "/platform/instellingen", label: "Instellingen", icon: "settings" }
];
