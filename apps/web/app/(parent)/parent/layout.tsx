import { AppShell } from "@/components/shell/app-shell";
import { parentNav } from "@/lib/navigation";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell brand={{ title: "Zwemschool Demo", subtitle: "Ouder portaal" }} nav={parentNav} user={{ name: "Lisa de Jong", role: "Ouder" }} accent="parent">
      {children}
    </AppShell>
  );
}
