import type { ReactNode } from "react";

import { AppShellClient, type ShellAccent, type ShellIconName, type ShellNavItem } from "@/components/shell/app-shell-client";
import type { GlobalSearchItem } from "@/components/shell/global-command-palette";

export type NavItem = ShellNavItem;

type Props = {
  brand: { title: string; subtitle: string };
  nav: Array<{ href: string; label: string; icon: ShellIconName; badge?: number; section?: string }>;
  user: { name: string; role: string };
  children: ReactNode;
  accent?: ShellAccent;
  searchItems?: GlobalSearchItem[];
};

export function AppShell(props: Props) {
  return <AppShellClient {...props} />;
}
