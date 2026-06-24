import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function PlatformTemplatesPage() {
  return <RoutePlaceholder kicker="Platform admin" title="Sector templates" description="Sector templates en Lovable UI-varianten worden hier later beheerd, zonder de swim-first ervaring te verliezen." items={["Zwemscholen", "Voetbalscholen", "Dansscholen", "Generieke lessen"]} status="Voorbereid" />;
}
