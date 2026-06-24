import {
  Award,
  BarChart3,
  Calendar,
  FileText,
  GraduationCap,
  Home,
  Inbox,
  ListChecks,
  MessageSquare,
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
  { href: "/parent/voortgang", label: "Voortgang", icon: TrendingUp },
  { href: "/parent/diplomas", label: "Diploma's", icon: GraduationCap },
  { href: "/parent/badges", label: "Badges", icon: Award },
  { href: "/parent/profiel", label: "Profiel", icon: User }
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
  { href: "/admin/agenda", label: "Planboard", icon: Calendar },
  { href: "/admin/leerlingen", label: "Leerlingen", icon: Users },
  { href: "/admin/afzwemmen", label: "Afzwemmen", icon: Award },
  { href: "/admin/rapportages", label: "Rapportages", icon: BarChart3 },
  { href: "/admin/berichten", label: "Berichten", icon: MessageSquare },
  { href: "/admin/taken", label: "Taken", icon: ListChecks },
  { href: "/admin/groepen", label: "Groepen", icon: Users },
  { href: "/admin/documenten", label: "Documenten", icon: FileText },
  { href: "/admin/programma", label: "Programma's", icon: Waves },
  { href: "/admin/intake", label: "Intake", icon: Inbox },
  { href: "/admin/wachtlijst", label: "Wachtlijst", icon: ListChecks },
  { href: "/admin/instellingen", label: "Instellingen", icon: Settings }
];

export const platformNav: NavItem[] = [
  { href: "/platform", label: "Overview", icon: Home },
  { href: "/platform/tenants", label: "Tenants", icon: Users },
  { href: "/platform/templates", label: "Templates", icon: Waves },
  { href: "/platform/settings", label: "Settings", icon: Settings }
];
