import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyGraduationPage() {
  redirect("/portaal/planning#afzwemmen");
}
