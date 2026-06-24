import type { Metadata } from "next";

import { PrivateShellBoundary } from "@/components/shell/private-shell-boundary";
import { privateRouteMetadata } from "@/lib/auth/access";
import { adminNav } from "@/lib/navigation";

export const metadata: Metadata = privateRouteMetadata;
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivateShellBoundary shell="tenant_admin" nav={adminNav} accent="admin">
      {children}
    </PrivateShellBoundary>
  );
}
