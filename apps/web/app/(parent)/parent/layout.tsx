import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { privateRouteMetadata } from "@/lib/auth/access";
import { parentNav } from "@/lib/navigation";

export const metadata: Metadata = privateRouteMetadata;

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell brand={{ title: "Zwemschool Demo", subtitle: "Ouder portaal" }} nav={parentNav} user={{ name: "Lisa de Jong", role: "Ouder" }} accent="parent">
      {children}
    </AppShell>
  );
}
