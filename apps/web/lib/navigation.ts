import {
  Award,
  BarChart3,
  Bell,
  Bot,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  GraduationCap,
  Home,
  Inbox,
  ListChecks,
  Mail,
  MapPin,
  Megaphone,
  MessageSquare,
  Newspaper,
  Send,
  Settings,
  TrendingUp,
  Upload,
  User,
  Users,
  Waves
} from "lucide-react";
import type { NavItem } from "@/components/shell/app-shell";

export const parentNav: NavItem[] = [
  { href: "/parent", label: "Home", icon: Home },
  { href: "/parent/lessen", label: "Mijn lessen", icon: Waves },
  { href: "/parent/profiel", label: "Kindprofiel", icon: User },
  { href: "/parent/notificaties", label: "Notificaties", icon: Bell },
  { href: "/parent/documenten", label: "Documenten", icon: FileText },
  { href: "/parent/voortgang", label: "Voortgang", icon: TrendingUp },
  { href: "/parent/diplomas", label: "Diploma's", icon: GraduationCap },
  { href: "/parent/badges", label: "Badges", icon: Award },
  { href: "/parent/betalingen", label: "Betalingen", icon: CircleDollarSign }
];

export const instructorNav: NavItem[] = [
  { href: "/instructor", label: "Vandaag", icon: Home },
  { href: "/instructor/agenda", label: "Agenda", icon: Calendar },
  { href: "/instructor/groepen", label: "Mijn groepen", icon: Users },
  { href: "/instructor/leerlingen", label: "Leerlingen", icon: Users },
  { href: "/instructor/berichten", label: "Berichten", icon: MessageSquare },
  { href: "/instructor/taken", label: "Taken", icon: ListChecks },
  { href: "/instructor/documenten", label: "Documenten", icon: FileText }
];

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: Home, section: "Overzicht" },
  { href: "/admin/agenda", label: "Planning", icon: Calendar, section: "Overzicht" },

  { href: "/admin/intake", label: "Intake", icon: Inbox, section: "Instroom" },
  { href: "/admin/wachtlijst", label: "Wachtlijst", icon: ListChecks, section: "Instroom" },
  { href: "/admin/plaatsingsvoorstellen", label: "Plaatsingen", icon: CheckCircle2, section: "Instroom" },
  { href: "/admin/slot-offers", label: "Lesplek-aanbod", icon: Send, section: "Instroom" },

  { href: "/admin/programs", label: "Programma's", icon: Waves, section: "Aanbod" },
  { href: "/admin/stages", label: "Niveaus", icon: TrendingUp, section: "Aanbod" },
  { href: "/admin/badges", label: "Badges", icon: Award, section: "Aanbod" },

  { href: "/admin/groups", label: "Groepen", icon: Users, section: "Planning" },
  { href: "/admin/sessions", label: "Zwemlessen", icon: Calendar, section: "Planning" },
  { href: "/admin/resources", label: "Locaties", icon: MapPin, section: "Planning" },
  { href: "/admin/afzwemmen", label: "Afzwemmen", icon: GraduationCap, section: "Planning" },

  { href: "/admin/leerlingen", label: "Leerlingen & ouders", icon: Users, section: "Mensen" },
  { href: "/admin/enrollments", label: "Inschrijvingen", icon: ListChecks, section: "Mensen" },
  { href: "/admin/instructors", label: "Instructeurs", icon: User, section: "Mensen" },

  { href: "/admin/berichten", label: "Berichten", icon: MessageSquare, section: "Communicatie" },
  { href: "/admin/nieuwsbrief", label: "Nieuwsbrief", icon: Megaphone, section: "Communicatie" },
  { href: "/admin/nieuws", label: "Nieuws", icon: Newspaper, section: "Communicatie" },
  { href: "/admin/mailtemplates", label: "Mailtemplates", icon: Mail, section: "Communicatie" },
  { href: "/admin/notificatietemplates", label: "Notificaties", icon: Bell, section: "Communicatie" },
  { href: "/admin/taken", label: "Taken", icon: ListChecks, section: "Communicatie" },
  { href: "/admin/documenten", label: "Documenten", icon: FileText, section: "Communicatie" },

  { href: "/admin/payments", label: "Betalingen", icon: CircleDollarSign, section: "Financieel & inzicht" },
  { href: "/admin/rapportages", label: "Rapportages", icon: BarChart3, section: "Financieel & inzicht" },

  { href: "/admin/imports", label: "Imports", icon: Upload, section: "Beheer" },
  { href: "/admin/automatisering", label: "Automatisering", icon: Bot, section: "Beheer" },
  { href: "/admin/mail-instellingen", label: "Mailinstellingen", icon: Mail, section: "Beheer" },
  { href: "/admin/instellingen", label: "Instellingen", icon: Settings, section: "Beheer" }
];

export const platformNav: NavItem[] = [
  { href: "/platform", label: "Overzicht", icon: Home },
  { href: "/platform/tenants", label: "Tenants", icon: Users },
  { href: "/platform/templates", label: "Templates", icon: Waves },
  { href: "/platform/settings", label: "Instellingen", icon: Settings }
];
