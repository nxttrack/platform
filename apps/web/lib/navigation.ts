import {
  Award,
  BarChart3,
  Baby,
  Calendar,
  CreditCard,
  FileText,
  GraduationCap,
  Home,
  Inbox,
  ListChecks,
  MapPin,
  MessageSquare,
  Settings,
  TrendingUp,
  User,
  UserPlus,
  Users,
  Waves
} from "lucide-react";
import type { NavItem } from "@/components/shell/app-shell";

export const parentNav: NavItem[] = [
  { href: "/portaal", label: "Home", icon: Home },
  { href: "/portaal/kinderen", label: "Kinderen", icon: Baby },
  { href: "/portaal/lessen", label: "Mijn lessen", icon: Waves },
  { href: "/portaal/voortgang", label: "Voortgang", icon: TrendingUp },
  { href: "/portaal/diplomas", label: "Diploma's", icon: GraduationCap },
  { href: "/portaal/betalingen", label: "Betalingen", icon: CreditCard },
  { href: "/portaal/profiel", label: "Profiel", icon: User }
];

export const instructorNav: NavItem[] = [
  { href: "/instructor", label: "Vandaag", icon: Home },
  { href: "/instructor/agenda", label: "Agenda", icon: Calendar },
  { href: "/instructor/groepen", label: "Mijn groepen", icon: Users },
  { href: "/instructor/leerlingen", label: "Leerlingen", icon: Users }
];

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: Home },
  { href: "/admin/agenda", label: "Planboard", icon: Calendar },
  { href: "/admin/resources", label: "Resources", icon: MapPin },
  { href: "/admin/leerlingen", label: "Leerlingen", icon: Users },
  { href: "/admin/afzwemmen", label: "Afzwemmen", icon: Award },
  { href: "/admin/betalingen", label: "Betalingen", icon: CreditCard },
  { href: "/admin/rapportages", label: "Rapportages", icon: BarChart3 },
  { href: "/admin/berichten", label: "Berichten", icon: MessageSquare },
  { href: "/admin/taken", label: "Taken", icon: ListChecks },
  { href: "/admin/uitnodigingen", label: "Uitnodigingen", icon: UserPlus },
  { href: "/admin/groepen", label: "Groepen", icon: Users },
  { href: "/admin/documenten", label: "Documenten", icon: FileText },
  { href: "/admin/programma", label: "Programma's", icon: Waves },
  { href: "/admin/intake", label: "Intake", icon: Inbox },
  { href: "/admin/wachtlijst", label: "Wachtlijst", icon: ListChecks },
  { href: "/admin/instellingen", label: "Instellingen", icon: Settings }
];

export const platformNav: NavItem[] = [
  { href: "/platform", label: "Overview", icon: Home },
  { href: "/platform", label: "Tenants", icon: Users },
  { href: "/platform/uitnodigingen", label: "Invites", icon: UserPlus },
  { href: "/platform", label: "Templates", icon: Waves },
  { href: "/platform", label: "Settings", icon: Settings }
];
