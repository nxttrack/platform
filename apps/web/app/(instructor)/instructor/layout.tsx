import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { privateRouteMetadata } from "@/lib/auth/access";
import { instructorNav } from "@/lib/navigation";

export const metadata: Metadata = privateRouteMetadata;

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell brand={{ title: "Zwemschool Demo", subtitle: "Instructeur" }} nav={instructorNav} user={{ name: "Sophie Jansen", role: "Hoofdtrainer" }} accent="instructor">
      {children}
    </AppShell>
  );
}
