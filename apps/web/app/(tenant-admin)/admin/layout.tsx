import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { privateRouteMetadata } from "@/lib/auth/access";
import { adminNav } from "@/lib/navigation";

export const metadata: Metadata = privateRouteMetadata;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell brand={{ title: "Zwemschool Demo", subtitle: "Tenant Admin" }} nav={adminNav} user={{ name: "Laura van Dijk", role: "Tenant admin" }} accent="admin">
      {children}
    </AppShell>
  );
}
