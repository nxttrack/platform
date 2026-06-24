import {
  Award,
  BarChart3,
  Bell,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  GraduationCap,
  Home,
  Inbox,
  ListChecks,
  MapPin,
  MessageSquare,
  Send,
  Settings,
  TrendingUp,
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
  { href: "/admin", label: "Dashboard", icon: Home },
  { href: "/admin/agenda", label: "Planning", icon: Calendar },
  { href: "/admin/programs", label: "Programma's", icon: Waves },
  { href: "/admin/stages", label: "Niveaus", icon: TrendingUp },
  { href: "/admin/badges", label: "Badges", icon: Award },
  { href: "/admin/groups", label: "Groepen", icon: Users },
  { href: "/admin/sessions", label: "Lessen", icon: Calendar },
  { href: "/admin/resources", label: "Locaties", icon: MapPin },
  { href: "/admin/enrollments", label: "Inschrijvingen", icon: Users },
  { href: "/admin/instructors", label: "Instructeurs", icon: User },
  { href: "/admin/afzwemmen", label: "Afzwemmen", icon: Award },
  { href: "/admin/payments", label: "Betalingen", icon: CircleDollarSign },
  { href: "/admin/rapportages", label: "Rapportages", icon: BarChart3 },
  { href: "/admin/berichten", label: "Berichten", icon: MessageSquare },
  { href: "/admin/taken", label: "Taken", icon: ListChecks },
  { href: "/admin/documenten", label: "Documenten", icon: FileText },
  { href: "/admin/intake", label: "Intake", icon: Inbox },
  { href: "/admin/wachtlijst", label: "Wachtlijst", icon: ListChecks },
  { href: "/admin/plaatsingsvoorstellen", label: "Plaatsingen", icon: CheckCircle2 },
  { href: "/admin/slot-offers", label: "Lesplek-aanbod", icon: Send },
  { href: "/admin/instellingen", label: "Instellingen", icon: Settings }
];

export const platformNav: NavItem[] = [
  { href: "/platform", label: "Overzicht", icon: Home },
  { href: "/platform/tenants", label: "Tenants", icon: Users },
  { href: "/platform/templates", label: "Templates", icon: Waves },
  { href: "/platform/settings", label: "Instellingen", icon: Settings }
];
