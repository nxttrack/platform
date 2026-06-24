import type { Metadata } from "next";

import { PrivateShellBoundary } from "@/components/shell/private-shell-boundary";
import { privateRouteMetadata } from "@/lib/auth/access";
import { instructorNav } from "@/lib/navigation";

export const metadata: Metadata = privateRouteMetadata;
export const dynamic = "force-dynamic";

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivateShellBoundary shell="instructor" nav={instructorNav} accent="instructor">
      {children}
    </PrivateShellBoundary>
  );
}
