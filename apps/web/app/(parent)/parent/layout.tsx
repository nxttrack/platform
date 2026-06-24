import type { Metadata } from "next";

import { PrivateShellBoundary } from "@/components/shell/private-shell-boundary";
import { privateRouteMetadata } from "@/lib/auth/access";
import { parentNav } from "@/lib/navigation";

export const metadata: Metadata = privateRouteMetadata;
export const dynamic = "force-dynamic";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivateShellBoundary shell="parent" nav={parentNav} accent="parent">
      {children}
    </PrivateShellBoundary>
  );
}
