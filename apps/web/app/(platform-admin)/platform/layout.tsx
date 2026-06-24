import type { Metadata } from "next";

import { PrivateShellBoundary } from "@/components/shell/private-shell-boundary";
import { privateRouteMetadata } from "@/lib/auth/access";
import { platformNav } from "@/lib/navigation";

export const metadata: Metadata = privateRouteMetadata;
export const dynamic = "force-dynamic";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivateShellBoundary shell="platform_admin" nav={platformNav} accent="platform">
      {children}
    </PrivateShellBoundary>
  );
}
