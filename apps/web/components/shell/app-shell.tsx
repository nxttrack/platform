import type { ReactNode } from "react";

import { AppShellClient, type ShellAccent, type ShellIconName, type ShellNavItem, type ShellNotificationCenter } from "@/components/shell/app-shell-client";
import type { GlobalSearchItem } from "@/components/shell/global-command-palette";

export type NavItem = ShellNavItem;

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
};

export function AppShell(props: Props) {
  return <AppShellClient {...props} />;
}
