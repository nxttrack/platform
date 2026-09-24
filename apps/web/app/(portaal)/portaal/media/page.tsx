import { redirectCompatibilityRoute } from "@/lib/navigation/portal-compatibility";

export const dynamic = "force-dynamic";

export default async function LegacyMediaPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectCompatibilityRoute("/portaal/ontwikkeling/media", await searchParams);
}
