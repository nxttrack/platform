import { AppShell } from "@/components/shell/app-shell";
import { adminNav } from "@/lib/navigation";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell brand={{ title: "Zwemschool Demo", subtitle: "Tenant Admin" }} nav={adminNav} user={{ name: "Laura van Dijk", role: "Tenant admin" }} accent="admin">
      {children}
    </AppShell>
  );
}
