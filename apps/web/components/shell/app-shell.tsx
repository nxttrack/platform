import type { ReactNode } from "react";

import { AppShellClient, type ShellAccent, type ShellIconName, type ShellNavItem } from "@/components/shell/app-shell-client";

export type NavItem = ShellNavItem;

type Props = {
  brand: { title: string; subtitle: string };
  nav: Array<{ href: string; label: string; icon: ShellIconName; badge?: number }>;
  user: { name: string; role: string };
  children: ReactNode;
  accent?: ShellAccent;
};

export function AppShell(props: Props) {
  return <AppShellClient {...props} />;
}
