import { AppShell } from "@/components/shell/app-shell";
import { instructorNav } from "@/lib/navigation";

export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell brand={{ title: "Zwemschool Demo", subtitle: "Instructeur" }} nav={instructorNav} user={{ name: "Sophie Jansen", role: "Hoofdtrainer" }} accent="instructor">
      {children}
    </AppShell>
  );
}
