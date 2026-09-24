import { redirectCompatibilityRoute } from "@/lib/navigation/portal-compatibility";

export const dynamic = "force-dynamic";

export default async function LegacyGraduationPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectCompatibilityRoute("/portaal/planning", await searchParams, "afzwemmen");
}
