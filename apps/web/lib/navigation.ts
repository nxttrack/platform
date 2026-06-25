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
  Globe2,
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
  Sparkles,
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
  { href: "/parent/helpdesk", label: "Helpdesk", icon: MessageSquare },
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

  { href: "/admin/intake", label: "Intake", icon: Inbox, section: "Instroom & plaatsing" },
  { href: "/admin/wachtlijst", label: "Wachtlijst", icon: ListChecks, section: "Instroom & plaatsing" },
  { href: "/admin/plaatsingsvoorstellen", label: "Plaatsingsvoorstellen", icon: CheckCircle2, section: "Instroom & plaatsing" },
  { href: "/admin/slot-offers", label: "Lesplek-aanbod", icon: Send, section: "Instroom & plaatsing" },

  { href: "/admin/programs", label: "Programma's", icon: Waves, section: "Aanbod & voortgang" },
  { href: "/admin/stages", label: "Niveaus", icon: TrendingUp, section: "Aanbod & voortgang" },
  { href: "/admin/badges", label: "Badges & doorstroom", icon: Award, section: "Aanbod & voortgang" },

  { href: "/admin/agenda", label: "Planning", icon: Calendar, section: "Planning & lessen" },
  { href: "/admin/groups", label: "Groepen", icon: Users, section: "Planning & lessen" },
  { href: "/admin/sessions", label: "Zwemlessen", icon: Calendar, section: "Planning & lessen" },
  { href: "/admin/resources", label: "Locaties & banen", icon: MapPin, section: "Planning & lessen" },
  { href: "/admin/afzwemmen", label: "Afzwemmen", icon: GraduationCap, section: "Planning & lessen" },

  { href: "/admin/leerlingen", label: "Leerlingen & ouders", icon: Users, section: "Mensen" },
  { href: "/admin/enrollments", label: "Inschrijvingen", icon: ListChecks, section: "Mensen" },
  { href: "/admin/instructors", label: "Instructeurs", icon: User, section: "Mensen" },

  { href: "/admin/helpdesk", label: "Helpdesk", icon: Inbox, section: "Communicatie" },
  { href: "/admin/berichten", label: "Berichten", icon: MessageSquare, section: "Communicatie" },
  { href: "/admin/nieuwsbrief", label: "Nieuwsbrief", icon: Megaphone, section: "Communicatie" },
  { href: "/admin/mailtemplates", label: "Mailtemplates", icon: Mail, section: "Communicatie" },
  { href: "/admin/notificatietemplates", label: "Notificatietemplates", icon: Bell, section: "Communicatie" },

  { href: "/admin/instellingen", label: "Website & branding", icon: Globe2, section: "Content & documenten" },
  { href: "/admin/nieuws", label: "Nieuws", icon: Newspaper, section: "Content & documenten" },
  { href: "/admin/documenten", label: "Documenten", icon: FileText, section: "Content & documenten" },

  { href: "/admin/payments", label: "Betalingen", icon: CircleDollarSign, section: "Financieel & inzicht" },
  { href: "/admin/rapportages", label: "Rapportages", icon: BarChart3, section: "Financieel & inzicht" },

  { href: "/admin/taken", label: "Taken", icon: ListChecks, section: "Operatie" },
  { href: "/admin/imports", label: "Imports", icon: Upload, section: "Operatie" },

  { href: "/admin/automatisering", label: "Automatisering", icon: Bot, section: "Slimme functies" },
  { href: "/admin/ai-assistent", label: "AI-assistent", icon: Sparkles, section: "Slimme functies" },

  { href: "/admin/mail-instellingen", label: "Mailinstellingen", icon: Settings, section: "Technisch beheer" }
];

export const platformNav: NavItem[] = [
  { href: "/platform", label: "Overzicht", icon: Home },
  { href: "/platform/tenants", label: "Tenants", icon: Users },
  { href: "/platform/templates", label: "Templates", icon: Waves },
  { href: "/platform/settings", label: "Instellingen", icon: Settings }
];
